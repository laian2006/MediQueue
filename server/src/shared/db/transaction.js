/** All business queries and appendTicketEvent must use this same checked-out client. */
export async function withTransaction(pool, operation) {
  const client = await pool.connect();
  let releaseError;
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      releaseError = rollbackError; // discard a connection whose transaction cannot be cleared
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}
