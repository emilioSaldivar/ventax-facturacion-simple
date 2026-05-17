# TASKS Web App Multi Facturador Consumidora v0.1

Backlog de este repositorio para soportar una aplicacion web externa que consume `facturacion-electronica`.

No incluye construir la nueva web dentro de este repo.

Alineado a:
- `docs/SPEC_WEB_APP_MULTI_FACTURADOR_v0.1.md`
- `docs/PLAN_WEB_APP_MULTI_FACTURADOR_v0.1.md`
- `spec/openapi.yaml`

Estados:
- `PENDING`
- `PARTIAL`
- `DONE`
- `BLOCKED`

## Etapas

### Etapa C0 - Contrato De Integracion

Tareas:
- `WMC001`
- `WMC002`
- `WMC003`
- `WMC004`

Resultado:
- contrato claro para consumidor externo.

### Etapa C1 - Emision Simplificada

Tareas:
- `WMC005`
- `WMC006`
- `WMC007`
- `WMC008`

Resultado:
- endpoint para emitir desde payload simple.

### Etapa C2 - Consulta Y Artefactos

Tareas:
- `WMC009`
- `WMC010`
- `WMC011`

Resultado:
- consumidor externo puede consultar y descargar artefactos.

### Etapa C3 - Seguridad, Tests Y Documentacion

Tareas:
- `WMC012`
- `WMC013`
- `WMC014`
- `WMC015`

Resultado:
- integracion segura, testeada y documentada.

## Tareas

### WMC001 - Definir payload simplificado de emision
**Estado:** PENDING

**Objetivo:** permitir que una app externa emita sin conocer XML ni estructura SIFEN interna.

Actividades:
- definir campos de receptor;
- definir campos de items;
- definir condicion de operacion;
- definir metadata externa;
- definir respuesta normalizada.

**Criterio de aceptacion**
- el payload permite representar una factura simple tipo manual.

### WMC002 - Definir idempotencia por referencia externa
**Estado:** PENDING

**Objetivo:** evitar duplicados por reintentos del consumidor externo.

Actividades:
- definir `external_ref`;
- definir unicidad por `emisor_id`;
- definir respuesta ante replay;
- definir comportamiento si hubo rechazo SIFEN.

**Criterio de aceptacion**
- reintentar la misma referencia no duplica documento fiscal.

### WMC003 - Definir autenticacion server-to-server
**Estado:** PENDING

**Objetivo:** proteger endpoints consumidos por la nueva web.

Actividades:
- evaluar API key por consumidor/facturador;
- definir scopes por `emisor_id`;
- definir headers requeridos;
- documentar rotacion futura.

**Criterio de aceptacion**
- el consumidor externo tiene un mecanismo claro y testeable de acceso.

### WMC004 - Actualizar OpenAPI inicial
**Estado:** PENDING

**Objetivo:** documentar los contratos antes de implementar.

Actividades:
- agregar schemas;
- agregar endpoints;
- agregar ejemplos;
- agregar errores;
- agregar reglas de autenticacion.

**Criterio de aceptacion**
- `spec/openapi.yaml` puede ser usado por el equipo del nuevo proyecto.

### WMC005 - Implementar mapper de payload simplificado
**Estado:** PENDING

**Objetivo:** transformar receptor/items simples al formato fiscal existente.

**Criterio de aceptacion**
- tests cubren IVA 10%, IVA 5%, subtotales y datos obligatorios del receptor.

### WMC006 - Implementar endpoint de emision simplificada
**Estado:** PENDING

**Objetivo:** exponer una API usable por la app externa.

**Criterio de aceptacion**
- endpoint emite usando el flujo FE actual y devuelve estado normalizado.

### WMC007 - Persistir metadata externa
**Estado:** PENDING

**Objetivo:** permitir trazabilidad entre la app externa y el documento fiscal.

**Criterio de aceptacion**
- `external_ref` y metadata permitida quedan asociadas al documento.

### WMC008 - Tests de emision simplificada
**Estado:** PENDING

**Objetivo:** validar el flujo punta a punta.

**Criterio de aceptacion**
- test de integracion emite una factura contado simple desde payload externo.

### WMC009 - Consulta por external_ref
**Estado:** PENDING

**Objetivo:** permitir que la app externa encuentre documentos sin conocer `document_id`.

**Criterio de aceptacion**
- endpoint devuelve documento por `emisor_id + external_ref`.

### WMC010 - Revisar endpoints de artefactos
**Estado:** PENDING

**Objetivo:** asegurar descarga de XML/KUDE/PDF o metadata disponible.

**Criterio de aceptacion**
- consumidor externo sabe que artefactos existen y como descargarlos.

### WMC011 - Normalizar errores de consulta y artefactos
**Estado:** PENDING

**Objetivo:** evitar respuestas ambiguas para la app externa.

**Criterio de aceptacion**
- errores `404`, `409`, `422` y `500` tienen formato consistente.

### WMC012 - Tests de aislamiento multi-emisor
**Estado:** PENDING

**Objetivo:** impedir acceso cruzado entre facturadores.

**Criterio de aceptacion**
- credenciales de un emisor no consultan ni emiten para otro no autorizado.

### WMC013 - Tests de idempotencia
**Estado:** PENDING

**Objetivo:** validar reintentos seguros.

**Criterio de aceptacion**
- repetir `external_ref` devuelve el documento existente o error contractual definido.

### WMC014 - Guia de integracion para la nueva web
**Estado:** PENDING

**Objetivo:** documentar como consumir este backend.

Actividades:
- ejemplos de emision;
- ejemplos de consulta;
- reglas de reintento;
- artefactos;
- errores.

**Criterio de aceptacion**
- el equipo del nuevo proyecto puede integrarse sin leer codigo interno.

### WMC015 - Cierre documental
**Estado:** PENDING

**Objetivo:** mantener SDD consistente.

**Criterio de aceptacion**
- SPEC, PLAN, TASKS y OpenAPI reflejan el alcance final.
