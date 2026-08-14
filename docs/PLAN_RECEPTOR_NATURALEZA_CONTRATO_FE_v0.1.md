# PLAN Receptor Naturaleza y Contrato FE v0.1

## Alineacion

- `docs/SPEC_RECEPTOR_NATURALEZA_CONTRATO_FE_v0.1.md`
- `AGENTS.md`
- `spec/openapi.yaml`

## Estrategia Tecnica

Cambio aditivo en tres capas: modelo de datos de cliente, API/tipos propios, y mapeo saliente hacia `facturacion-electronica`. Se agrega ademas una correccion menor de tipos en el cliente del gateway fiscal para no perder el nuevo valor `SYNC_FALLBACK_BATCH` de NCE. No se toca logica fiscal (XML, firma, SIFEN): eso sigue siendo responsabilidad exclusiva de `facturacion-electronica`.

## Modelo De Datos

Migracion `db/migrations/0029_cliente_naturaleza.sql`:

```sql
alter table cliente_identidades
  add column naturaleza text not null default 'FISICA';

alter table cliente_identidades
  add constraint cliente_identidades_naturaleza_check
  check (naturaleza in ('FISICA', 'JURIDICA'));

alter table facturador_clientes
  add column naturaleza text not null default 'FISICA';

alter table facturador_clientes
  add constraint facturador_clientes_naturaleza_check
  check (naturaleza in ('FISICA', 'JURIDICA'));
```

Se agrega en ambas tablas (identidad global y agenda por facturador) siguiendo el mismo patron de duplicacion que ya existe para `razon_social`/`direccion`/`telefono`/`email` (agenda puede personalizar el dato del facturador sin afectar la identidad global compartida). Default `FISICA` en la columna evita backfill manual y preserva el comportamiento actual para todo registro existente.

## Cambios De Tipos Y API Propia

- `apps/api/src/modules/clientes/clientes.types.ts`:
  - agregar `export const clienteNaturalezaTipos = ["FISICA", "JURIDICA"] as const;` y `export type ClienteNaturaleza = (typeof clienteNaturalezaTipos)[number];`;
  - agregar `naturaleza?: ClienteNaturaleza` a `ClienteUpsertInput` (opcional, el repositorio aplica default `FISICA` si se omite);
  - agregar `naturaleza: ClienteNaturaleza` a `ClienteSearchResult`/`ClienteResponse`.
- `apps/api/src/modules/clientes/clientes.repository.ts`: incluir `naturaleza` en `SELECT`/`INSERT`/`UPDATE` de `cliente_identidades` y `facturador_clientes`, con `COALESCE(?, 'FISICA')` en escritura para tolerar payloads sin el campo.
- `apps/api/src/modules/clientes/clientes.routes.ts`: validar `naturaleza` con Zod (`z.enum(["FISICA", "JURIDICA"]).optional()`) en los schemas de alta/edicion.
- `spec/openapi.yaml`: agregar `naturaleza` (enum `FISICA`/`JURIDICA`, default `FISICA`) a `ClienteUpsertRequest` y a los schemas de respuesta de cliente (los bloques en `spec/openapi.yaml:2258`, `2282`, `2341`, `2493` que ya listan `documento_tipo`/`razon_social`).

## Sugerencia No Vinculante En UI

Backend, `apps/api/src/modules/clientes/clientes.service.ts` (junto a `isJuridicaByRuc()`, linea ~179):

- agregar constante `SUFIJOS_SOCIETARIOS = ["S.A.", "S.R.L.", "S.C.S.", "E.A.S.", "LTDA", "LTDA.", "COOP", "COOP.", "S.A.E.C.A.", "SACI", "EIRL"]` (lista cerrada, comparacion case-insensitive contra el final/tokens de `razon_social`, normalizando puntos para tolerar variantes como "SA" vs "S.A.");
- agregar `sugerirNaturaleza(ruc: string, razonSocial?: string): ClienteNaturaleza`: retorna `JURIDICA` si `isJuridicaByRuc(ruc)` es true **o** si `razonSocial` matchea algun sufijo de `SUFIJOS_SOCIETARIOS`; retorna `FISICA` en caso contrario (incluye el caso `razonSocial` vacio/undefined, donde solo pesa la longitud del RUC);
- exponer el resultado de `sugerirNaturaleza()` en el payload de autocompletado DNIT existente (mismo endpoint que ya hoy sugiere `nombre`/`apellido`/`razon_social`), agregando el campo `naturaleza_sugerida?: ClienteNaturaleza`. Fuente unica en backend: el frontend nunca recalcula la heuristica, solo la muestra.

Frontend, `apps/web-operacion/src/main.tsx`, en el formulario de alta/edicion de cliente (`draft` de cliente, cerca de los flujos de autocompletado DNIT existentes):

- agregar selector para el campo `naturaleza` (radio/select con opciones "Fisica"/"Juridica"), label visible en UI **"Tipo de Persona"** (ver "Nota de Terminologia SIFEN" en el SPEC — el nombre del campo en codigo/API sigue siendo `naturaleza` para no romper el contrato con el proveedor, solo el label mostrado al operador difiere), visible solo cuando `documento_tipo === 'RUC'`;
- al recibir `naturaleza_sugerida` de la respuesta de autocompletado DNIT, o al tipear manualmente un RUC/razon_social que dispare la heuristica de backend (requiere una llamada liviana de re-evaluacion, o replicar solo el chequeo de longitud de RUC en frontend como fallback inmediato mientras se espera la respuesta del backend — a definir en TASKS), prellenar `naturaleza=JURIDICA` como sugerencia editable con copy "Sugerido segun RUC/razon social, verificar con el cliente";
- el prellenado nunca se guarda solo; el operador debe confirmar/tocar el campo o continuar con el default de la sugerencia, igual que hoy pasa con nombre/razon social sugeridos.

## Mapeo Saliente Hacia FE

`apps/api/src/modules/fiscal-gateway/fiscal-gateway.client.ts`:

- `buildReceptor()` (linea ~1323): agregar `...(cliente.documento_tipo === "RUC" && cliente.naturaleza ? { naturaleza: cliente.naturaleza } : {})` al objeto retornado, solo para RUC (igual restriccion que el proveedor aplica del lado FE, redundante mas no contradictoria).
- Extender el tipo `FiscalEmitFacturaRequest["cliente"]` (`fiscal-gateway.types.ts`) con `naturaleza?: "FISICA" | "JURIDICA"`.
- Ubicar los dos call-sites que arman `request.cliente` para emision de factura/NCE (`fiscal-gateway.client.ts:1202`, `1242` aprox.) y confirmar que reciben `naturaleza` desde el cliente resuelto (agenda/identidad) antes de llamar `buildReceptor()`.

## Correccion `delivery_mode` NCE

- `apps/api/src/modules/fiscal-gateway/fiscal-gateway.types.ts`: `export type FiscalDeliveryMode = "SYNC" | "BATCH" | "AUTO_FALLBACK_BATCH" | "SYNC_FALLBACK_BATCH";`.
- `mapDeliveryMode()` (`fiscal-gateway.client.ts:1448`): agregar `"SYNC_FALLBACK_BATCH"` a la comparacion de valores aceptados.
- Confirmar que `mapFiscalEnvioModo()` sigue devolviendo `"BATCH"` para este nuevo valor (comportamiento correcto: el documento efectivamente termino en cola), sin cambios adicionales en esa funcion.
- Revisar si hay UI/logs que muestren `delivery_mode` textual al operador y, si existe, agregar el nuevo valor a cualquier mapa de etiquetas (busqueda: `AUTO_FALLBACK_BATCH` en `apps/web-operacion`).

## Orden De Implementacion

1. Migracion `0029_cliente_naturaleza.sql` + validar contra Postgres local.
2. Tipos y repositorio de clientes (`clientes.types.ts`, `clientes.repository.ts`, `clientes.routes.ts`).
3. `spec/openapi.yaml`.
4. `fiscal-gateway.types.ts` + `fiscal-gateway.client.ts` (`buildReceptor`, `mapDeliveryMode`, tipo `FiscalDeliveryMode`).
5. UI de cliente en `apps/web-operacion` (campo + sugerencia no vinculante).
6. Tests unitarios/integracion.
7. Validacion Playwright del formulario de cliente (mobile-first + un viewport desktop).

## Validaciones

- Backend: `npm run test --workspace @facturacion-simple/api`, `npm run typecheck --workspace @facturacion-simple/api`, `npm run lint --workspace @facturacion-simple/api`.
- Frontend: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`.
- Migracion validada contra Postgres real (no solo contra mocks), siguiendo la leccion ya registrada de la migracion 0028 (bug de JOIN que solo aparecio contra Postgres real).
- Playwright: alta de cliente con RUC largo (sugerencia Juridica visible y editable), alta de cliente con RUC corto/CI (sin sugerencia), edicion de cliente existente sin tocar `naturaleza` (no debe forzar cambio).
- Deploy: `bash scripts/deploy.sh` antes de smoke test end-to-end si se requiere verificar contra el stack containerizado.

## Riesgos

- **Divergencia de heuristica**: si la sugerencia de Juridica se calcula tanto en frontend como en backend con reglas ligeramente distintas, puede confundir al operador. Mitigacion: una sola fuente (backend, `sugerirNaturaleza()`) expone la sugerencia en la respuesta de autocompletado/lookup DNIT existente; el fallback inmediato de frontend (si se implementa) se limita a la senal de longitud de RUC, nunca a los sufijos societarios, para minimizar el riesgo de divergencia.
- **Falsos positivos/negativos de sufijos societarios**: una razon social que contenga por coincidencia un token similar a un sufijo (o un sufijo mal escrito/abreviado distinto a la lista cerrada) puede sugerir mal. Mitigacion: sigue siendo solo sugerencia editable, nunca autocompletado silencioso; lista de sufijos acotada y revisable si se detectan falsos positivos frecuentes en uso real.
- **Falso sentido de automatizacion**: un operador podria asumir que el sistema "sabe" el tipo de persona real. Mitigacion: copy explicito en la UI ("Sugerido segun formato de RUC, verificar con el cliente") y el hallazgo documentado en el SPEC para no reintroducir esa suposicion en el futuro.
- **Datos historicos**: clientes ya cargados quedan con `naturaleza=FISICA` por default aunque en la realidad sean juridicos; no se corrigen automaticamente (igual postura que adopto el proveedor para documentos ya `APPROVED`). El operador puede editarlos manualmente sin migracion de datos adicional.
- **Contrato FE**: cambio aditivo, sin romper compatibilidad; si se omite `naturaleza` en el request a FE, el proveedor sigue aplicando su propio default `FISICA`.

## Estrategia De Testing

- Unit: `clientes.repository.ts` (persistencia de `naturaleza`, default cuando se omite), `buildReceptor()` (incluye `naturaleza` solo para RUC, ausente para otros tipos), `mapDeliveryMode()` (reconoce `SYNC_FALLBACK_BATCH`), `sugerirNaturaleza()` (RUC largo sin sufijo → Juridica; RUC corto con sufijo societario → Juridica; RUC corto sin sufijo → Fisica; `razonSocial` undefined → solo pesa longitud de RUC).
- Integracion: rutas de clientes (`POST`/`PUT /clientes`) aceptan y devuelven `naturaleza`; ruta de emision de factura/NCE con cliente `JURIDICA` refleja el campo en el payload enviado al gateway fiscal (mock).
- E2E/Playwright: flujo completo de alta de cliente con RUC largo, edicion posterior, y emision de factura verificando que el payload saliente (interceptado en el mock del gateway) incluya `naturaleza`.
