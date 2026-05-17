# SPEC TICKET TERMICO v0.1 — Ticket crudo desde XML SIFEN

Este documento define el alcance funcional para generar salidas de ticket termico a partir del XML de un Documento Electronico SIFEN ya almacenado en el backend.

Se redacta en continuidad con:
- `docs/SPEC_MVP_v0.1.md`
- `docs/PLAN_MVP_v0.1.md`
- `docs/MODELO_DATOS_MULTI_EMISOR_v0.1.md`
- `spec/openapi.yaml`

## 1) Proposito

Agregar una capacidad de salida de ticket termico basada en el XML local del DE, orientada a:
- inspeccion manual del contenido fiscal en modo texto plano
- integracion con bridges o spoolers que consumen texto plano
- impresion directa en impresoras termicas en modo `ESC/POS`

El objetivo no es generar KuDE, PDF, HTML ni imagen. El objetivo es producir una representacion lineal y util del DE para impresion termica.

## 2) Alcance

### 2.1 Dentro de alcance
- Resolver un DE por `CDC`.
- Leer el XML persistido localmente del documento.
- Parsear el XML SIFEN con helpers simples.
- Renderizar ticket para ancho logico de `48 columnas`.
- Exponer dos endpoints:
  - `GET /files/ticket/:cdc/raw`
  - `GET /files/ticket/:cdc/raw?format=escpos`
- Generar:
  - salida `text/plain; charset=utf-8`
  - salida binaria `application/octet-stream`
- Sanitizar texto para impresoras termicas no UTF-8.
- Generar QR nativo en `ESC/POS`.

### 2.2 Fuera de alcance
- Generacion de PDF.
- Generacion de HTML.
- Render de imagen QR.
- Spool o impresion directa desde el backend.
- Personalizaciones por marca/modelo de impresora fuera del baseline ESC/POS.
- Soporte multi-ancho distinto de `80mm / 48 columnas` en esta iteracion.

## 3) Requisitos funcionales

### RF-01 Resolucion del documento

El sistema debe permitir buscar un documento por `CDC` y obtener su XML almacenado localmente.

Reglas:
- debe reutilizar la persistencia existente de `de_documents`
- debe preferir `xml_qr`
- si `xml_qr` no existe, puede usar `xml_signed`
- si no existe XML disponible, responder `404`

### RF-02 Endpoint modo texto plano

Endpoint:
- `GET /files/ticket/:cdc/raw`

Respuesta:
- `text/plain; charset=utf-8`

Comportamiento:
- devuelve un ticket en texto plano
- no devuelve binario ESC/POS
- no devuelve PDF
- no devuelve HTML
- puede omitir el QR o dejarlo como texto util si se decide necesario

### RF-03 Endpoint modo ESC/POS

Endpoint:
- `GET /files/ticket/:cdc/raw?format=escpos`

Respuesta:
- `application/octet-stream`

Comportamiento:
- devuelve un `Buffer` binario listo para impresora termica
- incluye QR como comando nativo ESC/POS
- no imprime el `CDC` al final
- no imprime la URL del QR como texto al final

### RF-04 Extraccion de datos del XML

El servicio debe extraer, como minimo:

#### Emisor
- `dNomEmi`
- `dRucEm`
- `dDVEmi`
- `dDirEmi`
- `dDesCiuEmi`
- `dTelEmi`
- `dEmailE`
- primer `dDesActEco`

#### Documento
- `dDesTiDE`
- `dNumTim`
- `dFeIniT`
- `dEst`
- `dPunExp`
- `dNumDoc`
- `dFeEmiDE`
- atributo `Id` del nodo `DE`

#### Receptor
- `dNomRec`
- `dNumIDRec` o `dRucRec`
- `dDCondOpe` o fallback `dDesTipTra`

#### Totales
- `cMoneOpe`
- `dTotGralOpe`
- `dMonTiPag`
- `dSub5`
- `dSub10`
- `dIVA5`
- `dIVA10`
- `dTotIVA`

#### QR
- `dCarQR`

#### Items
- `gCamItem[]`
- `dCodInt`
- `dDesProSer`
- `dCantProSer`
- `dTotOpeItem` o fallback `dTotBruOpeItem`

### RF-05 Layout del ticket

El ticket debe renderizarse en ancho logico de `48 columnas` y contener:

#### Cabecera centrada
- `RUC-DV`
- nombre del emisor
- direccion
- ciudad
- telefono
- email
- actividad economica principal

#### Bloque de documento
- timbrado
- fecha de vigencia
- tipo de documento
- establecimiento/punto/numero
- fecha y hora de emision

#### Tabla de detalle
- `Cod.`
- `Descripcion`
- `Cantidad`
- `Total`

Si un item no entra:
- la descripcion debe continuar debajo
- la alineacion no debe romperse

Estado implementado:
- el item se imprime en dos filas
- fila 1: `codigo + descripcion`
- fila 2: `Cant.` y total alineado a la derecha
- este layout prioriza legibilidad en termicas de 48 columnas

#### Bloque de totales
- `Total general`
- moneda o `Guaranies`
- `Total Pago`
- separador horizontal
- `Detalle Totales(Base Imponibles)`
- `Exenta`
- gravada `5%`
- gravada `10%`
- separador horizontal
- `IVA 5%`
- `IVA 10%`
- `Liquidacion Total del IVA`

Reglas de disposicion:
- no duplicar el total general en dos labels equivalentes
- el bloque `Total general` debe separarse visualmente del bloque de base imponible
- el bloque de base imponible debe separarse visualmente de `Liquidacion Total del IVA`

#### Bloque del receptor
- nombre
- documento
- condicion venta

Regla implementada:
- si existe `dRucRec`, el label del receptor debe ser `RUC`
- en otro caso, debe usarse `Documento de identidad`

#### Bloque legal y de validacion
- leyenda de consulta de validez
- URL de consulta `https://ekuatia.set.gov.py/consultas`
- `CDC` visible en texto
- leyenda:
  - `ESTE DOCUMENTO ES UNA REPRESENTACION GRAFICA DE UN`
  - `DOCUMENTO ELECTRONICO (XML)`
- leyenda final post-QR:
  - `Si su documento electronico presenta algun error puede solicitar la modificacion dentro de las 72 horas siguientes de la emision de este comprobante.`

#### Bloque QR
- en texto debe imprimirse debajo del bloque de validacion y antes de la leyenda final
- en ESC/POS debe ser QR nativo

### RF-06 Sanitizacion de texto

Todo el texto para salida termica debe pasar por una sanitizacion ASCII.

Debe:
- remover diacriticos con `normalize('NFD')`
- reemplazar caracteres tipograficos problemáticos
- eliminar caracteres fuera de ASCII imprimible salvo `CR/LF`

Reemplazos minimos:
- `° -> o`
- `º -> o`
- `ª -> a`
- `№ -> No`
- `–` o `— -> -`
- comillas tipograficas -> comillas ASCII
- `… -> ...`

### RF-07 Helpers requeridos

El servicio debe quedar modularizado con helpers equivalentes a:
- `normalizeXml(raw)`
- `decodeXmlEntities(value)`
- `getTagValues(xml, tagName)`
- `getFirstTagValue(xml, tagName, fallback)`
- `getDeId(xml)`
- `wrapLine(text, width)`
- `centerText(text, width)`
- `padLeft(value, width)`
- `padRight(value, width)`
- `formatLabelValue(label, value, labelWidth)`
- `formatAmount(value)`
- `formatDate(value)`
- `sanitizeTextForThermalPrinter(value)`
- `buildTicketItems(xml)`
- `extractRawTicketData(xml)`
- `buildValidationLegend(data, width)`
- `buildPostQrLegend(width)`
- `renderRawTicketText(data, width, options?)`
- `buildEscPosQrCommand(qrText)`
- `buildEscPosTicketPayload(xmlRaw)`
- `generateRawTicketFromXmlFile(xmlPath)`
- `generateRawTicketEscPosFromXmlFile(xmlPath)`

Estado implementado:
- `renderRawTicketText` ya soporta flags para omitir QR o leyenda post-QR cuando el flujo ESC/POS requiere intercalar el QR nativo entre bloques de texto

El nombre final de las funciones puede adaptarse al estilo del repo, pero la responsabilidad debe mantenerse.

### RF-08 Errores HTTP

Errores requeridos:
- `404 {"error":"raw_ticket_not_found"}`
- `500 {"error":"raw_ticket_generation_failed"}`

## 4) Requisitos no funcionales

### RNF-01 Sin dependencias innecesarias
- no agregar librerias pesadas si puede resolverse con helpers locales
- evitar parsers XML complejos si regex/helpers son suficientes para este caso

### RNF-02 Reutilizacion del repo
- reutilizar `DeDocumentRepository` o use case existente para resolver el XML por `CDC`
- respetar la estructura `routes / services / use-cases`

### RNF-03 Compatibilidad termica
- asumir entorno ASCII
- evitar caracteres no imprimibles
- generar payload compatible con ESC/POS basico

### RNF-04 Mantenibilidad
- separar claramente:
  - controlador HTTP
  - servicio de extraccion/render
  - helpers de formato y ESC/POS

## 5) Contrato HTTP propuesto

### 5.1 Texto plano
- `GET /fcws/files/ticket/:cdc/raw`

Respuesta exitosa:
- status `200`
- `Content-Type: text/plain; charset=utf-8`

### 5.2 ESC/POS
- `GET /fcws/files/ticket/:cdc/raw?format=escpos`

Respuesta exitosa:
- status `200`
- `Content-Type: application/octet-stream`

## 6) Criterios de aceptacion

1. Si existe el XML para un `CDC`, el endpoint texto devuelve ticket plano legible.
2. Si existe el XML para un `CDC`, el endpoint `escpos` devuelve un `Buffer`.
3. La salida plano no contiene caracteres termicos problemáticos.
4. La salida `escpos` incluye QR nativo por comandos ESC/POS.
5. El `CDC` no se imprime al final del ticket `escpos`.
6. Si el XML no existe, responde `404`.
7. Si la transformacion falla, responde `500`.
8. El detalle de items y totales queda alineado dentro de `48 columnas`.

## 7) Integracion esperada con el backend actual

Capas sugeridas:
- `src/api/routes/file-ticket.route.ts`
- `src/services/raw-ticket.service.ts`
- `src/use-cases/get-raw-ticket.use-case.ts` o resolucion directa via repositorio existente

Se debe integrar en `src/app.ts` junto a las demas rutas del servicio.
