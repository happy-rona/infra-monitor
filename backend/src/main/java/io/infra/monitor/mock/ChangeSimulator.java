package io.infra.monitor.mock;

import io.infra.monitor.MonitorApplication;
import io.infra.monitor.domain.Resource.Kind;
import io.infra.monitor.domain.Resource.Status;
import io.infra.monitor.repository.ResourceRepository;
import io.infra.monitor.repository.ResourceRepository.Row;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

@Component
public class ChangeSimulator {
    private static final Logger log = LoggerFactory.getLogger(ChangeSimulator.class);
    private static final String[] BAD_PHASES = {"Pending", "CrashLoopBackOff", "OOMKilled", "ImagePullBackOff", "Failed",
            "Unknown"};

    private final ResourceRepository repository;
    private final TransactionTemplate tx;
    private final MonitorApplication.Settings.Simulator settings;

    public ChangeSimulator(ResourceRepository repository, TransactionTemplate tx, MonitorApplication.Settings settings) {
        this.repository = repository;
        this.tx = tx;
        this.settings = settings.simulator();
    }

    @Scheduled(fixedDelayString = "${monitor.simulator.interval-ms:2000}", initialDelay = 3000)
    public void scheduledTick() {
        if (!settings.enabled()) {
            return;
        }
        try {
            tick(settings.changesPerTick());
        } catch (RuntimeException e) {
            log.warn("Simulator tick failed", e);
        }
    }

    public synchronized int tick(int changes) {
        Integer updated = tx.execute(status -> {
            long maxId = repository.maxId();
            if (maxId == 0) {
                return 0;
            }
            ThreadLocalRandom random = ThreadLocalRandom.current();
            Set<Long> ids = new HashSet<>();
            while (ids.size() < Math.min(changes, maxId)) {
                ids.add(1 + random.nextLong(maxId));
            }

            List<Row> rows = repository.findRows(ids);
            Map<Long, int[]> deltas = new HashMap<>();
            for (Row row : rows) {
                Status before = row.status;
                mutate(row, random);
                if (before != row.status) {
                    for (Long ancestor : new Long[]{row.clusterId, row.nodeId, row.namespaceId}) {
                        if (ancestor != null) {
                            int[] d = deltas.computeIfAbsent(ancestor, k -> new int[4]);
                            d[before.ordinal()]--;
                            d[row.status.ordinal()]++;
                        }
                    }
                }
            }
            Timestamp updatedAt = repository.nextUpdatedAt();
            repository.updateMetrics(rows, updatedAt);
            repository.addDescendantCounts(deltas, updatedAt);

            Set<Long> changed = new HashSet<>(deltas.keySet());
            rows.forEach(r -> changed.add(r.id));
            return changed.size();
        });
        return updated == null ? 0 : updated;
    }

    private void mutate(Row row, ThreadLocalRandom random) {
        row.cpuPct = drift(row.cpuPct, random, 6);
        row.memPct = drift(row.memPct, random, 4);
        row.gpuPct = drift(row.gpuPct, random, 8);
        if (row.kind == Kind.POD) {
            boolean healthy = row.status == Status.HEALTHY;
            if (random.nextDouble() < (healthy ? 0.07 : 0.5)) {
                row.phase = healthy ? BAD_PHASES[random.nextInt(BAD_PHASES.length)] : "Running";
                row.status = Status.fromPodPhase(row.phase);
            }
            if (row.status == Status.CRITICAL) {
                row.restarts = (row.restarts == null ? 0 : row.restarts) + 1 + random.nextInt(3);
            }
        } else if (row.cpuPct != null && row.memPct != null) {
            row.status = Status.fromUsage(row.cpuPct, row.memPct);
        }
    }

    private static Float drift(Float value, ThreadLocalRandom random, double scale) {
        if (value == null) {
            return null;
        }
        double next = value + (45 - value) * 0.05 + random.nextGaussian() * scale;
        return (float) Math.round(Math.max(1, Math.min(99.5, next)) * 10) / 10;
    }
}
