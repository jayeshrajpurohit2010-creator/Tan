import type { WebContents } from 'electron';
import type { EngineStatus, SyncEvent } from '../../shared/ipc';
import { decodeCdpBody } from './cdp';
import { PayloadPersister } from './persister';
import type { CapturedResponse, EncryptionSettings } from './types';
import { NoDropWriteQueue } from './writeQueue';
import { detectSnapchatMedia, getCapturePriority } from '../snapchat-detector';
import { getPriorityQueue, createPriorityTask } from '../priorityQueue';
import { CAPTURE_RATE_LIMITER } from '../rateLimiter';

type DebuggerMessageParams = Record<string, unknown>;

type CaptureControllerOptions = {
  vaultRoot: string;
  onStatus(status: EngineStatus): void;
  onSyncEvent(event: SyncEvent): void;
  onPayloadPersisted(filePath: string): void;
};

type NetworkResponseReceived = {
  requestId: string;
  type: string;
  response: {
    url: string;
    status: number;
    statusText: string;
    mimeType: string;
    headers: Record<string, unknown>;
  };
};

type NetworkRequestWillBeSent = {
  requestId: string;
  request: {
    method?: string;
  };
};

type NetworkLoadingFinished = {
  requestId: string;
  encodedDataLength?: number;
};

type NetworkLoadingFailed = {
  requestId: string;
  errorText?: string;
};

export class CaptureController {
  private target?: WebContents;
  private endpointUrl?: string;
  private persister?: PayloadPersister;
  private readonly responses = new Map<string, CapturedResponse>();
  private readonly requestMethods = new Map<string, string>();
  private readonly queue: NoDropWriteQueue;
  private active = false;
  private mode: EngineStatus['mode'] = 'idle';
  private messageHandler?: (event: Electron.Event, method: string, params: DebuggerMessageParams) => void;
  private static readonly MAX_RESPONSES = 500;

  constructor(private readonly options: CaptureControllerOptions) {
    this.queue = new NoDropWriteQueue(() => this.emitStatus());
  }

  isCdpAttached(): boolean {
    return Boolean(this.target?.debugger.isAttached());
  }

  getStatus(message?: string): EngineStatus {
    return {
      active: this.active,
      mode: this.mode,
      url: this.endpointUrl,
      vaultRoot: this.options.vaultRoot,
      queueDepth: this.queue.depth,
      message,
      stealthEnabled: true,
      reconstitutionEnabled: true,
      cdpAttached: this.isCdpAttached(),
    };
  }

  async activate(target: WebContents, request: { url: string; encryption: EncryptionSettings }): Promise<EngineStatus> {
    const endpointUrl = normalizeEndpointUrl(request.url);
    if (
      this.active &&
      this.target === target &&
      this.endpointUrl === endpointUrl &&
      this.isCdpAttached()
    ) {
      return this.getStatus();
    }

    await this.detachDebugger();
    this.target = target;
    this.endpointUrl = endpointUrl;
    this.persister = new PayloadPersister({
      root: this.options.vaultRoot,
      endpointUrl: this.endpointUrl,
      encryption: request.encryption,
    });
    this.responses.clear();
    this.requestMethods.clear();
    this.active = true;
    this.mode = 'arming';
    this.emitStatus('Attaching Chrome DevTools Protocol bridge.');

    const debuggee = target.debugger;
    if (!debuggee.isAttached()) {
      debuggee.attach('1.3');
    }

    this.messageHandler = (_event, method, params) => {
      void this.handleDebuggerMessage(method, params);
    };
    debuggee.on('message', this.messageHandler);
    await CAPTURE_RATE_LIMITER.waitUntilReady();
    await debuggee.sendCommand('Network.enable', {
      maxTotalBufferSize: 1024 * 1024 * 1024,
      maxResourceBufferSize: 512 * 1024 * 1024,
      maxPostDataSize: 64 * 1024 * 1024,
    });

    this.mode = 'active';
    this.emitStatus('Sync engine active.');
    await target.loadURL(this.endpointUrl);
    return this.getStatus();
  }

  async deactivate(): Promise<EngineStatus> {
    this.active = false;
    this.mode = this.queue.depth > 0 ? 'flushing' : 'idle';
    this.emitStatus(this.queue.depth > 0 ? 'Flushing queued payload writes.' : 'Sync engine idle.');
    await this.detachDebugger();
    await this.queue.flush();
    
    // Also flush the priority queue for ephemeral media
    const priorityQueue = getPriorityQueue();
    await priorityQueue.flush();
    
    this.mode = 'idle';
    this.emitStatus('Sync engine idle.');
    return this.getStatus();
  }

  private async handleDebuggerMessage(method: string, params: DebuggerMessageParams): Promise<void> {
    if (!this.active) {
      return;
    }

    if (method === 'Network.requestWillBeSent') {
      const request = params as NetworkRequestWillBeSent;
      if (request.requestId && request.request?.method) {
        this.requestMethods.set(request.requestId, request.request.method);
      }
      return;
    }

    if (method === 'Network.responseReceived') {
      const response = params as NetworkResponseReceived;
      const received: CapturedResponse = {
        requestId: response.requestId,
        url: response.response.url,
        method: this.requestMethods.get(response.requestId),
        status: response.response.status,
        statusText: response.response.statusText,
        mimeType: response.response.mimeType || 'application/octet-stream',
        headers: response.response.headers ?? {},
        timestamp: new Date().toISOString(),
      };
      this.responses.set(response.requestId, received);
      if (this.responses.size > CaptureController.MAX_RESPONSES) {
        const oldest = this.responses.keys().next().value;
        if (oldest) {
          this.responses.delete(oldest);
          this.requestMethods.delete(oldest);
        }
      }
      return;
    }

    if (method === 'Network.loadingFinished') {
      const finished = params as NetworkLoadingFinished;
      const response = this.responses.get(finished.requestId);
      if (!response) {
        return;
      }

      response.encodedDataLength = finished.encodedDataLength;
      this.responses.delete(finished.requestId);
      await this.captureFinishedResponse(response);
      return;
    }

    if (method === 'Network.loadingFailed') {
      const failed = params as NetworkLoadingFailed;
      const response = this.responses.get(failed.requestId);
      if (!response || !this.persister) {
        return;
      }

      this.responses.delete(failed.requestId);
      this.queue.enqueue(async () => {
        const record = await this.persister?.persistError(response, failed.errorText ?? 'Network loading failed.');
        if (record) {
          this.options.onSyncEvent(toSyncEvent(record, this.queue.depth));
        }
      });
    }
  }

  private async captureFinishedResponse(response: CapturedResponse): Promise<void> {
    if (!this.target || !this.persister) {
      return;
    }

    try {
      await CAPTURE_RATE_LIMITER.waitUntilReady();
      const body = await this.target.debugger.sendCommand('Network.getResponseBody', {
        requestId: response.requestId,
      });
      const buffer = decodeCdpBody(body as { body: string; base64Encoded: boolean });
      
      // Detect if this is Snapchat ephemeral media and use priority queue
      const snapchatMediaInfo = detectSnapchatMedia(response.url, response.mimeType);
      const isEphemeral = snapchatMediaInfo.isEphemeral;
      const priority = getCapturePriority(snapchatMediaInfo);
      
      const persistTask = async () => {
        try {
          const record = await this.persister?.persist(response, buffer);
          if (record) {
            this.options.onSyncEvent(toSyncEvent(record, this.queue.depth));
            if (record.savedPath) {
              this.options.onPayloadPersisted(record.savedPath);
            }
          }
        } catch (error) {
          const record = await this.persister?.persistError(response, error);
          if (record) {
            this.options.onSyncEvent(toSyncEvent(record, this.queue.depth));
          }
        }
      };

      // Use priority queue for ephemeral media, regular queue for everything else
      if (isEphemeral && priority >= 8) {
        const priorityQueue = getPriorityQueue();
        const task = createPriorityTask(
          response.requestId,
          persistTask,
          priority,
          10000, // 10 second TTL for ephemeral media
        );
        priorityQueue.enqueue(task);
      } else {
        this.queue.enqueue(persistTask);
      }
    } catch (error) {
      this.queue.enqueue(async () => {
        const record = await this.persister?.persistError(response, error);
        if (record) {
          this.options.onSyncEvent(toSyncEvent(record, this.queue.depth));
        }
      });
    }
  }

  private async detachDebugger(): Promise<void> {
    if (!this.target) {
      return;
    }

    if (this.messageHandler) {
      this.target.debugger.off('message', this.messageHandler);
      this.messageHandler = undefined;
    }

    if (this.target.debugger.isAttached()) {
      try {
        this.target.debugger.detach();
      } catch {
      }
    }
  }

  private emitStatus(message?: string): void {
    this.options.onStatus(this.getStatus(message));
  }
}

function normalizeEndpointUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('A target endpoint URL is required.');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function toSyncEvent(
  record: {
    id: string;
    url: string;
    method?: string;
    status?: number;
    mimeType: string;
    bytes: number;
    sha256?: string;
    savedPath?: string;
    encrypted: boolean;
    timestamp: string;
    error?: string;
  },
  queueDepth: number,
): SyncEvent {
  return {
    id: record.id,
    url: record.url,
    method: record.method,
    status: record.status,
    mimeType: record.mimeType,
    bytes: record.bytes,
    sha256: record.sha256,
    savedPath: record.savedPath,
    encrypted: record.encrypted,
    timestamp: record.timestamp,
    queueDepth,
    error: record.error,
  };
}
