import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CaptureEvent, CaptureStatus } from '@tan/shared';
import { DEFAULT_TAN_CONFIG } from '@tan/shared';
import { CaptureManager } from '../capture/CaptureManager';

const MAX_EVENTS = 120;

export function useCaptureEngine() {
  const managerRef = useRef<CaptureManager>(new CaptureManager());

  const [events, setEvents] = useState<CaptureEvent[]>([]);
  const [status, setStatus] = useState<CaptureStatus>({
    active:                false,
    mode:                  'idle',
    queueDepth:            0,
    stealthEnabled:        DEFAULT_TAN_CONFIG.stealthEnabled,
    reconstitutionEnabled: DEFAULT_TAN_CONFIG.reconstitutionEnabled,
  });

  useEffect(() => {
    const manager = managerRef.current;
    const unsub = manager.subscribe((event) => {
      setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
      setStatus((prev) => ({ ...prev, queueDepth: manager.depth }));
    });
    return unsub;
  }, []);

  const activate = useCallback((targetUrl: string) => {
    managerRef.current.start();
    setStatus((prev) => ({
      ...prev,
      active:    true,
      mode:      'active',
      targetUrl,
    }));
  }, []);

  const deactivate = useCallback(() => {
    managerRef.current.stop();
    setStatus((prev) => ({
      ...prev,
      active:    false,
      mode:      'idle',
      queueDepth: 0,
    }));
  }, []);

  const clearHistory = useCallback(() => {
    managerRef.current.clearHistory();
    setEvents([]);
  }, []);

  const captureManager = useMemo(() => managerRef.current, []);

  return { events, status, captureManager, activate, deactivate, clearHistory };
}
