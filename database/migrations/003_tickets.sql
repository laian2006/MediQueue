-- WBS 1.7 (Đức Anh). Apply after 001_identity.sql and 002_sessions.sql.
-- The migration runner owns the transaction and records applied migrations.
-- Number allocation uses queue_sessions.last_issued_number inside the issue transaction;
-- numbers are never derived by counting existing tickets and are never reused.
CREATE TABLE tickets (
    ticket_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES queue_sessions(session_id),
    patient_id UUID NOT NULL REFERENCES patient_profiles(patient_id),
    issued_by_user_id UUID NOT NULL REFERENCES users(user_id),
    request_id UUID NOT NULL,
    number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'WAITING',
    last_called_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_tickets_number CHECK (number >= 1),
    CONSTRAINT ck_tickets_status CHECK (status IN (
        'WAITING', 'CALLED', 'REGISTERING', 'COMPLETED', 'CANCELLED', 'NO_SHOW'
    )),
    CONSTRAINT ck_tickets_time_order CHECK (
        updated_at >= created_at
        AND (last_called_at IS NULL OR last_called_at >= created_at)
    ),
    -- Numbers are unique per session, including tickets that already ended.
    CONSTRAINT uq_tickets_session_number UNIQUE (session_id, number),
    -- Retry key over the whole ticket history (WBS 2.7 replays on this key).
    CONSTRAINT uq_tickets_request UNIQUE (issued_by_user_id, request_id)
);

-- One active ticket per patient per session, regardless of which representative sent it.
CREATE UNIQUE INDEX uq_tickets_active_patient
    ON tickets (session_id, patient_id)
    WHERE status IN ('WAITING', 'CALLED', 'REGISTERING');

-- One occupied counter slot per session (ERD v1.0). Transitions belong to WBS 1.10/1.11.
CREATE UNIQUE INDEX uq_tickets_counter_slot
    ON tickets (session_id)
    WHERE status IN ('CALLED', 'REGISTERING');

-- FIFO selection and waitingAhead both read WAITING tickets by number within a session.
CREATE INDEX ix_tickets_waiting
    ON tickets (session_id, number)
    WHERE status = 'WAITING';
