-- TEST ONLY: the minimum FK target needed to validate 002 before Hung's 001 exists.
-- The integration suite runs this in its own random schema, never in public.
-- This is NOT 001_identity.sql, production seed data, or authentication.
CREATE TABLE users (
    user_id UUID PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('STAFF', 'REPRESENTATIVE'))
);
INSERT INTO users (user_id, role) VALUES
    ('00000000-0000-4000-8000-000000000001', 'STAFF'),
    ('00000000-0000-4000-8000-000000000002', 'REPRESENTATIVE'),
    ('00000000-0000-4000-8000-000000000003', 'STAFF');
