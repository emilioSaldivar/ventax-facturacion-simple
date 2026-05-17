# PLAN NCE + FE CREDITO v0.1

Este documento describe el plan tecnico para implementar lo definido en:
- `docs/SPEC_NCE_CREDITO_v0.1.md`
- `docs/SPEC_MVP_v0.1.md`

La estrategia es incremental:
1. `Nota de Credito Electronica`
2. `Factura Electronica a credito - Plazo`
3. `Factura Electronica a credito - Cuotas`

## 1) Principios de implementacion

- Reutilizar el pipeline actual de FE tanto como sea posible.
- Extender el dominio para soportar mas de un tipo de documento, evitando duplicar codigo.
- Mantener compatibilidad con multi-emisor y con la resolucion actual de configuracion fiscal y secretos.
- Incorporar validaciones locales antes de llegar a `xmlgen` cuando la regla viene clara del MT v150.

## 2) Diseno objetivo

### 2.1 Generalizar el pipeline de emision

El flujo actual hoy esta centrado en `FE`. La implementacion debe moverse hacia un pipeline comun para `DE`:
- resolver emisor/configuracion
- validar request por tipo documental
- mapear a `params/data`
- generar XML
- firmar
- generar QR
- persistir
- transmitir segun modo

Se recomienda separar:
- `IssueFEUseCase` actual como compatibilidad
- nuevo servicio/base compartida para `emitir documento`
- mappers independientes por tipo documental

### 2.2 Tipos documentales

Codigos internos propuestos:
- `FE`
- `NCE`

Codigos MT v150 relevantes:
- `FE -> C002=1`
- `NCE -> C002=5`

`NDE` no entra en esta fase.

## 3) Fase 1 — Nota de Credito Electronica

### 3.1 Dominio y contrato

Agregar nuevo schema y tipos:
- `nota-credito.schema.ts`
- `nota-credito.types.ts`

Campos clave:
- identidad del emisor
- timbrado
- receptor
- fecha
- motivo de emision
- referencia al documento asociado
- items o detalle de ajuste
- envio

La referencia debe modelarse como union discriminada:
- `ELECTRONICO`
- `IMPRESO`

### 3.2 Mapper NCE

Crear mapper especifico:
- `nce.mapper.ts`

Responsabilidades:
- construir `params` reutilizando configuracion del emisor
- construir `data` con `tipoDocumento=5`
- poblar grupo `E400-E499`
- poblar grupo de documento asociado `H001-H...`
- mantener moneda consistente con la FE asociada cuando corresponda

### 3.3 Resolucion de documento asociado

Agregar servicio/repositorio para resolver la referencia:
- si `referencia` es electronica y el CDC existe localmente:
  - usar `de_documents`
  - validar `tipo_documento='FE'`
  - usar moneda, receptor y total para validaciones
- si el CDC no existe localmente:
  - permitir referencia externa solo si el negocio lo aprueba
  - marcar la validacion como limitada

Primera recomendacion:
- en MVP extendido, exigir FE local para NCE electronica
  - simplifica validaciones de monto acumulado
  - evita emitir NCE ciega sobre documentos no controlados localmente

### 3.4 Persistencia de NCE

Alternativa recomendada:
- agregar columnas nuevas en `de_documents`:
  - `referenced_document_id`
  - `referenced_document_cdc`
- agregar indices de consulta por referencia

Alternativa minima:
- guardar solo en `json_input`

La recomendada es preferible porque:
- simplifica consultas
- simplifica validacion de acumulado
- prepara futuras NDE/NRE

### 3.5 Validacion de acumulado

Implementar un query de agregacion para totalizar NCE aprobadas o pendientes relevantes por FE referenciada.

Regla local:
- `suma_notas_credito_aprobadas_o_emitidas <= total_factura_referenciada`

Si no existe persistencia de `total_documento`, se debe introducir:
- total operativo en `json_input`
- o columna normalizada

### 3.6 Ruta y use case

Agregar:
- `POST /fcws/nota-credito`
- `IssueNCEUseCase`

El comportamiento de envio debe replicar FE:
- `SYNC`
- `BATCH`
- `AUTO`

## 4) Fase 2 — FE Credito a Plazo

### 4.1 Evolucion del schema FE

Refactor del request actual de factura:
- separar `condicionOperacion.tipo`
- agregar `condicionOperacion.credito`

Modelo objetivo:
- `tipo='CONTADO'`
- `tipo='CREDITO'` con:
  - `modalidad='PLAZO'`
  - `plazoDias`

### 4.2 Mapper FE credito plazo

Actualizar `fe.mapper.ts` para producir:
- `E601=2`
- `E641=1`
- `E643=plazo`

Eliminar ambiguedad actual donde credito se construye con un bloque generico.

### 4.3 Validaciones

Reglas:
- `pagos` no deben venir en credito si el contrato de negocio no los contempla
- `plazoDias` obligatorio para `PLAZO`
- `cantidadCuotas` no permitida para `PLAZO`

## 5) Fase 3 — FE Credito a Cuotas

### 5.1 Evolucion del schema FE

Agregar para credito:
- `modalidad='CUOTAS'`
- `cantidadCuotas`
- opcional: `cuotas[]` para uso interno o evolucion futura

### 5.2 Mapper FE credito cuotas

Actualizar `fe.mapper.ts` para producir:
- `E601=2`
- `E641=2`
- `E644=cantidadCuotas`

Si el `xmlgen` soporta mayor granularidad de cuotas, integrarla en esta fase. Si no, limitarse a los campos requeridos del MT v150.

### 5.3 Validaciones

Reglas:
- `cantidadCuotas` obligatoria
- `plazoDias` no permitido
- si se informa `cuotas[]`, la longitud debe coincidir con `cantidadCuotas`

## 6) Conexion con SIFEN

### 6.1 Certificado y firma

Mantener la estrategia actual:
- firma XML con `xmlsign`
- autenticacion/transporte con `setapi`

Condiciones documentadas:
- el certificado del emisor debe contener el RUC conforme MT v150
- debe servir para firma digital y para autenticacion mutua con SIFEN
- el XML debe estar firmado antes del envio

### 6.2 Ventana de transmision

El MT v150 establece como regla general:
- hasta `72 horas` desde la firma digital

Implicacion en el sistema:
- `BATCH` y `AUTO` no pueden dejar documentos indefinidamente pendientes
- la agenda batch debe ser revisada luego para no incumplir esa ventana

### 6.3 Adaptador setapi

No se requiere un adaptador nuevo.

Se debe verificar que:
- `setapi.recibe` acepta XML NCE sin tratamiento especial
- `setapi.recibeLote` siga agrupando por `tipo_documento`
- consultas y trazabilidad distingan `NCE` de `FE`

## 7) Cambios por capa

### 7.1 Domain
- nuevo schema y tipos para NCE
- refactor del schema FE credito
- tipos comunes para `tipo_documento`

### 7.2 Services
- `nce.mapper.ts`
- helper para referencia de documento asociado
- helper de validacion de credito FE

### 7.3 Use cases
- `issue-nce.use-case.ts`
- posible `issue-de.use-case.ts` comun a futuro

### 7.4 API
- nueva ruta `nota-credito.route.ts`
- ajuste de `factura.route.ts`

### 7.5 DB
- migraciones para referencia documental y campos normalizados de credito si se aprueban
- queries de acumulado de NCE por documento fuente

### 7.6 Tests
- unit de schema y mapper NCE
- unit de credito `PLAZO`
- unit de credito `CUOTAS`
- integracion de rutas y use cases con mocks

## 8) Orden de ejecucion recomendado

1. crear documentos y contrato interno
2. agregar schema/tipos NCE
3. agregar mapper NCE
4. agregar persistencia de referencia
5. implementar `IssueNCEUseCase`
6. agregar endpoint y tests
7. refactor FE credito a `PLAZO`
8. refactor FE credito a `CUOTAS`
9. actualizar OpenAPI y docs principales

## 9) Riesgos

### 9.1 Riesgo de modelar NCE sin saldo disponible
- mitigacion: exigir FE local y calcular acumulado local

### 9.2 Riesgo de incompatibilidad con `xmlgen`
- mitigacion: validar temprano contra la estructura real que soporta la libreria

### 9.3 Riesgo de romper FE credito existente
- mitigacion: introducir compatibilidad transitoria en el schema y tests de regresion

### 9.4 Riesgo operativo de BATCH
- mitigacion: revisar configuracion batch para respetar la ventana general de 72 horas del MT
