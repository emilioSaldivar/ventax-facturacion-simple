import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool";
import { readMigrationFiles, runMigrations } from "./migrations";
import { logger } from "../shared/logging/logger";

const currentFile = fileURLToPath(import.meta.url);
const apiSrcDir = path.dirname(currentFile);
const repoRoot = path.resolve(apiSrcDir, "../../../..");
const migrationsDir = path.join(repoRoot, "db", "migrations");

async function main() {
  const migrations = await readMigrationFiles(migrationsDir);

  const client = await pool.connect();
  try {
    const result = await runMigrations(client, migrations);
    logger.info(
      {
        applied: result.applied,
        skipped: result.skipped,
        migrationsDir
      },
      "Database migrations completed"
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  logger.error({ err: error }, "Database migrations failed");
  await pool.end();
  process.exitCode = 1;
});

