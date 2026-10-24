package io.infra.monitor.mock;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.infra.monitor.MonitorApplication;
import io.infra.monitor.domain.Resource.Kind;
import io.infra.monitor.domain.Resource.Status;
import io.infra.monitor.repository.ResourceRepository;
import io.infra.monitor.repository.ResourceRepository.Row;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

@Component
public class DataSeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);
    private static final int BATCH_SIZE = 2_000;

    private static final String[] ENVIRONMENTS = {"prod", "stage", "dev", "gpu"};
    private static final String[][] REGIONS = {
            {"seoul", "ap-northeast-2"}, {"tokyo", "ap-northeast-1"}, {"virginia", "us-east-1"},
            {"oregon", "us-west-2"}, {"frankfurt", "eu-central-1"}};
    private static final String[] NAMESPACES = {
            "kube-system", "monitoring", "ingress-nginx", "ml-training", "ml-inference",
            "payments", "auth", "data-pipeline", "logging", "frontend",
            "search", "notification", "batch-jobs", "analytics", "cert-manager"};
    private static final Map<String, String[]> WORKLOADS = Map.ofEntries(
            Map.entry("kube-system", new String[]{"coredns", "kube-proxy", "metrics-server", "aws-node", "ebs-csi"}),
            Map.entry("monitoring", new String[]{"prometheus", "grafana", "alertmanager", "node-exporter", "dcgm-exporter"}),
            Map.entry("ingress-nginx", new String[]{"ingress-controller", "default-backend"}),
            Map.entry("ml-training", new String[]{"trainer-llm", "trainer-vision", "param-server", "data-loader"}),
            Map.entry("ml-inference", new String[]{"triton-server", "vllm-gateway", "embedding-api", "reranker"}),
            Map.entry("payments", new String[]{"payments-api", "ledger", "fraud-detector", "settlement-worker"}),
            Map.entry("auth", new String[]{"auth-api", "token-service", "session-store"}),
            Map.entry("data-pipeline", new String[]{"kafka-connect", "spark-driver", "spark-executor", "airflow-worker"}),
            Map.entry("logging", new String[]{"fluent-bit", "loki", "vector-agg"}),
            Map.entry("frontend", new String[]{"web-app", "bff", "static-cdn-sync"}),
            Map.entry("search", new String[]{"search-api", "indexer", "opensearch"}),
            Map.entry("notification", new String[]{"push-sender", "email-worker", "sms-gateway"}),
            Map.entry("batch-jobs", new String[]{"nightly-report", "cleanup-job", "backup-job"}),
            Map.entry("analytics", new String[]{"clickhouse", "dbt-runner", "metabase"}),
            Map.entry("cert-manager", new String[]{"cert-manager", "cainjector", "webhook"}));
    private static final String[] GPU_MODELS = {"NVIDIA A100 80GB", "NVIDIA H100 80GB", "NVIDIA L40S"};
    private static final String[] CPU_INSTANCES = {"m6i.4xlarge", "c6i.8xlarge", "r6i.4xlarge"};
    private static final String[] GPU_INSTANCES = {"p4d.24xlarge", "p5.48xlarge", "g6e.12xlarge"};
    private static final String HASH_CHARS = "bcdfghjklmnpqrstvwxz2456789";

    private final ResourceRepository repository;
    private final MonitorApplication.Settings.Seed props;
    private final TransactionTemplate tx;
    private final ObjectMapper mapper = new ObjectMapper();

    public DataSeeder(ResourceRepository repository, MonitorApplication.Settings settings, TransactionTemplate tx) {
        this.repository = repository;
        this.props = settings.seed();
        this.tx = tx;
    }

    @Override
    public void run(ApplicationArguments args) {
        String mode = props.mode();
        if ("off".equals(mode) || ("if-empty".equals(mode) && repository.count() > 0)) {
            log.info("Seed skipped (mode={}, rows={})", mode, repository.count());
        } else {
            seed();
        }
    }

    public void seed() {
        long started = System.currentTimeMillis();
        tx.executeWithoutResult(status -> {
            repository.deleteAll();
            Generator generator = new Generator(new Random(props.randomSeed()), Instant.now());
            for (int c = 0; c < props.clusters(); c++) {
                List<Row> rows = generator.cluster(c);
                for (int from = 0; from < rows.size(); from += BATCH_SIZE) {
                    repository.insertBatch(rows.subList(from, Math.min(from + BATCH_SIZE, rows.size())));
                }
            }
        });
        repository.analyze();
        log.info("Seeded {} resources in {} ms", repository.count(), System.currentTimeMillis() - started);
    }

    private final class Generator {
        private final Random random;
        private final Instant now;
        private long nextId = 1;

        Generator(Random random, Instant now) {
            this.random = random;
            this.now = now;
        }

        List<Row> cluster(int index) {
            List<Row> rows = new ArrayList<>();
            String env = ENVIRONMENTS[index % ENVIRONMENTS.length];
            String[] region = REGIONS[(index / ENVIRONMENTS.length) % REGIONS.length];
            String clusterName = "%s-%s-%02d".formatted(env, region[0], index / (ENVIRONMENTS.length * REGIONS.length) + 1);
            boolean gpuCluster = env.equals("gpu");

            Row cluster = row(Kind.CLUSTER, null, clusterName, clusterName);
            rows.add(cluster);

            double cpuSum = 0;
            double memSum = 0;
            for (int n = 0; n < props.nodesPerCluster(); n++) {
                boolean gpuNode = gpuCluster || n % 5 == 4;
                String pool = gpuNode ? "gpu" : "cpu";
                String nodeName = "%s-%s-node-%02d".formatted(clusterName, pool, n + 1);
                Row node = row(Kind.NODE, cluster, nodeName, clusterName + "/" + nodeName);
                node.clusterId = cluster.id;
                node.cpuPct = usage(35, 30);
                node.memPct = usage(45, 30);
                node.gpuPct = gpuNode ? usage(60, 35) : null;
                node.status = random.nextDouble() < 0.01 ? Status.UNKNOWN
                        : Status.fromUsage(node.cpuPct, node.memPct);
                node.attrs = json(nodeAttrs(gpuNode, index, n));
                rows.add(node);
                cluster.childCount++;
                cpuSum += node.cpuPct;
                memSum += node.memPct;

                String[] namespaces = pickNamespaces();
                for (String nsName : namespaces) {
                    Row ns = row(Kind.NAMESPACE, node, nsName, node.path + "/" + nsName);
                    ns.clusterId = cluster.id;
                    ns.nodeId = node.id;
                    ns.cpuPct = usage(50, 30);
                    ns.memPct = usage(55, 30);
                    ns.status = Status.fromUsage(ns.cpuPct, ns.memPct);
                    ns.attrs = json(namespaceAttrs(nsName, gpuNode));
                    rows.add(ns);
                    node.childCount++;

                    String[] workloads = WORKLOADS.get(nsName);
                    for (int p = 0; p < props.podsPerNamespace(); p++) {
                        String workload = workloads[p % workloads.length];
                        String podName = "%s-%s-%s".formatted(workload, hash(10), hash(5));
                        Row pod = row(Kind.POD, ns, podName, ns.path + "/" + podName);
                        pod.clusterId = cluster.id;
                        pod.nodeId = node.id;
                        pod.namespaceId = ns.id;
                        pod.phase = randomPhase();
                        pod.status = Status.fromPodPhase(pod.phase);
                        pod.restarts = pod.status == Status.CRITICAL ? 5 + random.nextInt(80)
                                : random.nextDouble() < 0.2 ? random.nextInt(4) : 0;
                        pod.cpuPct = usage(30, 25);
                        pod.memPct = usage(40, 25);
                        boolean gpuPod = gpuNode && (nsName.startsWith("ml-") || workload.contains("dcgm"));
                        pod.gpuPct = gpuPod ? usage(70, 30) : null;
                        pod.attrs = json(podAttrs(workload, gpuPod));
                        rows.add(pod);
                        ns.childCount++;
                        count(ns, pod.status);
                    }
                    addDescendants(node, ns);
                }
                addDescendants(cluster, node);
            }
            cluster.cpuPct = (float) (cpuSum / props.nodesPerCluster());
            cluster.memPct = (float) (memSum / props.nodesPerCluster());
            cluster.status = Status.fromUsage(cluster.cpuPct, cluster.memPct);
            if (cluster.desc[2] > cluster.desc[0] * 0.08) {
                cluster.status = Status.WARNING;
            }
            cluster.attrs = json(clusterAttrs(env, region[1]));
            return rows;
        }

        private Row row(Kind kind, Row parent, String name, String path) {
            Row r = new Row();
            r.id = nextId++;
            r.parentId = parent == null ? null : parent.id;
            r.kind = kind;
            r.name = name;
            r.path = path;
            r.status = Status.HEALTHY;
            r.updatedAt = now.minusSeconds(random.nextInt(600));
            return r;
        }

        private void count(Row ancestor, Status status) {
            ancestor.desc[status.ordinal()]++;
        }

        private void addDescendants(Row ancestor, Row child) {
            count(ancestor, child.status);
            for (int i = 0; i < 4; i++) {
                ancestor.desc[i] += child.desc[i];
            }
        }

        private float usage(double mean, double spread) {
            double value = mean + random.nextGaussian() * spread / 2;
            return (float) Math.round(Math.max(1, Math.min(99.5, value)) * 10) / 10;
        }

        private String[] pickNamespaces() {
            List<String> pool = new ArrayList<>(List.of(NAMESPACES));
            String[] picked = new String[props.namespacesPerNode()];
            picked[0] = pool.remove(0);
            picked[1] = pool.remove(0);
            for (int i = 2; i < picked.length; i++) {
                picked[i] = pool.remove(random.nextInt(pool.size()));
            }
            return picked;
        }

        private String randomPhase() {
            double r = random.nextDouble();
            if (r < 0.88) return "Running";
            if (r < 0.91) return "Pending";
            if (r < 0.93) return "ContainerCreating";
            if (r < 0.955) return "CrashLoopBackOff";
            if (r < 0.97) return "OOMKilled";
            if (r < 0.98) return "ImagePullBackOff";
            if (r < 0.99) return "Failed";
            return "Unknown";
        }

        private String hash(int length) {
            StringBuilder sb = new StringBuilder(length);
            for (int i = 0; i < length; i++) {
                sb.append(HASH_CHARS.charAt(random.nextInt(HASH_CHARS.length())));
            }
            return sb.toString();
        }

        private Map<String, Object> clusterAttrs(String env, String region) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("environment", env);
            m.put("provider", "AWS EKS");
            m.put("region", region);
            m.put("kubernetesVersion", "1.3" + random.nextInt(2));
            m.put("apiServer", "https://" + hash(8) + ".eks.amazonaws.com");
            return m;
        }

        private Map<String, Object> nodeAttrs(boolean gpu, int clusterIndex, int nodeIndex) {
            Map<String, Object> m = new LinkedHashMap<>();
            String[] instances = gpu ? GPU_INSTANCES : CPU_INSTANCES;
            m.put("instanceType", instances[random.nextInt(instances.length)]);
            m.put("internalIp", "10.%d.%d.%d".formatted(clusterIndex, nodeIndex, 10 + random.nextInt(240)));
            m.put("cpuCores", gpu ? 96 : 32);
            m.put("memoryGiB", gpu ? 1152 : 128);
            m.put("gpuModel", gpu ? GPU_MODELS[random.nextInt(GPU_MODELS.length)] : null);
            m.put("gpuCount", gpu ? 8 : 0);
            m.put("kubeletVersion", "v1.30." + random.nextInt(6));
            m.put("os", "Amazon Linux 2023");
            m.put("ready", true);
            return m;
        }

        private Map<String, Object> namespaceAttrs(String name, boolean gpu) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("team", name.split("-")[0]);
            m.put("cpuQuotaCores", 8 + random.nextInt(8) * 4);
            m.put("memoryQuotaGiB", 16 + random.nextInt(8) * 16);
            m.put("podQuota", 100);
            m.put("gpuQuota", gpu && name.startsWith("ml-") ? 8 : 0);
            return m;
        }

        private Map<String, Object> podAttrs(String workload, boolean gpu) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("image", "registry.internal/%s:1.%d.%d".formatted(workload, random.nextInt(20), random.nextInt(10)));
            m.put("podIp", "172.16.%d.%d".formatted(random.nextInt(256), random.nextInt(256)));
            m.put("ownerKind", workload.endsWith("job") ? "Job" : workload.contains("exporter")
                    || workload.equals("fluent-bit") || workload.equals("kube-proxy") ? "DaemonSet" : "Deployment");
            m.put("containers", 1 + random.nextInt(3));
            m.put("cpuRequest", (100 + random.nextInt(20) * 100) + "m");
            m.put("memoryRequest", (128 + random.nextInt(16) * 128) + "Mi");
            m.put("gpuRequest", gpu ? 1 + random.nextInt(2) : 0);
            m.put("startedAt", now.minusSeconds(60 + random.nextInt(30 * 24 * 3600)).toString());
            return m;
        }

        private String json(Map<String, Object> value) {
            try {
                return mapper.writeValueAsString(value);
            } catch (JsonProcessingException e) {
                throw new IllegalStateException(e);
            }
        }
    }
}
