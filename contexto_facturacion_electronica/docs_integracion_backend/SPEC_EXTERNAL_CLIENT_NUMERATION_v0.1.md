# SPEC EXTERNAL CLIENT NUMERATION v0.1

Este documento define el contrato funcional que `facturacion-electronica` debe ofrecer a clientes externos que consumen emision fiscal cuando:
- la emision online usa a `facturacion-electronica` como autoridad fiscal;
- el cliente externo necesita continuidad operativa local si FE no esta disponible;
- la sincronizacion posterior debe preservar idempotencia y trazabilidad.

Se redacta en continuidad con:
- `docs/SPEC_MVP_v0.1.md`
- `docs/MODELO_DATOS_MULTI_EMISOR_v0.1.md`
- `spec/openapi.yaml`

## 1) Proposito

Hacer que `facturacion-electronica` sea autonomo en numeracion fiscal online y que exponga un contrato estable para que:
- cualquier cliente externo siempre intente emitir online primero;
- el numero fiscal oficial final siempre sea decidido por FE;
- el numero sugerido por el cliente quede solo como referencia y auditoria;
- el cliente externo pueda reprocesar documentos pendientes cuando FE vuelva.

## 2) Alcance

### 2.1 Dentro de alcance
- emision de `POST /fcws/factura` con numeracion online gobernada por FE;
- respuesta fiscal con numero oficial asignado;
- soporte de referencias de cliente e idempotencia externa;
- uso de `GET /fcws/health` como senal basica de disponibilidad tecnica;
- preservacion del numero sugerido por el cliente solo como dato de referencia.
- seleccion de perfil de emision por codigo estable, sin delegar al cliente el control de serie fiscal o correlativo.

### 2.2 Fuera de alcance
- cola offline alojada dentro de FE;
- impresion local temporal del cliente;
- contingencia fiscal formal ante SIFEN;
- ready checks operativos mas ricos que `health` en esta iteracion.

## 3) Reglas funcionales

### RF-01 FE es autoridad de numeracion online
Para el flujo online normal:
- FE no debe depender del `documentoNro` enviado por un cliente externo para asignar la numeracion fiscal final.
- FE debe resolver el siguiente numero valido desde su propio `numeradores_documentos`.
- FE debe devolver en la respuesta el numero oficial asignado.

### RF-02 Numero sugerido del cliente solo para auditoria
Si el cliente envia:
- `timbrado.documentoNro`
- `numbering.requested_document_number`

FE puede persistirlos como referencia, pero no debe tratarlos como autoridad para el flujo online normal.

### RF-03 Respuesta fiscal completa
FE debe responder con identidad fiscal completa del documento emitido:
- `document_id`
- `cdc`
- `nro_factura`
- `timbrado.timbrado`
- `timbrado.establecimiento`
- `timbrado.puntoExpedicion`
- `timbrado.documentoNro`
- `timbrado.fecIni`
- `status`
- `delivery_mode`
- `idempotent`
- `emission_profile`
- `serie_operativa`
- `serie_fiscal`

### RF-03A Perfil de emision solicitado por cliente externo
El cliente externo puede enviar:
- `actividadEconomicaCodigo` obligatorio
- `emission_profile_code`
- `client_reference.operational_series`

Reglas:
- `actividadEconomicaCodigo` es obligatorio en toda emision y debe corresponder a una actividad activa del emisor.
- `emission_profile_code` es una clave operativa definida en FE.
- `client_reference.operational_series` es referencia comercial/auditoria del cliente, no serie fiscal SIFEN.
- FE resuelve `timbrado`, `establecimiento`, `puntoExpedicion`, `tipo_documento`, `serie_fiscal` y `documentoNro`.
- FE debe rechazar perfiles inactivos, no vigentes o sin numerador fiscal.
- Si el cliente no envia perfil, FE puede usar el perfil default del emisor solo si existe uno no ambiguo.

### RF-04 Idempotencia por referencia externa
FE debe aceptar metadata externa de cliente, por ejemplo:
- `source_system`
- `entity_type`
- `entity_id`
- `request_id`
- `idempotency_key`

Regla:
- retries del mismo documento no deben consumir nueva numeracion;
- FE debe devolver el documento ya emitido o la misma identidad funcional cuando corresponda.

### RF-05 Errores funcionales vs indisponibilidad
FE puede seguir respondiendo `4xx` o `409` para errores funcionales:
- payload invalido;
- configuracion faltante;
- validacion de negocio;
- uso manual invalido de numeracion;

pero el flujo online normal desde clientes externos no debe depender de coincidencia previa exacta entre el numero sugerido y el numerador FE.

### RF-06 Health basico
`GET /fcws/health` debe seguir respondiendo al menos:

```json
{
  "status": "ok",
  "service": "facturacion-electronica",
  "db": true
}
```

Los clientes externos pueden usar este endpoint para reactivar reprocesos pendientes.

## 4) Contrato esperado

### 4.1 Request de emision
FE debe soportar un request como:

```json
{
  "emisor_id": "80136968-1",
  "actividadEconomicaCodigo": "82110",
  "emission_profile_code": "SERV",
  "timbrado": {
    "timbrado": "80136968",
    "establecimiento": "001",
    "puntoExpedicion": "001",
    "fecIni": "2025-12-30",
    "documentoNro": "0001089"
  },
  "numbering": {
    "mode": "ONLINE",
    "authority": "SERVICE",
    "requested_document_number": "0001089"
  },
  "client_reference": {
    "source_system": "external-client",
    "entity_type": "sale",
    "entity_id": "68",
    "request_id": "mov-136",
    "idempotency_key": "mov-136",
    "operational_series": "SERV"
  }
}
```

Reglas:
- `actividadEconomicaCodigo` es obligatorio y selecciona la actividad declarada del emisor que debe usarse/validarse para el DE.
- `numbering.authority = SERVICE` significa que FE decide el correlativo final;
- `requested_document_number` se guarda solo como referencia.
- `emission_profile_code` identifica el perfil fiscal/operativo configurado en FE.
- `operational_series` no se debe copiar automaticamente al campo fiscal `dSerieNum`.

### 4.2 Response de emision

```json
{
  "document_id": "uuid",
  "cdc": "....",
  "nro_factura": "001-001-0001081",
  "timbrado": {
    "timbrado": "80136968",
    "establecimiento": "001",
    "puntoExpedicion": "001",
    "documentoNro": "0001081",
    "fecIni": "2025-12-30"
  },
  "status": "APPROVED",
  "delivery_mode": "SYNC",
  "idempotent": false,
  "number_source": "SERVICE",
  "emission_profile": {
    "code": "SERV",
    "description": "Servicios",
    "serie_operativa": "SERV",
    "serie_fiscal": null
  }
}
```

## 5) Reglas sobre numeracion

### 5.1 Online
- FE reserva y consume numeracion local propia.
- FE no debe requerir que el cliente “adivine” el siguiente numero exacto para el flujo online normal.
- FE resuelve el numerador desde el perfil de emision cuando el request incluye `emission_profile_code`.
- Si existe `serie_fiscal`, el numerador se controla por esa serie fiscal; si no existe, usa el numerador base.
- El cliente externo no puede solicitar reutilizar el mismo numero fiscal para otra actividad economica.
- La actividad solicitada solo selecciona/valida el perfil; no particiona por si sola la secuencia fiscal.
- En estrategia `SHARED_SEQUENCE`, el cliente debe entender que ambas actividades consumen una unica secuencia fiscal si opera con `numbering.authority = CLIENT`; con `SERVICE`, FE consumira esa secuencia compartida.
- En estrategia `FISCAL_SERIES`, el cliente solicita el perfil y FE resuelve la serie fiscal SIFEN valida.
- En estrategia `SEPARATE_EXPEDITION_POINT`, el cliente solicita el perfil y FE resuelve el punto de expedicion correspondiente.

### 5.1A Series
- La serie comercial del cliente puede ser libre (`SERV`, `VENTA`, caja, canal).
- La serie fiscal SIFEN no es libre; debe ser resuelta por FE y cumplir MT v150.
- No se debe usar `SERV` o `VENTA` como `dSerieNum` fiscal salvo que una regla normativa futura lo permita y se actualice este SPEC.
- Si el cliente necesita series comerciales separadas por actividad, debe enviar `emission_profile_code` y conservar su `operational_series`; FE devolvera la serie fiscal y numero fiscal final.

### 5.2 Manual o administrativo
El comportamiento estricto por `NUMERATION_MISMATCH` puede seguir existiendo para:
- flujos administrativos;
- reenvios especiales;
- operaciones manuales de soporte;

pero no debe ser la dependencia central del flujo comercial online normal de clientes externos.

## 6) Reglas de observabilidad
- FE debe registrar:
  - referencia de cliente recibida;
  - perfil solicitado;
  - serie operativa recibida;
  - serie fiscal resuelta;
  - numero sugerido recibido;
  - numero oficial finalmente asignado;
  - resultado de idempotencia.
- Estos logs deben quedar en el servicio `api`, no solo en workers o frontend.

## 7) Criterio de completitud
Para considerar este contrato completo:
1. FE acepta requests online de clientes externos sin depender del correlativo sugerido.
2. FE devuelve el numero fiscal oficial final.
3. FE soporta idempotencia por referencia externa.
4. El flujo online normal no vuelve a fallar por `NUMERATION_MISMATCH` entre cliente y FE.
5. `GET /fcws/health` sigue siendo suficiente como señal tecnica para reproceso local desde el cliente.
