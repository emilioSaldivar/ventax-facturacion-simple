// SPEC_MULTIPERFIL_USUARIO_v0.1, MPU-001/003/006/013 — integracion real contra Postgres. Se salta sin DATABASE_URL_TEST.
//
//   DATABASE_URL_TEST=postgres://<usuario>:<clave>@127.0.0.1:15494/fs_multiperfil_test npx vitest run tests/multiperfil.integration.test.ts
//
// Requiere 0044. Usa el primer usuario con configuracion de un facturador con dos o mas perfiles
// emitibles; le agrega una segunda configuracion y la quita al final.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL_TEST;
const describeDb = DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://localhost/none";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "test-secret-integration";

describeDb("multiperfil: base de datos (integracion)", () => {
  let pool: import("pg").Pool;
  let ctxRepo: import("../src/modules/context/context.repository").PgOperationalContextRepository;
  let authRepo: import("../src/modules/auth/auth.repository").PgAuthRepository;
  let usuarioId = "";
  let tenantId = "";
  let facturadorId = "";
  let configOriginal = "";
  let configNueva = "";
  let perfilNuevo = "";
  const tokens: string[] = [];

  const fila = async <T>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0] as T;

  beforeAll(async () => {
    ({ pool } = await import("../src/db/pool"));
    ({ operationalContextRepository: ctxRepo } = await import("../src/modules/context/context.repository"));
    ({ authRepository: authRepo } = await import("../src/modules/auth/auth.repository"));
    const base = await fila<{ usuario_id: string; tenant_id: string; facturador_id: string; config_id: string; perfil_actual: string }>(`
      select uoc.usuario_id, uoc.tenant_id, uoc.facturador_id, uoc.id as config_id, uoc.actividad_punto_perfil_id as perfil_actual
        from usuario_operacion_config uoc
        join usuarios u on u.id = uoc.usuario_id and u.activo and u.deleted_at is null and u.bloqueado_at is null
       where uoc.activo and uoc.deleted_at is null
         and (select count(*) from actividad_punto_perfiles app
               where app.facturador_id = uoc.facturador_id and app.activo and app.deleted_at is null and app.timbrado is not null) >= 2
       order by uoc.created_at limit 1
    `);
    usuarioId = base.usuario_id;
    tenantId = base.tenant_id;
    facturadorId = base.facturador_id;
    configOriginal = base.config_id;
    perfilNuevo = (await fila<{ id: string }>(
      `select id from actividad_punto_perfiles
        where facturador_id = $1 and id <> $2 and activo and deleted_at is null and timbrado is not null
        order by created_at limit 1`,
      [facturadorId, base.perfil_actual]
    )).id;
    configNueva = (await fila<{ id: string }>(
      `insert into usuario_operacion_config (tenant_id, usuario_id, facturador_id, actividad_punto_perfil_id, activo)
       values ($1, $2, $3, $4, true) returning id`,
      [tenantId, usuarioId, facturadorId, perfilNuevo]
    )).id;
  });

  afterAll(async () => {
    await pool.query("delete from refresh_tokens where token_hash = any($1)", [tokens]);
    await pool.query("delete from usuario_operacion_config where id = $1", [configNueva]);
    await pool.end();
  });

  it("listPerfilesDisponibles devuelve las dos configuraciones del usuario", async () => {
    const perfiles = await ctxRepo.listPerfilesDisponibles(usuarioId);
    expect(perfiles.map((p) => p.operacion_config_id).sort()).toEqual([configOriginal, configNueva].sort());
    for (const p of perfiles) {
      expect(p.titulo_operativo).toBeTruthy();
      expect(p.timbrado).toBeTruthy();
    }
  });

  it("getOperationalContext con uoc devuelve exactamente esa configuracion", async () => {
    const a = await ctxRepo.getOperationalContext(usuarioId, configOriginal);
    const b = await ctxRepo.getOperationalContext(usuarioId, configNueva);
    expect(b?.actividad_punto_perfil_id).toBe(perfilNuevo);
    expect(a?.actividad_punto_perfil_id).not.toBe(perfilNuevo);
    expect(`${a?.fiscal_context.establecimiento}-${a?.fiscal_context.punto_expedicion}`).not.toBe(
      `${b?.fiscal_context.establecimiento}-${b?.fiscal_context.punto_expedicion}`
    );
  });

  it("getOperationalContext con un uoc ajeno no devuelve nada", async () => {
    expect(await ctxRepo.getOperationalContext(usuarioId, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("readiness con dos filas devuelve un solo juego de checks por uoc", async () => {
    const checks = await ctxRepo.getReadinessChecks(usuarioId, configNueva);
    expect(checks.find((c) => c.code === "usuario_config_operativa")?.ok).toBe(true);
    expect(checks.find((c) => c.code === "fiscal_context_local")?.ok).toBe(true);
  });

  it("un perfil desactivado deja de ser emitible y su uoc no resuelve (RN-07)", async () => {
    await pool.query("update actividad_punto_perfiles set activo = false where id = $1", [perfilNuevo]);
    try {
      const perfiles = await ctxRepo.listPerfilesDisponibles(usuarioId);
      expect(perfiles.map((p) => p.operacion_config_id)).toEqual([configOriginal]);
      expect(await ctxRepo.getOperationalContext(usuarioId, configNueva)).toBeNull();
    } finally {
      await pool.query("update actividad_punto_perfiles set activo = true where id = $1", [perfilNuevo]);
    }
  });

  it("el refresh guarda la configuracion, la rota y se revoca por configuracion (D-9)", async () => {
    const hash = `it-mpu-${Date.now()}`;
    tokens.push(hash, `${hash}-2`);
    await authRepo.createRefreshToken({ userId: usuarioId, tokenHash: hash, expiresAt: new Date(Date.now() + 3600_000), operacionConfigId: configNueva });
    const rotado = await authRepo.rotateRefreshToken({ currentTokenHash: hash, newTokenHash: `${hash}-2`, newExpiresAt: new Date(Date.now() + 3600_000) });
    expect(rotado?.operacionConfigId).toBe(configNueva);
    const nueva = await fila<{ operacion_config_id: string }>("select operacion_config_id from refresh_tokens where token_hash = $1", [`${hash}-2`]);
    expect(nueva.operacion_config_id).toBe(configNueva);
    expect(await authRepo.revokeRefreshTokensByOperacionConfig(configNueva)).toBeGreaterThanOrEqual(1);
    const revocada = await fila<{ revoked_at: Date | null }>("select revoked_at from refresh_tokens where token_hash = $1", [`${hash}-2`]);
    expect(revocada.revoked_at).not.toBeNull();
  });

  it("el indice impide repetir el mismo perfil activo y el disparador otro facturador (RN-01)", async () => {
    await expect(
      pool.query(
        `insert into usuario_operacion_config (tenant_id, usuario_id, facturador_id, actividad_punto_perfil_id, activo) values ($1, $2, $3, $4, true)`,
        [tenantId, usuarioId, facturadorId, perfilNuevo]
      )
    ).rejects.toMatchObject({ code: "23505" });
    const otro = await fila<{ id: string } | undefined>("select id from facturadores where id <> $1 and deleted_at is null limit 1", [facturadorId]);
    if (otro) {
      await expect(
        pool.query(`update usuario_operacion_config set facturador_id = $2 where id = $1`, [configNueva, otro.id])
      ).rejects.toMatchObject({ code: "23514", message: "USUARIO_CON_OTRO_FACTURADOR" });
    }
  });
});
