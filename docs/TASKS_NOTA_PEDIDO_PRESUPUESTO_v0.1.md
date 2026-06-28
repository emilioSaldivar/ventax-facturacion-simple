# TASKS Nota de Pedido / Nota de Presupuesto v0.1

## Alineacion

- `docs/SPEC_NOTA_PEDIDO_PRESUPUESTO_v0.1.md`
- `docs/PLAN_NOTA_PEDIDO_PRESUPUESTO_v0.1.md`
- `spec/openapi.yaml`

## Descripcion del modulo

Modulo para emitir documentos comerciales internos no fiscales: **Nota de Pedido** y **Nota de Presupuesto**. Ambos comparten la misma estructura de datos y PDF.

Basado en ejemplos PDF reales: cabecera identica a una factura (logo + rubro + datos + Nro), tabla de items con tres tipos de fila (CONTEXTO / ITEM / ITEM_SIN_PRECIO), total unico en guaranies (sin desglose IVA), total en letras obligatorio, y QR de verificacion publica.

El documento NO es un comprobante fiscal. No interactua con SIFEN.

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
|---|---|---|---|---|
| NP-001 | SDD | Crear SPEC del modulo | DONE | Existe `docs/SPEC_NOTA_PEDIDO_PRESUPUESTO_v0.1.md` con modelo de datos, estructura PDF basada en ejemplos reales, verificacion QR, estados y reglas de negocio |
| NP-002 | SDD | Crear PLAN de implementacion | DONE | Existe `docs/PLAN_NOTA_PEDIDO_PRESUPUESTO_v0.1.md` con fases, archivos a crear/modificar y orden de ejecucion |
| NP-003 | DB | Migracion: campos `logo_url` y `rubro_descripcion` en `facturadores` | DONE | `db/migrations/0021_facturador_logo_rubro.sql` creado |
| NP-004 | DB | Migracion: tabla `notas_comerciales` | DONE | `db/migrations/0022_notas_comerciales.sql` creado |
| NP-005 | DB | Migracion: tabla `notas_comerciales_items` | DONE | Incluido en `0022_notas_comerciales.sql` |
| NP-006 | DB | Migracion: tabla `notas_comerciales_numeracion` | DONE | Incluido en `0022_notas_comerciales.sql` con `INSERT ... ON CONFLICT DO UPDATE RETURNING` |
| NP-007 | API — tipos | Definir tipos TypeScript del modulo | DONE | `apps/api/src/modules/notas/notas.types.ts` con todos los tipos + `FacturadorParaPdf` + `NotasRepository` |
| NP-008 | API — repository | Implementar `PgNotasRepository` | DONE | `apps/api/src/modules/notas/notas.repository.ts` con todos los metodos + `getFacturadorParaPdf` |
| NP-009 | API — service | Implementar `NotasService` con reglas de negocio | DONE | `apps/api/src/modules/notas/notas.service.ts` con validaciones, `numeroALetras` y `verificarNota` |
| NP-010 | API — PDF | Generar HTML del PDF | DONE | `apps/api/src/modules/notas/notas.pdf.ts` con `buildNotaPdfHtml` + QR via `qrcode` + estilos inline |
| NP-011 | API — pdf wrapper | Wrapper `htmlToPdfBuffer` | DONE | `apps/api/src/shared/pdf/pdf.service.ts` con `puppeteer-core`. Dockerfile actualizado con `chromium` + `font-noto` en Alpine |
| NP-012 | API — verificacion | Endpoint publico de verificacion | DONE | `apps/api/src/modules/verificacion/verificacion.routes.ts`. `GET /verificar/nota/:token` sin auth; 404 para borradores/inexistentes |
| NP-013 | API — routes | Implementar rutas REST del modulo | DONE | `apps/api/src/modules/notas/notas.routes.ts` con los 7 endpoints |
| NP-014 | API — registro | Registrar routers en `app.ts` | DONE | `notasRouter` en `API_BASE_PATH` y `verificacionRouter` en `/verificar` |
| NP-015 | API — contrato | Documentar endpoints en `spec/openapi.yaml` | DONE | Tag `Notas`, 8 paths (`/notas`, `/notas/{notaId}`, `/notas/{notaId}/emitir`, `/notas/{notaId}/pdf`, `/verificar/nota/{token}`), parameter `NotaId`, schemas `NotaTipo`, `NotaEstado`, `NotaFilaTipo`, `NotaFilaInput`, `NotaFilaResponse`, `NotaRecord`, `NotaConItems`, `NotaListResponse`, `NotaCreateRequest`, `NotaUpdateRequest`, `NotaVerificacionResponse` |
| NP-016 | Frontend — listado | Vista de listado de notas | DONE | `NotasView` en `main.tsx` con filtros Todos/Presupuesto/Pedido, acciones Ver/PDF/Eliminar/Emitir |
| NP-017 | Frontend — formulario | Formulario de alta/edicion con tabla dinamica | DONE | Formulario con filas CONTEXTO/ITEM/ITEM_SIN_PRECIO, reorden, total en tiempo real, guardar borrador y emitir |
| NP-018 | Frontend — detalle | Vista post-emision y descarga PDF | DONE | Sub-vista `detail` con numero, fecha, cliente, total y boton Descargar PDF (blob) |
| NP-019 | QA — tests | Tests del service y `numeroALetras` | DONE | `apps/api/tests/notas.service.test.ts` — 16/16 passed |
| NP-020 | QA — typecheck | Typecheck + build | DONE | `npm run typecheck` OK en `apps/api` y `apps/web-operacion`. `npm run build` OK en `apps/web-operacion` |
| NP-021 | Frontend — cliente DNIT | Autocompletado de cliente igual a facturas (DNIT + agenda) | DONE | Campo tipo (RUC/CI) + campo número + autocomplete al blur via `/clientes/dnit/autocomplete`; búsqueda de agenda en tiempo real; botón "Guardar en agenda"; mensaje de estado. Reemplaza los campos planos `formClienteNombre`+`formClienteRuc`. |
| NP-022 | Frontend — catálogo por fila | Typeahead de catálogo en filas tipo ITEM | DONE | Al tipear en descripción de fila ITEM: búsqueda debounced `/catalogo/items?q=...`; dropdown de sugerencias con descripción y precio; seleccionar pre-llena campos; precio siempre editable (no bloqueado). |
| NP-023 | Frontend — guardar en catálogo | Opción "Guardar en catálogo" para items ad-hoc | DONE | Fila ITEM: botón "AGREGAR Y GUARDAR EN CATÁLOGO" → llama `POST /catalogo/items` con `iva_tipo: "IVA_10"`; requiere precio entero > 0. |
| NP-024 | Frontend — refactor estado filas | Migrar `formItems` a `NotaFilaDraft[]` con `_id` cliente-side | DONE | `NotaFilaDraft` con `_id: crypto.randomUUID()`. Estado catálogo por fila indexado por `_id`. Cantidades y precios como strings. Payload convierte a números al guardar. |
| NP-025 | QA — typecheck post-enhancement | Typecheck + build tras NP-021..NP-024 | DONE | `npm run typecheck --workspace=apps/web-operacion` OK (exit 0). `npm run build --workspace=apps/web-operacion` OK — 26 módulos, bundle 277 kB. |

## Notas de producto

- Un BORRADOR puede editarse libremente. Al EMITIR el documento es inmutable.
- La cabecera del PDF replica la de una factura: logo del facturador (campo `logo_url`, nuevo), rubro/actividad (`rubro_descripcion`, nuevo), direccion del establecimiento principal, RUC, telefono.
- Tres tipos de fila en la tabla: CONTEXTO (bold, sin precio — reemplaza el concepto de "texto libre" separado), ITEM (con cantidad y precio), ITEM_SIN_PRECIO (sin precio, muestra "—").
- Sin desglose de IVA — solo total en guaranies. El precio unitario es el precio final con IVA incluido.
- El total en letras es obligatorio en el PDF.
- Logo y rubro se configuran desde backoffice — el usuario operativo no los edita.
- Autocompletado de cliente: mismo flujo que facturas (tipo RUC/CI → DNIT + agenda). El tipo solo existe en estado frontend, no se persiste.
- Catálogo: los items ITEM pueden pre-llenarse del catálogo (typeahead). El precio desde catálogo es editable (a diferencia de facturas). Item ad-hoc puede guardarse en catálogo al confirmar.
- Fecha de emisión: no requerida en borrador; se asigna automáticamente al emitir.

## Evidencia

- 2026-06-23: backlog creado.
- 2026-06-24: SPEC redactado en `docs/SPEC_NOTA_PEDIDO_PRESUPUESTO_v0.1.md`. NP-001 → DONE.
- 2026-06-23: SPEC revisado con base en PDF reales: eliminado texto_libre separado, eliminado desglose IVA, agregado `logo_url`/`rubro_descripcion`, definidos 3 tipos de fila, actualizado layout PDF. PLAN redactado en `docs/PLAN_NOTA_PEDIDO_PRESUPUESTO_v0.1.md`. NP-002 → DONE.
- 2026-06-25: implementacion completa NP-003 a NP-020 (excepto NP-015 OpenAPI). Tests: 16/16 passed (`notas.service.test.ts`). Typecheck OK en `apps/api` y `apps/web-operacion`. Build OK. Motor PDF: `puppeteer-core` + Chromium Alpine (Dockerfile actualizado). QR con paquete `qrcode`.
- 2026-06-25: NP-015 completado. Documentados 8 paths, tag `Notas`, parameter `NotaId` y 11 schemas en `spec/openapi.yaml`. YAML validado con `js-yaml`. Modulo backend 100% cerrado.
- 2026-06-25: SPEC y PLAN actualizados con decisiones de UX confirmadas: cliente DNIT+agenda igual a facturas, precio final con IVA incluido (no desglose), precio del catálogo editable (no bloqueado), fecha solo al emitir. Nuevas tareas NP-021 a NP-025 agregadas para el enhancement del formulario frontend.
- 2026-06-25: NP-021 a NP-025 implementados y cerrados. Formulario NotasView refactorizado con paridad visual total a InvoiceView: secciones `invoice-editor`, cliente con DNIT+agenda, bottom-sheet para filas ITEM con typeahead de catálogo, `NotaFilaDraft` con `_id` para estado por fila, precio editable (no bloqueado), guardar en catálogo ad-hoc con `iva_tipo: "IVA_10"`. CSS: `.nota-fila-*`, `.nota-item-header`, `.nota-add-fila-row`, `.filter-tabs` agregados a `styles.css`. Build OK (277 kB). Typecheck OK (exit 0).
