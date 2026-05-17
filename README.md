# Nuevo Proyecto Web Multi Facturador

Este directorio concentra el material copiado desde `facturacion-electronica` para iniciar un nuevo proyecto web que consumira ese backend como API fiscal.

La nueva aplicacion no debe copiar la logica SIFEN del backend. Debe consumir contratos HTTP, mantener su propia UX, usuarios, clientes, catalogo e interfaces operativas.

## Contenido

- `contexto_facturacion_electronica/docs_base/`: metodologia, alcance MVP, operacion/deploy y documentos base del backend actual.
- `contexto_facturacion_electronica/docs_integracion_backend/`: contratos y decisiones relevantes para consumir `facturacion-electronica` desde una app externa.
- `contexto_facturacion_electronica/docs_operacion_fiscal/`: informacion funcional sobre SIFEN, emision, NCE, tickets/KUDE y datos fiscales.
- `contexto_facturacion_electronica/docs_frontend_referencia/`: referencia del frontend administrativo existente, util solo como antecedente UX/operativo.
- `contexto_facturacion_electronica/spec/openapi.yaml`: contrato API actual.
- `contexto_facturacion_electronica/referencias_set/`: manuales y documentos oficiales/de soporte SET/SIFEN disponibles en el repo actual.
- `contexto_facturacion_electronica/referencias_emisor_ejemplo/`: documentos de ejemplo de un emisor real usados como referencia operativa.
- `contexto_facturacion_electronica/CONCEPTOS_FACTURACION_ELECTRONICA.md`: resumen practico de conceptos fiscales clave.
- `contexto_pos_graciela/EXTRACCION_ARQUITECTURA_SAAS_FACTURACION_SIMPLE.md`: lectura selectiva de POS Graciela para extraer patrones utiles de SaaS, facturadores, establecimientos, puntos, series, usuarios y aislamiento multi-tenant sin arrastrar inventario/POS.

## Material excluido

No se copio `documents_info/ALEXIS_DANIEL_DUARTE_CORONEL.pfx` porque es un certificado digital privado/sensible. Los certificados reales deben manejarse por canal seguro y nunca como documentacion base de un nuevo repo.
