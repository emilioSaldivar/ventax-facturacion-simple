import type { PoolClient } from "pg";
import { pool } from "./pool";

/**
 * Ejecuta `fn` dentro de una transaccion, liberando la conexion siempre.
 *
 * Reemplaza el patron escrito a mano en `backoffice.repository.ts:407, 435, 461, 511, 1025, 1061`.
 * Esos metodos no se migran en esta entrega: el helper nace para el import (PLAN seccion 1.4).
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
