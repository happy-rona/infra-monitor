import type { ChangesResponse, HealthStatus, PageResponse, Resource, ResourceDetail, SearchResponse } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const get = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* body 없음 */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
};

const query = (params: Partial<Record<string, string | number | boolean | (string | number)[]>>): string => {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, String(v)));
    else qs.append(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
};

export interface PodListParams {
  statuses: HealthStatus[];
  offset: number;
  limit: number;
  withTotal: boolean;
}

export const api = {
  lastUpdated: (signal?: AbortSignal) => get<{ lastUpdatedAt: number }>('/api/last-updated', signal),

  clusters: (signal?: AbortSignal) => get<Resource[]>('/api/clusters', signal),

  children: (id: number, signal?: AbortSignal) => get<Resource[]>(`/api/resources/${id}/children`, signal),

  detail: (id: number, signal?: AbortSignal) => get<ResourceDetail>(`/api/resources/${id}`, signal),

  pods: (p: PodListParams, signal?: AbortSignal) =>
    get<PageResponse<Resource>>(
      `/api/pods${query({ status: p.statuses, offset: p.offset, limit: p.limit, withTotal: p.withTotal })}`,
      signal,
    ),

  search: (q: string, statuses: HealthStatus[], signal?: AbortSignal) =>
    get<SearchResponse>(`/api/search${query({ q, status: statuses, limit: 50 })}`, signal),

  changes: (since: number, signal?: AbortSignal) =>
    get<ChangesResponse>(`/api/changes${query({ since, limit: 5000 })}`, signal),
};
