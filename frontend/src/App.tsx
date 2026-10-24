import { useCallback, useMemo, useRef, useState } from 'react';
import type { HealthStatus, Resource } from '@/api/types';
import { STATUSES } from '@/api/types';
import { DetailPanel } from '@/components/DetailPanel';
import { FilterBar } from '@/components/FilterBar';
import { Header } from '@/components/Header';
import { PodTable } from '@/components/PodTable';
import { ResourceTree } from '@/components/ResourceTree';
import { SearchBox } from '@/components/SearchBox';
import { usePolling } from '@/hooks/usePolling';
import { endMeasureAfterPaint, startMeasure } from '@/lib/perf';
import { useResource } from '@/store/hooks';
import { store } from '@/store/resourceStore';

const POLL_INTERVAL_MS = 3000;
const EMPTY = new Set<number>();
const NO_STATUS_FILTER = new Set<HealthStatus>();

const toFilter = (checked: Set<HealthStatus>): ReadonlySet<HealthStatus> => {
  return checked.size === STATUSES.length ? NO_STATUS_FILTER : checked;
};

export const App = () => {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [treeStatuses, setTreeStatuses] = useState<Set<HealthStatus>>(() => new Set(STATUSES));
  const [podStatuses, setPodStatuses] = useState<Set<HealthStatus>>(() => new Set(STATUSES));
  const treeFilter = useMemo(() => toFilter(treeStatuses), [treeStatuses]);
  const podFilter = useMemo(() => toFilter(podStatuses), [podStatuses]);
  const [selectedId, setSelectedId] = useState<number>();
  const [scrollTarget, setScrollTarget] = useState<{ id: number; nonce: number }>();
  const [podTableMounted, setPodTableMounted] = useState(false);
  const mountPodTable = useCallback(() => setPodTableMounted(true), []);

  const selected = useResource(selectedId);
  const sync = usePolling(POLL_INTERVAL_MS);

  const reveal = useCallback((target: Resource) => {
    const ancestors = [target.clusterId, target.nodeId, target.namespaceId].filter(
      (a): a is number => a !== undefined && a !== target.id,
    );
    setExpanded((prev) => {
      if (ancestors.every((a) => prev.has(a))) return prev;
      const next = new Set(prev);
      ancestors.forEach((a) => next.add(a));
      return next;
    });
    store.upsert([target]);
    setSelectedId(target.id);
    setScrollTarget({ id: target.id, nonce: Date.now() });
    ancestors.forEach((a) => void store.loadChildren(a).catch(() => {}));
  }, []);

  const selectPod = useCallback(
    (id: number) => {
      const pod = store.getEntity(id);
      if (pod) reveal(pod);
    },
    [reveal],
  );

  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const toggle = useCallback((id: number) => {
    const name = expandedRef.current.has(id) ? '트리 접기' : '트리 펼치기';
    startMeasure(name);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    store.loadChildren(id).then(
      () => endMeasureAfterPaint(name),
      () => {},
    );
  }, []);

  const changeTreeStatuses = useCallback((next: Set<HealthStatus>) => {
    startMeasure('트리 필터');
    setTreeStatuses(next);
    endMeasureAfterPaint('트리 필터');
  }, []);

  const changePodStatuses = useCallback((next: Set<HealthStatus>) => {
    startMeasure('Pod 필터');
    setPodStatuses(next);
  }, []);

  const refresh = useCallback(async () => {
    startMeasure('새로고침');
    await sync();
    endMeasureAfterPaint('새로고침');
  }, [sync]);

  const pinned = useMemo(() => {
    if (!selected) return EMPTY;
    return new Set(
      [selected.clusterId, selected.nodeId, selected.namespaceId, selected.id].filter(
        (x): x is number => x !== undefined,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.clusterId, selected?.nodeId, selected?.namespaceId]);

  return (
    <div className="flex h-screen flex-col">
      <Header onRefresh={() => void refresh()} />
      <main className="grid min-h-0 flex-1 grid-cols-[380px_1fr] gap-4 p-4">
        <aside className="flex min-h-0 flex-col">
          <SearchBox statusFilter={treeFilter} onPick={reveal} />
          <FilterBar value={treeStatuses} onChange={changeTreeStatuses} className="border-b py-3" />
          <ResourceTree
            expanded={expanded}
            statusFilter={treeFilter}
            pinned={pinned}
            selectedId={selectedId}
            scrollTarget={scrollTarget}
            onToggle={toggle}
            onSelect={setSelectedId}
            onClustersVisible={mountPodTable}
          />
        </aside>
        <div className="grid min-h-0 min-w-0 grid-rows-[2fr_3fr] gap-4">
          <DetailPanel selectedId={selectedId} />
          {podTableMounted ? (
            <PodTable
              checkedStatuses={podStatuses}
              onStatusesChange={changePodStatuses}
              statusFilter={podFilter}
              selectedId={selectedId}
              onSelect={selectPod}
            />
          ) : (
            <div />
          )}
        </div>
      </main>
    </div>
  );
};
