CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS resource (
    id             BIGINT       PRIMARY KEY,
    parent_id      BIGINT,
    kind           VARCHAR(16)  NOT NULL,
    depth          SMALLINT     NOT NULL,
    name           VARCHAR(128) NOT NULL,
    status         VARCHAR(16)  NOT NULL,
    cluster_id     BIGINT,
    node_id        BIGINT,
    namespace_id   BIGINT,
    path           VARCHAR(512) NOT NULL,
    child_count    INT          NOT NULL DEFAULT 0,
    desc_healthy   INT          NOT NULL DEFAULT 0,
    desc_warning   INT          NOT NULL DEFAULT 0,
    desc_critical  INT          NOT NULL DEFAULT 0,
    desc_unknown   INT          NOT NULL DEFAULT 0,
    cpu_pct        REAL,
    mem_pct        REAL,
    gpu_pct        REAL,
    restarts       INT,
    phase          VARCHAR(32),
    attrs          JSONB,
    updated_at     TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resource_parent_name   ON resource (parent_id, name);
CREATE INDEX IF NOT EXISTS idx_resource_kind_name     ON resource (kind, name, id);
CREATE INDEX IF NOT EXISTS idx_resource_kind_status   ON resource (kind, status, name, id);
CREATE INDEX IF NOT EXISTS idx_resource_updated_at    ON resource (updated_at);
CREATE INDEX IF NOT EXISTS idx_resource_name_trgm     ON resource USING gin (name gin_trgm_ops);
