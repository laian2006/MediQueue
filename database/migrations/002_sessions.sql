-- WBS 1.1 (An). Apply after 001_identity.sql; users.user_id must be UUID.
-- The migration runner owns the transaction and records applied migrations.
CREATE TABLE queue_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'OPEN',
    last_issued_number INTEGER NOT NULL DEFAULT 0,
    opened_by UUID NOT NULL REFERENCES users(user_id),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    stopped_by UUID REFERENCES users(user_id),
    stopped_at TIMESTAMPTZ,
    closed_by UUID REFERENCES users(user_id),
    closed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_queue_sessions_status CHECK (status IN ('OPEN', 'STOPPED', 'CLOSED')),
    CONSTRAINT ck_queue_sessions_number CHECK (last_issued_number >= 0),
    CONSTRAINT ck_queue_sessions_lifecycle CHECK (
        (status = 'OPEN' AND stopped_by IS NULL AND stopped_at IS NULL
            AND closed_by IS NULL AND closed_at IS NULL)
        OR (status = 'STOPPED' AND stopped_by IS NOT NULL AND stopped_at IS NOT NULL
            AND closed_by IS NULL AND closed_at IS NULL)
        OR (status = 'CLOSED' AND stopped_by IS NOT NULL AND stopped_at IS NOT NULL
            AND closed_by IS NOT NULL AND closed_at IS NOT NULL)
    ),
    CONSTRAINT ck_queue_sessions_time_order CHECK (
        (stopped_at IS NULL OR stopped_at >= opened_at)
        AND (closed_at IS NULL OR closed_at >= stopped_at)
        AND updated_at >= opened_at
    )
);

-- A constant key enforces ONE active row across BOTH states, even under races.
-- UNIQUE(status) would incorrectly permit one OPEN plus one STOPPED.
CREATE UNIQUE INDEX uq_queue_sessions_single_active
    ON queue_sessions ((1))
    WHERE status IN ('OPEN', 'STOPPED');
