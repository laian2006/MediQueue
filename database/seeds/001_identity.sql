-- WBS 1.4 (Hưng). SEED GIẢ LẬP — không chứa thông tin người thật.
-- Chạy sau migration 001_identity.sql. Có thể chạy lại (ON CONFLICT DO NOTHING).
-- Cả ba tài khoản dùng mật khẩu thử: Demo@12345  (chỉ dùng cho DB thử/demo).
-- Hash tạo bằng server/src/modules/auth/password.js (scrypt); xem docs/modules/auth.md.
--
--   staff_01  STAFF            không đại diện hồ sơ nào
--   rep_a     REPRESENTATIVE   P001 (dùng chung), P002 (riêng)
--   rep_b     REPRESENTATIVE   P001 (dùng chung), P003 (riêng)
-- ID cố định để cả nhóm dùng chung; patientId khớp mock của giao diện người bệnh.
INSERT INTO users (user_id, username, display_name, password_hash, role) VALUES
    ('00000000-0000-4000-8000-000000000001', 'staff_01', 'Nhân viên quầy 01',
     'scrypt$16384$8$1$PwqYloAobbxwqSxASFD1fA==$NZsQn1gIeazAZG2mjGjvIig9vVgSCfhuZMpm4PCkwK+CYhjkpgnOylsbwIVycu6XjwUDe6LB+/cQDRAUpwDjLA==',
     'STAFF'),
    ('00000000-0000-4000-8000-000000000002', 'rep_a', 'Người đại diện A',
     'scrypt$16384$8$1$6zEUS5lc9Q9jLqvqzAmhSg==$sLC3LrzmsXJ23s3lUD+yX3byusmLE1KFUqKdZBxikz3rq1PIsVvAV9iSWDcU2yAAXeEVL1RwVAEDYJig+9OJ5w==',
     'REPRESENTATIVE'),
    ('00000000-0000-4000-8000-000000000003', 'rep_b', 'Người đại diện B',
     'scrypt$16384$8$1$WaxoZygPQd1F+1HHakoT6A==$+Vv6wXU11snbF7JS9+o4ncSpJXW1kJ0iu05amn02WDG7pV36CWge3AkyDvdar5uBBhIAsoTZlqlJM7jkz4S6dg==',
     'REPRESENTATIVE')
ON CONFLICT DO NOTHING;

INSERT INTO patient_profiles (patient_id, code, display_name) VALUES
    ('10000000-0000-4000-8000-000000000001', 'P001', 'Người bệnh mô phỏng 01'),
    ('10000000-0000-4000-8000-000000000002', 'P002', 'Người bệnh mô phỏng 02'),
    ('10000000-0000-4000-8000-000000000003', 'P003', 'Người bệnh mô phỏng 03')
ON CONFLICT DO NOTHING;

INSERT INTO patient_access (user_id, patient_id) VALUES
    ('00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
    ('00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002'),
    ('00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001'),
    ('00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003')
ON CONFLICT DO NOTHING;
