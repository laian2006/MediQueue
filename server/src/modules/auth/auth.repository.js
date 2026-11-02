const USER_COLUMNS = 'user_id, username, display_name, password_hash, role';

export function createAuthRepository(db) {
  if (typeof db?.query !== 'function') {
    throw new TypeError('A shared PostgreSQL pool/query interface is required.');
  }

  return {
    async findByUsername(username) {
      const result = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE username = $1`, [username]);
      return result.rows[0] ?? null;
    },

    async findById(userId) {
      const result = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE user_id = $1`, [userId]);
      return result.rows[0] ?? null;
    },
  };
}
