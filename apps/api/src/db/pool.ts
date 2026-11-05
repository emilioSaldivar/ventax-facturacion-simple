import pg from "pg";
import { env } from "../config/env";
import { logger } from "../shared/logging/logger";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL
});

// Sin este manejador, un reinicio de PostgreSQL termina el proceso, y con el los workers
// (SPEC_API_TRAS_REINICIO_POSTGRES). El pool descarta la conexion y abre otra al volver la base.
pool.on("error", (error: Error & { code?: string }) => {
  logger.error({ code: error.code, message: error.message }, "pool de PostgreSQL: error en una conexion ociosa");
});

