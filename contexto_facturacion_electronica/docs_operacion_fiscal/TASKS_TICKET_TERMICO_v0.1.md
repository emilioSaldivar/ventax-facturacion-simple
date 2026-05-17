# TASKS TICKET TERMICO v0.1

Este archivo lista tareas atomicas para implementar:
- `docs/SPEC_TICKET_TERMICO_v0.1.md`
- `docs/PLAN_TICKET_TERMICO_v0.1.md`

---

## TTT001 — Definir fuente del XML por CDC
**Objetivo:** resolver el artefacto XML correcto para el ticket.
- Reutilizar `DeDocumentRepository.findByCdc`.
- Preferir `xml_qr`.
- Fallback a `xml_signed`.

**Criterio de aceptacion**
- Dado un `CDC` existente, puede obtenerse el XML base para renderizar ticket.

---

## TTT002 — Crear servicio de ticket termico
**Objetivo:** centralizar extraccion y render.
- Crear `src/services/raw-ticket.service.ts`.
- Definir interfaz publica para:
  - texto plano
  - ESC/POS

**Criterio de aceptacion**
- Existe un servicio autocontenido reutilizable por la ruta HTTP.

---

## TTT003 — Helpers de normalizacion XML
**Objetivo:** preparar lectura robusta del XML.
- Implementar:
  - `normalizeXml`
  - `decodeXmlEntities`
  - `getTagValues`
  - `getFirstTagValue`
  - `getDeId`

**Criterio de aceptacion**
- Se pueden extraer tags clave sin parser XML pesado.

---

## TTT004 — Helpers de texto y layout
**Objetivo:** sostener formato termico de 48 columnas.
- Implementar:
  - `wrapLine`
  - `centerText`
  - `padLeft`
  - `padRight`
  - `formatLabelValue`
  - `formatAmount`
  - `formatDate`

**Criterio de aceptacion**
- El layout no se rompe con labels ni descripciones largas.

---

## TTT005 — Sanitizacion ASCII para termica
**Objetivo:** evitar caracteres problemáticos en impresoras no UTF-8.
- Implementar `sanitizeTextForThermalPrinter`.
- Aplicarla al texto renderizado.
- Aplicarla al contenido enviado a ESC/POS.

**Criterio de aceptacion**
- La salida solo contiene ASCII imprimible y saltos de linea.

---

## TTT006 — Extraccion del modelo intermedio
**Objetivo:** separar XML de presentacion.
- Implementar `extractRawTicketData`.
- Extraer:
  - emisor
  - documento
  - receptor
  - totales
  - items
  - QR

**Criterio de aceptacion**
- El servicio obtiene todos los datos requeridos por el spec.

---

## TTT007 — Construccion de items
**Objetivo:** renderizar detalle de productos/servicios.
- Implementar `buildTicketItems`.
- Resolver fallback:
  - `dTotOpeItem`
  - `dTotBruOpeItem`

**Criterio de aceptacion**
- El detalle muestra codigo, descripcion, cantidad y total por item.

---

## TTT008 — Render de ticket texto
**Objetivo:** producir salida `text/plain`.
- Implementar `renderRawTicketText`.
- Incluir:
  - cabecera
  - documento
  - items
  - totales
  - receptor

**Criterio de aceptacion**
- El ticket texto se ve legible y alineado en 48 columnas.

**Estado**
- completado
- ampliado con:
  - encabezado tipo KUDE ticket
  - bloque legal de validacion
  - `CDC` visible
  - leyenda de representacion grafica
  - leyenda final post-QR
  - items en dos filas

---

## TTT009 — Comando QR ESC/POS
**Objetivo:** imprimir QR real en la termica.
- Implementar `buildEscPosQrCommand`.
- Usar `GS ( k`.
- Base `size=4`.

**Criterio de aceptacion**
- El payload contiene secuencia QR nativa.

---

## TTT010 — Payload completo ESC/POS
**Objetivo:** generar ticket binario listo para impresora.
- Implementar `buildEscPosTicketPayload`.
- Inicializar con `ESC @`.
- Centrar QR.
- Volver a izquierda luego del QR.
- No imprimir CDC al final.

**Criterio de aceptacion**
- El endpoint `format=escpos` devuelve un `Buffer` utilizable con `lp -o raw`.

**Estado**
- completado
- el flujo actual emite:
  - bloque de texto previo
  - QR nativo centrado
  - bloque legal posterior al QR

---

## TTT011 — Generadores desde XML
**Objetivo:** exponer API simple dentro del servicio.
- Implementar:
  - `generateRawTicketFromXmlFile`
  - `generateRawTicketEscPosFromXmlFile`

**Criterio de aceptacion**
- Desde un XML raw puede producirse el ticket texto o ESC/POS.

---

## TTT012 — Controlador y ruta HTTP
**Objetivo:** exponer la funcionalidad via API.
- Crear route/controlador para:
  - `GET /fcws/files/ticket/:cdc/raw`
- Manejar `format=escpos`.
- Responder `404` y `500` segun el spec.

**Criterio de aceptacion**
- El endpoint queda operativo y con content-type correcto.

---

## TTT013 — Integracion en app
**Objetivo:** registrar la nueva ruta en la aplicacion.
- Actualizar `src/app.ts`.

**Criterio de aceptacion**
- La ruta queda accesible desde la app principal.

---

## TTT014 — Tests unitarios del servicio
**Objetivo:** cubrir lo critico del render.
- Testear:
  - sanitizacion
  - extraccion
  - wrap
  - render texto
  - payload ESC/POS

**Criterio de aceptacion**
- Los helpers clave quedan cubiertos por tests.

**Estado**
- completado
- cubre:
  - extraccion de datos
  - sanitizacion ASCII
  - render texto con leyendas nuevas
  - payload ESC/POS con QR nativo

---

## TTT015 — Tests de ruta
**Objetivo:** cubrir comportamiento HTTP.
- `200` texto
- `200` octet-stream
- `404 raw_ticket_not_found`
- `500 raw_ticket_generation_failed`

**Criterio de aceptacion**
- La ruta maneja correctamente modos y errores.

---

## TTT016 — Ejemplos operativos y documentacion
**Objetivo:** dejar listo para prueba manual.
- Documentar ejemplos de:
  - `curl`
  - `curl --output`
  - `lp -o raw`
- Agregar breve nota sobre QR real en modo ESC/POS.

**Criterio de aceptacion**
- El feature queda listo para usar con Postman, curl o spooler local.

**Estado**
- parcialmente completado
- documentado el flujo de redeploy del `api`
- documentada la validacion con `CDC` real

---

## TTT017 — Ajustar layout legal y validacion del ticket
**Objetivo:** acercar el ticket raw al ticket fiscal de referencia usado por KUDE.
- imprimir `CDC` en texto
- agregar URL de consulta
- agregar leyenda:
  - `ESTE DOCUMENTO ES UNA REPRESENTACION GRAFICA DE UN DOCUMENTO ELECTRONICO (XML)`
- agregar mensaje final de 72 horas

**Criterio de aceptacion**
- el ticket raw muestra claramente el `CDC`, la URL de consulta, la leyenda de representacion grafica y el mensaje final post-QR.

**Estado**
- completado

---

## TTT018 — Mejorar disposicion de items y totales
**Objetivo:** optimizar legibilidad real en impresoras termicas.
- items en dos filas
- evitar duplicacion del total general
- insertar separadores entre:
  - total general
  - base imponible
  - liquidacion total del IVA

**Criterio de aceptacion**
- el ticket evita repetir el total general y el operador puede distinguir rapidamente cada bloque fiscal.

**Estado**
- completado
