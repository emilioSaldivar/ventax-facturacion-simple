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

## Fase 4 — Frontend Operativo

Archivos a modificar: `apps/web-operacion/src/main.tsx` y `apps/web-operacion/src/styles.css`.

### 4.1 Tipo `OperationView`

Agregar `"notas"` al union type.

### 4.2 Item en menu lateral

```typescript
{ label: "Notas / Presupuestos", view: "notas", icon: "📋", group: "secondary" }
```

### 4.3 Componente `NotasView`

Sub-vistas:
- `"list"` — listado con filtros y CTA nueva nota
- `"form"` — alta/edicion con tabla de filas dinamica
- `"detail"` — vista de solo lectura post-emision con boton PDF

### 4.4 Formulario — tabla de filas

Cada fila tiene:
- Handle de reorden (drag o flechas arriba/abajo)
- Select de tipo (`Contexto` / `Item` / `Item sin precio`)
- Textarea de descripcion
- Campo cantidad (solo si tipo = ITEM)
- Campo precio unitario (solo si tipo = ITEM)
- Total calculado en tiempo real (solo si tipo = ITEM)
- Boton eliminar fila

CTA al pie de la tabla: `+ Contexto` · `+ Item` · `+ Item sin precio`

Total de la nota, calculado en tiempo real, abajo de la tabla.

### 4.5 Descarga De PDF

`GET /notas/:id/pdf` devuelve `Content-Type: application/pdf`. El frontend hace:

```typescript
const blob = await fetch(`/api/v1/notas/${id}/pdf`, { headers: { Authorization: ... } }).then(r => r.blob());
const url = URL.createObjectURL(blob);
window.open(url, '_blank');
```

---

## Fase 5 — Tests

### 5.1 `notas.service.test.ts`

- Crear borrador exitoso
- Intentar emitir sin items ITEM → error
- Emitir exitoso → numero asignado correctamente
- PATCH sobre nota EMITIDA → 409
- DELETE sobre nota EMITIDA → 409
- Verificacion por token valido → `{ valido: true }`
- Verificacion por token de borrador → `{ valido: false }`
- Verificacion por token inexistente → `{ valido: false }`
- `numeroALetras` cubre casos: 0, 1, 999, 1000, 1000000, 1750000

### 5.2 Typecheck + Build

- `npm run typecheck --workspace=apps/api`
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
