import { pool } from "../../db/pool";
import { withTransaction } from "../../db/tx";
import { resolverEstadoFactura } from "./cargas.mapeo";
import type { DocumentoEstado } from "../facturas/facturas.types";
import type { CargaMasivaRecord, CargaRepository } from "./cargas.types";

const SELECT_CARGA = `
  select
    c.*,
    coalesce(us.display_name, us.username) as subida_por_nombre,
    coalesce(uc.display_name, uc.username) as confirmada_por_nombre,
    coalesce(ux.display_name, ux.username) as cancelada_por_nombre
  from cargas_masivas c
  left join usuarios us on us.id = c.subida_por
  left join usuarios uc on uc.id = c.confirmada_por
  left join usuarios ux on ux.id = c.cancelada_por
`;

function normalizar(row: CargaMasivaRecord): CargaMasivaRecord {
  return { ...row, tamano_bytes: Number(row.tamano_bytes) };
}

export class PgCargaRepository implements CargaRepository {
  async findById(id: string, facturadorId: string) {
    const result = await pool.query<CargaMasivaRecord>(`${SELECT_CARGA} where c.id = $1 and c.facturador_id = $2`, [id, facturadorId]);
    return result.rows[0] ? normalizar(result.rows[0]) : null;
  }

  async findActivaPorSha(facturadorId: string, sha256: string) {
    const result = await pool.query<CargaMasivaRecord>(
      `${SELECT_CARGA}
       where c.facturador_id = $1 and c.sha256 = $2 and c.estado not in ('RECHAZADA', 'CANCELADA')
       order by c.created_at desc limit 1`,
      [facturadorId, sha256]
    );
    return result.rows[0] ? normalizar(result.rows[0]) : null;
  }

  async findByFeCargaId(facturadorId: string, feCargaId: string) {
    const result = await pool.query<CargaMasivaRecord>(`${SELECT_CARGA} where c.facturador_id = $1 and c.fe_carga_id = $2`, [facturadorId, feCargaId]);
    return result.rows[0] ? normalizar(result.rows[0]) : null;
  }

  async crear(input: Parameters<CargaRepository["crear"]>[0]) {
    const { feCarga } = input;
    await pool.query(
      `insert into cargas_masivas (
         tenant_id, facturador_id, actividad_punto_perfil_id, fe_carga_id, nombre_archivo, tamano_bytes, sha256,
         numeracion, estado, totales, acciones, motivos, fe_snapshot, subida_por, sync_next_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15)
       on conflict (facturador_id, fe_carga_id) do nothing`,
      [
        input.tenantId,
        input.facturadorId,
        input.actividadPuntoPerfilId,
        feCarga.carga_id,
        feCarga.nombre_archivo,
        input.tamanoBytes,
        input.sha256,
        feCarga.numeracion,
        feCarga.estado,
        JSON.stringify(feCarga.totales),
        JSON.stringify(feCarga.acciones),
        JSON.stringify(feCarga.motivos ?? []),
        JSON.stringify(feCarga),
        input.subidaPor,
        input.syncNextAt
      ]
    );
    const creada = await this.findByFeCargaId(input.facturadorId, feCarga.carga_id);
    return creada!;
  }

  async list(facturadorId: string, filtros: Parameters<CargaRepository["list"]>[1]) {
    const params: unknown[] = [facturadorId];
    const clauses = ["c.facturador_id = $1"];
    if (filtros.actividadPuntoPerfilId) {
      params.push(filtros.actividadPuntoPerfilId);
      clauses.push(`c.actividad_punto_perfil_id = $${params.length}`);
    }
    if (filtros.estados?.length) {
      params.push(filtros.estados);
      clauses.push(`c.estado = any($${params.length}::text[])`);
    }
    const fecha = "(c.created_at at time zone 'America/Asuncion')::date";
    if (filtros.desde) {
      params.push(filtros.desde);
      clauses.push(`${fecha} >= $${params.length}::date`);
    }
    if (filtros.hasta) {
      params.push(filtros.hasta);
      clauses.push(`${fecha} <= $${params.length}::date`);
    }
    const where = clauses.join(" and ");
    const total = await pool.query<{ total: string }>(`select count(*) as total from cargas_masivas c where ${where}`, params);
    const filas = await pool.query<CargaMasivaRecord>(
      `${SELECT_CARGA} where ${where} order by c.created_at desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, filtros.limit, filtros.offset]
    );
    return { items: filas.rows.map(normalizar), total: Number(total.rows[0]?.total ?? 0) };
  }

  async actualizarDesdeFe(id: string, feCarga: Parameters<CargaRepository["actualizarDesdeFe"]>[1], cambios: Parameters<CargaRepository["actualizarDesdeFe"]>[2] = {}) {
    await pool.query(
      `update cargas_masivas set
         estado = $2,
         totales = $3::jsonb,
         acciones = $4::jsonb,
         motivos = $5::jsonb,
         fe_snapshot = fe_snapshot || $6::jsonb,
         sincronizada_en = now(),
         sync_error = null,
         confirmada_por = coalesce($7, confirmada_por),
         cancelada_por = coalesce($8, cancelada_por),
         sync_next_at = case when $9::boolean then $10::timestamptz else sync_next_at end
       where id = $1`,
      [
        id,
        feCarga.estado,
        JSON.stringify(feCarga.totales),
        JSON.stringify(feCarga.acciones),
        JSON.stringify(feCarga.motivos ?? []),
        JSON.stringify(feCarga),
        cambios.confirmadaPor ?? null,
        cambios.canceladaPor ?? null,
        cambios.syncNextAt !== undefined,
        cambios.syncNextAt ?? null
      ]
    );
  }

  async marcarSyncError(id: string, mensaje: string, syncNextAt?: Date) {
    await pool.query(
      `update cargas_masivas set sync_error = $2, sync_next_at = coalesce($3, sync_next_at) where id = $1`,
      [id, mensaje.slice(0, 500), syncNextAt ?? null]
    );
  }

  async finalizarSync(id: string, cambios: { sincronizadaHasta: string | null; syncNextAt: Date | null }) {
    await pool.query(
      `update cargas_masivas set
         sincronizada_hasta = greatest(sincronizada_hasta, $2::timestamptz),
         sync_next_at = $3
       where id = $1`,
      [id, cambios.sincronizadaHasta, cambios.syncNextAt]
    );
  }

  async claimNextCargasSync(limit: number) {
    // Si el proceso muere en medio de la pasada, la carga vuelve a tomarse en 10 minutos.
    const result = await pool.query<{ id: string; facturador_id: string }>(
      `with siguientes as (
         select id from cargas_masivas
         where sync_next_at <= now()
         order by sync_next_at asc
         limit $1
         for update skip locked
       )
       update cargas_masivas c
       set sync_next_at = now() + interval '10 minutes'
       from siguientes s
       where c.id = s.id
       returning c.id, c.facturador_id`,
      [limit]
    );
    const cargas = await Promise.all(result.rows.map((row) => this.findById(row.id, row.facturador_id)));
    return cargas.filter((carga): carga is CargaMasivaRecord => carga !== null);
  }

  async registrarEvento(carga: Parameters<CargaRepository["registrarEvento"]>[0], usuarioId: string | null, tipo: Parameters<CargaRepository["registrarEvento"]>[2], metadata: Record<string, unknown> = {}) {
    await pool.query(
      `insert into audit_events (tenant_id, facturador_id, usuario_id, entity_type, entity_id, event_type, metadata)
       values ($1, $2, $3, 'carga_masiva', $4, $5, $6::jsonb)`,
      [carga.tenant_id, carga.facturador_id, usuarioId, carga.id, tipo, JSON.stringify(metadata)]
    );
  }

  async getFacturadorApiKey(facturadorId: string) {
    const result = await pool.query<{ fe_consumer_api_key: string | null }>("select fe_consumer_api_key from facturadores where id = $1", [facturadorId]);
    return result.rows[0]?.fe_consumer_api_key ?? null;
  }

  async documentosPorUuid(facturadorId: string, uuids: string[]) {
    const mapa = new Map<string, string>();
    if (uuids.length === 0) return mapa;
    const result = await pool.query<{ id: string; document_uuid: string }>(
      `select id, document_uuid from facturas_operativas
       where facturador_id = $1 and document_uuid = any($2::text[]) and deleted_at is null`,
      [facturadorId, uuids]
    );
    for (const row of result.rows) mapa.set(row.document_uuid, row.id);
    return mapa;
  }

  async contarCorreosPendientes(carga: Pick<CargaMasivaRecord, "id" | "facturador_id" | "fe_carga_id">): Promise<number> {
    const result = await pool.query<{ total: string }>(
      `select count(*) as total from facturas_operativas
       where facturador_id = $1 and carga_masiva_id = $2 and email_estado = 'PENDING' and deleted_at is null`,
      [carga.facturador_id, carga.id]
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async incorporarFacturas(carga: CargaMasivaRecord, facturas: Parameters<CargaRepository["incorporarFacturas"]>[1]) {
    if (facturas.length === 0) return;
    await withTransaction(async (client) => {
      for (const factura of facturas) {
        const existente = await client.query<{ id: string; estado: DocumentoEstado }>(
          `select id, estado from facturas_operativas
           where facturador_id = $1 and external_ref = $2 and deleted_at is null
           for update`,
          [carga.facturador_id, factura.externalRef]
        );

        if (existente.rows[0]) {
          const { id, estado } = existente.rows[0];
          const nuevo = resolverEstadoFactura(estado, factura);
          // Un estado que no cambia conserva lo que ya estaba: una ANULADA no se pisa con el rechazo o la aprobacion original.
          const cambiaEstado = nuevo === factura.estado;
          await client.query(
            `update facturas_operativas set
               estado = $2,
               document_uuid = coalesce(document_uuid, $3),
               cdc = coalesce($4, cdc),
               numero_fiscal = coalesce($5, numero_fiscal),
               email_estado = coalesce($6, email_estado),
               fiscal_status_raw = case when $7::boolean then $8 else fiscal_status_raw end,
               sifen_result_code = case when $7::boolean then coalesce($9, sifen_result_code) else sifen_result_code end,
               sifen_result_message = case when $7::boolean then coalesce($10, sifen_result_message) else sifen_result_message end,
               emitted_at = case when $7::boolean and $2 = 'EMITIDA' then coalesce($11::timestamptz, emitted_at) else emitted_at end,
               sifen_last_checked_at = $12::timestamptz,
               fiscal_response_snapshot = $13::jsonb,
               updated_at = now()
             where id = $1`,
            [
              id,
              nuevo,
              factura.documentUuid,
              factura.cdc,
              factura.numeroFiscal,
              factura.emailEstado,
              cambiaEstado,
              factura.fiscalStatusRaw,
              factura.sifenCodigo,
              factura.sifenMensaje,
              factura.aprobadoEn,
              factura.actualizadoEn,
              JSON.stringify(factura.responseSnapshot)
            ]
          );
          continue;
        }

        // RN-17: sin `verificacion_next_at`. RN-16: no toca agenda ni catalogo.
        const insertada = await client.query<{ id: string }>(
          `insert into facturas_operativas (
             tenant_id, facturador_id, usuario_id, actividad_punto_perfil_id, tipo, condicion_venta, estado, external_ref,
             cliente_snapshot, totals_snapshot, fiscal_request_snapshot, fiscal_response_snapshot,
             document_uuid, cdc, numero_fiscal, email_estado, fiscal_status_raw, sifen_result_code, sifen_result_message,
             sifen_last_checked_at, emitted_at, carga_masiva_id, carga_numero_archivo
           )
           values ($1, $2, $3, $4, 'FACTURA', $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17, $18, $19::timestamptz, $20::timestamptz, $21, $22)
           returning id`,
          [
            carga.tenant_id,
            carga.facturador_id,
            carga.confirmada_por ?? carga.subida_por,
            carga.actividad_punto_perfil_id,
            factura.condicionVenta,
            factura.estado,
            factura.externalRef,
            JSON.stringify(factura.cliente),
            JSON.stringify(factura.totals),
            JSON.stringify(factura.requestSnapshot),
            JSON.stringify(factura.responseSnapshot),
            factura.documentUuid,
            factura.cdc,
            factura.numeroFiscal,
            factura.emailEstado,
            factura.fiscalStatusRaw,
            factura.sifenCodigo,
            factura.sifenMensaje,
            factura.actualizadoEn,
            factura.estado === "EMITIDA" ? factura.aprobadoEn : null,
            carga.id,
            factura.numeroArchivo
          ]
        );
        const facturaId = insertada.rows[0]!.id;
        for (const item of factura.items) {
          await client.query(
            `insert into factura_items_snapshot (
               tenant_id, facturador_id, factura_operativa_id, catalogo_item_id, line_no, codigo, descripcion,
               cantidad, precio_unitario, iva_tipo, subtotal, base_imponible, iva_monto
             )
             values ($1, $2, $3, null, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              carga.tenant_id,
              carga.facturador_id,
              facturaId,
              item.line_no,
              item.codigo,
              item.descripcion,
              item.cantidad,
              item.precio_unitario,
              item.iva_tipo,
              item.subtotal,
              item.base_imponible,
              item.iva_monto
            ]
          );
        }
      }
    });
  }
}

export const cargaRepository = new PgCargaRepository();
