import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { HealthStatus } from '../api/types';
import { endMeasureAfterPaint } from '../lib/perf';
import { store } from '../store/resourceStore';

export const PAGE_SIZE = 100;
const MAX_PAGES = 60;

interface View {
  key: string;
  statuses: HealthStatus[];
  total: number;
}

export const usePagedPods = (statuses: HealthStatus[]) => {
  const key = statuses.join(',');
  const [view, setView] = useState<View>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [, setRevision] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const pages = useRef(new Map<number, number[]>());
  const inflight = useRef(new Set<number>());
  const viewRef = useRef<View>();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    api
      .pods({ statuses, offset: 0, limit: PAGE_SIZE, withTotal: true }, controller.signal)
      .then((res) => {
        store.upsert(res.items);
        const fresh = new Set(res.items.map((i) => i.id));
        const old = [...pages.current.values()].flat().filter((id) => !fresh.has(id));
        pages.current = new Map([[0, res.items.map((i) => i.id)]]);
        inflight.current = new Set();
        store.evict(old);
        const next = { key, statuses, total: res.total };
        viewRef.current = next;
        setView(next);
        setError(undefined);
        setLoading(false);
        endMeasureAfterPaint('Pod 필터');
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const ensureRange = useCallback((startIndex: number, endIndex: number) => {
    const current = viewRef.current;
    if (!current || current.total === 0) return;
    const first = Math.max(0, Math.floor(startIndex / PAGE_SIZE) - 1);
    const last = Math.min(Math.floor((current.total - 1) / PAGE_SIZE), Math.floor(endIndex / PAGE_SIZE) + 1);
    for (let page = first; page <= last; page++) {
      const cached = pages.current.get(page);
      if (cached) {
        pages.current.delete(page);
        pages.current.set(page, cached);
        continue;
      }
      if (inflight.current.has(page)) continue;
      inflight.current.add(page);
      const requestSet = inflight.current;
      api
        .pods({ statuses: current.statuses, offset: page * PAGE_SIZE, limit: PAGE_SIZE, withTotal: false })
        .then((res) => {
          if (viewRef.current?.key !== current.key) return;
          store.upsert(res.items);
          pages.current.set(page, res.items.map((i) => i.id));
          while (pages.current.size > MAX_PAGES) {
            const [oldest, ids] = pages.current.entries().next().value as [number, number[]];
            pages.current.delete(oldest);
            store.evict(ids);
          }
          setRevision((r) => r + 1);
        })
        .catch(() => {
          /* 다음 스크롤 시 재시도 */
        })
        .finally(() => requestSet.delete(page));
    }
  }, []);

  const getId = useCallback(
    (index: number): number | undefined => pages.current.get(Math.floor(index / PAGE_SIZE))?.[index % PAGE_SIZE],
    [],
  );

  return {
    total: view?.total ?? 0,
    viewKey: view?.key,
    loading,
    error,
    ensureRange,
    getId,
    retry: useCallback(() => setAttempt((n) => n + 1), []),
  };
};
