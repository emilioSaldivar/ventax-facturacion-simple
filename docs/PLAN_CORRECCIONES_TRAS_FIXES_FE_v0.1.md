# PLAN Correcciones de FS tras los fixes de FE v0.1

**Fecha:** 2026-11-06. **SPEC:** `docs/SPEC_CORRECCIONES_TRAS_FIXES_FE_v0.1.md`.

## 1. Orden

| Paso | Que | Depende de |
|---|---|---|
| 1 | FS-24: codigo y pruebas unitarias | Nada |
| 2 | FS-25: confirmar el `401` en local y retirar | D-1 del usuario |
| 3 | Validacion conjunta de FS-20, FS-21, FS-23 y FS-24 en un stack local | Tag de FE con H09, FE-02 y `RECONCILE_DEFERRED_ENABLED` |
| 4 | Plantillas y scripts de `segel-fs` | Tag de FE |
| 5 | Despliegue en `segel-fs` | Confirmacion directa del usuario |

Los pasos 1 y 2 no dependen de FE y se pueden hacer ya. Nada se prueba en `segel-fs`.

## 2. FS-20, FS-21 y FS-23: ya implementados

Commit `2b1eed9`. No se reescriben.

| Error | Donde |
|---|---|
| FS-20 | `extraerMotivoRechazo` y `getMotivoRechazo` en `fiscal-gateway.client.ts`; uso en `refreshFiscalStatusForDocumento` (`facturas.service.ts`) |
| FS-21 | `mapDocumentStatusWithCode` en `fiscal-gateway.client.ts` |
| FS-23 | Mensaje en `apps/web-operacion/src/main.tsx`; log `segundos_desde_creacion` en la cancelacion (`facturas.service.ts`) |

Falta: validarlos contra FE real en local (paso 3) y, para FS-23, una captura de Playwright del mensaje.

## 3. FS-24: diseno

**Configuracion.** `VERIFICACION_LOTE_SIN_REFRESH` en `apps/api/src/config/env.ts`, `false` por defecto. `server.ts` la pasa al worker. Se suma a `infra/segel-fs/fs.env.example` en `false`, porque `RECONCILE_DEFERRED_ENABLED` queda apagada (`SPEC_DESPLIEGUE_SEGEL_FS_v0.2`, D-5).

**Servicio.** `refreshFiscalStatusForDocumento` recibe una opcion `omitirRefreshEnLote`, `false` por defecto. El refresh manual (`facturas.service.ts:225`) y la reconciliacion (`:443`) no la pasan: no cambian.

Con la opcion en `true`:

1. Lee el estado canonico (`getDocumentoCanonico`).
2. Si `status` es `SENT_BATCH` o `QUEUED_BATCH`: no llama a `refreshFacturaStatus`. Guarda estado, `fiscal_status_raw` y `sifen_last_checked_at`. No toca `sifen_result_code` ni el mensaje.
3. Con otro `status`: sigue el flujo actual, con `refresh` y una segunda lectura canonica. Es una lectura mas que hoy, solo en ese caso.

Efecto lateral buscado: un documento en `QUEUED_BATCH` deja de hacer una consulta con `refresh` que FE responde siempre con `409`.

**Worker** (`verificacion.worker.ts`).

- Constantes nuevas: `ESTADO_EN_LOTE = "SENT_BATCH"`, `INTERVALO_EN_LOTE_MS` de 15 min y `HORAS_MAXIMAS_EN_LOTE = 48`.
- Con estado canonico `SENT_BATCH` y menos de 48 h desde `created_at`, con o sin bandera (RN-24.0): reprograma a 15 min y conserva los intentos tal como estaban antes de reclamar. Hoy el reclamo ya suma uno: se escribe `item.attempts - 1`, con minimo 0.
- En cualquier otro caso, el codigo actual.
- Si la lectura falla, `estadoCanonico` queda nulo y rige el backoff (CA-24.5).

**Carga esperada.** Una lectura a FE por documento en lote cada 15 min. Sin llamadas a SIFEN desde el worker para esos documentos.

**Pruebas** en `apps/api/tests/verificacion.worker.test.ts` y `facturas.service.test.ts`: un caso por criterio CA-24.1 a CA-24.6.

## 4. FS-25: diseno (si D-1 es retirar)

1. **Confirmar primero.** Stack local con FE en `APP_ENV=production` y un facturador de prueba. Llamar las 6 rutas de FS con un usuario interno y registrar la respuesta. Si alguna no da error de autenticacion, parar.
2. **Interfaz** (`apps/web-operacion/src/main.tsx`): quitar el bloque "Administracion fiscal" de `DocumentsView`, sus estados (`decision`, `cdcImpact`), las funciones que llaman a `/gestion/...` y los tipos que queden sin uso. Se conservan los paneles de lotes pendientes y de reconciliacion.
3. **API:** quitar las 6 rutas de `facturas.routes.ts`, sus funciones de `facturas.service.ts` (incluido `assertWithinWindowOrThrow` si queda sin uso), los 6 metodos `...ByDocumentId` de `FiscalGateway`, del mock y del cliente real, y sus tipos.
4. **Contrato:** quitar las 6 rutas de `spec/openapi.yaml`.
5. **Pruebas:** quitar las de esas funciones; conservar y correr `auth.roles.test.ts`.
6. **Auditoria:** los eventos `FACTURA_GESTION_*` ya guardados no se tocan.

Si D-1 es darles autenticacion, este diseno no aplica: hay que acordar con FE un contrato para consumidores y volver al SPEC.

## 5. Plantillas y scripts, al llegar el tag de FE

- `infra/segel-fs/fe.env.example`: sumar `SIFEN_CONSULT_DETECTS_CANCEL_ENABLED=false` y `RECONCILE_DEFERRED_ENABLED=true`, con sus parametros por defecto comentados.
- `infra/segel-fs/fs.env.example`: `VERIFICACION_LOTE_SIN_REFRESH=true`.
- `FE_REF` por defecto en `build-images.sh` y `deploy.sh`: el tag nuevo.
- `docs/OPERACION_DESPLIEGUE_SEGEL_FS_v0.1.md`: las dos banderas se encienden juntas; migraciones de FE pasan a 44.

## 6. Validacion

- `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- Stack local con `bash scripts/deploy.sh`, FE en el tag nuevo y SIFEN test:
  - FS-20: emitir a un receptor que SIFEN test rechaza con `1306` y verificar el mensaje antes y despues de "Verificar".
  - FS-21: prueba unitaria. No se fuerza en SIFEN.
  - FS-23: cancelaciones reales, en serie. Un `0100` no se puede provocar: si aparece, se registra.
  - FS-24: con el simulador de FE, un lote que queda en `0361` y se aprueba despues.
- Playwright, mobile 390 px y desktop 1280 px: detalle de un documento rechazado, mensaje de `0100`, y detalle con rol interno sin las 6 acciones.

## 7. Riesgos

| Riesgo | Mitigacion |
|---|---|
| Encender `VERIFICACION_LOTE_SIN_REFRESH` con la bandera de FE apagada deja documentos sin destrabar | Las dos van juntas en la plantilla y en el runbook. Apagada por defecto |
| El tag de FE cambia la forma del motivo guardado | FS-20 lee dos formas y cae a `0420`. Se valida en el paso 3 |
| Soporte usaba alguna de las 6 acciones | El paso 1 de FS-25 lo confirma antes de borrar |
| Un `SENT_BATCH` eterno se consulta cada 15 min sin fin | Tope de 48 h, y corte de 30 dias |
