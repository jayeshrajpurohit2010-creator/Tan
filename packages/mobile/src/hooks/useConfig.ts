import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TanConfig } from '@tan/shared';
import { DEFAULT_TAN_CONFIG } from '@tan/shared';

const STORAGE_KEY = '@tan/config';

export function useConfig() {
  const [config, setConfigState] = useState<TanConfig>(DEFAULT_TAN_CONFIG);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          setConfigState({ ...DEFAULT_TAN_CONFIG, ...(JSON.parse(raw) as Partial<TanConfig>) });
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setConfig = useCallback((updates: Partial<TanConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...updates };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { config, setConfig, loaded };
}
