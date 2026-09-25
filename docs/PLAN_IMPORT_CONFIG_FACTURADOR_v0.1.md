# PLAN Import de Configuración de Facturador v0.1

**Versión:** 0.1
**Fecha:** 2026-09-19
**Estado:** DRAFT — pendiente TASKS

## Alineación

- `AGENTS.md`
- `docs/SPEC_IMPORT_CONFIG_FACTURADOR_v0.1.md` (fuente funcional; las reglas se citan como RN-xx)
- `docs/SPEC_SEGMENTACION_PERFIL_EMISION_v0.1.md` (consume los perfiles que este import crea)
- `docs/TASKS_IMPORT_CONFIG_FACTURADOR_v0.1.md` (a crear)
- `scripts/sql/alta_facturador.sql` (semántica de upsert idempotente probada en producción)

---

## 1. Estrategia técnica

Cinco decisiones estructurales, cada una con su porqué.

### 1.1 El archivo viaja como texto en un cuerpo JSON, no como multipart

`POST` con `application/json` y cuerpo `{ filename, format, content }`, donde `content` es el texto crudo del archivo.

- `apps/backoffice/src/api/client.ts` es un wrapper JSON-only que fija `Content-Type: application/json` en todas las requests. Multipart obligaría a romperlo o a duplicarlo.
- Multipart requiere `multer` o `busboy` (dependencia nueva, middleware por ruta, `@types/multer`), y deja el cuerpo fuera del alcance de `validateRequest("body", schema)`: la validación quedaría partida en dos.
- El archivo real pesa unos pocos KB. Un facturador extremo (20 establecimientos × 5 puntos × 10 actividades) no supera ~150 KB; el escape JSON lo infla ~1,1×. El límite global `express.json({ limit: "1mb" })` de `apps/api/src/app.ts:51` es holgado y **no se toca**.
- Efecto colateral que hay que cubrir: un cuerpo mayor a 1 MB hace que Express lance `entity.too.large`, que hoy cae en el `INTERNAL_ERROR` 500 genérico de `error-handler.ts:36`. Se agrega el mapeo explícito (§6.1).

### 1.2 `yaml` es una dependencia nueva real

Verificado: **no está instalado ni siquiera como dependencia transitiva** (`require("yaml")` falla; no hay `js-yaml` en el árbol). Se agrega `yaml` (eemeli, instalado `^2.9.1`) a `apps/api/package.json`, no `js-yaml` (API antigua, `safeLoad` deprecado). Verificado: **sin dependencias transitivas propias**; vite ya lo tenia en el arbol del backoffice, de modo que queda deduplicado en la misma version.

Parseo defensivo: `YAML.parse(text, { maxAliasCount: 100, merge: false })`, para acotar el ataque de expansión por anclas. Al instalar, verificar el árbol transitivo y dejar constancia en TASKS (`AGENTS.md` pide no ampliar superficie sin justificar).

### 1.3 Piezas puras separadas del transporte y de la base

Parser, contrato, mapper y diff son funciones puras: no tocan Postgres, no conocen Express y se testean con `vitest` sin infraestructura. Solo `import.repository.ts` habla con la base.

Beneficio inmediato: la batería de casos del catálogo de hallazgos (§9 del SPEC, 13 bloqueantes y 13 advertencias) se cubre con tests unitarios rápidos. Beneficio futuro: reemplazar "subir archivo" por `GET /admin/emisores/{id}/configuracion` de FE es escribir un adaptador que produzca `FeConfigDocument` y reusar todo lo demás (§13 del SPEC).

### 1.4 SQL dedicado de upsert, sin refactorizar el repositorio existente

Se evaluaron tres caminos:

| Camino | Veredicto |
|---|---|
| Reusar `createFacturador` (`backoffice.repository.ts:584`), `createEstablecimiento` (`:745`), `createPunto` (`:790`), `createActividad` (`:835`), `createPerfil` (`:880`), `createContexto` (`:924`) | **Descartado.** Cada uno hace `pool.query` sobre una conexión propia: 30+ inserts sin transacción, exactamente el problema que el import viene a resolver (RN-13). Además son `insert` puros sin `on conflict`, inútiles para re-import |
| Refactorizar esos métodos a `(input, client = pool)` | **Descartado.** Toca código usado por ~20 endpoints en producción y el beneficio es nulo: la semántica que el import necesita es upsert, no insert |
| **SQL nuevo dedicado en `import.repository.ts`** | **Elegido.** Calcado de `scripts/sql/alta_facturador.sql`, que ya corre en producción y usa como arbiter los mismos índices únicos parciales de `0004` |

### 1.5 Consistencia preview → apply sin estado en el servidor

`preview_token = sha256(JSON canónico de { plan, target, snapshotIds })`.

`apply` recibe el mismo `content` y el token, **re-parsea, re-mapea y re-lee el snapshot dentro de la transacción**, y recalcula el token. Si difiere, rechaza (RN-15). Cero tablas de sesión, cero TTL que expire a destiempo, y protege contra cambios concurrentes entre que el operador mira y confirma.

---

## 2. Arquitectura

```
apps/backoffice/src/main.tsx  FacturadorImportView
            │  file.text()  →  { filename, format, content }
            ▼
apps/backoffice/src/api/import.ts     (apiPost, sin cambios en client.ts)
            │
            ▼
POST /api/v1/backoffice/facturadores/import/preview   (requireAuth + requireBackofficeRole)
POST /api/v1/backoffice/facturadores/import/apply
            │
            ▼  import.service.ts
   ┌────────┴─────────────────────────────────────┐
   │  PIEZAS PURAS (sin DB)                       │
   │  fe-config.parser  →  ParsedFeConfig         │
   │  fe-config.contract (zod v0.1)               │
   │  fe-config.mapper  →  ImportPlan + hallazgos │
   │  fe-config.diff    →  ImportDiff + token     │
   └────────┬─────────────────────────────────────┘
            ▼
   import.repository.ts     loadSnapshot()  /  applyImport()
            │                                 └─ withTransaction + advisory lock
            ▼
   PostgreSQL (tablas existentes + facturador_import_eventos)
```

### Módulos afectados

| Ruta | Estado |
|---|---|
| `apps/api/src/modules/backoffice/import/` | **Nuevo** (7 archivos) |
| `apps/api/src/db/tx.ts` | **Nuevo** |
| `db/migrations/0031_facturador_import_eventos.sql` | **Nuevo** |
| `apps/api/tests/fixtures/fe-config-v0.1.{json,yaml}` | **Nuevo** |
| `apps/backoffice/src/api/import.ts` | **Nuevo** |
| `apps/api/src/modules/backoffice/backoffice.routes.ts` | Schemas + 2 rutas + `operation_config` en alta de usuario |
| `apps/api/src/modules/backoffice/backoffice.{service,types,repository}.ts` | Alta de usuario con contexto (Fase 10) |
| `apps/api/src/shared/errors/error-handler.ts` | Mapeo 413 |
| `packages/shared/src/types/api.ts` | Código de error nuevo |
| `apps/api/package.json` | Dependencia `yaml` |
| `apps/backoffice/src/main.tsx` | `AppView`, vista de import, `OperationConfigPicker`, `UserCreateView` |
| `apps/backoffice/src/styles.css` | Clases del diff |
| `spec/openapi.yaml` | 2 paths + schemas + corrección de alta de usuario |

---

## 3. Orden de ejecución

```
 0. Fixture real + dependencias + shared            (desbloquea todo)
 1. DB — migración 0031 (auditoría)
 2. API — contrato zod + parser        [puro]
 3. API — mapper                       [puro]
 4. API — diff + preview_token         [puro]
 5. API — tx helper + import.repository
 6. API — import.service + rutas + zod
 7. Contrato — spec/openapi.yaml
 8. Frontend — api/import.ts + FacturadorImportView
 9. Frontend — CSS
10. Alta de usuario con contexto operativo   (independiente: puede ir en paralelo desde el paso 0)
11. Playwright + evidencia en TASKS
```

Las fases 2-4 son puras y cada una cierra con sus tests antes de pasar a la siguiente. La fase 10 no depende de ninguna otra y puede entregarse primero si se necesita valor inmediato.

---

## Fase 0 — Fixture, dependencias y shared

1. **Fixtures generados desde el stack de desarrollo, no inventados.** `facturacion-electronica` corre local (`fe-test-api-1`, `127.0.0.1:9988`), así que cada fixture se produce con el generador real:

   ```
   GET /admin/emisores/:id/configuracion/export-consumidor?env=test&formato=json|yaml
   ```

   | Fixture | Cómo se obtiene |
   |---|---|
   | `fe-config-v0.1.json` / `.yaml` | Emisor `5057016-1`, los dos formatos de la **misma** exportación (habilita el test de paridad, criterio 3 del SPEC) |
   | `fe-config-multi-establecimiento.json` | Emisor con 2+ establecimientos, creado en `fe-test` si no existe |
   | `fe-config-timbrados-multiples.json` | Emisor con más de un timbrado vigente |
   | `fe-config-autoridad-client.json` | Emisor **sin numeradores**: el generador deriva `autoridad: CLIENT` y `documento_nro_requerido: true` |
   | `fe-config-referencia-rota.json` | Perfil apuntado a un establecimiento **inactivo**: FE exporta los códigos en `null` (§5.3 del SPEC). Es el caso real, no un archivo corrupto a mano |
   | `fe-config-sin-timbrado-vigente.json` | Emisor con todos los timbrados vencidos |
   | `fe-config-sin-perfiles.json` | Emisor sin perfiles de emisión |
   | `fe-config-ambiente-test.json` | Exportación con `env=test` para contrastar contra un deployment `prod` |

   Cada fixture se acompaña de una línea en TASKS indicando qué emisor de `fe-test` lo originó, para poder regenerarlo. Los archivos no contienen secretos —el generador nunca emite `siguiente_numero`, CSC, certificados ni claves—, pero igual pasan por `npm run qa:no-secrets`.

2. **Dependencia**: `yaml` en `apps/api/package.json` (§1.2).

3. **`packages/shared/src/types/api.ts`**: agregar `"PAYLOAD_TOO_LARGE"` a `ApiErrorCode`. Es una unión cerrada de 8 códigos usada solo para tipar `HttpError` (`apps/api/src/shared/errors/http-error.ts:6`), así que ampliarla no rompe nada. `packages/shared/dist/` está en `.gitignore`, por lo que hay que correr `npm run build` del workspace para que la API vea el tipo nuevo.

   Los dos conflictos propios del import **no** amplían la unión: reusan `CONFLICT` (409) y llevan el motivo en `details`:
   ```ts
   new HttpError(409, "CONFLICT", "…", { motivo: "IMPORT_BLOQUEADO", bloqueantes })
   new HttpError(409, "CONFLICT", "…", { motivo: "PREVIEW_DESACTUALIZADO" })
   ```

---

## Fase 1 — DB: `db/migrations/0031_facturador_import_eventos.sql`

Aditiva, no toca ninguna tabla existente.

```sql
create table facturador_import_eventos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid references facturadores(id),
  usuario_id uuid references usuarios(id),
  archivo_nombre text not null,
  archivo_formato text not null,
  contrato_version text not null,
  generado_en text,
  ambiente_forzado boolean not null default false,
  payload jsonb not null,
  resumen jsonb not null,
  created_at timestamptz not null default now(),
  constraint facturador_import_eventos_formato_check check (archivo_formato in ('json','yaml'))
);

create index facturador_import_eventos_facturador_idx
  on facturador_import_eventos (facturador_id, created_at desc);
```

`payload` guarda el documento **desenvuelto** (sin los wrappers `{valor, referencia}`), `resumen` el `ImportDiff` aplicado, y `ambiente_forzado` deja registro del override de RN-16. `apps/api/tests/migrations.test.ts` valida el runner genérico, no la lista de archivos, así que no requiere cambios.

---

## Fase 2 — Contrato zod y parser `[puro]`

### `import/fe-config.contract.ts`

Schemas **planos**, aplicados *después* del unwrap. Obligatorio: `contrato.version`, `emisor.{emisor_id,razon_social}`, `actividades_economicas` (≥1), `establecimientos` (≥1) con `puntos_expedicion` (≥1). El resto opcional. Raíz con `.passthrough()` para tolerar claves de versiones futuras de FE.

```ts
export const CONTRATO_VERSIONES_SOPORTADAS = ["v0.1"] as const;

const codigo3 = z.string().trim().regex(/^[0-9]{3}$/);
const fechaISO = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
const emisorId  = z.string().trim().regex(/^[0-9]{3,8}-[0-9]$/);

export const feConfigSchema = z.object({
  contrato: z.object({ version: z.string().trim().min(1), generado_en: z.string().trim().optional() }).passthrough(),
  servicio: z.object({
    base_url: z.string().trim().optional(),
    base_path: z.string().trim().optional(),
    ambiente_esperado: z.enum(["prod", "test"]).optional(),
    url_verificada: z.boolean().optional(),
    aviso: z.string().optional()
  }).passthrough().optional(),
  emisor: z.object({
    emisor_id: emisorId,
    razon_social: z.string().trim().min(1).max(300),
    nombre_fantasia: z.string().trim().max(300).nullable().optional(),
    ambiente: z.enum(["prod", "test"]).optional()
  }),
  actividades_economicas: z.array(z.object({
    codigo: z.string().trim().min(1).max(20),
    descripcion: z.string().trim().max(400).nullable().optional(),
    es_principal: z.boolean().optional()
  })).min(1),
  establecimientos: z.array(z.object({
    codigo: codigo3,
    denominacion: z.string().trim().max(200).nullable().optional(),
    direccion: z.string().trim().max(400).nullable().optional(),
    puntos_expedicion: z.array(z.object({
      codigo: codigo3,
      descripcion: z.string().trim().max(200).nullable().optional()
    })).min(1)
  })).min(1),
  timbrados: z.array(z.object({
    numero: z.string().trim().regex(/^[0-9]+$/),
    fecha_inicio: fechaISO.nullable().optional(),
    fecha_fin: fechaISO.nullable().optional(),
    vigente: z.boolean().optional()
  })).default([]),
  perfiles_emision: z.object({
    requerido: z.boolean().optional(),
    items: z.array(z.object({
      codigo: z.string().trim().min(1).max(80),
      descripcion: z.string().trim().max(400).nullable().optional(),
      actividad_codigo: z.string().trim().min(1),
      establecimiento_codigo: codigo3,
      punto_codigo: codigo3,
      tipo_documento: z.string().trim().optional()   // "1" = código SIFEN; sin destino
    })).default([])
  }).optional(),
  numeracion: z.object({
    autoridad: z.enum(["SERVICE", "CLIENT"]).optional(),
    documento_nro_requerido: z.boolean().optional(),
    serie_fiscal: z.string().nullable().optional(),
    rango_min: z.union([z.number(), z.string()]).nullable().optional(),
    rango_max: z.union([z.number(), z.string()]).nullable().optional()
  }).optional(),
  envio: z.object({ modos_habilitados: z.array(z.string()).default([]) }).optional(),
  tipos_documento_habilitados: z.array(z.string()).default([]),
  consumidor: z.array(z.object({
    nombre: z.string().trim().min(1),
    permisos: z.array(z.string()).default([]),
    alcance: z.array(z.object({
      emisor_id: z.string().trim(), env: z.string().trim(), activo: z.boolean().optional()
    })).default([])
  })).default([])
}).passthrough();

export type FeConfigDocument = z.infer<typeof feConfigSchema>;
```

**Corrección clave verificada contra el generador de FE** (§5.3 del SPEC): todos los escalares pasan por `toNullableString()`, así que **`valor` puede ser `null` incluso en campos que para nosotros son obligatorios**, y `withRef()` omite por completo los campos fuera del allowlist. Un esquema estricto convertiría un caso operativo normal —un perfil apuntado a un establecimiento inactivo, que FE exporta con los códigos en `null`— en un 400 genérico e inútil para el operador.

Por eso el esquema se escribe en **dos capas**:

```ts
// Capa 1 — estructural: acepta null y ausencia en todo campo escalar.
const texto = z.string().trim().nullable().optional();
const codigo3Laxo = z.string().trim().nullable().optional();
// … el esquema completo usa estas variantes, nunca .min(1) directo.

// Capa 2 — reglas de negocio, en el mapper, con hallazgos accionables:
//   emisor.razon_social === null            → BLOQUEANTE CAMPO_OBLIGATORIO_VACIO ($.emisor.razon_social)
//   establecimientos[].codigo no 3 dígitos  → BLOQUEANTE CODIGO_INVALIDO con la ruta
//   items[].establecimiento_codigo === null → BLOQUEANTE REFERENCIA_INTERNA_ROTA con la sugerencia
//                                             "el perfil apunta a un establecimiento o punto inactivo en FE"
```

Regla general: **zod valida forma, el mapper valida negocio.** El 400 queda reservado a un archivo que no es el contrato; todo lo demás llega al operador como hallazgo con ruta y sugerencia, dentro de la vista previa. Esto agrega un código al catálogo del SPEC: `CAMPO_OBLIGATORIO_VACIO` (bloqueante).

Otras notas verificadas: `tipo_documento` vale `"1"`, no `"FE"`; `fecha_fin` puede ser el centinela `2099-01-01`; `serie_fiscal` y los rangos vienen `null` con autoridad `SERVICE`; `tipos_documento_habilitados` puede traer etiquetas `TIPO_<n>` desconocidas, que se ignoran sin romper.

### `import/fe-config.parser.ts`

```ts
export type FeConfigFormat = "json" | "yaml";

export interface ParsedFeConfig {
  document: FeConfigDocument;
  format: FeConfigFormat;
  referencias: Record<string, string>;   // ruta JSON-path-ish → ancla de la guía FE
}

export function unwrapValores(node: unknown, path = "$", refs: Record<string, string> = {}): unknown;
export function detectFormat(filename: string, content: string, hint?: "json" | "yaml" | "auto"): FeConfigFormat;
export function parseFeConfig(input: { filename: string; content: string; format?: "json" | "yaml" | "auto" }): ParsedFeConfig;
```

`unwrapValores` — reglas, en este orden:

```ts
const WRAPPER_KEYS = new Set(["valor", "referencia", "nota", "fuente"]);
```

1. Array → `map` con path `${path}[i]`.
2. Objeto plano con clave propia `valor` **y** todas sus claves ⊆ `WRAPPER_KEYS` → si trae `referencia` string, `refs[path] = referencia`; retorna `unwrapValores(node.valor, path, refs)`. La condición de las claves evita destruir un objeto de negocio que en el futuro tenga un campo `valor`.
3. Objeto plano común → objeto nuevo con cada valor desenvuelto en `${path}.${k}`.
4. Primitivos y `null` → tal cual.

`detectFormat`: `format` explícito → extensión de `filename` (`.json` / `.yaml` / `.yml`) → primer carácter no blanco `{` o `[` ⇒ JSON, si no YAML. Higiene previa: quitar BOM (`﻿`) y normalizar `\r\n` → `\n`.

`parseFeConfig` lanza `HttpError(400, "VALIDATION_ERROR", …)` con `details = { formato, linea?, zod? }`. El error de `yaml` expone `linePos`, que se traduce a `linea` para que el operador sepa dónde mirar.

---

## Fase 3 — Mapper `[puro]`

### `import/fe-config.mapper.ts`

```ts
export interface MapperContext {
  feApiEnv: "test" | "prod";        // env.FE_API_ENV
  feApiBaseUrl: string;             // env.FE_API_BASE_URL
  sendProfileCode: boolean;         // env.FE_SEND_EMISSION_PROFILE_CODE
  hoy: string;                      // ISO yyyy-mm-dd, inyectado (tests deterministas)
}

export function buildImportPlan(doc: FeConfigDocument, ctx: MapperContext): ImportPlan;
```

`ImportPlan` (en `import.types.ts`): `{ emisor, establecimientos[], puntos[], actividades[], perfiles[], contextos[], timbradoElegido, hallazgos[] }`, todo en términos de **códigos**, sin un solo UUID (el plan no conoce la base).

Modelo de hallazgo único:

```ts
export type NivelHallazgo = "BLOQUEANTE" | "ADVERTENCIA" | "IGNORADO";
export interface Hallazgo {
  nivel: NivelHallazgo;
  codigo: string;      // estable; el catálogo cerrado está en §9 del SPEC
  mensaje: string;     // español, orientado a la acción
  ruta?: string;       // "$.perfiles_emision.items[2].actividad_codigo"
  valor?: unknown;
  sugerencia?: string;
}
```

Implementación de las reglas del SPEC:

- **RN-05** mapeo campo a campo, incluido `emisor_id → {emisor_id, ruc}`.
- **RN-06** derivación de contextos: un `perfiles_emision.items[]` = un contexto; los códigos se resuelven **dentro del propio documento** y toda referencia rota produce `REFERENCIA_INTERNA_ROTA`.
- **RN-07** `pickTimbrado(timbrados, hoy)` con las cuatro ramas (uno vigente / ninguno / varios / vencido) y elección determinista: mayor `fecha_inicio` ≤ hoy, desempate por mayor `fecha_fin`, luego por `numero`. El plan expone `timbradoElegido` con el motivo, para mostrarlo en la vista previa.
- **RN-08** perfiles: `items` vacío con `ctx.sendProfileCode === true` ⇒ bloqueante `SIN_CONTEXTOS`. Con `false`, genera códigos `A<actividad>-E<est>-P<punto>-FE-PTO` (convención de `alta_facturador.sql`) más advertencia.
- **RN-09** `documento_nro`: el plan propone `"0000001"` por contexto nuevo y marca `editable: true`; el valor final lo decide el operador y llega en `apply`.
- **RN-16** ambiente: compara `emisor.ambiente` y `servicio.ambiente_esperado` contra `ctx.feApiEnv`.
- **RN-17** `ignorados`: lista fija de rutas sin destino, construida recorriendo el documento (no hardcodeada a ciegas: si la ruta no existe en el archivo, no se reporta).

El mapper **no** conoce la base: los bloqueantes que dependen del estado (`FACTURADOR_EN_OTRO_TENANT`, `TENANT_SLUG_EXISTENTE`) los agrega la fase 4.

---

## Fase 4 — Diff y `preview_token` `[puro]`

### `import/fe-config.diff.ts`

```ts
export function buildDiff(plan: ImportPlan, snapshot: ImportSnapshot, target: ImportTarget): ImportDiff;
export function computePreviewToken(plan: ImportPlan, target: ImportTarget, snapshot: ImportSnapshot): string;
```

Identidad de cada entidad, alineada con los índices únicos parciales de `0004` (RN-03):

| Entidad | Clave |
|---|---|
| tenant | `id` (EXISTENTE) o `slug` (NUEVO) |
| facturador | `(tenant_id, emisor_id)` |
| establecimiento | `(facturador_id, codigo)` |
| punto | `(establecimiento_id, codigo)` |
| actividad | `(facturador_id, codigo)` |
| perfil | `(facturador_id, codigo)` |
| contexto | `(actividad_id, establecimiento_id, punto_expedicion_id, perfil_emision_id)` |

`accion ∈ CREAR | ACTUALIZAR | SIN_CAMBIOS`, más `USAR_EXISTENTE` exclusivo del tenant. `campos[]` se llena solo en CREAR (con `actual: null`) y en ACTUALIZAR (solo lo que cambia).

Forma de la respuesta (§8.2 del SPEC):

```jsonc
{
  "contrato": { "version": "v0.1", "generado_en": "…", "archivo": "…", "formato": "yaml" },
  "preview_token": "<sha256 hex>",
  "puede_aplicar": true,
  "tenant":      { "accion": "CREAR", "id": null, "nombre": "…", "slug": "…", "plan_codigo": "BASICO_MVP" },
  "facturador":  { "accion": "CREAR", "id": null, "emisor_id": "5057016-1", "campos": [...] },
  "establecimientos": [ { "codigo": "001", "accion": "ACTUALIZAR", "id": "…", "campos": [ { "campo": "direccion", "actual": "X", "nuevo": "Y" } ] } ],
  "puntos":      [ { "establecimiento_codigo": "001", "codigo": "002", "accion": "CREAR", "campos": [...] } ],
  "actividades": [ … ], "perfiles": [ … ],
  "contextos":   [ { "clave": { "actividad": "45203", "establecimiento": "001", "punto": "001", "perfil": "A45203-E001-P001-FE-PTO" },
                     "accion": "CREAR", "id": null, "campos": [...],
                     "documento_nro_sugerido": "0000001", "documento_nro_editable": true,
                     "documento_nro_preservado": false, "usuarios_asignados": 0 } ],
  "timbrado_elegido": { "numero": "18861677", "fecha_inicio": "2026-05-19", "motivo": "único vigente" },
  "resumen": { "crear": 12, "actualizar": 2, "sin_cambios": 5, "no_tocados": 1 },
  "bloqueantes": [...], "advertencias": [...], "ignorados": [...],
  "referencias": { "$.emisor.razon_social": "…#4-lo-que-el-administrador-configura-para-vos" }
}
```

`computePreviewToken`: `sha256` (de `node:crypto`) sobre un JSON **canónico** — claves ordenadas y arrays ordenados por su clave de identidad — para que un reordenamiento del archivo no invalide el token (test explícito en fase 4).

`documento_nro_preservado: true` y `usuarios_asignados > 0` son las dos señales que la UI resalta en rojo: contextos productivos que el re-import va a tocar.

---

## Fase 5 — Transacción y repositorio

### `apps/api/src/db/tx.ts` (nuevo)

```ts
import type { PoolClient } from "pg";
import { pool } from "./pool";

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
```

Reemplaza el patrón repetido a mano en `backoffice.repository.ts:407, 435, 461, 511, 1025, 1061`. **No** se refactorizan esos métodos ahora (§1.4): el helper nace para el import y queda disponible.

### `import/import.repository.ts`

```ts
export interface ImportRepository {
  loadSnapshot(target: ImportTarget, emisorId: string, client?: PoolClient): Promise<ImportSnapshot>;
  applyImport(input: {
    plan: ImportPlan; target: ImportTarget; previewToken: string;
    documentoNroOverrides: Record<string, string>;
    usuarioId: string; archivo: { nombre: string; formato: FeConfigFormat };
    ambienteForzado: boolean;
  }): Promise<ImportApplyResult>;
}
```

`loadSnapshot` lee, por facturador: facturador, establecimientos, puntos, actividades, perfiles, contextos (con `documento_nro` actual) y, por contexto, el conteo de `usuario_operacion_config` activas. Más la verificación de `emisor_id` en otros tenants (`FACTURADOR_EN_OTRO_TENANT`) y de `slug` (`TENANT_SLUG_EXISTENTE`).

`applyImport` corre dentro de `withTransaction`, en este orden:

```sql
-- 0. serializa imports concurrentes del mismo emisor (RN-14)
select pg_advisory_xact_lock(hashtext($clave_tenant || ':' || $emisor_id));

-- 1. re-lectura del snapshot con el mismo client  →  recálculo del token  →  409 si difiere (RN-15)
-- 2. planes + tenants + tenant_suscripciones            (solo modo NUEVO)
-- 3. facturadores
--      on conflict (tenant_id, emisor_id) where deleted_at is null
--      do update set razon_social, nombre_fantasia = coalesce(excluded, actual), activo = true
--      (ruc NO se pisa si difiere → advertencia RUC_DISTINTO)
-- 4. facturador_establecimientos    on conflict (facturador_id, codigo) …
-- 5. facturador_puntos_expedicion   on conflict (establecimiento_id, codigo) …
-- 6. facturador_actividades         on conflict (facturador_id, codigo) …
--      alias_operativo = coalesce(actual, excluded)         ← solo al crear (RN-05)
-- 7. facturador_perfiles_emision    on conflict (facturador_id, codigo) …
-- 8. actividad_punto_perfiles
--      on conflict (actividad_id, establecimiento_id, punto_expedicion_id, perfil_emision_id)
--      do update set timbrado           = excluded.timbrado,
--                    timbrado_inicio    = excluded.timbrado_inicio,
--                    documento_nro      = coalesce(actividad_punto_perfiles.documento_nro, excluded.documento_nro),
--                    alias_operativo    = coalesce(actividad_punto_perfiles.alias_operativo, excluded.alias_operativo),
--                    activo             = true,
--                    updated_at         = now()
--      -- credito_plazo_dias y tipo_transaccion_default NUNCA se tocan en update
-- 9. insert into facturador_import_eventos
commit;
```

Ningún `delete`, ningún `activo = false`: aditivo estricto (RN-10). El `coalesce` del paso 8 es la implementación literal de RN-09 (`documento_nro` nunca se pisa) y de la preservación del alias.

Los índices usados como arbiter son parciales (`where deleted_at is null`), por lo que cada `on conflict` debe declarar la misma cláusula `where`, igual que hace `alta_facturador.sql`.

---

## Fase 6 — Service y rutas

### `import/import.service.ts`

```ts
export async function previewFacturadorImport(
  input: ImportPreviewInput, deps: { repository: ImportRepository; env: MapperContext }
): Promise<ImportDiff>;

export async function applyFacturadorImport(
  input: ImportApplyInput, usuarioId: string, deps: { repository: ImportRepository; env: MapperContext }
): Promise<ImportApplyResponse>;
```

Ambos comparten la misma cadena — `parseFeConfig → buildImportPlan → loadSnapshot → buildDiff` — y difieren solo en el cierre. `apply` además:

1. Filtra `AMBIENTE_DISTINTO` de los bloqueantes si `permitir_ambiente_distinto === true` (RN-16) y marca `ambienteForzado` para la auditoría.
2. Si queda algún bloqueante → `HttpError(409, "CONFLICT", …, { motivo: "IMPORT_BLOQUEADO", bloqueantes })`.
3. Valida los `documento_nro_overrides` contra `^[0-9]{7}$` y contra la lista de contextos **nuevos** (un override sobre un contexto existente se ignora y se advierte: RN-09 prohíbe pisarlo).
4. Delega en `applyImport`.

### Rutas, en `backoffice.routes.ts`

Sección nueva `// ── Import FE ──`, con los mismos guards del alta manual (`...auth` = `requireAuth, requireBackofficeRole`, líneas 199-220). No se crea router nuevo ni se toca `app.ts`.

```ts
const importArchivoSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  format: z.enum(["json", "yaml", "auto"]).default("auto"),
  content: z.string().min(1).max(512_000, "Archivo demasiado grande (max 500 KB).")
});

const importTargetSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("EXISTENTE"), tenant_id: z.string().uuid() }),
  z.object({
    mode: z.literal("NUEVO"),
    nombre: z.string().trim().min(1).max(200),
    slug: z.string().trim().min(2).max(80),
    plan_codigo: z.string().trim().min(1).max(60)
  })
]);

const importPreviewSchema = importArchivoSchema.extend({ target: importTargetSchema });

const importApplySchema = importPreviewSchema.extend({
  preview_token: z.string().trim().regex(/^[0-9a-f]{64}$/),
  permitir_ambiente_distinto: z.boolean().default(false),
  documento_nro_overrides: z.record(z.string().regex(/^[0-9]{7}$/)).default({})
});
```

```ts
backofficeRouter.post("/backoffice/facturadores/import/preview", ...auth,
  validateRequest("body", importPreviewSchema), async (req, res, next) => {
    try { res.json(await previewFacturadorImport(req.body, importDeps())); } catch (e) { next(e); }
  });

backofficeRouter.post("/backoffice/facturadores/import/apply", ...auth,
  validateRequest("body", importApplySchema), async (req, res, next) => {
    try { res.json(await applyFacturadorImport(req.body, req.user!.id, importDeps())); } catch (e) { next(e); }
  });
```

### `error-handler.ts` — mapeo 413

Antes del `req.log.error`, para no ensuciar los logs con un caso esperable:

```ts
if (typeof error === "object" && error !== null && (error as { type?: string }).type === "entity.too.large") {
  res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "El archivo supera el tamano maximo permitido.", requestId } });
  return;
}
```

**Política de respuesta (§8.3 del SPEC):** `preview` devuelve **200 aunque haya bloqueantes**, con `puede_aplicar: false`, para que el operador vea el informe completo de una vez; 400 solo si el archivo no parsea o rompe el esquema.

---

## Fase 7 — `spec/openapi.yaml`

- Dos paths nuevos bajo `tags: [Backoffice]`, junto al bloque `/backoffice/users` (~línea 1829).
- Schemas: `FacturadorImportPreviewRequest`, `FacturadorImportApplyRequest`, `FacturadorImportTarget` (`oneOf` por `mode`), `FacturadorImportDiff`, `ImportEntityDiff`, `ImportFieldDiff`, `ImportHallazgo`, `FacturadorImportApplyResponse`.
- **Deuda documental a corregir de paso** (`spec/openapi.yaml:3172-3187`, verificado): `BackofficeUserCreateRequest` declara `required: [username, display_name, role]` y **no** incluye `tenant_id` ni `email`, que el zod de `backoffice.routes.ts:168-175` sí exige; y marca `display_name` como requerido cuando el zod lo tiene opcional. Las tres correcciones van juntas.
- **Rótulo a corregir** en la UI (detectado en §5.3 del SPEC): `FacturadorCreateView` (`main.tsx:655`) llama al `emisor_id` "UUID del backend fiscal", cuando el valor real es un RUC con dígito verificador.

---

## Fase 8 — Frontend: cliente y vista

### `apps/backoffice/src/api/import.ts` (nuevo)

Tipos espejo del contrato y dos funciones sobre `apiPost`. **Cero cambios en `client.ts`**, que es la ventaja concreta de no haber elegido multipart.

### `FacturadorImportView` en `apps/backoffice/src/main.tsx`

Enganche, siguiendo el patrón del SPA (unión discriminada, sin router):

- `AppView` (líneas 60-77): `| { tag: "facturador-import"; tenantId?: string }`
- dispatch en `App` (169-198) y `buildBreadcrumb` (202-259): `Tenants → Importar configuracion FE`
- entradas: botón en `TenantsListView` (349) y en `TenantDetailView` (500, que precarga `tenantId`)
- `Layout.tsx` no se toca: la vista cae en la sección "Tenants y Facturadores"

Lectura del archivo sin `FormData`:

```tsx
async function onFileSelected(file: File) {
  const content = await file.text();
  setArchivo({
    filename: file.name,
    content,
    format: /\.ya?ml$/i.test(file.name) ? "yaml" : /\.json$/i.test(file.name) ? "json" : "auto"
  });
}
```

Máquina de estados de un solo componente: `archivo → destino → preview → aplicando → resultado`.

1. **archivo** — `<input type="file" accept=".json,.yaml,.yml">`; muestra nombre, tamaño y formato detectado. Sin llamada al backend.
2. **destino** — radio `Tenant existente` (select desde `listTenants()`) / `Crear tenant nuevo` (nombre, slug, plan desde `listPlanes()`). Precarga: si el archivo es JSON se parsea en el cliente para proponer nombre y slug desde `emisor.razon_social` y `consumidor[0].nombre`; si es YAML los campos arrancan vacíos y la respuesta del preview los propone como sugerencia editable (no se agrega un parser YAML al bundle del backoffice).
3. **preview** — llama `postImportPreview()` y renderiza: banner de estado, tarjetas por entidad con chips `CREAR` / `ACTUALIZAR` / `SIN_CAMBIOS`, tabla `campo | actual | nuevo`, **input editable de `documento_nro` por contexto nuevo** (7 dígitos, precargado en `0000001`), timbrado elegido con su motivo, y tres listas: bloqueantes, advertencias e ignorados (esta última colapsada). Checkbox `permitir_ambiente_distinto` **solo** si aparece `AMBIENTE_DISTINTO`. Botón *Aplicar* deshabilitado si `!puede_aplicar`.
4. **resultado** — resumen + los tres pasos siguientes encadenados (detalle en §10.1): cargar la API key cuando venga `API_KEY_AUSENTE`, **crear el usuario operativo con tenant y facturador ya preseleccionados**, y ver el facturador. La pantalla no termina en un mensaje: termina en la acción que sigue.

Mobile-first: tarjetas apiladas; bajo 640 px la tabla `campo | actual | nuevo` se convierte en lista de definiciones.

---

## Fase 9 — CSS

En `apps/backoffice/src/styles.css`, reusando `panel`, `detail-grid`, `badge` y `sub-nav`: `.diff-chip-crear`, `.diff-chip-actualizar`, `.diff-chip-sin-cambios`, `.hallazgo-item` (con variantes por nivel), `.diff-tabla` con el colapso responsive.

---

## Fase 10 — Alta guiada de usuario

Independiente del import; puede entregarse primero.

### 10.0 Principio rector: cero tipeo de datos fiscales

Después del import, **todos** los datos fiscales ya están en la base: facturador, establecimientos, puntos, actividades, perfiles y contextos. El alta de usuario no debe volver a pedirlos: el administrador **elige de listas**, no transcribe. Lo único que se escribe es la identidad de la persona — usuario, email y nombre visible — porque eso no está en el archivo de FE.

Regla concreta que ordena el diseño: **si un dato salió del archivo, aparece como opción en un select o como resumen de solo lectura; nunca como campo de texto.**

La cadena que lo hace posible ya está prevista en las fases anteriores:

```
archivo FE  ──import──▶  actividad_punto_perfiles (con alias_operativo)
                               │
                               ▼
                        listContextos(facturadorId)
                               │
                               ▼
                 select con contextoLabel(c)  →  "TALLERES DE CHAPERÍA Y PINTURA"
```

`contextoLabel` (`main.tsx:2019-2023`) muestra `alias_operativo` y solo cae al formato de códigos (`Est:001 · Punto:001 · Act:45203 · Perfil:…`) cuando no hay alias. El mapper del import completa `alias_operativo` desde la descripción del perfil, con fallback a la de la actividad (fase 3), **así que después de un import los selectores muestran nombres legibles en vez de códigos**. Esa es la razón de que el alias se escriba al crear y no se pise al actualizar.

### 10.1 Encadenamiento desde el import

La pantalla de resultado del import (fase 8) no termina en un mensaje: ofrece el paso siguiente.

```
[ Importación aplicada ]
  12 creados · 2 actualizados
  ⚠ Falta cargar la API key FE del facturador

  → Cargar API key            (facturador-detail, pestaña info)
  → Crear usuario operativo   (usuario-create con tenant y facturador ya elegidos)
  → Ver facturador            (facturador-detail)
```

`AppView` admite el arrastre de la preselección:

```ts
| { tag: "usuario-create"; tenantId?: string; facturadorId?: string }
```

Cuando llega con ambos, el alta arranca en el paso 3 con los dos primeros ya resueltos y visibles como resumen, no como selects a repetir.

### 10.2 Los pasos del alta

Formulario en pasos visibles, no wizard de varias pantallas: el administrador ve el recorrido completo y entiende dónde está parado. Cada paso se habilita cuando el anterior está resuelto, igual que la cascada que ya funciona en `UserDetailView` (`main.tsx:2272-2320`).

| Paso | Control | Regla de precarga |
|---|---|---|
| **1. Tenant** | `select` desde `listTenants()` | Si viene del import, **preseleccionado y bloqueado**, con enlace para cambiarlo |
| **2. Facturador** | `select` desde `listFacturadores(tenantId)` | Preseleccionado si viene del import. Si el tenant tiene **uno solo**, se preselecciona automáticamente |
| **3. Tipo de acceso** | `radio`: *Operador de facturación* / *Consulta y reportes* | Por defecto operador. La opción de consulta aparece solo cuando `SPEC_SEGMENTACION_PERFIL_EMISION_v0.1` esté implementado (§10.5) |
| **4. Perfil de emisión** | `select` desde `listContextos(facturadorId)`, con `contextoLabel(c)` | Si el facturador tiene **un solo contexto**, se preselecciona. Si el tipo de acceso es consulta, el paso se oculta: no lleva perfil |
| **5. Datos de la persona** | Texto: usuario, email, nombre visible. `select` de rol | Único bloque tipeado. Sugerencia de usuario derivada del nombre visible, editable |
| **6. Confirmación** | Resumen de solo lectura + botón | Muestra qué se va a crear, con los datos fiscales en texto plano legible |

El paso 6 reusa el bloque de resumen que ya existe (`main.tsx:2322-2330`), que lista emisor, establecimiento, punto, perfil y actividad. Hoy está dentro del formulario de asignación; pasa a ser el cierre del alta.

Contraseña temporal: se mantiene el comportamiento actual (el backend la genera si no se indica y se muestra **una sola vez** con `CopyableSecret`). No se convierte en un paso: es parte del resultado.

### 10.3 API

`userCreateSchema` (`backoffice.routes.ts:168-175`) suma un bloque opcional:

```ts
const userOperationConfigInlineSchema = z.object({
  facturador_id: z.string().uuid(),
  emisor_id: z.string().trim().min(1).max(120),
  establecimiento: z.string().trim().regex(/^[0-9]{3}$/),
  punto_expedicion: z.string().trim().regex(/^[0-9]{3}$/),
  perfil_emision_codigo: z.string().trim().min(1).max(80),
  actividad_economica_codigo: z.string().trim().min(1).max(40)
});
// userCreateSchema.extend({ operation_config: userOperationConfigInlineSchema.optional() })
```

Misma forma que `operationConfigSchema` (`:187-195`) **menos `tenant_id`**, que se deriva del usuario que se está creando. Mantener la identificación por códigos permite reusar tal cual la query de resolución ya probada.

La UI nunca compone esos códigos a mano: los toma del contexto elegido (`c.establecimiento.codigo`, `c.punto_expedicion.codigo`, `c.perfil_emision.codigo`, `c.actividad.codigo`) y del facturador (`f.emisor_id`). Un error de transcripción deja de ser posible.

### 10.4 Repository (`backoffice.repository.ts`)

1. Extraer la query de resolución de `assignOperationConfig` (`:460-500`) a un privado:
   ```ts
   private async resolveOperationConfigTarget(
     client: PoolClient,
     input: { userId: string; tenantId: string; data: Omit<BackofficeOperationConfigInput, "tenant_id"> }
   ): Promise<{ tenant_id: string; facturador_id: string; actividad_punto_perfil_id: string } | null>;
   ```
   `assignOperationConfig` pasa a llamarlo: comportamiento idéntico, ya cubierto por los tests existentes.
2. `createUser` (`:399-431`) recibe `operationConfig?` y, **dentro del `begin/commit` que ya tiene**, después del insert en `usuario_roles`:
   - `resolveOperationConfigTarget(client, …)`;
   - si devuelve `null` → `rollback` + `HttpError(400, "VALIDATION_ERROR", "Contexto operativo no encontrado para el facturador indicado.")`. El usuario **no** se crea a medias;
   - si resuelve → `insert into usuario_operacion_config (…) values (…, true)` (no hace falta desactivar una config previa: el usuario es nuevo);
   - devolver el detalle con `operation_config` cuando la hubo.
3. Cambia la firma en `BackofficeRepository` (`backoffice.types.ts:295-302`) ⇒ **`FakeBackofficeRepository` de `apps/api/tests/backoffice.service.test.ts` deja de compilar**. Es una falla visible, no silenciosa; se actualiza el fake en la misma tarea.

### 10.5 Componente compartido

Extraer la cascada de `UserDetailView` (`main.tsx:2248-2330`) y usarla en las dos vistas (elimina ~80 líneas duplicadas):

```tsx
function OperationConfigPicker({
  tenantId, facturadorId, value, onChange, tenantLocked, facturadorLocked, modo
}: {
  tenantId: string;
  facturadorId?: string;
  value: { facturadorId: string; contextoId: string };
  onChange: (v: { facturadorId: string; contextoId: string; facturador?: Facturador; contexto?: Contexto }) => void;
  tenantLocked?: boolean;
  facturadorLocked?: boolean;
  modo?: "OPERADOR" | "CONSULTA";   // CONSULTA oculta el paso de perfil
}): JSX.Element;
```

Comportamiento a implementar en el componente, no en cada vista:

- **autoselección**: si la lista cargada tiene exactamente un elemento, se elige solo y se muestra como resumen en vez de select;
- **estados de carga explícitos** en el `option` vacío ("Seleccionar facturador primero…", "Cargando…"), como ya hace la cascada actual;
- **reset en cascada**: cambiar el facturador limpia el contexto (ya implementado en `main.tsx:2276, 2291`);
- **lista vacía con salida**: si el facturador no tiene contextos, en lugar de un select vacío muestra "Este facturador no tiene perfiles configurados" con enlace a `facturador-import` o a `contexto-create`. Es el borde que hoy deja al administrador sin saber qué hacer.

El parámetro `modo` es el punto de extensión para el rol de consulta de `SPEC_SEGMENTACION_PERFIL_EMISION_v0.1`: ese SPEC agrega un modo de asignación sin contexto. Se deja el selector de tipo de acceso con una sola opción habilitada, para que incorporarlo después sea agregar una opción y no rehacer el formulario.

`apps/backoffice/src/api/usuarios.ts`: `UserCreateInput.operation_config?`.

### 10.6 Qué queda tipeado, y por qué

| Dato | Origen | ¿Se puede evitar? |
|---|---|---|
| Nombre visible | La persona | No: no está en el archivo |
| Usuario | Derivado del nombre, editable | Se sugiere, no se exige inventar |
| Email | La persona | **Sí, si FE agrega `emisor.email_contacto` al export** (§5.4 del SPEC): quedaría precargado para el primer usuario del facturador |
| Rol | `select` de 3 opciones | Ya es select |
| Contraseña temporal | Generada por el backend | Ya es automática |
| Todo lo fiscal | El archivo | Nunca se tipea |

---

## 4. Validaciones

| Momento | Qué se valida | Dónde |
|---|---|---|
| Transporte | Tamaño del cuerpo, nombre y formato del archivo | zod + mapeo 413 |
| Parseo | JSON/YAML bien formado; unwrap; esquema del contrato | `parseFeConfig` → 400 con línea |
| Contrato | Versión soportada | Bloqueante `CONTRATO_VERSION_NO_SOPORTADA` |
| Integridad interna | Referencias entre perfiles, actividades, establecimientos y puntos del propio archivo; duplicados; tuplas repetidas | Mapper, bloqueantes |
| Formato del modelo | Códigos de 3 dígitos, `emisor_id`, `documento_nro` de 7 dígitos | Mapper + zod de rutas (los CHECK de `0004`/`0009` son la última línea, no la primera) |
| Estado de la base | Emisor en otro tenant, slug ocupado, entidades inactivas, contextos en uso | `loadSnapshot` + diff |
| Coherencia con el deployment | Ambiente, URL base, permisos del consumidor, API key presente | Mapper con `MapperContext` |
| Confirmación | Token de vista previa, bloqueantes remanentes, overrides de `documento_nro` | `applyFacturadorImport` |
| Concurrencia | Advisory lock por emisor | `applyImport` |

---

## 5. Estrategia de testing

### Unitarios sin base (`vitest`, `apps/api/tests/`)

| Archivo | Cobertura |
|---|---|
| `backoffice.import.parser.test.ts` | unwrap anidado y en arrays; objeto con `valor` legítimo que **no** debe desenvolverse; **paridad JSON↔YAML del mismo fixture**; BOM y CRLF; detección de formato en sus tres caminos; YAML inválido → 400 con `linea` |
| `backoffice.import.mapper.test.ts` | mapeo completo del fixture real; `emisor_id → ruc`; contextos derivados 1:1 desde `items[]`; `pickTimbrado` en sus cuatro ramas; placeholder de `documento_nro`; `credito_plazo_dias = 30`; alias desde descripción; lista exacta de `ignorados`; **un caso mínimo por cada uno de los 26 códigos del catálogo** |
| `backoffice.import.diff.test.ts` | snapshot vacío → todo CREAR; snapshot idéntico → todo SIN_CAMBIOS (RN-12); cambio de dirección → ACTUALIZAR con `campos` exactos; `documento_nro` existente preservado; entidades en base ausentes del archivo → `no_tocados` (RN-10); **estabilidad del `preview_token` ante reordenamiento de arrays** |
| `backoffice.import.service.test.ts` | `FakeImportRepository`; preview con bloqueantes → 200 y `puede_aplicar: false`; apply con bloqueantes → 409 `IMPORT_BLOQUEADO`; token viejo → 409 `PREVIEW_DESACTUALIZADO`; override de ambiente; override de `documento_nro` sobre contexto existente → ignorado con advertencia; apply feliz → una sola llamada a `applyImport` |
| `backoffice.service.test.ts` (extender) | `createBackofficeUser` con y sin `operation_config`; propagación al repositorio; resolución fallida no crea usuario |

### Integración con base

`apps/api/tests/backoffice.import.integration.test.ts`, con `describe.skipIf(!process.env.DATABASE_URL_TEST)`, contra el Postgres que levanta `bash scripts/deploy.sh`:

- import limpio → filas correctas en las 6 tablas y contexto resoluble por `context.repository.ts` (criterio 2 del SPEC);
- re-import idéntico → `resumen.sin_cambios` y cero UPDATE de `documento_nro`;
- re-import con timbrado nuevo → solo cambian `timbrado` y `timbrado_inicio`;
- dos imports concurrentes del mismo emisor → el advisory lock serializa, sin duplicados ni violación de índice;
- fallo inyectado a mitad → nada persistido (RN-13).

### Playwright

`scripts/playwright-backoffice-import.cjs`, con el patrón de `scripts/playwright-presupuestos-v02.cjs` (script `.cjs` con `require("playwright")` y mocks por `page.route`; el repo no tiene `playwright.config.ts`). Viewports `390×844` y `1440×900`.

Escenarios con mock de `/api/v1/backoffice/**`: (a) preview todo CREAR; (b) preview con advertencias e ignorados; (c) bloqueante `REFERENCIA_INTERNA_ROTA` → *Aplicar* deshabilitado; (d) apply OK → pantalla de resultado; (e) alta de usuario con cascada facturador + contexto.

Escenario **live** contra el stack de `bash scripts/deploy.sh`: login real de backoffice, subida del archivo de un emisor de test, verificación en `FacturadorDetailView` de establecimientos, actividades, perfiles y contextos, y alta de un usuario con contexto.

### Cierre por `AGENTS.md`

`npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run qa:no-secrets`, `bash scripts/deploy.sh`, y evidencia en la matriz de TASKS con escenarios, viewports y resultado.

---

## 5.bis Entornos y promoción

Toda la verificación ocurre primero en desarrollo, sobre el stack containerizado completo, y recién después se promueve. `AGENTS.md` ya exige validar sobre contenedores (`bash scripts/deploy.sh`) y no solo sobre procesos locales.

| Etapa | Stack | Qué se verifica | Cómo |
|---|---|---|---|
| **1. Desarrollo** | `bash scripts/deploy.sh` con `APP_ENV_FILE=.env` (postgres, migrate, api, frontend) **más** `fe-test-*`, ya corriendo, unido por la red externa `ventax_fiscal_test` | Todo: unitarios, integración contra la base real, Playwright mock y live, y el import de fixtures generados por el propio `fe-test` | Local. `FE_GATEWAY_MODE` puede quedar en `mock` para el import, que no llama al gateway; los fixtures salen del `fe-test` real |
| **2. Testing en la VPS** | `APP_ENV_FILE=.env.staging`, red `ventax_fiscal_test` | Reproducir el import de punta a punta con un emisor de staging y confirmar que el facturador queda operable | Solo después de que la etapa 1 esté verde y confirmada |
| **3. Producción** | `APP_ENV_FILE=.env.production` | Alta real con el archivo del cliente | Solo tras la etapa 2, y con la advertencia de ambiente (RN-16) activa |

Dos cuidados propios de este import:

1. **El import no depende del gateway fiscal.** No hace ninguna llamada a FE: recibe un archivo y escribe en nuestra base. Por eso puede validarse íntegro con `FE_GATEWAY_MODE=mock`. Lo único que sí lee del entorno es `FE_API_ENV`, `FE_API_BASE_URL` y `FE_SEND_EMISSION_PROFILE_CODE`, para las validaciones de coherencia (RN-16, RN-08).
2. **La validación de ambiente se prueba de los dos lados.** Un fixture exportado con `env=test` aplicado sobre un deployment con `FE_API_ENV=prod` debe bloquear, y debe poder forzarse con el override. Es el único escenario que exige correr el mismo fixture en dos entornos distintos.

---

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **Re-import sobre facturador productivo** pisa `timbrado` de contextos en uso | Vista previa obligatoria, `usuarios_asignados` resaltado en rojo, auditoría en `0031`, y `documento_nro` nunca pisado |
| 2 | ~~`ruc = emisor_id` es un supuesto~~ **Resuelto**: FE proyecta `emisor_id` desde `emisores.ruc_completo` (§5.3 del SPEC) | Queda solo la advertencia `RUC_DISTINTO` para facturadores creados a mano con otro `ruc`; el valor existente no se pisa |
| 3 | **Archivo sin `perfiles_emision.items`** con `FE_SEND_EMISSION_PROFILE_CODE=true` | Bloqueante `SIN_CONTEXTOS`: inventar códigos produciría rechazos de FE en cada emisión (`fiscal-gateway.client.ts:1216`) |
| 4 | **Dependencia nueva `yaml`** amplía la superficie del backend | Paquete único y de amplio uso, parseo con `maxAliasCount`, árbol transitivo verificado y documentado en TASKS |
| 5 | ~~El fixture puede no representar todas las variantes~~ **Resuelto**: `fe-test` corre local, así que cada variante se genera con el generador real (fase 0) | Queda como riesgo residual que un emisor de producción tenga una forma no reproducida en desarrollo; el esquema es `passthrough` y tolerante, y la vista previa expone cualquier campo no mapeado antes de aplicar |
| 6 | **Cambio de firma en `BackofficeRepository`** rompe el fake de tests | Falla de compilación, no silenciosa; contemplada en la fase 10 |
| 7 | **Un `on conflict` sin la cláusula `where` del índice parcial** falla en tiempo de ejecución, no de compilación | Cubierto por el test de integración de re-import, que es el único camino que ejercita los `do update` |

---

## 7. Evolución prevista

FE expone `GET /admin/emisores/:id/configuracion/export-consumidor` (`facturacion-electronica/src/api/routes/admin.route.ts:1082`), que es exactamente el generador del archivo que el operador sube hoy a mano. Como el parser, el mapper y el diff quedan puros y desacoplados del transporte, la v0.2 —"traer la configuración del emisor" en lugar de "subir el archivo"— es escribir un adaptador que produzca `FeConfigDocument` y reusar el resto sin cambios.
