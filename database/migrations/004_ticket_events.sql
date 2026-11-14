-- WBS 1.7 (Đức Anh), DDL handed over by Trực in docs/architecture/ticket-event.md (WBS 1.19).
-- Apply after 003_tickets.sql. The migration runner owns the transaction and history.
-- Append-only history: the application never UPDATEs or DELETEs rows; no ON DELETE CASCADE.
CREATE TABLE ticket_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(ticket_id),
    actor_user_id UUID NOT NULL REFERENCES users(user_id),
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT ck_ticket_events_action CHECK (
        action IN ('ISSUED','CALLED','RECALLED','STARTED','COMPLETED','CANCELLED','NO_SHOW')
    ),
    CONSTRAINT ck_ticket_events_from_status CHECK (
        from_status IS NULL OR from_status IN ('WAITING','CALLED','REGISTERING','COMPLETED','CANCELLED','NO_SHOW')
    ),
    CONSTRAINT ck_ticket_events_to_status CHECK (
        to_status IN ('WAITING','CALLED','REGISTERING','COMPLETED','CANCELLED','NO_SHOW')
    ),
    CONSTRAINT ck_ticket_events_initial CHECK (
        (action = 'ISSUED' AND from_status IS NULL)
        OR (action <> 'ISSUED' AND from_status IS NOT NULL)
    )
);
CREATE INDEX ix_ticket_events_ticket_time ON ticket_events(ticket_id, occurred_at, event_id);
