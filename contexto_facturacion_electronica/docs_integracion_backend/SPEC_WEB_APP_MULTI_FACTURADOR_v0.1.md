# SPEC Web App Multi Facturador Consumidora v0.1

Este documento define como `facturacion-electronica` debe ser consumido por una aplicacion web externa multi-facturador.

La aplicacion web nueva no forma parte de este repositorio. Este repositorio actua como backend fiscal/API de facturacion electronica: configuracion SIFEN, generacion XML, firma, QR, envio, consulta, artefactos y estados.

Se alinea con:
- `AGENTS.md`
- `docs/METODOLOGIA_SDD.md`
- `docs/SPEC_MVP_v0.1.md`
- `docs/SPEC_FRONTEND_MVP_v0.1.md`
- `docs/MODELO_DATOS_MULTI_EMISOR_v0.1.md`
- `spec/openapi.yaml`

## 1. Proposito

Permitir que un nuevo proyecto web multi-facturador consuma `facturacion-electronica` como servicio fiscal, sin acoplar su UI, usuarios finales, clientes comerciales, catalogo de items ni experiencia operativa a este repositorio.

La nueva aplicacion web sera responsable de:
- panel administrativo del cliente final;
- panel operativo simple tipo factura manual;
- usuarios administradores y operadores propios;
- clientes comerciales;
- items/productos/servicios;
- UX de transicion desde factura manual a electronica;
- entrega amigable al cliente final.

`facturacion-electronica` sera responsable de:
- facturadores/emisores fiscales;
- configuracion SIFEN necesaria;
- emision fiscal;
- XML firmado y con QR;
- envio/consulta SIFEN;
- estados;
- exposicion de artefactos descargables o integrables.

## 2. Limite De Responsabilidad

### Dentro de este repositorio

- API fiscal versionada y documentada.
- OpenAPI alineado a consumidores externos.
- Configuracion fiscal de emisores/facturadores.
- Validacion fiscal requerida para emitir.
- Emision FE/NCE segun alcance vigente.
- Consulta por CDC/documento.
- Exposicion de XML y, cuando aplique, KUDE/PDF o metadatos para que el consumidor lo entregue.
- Seguridad de acceso a endpoints por facturador/emisor.

### Fuera de este repositorio

- UI web multi-facturador.
- Administracion funcional de usuarios finales del cliente.
- Base global de clientes comerciales.
- Clientes propios de cada facturador.
- Catalogo de items/productos/servicios.
- Codigos de producto visibles para el usuario final.
- Experiencia de venta tipo factura manual.
- Envio por WhatsApp o correo desde la aplicacion web, salvo que use endpoints de descarga/artefactos de este backend.
- Storage de negocio propio del nuevo proyecto, salvo decision explicita de usar artefactos servidos por este backend.

## 3. Objetivos De Integracion

- Exponer contratos simples para que el proyecto externo emita facturas sin enviar XML ni conocer detalles SIFEN.
- Permitir alta/configuracion fiscal de multiples facturadores mediante API administrativa.
- Permitir que el consumidor externo relacione sus usuarios/clientes/items con documentos fiscales emitidos.
- Devolver identificadores suficientes para trazabilidad:
  - `emisor_id`;
  - `document_id`;
  - `cdc`;
  - numero fiscal;
  - estado interno;
  - estado SIFEN;
  - URLs o endpoints de artefactos.
- Mantener aislamiento por facturador/emisor.

## 4. Modelo De Consumo Esperado

La web externa mantiene su propio dominio:

```text
web-app-externa
  facturadores propios
  administradores y operadores
  clientes globales/locales
  items/productos/servicios
  ventas o facturas operativas
      -> llama a facturacion-electronica para emitir DE
```

`facturacion-electronica` recibe una solicitud fiscal normalizada y devuelve el resultado de emision.

## 5. Payload De Emision Para Consumidor Externo

El consumidor externo no debe enviar XML ni estructura interna de librerias SIFEN.

Debe poder enviar:
- identificador de facturador/emisor fiscal;
- identificador externo opcional de venta/factura;
- datos fiscales del receptor:
  - razon social/nombre;
  - RUC, CI u otro documento valido;
  - correo opcional;
  - direccion opcional;
- condicion de operacion;
- items:
  - cantidad;
  - codigo opcional;
  - descripcion;
  - precio unitario;
  - tasa IVA 5% o 10%;
- observaciones opcionales;
- metadata externa opcional para trazabilidad.

El backend debe mapear este payload al formato fiscal vigente.

## 6. Artefactos Y Entrega

La web externa necesita obtener o referenciar:
- XML sin firma cuando aplique soporte;
- XML firmado;
- XML con QR;
- KUDE/PDF si este backend lo genera;
- estado SIFEN;
- datos para descarga por CDC/documento.

La entrega al cliente final por WhatsApp, correo o enlace puede vivir en el nuevo proyecto. Este repositorio solo debe garantizar endpoints estables para descargar o consultar los artefactos que produce.

## 7. Requisitos De API

Este repositorio debe exponer contratos claros para consumidores externos:

- onboarding/configuracion fiscal de facturadores;
- readiness de facturador;
- emision fiscal simplificada;
- consulta por `document_id`, `external_ref` o `cdc`;
- descarga de artefactos;
- consulta de estado SIFEN;
- errores normalizados.

Todos los endpoints nuevos o ajustados deben quedar en `spec/openapi.yaml`.

## 8. Seguridad

- El consumidor externo no debe poder acceder a emisores no autorizados.
- Los endpoints deben soportar autenticacion/credenciales apropiadas para integracion server-to-server.
- Los secretos fiscales no deben exponerse al consumidor externo.
- Las respuestas deben evitar datos sensibles innecesarios.
- La autorizacion real debe residir en este backend para recursos fiscales.

## 9. Criterios De Aceptacion

- existe OpenAPI suficiente para que una app externa emita y consulte documentos;
- la app externa puede enviar una factura simple sin conocer XML/SIFEN;
- el backend devuelve `document_id`, `cdc`, numero fiscal y estados;
- la app externa puede descargar o enlazar artefactos;
- el backend conserva aislamiento por `emisor_id`;
- la configuracion fiscal sensible sigue protegida;
- no se implementa la UI multi-facturador dentro de este repositorio.

## 10. Preguntas Abiertas

- si la app externa usara API administrativa de este backend para configurar facturadores o si eso quedara a cargo de soporte;
- mecanismo definitivo de autenticacion server-to-server;
- si KUDE/PDF se generara en este backend o en la app externa usando datos/XML;
- si los enlaces publicos de descarga viven en este backend o en la app externa;
- formato final de `external_ref` para idempotencia y trazabilidad;
- alcance inicial: solo contado o contado y credito.
