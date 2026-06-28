# TASKS Presupuestos v0.2

## Alineacion

- `docs/SPEC_PRESUPUESTOS_v0.2.md`
- `docs/PLAN_PRESUPUESTOS_v0.2.md`
- `spec/openapi.yaml`

## Descripcion del modulo

Evolucion del modulo `notas_comerciales` hacia un CRM comercial minimo centrado en Presupuestos. Agrega ciclo de vida comercial (estados PENDIENTE/ACEPTADO/RECHAZADO/VENCIDO), campos de vigencia y observaciones, mejoras de UX en lista/detalle, PDF mas profesional, y el flujo "Convertir en factura".

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
|---|---|---|---|---|
| PS-001 | DB | Migracion 0024_presupuestos_v02.sql | PENDING | Archivo creado con: `valido_hasta date`, `observaciones text`, enum `nota_estado_comercial`, columna `estado_comercial` en `notas_comerciales`, y columna `catalog_item_id uuid REFERENCES catalogo_items(id) ON DELETE SET NULL` en `notas_comerciales_items`. `npm run migrate` OK. |
| PS-002 | API — tipos | Actualizar notas.types.ts | PENDING | `NotaEstadoComercial` definido. `NotaRecord` incluye `valido_hasta`, `observaciones`, `estado_comercial`. `NotaFilaRecord` incluye `catalog_item_id` y `catalog_iva_tipo`. `NotaFilaInput` incluye `catalog_item_id` opcional. `NotaCreateInput` y `NotaUpdateInput` incluyen campos nuevos. `NotasRepository` declara `actualizarEstadoComercial` y `duplicar`. |
| PS-003 | API — repository | Actualizar PgNotasRepository | PENDING | `create()` y `update()` persisten `valido_hasta` y `observaciones`. `emitir()` asigna `valido_hasta = fecha_emision + 30 dias` cuando es null. `rowToRecord()` mapea los tres campos nuevos. Nuevos metodos `actualizarEstadoComercial` y `duplicar` implementados y funcionales. |
| PS-004 | API — service | Actualizar NotasService | PENDING | `actualizarEstadoComercial()` valida estado = EMITIDO antes de delegar. `duplicarNota()` retorna el nuevo BORRADOR. Helper `calcularEstadoVisual()` exportado. `verificarNota()` devuelve `NotaConItems` con campos nuevos + `estado_visual`. |
| PS-005 | API — routes | Nuevos endpoints en notas.routes.ts | PENDING | `PATCH /notas/:id/estado-comercial` acepta body `{ estado_comercial }`, retorna `NotaRecord`. `POST /notas/:id/duplicar` retorna 201 con `NotaRecord`. Ambos protegidos con `requireAuth`. |
| PS-006 | API — PDF | Redisenar notas.pdf.ts | PENDING | PDF generado usa titulo "PRESUPUESTO" (no "NOTA DE PRESUPUESTO"). Encabezado incluye "Valido hasta" si existe. Cabecera tabla dice "Conceptos presupuestados". Bloque de totales con fondo oscuro/azul. Bloque de observaciones si existen. Texto de pie profesional segun spec. |
| PS-007 | API — verificacion | Enriquecer respuesta GET /verificar/nota/:token | PENDING | Respuesta incluye `items[]`, `observaciones`, `valido_hasta`, `estado_comercial`, `estado_visual`. Solo cuando `valido: true`. |
| PS-008 | API — OpenAPI | Actualizar spec/openapi.yaml | PENDING | Schemas `NotaRecord`, `NotaConItems`, `NotaCreateRequest`, `NotaUpdateRequest`, `NotaVerificacionResponse` actualizados con campos nuevos. Paths `PATCH /notas/{notaId}/estado-comercial` y `POST /notas/{notaId}/duplicar` documentados. YAML valido con `js-yaml`. |
| PS-009 | API — QA | Typecheck + build API | PENDING | `npm run typecheck --workspace=apps/api` exit 0. `npm run build --workspace=apps/api` exit 0. |
| PS-010 | Frontend — InvoiceView | Agregar prop initialDraft | PENDING | `InvoiceView` acepta `initialDraft?: InvoiceInitialDraft`. Si presente al montar, abre formulario con cliente e items pre-cargados. Cada item usa el `iva_tipo` del draft (ya resuelto por NotasView: catalogo → `catalog_iva_tipo`, ad-hoc → `IVA_10`). Items con `catalog_item_id` != null se pre-vinculan. Sin cambios en el flujo normal (sin draft). |
| PS-011 | Frontend — lista | Renovar lista de presupuestos | PENDING | Dos tabs: "Presupuestos" (tipo=PRESUPUESTO) y "Pedidos" (tipo=PEDIDO). Tab por defecto: Presupuestos. El tab activo determina el `?tipo=` en el fetch y el label del boton de nueva. Input de busqueda por nombre/numero con filtrado en tiempo real. Lista agrupada por fecha ("Hoy", "Ayer", "Ultimos 7 dias", "Ultimos 30 dias") igual a facturas. Tarjetas con icono, numero, cliente, monto, estado, fecha. Menu ⋮ con: Ver, Compartir, WhatsApp, Duplicar, Eliminar. Boton "+ Nuevo presupuesto" / "+ Nuevo pedido" segun tab. |
| PS-012 | Frontend — formulario | Campos nuevos en formulario | PENDING | Campo "Validez" (input date, placeholder fecha +30 dias, opcional). Campo "Observaciones" (textarea, al final del formulario). Ambos incluidos en el payload de create/update/emitir. Titulo del formulario dice "Presupuesto" (no "Nota de Presupuesto"). |
| PS-013 | Frontend — detalle | Redisenar vista de detalle | PENDING | Seccion Resumen con Total, Validez (con texto "vence en X dias" si aplica), count de conceptos. Seccion Conceptos presupuestados colapsable. Seccion Observaciones si existen. Acciones frecuentes: WhatsApp, Compartir, PDF. Seccion "Mas opciones": Copiar enlace, Duplicar, Eliminar, Editar. Chips de estado comercial con cambio rapido (Aceptado/Rechazado). |
| PS-014 | Frontend — convertir | Boton "Convertir en factura" | PENDING | Visible en detalle cuando `estado = EMITIDO` y `estado_comercial != RECHAZADO`. Al presionar: llama `props.onConvertirEnFactura(nota)`. El padre navega a InvoiceView con `initialDraft` construido segun reglas: solo items `fila_tipo = 'ITEM'` con `precio_unitario > 0` se incluyen. `iva_tipo` resuelto por item: si `catalog_iva_tipo != null` → usar ese valor; si null → `IVA_10`. `precio_unitario` y `descripcion` siempre del presupuesto. `catalog_item_id` incluido si existe. Items ITEM_SIN_PRECIO, CONTEXTO e ITEM sin precio son omitidos. Cliente pre-cargado (nombre + ruc). InvoiceView abre directamente en formulario. |
| PS-015 | Frontend — renaming | Labels y navegacion | PENDING | Nav sidebar label "Presupuestos". Titulo de modulo "Presupuestos". Eyebrow "Presupuestos". Boton "Nuevo presupuesto". Heading detalle "Presupuesto Nº...". Todos los textos del modulo en espanol paraguayo natural sin "nota" como prefijo. |
| PS-016 | Frontend — estados | Chips de estado visual | PENDING | Helper `calcularEstadoVisual(nota)` en frontend con misma logica que backend: BORRADOR / PENDIENTE / VENCIDO / ACEPTADO / RECHAZADO. Chip con color: gris/amarillo/naranja/verde/rojo. Aparece en tarjeta de lista y en cabecera de detalle. |
| PS-017 | Frontend — CSS | Nuevos estilos | PENDING | Clases para chips de estado_comercial. Clases para bloque resumen en detalle. Clases para seccion "Mas opciones". Sin romper estilos existentes de facturas, notas de credito, clientes. |
| PS-018 | Frontend — QA | Typecheck + build web-operacion | PENDING | `npm run typecheck --workspace=apps/web-operacion` exit 0. `npm run build --workspace=apps/web-operacion` exit 0. |
| PS-019 | Deploy | Deploy a staging | PENDING | `git push` + pipeline CI. API y frontend actualizados en staging. Migracion 0024 aplicada. |
| PS-020 | QA — Playwright | Validaciones funcionales | PENDING | Crear presupuesto nuevo → emitir → verificar estado "Pendiente". Marcar como Aceptado → chip verde. Marcar como Rechazado → chip rojo. Duplicar → nuevo BORRADOR con mismos datos. Descargar PDF → sin errores 500, titulo "PRESUPUESTO", "Valido hasta" en header. Busqueda por nombre filtra lista. Convertir en factura → InvoiceView con datos pre-llenados. |

## Notas de producto

- El interno sigue siendo `notas_comerciales`. El renaming es solo de UI.
- `valido_hasta` es opcional al crear/editar. Se auto-asigna al emitir solo si es null.
- `estado_comercial` es null hasta que el operador lo cambie manualmente. El estado VENCIDO es calculado (no persiste).
- La conversion a factura en v0.2 es navegacion frontend; no hay FK bidireccional hasta v1.0.
- El modulo Pedido sigue existiendo como `tipo: 'PEDIDO'` pero sin tab dedicado. Se creara modulo separado cuando haya volumen.

## Evidencia

- 2026-06-28: SPEC, PLAN y TASKS redactados en base a retroalimentacion del fundador. Scope definido. Inicio de implementacion pendiente de aprobacion.
