import { contextBridge, ipcRenderer } from 'electron';
import type { ActivationRequest, EngineStatus, SyncEvent, ReconstitutionEvent, TanApi, ViewportBounds } from '../shared/ipc';

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
};

contextBridge.exposeInMainWorld('tan', api);
