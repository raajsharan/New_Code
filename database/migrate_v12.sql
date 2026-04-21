-- migrate_v12.sql
-- Audit log foundation for entity change tracking.

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(32) NOT NULL,
    before_json JSONB,
    after_json JSONB,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_username VARCHAR(200),
    ip_address VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_time
    ON audit_logs (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_time
    ON audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_time
    ON audit_logs (action, created_at DESC);
