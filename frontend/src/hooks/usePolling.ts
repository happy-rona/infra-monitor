import { useCallback, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { store } from '../store/resourceStore';

export const usePolling = (intervalMs: number) => {
  const sinceRef = useRef<number>();
  const runningRef = useRef(false);

  const sync = useCallback(async () => {
    if (runningRef.current || sinceRef.current === undefined) return;
    runningRef.current = true;
    try {
      for (let guard = 0; guard < 20; guard++) {
        const res = await api.changes(sinceRef.current);
        store.upsert(res.items, true);
        sinceRef.current = res.lastUpdatedAt;
        if (!res.hasMore) break;
      }
    } catch {
      /* 다음 주기에 다시 시도 */
    } finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const loop = async () => {
      await sync();
      if (!stopped) timer = setTimeout(loop, intervalMs);
    };
    api.lastUpdated().then(
      (v) => {
        sinceRef.current = v.lastUpdatedAt;
        if (!stopped) timer = setTimeout(loop, intervalMs);
      },
      () => {},
    );
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [intervalMs, sync]);

  return sync;
};
