import type { Resource } from '../api/types';
import { useResourceStore } from './resourceStore';

export const useResource = (id?: number): Resource | undefined => {
  return useResourceStore((s) => (id === undefined ? undefined : s.entities.get(id)));
};

export const useStatusRevision = (active: boolean): number => {
  return useResourceStore((s) => (active ? s.statusRevision : 0));
};
