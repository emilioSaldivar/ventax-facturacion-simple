# PLAN Recibo de Dinero v0.1

## Alineacion

- `docs/SPEC_RECIBO_DINERO_v0.1.md`
- `docs/TASKS_RECIBO_DINERO_v0.1.md`
- `docs/PLAN_NOTA_PEDIDO_PRESUPUESTO_v0.1.md` — compartido: pdf.service.ts, verificacion.routes.ts, logo_url/rubro_descripcion

---

## Resumen Tecnico

El modulo de Recibos de Dinero es mas simple que Notas: un solo item (importe) en lugar de tabla de items, dos origenes (directo y desde factura credito), y un PDF de formato compacto (A5 o media carta). Comparte con el modulo de Notas el endpoint de verificacion publica y el wrapper PDF.

**Nota:** si el modulo de Notas ya fue implementado, los pasos de `pdf.service.ts` y `verificacion.routes.ts` ya estaran listos — solo se agrega la ruta de recibo.

---

## Fase 1 — Migraciones

### 1.1 `0023_recibos_dinero.sql`

```sql
CREATE TYPE recibo_estado AS ENUM ('BORRADOR', 'EMITIDO');
CREATE TYPE recibo_forma_pago AS ENUM (
  'EFECTIVO', 'TRANSFERENCIA', 'CHEQUE',
  'TARJETA_CREDITO', 'TARJETA_DEBITO', 'OTRO'
);

CREATE TABLE recibos_dinero (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facturador_id            uuid NOT NULL REFERENCES facturadores(id),
  numero                   integer,
  estado                   recibo_estado NOT NULL DEFAULT 'BORRADOR',
  fecha_cobro              date NOT NULL,
  pagador_nombre           text NOT NULL,
  pagador_documento_tipo   text,
  pagador_documento        text,
  concepto                 text NOT NULL,
  importe                  numeric(14,2) NOT NULL CHECK (importe > 0),
  forma_pago               recibo_forma_pago NOT NULL DEFAULT 'EFECTIVO',
  referencia_bancaria      text,
  factura_id               uuid REFERENCES facturas_operativas(id),
  factura_numero_display   text,
  verification_token       uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  emitido_at               timestamptz,
  deleted_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recibos_dinero_numeracion (
  facturador_id  uuid PRIMARY KEY REFERENCES facturadores(id),
  ultimo_numero  integer NOT NULL DEFAULT 0
);

-- Indices
CREATE INDEX recibos_dinero_facturador_idx ON recibos_dinero(facturador_id) WHERE deleted_at IS NULL;
CREATE INDEX recibos_dinero_factura_idx ON recibos_dinero(factura_id) WHERE factura_id IS NOT NULL;
CREATE UNIQUE INDEX recibos_dinero_verification_token_uidx ON recibos_dinero(verification_token);
```

**Nota sobre la FK `factura_id`:** revisar el nombre exacto de la tabla de facturas antes de aplicar (`facturas_operativas` o `facturas`). Ajustar si es necesario.

---

## Fase 2 — API Backend

Archivos nuevos bajo `apps/api/src/modules/recibos/`:

```
recibos/
  recibos.types.ts       — interfaces TypeScript
  recibos.repository.ts  — PgRecibosRepository
  recibos.service.ts     — logica de negocio
  recibos.pdf.ts         — template HTML del PDF
  recibos.routes.ts      — rutas Express
```

### 2.1 `recibos.types.ts`

```typescript
export type ReciboEstado = 'BORRADOR' | 'EMITIDO';
export type ReciboFormaPago =
  | 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE'
  | 'TARJETA_CREDITO' | 'TARJETA_DEBITO' | 'OTRO';

export interface ReciboRecord { ... }
export interface ReciboCreateInput { ... }
export interface ReciboUpdateInput { ... }
export interface RecibosRepository { ... }
```

### 2.2 `recibos.repository.ts`

Metodos:
- `create(input): Promise<ReciboRecord>`
- `findById(id, facturadorId): Promise<ReciboRecord | null>`
- `list(facturadorId, filtros): Promise<ReciboRecord[]>`
- `update(id, facturadorId, input): Promise<ReciboRecord>` — solo BORRADOR
- `emitir(id, facturadorId): Promise<ReciboRecord>` — transaccion atomica
- `softDelete(id, facturadorId): Promise<void>` — solo BORRADOR
- `findByVerificationToken(token): Promise<ReciboRecord | null>`
- `listByFactura(facturaId, facturadorId): Promise<ReciboRecord[]>`

El metodo `emitir` usa el mismo patron de numeracion atomica que Notas:

```sql
INSERT INTO recibos_dinero_numeracion (facturador_id, ultimo_numero)
VALUES ($1, 1)
ON CONFLICT (facturador_id) DO UPDATE
  SET ultimo_numero = recibos_dinero_numeracion.ultimo_numero + 1
RETURNING ultimo_numero;
```

### 2.3 `recibos.service.ts`

Validaciones y logica:
- `createRecibo`: `importe > 0`, `fecha_cobro` no futura, `pagador_nombre` no vacio
- `updateRecibo`: rechaza si EMITIDO → 409
- `emitirRecibo`: llama `repository.emitir`; no requiere items (el importe ya esta en el registro)
- `crearDesdeFactura(facturaId, facturadorId, overrides)`: valida que la factura tenga `condicion_venta = CREDITO`; si es contado → 422; crea borrador pre-llenado con datos del cliente y total de la factura
- `getPdf`: rechaza si BORRADOR → 409
- `getVerificacion`: token invalido o BORRADOR → `{ valido: false }`

### 2.4 `recibos.pdf.ts`

Funcion principal:
```typescript
export function buildReciboPdfHtml(recibo: ReciboRecord, facturador: FacturadorParaPdf): string
```

Reutiliza `numeroALetras` (exportada desde `notas.pdf.ts` o movida a `shared/utils/numero-letras.ts`).

El PDF es A5 / media carta (mas compacto que la Nota). Estilos inline para compatibilidad con motor PDF.

Secciones del HTML:
1. Titulo "RECIBO DE DINERO" + Nro + Fecha
2. Bloque emisor (logo + razon_social + ruc + direccion + telefono)
3. Bloque "RECIBIDO DE" (pagador_nombre + documento)
4. Concepto + referencia factura (si aplica)
5. Importe en numeros + en letras (mayusculas)
6. Forma de pago + referencia bancaria (si aplica)
7. Pie: QR (base64 via `qrcode`) izquierda + "Firma del emisor" derecha

### 2.5 Endpoint de verificacion — `verificacion.routes.ts`

Si ya fue implementado en el modulo de Notas, solo agregar:

```typescript
router.get('/recibo/:token', async (req, res) => {
  const result = await recibosService.getVerificacion(req.params.token);
  if (!result.valido) return res.status(404).json(result);
  res.json(result);
});
```

Si todavia no existe el router de verificacion, crearlo con ambas rutas (`/nota/:token` y `/recibo/:token`) en el mismo archivo.

### 2.6 `recibos.routes.ts`

```
POST   /recibos
GET    /recibos
GET    /recibos/:id
PATCH  /recibos/:id
POST   /recibos/:id/emitir
GET    /recibos/:id/pdf
DELETE /recibos/:id
POST   /facturas/:id/recibo         ← en facturas.routes.ts o recibos.routes.ts (a definir)
GET    /facturas/:id/recibos        ← igual
```

La ubicacion de las rutas `POST /facturas/:id/recibo` y `GET /facturas/:id/recibos` puede ser en `facturas.routes.ts` (mas legible) o en un router separado montado en `/facturas`. Decidir al implementar.

### 2.7 Registro en `app.ts`

```typescript
import { recibosRouter } from './modules/recibos/recibos.routes';
app.use(env.API_BASE_PATH, recibosRouter);
// verificacionRouter ya montado desde modulo de Notas
```

---

## Fase 3 — Frontend Operativo

### 3.1 Tipo `OperationView`

Agregar `"recibos"` al union type.

### 3.2 Item en menu lateral

```typescript
{ label: "Recibos de Dinero", view: "recibos", icon: "🧾" }
```

### 3.3 Componente `RecibosView`

Sub-vistas:
- `"list"` — listado con busqueda y filtros
- `"form"` — alta directa / edicion
- `"detail"` — vista readonly post-emision con PDF

### 3.4 Formulario

Campos:
1. Pagador (busqueda en agenda — reusa componente existente)
2. Fecha de cobro (default: hoy)
3. Concepto (textarea libre)
4. Importe
5. Forma de pago (select)
6. Referencia bancaria (input, visible si forma_pago != EFECTIVO)
7. Vinculo a factura credito (opcional — busqueda por numero)

Acciones: `Guardar borrador` · `Emitir` (modal de confirmacion)

### 3.5 Integracion Con Detalle De Factura Credito

En la vista de detalle de una factura con `condicion_venta = CREDITO`, agregar la seccion **Cobros**:
- Lista de recibos emitidos: numero, importe, fecha, forma de pago
- Boton `+ Emitir recibo de cobro` → llama `POST /facturas/:id/recibo` → navega a `"form"` con datos pre-llenados

---

## Fase 4 — Tests

### `recibos.service.test.ts`

- Crear recibo directo exitoso
- Importe <= 0 → error de validacion
- Fecha cobro futura → error
- Emitir recibo → numero asignado
- PATCH sobre EMITIDO → 409
- DELETE sobre EMITIDO → 409
- `crearDesdeFactura` con factura credito → recibo pre-llenado
- `crearDesdeFactura` con factura contado → 422
- Verificacion por token valido → `{ valido: true }`
- Verificacion por token de borrador → `{ valido: false }`

---

## Orden De Ejecucion

```
1. Migracion 0023_recibos_dinero.sql
2. recibos.types.ts
3. recibos.repository.ts
4. recibos.service.ts
5. recibos.pdf.ts  (reutilizar numeroALetras del modulo notas)
6. Agregar ruta /recibo/:token en verificacion.routes.ts
7. recibos.routes.ts
8. Registro en app.ts
9. Actualizar spec/openapi.yaml
10. Tests recibos.service.test.ts
11. Typecheck + build API
12. Frontend — RecibosView (list + form + detail)
13. Frontend — seccion Cobros en detalle factura credito
14. Typecheck + build web-operacion
```

---

## Dependencias

| Recurso | Estado |
|---|---|
| `html-pdf-node` o `puppeteer` | Compartido con modulo Notas |
| `qrcode` | Compartido con modulo Notas |
| `pdf.service.ts` | Creado en modulo Notas |
| `verificacion.routes.ts` | Creado en modulo Notas; solo agregar ruta `/recibo/:token` |
| `numeroALetras` | Creado en modulo Notas; mover a `shared/utils/` si no esta ahi |

---

## Riesgos Y Decisiones

| Item | Decision |
|---|---|
| Nombre tabla facturas | Verificar si es `facturas_operativas` o `facturas` antes de aplicar la migracion |
| Ubicacion rutas `POST /facturas/:id/recibo` | En `facturas.routes.ts` si el modulo de facturas ya tiene router propio, sino en `recibos.routes.ts` con prefijo `/facturas` |
| `numeroALetras` | Exportar desde `notas.pdf.ts` o moverlo a `apps/api/src/shared/utils/numero-letras.ts` para que ambos modulos lo usen sin duplicar |
| Formato PDF | A5 o media carta — mas compacto que Nota. Confirmar con el facturador si prefiere A4 |
