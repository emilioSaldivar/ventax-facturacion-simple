import { describe, expect, it } from "vitest";
import { runMigrations, type MigrationFile } from "../src/db/migrations";

class FakeMigrationClient {
  public readonly queries: Array<{ text: string; values?: unknown[] }> = [];
  private readonly appliedChecksums = new Map<string, string>();

  constructor(initialApplied: Array<{ version: string; checksum: string }> = []) {
    for (const migration of initialApplied) {
      this.appliedChecksums.set(migration.version, migration.checksum);
    }
  }

  async query<T = unknown>(text: string, values?: unknown[]) {
    this.queries.push({ text, values });

    if (text.startsWith("select checksum")) {
      const version = String(values?.[0]);
      const checksum = this.appliedChecksums.get(version);
      return {
        rowCount: checksum ? 1 : 0,
        rows: checksum ? [{ checksum }] : []
      };
    }

    if (text.startsWith("insert into schema_migrations")) {
      const version = String(values?.[0]);
      const checksum = String(values?.[3]);
      this.appliedChecksums.set(version, checksum);
    }

    return { rowCount: 0, rows: [] as T[] };
  }
}

function migration(version: string, checksum: string): MigrationFile {
  return {
    version,
    name: `test_${version}`,
    filename: `${version}_test.sql`,
    sql: `select ${Number(version)};`,
    checksum
  };
}

describe("runMigrations", () => {
  it("applies pending migrations and records them", async () => {
    const client = new FakeMigrationClient();

    const result = await runMigrations(client, [migration("0001", "abc"), migration("0002", "def")]);

    expect(result).toEqual({ applied: ["0001", "0002"], skipped: [] });
    expect(client.queries.some((query) => query.text.includes("create table if not exists schema_migrations"))).toBe(true);
  });

  it("skips migrations already applied with the same checksum", async () => {
    const client = new FakeMigrationClient([{ version: "0001", checksum: "abc" }]);

    const result = await runMigrations(client, [migration("0001", "abc")]);

    expect(result).toEqual({ applied: [], skipped: ["0001"] });
  });

  it("rejects modified historical migrations", async () => {
    const client = new FakeMigrationClient([{ version: "0001", checksum: "original" }]);

    await expect(runMigrations(client, [migration("0001", "changed")])).rejects.toThrow(/otro checksum/);
  });
});

