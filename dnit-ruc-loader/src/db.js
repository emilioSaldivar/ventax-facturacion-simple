const { Pool } = require('pg');
const { db } = require('./config');

const pool = new Pool(db);

async function withClient(fn) {
  const client = await pool.connect();
  try {
    await client.query("set lock_timeout = '5s'");
    // Copiar el padron completo (2 M de filas con indices) puede superar 60 s en discos lentos.
    await client.query("select set_config('statement_timeout', $1, false)", [process.env.DNIT_STATEMENT_TIMEOUT || '60s']);
    return await fn(client);
  } finally {
    client.release();
  }
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, withClient, closePool };
