# TASKS Nota de Pedido / Nota de Presupuesto v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_NOTA_PEDIDO_PRESUPUESTO_v0.1.md`
- `docs/PLAN_NOTA_PEDIDO_PRESUPUESTO_v0.1.md` (PENDIENTE — crear antes de implementar)
- `spec/openapi.yaml`

## Descripcion del modulo

Modulo para emitir documentos comerciales internos no fiscales: **Nota de Pedido** (solicitud de compra/servicio hacia un proveedor) y **Nota de Presupuesto** (cotizacion emitida hacia un cliente). Ambos comparten la misma estructura de datos y PDF.

### Estructura del documento

| Seccion | Descripcion |
|---|---|
| Encabezado | Datos del facturador (nombre, RUC, direccion, telefono, email, logo) |
| Destinatario | Nombre / RUC / CI del cliente o proveedor |
| Texto libre | Seccion de observaciones o descripcion general antes de los items (ej: datos del riesgo, condiciones, referencia a siniestro, vehiculo, etc.) |
| Items | Tabla: cantidad · descripcion · precio unitario · % IVA · total |
| Totales | Subtotal, IVA desglosado (5% / 10%), Total |
| Pie | Condicion de pago, validez del documento, firma |

El documento NO es un comprobante fiscal. No interactua con SIFEN ni con facturacion-electronica.

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
|---|---|---|---|---|
| NP-001 | SDD | Crear SPEC del modulo | DONE | Existe `docs/SPEC_NOTA_PEDIDO_PRESUPUESTO_v0.1.md` con modelo de datos, estructura PDF, verificacion QR, estados y reglas de negocio |
| NP-002 | SDD | Crear PLAN de implementacion | PENDIENTE | Existe `docs/PLAN_NOTA_PEDIDO_PRESUPUESTO_v0.1.md` con fases, archivos a crear/modificar y orden de ejecucion |
| NP-003 | DB | Migracion: tabla `notas_comerciales` | PENDIENTE | Nueva tabla con `tipo` (PEDIDO/PRESUPUESTO), `facturador_id`, `numero`, `destinatario_*`, `texto_libre`, `condicion_pago`, `validez_dias`, `estado`, timestamps |
| NP-004 | DB | Migracion: tabla `notas_comerciales_items` | PENDIENTE | Items vinculados a nota con `descripcion`, `cantidad`, `precio_unitario`, `iva_tipo`, `precio_total` |
| NP-005 | DB | Migracion: secuencia de numeracion por facturador y tipo | PENDIENTE | Cada facturador tiene numerador independiente para PEDIDO y para PRESUPUESTO; el numero se asigna al emitir |
| NP-006 | API — tipos | Definir tipos TypeScript del modulo | PENDIENTE | `notas.types.ts` con interfaces de request/response, estados y tipos de IVA alineados con el resto del sistema |
| NP-007 | API — repository | Implementar `NotasRepository` con PostgreSQL | PENDIENTE | CRUD: crear borrador, listar, obtener por id, actualizar, cambiar estado, eliminar borrador |
| NP-008 | API — service | Implementar `NotasService` con reglas de negocio | PENDIENTE | Validacion de items (precio >= 0, cantidad > 0), calculo de totales IVA, asignacion de numero al emitir, bloqueo de edicion en estado EMITIDO |
| NP-009 | API — PDF | Generar PDF de nota con puppeteer/jsPDF | PENDIENTE | PDF branded con datos del facturador, texto libre antes de la tabla de items, tabla de items, totales y pie; compatible A4 |
| NP-010 | API — routes | Implementar rutas REST del modulo | PENDIENTE | `POST /notas`, `GET /notas`, `GET /notas/:id`, `PATCH /notas/:id`, `POST /notas/:id/emitir`, `GET /notas/:id/pdf`, `DELETE /notas/:id` |
| NP-011 | API — contrato | Documentar endpoints en `spec/openapi.yaml` | PENDIENTE | Todos los endpoints del modulo estan en el contrato OpenAPI con request/response schemas completos |
| NP-012 | Frontend — listado | Vista de listado de notas comerciales | PENDIENTE | Lista con filtro por tipo (PEDIDO/PRESUPUESTO), estado y busqueda por numero/destinatario; acceso desde menu lateral |
| NP-013 | Frontend — nueva nota | Formulario de creacion/edicion | PENDIENTE | Permite seleccionar tipo, completar destinatario (con reuso de agenda de clientes), escribir texto libre, agregar/editar/eliminar items con calculo de totales en tiempo real |
| NP-014 | Frontend — emitir | Flujo de emision y descarga PDF | PENDIENTE | Boton `Emitir` bloquea edicion, asigna numero y habilita `Descargar PDF`; confirmacion antes de emitir (accion irreversible) |
| NP-015 | Frontend — items | Autocompletado desde catalogo en items | PENDIENTE | Al escribir en `descripcion` de un item se sugiere del catalogo propio del facturador; seleccionar pre-completa precio unitario e IVA |
| NP-016 | QA | Tests del service y validaciones | PENDIENTE | Tests cubren: totales correctos, bloqueo de edicion emitida, error en items invalidos, numeracion secuencial |
| NP-017 | QA | Validacion typecheck + build | PENDIENTE | `npm run typecheck` y `npm run build` pasan en `apps/api` y `apps/web-operacion` |

## Notas de producto

- Un documento en estado `BORRADOR` puede editarse libremente.
- Al `EMITIR` se asigna el numero correlativo y el documento queda inmutable.
- El texto libre (seccion pre-items) acepta salto de linea y se renderiza como parrafo en el PDF.
- La nota puede ser enviada por email directamente desde la UI (fase futura, no en este alcance).
- Reutiliza la agenda de clientes para el destinatario.
- Reutiliza el catalogo para autocompletar items.

## Evidencia

- 2026-06-23: backlog creado.
- 2026-06-24: SPEC redactado en `docs/SPEC_NOTA_PEDIDO_PRESUPUESTO_v0.1.md`. Incluye modelo de datos completo, estructura PDF, sistema de verificacion QR con endpoint publico, estados, calculos de totales, API REST y criterios de aceptacion. NP-001 marcado DONE.
