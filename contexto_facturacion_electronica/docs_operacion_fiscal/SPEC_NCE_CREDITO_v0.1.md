# SPEC NCE + FE CREDITO v0.1 — Extension SIFEN (MT v150)

Este documento extiende el alcance definido en `docs/SPEC_MVP_v0.1.md` para incorporar:
- `Nota de Credito Electronica (NCE)`
- `Factura Electronica a credito - modalidad plazo`
- `Factura Electronica a credito - modalidad cuotas`

Se redacta en continuidad con:
- `docs/SPEC_MVP_v0.1.md`
- `docs/PLAN_MVP_v0.1.md`
- `docs/MODELO_DATOS_MULTI_EMISOR_v0.1.md`
- `spec/openapi.yaml`

## 1) Proposito

Agregar el siguiente bloque funcional al backend:
- emitir `Nota de Credito Electronica` referenciando una `Factura Electronica`
- formalizar la emision FE `CREDITO` separando correctamente:
  - credito a `PLAZO`
  - credito en `CUOTAS`
- mantener el mismo pipeline SIFEN del MVP:
  - `xmlgen -> xmlsign -> qrgen -> setapi`
- mantener compatibilidad multi-emisor y la trazabilidad ya definida para `de_documents`, `de_send_attempts` y consultas

## 2) Base normativa tomada del Manual Tecnico v150

Este documento se apoya en el archivo:
- `documents_info/Manual Técnico Versión 150.pdf`

Consideraciones normativas relevantes verificadas en el MT v150:
- Los DE contemplados incluyen `Factura Electronica`, `Autofactura Electronica`, `Nota de Credito Electronica`, `Nota de Debito Electronica` y `Nota de Remision Electronica`.
- La transmision del DE firmado digitalmente contempla un plazo general de hasta `72 horas` desde la firma digital.
- El certificado digital se utiliza tanto para:
  - firmar el XML del DE y de eventos
  - autenticarse en los servicios SIFEN
- Cada DE debe estar firmado digitalmente con el certificado correspondiente al RUC del emisor.
- Para `Nota de Credito` o `Nota de Debito` (`C002=5 o 6`), el documento asociado permitido es `Factura Electronica`.
- Si el documento asociado es electronico (`H002=1`), debe informarse el `CDC` de la FE referenciada.
- Si el documento asociado es impreso (`H002=2`), el tipo de documento impreso debe ser `Factura` y deben informarse sus datos de referencia.
- La sumatoria de notas de credito no puede superar el total general de la FE asociada.
- Para operaciones a credito (`E601=2`), es obligatorio informar el grupo `E640`.
- Si la condicion a credito es `Plazo` (`E641=1`), debe informarse `E643`.
- Si la condicion a credito es `Cuota` (`E641=2`), debe informarse `E644`.

## 3) Alcance

### 3.1 Dentro de alcance
- Emision de `Nota de Credito Electronica` sobre una FE ya emitida.
- Validaciones locales previas al XML para referencia, moneda y montos.
- Persistencia de NCE usando la misma tabla `de_documents` con `tipo_documento='NCE'`.
- Consultas de NCE por CDC y XML asociado.
- Ajuste del request FE `CREDITO` para distinguir `PLAZO` y `CUOTAS`.
- Modelado de cuotas dentro del request y del mapper hacia `xmlgen`.
- Soporte SYNC/BATCH/AUTO para NCE, salvo restriccion futura de negocio por emisor.

### 3.2 Fuera de alcance
- `Nota de Debito Electronica` en esta iteracion.
- `Recibo de dinero`.
- Nuevos eventos especificos por NCE.
- Reversion automatica de saldo o cuenta corriente fuera del DE fiscal.
- KuDE especifico fuera de los datos que ya consume el componente externo.

## 4) Requisitos funcionales

### RF-01 Emision de NCE

El sistema debe permitir emitir una `Nota de Credito Electronica` con el mismo pipeline tecnico de FE:
1) validar request y referencia
2) construir `params + data` para `xmlgen`
3) generar XML
4) firmar XML
5) insertar QR
6) persistir artefactos y estado
7) enviar a SIFEN segun `envio.mode`

El documento debe persistirse con:
- `tipo_documento='NCE'`
- nueva clave fiscal interna:
  - `(emisor_id, env, tipo_documento, establecimiento, punto_expedicion, numero)`

### RF-02 Referencia obligatoria de la NCE

Toda NCE debe referenciar exactamente un documento asociado valido.

Reglas MVP:
- si la referencia es electronica:
  - `tipoDocumentoAsociado=ELECTRONICO`
  - `cdc` obligatorio
  - el CDC debe existir localmente o ser informado explicitamente para consulta/uso externo
  - el documento referenciado debe ser `FE`
- si la referencia es impresa:
  - `tipoDocumentoAsociado=IMPRESO`
  - deben informarse:
    - timbrado
    - establecimiento
    - punto de expedicion
    - numero de documento
    - tipo de documento impreso = `FACTURA`

No se debe permitir:
- referenciar otro tipo de DE distinto de FE
- informar mas de un documento asociado
- mezclar referencia electronica e impresa en el mismo request

### RF-03 Restricciones de negocio de la NCE

Validaciones minimas:
- la moneda de la NCE debe coincidir con la moneda de la FE asociada
- el total de la NCE no debe exceder el saldo documentable de la FE asociada
- si existen NCE previas asociadas, la suma acumulada no puede superar el total de la FE
- el motivo/codigo de emision debe ser obligatorio
- el receptor de la NCE debe ser consistente con la FE asociada cuando la referencia es electronica

Observacion:
- en esta version no se define aun logica contable de saldo abierta; solo validacion fiscal/documental minima

### RF-04 Emision FE Credito - Plazo

Cuando `condicionOperacion.tipo = CREDITO` y la modalidad sea `PLAZO`, el request debe informar:
- `credito.modalidad = PLAZO`
- `credito.plazoDias` o valor equivalente normalizado para `E643`

No debe informar:
- `cantidadCuotas`
- detalle de cuotas

El mapper debe generar:
- `E601=2`
- `E641=1`
- `E643` obligatorio

### RF-05 Emision FE Credito - Cuotas

Cuando `condicionOperacion.tipo = CREDITO` y la modalidad sea `CUOTAS`, el request debe informar:
- `credito.modalidad = CUOTAS`
- `credito.cantidadCuotas`

Opcionalmente puede informar detalle interno de cuotas para persistencia local y proyeccion futura, sin romper compatibilidad con `xmlgen`.

El mapper debe generar:
- `E601=2`
- `E641=2`
- `E644` obligatorio

No debe informar:
- `plazoDias`

### RF-06 Compatibilidad SIFEN

Para NCE y FE credito se debe mantener la misma estrategia actual de conexion:
- `xmlgen` para construir el XML MT v150
- `xmlsign` para firmar con PKCS#12
- `qrgen` para generar QR AA002
- `setapi.recibe` para SYNC
- `setapi.recibeLote` para BATCH
- `setapi.consulta` y `setapi.consultaLote` para consultas

Condiciones operativas a documentar y respetar:
- el XML enviado debe estar firmado
- el certificado debe contener el RUC del contribuyente conforme al MT v150
- el mismo certificado se usa para firma y autenticacion contra SIFEN segun la libreria/adaptador
- la transmision debe quedar dentro de la ventana operativa definida por el negocio; el MT v150 contempla una regla general de hasta 72 horas posteriores a la firma

### RF-07 Persistencia

Se debe extender la persistencia actual para soportar NCE y el credito refinado.

Minimos:
- `de_documents.tipo_documento` debe aceptar `NCE`
- `de_documents.json_input` debe almacenar el request completo de NCE o FE credito extendida
- si la NCE referencia un documento local, debe persistirse una relacion consultable

Se recomienda agregar:
- `referenced_document_id`
- `referenced_document_cdc`
- `credito_modalidad`
- `credito_cantidad_cuotas`
- `credito_plazo_dias`

Si se decide no agregar columnas en esta iteracion, al menos debe quedar todo en `json_input` y el plan debe dejar la migracion explicitada.

### RF-08 Consultas

El sistema debe extender consultas para:
- obtener NCE por CDC
- obtener XML de NCE
- listar documentos por `tipo_documento` incluyendo `NCE`
- consultar FE con filtro de credito `PLAZO` o `CUOTAS`

## 5) Requisitos no funcionales

### RNF-01 Seguridad
- no exponer password de P12, CSC ni secretos del emisor
- no loggear XML firmados completos cuando contengan datos sensibles

### RNF-02 Trazabilidad
- cada NCE debe dejar claro:
  - documento fuente
  - tipo de referencia
  - monto afectado
  - respuesta SIFEN

### RNF-03 Idempotencia
- la NCE debe ser idempotente por su propia clave fiscal
- no debe duplicarse por reintentos

### RNF-04 Compatibilidad incremental
- el cambio no debe romper `POST /factura` actual para `CONTADO`
- el request viejo de `CREDITO` debe migrarse o rechazarse con error claro si no informa modalidad suficiente

## 6) Contrato propuesto de API

### 6.1 Nuevo endpoint NCE
- `POST /fcws/nota-credito`

Request minimo propuesto:
- `emisor_id`
- `timbrado`
- `receptor`
- `fecha`
- `motivo`
- `referencia`
- `items`
- `envio`

### 6.2 Evolucion de `POST /fcws/factura`

Para `condicionOperacion.tipo='CREDITO'`, el contrato debe evolucionar a:
- `condicionOperacion.tipo`
- `condicionOperacion.credito.modalidad`
- `condicionOperacion.credito.plazoDias` cuando `PLAZO`
- `condicionOperacion.credito.cantidadCuotas` cuando `CUOTAS`

Compatibilidad:
- durante la transicion puede aceptarse el contrato anterior y normalizarlo
- al cerrar la transicion, el schema debe ser explicito

## 7) Criterios de aceptacion

1) Emision NCE SYNC:
   - genera XML, firma, QR y envio SIFEN
   - persiste `tipo_documento='NCE'`
   - retorna `cdc`, `status` y referencia asociada

2) NCE con referencia electronica:
   - exige `cdc`
   - no permite documento asociado distinto de FE

3) NCE con referencia impresa:
   - exige datos del documento impreso
   - el tipo de documento impreso debe ser factura

4) NCE con monto acumulado invalido:
   - rechaza localmente con `409` o `422` segun corresponda

5) FE credito a plazo:
   - exige `plazo`
   - no permite `cantidadCuotas`

6) FE credito a cuotas:
   - exige `cantidadCuotas`
   - no permite `plazo`

7) Conexion SIFEN:
   - usa el mismo certificado/configuracion por emisor ya resuelto en BD
   - no rompe los modos `SYNC`, `BATCH` ni `AUTO`

## 8) Dependencias documentales a actualizar luego

Una vez implementado este alcance, deberan alinearse:
- `spec/openapi.yaml`
- `docs/SPEC_MVP_v0.1.md`
- `docs/PLAN_MVP_v0.1.md`
- `docs/TASKS_MVP_v0.1.md`

Mientras tanto, este documento funciona como extension puntual y priorizada del MVP actual.
