# TASKS Recibo de Dinero v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RECIBO_DINERO_v0.1.md`
- `docs/PLAN_RECIBO_DINERO_v0.1.md`
- `spec/openapi.yaml`

## Descripcion del modulo

Modulo para emitir **Recibos de Dinero** que acreditan el cobro de un importe. Puede originarse desde:

1. **Desde una factura a credito** — boton `Emitir recibo` en el detalle de la factura crédito; pre-llena importe, cliente y referencia.
2. **Desde el modulo propio** — listado y alta independiente para cobros no vinculados a una factura especifica.

El recibo NO es un comprobante fiscal. No interactua con SIFEN ni con facturacion-electronica.

### Estructura del documento

| Seccion | Descripcion |
|---|---|
| Encabezado | Datos del facturador (nombre, RUC, direccion, telefono, email, logo) |
| Numero y fecha | Numero correlativo + fecha y hora de emision |
| Recibido de | Nombre / RUC / CI del pagador |
| Concepto | Descripcion libre del cobro |
| Referencia | Numero de factura vinculada (opcional, si viene de factura credito) |
| Importe | Monto recibido en guaranies (o moneda configurada) |
| Forma de pago | Efectivo / Transferencia / Cheque / Tarjeta / Otro |
| Pie | Firma del emisor, nota de validez |

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
|---|---|---|---|---|
| RD-001 | SDD | Crear SPEC del modulo | DONE | Existe `docs/SPEC_RECIBO_DINERO_v0.1.md` con modelo de datos, estructura PDF, verificacion QR, estados, reglas de vinculacion a factura credito y API REST |
| RD-002 | SDD | Crear PLAN de implementacion | DONE | Existe `docs/PLAN_RECIBO_DINERO_v0.1.md` con fases, archivos a crear/modificar y orden de ejecucion |
| RD-003 | DB | Migracion: tabla `recibos_dinero` | DONE | Nueva tabla con `facturador_id`, `numero`, `fecha_emision`, `pagador_nombre`, `pagador_documento_tipo`, `pagador_documento`, `concepto`, `importe`, `forma_pago`, `factura_id` (nullable FK a `facturas`), `estado`, timestamps |
| RD-004 | DB | Migracion: secuencia de numeracion de recibos por facturador | DONE | `recibos_dinero_numeracion` tabla creada en `0023_recibos_dinero.sql`; numeracion atomica via INSERT ON CONFLICT en `emitir()` |
| RD-005 | API — tipos | Definir tipos TypeScript del modulo | DONE | `apps/api/src/modules/recibos/recibos.types.ts` creado con `ReciboEstado`, `ReciboFormaPago`, `ReciboRecord`, `ReciboCreateInput`, `ReciboUpdateInput`, `RecibosRepository` |
| RD-006 | API — repository | Implementar `RecibosRepository` con PostgreSQL | DONE | `apps/api/src/modules/recibos/recibos.repository.ts` creado; CRUD completo, `emitir()` con transaccion atomica, `listByFactura()`, `getFacturadorParaPdf()` |
| RD-007 | API — service | Implementar `RecibosService` con reglas de negocio | DONE | `apps/api/src/modules/recibos/recibos.service.ts` creado; validaciones: importe > 0, pagador requerido, 409 en estado EMITIDO para update/delete/emitir |
| RD-008 | API — PDF | Generar PDF de recibo | DONE | `apps/api/src/modules/recibos/recibos.pdf.ts` creado; formato A5/media carta, QR, importe en letras via `shared/utils/numero-letras.ts`, 6 formas de pago |
| RD-009 | API — routes | Implementar rutas REST del modulo | DONE | `apps/api/src/modules/recibos/recibos.routes.ts` creado; 7 endpoints registrados en `app.ts`: POST/GET /recibos, GET/PATCH/DELETE /recibos/:id, POST /recibos/:id/emitir, GET /recibos/:id/pdf |
| RD-010 | API — integracion factura | Ruta para crear recibo desde factura credito | DONE | `POST /facturas/:id/recibo` implementado en `recibos.routes.ts`; valida condicion_venta = CREDITO, pre-llena razon_social, documento, total e numero_fiscal |
| RD-011 | API — contrato | Documentar endpoints en `spec/openapi.yaml` | DONE | 7 paths agregados (tag `Recibos`), parametro `ReciboId`, 7 schemas: `ReciboFormaPago`, `ReciboRecord`, `ReciboListResponse`, `ReciboCreateRequest`, `ReciboUpdateRequest`, `ReciboVerificacionResponse`; YAML valido |
| RD-012 | Frontend — listado | Vista de listado de recibos | DONE | `RecibosView` agregada a `main.tsx`; menu lateral "Cobros / Recibos"; lista con estado, importe, pagador, forma de pago |
| RD-013 | Frontend — nueva recibo | Formulario de alta directa | DONE | Formulario completo: fecha cobro, pagador, documento, concepto, importe, forma de pago, referencia bancaria; opciones "Guardar borrador" y "Guardar y emitir" |
| RD-014 | Frontend — desde factura | Boton `Emitir recibo` en detalle de factura credito | DONE | Boton "Emitir recibo de cobro" en panel de acciones secundarias de `DocumentsView`; visible solo para facturas CREDITO; llama `POST /facturas/:id/recibo` y navega a RecibosView |
| RD-015 | Frontend — emitir y PDF | Flujo de emision y descarga | DONE | Sub-view "detail" con boton "Emitir" (con confirmacion) y "Descargar PDF" para recibos EMITIDOS |
| RD-016 | QA | Tests del service | DONE | `apps/api/tests/recibos.service.test.ts`; 16 tests, todos verdes: validacion importe, create, emitir (exitoso/404/409), update (409 si emitido), delete (409 si emitido), verificar (valido/borrador/inexistente) |
| RD-017 | QA | Validacion typecheck + build | DONE | `npm run typecheck` pasa en `apps/api` y `apps/web-operacion` sin errores. Tests pre-existentes de facturas.service y entrega.service fallaban antes de este modulo (no relacionados). |

## Notas de producto

- Un recibo vinculado a factura hereda: nombre del cliente, RUC/CI, importe total de la factura, y numero de factura como referencia.
- El importe en el recibo puede ser parcial (pago parcial de factura credito) — se define en SPEC.
- La factura credito puede tener multiples recibos emitidos (pagos parciales) — se define en SPEC.
- `forma_pago` por defecto: Efectivo. Opciones: Efectivo, Transferencia Bancaria, Cheque, Tarjeta de Credito, Tarjeta de Debito, Otro.
- El numero de recibo es independiente de la numeracion de facturas y de notas.

## Evidencia

- 2026-06-23: backlog creado.
- 2026-06-24: SPEC redactado en `docs/SPEC_RECIBO_DINERO_v0.1.md`. Incluye modelo de datos, tabla de numeracion, formas de pago, estructura PDF con importe en letras, sistema de verificacion QR publico, flujo desde factura credito, API REST y criterios de aceptacion. RD-001 → DONE.
- 2026-06-24: PLAN redactado en `docs/PLAN_RECIBO_DINERO_v0.1.md`. Detalla migracion SQL, modulos API, reutilizacion de pdf.service.ts y verificacion.routes.ts del modulo Notas, integracion en detalle factura credito y orden de ejecucion. RD-002 → DONE.
- 2026-06-25: Implementacion completa RD-003 a RD-017. Modulo Recibo de Dinero en produccion: migracion SQL, repository, service, PDF (formato A5, QR, importe en letras), rutas REST, integracion con factura credito, RecibosView en frontend, OpenAPI documentado. `numeroALetras` movida a `shared/utils/numero-letras.ts` — ambos modulos (Notas y Recibos) importan desde ahi. 16/16 tests verdes. typecheck limpio en api y web-operacion.
