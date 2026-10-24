import { memo, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { HealthStatus } from '@/api/types';
import { RetryButton, StatusBadge } from '@/components/common';
import { FilterBar } from '@/components/FilterBar';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePagedPods } from '@/hooks/usePagedPods';
import { formatNumber, formatPct, formatTime } from '@/lib/format';
import { fixedRowOptions } from '@/lib/virtual';
import { cn } from '@/lib/utils';
import { useResource } from '@/store/hooks';

const ROW_HEIGHT = 32;
const SLOTS = 128;
const OVERSCAN = 3;
const GRID = 'grid grid-cols-[80px_minmax(180px,1.5fr)_minmax(160px,1.5fr)_60px_60px_80px] items-center gap-2 px-2';
const ROW = cn(GRID, 'h-full border-b');
const ROW_LOADED = cn(ROW, 'cursor-pointer hover:bg-muted');
const ROW_SELECTED = cn(ROW_LOADED, 'bg-accent');
const ROW_LOADING = cn(ROW, 'text-muted-foreground');

interface Props {
  checkedStatuses: ReadonlySet<HealthStatus>;
  onStatusesChange: (next: Set<HealthStatus>) => void;
  statusFilter: ReadonlySet<HealthStatus>;
  selectedId?: number;
  onSelect: (id: number) => void;
}

export const PodTable = ({ checkedStatuses, onStatusesChange, statusFilter, selectedId, onSelect }: Props) => {
  const { total, viewKey, loading, error, ensureRange, getId, retry } = usePagedPods([...statusFilter].sort());

  const ref = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => ref.current,
    overscan: OVERSCAN,
    ...fixedRowOptions(ROW_HEIGHT),
  });
  const items = virtualizer.getVirtualItems();
  const start = items.length > 0 ? items[0].index : 0;
  const end = items.length > 0 ? items[items.length - 1].index : -1;

  useEffect(() => {
    if (virtualizer.scrollOffset) virtualizer.scrollToOffset(0);
  }, [viewKey, virtualizer]);

  const lastRequest = useRef(0);
  useEffect(() => {
    const run = () => {
      lastRequest.current = performance.now();
      ensureRange(start, end);
    };
    const wait = 80 - (performance.now() - lastRequest.current);
    if (wait <= 0) {
      run();
      return;
    }
    const timer = setTimeout(run, wait);
    return () => clearTimeout(timer);
  }, [start, end, viewKey, ensureRange]);

  return (
    <Card className="min-h-0">
      <CardHeader>
        <CardTitle>
          Pod 목록{' '}
          <span className="text-sm font-normal text-muted-foreground">
            {loading ? '불러오는 중...' : `${formatNumber(total)}건`}
          </span>
        </CardTitle>
        <CardAction>
          <FilterBar value={checkedStatuses} onChange={onStatusesChange} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col text-sm">
        <div className={cn(GRID, 'h-9 border-b font-medium text-muted-foreground')}>
          <span>상태</span>
          <span>이름</span>
          <span>위치</span>
          <span>재시작</span>
          <span>CPU</span>
          <span>마지막 갱신</span>
        </div>
        <div ref={ref} className="relative flex-1 overflow-y-auto contain-strict">
          {error && (
            <div className="flex items-center justify-center gap-1 p-6 text-muted-foreground">
              목록을 불러오지 못했습니다: {error}
              <RetryButton onClick={retry} />
            </div>
          )}
          {!error && !loading && total === 0 && (
            <div className="p-6 text-center text-muted-foreground">조건에 맞는 Pod가 없습니다</div>
          )}
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {items.map(({ index }) => {
              const id = getId(index);
              return (
                <div
                  key={index % SLOTS}
                  className="absolute inset-x-0 top-0"
                  style={{ transform: `translateY(${index * ROW_HEIGHT}px)`, height: ROW_HEIGHT }}
                >
                  <PodRow id={id} selected={id !== undefined && id === selectedId} onSelect={onSelect} />
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const PodRow = memo(({
  id,
  selected,
  onSelect,
}: {
  id?: number;
  selected: boolean;
  onSelect: (id: number) => void;
}) => {
  const r = useResource(id);
  const location = r ? r.path.slice(0, r.path.lastIndexOf('/')) : '';
  return (
    <div
      className={!r ? ROW_LOADING : selected ? ROW_SELECTED : ROW_LOADED}
      onClick={r ? () => onSelect(r.id) : undefined}
    >
      <span>{r && <StatusBadge status={r.status} />}</span>
      <span className="truncate" title={r?.name}>
        {r ? r.name : '...'}
      </span>
      <span className="truncate text-muted-foreground" title={location}>
        {location}
      </span>
      <span>{r ? (r.restarts ?? 0) : ''}</span>
      <span>{r ? formatPct(r.cpuPct) : ''}</span>
      <span>{r ? formatTime(r.updatedAt) : ''}</span>
    </div>
  );
});
