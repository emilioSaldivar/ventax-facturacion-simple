import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type pg from "pg";

export interface MigrationFile {
  version: string;
  name: string;
  filename: string;
  sql: string;
  checksum: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

const migrationFilePattern = /^(\d{4})_(.+)\.sql$/;

export async function readMigrationFiles(migrationsDir: string): Promise<MigrationFile[]> {
  const entries = await fs.readdir(migrationsDir);
  const sqlFiles = entries.filter((entry) => migrationFilePattern.test(entry)).sort();

  const migrations = await Promise.all(
    sqlFiles.map(async (filename) => {
      const match = migrationFilePattern.exec(filename);
      if (!match) {
        throw new Error(`Nombre de migracion invalido: ${filename}`);
      }
      const [, version, name] = match;
      if (!version || !name) {
        throw new Error(`Nombre de migracion invalido: ${filename}`);
      }

      const sql = await fs.readFile(path.join(migrationsDir, filename), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");

      return {
        version,
        name,
        filename,
        sql,
        checksum
      };
    })
  );

  ensureUniqueVersions(migrations);

  return migrations;
}

export async function runMigrations(client: pg.ClientBase, migrations: MigrationFile[]): Promise<MigrationResult> {
  const applied: string[] = [];
  const skipped: string[] = [];

  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      name text not null,
      filename text not null,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  for (const migration of migrations) {
    await client.query("begin");

    try {
      const existing = await client.query<{ checksum: string }>(
        "select checksum from schema_migrations where version = $1 for update",
        [migration.version]
      );

      if (existing.rowCount && existing.rows[0]?.checksum !== migration.checksum) {
        throw new Error(
          `La migracion ${migration.filename} ya fue aplicada con otro checksum. No se modifica una migracion historica.`
        );
      }

      if (existing.rowCount) {
        skipped.push(migration.version);
        await client.query("commit");
        continue;
      }

      await client.query(migration.sql);
      await client.query(
        `insert into schema_migrations (version, name, filename, checksum)
         values ($1, $2, $3, $4)`,
        [migration.version, migration.name, migration.filename, migration.checksum]
      );
      await client.query("commit");
      applied.push(migration.version);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  return { applied, skipped };
}

function ensureUniqueVersions(migrations: MigrationFile[]) {
  const versions = new Set<string>();

  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(`Version de migracion duplicada: ${migration.version}`);
    }
    versions.add(migration.version);
  }
}
