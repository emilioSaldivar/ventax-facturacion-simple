# AGENTS.md — Contexto y reglas globales para FACTURACION ELECTRONICA (MVP)

## Contexto Del Proyecto

**Nombre del proyecto:** `facturacion-electronica`  
**Repositorio:** `git@github.com:emilioSaldivar/facturacion-electronica.git`

Este proyecto es un backend Node.js para emitir y gestionar **Documentos Electronicos (DE)** conforme al **Manual Tecnico SIFEN Version 150 (Paraguay)**, enfocado en un MVP operativo.

## Regla Operativa De Git Y Servidor

- Los cambios de codigo se realizan siempre en este repositorio local, se commitean y se suben al remoto antes de desplegar.
- El servidor `deploy@178.104.136.153:~/apps/facturacion-electronica` se usa para verificacion y deploy de commits publicados; no se deben editar archivos versionados directamente alli.
- Por SSH se permiten verificaciones (`docker ps/logs/inspect`, healthchecks, consultas `SELECT`) y cambios operativos de BD autorizados explicitamente.
- Si hace falta modificar codigo, migraciones, tests o configuracion versionada, hacerlo localmente y luego pedir deploy desde el servidor con `git pull --ff-only`.
- Procedimiento detallado: `docs/OPERACION_GIT_DEPLOY.md`.

## Metodo De Trabajo Obligatorio

Este repositorio se trabaja con **Spec-Driven Development**.

Todo cambio funcional, tecnico o estructural debe seguir esta secuencia:

1. `SPEC`
2. `PLAN`
3. `TASKS`
4. `IMPLEMENT`

### Regla General

- No se implementa primero y no se documenta despues.
- Primero se define el alcance en un `SPEC`.
- Luego se traduce ese alcance a un `PLAN` tecnico.
- Luego se descompone el trabajo en `TASKS` atomicas y verificables.
- Recién despues se implementa.

### Regla Para Agentes

Cualquier agente que trabaje en este repositorio debe:

- leer `AGENTS.md` antes de proponer o modificar codigo,
- identificar el `SPEC` aplicable,
- identificar el `PLAN` aplicable,
- identificar el `TASKS` aplicable,
- actualizar esos documentos si el alcance cambio,
- implementar solo cuando la cadena `SPEC -> PLAN -> TASKS` sea consistente.

### Regla De Entrada Para Nuevos Cambios

Si el cambio solicitado no tiene documentacion suficiente:

- crear o actualizar primero `docs/SPEC_*.md`,
- luego crear o actualizar `docs/PLAN_*.md`,
- luego crear o actualizar `docs/TASKS_*.md`,
- y solo despues tocar `src/`, `tests/`, `spec/openapi.yaml`, migraciones u otros archivos de implementacion.

### Regla De Cierre

Un cambio se considera cerrado solo cuando:

- el `SPEC` refleja el alcance final,
- el `PLAN` refleja el diseno realmente adoptado,
- `TASKS` refleja el estado real (`PENDING`, `PARTIAL`, `DONE` o equivalente),
- la implementacion y los tests estan alineados con esos documentos.

### Documentos Base Del Flujo

- Guia metodologica: `docs/METODOLOGIA_SDD.md`
- Fuente funcional principal del MVP: `docs/SPEC_MVP_v0.1.md`
- Diseno tecnico principal del MVP: `docs/PLAN_MVP_v0.1.md`
- Backlog principal del MVP: `docs/TASKS_MVP_v0.1.md`
- Contrato API: `spec/openapi.yaml`

## MVP Objetivos Clave

El sistema debe poder:

1. **Emitir Facturas Electronicas**:
   - Modo **CONTADO** y **CREDITO**
   - Generar el XML con la estructura obligatoria del Manual Tecnico v150
   - Firmar el XML con certificado digital PKCS#12
   - Generar e insertar **QR AA002** en el XML
   - Persistir XML en BD y datos auxiliares
   - Enviar el documento a la SET/SIFEN de forma:
     - **Sincronica (SYNC)**
     - **Por Lote (BATCH)**
2. **Gestionar Eventos del Emisor**:
   - **Cancelar comprobantes aprobados**
   - **Inutilizar rangos de numeraciones**
3. **Consultar Documentos**:
   - Consultar comprobante por **CDC**
   - Obtener XML (sin firma, firmado y con QR)
   - Consultar estado en SIFEN
   - Listar facturas
   - Consultar eventos

## Dependencias Tecnicas

Proyecto basado en Node.js. Librerias tecnicas obligatorias para el MVP:

### Generacion de XML

- `facturacionelectronicapy-xmlgen`  
  Genera el XML conforme Manual Tecnico v150 desde datos JSON.

### Firma de XML

- `facturacionelectronicapy-xmlsign`  
  Firma el XML generado con el certificado PKCS#12 (DSIG) aplicando la estampa de tiempo.

### Generacion de QR

- `facturacionelectronicapy-qrgen`  
  Genera el valor del **AA002 (QR)** a partir del XML firmado y el CSC.

### Envio y comunicacion SET/SIFEN

- `facturacionelectronicapy-setapi`  
  Implementa los endpoints de SET/SIFEN para recibir documentos, lotes, eventos y consultas.

## Reglas Y Requisitos Del Negocio (MT v150)

Estas reglas definen validaciones obligatorias en el sistema:

### Emision XML

- El XML debe cumplir la estructura esperada por SET/SIFEN segun el Manual Tecnico 150.

### Firma Digital

- Debe utilizarse un certificado digital **PKCS#12** con password seguro.
- El XML debe estar firmado antes de generar el QR y enviarlo.

### Codigo De Seguridad / QR AA002

- Requiere `idCSC` y `CSC` del emisor.
- El QR se genera a partir del XML ya firmado.

### Envios A SET/SIFEN

- **SYNC**: envio individual y retorno de estado inmediato.
- **BATCH**: lote de hasta **50 DE del mismo tipo**, firmados, enviados en un zip base64.
- Cada lote utiliza un **dId (identificador secuencial)** por emisor/ambiente.

### Eventos

#### Cancelacion

- Solo si el documento fue **aprobado por SIFEN**.
- Debe realizarse dentro del plazo permitido (48 horas para facturas).
- Se envia como evento con la libreria `setapi`.

#### Inutilizacion De Numeracion

- Solo numeros que **no hayan sido usados** por documentos aprobados.
- Rango maximo: 1000.
- Motivo obligatorio (`<= 150` caracteres).

## Estados De Documentos (Maquina De Estados)

Cada Documento Electronico (DE) pasa por estados internos:

| Estado interno | Descripcion |
|----------------|-------------|
| DRAFT | Documento creado y validado localmente |
| XML_GENERATED | XML generado desde JSON |
| XML_SIGNED | XML firmado digitalmente |
| QR_ATTACHED | QR generado y agregado |
| QUEUED_SYNC | Encolado para envio sincronico |
| SENT_SYNC | Enviado por SYNC a SET |
| QUEUED_BATCH | Encolado para envio por lote |
| SENT_BATCH | Enviado por BATCH |
| APPROVED | Aprobado por SET/SIFEN |
| APPROVED_WITH_OBS | Aprobado con observaciones |
| REJECTED | Rechazado por SET/SIFEN |
| CANCEL_REQUESTED | Cancelacion solicitada |
| CANCELLED | Cancelado por evento |
| VOID_REQUESTED | Inutilizacion solicitada |
| VOIDED | Inutilizado |

## Flujos Principales

### Emision De FE (SYNC)

1. Recibir solicitud API.
2. Normalizar JSON.
3. Generar XML (`xmlgen`).
4. Firmar XML (`xmlsign`).
5. Generar QR AA002 (`qrgen`).
6. Guardar en BD.
7. Enviar a SET/SIFEN con `setapi.recibe`.
8. Guardar respuesta e interpretar estado.

### Emision De FE (BATCH)

1. Igual flujo hasta QR generado.
2. Guardar como listo para lote.
3. Worker agrupa hasta 50 documentos del mismo tipo.
4. Generar lote zip (Base64).
5. Enviar con `setapi.recibeLote`.
6. Consultar resultados con `setapi.consultaLote`.
7. Actualizar documentos.

### Cancelacion

1. Validar documento aprobado y dentro del plazo.
2. Generar payload para evento.
3. Enviar con `setapi.evento`.
4. Guardar resultado.

### Inutilizacion

1. Validar rango secuencial.
2. Validar que numeros no hayan sido usados.
3. Enviar con `setapi.evento`.
4. Guardar resultado.

### Consultas

- Consultar comprobante por CDC: estado interno + datos basicos.
- Consultar XMLs por CDC: XML sin firma, firmado y con QR.
- Consultar estado en SET/SIFEN: con cache y opcion de refresh.
- Listar facturas por filtros.
- Consultar eventos por CDC.

## Estructura De Archivos De Especificacion

El proyecto debe incluir como minimo:

- `AGENTS.md`
- `docs/`
- `spec/openapi.yaml`
- `docs/SPEC_*.md`
- `docs/PLAN_*.md`
- `docs/TASKS_*.md`

Estos documentos son la fuente de verdad operativa para cualquier agente y para el equipo.

## Rutas Relativas Obligatorias Para Documentacion

Cuando un cambio afecte operacion, contratos, comportamiento funcional, flujos administrativos o integraciones, el agente debe revisar y actualizar explicitamente las rutas que correspondan:

- `AGENTS.md`
- `docs/METODOLOGIA_SDD.md`
- `docs/SPEC_*.md`
- `docs/PLAN_*.md`
- `docs/TASKS_*.md`
- `spec/openapi.yaml`
- `docs/OPERACION_GIT_DEPLOY.md` cuando cambien reglas operativas o de deploy

Regla obligatoria:

- si las tareas no nacieron desde `SPEC`, `PLAN`, `TASKS` y `spec/openapi.yaml` cuando aplica, el agente debe detenerse, documentar primero y luego implementar.

## Repositorio — Directorios Requeridos

- `src/`
- `src/api/`
- `src/controllers/`
- `src/routes/`
- `src/domain/`
- `src/use-cases/`
- `src/services/`
- `src/infra/`
- `src/db/`
- `src/sifen/`
- `src/xml/`
- `src/batch/`
- `src/workers/`
- `src/config/`
- `src/migrations/`
- `tests/`
- `spec/openapi.yaml`
- `docs/`
- `AGENTS.md`

## Requisitos De Pruebas

### Tests Unitarios

- Generacion de XML (`xmlgen`) con mock de datos.
- Firma de XML (`xmlsign`) con mock de certificado.
- Generacion de QR (`qrgen`) con mock.
- Comunicacion con `setapi` con mocks.

### Tests De Integracion

- Flujo completo de emision SYNC.
- Flujo completo de emision BATCH.
- Eventos de cancelacion e inutilizacion.
- Consultas y listados.

## Convenciones De Codigo

- **TypeScript** obligatorio con tipados estrictos.
- **Repository pattern** para abstraccion de BD.
- Cumplir con el rango de validacion del Manual Tecnico S150.
- Cada modulo debe exponer interfaces claras para que cualquier agente pueda inspeccionar, modificar y verificar cambios con bajo acoplamiento.

## Contratos De API — Expectativas

Los endpoints deben estar definidos en **OpenAPI 3.0+** con:

- `requestBody` validado con esquemas JSON
- respuestas normalizadas
- documentacion autoexplicativa
- uso de HTTP status codes `200`, `201`, `400`, `409`, `422`, `500`

## Referencias Tecnicas

- **Manual Tecnico SIFEN v150 (Paraguay)** — regla de negocio y estructura maestra del XML.
- Repositorios de librerias:
  - `xmlgen`: <https://github.com/TIPS-SA/facturacionelectronicapy-xmlgen>
  - `xmlsign`: <https://github.com/TIPS-SA/facturacionelectronicapy-xmlsign>
  - `qrgen`: <https://github.com/TIPS-SA/facturacionelectronicapy-qrgen>
  - `setapi`: <https://github.com/TIPS-SA/facturacionelectronicapy-setapi>

## Guia Rapida Para Usar Este Archivo

1. Colocar este archivo en la raiz del repo.
2. Antes de pedirle trabajo a un agente, referenciar este archivo.
3. Al solicitar cambios, referenciar explicitamente:
   - la ruta `AGENTS.md`,
   - el `SPEC` aplicable,
   - el `PLAN` aplicable,
   - el `TASKS` aplicable,
   - `spec/openapi.yaml` si el cambio afecta contratos HTTP.
4. Pedir siempre alineacion con el flujo `SPEC -> PLAN -> TASKS -> IMPLEMENT`.

Este archivo es la fuente de contexto general para agentes y equipo. Si cambia la logica del negocio, el alcance o la forma de trabajo, este archivo debe actualizarse tambien.
