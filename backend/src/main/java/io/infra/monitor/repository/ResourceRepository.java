package io.infra.monitor.repository;

import io.infra.monitor.domain.Resource;
import io.infra.monitor.domain.Resource.Counts;
import io.infra.monitor.domain.Resource.Kind;
import io.infra.monitor.domain.Resource.Status;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class ResourceRepository {
    private static final String COLUMNS = """
            id, parent_id, kind, name, status, cluster_id, node_id, namespace_id, path, child_count,
            desc_healthy, desc_warning, desc_critical, desc_unknown,
            cpu_pct, mem_pct, gpu_pct, restarts, phase, updated_at""";

    private final NamedParameterJdbcTemplate jdbc;

    public ResourceRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Resource> findRoots() {
        return jdbc.query("SELECT " + COLUMNS + " FROM resource WHERE parent_id IS NULL ORDER BY name", MAPPER);
    }

    public List<Resource> findChildren(long parentId, int limit) {
        return jdbc.query("SELECT " + COLUMNS + " FROM resource WHERE parent_id = :parentId ORDER BY name LIMIT :limit",
                Map.of("parentId", parentId, "limit", limit), MAPPER);
    }

    public Optional<Resource> findById(long id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM resource WHERE id = :id", Map.of("id", id), MAPPER)
                .stream().findFirst();
    }

    public String findAttrs(long id) {
        return jdbc.queryForObject("SELECT attrs::text FROM resource WHERE id = :id", Map.of("id", id), String.class);
    }

    public List<Resource> search(String term, Collection<Status> statuses, int cap, int limit) {
        MapSqlParameterSource params = searchParams(term, statuses).addValue("cap", cap).addValue("limit", limit);
        return jdbc.query("SELECT " + COLUMNS + " FROM (" + searchCandidates(statuses) + ") c"
                + " ORDER BY name LIKE :prefix DESC, depth, name LIMIT :limit", params, MAPPER);
    }

    public int countSearch(String term, Collection<Status> statuses, int cap) {
        MapSqlParameterSource params = searchParams(term, statuses).addValue("cap", cap);
        return jdbc.queryForObject("SELECT COUNT(*) FROM (" + searchCandidates(statuses) + ") c", params, Integer.class);
    }

    private static String searchCandidates(Collection<Status> statuses) {
        return "SELECT " + COLUMNS + ", depth FROM resource WHERE name LIKE :pattern"
                + (statuses.isEmpty() ? "" : " AND status IN (:statuses)") + " LIMIT :cap";
    }

    private static MapSqlParameterSource searchParams(String term, Collection<Status> statuses) {
        String escaped = term.toLowerCase().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return new MapSqlParameterSource()
                .addValue("pattern", "%" + escaped + "%")
                .addValue("prefix", escaped + "%")
                .addValue("statuses", names(statuses));
    }

    public List<Resource> listPods(Collection<Status> statuses, int offset, int limit) {
        return jdbc.query("SELECT " + COLUMNS + " FROM resource JOIN ("
                        + "SELECT id FROM resource WHERE " + podWhere(statuses)
                        + " ORDER BY name, id LIMIT :limit OFFSET :offset) page USING (id) ORDER BY name, id",
                new MapSqlParameterSource("statuses", names(statuses)).addValue("limit", limit).addValue("offset", offset),
                MAPPER);
    }

    public int countPods(Collection<Status> statuses) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM resource WHERE " + podWhere(statuses),
                Map.of("statuses", names(statuses)), Integer.class);
    }

    private static String podWhere(Collection<Status> statuses) {
        return statuses.isEmpty() ? "kind = 'POD'" : "kind = 'POD' AND status IN (:statuses)";
    }

    public long maxUpdatedAt() {
        Timestamp max = jdbc.queryForObject("SELECT MAX(updated_at) FROM resource", Map.of(), Timestamp.class);
        return max == null ? 0 : max.getTime();
    }

    public Timestamp nextUpdatedAt() {
        return jdbc.queryForObject("SELECT GREATEST(now()::timestamp(3), MAX(updated_at) + interval '1 millisecond') FROM resource",
                Map.of(), Timestamp.class);
    }

    public long maxId() {
        return jdbc.queryForObject("SELECT COALESCE(MAX(id), 0) FROM resource", Map.of(), Long.class);
    }

    public long count() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM resource", Map.of(), Long.class);
    }

    public List<Resource> findChangedSince(long since, int limit) {
        return jdbc.query("SELECT " + COLUMNS + " FROM resource WHERE updated_at > :since ORDER BY updated_at LIMIT :limit",
                Map.of("since", new Timestamp(since), "limit", limit), MAPPER);
    }

    public List<Resource> findChangedAt(long updatedAt) {
        return jdbc.query("SELECT " + COLUMNS + " FROM resource WHERE updated_at = :at",
                Map.of("at", new Timestamp(updatedAt)), MAPPER);
    }

    public void deleteAll() {
        jdbc.update("TRUNCATE resource", Map.of());
    }

    public void analyze() {
        jdbc.update("VACUUM ANALYZE resource", Map.of());
    }

    public void insertBatch(List<Row> rows) {
        jdbc.batchUpdate("""
                INSERT INTO resource (id, parent_id, kind, depth, name, status, cluster_id, node_id, namespace_id,
                    path, child_count, desc_healthy, desc_warning, desc_critical, desc_unknown,
                    cpu_pct, mem_pct, gpu_pct, restarts, phase, attrs, updated_at)
                VALUES (:id, :parentId, :kind, :depth, :name, :status, :clusterId, :nodeId, :namespaceId,
                    :path, :childCount, :descHealthy, :descWarning, :descCritical, :descUnknown,
                    :cpuPct, :memPct, :gpuPct, :restarts, :phase, CAST(:attrs AS jsonb), :updatedAt)""",
                rows.stream().map(r -> new MapSqlParameterSource()
                        .addValue("id", r.id)
                        .addValue("parentId", r.parentId)
                        .addValue("kind", r.kind.name())
                        .addValue("depth", r.kind.ordinal())
                        .addValue("name", r.name)
                        .addValue("status", r.status.name())
                        .addValue("clusterId", r.clusterId)
                        .addValue("nodeId", r.nodeId)
                        .addValue("namespaceId", r.namespaceId)
                        .addValue("path", r.path)
                        .addValue("childCount", r.childCount)
                        .addValue("descHealthy", r.desc[0])
                        .addValue("descWarning", r.desc[1])
                        .addValue("descCritical", r.desc[2])
                        .addValue("descUnknown", r.desc[3])
                        .addValue("cpuPct", r.cpuPct)
                        .addValue("memPct", r.memPct)
                        .addValue("gpuPct", r.gpuPct)
                        .addValue("restarts", r.restarts)
                        .addValue("phase", r.phase)
                        .addValue("attrs", r.attrs)
                        .addValue("updatedAt", Timestamp.from(r.updatedAt)))
                        .toArray(SqlParameterSource[]::new));
    }

    public List<Row> findRows(Collection<Long> ids) {
        return jdbc.query("""
                SELECT id, kind, status, cluster_id, node_id, namespace_id, cpu_pct, mem_pct, gpu_pct, restarts, phase
                FROM resource WHERE id IN (:ids)""", Map.of("ids", ids), (rs, i) -> {
            Row r = new Row();
            r.id = rs.getLong("id");
            r.kind = Kind.valueOf(rs.getString("kind"));
            r.status = Status.valueOf(rs.getString("status"));
            r.clusterId = (Long) rs.getObject("cluster_id");
            r.nodeId = (Long) rs.getObject("node_id");
            r.namespaceId = (Long) rs.getObject("namespace_id");
            r.cpuPct = getFloat(rs, "cpu_pct");
            r.memPct = getFloat(rs, "mem_pct");
            r.gpuPct = getFloat(rs, "gpu_pct");
            r.restarts = (Integer) rs.getObject("restarts");
            r.phase = rs.getString("phase");
            return r;
        });
    }

    public void updateMetrics(List<Row> rows, Timestamp updatedAt) {
        jdbc.batchUpdate("""
                UPDATE resource SET status = :status, cpu_pct = :cpuPct, mem_pct = :memPct, gpu_pct = :gpuPct,
                    restarts = :restarts, phase = :phase, updated_at = :updatedAt
                WHERE id = :id""", rows.stream().map(r -> new MapSqlParameterSource()
                .addValue("id", r.id)
                .addValue("status", r.status.name())
                .addValue("cpuPct", r.cpuPct)
                .addValue("memPct", r.memPct)
                .addValue("gpuPct", r.gpuPct)
                .addValue("restarts", r.restarts)
                .addValue("phase", r.phase)
                .addValue("updatedAt", updatedAt)).toArray(SqlParameterSource[]::new));
    }

    public void addDescendantCounts(Map<Long, int[]> deltas, Timestamp updatedAt) {
        jdbc.batchUpdate("""
                UPDATE resource SET desc_healthy = desc_healthy + :h, desc_warning = desc_warning + :w,
                    desc_critical = desc_critical + :c, desc_unknown = desc_unknown + :u,
                    updated_at = :updatedAt
                WHERE id = :id""", deltas.entrySet().stream().map(e -> new MapSqlParameterSource()
                .addValue("id", e.getKey())
                .addValue("h", e.getValue()[0]).addValue("w", e.getValue()[1])
                .addValue("c", e.getValue()[2]).addValue("u", e.getValue()[3])
                .addValue("updatedAt", updatedAt)).toArray(SqlParameterSource[]::new));
    }

    public static class Row {
        public long id;
        public Long parentId;
        public Kind kind;
        public String name;
        public Status status;
        public Long clusterId;
        public Long nodeId;
        public Long namespaceId;
        public String path;
        public int childCount;
        public final int[] desc = new int[4];
        public Float cpuPct;
        public Float memPct;
        public Float gpuPct;
        public Integer restarts;
        public String phase;
        public String attrs;
        public Instant updatedAt;
    }

    private static final RowMapper<Resource> MAPPER = (rs, rowNum) -> new Resource(
            rs.getLong("id"),
            (Long) rs.getObject("parent_id"),
            Kind.valueOf(rs.getString("kind")),
            rs.getString("name"),
            Status.valueOf(rs.getString("status")),
            (Long) rs.getObject("cluster_id"),
            (Long) rs.getObject("node_id"),
            (Long) rs.getObject("namespace_id"),
            rs.getString("path"),
            rs.getInt("child_count"),
            new Counts(rs.getInt("desc_healthy"), rs.getInt("desc_warning"),
                    rs.getInt("desc_critical"), rs.getInt("desc_unknown")),
            getFloat(rs, "cpu_pct"),
            getFloat(rs, "mem_pct"),
            getFloat(rs, "gpu_pct"),
            (Integer) rs.getObject("restarts"),
            rs.getString("phase"),
            rs.getTimestamp("updated_at").getTime());

    private static Float getFloat(ResultSet rs, String column) throws SQLException {
        float value = rs.getFloat(column);
        return rs.wasNull() ? null : value;
    }

    private static List<String> names(Collection<Status> statuses) {
        return statuses.stream().map(Enum::name).toList();
    }
}
