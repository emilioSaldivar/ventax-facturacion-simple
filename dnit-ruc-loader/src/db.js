const { Pool } = require('pg');
const { db } = require('./config');

const pool = new Pool(db);

async function withClient(fn) {
  const client = await pool.connect();
  try {
    await client.query("set lock_timeout = '5s'");
    await client.query("set statement_timeout = '60s'");
    return await fn(client);
  } finally {
    client.release();
  }
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, withClient, closePool };
