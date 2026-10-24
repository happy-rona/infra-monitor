import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useShallow } from 'zustand/react/shallow';
import type { HealthStatus } from '@/api/types';
import { RetryButton, StatusBadge } from '@/components/common';
import { flattenTree, type TreeRowModel } from '@/lib/flattenTree';
import { afterNextPaint } from '@/lib/perf';
import { fixedRowOptions } from '@/lib/virtual';
import { KIND_LABEL } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useResource, useStatusRevision } from '@/store/hooks';
import { ROOT, store, useResourceStore } from '@/store/resourceStore';

const ROW_HEIGHT = 28;
const INDENT = 16;
const SLOTS = 128;

const ROW = 'group/row flex h-full cursor-pointer items-center gap-1.5 pr-2 text-sm whitespace-nowrap hover:bg-muted';
const ROW_SELECTED = cn(ROW, 'bg-accent');
const TOGGLE = 'inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&>svg]:size-3';
const TOGGLE_HIDDEN = cn(TOGGLE, 'invisible');
const CHEVRON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-aria-expanded/row:rotate-90">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

interface Props {
  expanded: ReadonlySet<number>;
  statusFilter: ReadonlySet<HealthStatus>;
  pinned: ReadonlySet<number>;
  selectedId?: number;
  scrollTarget?: { id: number; nonce: number };
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
  onClustersVisible: () => void;
}

export const ResourceTree = ({
  expanded,
  statusFilter,
  pinned,
  selectedId,
  scrollTarget,
  onToggle,
  onSelect,
  onClustersVisible,
}: Props) => {
  const { children, loading, failed } = useResourceStore(
    useShallow((s) => ({ children: s.children, loading: s.loading, failed: s.failed })),
  );
  const statusRevision = useStatusRevision(statusFilter.size > 0);

  const rows = useMemo(
    () =>
      flattenTree({
        rootId: ROOT,
        getChildren: (id) => children.get(id),
        getEntity: store.getEntity,
        isLoading: (id) => loading.has(id),
        hasFailed: (id) => failed.has(id),
        expanded,
        statusFilter,
        pinned,
      }),
    [children, loading, failed, statusRevision, expanded, statusFilter, pinned],
  );

  const rootsSettled = rows.length > 0 && rows[0].type !== 'loading';
  const rootsLoaded = rootsSettled && rows[0].type === 'resource';
  useLayoutEffect(() => {
    if (!rootsSettled) return;
    afterNextPaint(() => {
      if (rootsLoaded && performance.getEntriesByName('clusters-visible').length === 0) performance.mark('clusters-visible');
      onClustersVisible();
    });
  }, [rootsSettled, rootsLoaded, onClustersVisible]);

  const ref = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => ref.current,
    overscan: 6,
    ...fixedRowOptions(ROW_HEIGHT),
  });

  const handledNonce = useRef<number>();
  useLayoutEffect(() => {
    if (!scrollTarget || handledNonce.current === scrollTarget.nonce) return;
    const index = rows.findIndex((r) => r.type === 'resource' && r.id === scrollTarget.id);
    if (index >= 0) {
      handledNonce.current = scrollTarget.nonce;
      virtualizer.scrollToIndex(index, { align: 'center' });
    }
  }, [scrollTarget, rows, virtualizer]);

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto overflow-x-hidden contain-strict"
      role="tree"
      aria-label="리소스 트리"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(({ index }) => {
          const row = rows[index];
          return (
            <div
              key={index % SLOTS}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${index * ROW_HEIGHT}px)`, height: ROW_HEIGHT }}
            >
              {row.type === 'resource' ? (
                <TreeRow
                  id={row.id}
                  depth={row.depth}
                  expanded={expanded.has(row.id)}
                  selected={row.id === selectedId}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              ) : (
                <PlaceholderRow row={row} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const PlaceholderRow = ({ row }: { row: Exclude<TreeRowModel, { type: 'resource' }> }) => {
  return (
    <div
      className="flex h-full items-center gap-2 text-sm text-muted-foreground"
      style={{ paddingLeft: 4 + row.depth * INDENT + 28 }}
    >
      {row.type === 'loading' && '불러오는 중...'}
      {row.type === 'empty' && '조건에 맞는 리소스가 없습니다'}
      {row.type === 'error' && (
        <>
          불러오지 못했습니다.
          <RetryButton onClick={() => void store.loadChildren(row.parentId).catch(() => {})} />
        </>
      )}
    </div>
  );
};

interface RowProps {
  id: number;
  depth: number;
  expanded: boolean;
  selected: boolean;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
}

const TreeRow = memo(({ id, depth, expanded, selected, onToggle, onSelect }: RowProps) => {
  const r = useResource(id);
  if (!r) return null;
  const expandable = r.kind !== 'POD' && r.childCount > 0;

  return (
    <div
      role="treeitem"
      aria-expanded={expandable ? expanded : undefined}
      aria-selected={selected}
      className={selected ? ROW_SELECTED : ROW}
      style={{ paddingLeft: 4 + depth * INDENT }}
      onClick={() => onSelect(id)}
    >
      <button
        type="button"
        data-slot="button"
        className={expandable ? TOGGLE : TOGGLE_HIDDEN}
        aria-label={expanded ? '접기' : '펼치기'}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(id);
        }}
      >
        {CHEVRON}
      </button>
      <span className="text-xs text-muted-foreground">{KIND_LABEL[r.kind]}</span>
      <span className="min-w-0 flex-1 truncate" title={r.path}>
        {r.name}
      </span>
      <StatusBadge status={r.status} />
    </div>
  );
});
