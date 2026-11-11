// SPEC_MULTIPERFIL_USUARIO_v0.1, MPU-005 y MPU-006: login, seleccion, cambio de perfil y refresh.
import { beforeEach, describe, expect, it } from "vitest";
import type { PerfilDisponible } from "@facturacion-simple/shared";
import { login, refreshSession, seleccionarPerfil, type PerfilesSource } from "../src/modules/auth/auth.service";
import { hashPassword } from "../src/modules/auth/password.service";
import { hashRefreshToken, verifyAccessToken } from "../src/modules/auth/token.service";
import type { AuthenticatedUser, AuthRepository, LoginUserRecord } from "../src/modules/auth/auth.types";
import type { AuditEventInput, AuditRepository } from "../src/shared/audit/audit.repository";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "test-secret";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AJENO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function perfil(id: string, punto: string): PerfilDisponible {
  return {
    operacion_config_id: id,
    facturador_id: "fac-1",
    establecimiento: "001",
    punto_expedicion: punto,
    perfil_emision_codigo: `P${punto}`,
    perfil_emision_alias: null,
    actividad_economica_codigo: "96099",
    actividad_economica_descripcion: null,
    actividad_economica_alias: null,
    titulo_operativo: `Punto ${punto}`,
    timbrado: "18861677",
    numeracion_facturas: "SERVICIO",
    documento_nro: "0000001",
    activo_en_sesion: false
  };
}

class Perfiles implements PerfilesSource {
  constructor(public ids: string[]) {}
  async listPerfilesDisponibles() {
    return this.ids.map((id, i) => perfil(id, String(i + 1).padStart(3, "0")));
  }
}

interface RefreshFila {
  tokenHash: string;
  operacionConfigId: string | null;
  revocado: boolean;
}

class Repo implements AuthRepository {
  failed: Array<{ reason: string; nextFailedCount?: number; blockUser?: boolean }> = [];
  refresh: RefreshFila[] = [];
  resets = 0;
  constructor(public user: LoginUserRecord) {}

  async findUserForLogin() {
    return this.user;
  }
  async recordFailedLogin(input: { reason: string; nextFailedCount?: number; blockUser?: boolean }) {
    this.failed.push(input);
    if (input.nextFailedCount !== undefined) this.user = { ...this.user, failedLoginCount: input.nextFailedCount };
    if (input.blockUser) this.user = { ...this.user, bloqueadoAt: new Date() };
  }
  async recordSuccessfulLogin() {}
  async createRefreshToken(input: { tokenHash: string; operacionConfigId?: string | null }) {
    this.refresh.push({ tokenHash: input.tokenHash, operacionConfigId: input.operacionConfigId ?? null, revocado: false });
  }
  async rotateRefreshToken(input: { currentTokenHash: string; newTokenHash: string }) {
    const actual = this.refresh.find((r) => r.tokenHash === input.currentTokenHash && !r.revocado);
    if (!actual) return null;
    actual.revocado = true;
    this.refresh.push({ tokenHash: input.newTokenHash, operacionConfigId: actual.operacionConfigId, revocado: false });
    return { ...this.user, operacionConfigId: actual.operacionConfigId };
  }
  async revokeRefreshToken(input: { tokenHash: string }) {
    const fila = this.refresh.find((r) => r.tokenHash === input.tokenHash && !r.revocado);
    if (fila) fila.revocado = true;
    return Boolean(fila);
  }
  async setRefreshTokenOperacionConfig(input: { tokenHash: string; operacionConfigId: string | null }) {
    const fila = this.refresh.find((r) => r.tokenHash === input.tokenHash);
    if (fila) fila.operacionConfigId = input.operacionConfigId;
  }
  async resetFailedLogin() {
    this.resets += 1;
    this.user = { ...this.user, failedLoginCount: 0 };
  }
  async findActiveUserById(): Promise<AuthenticatedUser | null> {
    return null;
  }
}

class Audit implements AuditRepository {
  eventos: AuditEventInput[] = [];
  async insertEvent(input: AuditEventInput) {
    this.eventos.push(input);
  }
  async facturadorDe() {
    return "fac-1";
  }
}

let repo: Repo;
let audit: Audit;

beforeEach(async () => {
  repo = new Repo({
    id: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
    username: "larissa@cliente.com.py",
    displayName: "Larissa",
    passwordHash: await hashPassword("correcta"),
    role: "OPERADOR_FACTURACION",
    activo: true,
    bloqueadoAt: null,
    failedLoginCount: 0,
    mustChangePassword: false,
    hasAcceptedCurrentTyc: true
  });
  audit = new Audit();
});

function sesion(scope: "full" | "perfil_select", uoc: string | null = null): AuthenticatedUser {
  return { id: repo.user.id, tenantId: repo.user.tenantId, username: repo.user.username, role: repo.user.role, scope, operacionConfigId: uoc };
}

describe("login con perfiles (§B.1)", () => {
  it("una configuracion: sesion completa con uoc y refresh con el perfil (RN-02)", async () => {
    const r = await login({ username: "x", password: "correcta" }, repo, new Perfiles([A]));
    expect(r.response.pending_actions).toBeUndefined();
    expect(verifyAccessToken(r.response.access_token)).toMatchObject({ scope: "full", uoc: A });
    expect(r.refreshToken).not.toBeNull();
    expect(repo.refresh).toEqual([expect.objectContaining({ operacionConfigId: A })]);
  });

  it("dos configuraciones: SELECT_PERFIL, token perfil_select y sin refresh (CA-02, D-8)", async () => {
    const r = await login({ username: "x", password: "correcta" }, repo, new Perfiles([A, B]));
    expect(r.response.pending_actions).toEqual(["SELECT_PERFIL"]);
    expect(r.response.perfiles?.map((p) => p.operacion_config_id)).toEqual([A, B]);
    expect(r.response.expires_in).toBe(600);
    expect(verifyAccessToken(r.response.access_token)).toMatchObject({ scope: "perfil_select" });
    expect(verifyAccessToken(r.response.access_token).uoc).toBeUndefined();
    expect(r.refreshToken).toBeNull();
    expect(repo.refresh).toEqual([]);
  });

  it("ninguna configuracion: sesion completa sin uoc, como antes", async () => {
    const r = await login({ username: "x", password: "correcta" }, repo, new Perfiles([]));
    expect(verifyAccessToken(r.response.access_token).uoc).toBeUndefined();
    expect(repo.refresh).toEqual([expect.objectContaining({ operacionConfigId: null })]);
  });

  it("sin fuente de perfiles se comporta como antes de la SPEC", async () => {
    const r = await login({ username: "x", password: "correcta" }, repo);
    expect(verifyAccessToken(r.response.access_token)).toMatchObject({ scope: "full" });
    expect(verifyAccessToken(r.response.access_token).uoc).toBeUndefined();
  });
});

describe("seleccion tras el login (§B.2)", () => {
  it("con perfil_select elige sin contraseña y registra PERFIL_SELECCIONADO", async () => {
    const r = await seleccionarPerfil({ user: sesion("perfil_select"), operacionConfigId: B }, repo, new Perfiles([A, B]), audit);
    expect(verifyAccessToken(r.response.access_token)).toMatchObject({ scope: "full", uoc: B });
    expect(repo.refresh).toEqual([expect.objectContaining({ operacionConfigId: B, revocado: false })]);
    expect(audit.eventos).toEqual([
      expect.objectContaining({ eventType: "PERFIL_SELECCIONADO", entityId: B, facturadorId: "fac-1", metadata: expect.objectContaining({ anterior: null, nuevo: B, origen: "LOGIN" }) })
    ]);
  });

  it("perfil ajeno o inexistente: el mismo 401 (RN-04)", async () => {
    const err = await seleccionarPerfil({ user: sesion("perfil_select"), operacionConfigId: AJENO }, repo, new Perfiles([A, B]), audit).catch((e) => e);
    expect(err).toMatchObject({ statusCode: 401, code: "AUTH_REQUIRED", message: "Punto de expedicion no disponible para este usuario." });
    expect(audit.eventos).toEqual([]);
  });
});

describe("cambio dentro de la app (§B.3, RN-04)", () => {
  it("sin contraseña responde 400", async () => {
    await expect(seleccionarPerfil({ user: sesion("full", A), operacionConfigId: B }, repo, new Perfiles([A, B]), audit)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("contraseña incorrecta: 401 y cuenta el intento como INVALID_PASSWORD_PERFIL", async () => {
    const err = await seleccionarPerfil({ user: sesion("full", A), operacionConfigId: B, password: "mal" }, repo, new Perfiles([A, B]), audit).catch((e) => e);
    expect(err).toMatchObject({ statusCode: 401, details: { reason: "PASSWORD_INCORRECTA" } });
    expect(repo.failed).toEqual([expect.objectContaining({ reason: "INVALID_PASSWORD_PERFIL", nextFailedCount: 1, blockUser: false })]);
  });

  it("al quinto intento fallido bloquea con 423 (CA-03)", async () => {
    for (let i = 1; i <= 4; i += 1) {
      await expect(seleccionarPerfil({ user: sesion("full", A), operacionConfigId: B, password: "mal" }, repo, new Perfiles([A, B]), audit)).rejects.toMatchObject({ statusCode: 401 });
    }
    await expect(seleccionarPerfil({ user: sesion("full", A), operacionConfigId: B, password: "mal" }, repo, new Perfiles([A, B]), audit)).rejects.toMatchObject({ statusCode: 423 });
    expect(repo.failed.at(-1)).toMatchObject({ reason: "USER_BLOCKED_BY_FAILED_ATTEMPTS", blockUser: true });
    // Bloqueado, ni la contraseña correcta pasa.
    await expect(seleccionarPerfil({ user: sesion("full", A), operacionConfigId: B, password: "correcta" }, repo, new Perfiles([A, B]), audit)).rejects.toMatchObject({ statusCode: 423 });
  });

  it("contraseña correcta: token nuevo, refresh anterior revocado, contador a cero y PERFIL_CAMBIADO", async () => {
    await repo.createRefreshToken({ tokenHash: hashRefreshToken("cookie-vieja"), operacionConfigId: A });
    repo.user = { ...repo.user, failedLoginCount: 2 };
    const r = await seleccionarPerfil(
      { user: sesion("full", A), operacionConfigId: B, password: "correcta", refreshCookie: "cookie-vieja", ip: "127.0.0.1" },
      repo,
      new Perfiles([A, B]),
      audit
    );
    expect(verifyAccessToken(r.response.access_token)).toMatchObject({ scope: "full", uoc: B });
    expect(repo.refresh[0]).toMatchObject({ operacionConfigId: A, revocado: true });
    expect(repo.refresh[1]).toMatchObject({ operacionConfigId: B, revocado: false });
    expect(repo.user.failedLoginCount).toBe(0);
    expect(audit.eventos).toEqual([
      expect.objectContaining({ eventType: "PERFIL_CAMBIADO", metadata: expect.objectContaining({ anterior: A, nuevo: B, origen: "APP", ip: "127.0.0.1" }) })
    ]);
    expect(JSON.stringify(audit.eventos)).not.toContain("correcta");
  });

  it("elegir el perfil ya activo no registra evento", async () => {
    await seleccionarPerfil({ user: sesion("full", A), operacionConfigId: A, password: "correcta" }, repo, new Perfiles([A, B]), audit);
    expect(audit.eventos).toEqual([]);
  });
});

describe("refresh con perfil (§B.5, CA-05)", () => {
  async function conRefresh(uoc: string | null) {
    await repo.createRefreshToken({ tokenHash: hashRefreshToken("cookie"), operacionConfigId: uoc });
  }

  it("conserva el perfil si sigue emitible", async () => {
    await conRefresh(B);
    const r = await refreshSession("cookie", repo, new Perfiles([A, B]), audit);
    expect(verifyAccessToken(r.response.access_token)).toMatchObject({ scope: "full", uoc: B });
    expect(r.refreshToken).not.toBeNull();
    expect(audit.eventos).toEqual([]);
  });

  it("perfil no emitible y dos restantes: SELECT_PERFIL y el refresh rotado queda revocado (D-8)", async () => {
    await conRefresh(AJENO);
    const r = await refreshSession("cookie", repo, new Perfiles([A, B]), audit);
    expect(r.response.pending_actions).toEqual(["SELECT_PERFIL"]);
    expect(r.refreshToken).toBeNull();
    expect(repo.refresh.every((f) => f.revocado)).toBe(true);
  });

  it("perfil no emitible y uno restante: lo asigna, actualiza la fila y registra el evento", async () => {
    await conRefresh(AJENO);
    const r = await refreshSession("cookie", repo, new Perfiles([A]), audit);
    expect(verifyAccessToken(r.response.access_token)).toMatchObject({ uoc: A });
    expect(repo.refresh.at(-1)).toMatchObject({ operacionConfigId: A, revocado: false });
    expect(audit.eventos).toEqual([
      expect.objectContaining({ eventType: "PERFIL_SELECCIONADO", facturadorId: "fac-1", metadata: expect.objectContaining({ origen: "REFRESH" }) })
    ]);
  });

  it("refresh anterior al despliegue (sin perfil) y una configuracion: la asigna (D-6)", async () => {
    await conRefresh(null);
    const r = await refreshSession("cookie", repo, new Perfiles([A]), audit);
    expect(verifyAccessToken(r.response.access_token)).toMatchObject({ uoc: A });
  });

  it("sin configuraciones: sesion completa sin uoc, como antes", async () => {
    await conRefresh(null);
    const r = await refreshSession("cookie", repo, new Perfiles([]), audit);
    expect(verifyAccessToken(r.response.access_token).uoc).toBeUndefined();
    expect(r.refreshToken).not.toBeNull();
  });
});
