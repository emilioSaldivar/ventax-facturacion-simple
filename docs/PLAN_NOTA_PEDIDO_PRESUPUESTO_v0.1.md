# PLAN Nota de Pedido / Nota de Presupuesto v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_NOTA_PEDIDO_PRESUPUESTO_v0.1.md`
- `docs/TASKS_NOTA_PEDIDO_PRESUPUESTO_v0.1.md`

---

## Resumen Tecnico

El modulo agrega tres piezas: persistencia (DB + migraciones), API REST (tipos + repository + service + routes + PDF) y UI operativa (formulario + listado + visualizacion). El endpoint de verificacion publica es compartido entre este modulo y el de Recibos de Dinero y se implementa una sola vez.

---

## Fase 1 — Migraciones

### 1.1 `0021_facturador_logo_rubro.sql`

Agrega dos campos al facturador que alimentan la cabecera del PDF:

```sql
ALTER TABLE facturadores
  ADD COLUMN logo_url text,
  ADD COLUMN rubro_descripcion text;
```

### 1.2 `0022_notas_comerciales.sql`

Crea las tres tablas del modulo:

```sql
CREATE TYPE nota_tipo AS ENUM ('PRESUPUESTO', 'PEDIDO');
CREATE TYPE nota_estado AS ENUM ('BORRADOR', 'EMITIDO');
CREATE TYPE nota_fila_tipo AS ENUM ('CONTEXTO', 'ITEM', 'ITEM_SIN_PRECIO');

CREATE TABLE notas_comerciales (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facturador_id     uuid NOT NULL REFERENCES facturadores(id),
  tipo              nota_tipo NOT NULL,
  numero            integer,
  estado            nota_estado NOT NULL DEFAULT 'BORRADOR',
  fecha_emision     date,
  cliente_nombre    text NOT NULL,
  cliente_ruc       text,
  verification_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  emitido_at        timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notas_comerciales_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id         uuid NOT NULL REFERENCES notas_comerciales(id) ON DELETE CASCADE,
  orden           integer NOT NULL,
  fila_tipo       nota_fila_tipo NOT NULL,
  descripcion     text NOT NULL,
  cantidad        numeric(12,2),
  precio_unitario numeric(14,2),
  precio_total    numeric(14,2)
);

CREATE TABLE notas_comerciales_numeracion (
  facturador_id uuid NOT NULL REFERENCES facturadores(id),
  tipo          nota_tipo NOT NULL,
  ultimo_numero integer NOT NULL DEFAULT 0,
  PRIMARY KEY (facturador_id, tipo)
);

-- Indices
CREATE INDEX notas_comerciales_facturador_idx ON notas_comerciales(facturador_id) WHERE deleted_at IS NULL;
CREATE INDEX notas_comerciales_items_nota_idx ON notas_comerciales_items(nota_id);
CREATE UNIQUE INDEX notas_comerciales_verification_token_uidx ON notas_comerciales(verification_token);
```

---

## Fase 2 — API Backend

Archivos nuevos bajo `apps/api/src/modules/notas/`:

```
notas/
  notas.types.ts       — interfaces TypeScript
  notas.repository.ts  — PgNotasRepository implementando NotasRepository
  notas.service.ts     — logica de negocio
  notas.pdf.ts         — generacion de HTML para PDF
  notas.routes.ts      — rutas Express
```

Un archivo compartido para verificacion publica:

```
apps/api/src/modules/verificacion/verificacion.routes.ts
```

### 2.1 `notas.types.ts`

```typescript
export type NotaTipo = 'PRESUPUESTO' | 'PEDIDO';
export type NotaEstado = 'BORRADOR' | 'EMITIDO';
export type NotaFilaTipo = 'CONTEXTO' | 'ITEM' | 'ITEM_SIN_PRECIO';

export interface NotaFilaRecord { ... }
export interface NotaRecord { ... }
export interface NotaCreateInput { ... }
export interface NotaUpdateInput { ... }
export interface NotaConItems extends NotaRecord {
  items: NotaFilaRecord[];
  total: number;
  total_letras: string;
}
export interface NotasRepository { ... }
```

### 2.2 `notas.repository.ts`

Metodos:
- `create(input): Promise<NotaRecord>` — inserta nota + items en transaccion
- `findById(id, facturadorId): Promise<NotaConItems | null>`
- `list(facturadorId, filtros): Promise<NotaRecord[]>`
- `update(id, facturadorId, input): Promise<NotaConItems>` — solo si BORRADOR
- `emitir(id, facturadorId): Promise<NotaConItems>` — transaccion: numero + estado + fecha
- `softDelete(id, facturadorId): Promise<void>` — solo si BORRADOR
- `findByVerificationToken(token): Promise<NotaRecord | null>`

El metodo `emitir` usa:
```sql
INSERT INTO notas_comerciales_numeracion (facturador_id, tipo, ultimo_numero)
VALUES ($1, $2, 1)
ON CONFLICT (facturador_id, tipo) DO UPDATE
  SET ultimo_numero = notas_comerciales_numeracion.ultimo_numero + 1
RETURNING ultimo_numero;
```

### 2.3 `notas.service.ts`

Validaciones y logica:
- `createNota`: valida cliente_nombre no vacio, al menos 1 item ITEM para poder emitir despues (no se valida al crear borrador)
- `updateNota`: rechaza si estado = EMITIDO
- `emitirNota`: valida que haya al menos 1 item tipo ITEM; llama `repository.emitir`
- `getPdf`: rechaza si estado = BORRADOR
- `getVerificacion`: busca por token; si no existe o estado = BORRADOR, retorna `{ valido: false }`

### 2.4 `notas.pdf.ts`

Genera el HTML que luego se convierte a PDF. No usa Puppeteer directamente — retorna un string HTML; el caller decide si usar Puppeteer, wkhtmltopdf o `html-pdf-node`.

Funciones:
- `buildNotaPdfHtml(nota: NotaConItems, facturador: FacturadorParaPdf): string`
  - `FacturadorParaPdf`: `{ razon_social, ruc, rubro_descripcion, logo_url, telefono, direccion }`
- `numeroALetras(n: number): string` — implementacion local, solo guaranies

El HTML usa estilos inline para maxima compatibilidad con cualquier motor de PDF.

### 2.5 Endpoint de verificacion — `verificacion.routes.ts`

```
GET /verificar/nota/:token     → verifica notas_comerciales
GET /verificar/recibo/:token   → verifica recibos_dinero (implementar cuando llegue ese modulo)
```

Sin middleware de autenticacion. Se monta fuera del prefijo `/api/v1` si se quiere URL mas corta, o dentro si es mas simple — decision a tomar al implementar.

### 2.6 `notas.routes.ts`

Monta en `router.use('/notas', requireAuth, notasRouter)`:

```
POST   /notas
GET    /notas
GET    /notas/:id
PATCH  /notas/:id
POST   /notas/:id/emitir
GET    /notas/:id/pdf
DELETE /notas/:id
```

### 2.7 Registro en `app.ts`

```typescript
import { notasRouter } from './modules/notas/notas.routes';
import { verificacionRouter } from './modules/verificacion/verificacion.routes';
// ...
app.use(env.API_BASE_PATH, notasRouter);
app.use('/verificar', verificacionRouter);  // sin /api/v1
```

### 2.8 OpenAPI

Agregar a `spec/openapi.yaml` los schemas y paths del modulo notas y del endpoint de verificacion.

---

## Fase 3 — Conversion HTML a PDF

### Opcion seleccionada: `html-pdf-node`

Ya utilizado en el proyecto (revisar si esta disponible en `apps/api/package.json`). Si no esta, agregar:

```
npm install html-pdf-node --workspace=apps/api
```

Wrapper:

```typescript
// apps/api/src/shared/pdf/pdf.service.ts
export async function htmlToPdfBuffer(html: string): Promise<Buffer>
```

---

## Fase 4 — Frontend Operativo (base — implementada)

La estructura base ya fue implementada (NP-016 a NP-018 DONE): `NotasView` con sub-vistas list/form/detail, tabla de filas dinámica, total en tiempo real, guardar borrador, emitir y descarga de PDF.

---

## Fase 5 — Frontend UX Enhancement: DNIT + Catálogo

Modificación de `apps/web-operacion/src/main.tsx`. No requiere cambios en API ni en DB.

### 5.1 Estado del cliente

Reemplazar campos planos `formClienteNombre` + `formClienteRuc` por:

```typescript
interface NotaClienteState {
  documento_tipo: 'RUC' | 'CI';  // solo frontend, para DNIT lookup
  documento: string;               // persiste como cliente_ruc
  nombre: string;                  // persiste como cliente_nombre
}
const [cliente, setCliente] = useState<NotaClienteState>({
  documento_tipo: 'RUC', documento: '', nombre: ''
});
const [clienteAutocompleting, setClienteAutocompleting] = useState(false);
const [clienteMessage, setClienteMessage] = useState<string | null>(null);
const [clienteSuggestions, setClienteSuggestions] = useState<ClienteSearchResult[]>([]);
```

### 5.2 Autocomplete desde DNIT

Llamar `GET /clientes/dnit/autocomplete?documento_tipo=...&documento=...` al perder foco en el campo número. Mismo patrón que `InvoiceView.tryAutocompleteDnit()`.

### 5.3 Busqueda de agenda mientras tipea nombre

Debounce 300ms sobre `cliente.nombre` → `GET /clientes/buscar?q=...&limit=5` → muestra dropdown de sugerencias. Al seleccionar, llena nombre y documento. Mismo patrón que `InvoiceView`.

### 5.4 Estado extendido de filas

Cada fila necesita un ID cliente-side para indexar el estado de catálogo:

```typescript
interface NotaFilaDraft {
  _id: string;           // crypto.randomUUID() — solo frontend, no va a la API
  orden: number;
  fila_tipo: NotaFilaTipo;
  descripcion: string;
  cantidad: string;        // string para input controlado
  precio_unitario: string; // string para input controlado
}
const [catalogSuggestions, setCatalogSuggestions] = useState<Record<string, CatalogoItem[]>>({});
const [catalogMessage, setCatalogMessage] = useState<Record<string, string | null>>({});
const [catalogSaving, setCatalogSaving] = useState<Record<string, boolean>>({});
```

### 5.5 Typeahead de catalogo por fila ITEM

Al cambiar descripcion en fila tipo ITEM (debounce 300ms): `GET /catalogo/items?q=...&limit=5`. Al seleccionar resultado: pre-llena descripcion + precio_unitario. El precio **no se bloquea** — siempre editable.

### 5.6 Guardar item en catalogo

Si el operador completa una fila tipo ITEM sin seleccionar del catálogo, ofrecer botón "Guardar en catálogo". Llama `POST /catalogo/items` con `iva_tipo: "IVA_10"` como default (sin desglose en notas, el campo es requerido por el schema del catálogo existente).

### 5.7 Total en tiempo real

```typescript
const totalNota = formFilas
  .filter(f => f.fila_tipo === 'ITEM')
  .reduce((acc, f) => {
    const cant = Number(f.cantidad);
    const precio = Number(f.precio_unitario);
    return acc + (cant > 0 && precio > 0 ? Math.round(cant * precio) : 0);
  }, 0);
```

### 5.8 Payload al guardar

Al construir el cuerpo del request:
- `cliente_nombre`: `cliente.nombre.trim()`
- `cliente_ruc`: `cliente.documento.trim() || null`
- `items`: mapear `formFilas` a `NotaFilaInput[]` (excluir `_id`, convertir cantidad/precio a number)

---

## Fase 6 — Tests

### 6.1 `notas.service.test.ts` (ya completado)

Tests existentes: 16/16 passed. No requieren cambios para la Fase 5.

### 6.2 Typecheck + Build post-enhancement

Después de implementar Fase 5:
- `npm run typecheck --workspace=apps/web-operacion`
- `npm run build --workspace=apps/web-operacion`

---

## Orden De Ejecucion

```
1. Migraciones (0021 y 0022)
2. notas.types.ts
3. notas.repository.ts
4. notas.service.ts  +  numeroALetras
5. pdf.service.ts  (wrapper html-pdf-node)
6. notas.pdf.ts  (template HTML)
7. verificacion.routes.ts
8. notas.routes.ts
9. Registro en app.ts
10. OpenAPI spec/openapi.yaml
11. Tests notas.service.test.ts
12. Typecheck + build API
13. Frontend — NotasView (list + form + detail)
14. Typecheck + build web-operacion
```

---

## Dependencias Externas

| Paquete | Uso | Ya instalado? |
|---|---|---|
| `html-pdf-node` | HTML → PDF buffer | Verificar en package.json |
| `qrcode` | Generar imagen QR para el PDF | Probablemente no — agregar |

Antes de implementar, verificar:
```bash
grep "html-pdf\|qrcode\|puppeteer" apps/api/package.json
```

---

## Riesgos Y Decisiones

| Item | Decision |
|---|---|
| Motor de PDF | `html-pdf-node` si ya esta disponible; sino evaluar `puppeteer` (mas pesado) o `@sparticuz/chromium` (lambda-friendly) |
| QR en PDF | Generar imagen QR como base64 con `qrcode` e insertarla como `<img src="data:image/png;base64,...">` en el HTML del PDF |
| Logo en PDF | Igual que QR: si `logo_url` es accesible publicamente, usarla directamente en `<img src="...">`. Si es path local, convertir a base64 |
| URL verificacion | Montar en `/verificar` (fuera de `/api/v1`) para que la URL del QR sea corta: `factura.ventax.app/verificar/nota/TOKEN` |
| Numero correlativo | Usar `INSERT ... ON CONFLICT DO UPDATE RETURNING` para garantizar atomicidad sin locks manuales |
