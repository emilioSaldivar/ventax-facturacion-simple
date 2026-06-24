# TASKS Recibo de Dinero v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RECIBO_DINERO_v0.1.md` (PENDIENTE — crear antes de implementar)
- `docs/PLAN_RECIBO_DINERO_v0.1.md` (PENDIENTE — crear antes de implementar)
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
| RD-001 | SDD | Crear SPEC del modulo con ejemplo PDF del cliente | PENDIENTE | Existe `docs/SPEC_RECIBO_DINERO_v0.1.md` con modelo de datos, estructura PDF, reglas de vinculacion a factura credito y estados |
| RD-002 | SDD | Crear PLAN de implementacion | PENDIENTE | Existe `docs/PLAN_RECIBO_DINERO_v0.1.md` con fases, archivos a crear/modificar y orden de ejecucion |
| RD-003 | DB | Migracion: tabla `recibos_dinero` | PENDIENTE | Nueva tabla con `facturador_id`, `numero`, `fecha_emision`, `pagador_nombre`, `pagador_documento_tipo`, `pagador_documento`, `concepto`, `importe`, `forma_pago`, `factura_id` (nullable FK a `facturas`), `estado`, timestamps |
| RD-004 | DB | Migracion: secuencia de numeracion de recibos por facturador | PENDIENTE | Cada facturador tiene un numerador correlativo propio para recibos; el numero se asigna al emitir |
| RD-005 | API — tipos | Definir tipos TypeScript del modulo | PENDIENTE | `recibos.types.ts` con interfaces de request/response, `FormaPago` enum, referencia opcional a factura |
| RD-006 | API — repository | Implementar `RecibosRepository` con PostgreSQL | PENDIENTE | CRUD: crear, listar por facturador, obtener por id, vincular a factura; consulta de recibos por factura |
| RD-007 | API — service | Implementar `RecibosService` con reglas de negocio | PENDIENTE | Validacion de importe (> 0), asignacion de numero al emitir, resolucion de datos del pagador desde factura vinculada, bloqueo de edicion en estado EMITIDO |
| RD-008 | API — PDF | Generar PDF de recibo | PENDIENTE | PDF A4 o media carta con datos del facturador, numero, fecha, pagador, concepto, importe en letras y numeros, forma de pago, referencia a factura si existe, y firma |
| RD-009 | API — routes | Implementar rutas REST del modulo | PENDIENTE | `POST /recibos`, `GET /recibos`, `GET /recibos/:id`, `POST /recibos/:id/emitir`, `GET /recibos/:id/pdf`, `DELETE /recibos/:id` (solo borradores) |
| RD-010 | API — integracion factura | Ruta para crear recibo desde factura credito | PENDIENTE | `POST /facturas/:id/recibo` crea un recibo pre-llenado con datos de la factura (cliente, importe total, referencia); la factura debe tener `condicion_venta = CREDITO` |
| RD-011 | API — contrato | Documentar endpoints en `spec/openapi.yaml` | PENDIENTE | Todos los endpoints estan en el contrato OpenAPI con schemas completos |
| RD-012 | Frontend — listado | Vista de listado de recibos | PENDIENTE | Lista con busqueda por numero/pagador, filtro por fecha; acceso desde menu lateral |
| RD-013 | Frontend — nueva recibo | Formulario de alta directa | PENDIENTE | Permite completar pagador (con reuso de agenda), concepto, importe, forma de pago; opcion de vincular a factura existente |
| RD-014 | Frontend — desde factura | Boton `Emitir recibo` en detalle de factura credito | PENDIENTE | En el panel de detalle/gestion de una factura con `condicion_venta = CREDITO` aparece boton `Emitir recibo`; al tocar pre-llena y navega al formulario de recibo |
| RD-015 | Frontend — emitir y PDF | Flujo de emision y descarga | PENDIENTE | Boton `Emitir` asigna numero, bloquea edicion y habilita `Descargar PDF`; confirmacion antes de emitir |
| RD-016 | QA | Tests del service | PENDIENTE | Tests cubren: validacion importe, numeracion correlativa, vinculo a factura credito, error al intentar vincular factura contado |
| RD-017 | QA | Validacion typecheck + build | PENDIENTE | `npm run typecheck` y `npm run build` pasan en `apps/api` y `apps/web-operacion` |

## Notas de producto

- Un recibo vinculado a factura hereda: nombre del cliente, RUC/CI, importe total de la factura, y numero de factura como referencia.
- El importe en el recibo puede ser parcial (pago parcial de factura credito) — se define en SPEC.
- La factura credito puede tener multiples recibos emitidos (pagos parciales) — se define en SPEC.
- `forma_pago` por defecto: Efectivo. Opciones: Efectivo, Transferencia Bancaria, Cheque, Tarjeta de Credito, Tarjeta de Debito, Otro.
- El numero de recibo es independiente de la numeracion de facturas y de notas.

## Evidencia

- 2026-06-23: backlog creado. Pendiente de ejemplo PDF del cliente para redactar SPEC.
