# Cierre Roadmap UI/UX Refinamiento v0.1

Fecha: 2026-05-19.

## Alcance Cerrado

- Navegacion operativa modular: `Informacion y estado`, `Nueva factura`, `Nueva nota de credito`, `Catalogo` y `Documentos`.
- Pantalla principal enfocada en facturacion directa.
- Branding con logos oficiales desde `apps/web-operacion/public/brand/`.
- Pantalla de informacion/readiness separada.
- Encabezado compacto de factura con facturador, RUC, establecimiento, punto, fecha, timbrado y siguiente numero estimado.
- Condicion credito con plazo 30/60/90 dias.
- Cliente seleccionado editable con accion `Actualizar`.
- Refresh de token sin desmontar el formulario operativo.
- Lineas de productos/servicios en grilla compacta con cabecera, truncado, editar y eliminar.
- Resultado posterior a emision simplificado con acciones rapidas y WhatsApp editable.
- Filtros de documentos por `Todos`, `Contado`, `Credito` y `Nota credito`.
- Pantalla propia de `Nueva nota de credito`.
- Endpoint de candidatas NCE y filtro operativo `tipo_operativo`.
- Catalogo local de receptores SIFEN test.
- Checklist manual de alta de facturador.
- Smoke operativo extendido para validar artefactos y NCE en modo opt-in.
- Ajuste pre despliegue de `Nueva factura`: productos como lista de venta, sin editor permanente, con bottom sheet enfocado en descripcion y opciones fiscales avanzadas ocultas.

## Evidencia Ejecutada

- `npm run test --workspace @facturacion-simple/api`: 87 tests OK.
- `npm run typecheck`.
- `npm run lint`.
- `npm run build`.
- `npm run qa:no-secrets`.
- `bash scripts/deploy.sh`.
- Playwright mobile contra contenedores:
  - `group1 navigation/branding ok`
  - `group3 invoice ui ok`
  - `group4 post emission delivery ok`
  - `group5 documents filters and nce screen ok`
  - `group6 ui refresh and navigation ok`
  - `invoice products UX ok`

## Pendiente De Validacion Externa

| ID | Estado | Motivo |
| --- | --- | --- |
| `EST-006` | `PENDING_VALIDATION` | El smoke ya valida documento publico, KUDE/PDF y XML con polling, pero FE devuelve error para KUDE/PDF. |
| `EST-007` | `PENDING_VALIDATION` | El smoke ya soporta `ONBOARDING_SMOKE_NCE=YES` y el payload NCE fue corregido; queda pendiente revalidar contra FE cuando no haya error externo. |

## Bloqueos Tecnicos Registrados

- KUDE/PDF: el endpoint local publico responde `502` porque `fe-api.ventax.app` devuelve `500` al resolver KUDE/PDF.
- NCE: la validacion real previa de FE rechazo `timbrado.documentoNro` `null`; el backend local ahora envia string para NCE aun cuando factura usa numeracion `SERVICE`.
- No se realizan mas reintentos contra FE por instruccion operativa del usuario ante errores externos.

## Observabilidad De Artefactos

Cuando falla la descarga publica de KUDE/PDF o XML, el backend registra un log estructurado con:

- `event: fiscal_artifact_fetch_failed`
- `requestId`
- `occurred_at`
- `endpoint`
- `artifact`
- `cdc`
- `numero_fiscal`
- `documento_estado`
- `gateway_code`
- `gateway_details`

Esto permite escalar el incidente a FE con CDC, numero fiscal, requestId, hora aproximada y endpoint usado.

## Definiciones Pendientes

- Confirmar con FE si NCE debe usar siempre numero sugerido local o si FE soportara numeracion automatica para NCE igual que factura.
- Confirmar SLA o demora esperada para disponibilidad de KUDE/PDF y XML despues de factura aprobada.
- Mantener actualizado el catalogo `docs/RECEPTORES_SIFEN_TEST_v0.1.md` con nuevos receptores aprobados o rechazados.

## Fuera De Alcance

- Abrir sesiones SSH o modificar servidores externos.
- Corregir internamente errores 500 de `fe-api.ventax.app`.
- Marcar `EST-006` o `EST-007` como DONE sin validacion externa exitosa.
