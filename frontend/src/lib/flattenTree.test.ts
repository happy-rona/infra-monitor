import { describe, expect, it } from 'vitest';
import type { HealthStatus, Resource } from '../api/types';
import { flattenTree, matchesFilter } from './flattenTree';

const res = (
  id: number,
  parentId: number | undefined,
  kind: Resource['kind'],
  status: HealthStatus,
  desc = { healthy: 0, warning: 0, critical: 0, unknown: 0 },
): Resource => ({ id, parentId, kind, name: `r${id}`, status, path: '', childCount: 0, desc, updatedAt: 0 });

const entities = new Map<number, Resource>([
  [1, res(1, undefined, 'CLUSTER', 'HEALTHY', { healthy: 2, warning: 0, critical: 1, unknown: 0 })],
  [2, res(2, undefined, 'CLUSTER', 'HEALTHY', { healthy: 5, warning: 0, critical: 0, unknown: 0 })],
  [11, res(11, 1, 'NODE', 'HEALTHY', { healthy: 1, warning: 0, critical: 1, unknown: 0 })],
  [12, res(12, 1, 'NODE', 'HEALTHY')],
]);
const children = new Map<number, number[]>([
  [0, [1, 2]],
  [1, [11, 12]],
]);

const base = {
  rootId: 0,
  getChildren: (id: number) => children.get(id),
  getEntity: (id: number) => entities.get(id),
  isLoading: () => false,
  hasFailed: () => false,
  pinned: new Set<number>(),
};

describe('flattenTree', () => {
  it('펼쳐진 노드의 자식만 포함한다', () => {
    const rows = flattenTree({ ...base, expanded: new Set([1]), statusFilter: new Set() });
    expect(rows.map((r) => r.key)).toEqual([1, 11, 12, 2]);
    expect(rows[1].depth).toBe(1);
  });

  it('로드되지 않은 펼친 노드는 loading 행을 표시한다', () => {
    const rows = flattenTree({ ...base, expanded: new Set([2]), statusFilter: new Set() });
    expect(rows.map((r) => r.type)).toEqual(['resource', 'resource', 'loading']);
  });

  it('상태 필터는 자손 집계를 이용해 조상 경로를 유지한다', () => {
    const rows = flattenTree({ ...base, expanded: new Set([1]), statusFilter: new Set(['CRITICAL']) });
    expect(rows.map((r) => r.key)).toEqual([1, 11]);
  });

  it('pinned 리소스는 필터와 무관하게 보인다', () => {
    const rows = flattenTree({ ...base, expanded: new Set(), statusFilter: new Set(['CRITICAL']), pinned: new Set([2]) });
    expect(rows.map((r) => r.key)).toEqual([1, 2]);
  });

  it('matchesFilter', () => {
    expect(matchesFilter(entities.get(12)!, new Set(['WARNING']))).toBe(false);
    expect(matchesFilter(entities.get(12)!, new Set())).toBe(true);
  });
});
