export function toUserDto(row) {
  return { userId: row.user_id, displayName: row.display_name, role: row.role };
}
