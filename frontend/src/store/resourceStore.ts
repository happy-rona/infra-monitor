import { create } from 'zustand';
import { api } from '../api/client';
import type { Resource } from '../api/types';

export const ROOT = 0;

interface ResourceState {
  entities: Map<number, Resource>;
  children: Map<number, number[]>;
  loading: Set<number>;
  failed: Set<number>;
  statusRevision: number;

  upsert: (items: Resource[], onlyExisting?: boolean) => void;
  evict: (ids: number[]) => void;
  loadChildren: (parentId: number) => Promise<void>;
  primeRoots: (request: Promise<Resource[]>) => Promise<void>;
}

const inflight = new Map<number, Promise<void>>();
const treeIds = new Set<number>();

export const useResourceStore = create<ResourceState>()((set, get) => {
  const setChildren = (parentId: number, items: Resource[]) => {
    get().upsert(items);
    const ids = items.map((i) => i.id);
    ids.forEach((id) => treeIds.add(id));
    set((s) => ({ children: new Map(s.children).set(parentId, ids) }));
  };

  const track = (parentId: number, request: Promise<void>) => {
    inflight.set(parentId, request);
    set((s) => ({ loading: new Set(s.loading).add(parentId) }));
    return request.finally(() => {
      inflight.delete(parentId);
      set((s) => {
        const loading = new Set(s.loading);
        loading.delete(parentId);
        return { loading };
      });
    });
  };

  return {
    entities: new Map(),
    children: new Map(),
    loading: new Set(),
    failed: new Set(),
    statusRevision: 0,

    upsert: (items, onlyExisting = false) => {
      const { entities } = get();
      let next: Map<number, Resource> | undefined;
      let treeStatusChanged = false;
      for (const item of items) {
        const prev = entities.get(item.id);
        if (prev ? item.updatedAt <= prev.updatedAt : onlyExisting) continue;
        next ??= new Map(entities);
        next.set(item.id, item);
        if (prev && treeIds.has(item.id) && (prev.status !== item.status || !sameCounts(prev, item))) {
          treeStatusChanged = true;
        }
      }
      if (!next) return;
      set((s) => ({ entities: next, statusRevision: s.statusRevision + (treeStatusChanged ? 1 : 0) }));
    },

    evict: (ids) => {
      const entities = new Map(get().entities);
      ids.forEach((id) => treeIds.has(id) || entities.delete(id));
      set({ entities });
    },

    loadChildren: (parentId) => {
      if (get().children.has(parentId)) return Promise.resolve();
      const pending = inflight.get(parentId);
      if (pending) return pending;
      if (get().failed.has(parentId)) {
        set((s) => {
          const failed = new Set(s.failed);
          failed.delete(parentId);
          return { failed };
        });
      }
      const request = (parentId === ROOT ? api.clusters() : api.children(parentId))
        .then((items) => setChildren(parentId, items))
        .catch((e) => {
          set((s) => ({ failed: new Set(s.failed).add(parentId) }));
          throw e;
        });
      return track(parentId, request);
    },

    primeRoots: (request) =>
      track(
        ROOT,
        request.then(
          (items) => setChildren(ROOT, items),
          (e) => {
            set((s) => ({ failed: new Set(s.failed).add(ROOT) }));
            throw e;
          },
        ),
      ),
  };
});

const sameCounts = (a: Resource, b: Resource): boolean => {
  return (
    a.desc.healthy === b.desc.healthy &&
    a.desc.warning === b.desc.warning &&
    a.desc.critical === b.desc.critical &&
    a.desc.unknown === b.desc.unknown
  );
};

export const store = {
  upsert: (items: Resource[], onlyExisting?: boolean) => useResourceStore.getState().upsert(items, onlyExisting),
  evict: (ids: number[]) => useResourceStore.getState().evict(ids),
  loadChildren: (parentId: number) => useResourceStore.getState().loadChildren(parentId),
  primeRoots: (request: Promise<Resource[]>) => useResourceStore.getState().primeRoots(request),
  getEntity: (id: number) => useResourceStore.getState().entities.get(id),
};
