# PLAN TICKET TERMICO v0.1

Este documento describe el plan tecnico para implementar lo definido en:
- `docs/SPEC_TICKET_TERMICO_v0.1.md`
- `docs/SPEC_MVP_v0.1.md`

## 1) Estrategia

La implementacion se divide en cuatro bloques:
1. resolucion del XML por `CDC`
2. extraccion de datos y render de ticket texto
3. construccion de payload `ESC/POS`
4. exposicion HTTP y pruebas

## 2) Diseno objetivo

### 2.1 Fuente del XML

La fuente primaria debe ser `de_documents`:
- buscar por `CDC`
- preferir `xml_qr`
- fallback a `xml_signed`

Esto evita introducir un storage fisico nuevo y mantiene el feature autocontenido en la BD ya existente.

### 2.2 Servicio de ticket

Crear un servicio especializado, por ejemplo:
- `src/services/raw-ticket.service.ts`

Responsabilidades:
- normalizar XML
- extraer tags simples
- decodificar entidades XML
- agrupar datos en una estructura intermedia
- renderizar ticket texto
- renderizar payload ESC/POS

La extraccion puede basarse en regex/helpers porque:
- el XML ya viene en una forma muy estable
- el requerimiento explicitamente permite esta linea
- evita agregar dependencias nuevas

### 2.3 Modelo intermedio

Antes de renderizar, el XML debe convertirse a una estructura interna simple:
- `issuer`
- `document`
- `receiver`
- `totals`
- `items`
- `qr`

Esto desacopla:
- extraccion XML
- presentacion texto
- presentacion ESC/POS

### 2.4 Render texto

El render texto debe producir un string listo para:
- inspeccion manual
- bridges que esperan texto

Reglas:
- ancho 48
- separadores horizontales
- cabeceras centradas
- columnas fijas para items
- wraps controlados para descripciones y labels largos

### 2.5 Render ESC/POS

El payload `ESC/POS` debe:
- inicializar impresora con `ESC @`
- emitir texto ASCII sanitizado
- centrar QR
- insertar QR con `GS ( k`
- volver a alineacion izquierda al finalizar
- agregar avance final

El ticket `escpos` no debe imprimir:
- URL del QR como texto
- CDC al final

## 3) Cambios por capa

### 3.1 DB / repositorio

No se requieren migraciones.

Se debe reutilizar:
- `DeDocumentRepository.findByCdc`

Si el repo actual no expone lo suficiente para este caso, agregar un helper minimo de lectura.

### 3.2 Use case

Alternativas:
- resolver directo en route con servicio y repo
- crear `GetRawTicketUseCase`

Recomendacion:
- usar un use case pequeño para separar lectura de documento y seleccion de XML fuente

### 3.3 Servicio

Implementar en un solo modulo principal con helpers internos:
- extraccion
- sanitizacion
- formateo
- ESC/POS

### 3.4 API

Agregar nueva ruta:
- `GET /fcws/files/ticket/:cdc/raw`

El controlador debe:
- leer `req.params.cdc`
- leer `req.query.format`
- devolver `text/plain` o `application/octet-stream`
- mapear errores a `404` y `500`

## 4) Orden de implementacion recomendado

1. crear `SPEC`, `PLAN`, `TASKS`
2. crear servicio `raw-ticket.service.ts`
3. implementar helpers base:
   - sanitizacion
   - extraccion XML
   - wrap/center/pad
4. implementar modelo intermedio `extractRawTicketData`
5. implementar `renderRawTicketText`
6. implementar `buildEscPosQrCommand`
7. implementar `buildEscPosTicketPayload`
8. agregar route/controlador
9. integrar en `app.ts`
10. agregar tests unitarios y de ruta
11. validar con un `CDC` real local

## 4.1 Estado actual implementado

El feature ya se encuentra implementado en el repo con estos componentes:
- `src/services/raw-ticket.service.ts`
- `src/use-cases/get-raw-ticket.use-case.ts`
- `src/api/routes/file-ticket.route.ts`
- integracion en `src/app.ts`
- tests de servicio y ruta

Ademas, el layout fue evolucionado para alinearse mejor con el KUDE tipo ticket usado como referencia:
- cabecera tipo `KUDE - FACTURA TIPO TICKET`
- bloque legal de validacion con URL de consulta y `CDC`
- leyenda de representacion grafica del XML
- leyenda operativa posterior al QR
- items en dos filas
- separadores entre:
  - total general
  - base imponible
  - liquidacion total del IVA

## 4.2 Flujo operativo de redeploy

Para que cambios del ticket impacten en la API desplegada por Docker Compose:
1. reconstruir imagen del `api`
2. recrear el contenedor `api`
3. verificar el endpoint raw con un `CDC` real

Comando recomendado:
- `docker compose build --no-cache api && docker compose up -d --force-recreate api`

Validacion recomendada:
- `curl -H "x-api-key: <API_KEY>" "http://127.0.0.1:<PUERTO>/fcws/files/ticket/<CDC>/raw?env=test"`

Nota operativa:
- se detecto que un redeploy previo habia dejado el contenedor `fe_mvp_api` con una version antigua de `dist/services/raw-ticket.service.js`
- por eso se recomienda `--no-cache` cuando el endpoint siga devolviendo el formato viejo

## 5) Riesgos y decisiones tecnicas

### 5.1 XML con namespaces

Riesgo:
- un parser ingenuo puede fallar si cambia el shape del XML

Mitigacion:
- trabajar sobre XML normalizado y tags finales sin prefijos
- buscar por tags concretos usados por SIFEN en nuestros artefactos almacenados

### 5.2 Texto no ASCII

Riesgo:
- la impresora termica degrade mal nombres, ciudades o descripciones

Mitigacion:
- sanitizacion central unica y reutilizable para texto y ESC/POS

### 5.3 Longitud de lineas

Riesgo:
- items largos rompen el layout

Mitigacion:
- `wrapLine`
- tabla de detalle con continuacion debajo
- layout en dos filas por item para mejorar legibilidad real en termicas

### 5.4 Compatibilidad ESC/POS

Riesgo:
- algunas impresoras implementan QR con variaciones

Mitigacion:
- usar secuencia base `GS ( k`
- dejar tamaño de modulo configurable
- mantener implementacion minimalista

## 6) Verificacion

Validaciones minimas:
- texto plano sobre un XML real
- binario ESC/POS con encabezado `ESC @`
- inclusion de QR nativo
- `404` por `CDC` inexistente
- `500` si la transformacion lanza error

Verificacion ya realizada:
- render de texto con `CDC` real `01801369681001001000107622026042013892577554`
- confirmacion de que el endpoint `/fcws/files/ticket/:cdc/raw` devuelve el nuevo layout una vez redeployado el contenedor correcto

## 7) Entregables

- endpoint operativo
- servicio modularizado
- tests
- ejemplos de `curl`
- ejemplo de impresion con `lp -o raw`
- breve nota tecnica sobre por que `ESC/POS` imprime QR real
