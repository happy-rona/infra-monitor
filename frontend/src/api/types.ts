export type ResourceKind = 'CLUSTER' | 'NODE' | 'NAMESPACE' | 'POD';
export type HealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

export const STATUSES: HealthStatus[] = ['HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN'];

export interface StatusCounts {
  healthy: number;
  warning: number;
  critical: number;
  unknown: number;
}

export interface Resource {
  id: number;
  parentId?: number;
  kind: ResourceKind;
  name: string;
  status: HealthStatus;
  clusterId?: number;
  nodeId?: number;
  namespaceId?: number;
  path: string;
  childCount: number;
  desc: StatusCounts;
  cpuPct?: number;
  memPct?: number;
  gpuPct?: number;
  restarts?: number;
  phase?: string;
  updatedAt: number;
}

export interface ResourceDetail {
  resource: Resource;
  attrs?: Record<string, unknown>;
}

export interface PageResponse<T> {
  total: number;
  offset: number;
  items: T[];
}

export interface SearchResponse {
  items: Resource[];
  total: number;
  totalCapped: boolean;
}

export interface ChangesResponse {
  lastUpdatedAt: number;
  items: Resource[];
  hasMore: boolean;
}
