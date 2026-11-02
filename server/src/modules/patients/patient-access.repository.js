export function createPatientAccessRepository(db) {
  if (typeof db?.query !== 'function') {
    throw new TypeError('A shared PostgreSQL pool/query interface is required.');
  }

  return {
    async hasAccess(userId, patientId) {
      const result = await db.query(
        'SELECT 1 FROM patient_access WHERE user_id = $1 AND patient_id = $2',
        [userId, patientId],
      );
      return result.rows.length > 0;
    },

    async listForUser(userId) {
      const result = await db.query(`
        SELECT p.patient_id, p.code, p.display_name
        FROM patient_access a
        JOIN patient_profiles p ON p.patient_id = a.patient_id
        WHERE a.user_id = $1
        ORDER BY p.code
      `, [userId]);
      return result.rows;
    },
  };
}
