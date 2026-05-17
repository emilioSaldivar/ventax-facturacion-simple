# PLAN EXTERNAL CLIENT NUMERATION v0.1

Este documento describe el plan tecnico para implementar lo definido en:
- `docs/SPEC_EXTERNAL_CLIENT_NUMERATION_v0.1.md`
- `docs/SPEC_MVP_v0.1.md`

## 1) Estrategia

La implementacion se divide en cuatro bloques:
1. contrato de request/response para clientes externos;
2. numeracion online gobernada por FE;
3. idempotencia y referencias externas;
4. observabilidad y health operativo.

## 2) Diseno objetivo

### 2.1 Numeracion online
El caso de uso `issue-fe` debe aceptar request de clientes externos sin depender del numero sugerido para decidir el correlativo final.

La fuente de verdad sigue siendo:
- `emisor_perfiles_emision`
- `numeradores_documentos`

El cliente externo no debe seleccionar directamente `serie_fiscal` ni consumir correlativos fiscales. Debe enviar un perfil (`emission_profile_code`) o una referencia comercial, y FE debe resolver el numerador fiscal final.

### 2.2 Request enriquecido
FE debe aceptar metadata adicional de clientes externos:
- `actividadEconomicaCodigo` obligatorio
- `emission_profile_code`
- `numbering.authority`
- `numbering.requested_document_number`
- `client_reference`
- `client_reference.operational_series`

Sin romper compatibilidad con requests ya existentes.

### 2.3 Respuesta enriquecida
La respuesta debe exponer explicitamente la identidad fiscal final asignada por FE, no solo `nro_factura` plano.
Debe incluir el perfil resuelto y distinguir:
- `serie_operativa`: etiqueta comercial/interna;
- `serie_fiscal`: valor fiscal SIFEN, nullable.

### 2.4 Idempotencia
La idempotencia debe apoyarse en referencia externa para retries de clientes.
La clave funcional esperada es:
- `request_id`
- o `idempotency_key`

## 3) Cambios por capa

### 3.1 Schema / contrato
- extender `factura.schema` para soportar:
  - `actividadEconomicaCodigo` obligatorio
  - `emission_profile_code`
  - bloque `numbering`
  - bloque `client_reference`
  - `client_reference.operational_series`

### 3.2 Resolver de tenant y numerador
- adaptar `TenantConfigResolver.resolveForEmission` para:
  - validar `actividadEconomicaCodigo` contra actividades activas del emisor;
  - resolver perfil de emision cuando exista `emission_profile_code`;
  - seguir consumiendo el siguiente numero desde FE;
  - no exigir coincidencia estricta del numero sugerido cuando `numbering.authority = SERVICE`;
  - validar que la serie fiscal, si existe, provenga del perfil y no del cliente.

### 3.3 Persistencia
- ampliar `de_documents` o la persistencia asociada para guardar:
  - numero solicitado por cliente;
  - referencia de cliente;
  - clave idempotente;
  - perfil de emision resuelto;
  - actividad economica solicitada/resuelta;
  - serie operativa recibida;
  - serie fiscal efectiva;
  si no existe lugar suficiente hoy en `json_input`.

### 3.4 API
- ajustar response de `POST /fcws/factura` para devolver bloque `timbrado` final.
- devolver `emission_profile`, `serie_operativa` y `serie_fiscal`.
- mantener `GET /fcws/health` estable para que clientes externos puedan usarlo como senal tecnica de recovery.

### 3.5 Logging
- loggear en `api`:
  - request recibido;
  - referencia externa;
  - perfil solicitado/resuelto;
  - serie operativa;
  - serie fiscal;
  - numero sugerido;
  - numero asignado;
  - resultado final;
  - camino idempotente si aplica.

## 4) Orden de implementacion recomendado
1. actualizar spec, plan y tasks;
2. crear/ajustar modelo de perfiles de emision;
3. extender schema de request y response;
4. adaptar `TenantConfigResolver`;
5. adaptar `IssueFEUseCase`;
6. persistir referencias externas, perfil y numero sugerido;
7. ajustar respuesta HTTP;
8. agregar tests;
9. validar integracion con clientes externos.

## 5) Riesgos

### 5.1 Compatibilidad hacia atras
Riesgo:
- romper clientes existentes que aun envian solo `timbrado.documentoNro`.

Mitigacion:
- hacer nuevos bloques opcionales;
- mantener request legacy compatible.

### 5.2 Reintentos duplicados
Riesgo:
- el cliente reprocesa y FE consume nueva numeracion.

Mitigacion:
- resolver idempotencia por referencia externa antes de pasar a emision efectiva.

### 5.3 Auditoria incompleta
Riesgo:
- perder visibilidad del numero sugerido por el cliente.

Mitigacion:
- persistir ese valor como referencia, aunque no gobierne la numeracion final.

## 6) Verificacion

Validaciones minimas:
1. Request online con `requested_document_number` diferente al siguiente local de FE no falla por mismatch cuando `authority = SERVICE`.
2. Request online con `emission_profile_code` resuelve el perfil fiscal correcto.
3. Request sin `actividadEconomicaCodigo` falla por contrato.
4. Request con actividad no activa/no cubierta falla con `422`.
5. `client_reference.operational_series` no modifica `serie_fiscal`.
6. FE responde con `documentoNro` oficial asignado.
7. Dos retries con misma referencia externa no consumen numeracion adicional.
8. `GET /fcws/health` sigue respondiendo igual.
