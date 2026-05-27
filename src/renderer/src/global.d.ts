import type { TanApi } from '../../shared/ipc';

declare global {
  interface Window {
    tan: TanApi;
  }
}

export {};
