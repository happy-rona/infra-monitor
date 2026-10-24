import type { HealthStatus, ResourceKind } from '../api/types';

export const STATUS_LABEL: Record<HealthStatus, string> = {
  HEALTHY: '정상',
  WARNING: '경고',
  CRITICAL: '오류',
  UNKNOWN: '알 수 없음',
};

export const KIND_LABEL: Record<ResourceKind, string> = {
  CLUSTER: 'Cluster',
  NODE: 'Node',
  NAMESPACE: 'Namespace',
  POD: 'Pod',
};

const pad = (n: number) => String(n).padStart(2, '0');

export const formatTime = (epochMs: number): string => {
  const d = new Date(epochMs);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const formatDateTime = (epochMs: number): string => {
  const d = new Date(epochMs);
  return `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}. ${formatTime(epochMs)}`;
};

export const formatPct = (value?: number): string => {
  return value === undefined ? '-' : `${value.toFixed(1)}%`;
};

export const formatNumber = (value: number): string => {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const ATTR_LABEL: Record<string, string> = {
  environment: '환경',
  provider: 'Provider',
  region: '리전',
  kubernetesVersion: 'Kubernetes 버전',
  apiServer: 'API Server',
  instanceType: '인스턴스 타입',
  internalIp: 'Internal IP',
  cpuCores: 'CPU 코어',
  memoryGiB: '메모리 (GiB)',
  gpuModel: 'GPU 모델',
  gpuCount: 'GPU 수',
  kubeletVersion: 'Kubelet 버전',
  os: 'OS',
  ready: 'Ready',
  team: '담당 팀',
  cpuQuotaCores: 'CPU 쿼터 (cores)',
  memoryQuotaGiB: '메모리 쿼터 (GiB)',
  podQuota: 'Pod 쿼터',
  gpuQuota: 'GPU 쿼터',
  image: '이미지',
  podIp: 'Pod IP',
  ownerKind: 'Owner',
  containers: '컨테이너 수',
  cpuRequest: 'CPU Request',
  memoryRequest: 'Memory Request',
  gpuRequest: 'GPU Request',
  startedAt: '시작 시각',
};

export const attrLabel = (key: string): string => {
  return ATTR_LABEL[key] ?? key;
};
