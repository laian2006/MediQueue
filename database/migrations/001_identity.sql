-- WBS 1.4 (Hưng). Danh tính: users, patient_profiles, patient_access.
-- Chạy TRƯỚC 002_sessions.sql: queue_sessions tham chiếu users(user_id) kiểu UUID.
-- Runner migration quản lý transaction và ghi nhận migration đã chạy.
-- Bảng lưu phiên đăng nhập (auth_sessions) là hạ tầng xác thực riêng, không nằm ở đây.
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT ck_users_role CHECK (role IN ('REPRESENTATIVE', 'STAFF')),
    CONSTRAINT ck_users_username_not_blank CHECK (btrim(username) <> ''),
    CONSTRAINT ck_users_display_name_not_blank CHECK (btrim(display_name) <> ''),
    CONSTRAINT ck_users_password_hash_not_blank CHECK (btrim(password_hash) <> '')
);

CREATE TABLE patient_profiles (
    patient_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    display_name TEXT NOT NULL,
    CONSTRAINT uq_patient_profiles_code UNIQUE (code),
    CONSTRAINT ck_patient_profiles_code_not_blank CHECK (btrim(code) <> ''),
    CONSTRAINT ck_patient_profiles_display_name_not_blank CHECK (btrim(display_name) <> '')
);

-- Một người đại diện có thể có nhiều hồ sơ; một hồ sơ có thể có nhiều người đại diện.
-- Các nghiệp vụ khác kiểm tra theo patient_id (không theo user_id).
-- Việc chỉ REPRESENTATIVE mới được cấp quyền do seed và patient-access.service kiểm tra.
CREATE TABLE patient_access (
    user_id UUID NOT NULL REFERENCES users(user_id),
    patient_id UUID NOT NULL REFERENCES patient_profiles(patient_id),
    CONSTRAINT pk_patient_access PRIMARY KEY (user_id, patient_id)
);

CREATE INDEX ix_patient_access_patient_id ON patient_access (patient_id);
