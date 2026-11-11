// Movido de main.tsx sin cambios (PLAN_UX_RESTO_APP_v0.1 §10.9, URA-023).
import { type OperationalContextResponse } from "../tipos";
import { firstText } from "./formato";

export function mapBusinessReadinessChecks(
  checks: Array<{
    code: string;
    ok: boolean;
    message: string;
  }>
): Array<{ code: string; ok: boolean; message: string }> {
  const byCode = new Map(checks.map((check) => [check.code, check]));

  const tenant = byCode.get("tenant_activo");
  const suscripcion = byCode.get("suscripcion_activa");
  const facturador = byCode.get("facturador_activo");
  const contexto = byCode.get("fiscal_context_local") ?? byCode.get("contexto_fiscal_local_completo");
  const backendFiscal = byCode.get("fiscal_backend_ready");
  const integracionFiscalOk = Boolean(contexto?.ok) && Boolean(backendFiscal?.ok);

  return [
    {
      code: "membresia_activa",
      ok: tenant?.ok ?? false,
      message: tenant?.ok ? "Membresía activa" : "Membresía inactiva. Contactá a soporte para reactivarla."
    },
    {
      code: "suscripcion_al_dia",
      ok: suscripcion?.ok ?? false,
      message: suscripcion?.ok ? "Suscripción al día" : "Suscripción con pagos pendientes. Regularizá para facturar."
    },
    {
      code: "facturador_activo",
      ok: facturador?.ok ?? false,
      message: facturador?.ok ? "Facturador activo" : "Facturador inactivo. Solicitá activación al administrador."
    },
    {
      code: "operacion_fiscal_habilitada",
      ok: integracionFiscalOk,
      message: integracionFiscalOk
        ? "Conexión fiscal lista"
        : !contexto?.ok
          ? "Faltan datos fiscales. Contactá al equipo de configuración."
          : "Conexión fiscal no disponible. Intentá nuevamente o contactá a soporte."
    }
  ];
}

export function getOperationalTitle(context: OperationalContextResponse | null): string {
  return (
    firstText(
      context?.display?.titulo_operativo,
      context?.fiscal_context.perfil_emision_alias,
      context?.facturador.nombre_fantasia,
      context?.fiscal_context.actividad_economica_alias,
      context?.fiscal_context.actividad_economica_descripcion,
      context?.facturador.razon_social
    ) ?? "Sin facturador asignado"
  );
}
