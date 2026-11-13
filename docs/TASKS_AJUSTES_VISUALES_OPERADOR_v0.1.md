# TASKS — Ajustes visuales del operador v0.1

**SPEC:** `docs/SPEC_AJUSTES_VISUALES_OPERADOR_v0.1.md` · **PLAN:** `docs/PLAN_AJUSTES_VISUALES_OPERADOR_v0.1.md`

Sin despliegue en producción (pedido del usuario del 2026-11-12).

| ID | Tarea | Backlog | Reglas | Validación | Estado |
|---|---|---|---|---|---|
| AVO-000 | Confirmar con el usuario D-2, D-3 y D-4 de la SPEC | — | §6 | Respuesta anotada en la SPEC | Hecha (2026-11-12): el usuario aprobo las tres propuestas |
| AVO-001 | Motivo de anulación con mínimo 5 y contador | FS-97 | RN-01 | Playwright 1440/1280/390: 4 caracteres bloquea con el mensaje, 5 habilita; NC sigue con 3 | Pendiente |
| AVO-002 | "Crear nota de crédito" solo en facturas emitidas o en camino | FS-80 | RN-02 | Ficha de una rechazada sin el botón; de una emitida con el botón | Pendiente |
| AVO-003 | Transportista al cambiar a "De un tercero" y de vuelta | FS-84 | RN-03 | Nombre y RUC vacíos al pasar a tercero; propios al volver; lo escrito no se pisa | Pendiente |
| AVO-004 | Contador "Emitidas · N" de remisiones tras emitir | FS-85 | RN-04 | Con la emisión interceptada, el contador sube en uno | Pendiente |
| AVO-005 | Subtotal de línea local (RN-17) y totales "—" sin vista previa | FS-81, FS-89 | RN-05 | Sin cliente: subtotales con importe y totales "—"; con descuento global: columna = hoja; regresión de descuentos y Nueva factura | Pendiente |
| AVO-006 | Sugerencias de cliente que no reaparecen; "padrón" con tilde | FS-82, FS-79 (H-15) | RN-06 | Nueva factura y Presupuestos: tras elegir, la lista queda cerrada 2 s después; Escape cierra; texto con tilde | Pendiente |
| AVO-007 | Columna "Código" de 10 caracteres | FS-83 | RN-07 | Código "MANT-01234" completo; sin desborde en 1280 | Pendiente |
| AVO-008 | "Sin nombre" en la columna "RUC o CI" | FS-75 | RN-08 | Fila de una factura sin nombre | Pendiente |
| AVO-009 | Texto del estado del correo | FS-32, FS-86 | RN-09 | Rechazada con correo, remisión sin correo y emitida enviada | Pendiente |
| AVO-010 | Lista de facturas de Notas de crédito | FS-76 | RN-10 | El número de una factura sin nombre en una sola línea en 1440, 1280 y 390 | Pendiente |
| AVO-011 | Alineación del formulario del catálogo | FS-87 | RN-11 | "IVA" y "Precio (USD)" con el mismo borde superior | Pendiente |
| AVO-012 | Tipografía de los `textarea` | FS-88 | RN-12 | `font-family` del "Motivo" igual a la de la app | Pendiente |
| AVO-013 | `Paginador`, agenda paginada y Documentos con el mismo componente | FS-94 | RN-13 | Agenda con más de 30 clientes: página 2, búsqueda vuelve a 1; Documentos sigue paginando; guion de documentos actualizado | Pendiente |
| AVO-014 | Guion `playwright-ajustes-visuales.cjs` | — | §5 | Corrida contra el stack local | Pendiente |
| AVO-015 | Stack local con el frontend nuevo; corrida completa, regresión y reconocimiento UX | — | §5 | Resultados en la evidencia | Pendiente |
| AVO-016 | Cierre: repaso SPEC/PLAN/TASKS y BACKLOG (cada FS a "DONE en la rama, sin desplegar") | — | Regla de cierre | — | Pendiente |

## Evidencia
