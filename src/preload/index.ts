import { contextBridge, ipcRenderer } from 'electron';
import type {
  ActivationRequest,
  EngineStatus,
  SyncEvent,
  ReconstitutionEvent,
  ReconstitutionProgressEvent,
  TanApi,
  ViewportBounds,
} from '../shared/ipc';

const api: TanApi = {
  activate(request: ActivationRequest) {
    return ipcRenderer.invoke('tan:activate', request);
  },
  deactivate() {
    return ipcRenderer.invoke('tan:deactivate');
  },
  setViewportBounds(bounds: ViewportBounds) {
    ipcRenderer.send('tan:viewport-bounds', bounds);
  },
  openVault() {
    return ipcRenderer.invoke('tan:open-vault');
  },
  getConfig() {
    return ipcRenderer.invoke('tan:get-config');
  },
  openFile(path: string) {
    return ipcRenderer.invoke('tan:open-file', path);
  },
  onStatus(callback: (status: EngineStatus) => void) {
    const listener = (_event: Electron.IpcRendererEvent, status: EngineStatus) => callback(status);
    ipcRenderer.on('tan:status', listener);
    return () => ipcRenderer.off('tan:status', listener);
  },
  onSyncEvent(callback: (event: SyncEvent) => void) {
    const listener = (_event: Electron.IpcRendererEvent, syncEvent: SyncEvent) => callback(syncEvent);
    ipcRenderer.on('tan:sync-event', listener);
    return () => ipcRenderer.off('tan:sync-event', listener);
  },
  onReconstitutionEvent(callback: (event: ReconstitutionEvent) => void) {
    const listener = (_event: Electron.IpcRendererEvent, event: ReconstitutionEvent) => callback(event);
    ipcRenderer.on('tan:reconstitution-event', listener);
    return () => ipcRenderer.off('tan:reconstitution-event', listener);
  },
  onReconstitutionProgress(callback: (event: ReconstitutionProgressEvent) => void) {
    const listener = (_event: Electron.IpcRendererEvent, event: ReconstitutionProgressEvent) => callback(event);
    ipcRenderer.on('tan:reconstitution-progress', listener);
    return () => ipcRenderer.off('tan:reconstitution-progress', listener);
  },
  onSessionExpired(callback: () => void) {
    const listener = () => callback();
    ipcRenderer.on('tan:session-expired', listener);
    return () => ipcRenderer.off('tan:session-expired', listener);
  },
  onLivePreview(callback: (event: any) => void) {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('tan:live-preview', listener);
    return () => ipcRenderer.off('tan:live-preview', listener);
  },
  checkIp() {
    return ipcRenderer.invoke('tan:check-ip');
  },
};

contextBridge.exposeInMainWorld('tan', api);
