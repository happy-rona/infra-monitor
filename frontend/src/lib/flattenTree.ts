import type { HealthStatus, Resource, StatusCounts } from '../api/types';

export type TreeRowModel =
  | { type: 'resource'; key: number; id: number; depth: number }
  | { type: 'loading' | 'error' | 'empty'; key: string; parentId: number; depth: number };

export interface FlattenInput {
  rootId: number;
  getChildren: (parentId: number) => number[] | undefined;
  getEntity: (id: number) => Resource | undefined;
  isLoading: (parentId: number) => boolean;
  hasFailed: (parentId: number) => boolean;
  expanded: ReadonlySet<number>;
  statusFilter: ReadonlySet<HealthStatus>;
  pinned: ReadonlySet<number>;
}

const COUNT_KEY: Record<HealthStatus, keyof StatusCounts> = {
  HEALTHY: 'healthy',
  WARNING: 'warning',
  CRITICAL: 'critical',
  UNKNOWN: 'unknown',
};

export const matchesFilter = (resource: Resource, filter: ReadonlySet<HealthStatus>): boolean => {
  if (filter.size === 0 || filter.has(resource.status)) return true;
  for (const status of filter) {
    if (resource.desc[COUNT_KEY[status]] > 0) return true;
  }
  return false;
};

export const flattenTree = (input: FlattenInput): TreeRowModel[] => {
  const rows: TreeRowModel[] = [];
  const { getChildren, getEntity, expanded, statusFilter, pinned } = input;

  const visit = (parentId: number, depth: number) => {
    const childIds = getChildren(parentId);
    if (!childIds) {
      if (input.hasFailed(parentId)) rows.push({ type: 'error', key: `e${parentId}`, parentId, depth });
      else if (input.isLoading(parentId) || parentId !== input.rootId)
        rows.push({ type: 'loading', key: `l${parentId}`, parentId, depth });
      return;
    }
    let visible = 0;
    for (const id of childIds) {
      const entity = getEntity(id);
      if (!entity) continue;
      if (!pinned.has(id) && !matchesFilter(entity, statusFilter)) continue;
      visible++;
      rows.push({ type: 'resource', key: id, id, depth });
      if (expanded.has(id) && entity.kind !== 'POD') visit(id, depth + 1);
    }
    if (visible === 0) rows.push({ type: 'empty', key: `x${parentId}`, parentId, depth });
  };

  visit(input.rootId, 0);
  return rows;
};
