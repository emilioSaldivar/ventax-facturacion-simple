// Acceso a datos del import: lectura del snapshot y aplicacion transaccional.
//
// SQL propio, calcado de `scripts/sql/alta_facturador.sql` (PLAN seccion 1.4). Los metodos
// existentes de `backoffice.repository.ts` no sirven: hacen `pool.query` sobre conexiones
// distintas y son `insert` puros sin `on conflict`.
//
// REGLA CRITICA: cada `on conflict` declara la MISMA clausula `where` del indice unico
// parcial de la 0004. Sin eso, Postgres no encuentra el arbitro y falla en ejecucion.

import type { PoolClient } from "pg";
import { pool } from "../../../db/pool";
import { withTransaction } from "../../../db/tx";
import { HttpError } from "../../../shared/errors/http-error";
import type { FeConfigFormat } from "./fe-config.parser";
import type { ImportDiff, ImportPlan, ImportSnapshot, ImportTarget } from "./import.types";

export interface ImportApplyResult {
  tenant_id: string;
  facturador_id: string;
  aplicado_en: string;
}

export interface ImportRepository {
  loadSnapshot(target: ImportTarget, emisorId: string, client?: PoolClient): Promise<ImportSnapshot>;
  applyImport(input: {
    plan: ImportPlan;
    target: ImportTarget;
    diff: ImportDiff;
    previewToken: string;
    documentoNroOverrides: Record<string, string>;
    usuarioId: string;
    archivo: { nombre: string; formato: FeConfigFormat };
    payload: unknown;
    ambienteForzado: boolean;
    /** Recalcula el token dentro de la transaccion; si difiere, se rechaza (RN-15). */
    recomputeToken: (snapshot: ImportSnapshot) => string;
  }): Promise<ImportApplyResult>;
}

type Q = Pick<PoolClient, "query">;

async function readSnapshot(q: Q, target: ImportTarget, emisorId: string): Promise<ImportSnapshot> {
  const tenantRes =
    target.mode === "EXISTENTE"
      ? await q.query<{ id: string; nombre: string; slug: string }>(
          `select id, nombre, slug from tenants where id = $1 and deleted_at is null`,
          [target.tenant_id]
        )
      : { rows: [] as Array<{ id: string; nombre: string; slug: string }> };

  if (target.mode === "EXISTENTE" && !tenantRes.rows[0]) {
    throw new HttpError(404, "NOT_FOUND", "Tenant no encontrado.");
  }

  const slugOcupado =
    target.mode === "NUEVO"
      ? ((await q.query(`select 1 from tenants where slug = $1 and deleted_at is null`, [target.slug])).rowCount ?? 0) > 0
      : false;

  const tenantId = target.mode === "EXISTENTE" ? target.tenant_id : null;

  const otroTenant = await q.query<{ tenant_id: string; tenant_nombre: string }>(
    `select f.tenant_id, t.nombre as tenant_nombre
       from facturadores f join tenants t on t.id = f.tenant_id
      where f.emisor_id = $1 and f.deleted_at is null and ($2::uuid is null or f.tenant_id <> $2)
      limit 1`,
    [emisorId, tenantId]
  );

  const facturadorRes = tenantId
    ? await q.query(
        `select id, tenant_id, emisor_id, ruc, razon_social, nombre_fantasia, activo,
                (fe_consumer_api_key is not null) as has_api_key
           from facturadores
          where tenant_id = $1 and emisor_id = $2 and deleted_at is null`,
        [tenantId, emisorId]
      )
    : { rows: [] as any[] };

  const facturador = facturadorRes.rows[0] ?? null;
  const vacio: ImportSnapshot = {
    tenant: tenantRes.rows[0] ?? null,
    facturador,
    establecimientos: [],
    puntos: [],
    actividades: [],
    perfiles: [],
    contextos: [],
    emisorEnOtroTenant: otroTenant.rows[0] ?? null,
    slugOcupado
  };

  if (!facturador) return vacio;

  const fid = facturador.id;
  const [est, ptos, acts, perfs, ctxs] = await Promise.all([
    q.query(`select id, codigo, nombre, direccion, activo from facturador_establecimientos where facturador_id = $1 and deleted_at is null`, [fid]),
    q.query(
      `select p.id, p.codigo, e.codigo as establecimiento_codigo, p.nombre, p.activo
         from facturador_puntos_expedicion p
         join facturador_establecimientos e on e.id = p.establecimiento_id
        where p.facturador_id = $1 and p.deleted_at is null`,
      [fid]
    ),
    q.query(`select id, codigo, descripcion, alias_operativo, activo from facturador_actividades where facturador_id = $1 and deleted_at is null`, [fid]),
    q.query(`select id, codigo, descripcion, activo from facturador_perfiles_emision where facturador_id = $1 and deleted_at is null`, [fid]),
    q.query(
      `select app.id, a.codigo as actividad_codigo, e.codigo as establecimiento_codigo,
              p.codigo as punto_codigo, pe.codigo as perfil_codigo,
              app.timbrado, to_char(app.timbrado_inicio, 'YYYY-MM-DD') as timbrado_inicio,
              app.documento_nro, app.credito_plazo_dias, app.alias_operativo, app.activo,
              (select count(*)::int from usuario_operacion_config uoc
                where uoc.actividad_punto_perfil_id = app.id and uoc.activo = true and uoc.deleted_at is null
              ) as usuarios_asignados
         from actividad_punto_perfiles app
         join facturador_actividades a on a.id = app.actividad_id
         join facturador_establecimientos e on e.id = app.establecimiento_id
         join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
         join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
        where app.facturador_id = $1 and app.deleted_at is null`,
      [fid]
    )
  ]);

  return {
    ...vacio,
    establecimientos: est.rows as ImportSnapshot["establecimientos"],
    puntos: ptos.rows as ImportSnapshot["puntos"],
    actividades: acts.rows as ImportSnapshot["actividades"],
    perfiles: perfs.rows as ImportSnapshot["perfiles"],
    contextos: ctxs.rows as ImportSnapshot["contextos"]
  };
}

export class PgImportRepository implements ImportRepository {
  async loadSnapshot(target: ImportTarget, emisorId: string, client?: PoolClient): Promise<ImportSnapshot> {
    return readSnapshot(client ?? pool, target, emisorId);
  }

  async applyImport(input: Parameters<ImportRepository["applyImport"]>[0]): Promise<ImportApplyResult> {
    const { plan, target, documentoNroOverrides } = input;

    return withTransaction(async (client) => {
      // RN-14: serializa imports concurrentes del mismo emisor.
      const clave = `${target.mode === "EXISTENTE" ? target.tenant_id : target.slug}:${plan.emisor.emisor_id}`;
      await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [clave]);

      // RN-15: el estado pudo cambiar entre la vista previa y la confirmacion.
      const actual = await readSnapshot(client, target, plan.emisor.emisor_id);
      if (input.recomputeToken(actual) !== input.previewToken) {
        throw new HttpError(409, "CONFLICT", "Los datos cambiaron desde la vista previa. Volve a previsualizar.", {
          motivo: "PREVIEW_DESACTUALIZADO"
        });
      }

      // ── 1. Tenant + suscripcion (solo modo NUEVO) ──────────────────────────
      let tenantId: string;
      if (target.mode === "NUEVO") {
        const t = await client.query<{ id: string }>(
          `insert into tenants (nombre, slug, estado, activo) values ($1, $2, 'ACTIVO', true) returning id`,
          [target.nombre, target.slug]
        );
        tenantId = t.rows[0]!.id;
        const plan_ = await client.query<{ id: string }>(
          `select id from planes where codigo = $1 and activo = true and deleted_at is null`,
          [target.plan_codigo]
        );
        if (!plan_.rows[0]) throw new HttpError(404, "NOT_FOUND", `Plan "${target.plan_codigo}" no encontrado.`);
        await client.query(
          `insert into tenant_suscripciones (tenant_id, plan_id, estado, activo) values ($1, $2, 'ACTIVA', true)`,
          [tenantId, plan_.rows[0].id]
        );
      } else {
        tenantId = target.tenant_id;
      }

      // ── 2. Facturador ──────────────────────────────────────────────────────
      // El `ruc` NO se pisa si el facturador ya existe (advertencia RUC_DISTINTO).
      const f = await client.query<{ id: string }>(
        `insert into facturadores (tenant_id, emisor_id, razon_social, ruc, nombre_fantasia, activo)
         values ($1, $2, $3, $4, $5, true)
         on conflict (tenant_id, emisor_id) where deleted_at is null
         do update set razon_social = excluded.razon_social,
                       nombre_fantasia = coalesce(excluded.nombre_fantasia, facturadores.nombre_fantasia),
                       activo = true,
                       updated_at = now()
         returning id`,
        [tenantId, plan.emisor.emisor_id, plan.emisor.razon_social, plan.emisor.ruc, plan.emisor.nombre_fantasia]
      );
      const facturadorId = f.rows[0]!.id;

      // ── 3. Establecimientos ────────────────────────────────────────────────
      for (const e of plan.establecimientos) {
        await client.query(
          `insert into facturador_establecimientos (tenant_id, facturador_id, codigo, nombre, direccion, activo)
           values ($1, $2, $3, $4, $5, true)
           on conflict (facturador_id, codigo) where deleted_at is null
           do update set nombre = coalesce(excluded.nombre, facturador_establecimientos.nombre),
                         direccion = coalesce(excluded.direccion, facturador_establecimientos.direccion),
                         activo = true, updated_at = now()`,
          [tenantId, facturadorId, e.codigo, e.nombre, e.direccion]
        );
      }

      // ── 4. Puntos de expedicion ────────────────────────────────────────────
      for (const p of plan.puntos) {
        await client.query(
          `insert into facturador_puntos_expedicion (tenant_id, facturador_id, establecimiento_id, codigo, nombre, activo)
           select $1, $2, e.id, $4, $5, true
             from facturador_establecimientos e
            where e.facturador_id = $2 and e.codigo = $3 and e.deleted_at is null
           on conflict (establecimiento_id, codigo) where deleted_at is null
           do update set nombre = coalesce(excluded.nombre, facturador_puntos_expedicion.nombre),
                         activo = true, updated_at = now()`,
          [tenantId, facturadorId, p.establecimiento_codigo, p.codigo, p.nombre]
        );
      }

      // ── 5. Actividades (alias solo al crear) ───────────────────────────────
      for (const a of plan.actividades) {
        await client.query(
          `insert into facturador_actividades (tenant_id, facturador_id, codigo, descripcion, alias_operativo, activo)
           values ($1, $2, $3, $4, $5, true)
           on conflict (facturador_id, codigo) where deleted_at is null
           do update set descripcion = coalesce(excluded.descripcion, facturador_actividades.descripcion),
                         alias_operativo = coalesce(facturador_actividades.alias_operativo, excluded.alias_operativo),
                         activo = true, updated_at = now()`,
          [tenantId, facturadorId, a.codigo, a.descripcion, a.alias_operativo]
        );
      }

      // ── 6. Perfiles de emision ─────────────────────────────────────────────
      for (const pe of plan.perfiles) {
        await client.query(
          `insert into facturador_perfiles_emision (tenant_id, facturador_id, codigo, descripcion, activo)
           values ($1, $2, $3, $4, true)
           on conflict (facturador_id, codigo) where deleted_at is null
           do update set descripcion = coalesce(excluded.descripcion, facturador_perfiles_emision.descripcion),
                         activo = true, updated_at = now()`,
          [tenantId, facturadorId, pe.codigo, pe.descripcion]
        );
      }

      // ── 7. Contextos operativos ────────────────────────────────────────────
      // `documento_nro` con coalesce: la numeracion viva nunca se pisa (RN-09).
      // `credito_plazo_dias` y `tipo_transaccion_default` no se tocan en update.
      for (const c of plan.contextos) {
        const documentoNro = documentoNroOverrides[c.perfil_codigo] ?? c.documento_nro_sugerido;
        await client.query(
          `insert into actividad_punto_perfiles (
             tenant_id, facturador_id, actividad_id, establecimiento_id, punto_expedicion_id, perfil_emision_id,
             timbrado, timbrado_inicio, documento_nro, credito_plazo_dias, alias_operativo, activo)
           select $1, $2, a.id, e.id, p.id, pe.id, $7, $8::date, $9, $10, $11, true
             from facturador_actividades a
             join facturador_establecimientos e on e.facturador_id = a.facturador_id and e.codigo = $4 and e.deleted_at is null
             join facturador_puntos_expedicion p on p.establecimiento_id = e.id and p.codigo = $5 and p.deleted_at is null
             join facturador_perfiles_emision pe on pe.facturador_id = a.facturador_id and pe.codigo = $6 and pe.deleted_at is null
            where a.facturador_id = $2 and a.codigo = $3 and a.deleted_at is null
           on conflict (actividad_id, establecimiento_id, punto_expedicion_id, perfil_emision_id) where deleted_at is null
           do update set timbrado = coalesce(excluded.timbrado, actividad_punto_perfiles.timbrado),
                         timbrado_inicio = coalesce(excluded.timbrado_inicio, actividad_punto_perfiles.timbrado_inicio),
                         documento_nro = coalesce(actividad_punto_perfiles.documento_nro, excluded.documento_nro),
                         alias_operativo = coalesce(actividad_punto_perfiles.alias_operativo, excluded.alias_operativo),
                         activo = true, updated_at = now()`,
          [
            tenantId, facturadorId, c.actividad_codigo, c.establecimiento_codigo, c.punto_codigo, c.perfil_codigo,
            c.timbrado, c.timbrado_inicio, documentoNro, c.credito_plazo_dias, c.alias_operativo
          ]
        );
      }

      // ── 8. Auditoria ───────────────────────────────────────────────────────
      await client.query(
        `insert into facturador_import_eventos
           (tenant_id, facturador_id, usuario_id, archivo_nombre, archivo_formato, contrato_version,
            generado_en, ambiente_forzado, payload, resumen)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)`,
        [
          tenantId, facturadorId, input.usuarioId, input.archivo.nombre, input.archivo.formato,
          plan.contrato.version, plan.contrato.generado_en, input.ambienteForzado,
          JSON.stringify(input.payload), JSON.stringify(input.diff.resumen)
        ]
      );

      return { tenant_id: tenantId, facturador_id: facturadorId, aplicado_en: new Date().toISOString() };
    });
  }
}

export const importRepository = new PgImportRepository();
