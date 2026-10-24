package io.infra.monitor.domain;

public record Resource(
        long id,
        Long parentId,
        Kind kind,
        String name,
        Status status,
        Long clusterId,
        Long nodeId,
        Long namespaceId,
        String path,
        int childCount,
        Counts desc,
        Float cpuPct,
        Float memPct,
        Float gpuPct,
        Integer restarts,
        String phase,
        long updatedAt
) {
    public enum Kind {
        CLUSTER, NODE, NAMESPACE, POD;

        public int depth() {
            return ordinal();
        }
    }

    public enum Status {
        HEALTHY, WARNING, CRITICAL, UNKNOWN;

        public static Status fromUsage(double cpuPct, double memPct) {
            double max = Math.max(cpuPct, memPct);
            if (max >= 95) {
                return CRITICAL;
            }
            return max >= 85 ? WARNING : HEALTHY;
        }

        public static Status fromPodPhase(String phase) {
            return switch (phase) {
                case "Running", "Succeeded" -> HEALTHY;
                case "Pending", "ContainerCreating" -> WARNING;
                case "CrashLoopBackOff", "Failed", "OOMKilled", "ImagePullBackOff" -> CRITICAL;
                default -> UNKNOWN;
            };
        }
    }

    public record Counts(int healthy, int warning, int critical, int unknown) {
    }
}
