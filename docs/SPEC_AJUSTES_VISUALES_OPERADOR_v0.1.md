# SPEC — Ajustes visuales del operador v0.1

**Fecha:** 2026-11-12 · **Rama:** `feat/identidad-segel` · **Pedido del usuario (2026-11-12):** implementar los cambios chicos y medianos de nivel visual mapeados en el BACKLOG, **sin desplegar en producción**.

## 1. Objetivo

Corregir de una vez los defectos visuales y de texto que el operador ve en pantalla, registrados en el BACKLOG a partir de la grabación de los tutoriales (H-9 a H-31) y de los ensayos. Todos se resuelven en `apps/web-operacion`, sin tocar la API, la base, el contrato con FE ni `spec/openapi.yaml`. Cada punto fue verificado en el código el 2026-11-12 (causa y lugar en el PLAN).

## 2. Alcance

| Id | Backlog | Pantalla | Qué pasa hoy | Qué tiene que pasar |
|---|---|---|---|---|
| AV-01 | FS-97 | Documentos, ficha: "Anular" | El motivo acepta 3 caracteres; FE exige 5 y el evento falla después de confirmar | El motivo de anulación exige 5 caracteres, con contador "N de 150 caracteres. Mínimo 5.", como la inutilización |
| AV-02 | FS-80 | Documentos, ficha: "Desde esta factura" | Una factura rechazada muestra "Crear nota de crédito" (deshabilitado) | El botón no aparece en una factura RECHAZADA, ANULADA, CANCELADO_LOCAL, ERROR_OPERATIVO ni ERROR_TEMPORAL |
| AV-03 | FS-84 | Nota de remisión: Transporte | Al pasar a "De un tercero" el transportista sigue siendo la propia empresa | Al pasar a "De un tercero" se vacían nombre y RUC del transportista si eran los del facturador; al volver a "Propio" se recargan si quedaron vacíos |
| AV-04 | FS-85 | Notas de remisión | "Emitidas · N" no cambia después de emitir | El contador se actualiza al emitir una nota |
| AV-05 | FS-81 y FS-89 | Nueva factura: grilla, tarjeta de celular y hoja | Sin cliente, el subtotal de cada línea dice 0; con descuento sobre el total, la columna mezcla líneas con y sin prorrateo y no coincide con la hoja | El subtotal de cada línea es siempre `cantidad × (precio − descuento de la línea)` (RN-17 de `SPEC_DESCUENTOS_FACTURA_v0.1`), con o sin cliente; los totales muestran "—" mientras no hay vista previa |
| AV-06 | FS-82 y FS-79 (H-15) | Nueva factura y Presupuestos/Pedidos: cliente | Después de autocompletar, la sugerencia de la agenda vuelve a abrirse y desalinea "Documento"; "padron" sin tilde | Al elegir o autocompletar un cliente la lista se cierra y no reaparece para ese mismo documento; "padrón" con tilde |
| AV-07 | FS-83 | Nueva factura: grilla | La columna "Código" corta códigos de 7 caracteres ("MANT-0") | Se ven completos los códigos de hasta 10 caracteres |
| AV-08 | FS-75 | Documentos: tabla | Una factura sin nombre muestra "0" en "RUC o CI" | Muestra "Sin nombre" |
| AV-09 | FS-32 y FS-86 | Documentos: ficha y resultado de emisión | "Email: Sin email" en una rechazada cuyo cliente tiene correo; "Email: Desconocido" en una remisión sin correo | El estado del correo dice lo que pasó (§4, RN-09) |
| AV-10 | FS-76 | Notas de crédito: lista de facturas | El número de una factura sin nombre se parte en tres renglones y el aviso se superpone | El número va en una línea y el aviso ocupa su columna con salto de línea |
| AV-11 | FS-87 | Catálogo: formulario | "IVA" queda desalineado respecto de "Precio (USD)" por la ayuda de decimales | Los campos de la fila quedan alineados arriba |
| AV-12 | FS-88 | Ventanas con "Motivo" | El campo "Motivo" usa letra monoespaciada | Todos los campos de texto largo usan la tipografía de la app |
| AV-13 | FS-94 (primera parte) | Agenda / Clientes | Solo se ven los primeros 30 clientes, sin aviso | Lista paginada de 30 en 30 con "Página N de M · T clientes"; la búsqueda vuelve a la página 1 |

## 3. Fuera de alcance

- **Necesitan la API:** FS-95 (anular nota de crédito), FS-96 (anular deshabilitado pasadas las 48 h: la API no expone la fecha de aprobación) y FS-98 (el texto "Segel informo envio de email." sale de la API).
- **Necesitan decisión:** FS-77 (unificar las dos pantallas de nota de crédito).
- **Rediseño mayor (FS-53):** el resto de FS-79 (editor de presupuestos con hoja de celular en escritorio, H-14) y FS-90 (modo simple en escritorio).
- **Resto de FS-94:** paginación de catálogo, presupuestos, recibos y candidatas de nota de crédito; queda en FS-94.
- Producción: nada se despliega en `segel-fs` en esta cadena.

## 4. Reglas

- **RN-01 (AV-01).** Mínimo 5 caracteres para el motivo de **anulación** (factura y remisión). La nota de crédito mantiene su regla actual. Debajo del campo, contador "N de 150 caracteres. Mínimo 5.".
- **RN-02 (AV-02).** "Crear nota de crédito" en "Desde esta factura" se muestra con la factura EMITIDA (habilitado según las reglas actuales) y mientras está en camino (EMITIENDO, PENDIENTE_SIFEN; deshabilitado, como hoy). En los demás estados no se muestra.
- **RN-03 (AV-03).** Con "De un tercero", si nombre y RUC del transportista son los del facturador, se vacían para que el operador cargue al tercero. Con "Propio", si quedaron vacíos, vuelven a ser los del facturador. Lo que el operador escribió no se pisa.
- **RN-04 (AV-04).** Al emitirse una nota de remisión desde "Nueva", el contador "Emitidas · N" se vuelve a pedir.
- **RN-05 (AV-05).** Subtotal de línea = `cantidad × (precio − descuento por unidad)`, redondeado a entero en guaraníes y a 2 decimales en moneda extranjera; el prorrateo del descuento global no se muestra por línea (RN-17 de descuentos). La suma de la columna puede diferir del total cuando hay descuento sobre el total: la diferencia es la fila "Descuento (x %)" de los totales. Sin vista previa (falta cliente o hay un dato inválido), cada importe de la tarjeta de totales muestra "—" en lugar de "Gs. 0".
- **RN-06 (AV-06).** Elegir una sugerencia o autocompletar desde la agenda o el padrón cierra la lista; la lista no vuelve a abrirse mientras el documento no cambie. Escape la cierra. Textos: "Del padrón de la DNIT…", "…o el padrón de la DNIT…".
- **RN-07 (AV-07).** Columna "Código" de la grilla con ancho para 10 caracteres, sin desborde horizontal en 1280 px.
- **RN-08 (AV-08).** Comprador sin nombre (`INNOMINADO`): la columna "RUC o CI" dice "Sin nombre".
- **RN-09 (AV-09).** Texto del estado del correo, en este orden:
  1. `SENT` "Enviado", `PENDING` "En cola", `DELEGATED` "Delegado", `FAILED` "Fallido" (como hoy);
  2. documento RECHAZADA sin envío: "No se envió: SIFEN rechazó el documento";
  3. cliente sin correo: "El cliente no tiene correo";
  4. `NOT_APPLICABLE` con correo: "No corresponde";
  5. otro caso: "Sin dato".
- **RN-10 (AV-10).** En la lista de facturas de Notas de crédito el número no se corta; el texto de elegibilidad se ajusta en su columna.
- **RN-11 (AV-11).** Las filas del formulario del catálogo alinean sus campos arriba.
- **RN-12 (AV-12).** `textarea` hereda la tipografía de la app, como `input`, `select` y `button`.
- **RN-13 (AV-13).** Agenda de 30 en 30, con "Anterior", "Siguiente" y "Página N de M · T clientes" cuando hay más de 30; al buscar, al guardar o al borrar se queda en una página válida (la búsqueda vuelve a la 1). Es el mismo control que Documentos: se crea el componente `Paginador` del catálogo de `PAUTAS_FRONTEND_v0.1` y Documentos lo adopta.

## 5. Criterios de aceptación

Cada AV-xx se comprueba con Playwright en 1440 y 1280 px y, cuando la pantalla existe en celular, en 390 px, contra el stack local. Además: sin desborde horizontal ni emojis nuevos, guion de reconocimiento UX sin subas, y regresión de los guiones de Nueva factura, descuentos, remisión y documentos que tocan las mismas pantallas.

## 6. Decisiones

| Id | Decisión | Estado |
|---|---|---|
| D-1 | AV-05: la columna "Subtotal" sigue RN-17 (sin prorrateo); su suma puede no coincidir con "Total a pagar" cuando hay descuento sobre el total | Regla vigente de `SPEC_DESCUENTOS_FACTURA_v0.1`; se aplica |
| D-2 | AV-05: sin vista previa los importes de los totales muestran "—" | Decidida (usuario, 2026-11-12) |
| D-3 | AV-09: textos del estado del correo de RN-09 | Decidida (usuario, 2026-11-12) |
| D-4 | AV-13: paginación "Anterior / Siguiente" de 30, igual que Documentos | Decidida (usuario, 2026-11-12) |
