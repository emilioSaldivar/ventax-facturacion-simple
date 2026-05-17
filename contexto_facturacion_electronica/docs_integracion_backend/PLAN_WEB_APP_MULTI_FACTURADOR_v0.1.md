# PLAN Web App Multi Facturador Consumidora v0.1

Este plan implementa `docs/SPEC_WEB_APP_MULTI_FACTURADOR_v0.1.md` desde el punto de vista de este repositorio: preparar `facturacion-electronica` para ser consumido por una aplicacion web externa.

No se construira la nueva aplicacion web dentro de este repositorio.

## 1. Enfoque

El trabajo aqui consiste en endurecer y completar la API fiscal:

- contratos OpenAPI para consumidores externos;
- payload simplificado de emision;
- idempotencia por referencia externa;
- consulta y descarga de artefactos;
- autorizacion por facturador/emisor;
- errores normalizados;
- documentacion de integracion.

La app externa implementara su propia UX, DB de clientes/items/usuarios y flujo operativo.

## 2. Arquitectura De Integracion

```text
Nueva web multi-facturador
  |-- usuarios, clientes, items, ventas
  |-- panel administrativo y operativo
  |
  | consume API REST
  v
facturacion-electronica
  |-- emisores fiscales
  |-- configuracion SIFEN
  |-- XML/firma/QR
  |-- envio y consulta SIFEN
  |-- artefactos fiscales
```

## 3. Contratos Necesarios

### 3.1 Readiness De Facturador

Endpoint para saber si un emisor puede emitir:
- configuracion fiscal completa;
- ambiente;
- certificado vigente;
- CSC vigente;
- timbrado/numerador;
- faltantes claros.

### 3.2 Emision Simplificada

Endpoint orientado a consumidor externo:
- recibe datos de receptor e items;
- recibe `external_ref` opcional;
- calcula/mapea payload fiscal;
- emite usando flujo existente;
- devuelve resultado normalizado.

Debe soportar idempotencia para evitar duplicar facturas si el consumidor reintenta.

### 3.3 Consulta

Consultas por:
- `document_id`;
- `cdc`;
- `external_ref`;
- `emisor_id`.

### 3.4 Artefactos

Endpoints para obtener:
- XML firmado;
- XML con QR;
- KUDE/PDF si existe;
- metadata de artefactos disponibles.

Si el backend no genera PDF/KUDE en la primera etapa, debe documentar claramente el estado y exponer datos suficientes para que el consumidor lo resuelva.

## 4. Seguridad

Primera opcion recomendada:
- API key server-to-server por consumidor o por facturador;
- scope por `emisor_id`;
- headers de trazabilidad;
- logs sin secretos.

Puntos a definir:
- rotacion de API keys;
- rate limit;
- permisos separados para configuracion fiscal vs emision;
- auditoria de llamadas externas.

## 5. Cambios En Este Repositorio

### Backend

- agregar schemas de emision simplificada;
- crear mapper desde payload simplificado a flujo FE actual;
- agregar idempotencia por `external_ref`;
- agregar consultas por referencia externa;
- revisar artefactos disponibles;
- normalizar errores para consumidor externo.

### OpenAPI

- documentar endpoints nuevos;
- documentar ejemplos de payload;
- documentar errores;
- documentar estados;
- documentar autenticacion.

### Tests

- unitarios para mapper;
- integracion para emision simplificada;
- integracion para idempotencia;
- integracion para consulta por `external_ref`;
- seguridad multi-emisor.

### Documentacion

- guia de integracion para la app externa;
- ejemplos de request/response;
- reglas de reintento;
- reglas de artefactos.

## 6. Lo Que Queda En El Nuevo Proyecto

- modelo de usuarios propios;
- roles de administrador/operador del cliente;
- clientes globales y por facturador;
- catalogo de items;
- pantalla tipo factura manual;
- popup de cliente;
- codigos tipo `FAC1-...`;
- envio por WhatsApp/correo;
- storage de negocio si decide no usar artefactos directos de este backend.

## 7. Fases

### Fase C0 - Contrato De Integracion

- precisar payload simplificado;
- actualizar OpenAPI;
- definir autenticacion;
- definir idempotencia.

### Fase C1 - Mapper Y Endpoint De Emision

- implementar mapper;
- endpoint de emision simplificada;
- tests de totales/IVA;
- soporte para `external_ref`.

### Fase C2 - Consultas Y Artefactos

- consulta por `external_ref`;
- endpoints de artefactos;
- metadata de descargas;
- errores claros cuando artefacto no existe.

### Fase C3 - Seguridad Y QA

- scopes por emisor;
- pruebas de aislamiento;
- documentacion de integracion;
- smoke test para consumidor externo.

## 8. Decisiones Pendientes

- autenticacion final;
- si el endpoint simplificado acepta credito en v0.1;
- si PDF/KUDE lo genera este backend o la app externa;
- si los links publicos se firman aqui o afuera;
- contrato exacto de idempotencia ante rechazo SIFEN.
