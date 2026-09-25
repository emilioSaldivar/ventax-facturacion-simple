# PLAN Import de Configuración de Facturador v0.2

**Versión:** 0.2 (refina `PLAN_IMPORT_CONFIG_FACTURADOR_v0.1.md`)
**Fecha:** 2026-09-24
**Estado:** DRAFT — pendiente TASKS

## Alineación

- `AGENTS.md`
- `docs/SPEC_IMPORT_CONFIG_FACTURADOR_v0.2.md` (reglas RN-21 a RN-27, criterios CA-1 a CA-15)
- `docs/PLAN_IMPORT_CONFIG_FACTURADOR_v0.1.md` (arquitectura vigente: piezas puras + repositorio transaccional)
- `docs/TASKS_IMPORT_CONFIG_FACTURADOR_v0.2.md`

**Lo que NO cambia:** la arquitectura de v0.1. Parser, mapper y diff siguen siendo puros; el
repositorio sigue siendo el único que habla con Postgres; el `preview_token` y el advisory lock no se
tocan. Esta versión agrega un campo al contrato y una decisión del operador; no mueve ninguna pieza.

---

## 1. Estrategia

### 1.1 La actividad es la segunda decisión del operador, con la misma mecánica que la primera

v0.1 ya resolvió un caso idéntico: `documento_nro` es un dato que el archivo no trae y que el operador
fija en la vista previa, viaja en `documento_nro_overrides` y solo se aplica a contextos nuevos.

La actividad de un perfil seleccionable es exactamente el mismo problema. Se implementa reusando esa
mecánica —`actividad_overrides`, sugerencia del mapper, validación en el service— en vez de inventar
un camino nuevo. El resultado es que la vista previa termina con dos campos editables por contexto
nuevo, coherentes entre sí.

### 1.2 El mapper deja de decidir solo; propone

Hoy `buildImportPlan` resuelve la actividad o bloquea. Pasa a tener un tercer resultado: **propone**
una actividad y declara las alternativas. El plan gana dos campos por contexto (`actividad_editable`,
`actividad_opciones`) y el diff los expone tal cual.

### 1.3 La distinción de causas se hace donde está la información

`actividad_codigo: null` tiene dos causas y el archivo **no** dice cuál es —`modo_actividad` no se
exporta—. Pero sí dice algo que las separa en la práctica: si hay `grupo_actividades` con elementos,
el perfil es de actividad seleccionable; si no hay nada, no hay con qué construir el contexto.

Esa es la regla operativa, y se implementa en el mapper, que es donde ya vive la validación de negocio.

### 1.4 Los documentos de FE no se tocan desde acá

`facturacion-electronica` tiene su propio `AGENTS.md`, su `METODOLOGIA_SDD.md` y una cadena
SPEC/PLAN/TASKS propia para grupo de actividades. Editar sus documentos desde este proyecto saltearía
ese proceso. Las correcciones quedan enunciadas en §8 del SPEC v0.2 con el texto propuesto, para
aplicarlas allá.

---

## 2. Orden de ejecución

```
1. Doc — sincronizar la copia de GUIA_INTEGRACION_CONSUMIDORES
2. API — contrato zod: grupo_actividades
3. API — mapper: sugerencia, opciones, causas separadas, ignorados
4. API — tipos y diff: actividad_editable / actividad_opciones
5. API — service y rutas: actividad_overrides
6. API — repository: la actividad elegida al crear el contexto
7. Contrato — spec/openapi.yaml
8. Frontend — selector de actividad en la vista previa
9. Tests — unitarios, integración y Playwright
10. Verificación sobre contenedores
```

Los pasos 2 a 6 son una sola unidad funcional: hasta el 6 el import no acepta un perfil seleccionable.

---

## Fase 1 — Sincronizar la copia de la guía

`docs/API_FACTURACION_ELECTRONICA/facturacion-electronica-consumer-docs/GUIA_INTEGRACION_CONSUMIDORES.md`
tiene 1028 líneas contra las 1587 de la canónica: le faltan enteras las secciones 18 a 25, incluida la
**§21 "Configuración Fiscal Exportada"**, que es la que describe el archivo sobre el que se construyó
todo el SPEC v0.1.

Se copia la versión canónica de FE. El nombre del archivo pasa a `GUIA_INTEGRACION_CONSUMIDORES.md`
—sin sufijo de versión— porque es el nombre que el propio export referencia en cada campo, y las
referencias del SPEC se actualizan.

El `openapi.yaml` de esa carpeta también divergió (7276 líneas contra 3582). No se toca en esta
entrega: es material de referencia que no consume el código, y decidir cuál vale requiere revisarlo
con FE. Queda anotado en TASKS.

---

## Fase 2 — Contrato zod

`import/fe-config.contract.ts`, dentro de `perfilItemSchema`:

```ts
const grupoActividadSchema = z
  .object({ codigo: texto, descripcion: texto })
  .passthrough();

// ... en perfilItemSchema:
  grupo_actividades: z.array(grupoActividadSchema).default([])
```

Tolerante como el resto: el campo puede faltar (archivos previos a la funcionalidad) y sus escalares
pueden venir en `null`.

---

## Fase 3 — Mapper

### 3.1 Tipos nuevos en `import.types.ts`

```ts
export interface ActividadOpcion {
  codigo: string;
  descripcion: string | null;
}

// en PlanContexto:
  /** true cuando el perfil no fija actividad y el operador puede elegirla (RN-22). */
  actividad_editable: boolean;
  /** Actividades del grupo que existen en el archivo. Vacio si el perfil fija actividad. */
  actividad_opciones: ActividadOpcion[];
```

### 3.2 Resolución de la actividad, en `buildImportPlan`

Reemplaza el bloque que hoy manda todo `null` a `REFERENCIA_INTERNA_ROTA`:

```
actividad_codigo presente
  └─ como hoy: se valida contra actividades_economicas[] y el contexto queda fijo.

actividad_codigo null
  ├─ grupo con al menos una actividad conocida
  │    ├─ opciones = grupo ∩ actividades_economicas[]           (RN-25)
  │    ├─ sugerida  = principal del archivo si esta en opciones,
  │    │              si no, la primera del grupo                (RN-23)
  │    ├─ ADVERTENCIA PERFIL_SIN_ACTIVIDAD_FIJA
  │    └─ ADVERTENCIA ACTIVIDAD_GRUPO_DESCONOCIDA por cada
  │       actividad del grupo ausente del archivo               (RN-25)
  └─ sin grupo, o ninguna de sus actividades conocida
       └─ BLOQUEANTE REFERENCIA_INTERNA_ROTA                     (RN-26)
```

El mensaje del bloqueante deja de afirmar una causa única:

> "El perfil «X» no informa actividad_codigo y no trae un grupo de actividades que la reemplace.
> Puede ser un perfil apuntado a una entidad inactiva en FE, o un perfil de actividad seleccionable
> sin grupo configurado."

`es_principal` deja de ser solo informativo: pasa a alimentar RN-23. Sigue apareciendo en `ignorados`
—no se persiste— pero el texto se ajusta para no decir que no se usa.

### 3.3 `grupo_actividades` en los ignorados (RN-21)

Se agrega a `reportarIgnorados`, con las actividades como `valor` para que la vista previa las muestre:

```ts
// "Informativo: son las actividades que FE declarara en el XML (gActEco). No se persisten."
```

Se reporta solo si algún perfil lo trae, coherente con la regla de v0.1 de no reportar rutas ausentes.

### 3.4 Consumidor sin estado (RN-27)

En `validarServicioYConsumidor`, cuando los permisos mínimos se satisfacen, se agrega
`CONSUMIDOR_ESTADO_DESCONOCIDO`: el export no informa si la clave está activa, y se sabe por el propio
equipo de FE que `consumidor[]` no filtra por `activo`.

---

## Fase 4 — Diff

`ContextoDiff` suma `actividad_editable` y `actividad_opciones`, y `actividad_codigo` pasa a exponerse
explícitamente (hoy viaja dentro de `clave.actividad`).

`buildDiff` acepta `actividadOverrides` con la misma forma que `overrides` de `documento_nro`, y la
identidad del contexto usa **la actividad efectiva** —la elegida— para buscar su par en el snapshot.
Es lo correcto: un contexto creado con 47591 se reconoce por esa actividad, no por el `null` del
archivo.

`computePreviewToken` no cambia de forma, pero como el plan ahora incluye la actividad sugerida y las
opciones, cualquier cambio en ellas invalida el token. Es el comportamiento deseado.

---

## Fase 5 — Service y rutas

`importApplySchema` suma:

```ts
actividad_overrides: z.record(z.string().trim().min(1).max(40)).default({})
```

`validarOverrides` se generaliza para cubrir los dos tipos. Un override de actividad se ignora con
`OVERRIDE_IGNORADO` cuando:

- el perfil no está en el archivo;
- el contexto ya existe (misma razón que `documento_nro`: no se reescribe lo que ya opera);
- el perfil **fija** actividad (no hay nada que elegir);
- la actividad no está entre las opciones (RN-25).

---

## Fase 6 — Repository

`applyImport` ya inserta `c.actividad_codigo`; como el plan llega con la actividad efectiva resuelta,
**el SQL no cambia**. Solo hay que asegurar que el service aplique los overrides sobre el plan antes de
pasarlo al repositorio, igual que hace con `documento_nro`.

---

## Fase 7 — OpenAPI

- `ImportContextoDiff`: `actividad_codigo`, `actividad_editable`, `actividad_opciones`.
- `FacturadorImportApplyRequest`: `actividad_overrides`.
- Nota en la descripción del preview sobre los perfiles de actividad seleccionable.

---

## Fase 8 — Frontend

En `FacturadorImportView`, dentro de la tarjeta de cada contexto, junto al input de `documento_nro`:

```tsx
{c.actividad_editable ? (
  <FormField label="Actividad economica del contexto">
    <select value={actividadOverrides[c.clave.perfil] ?? c.actividad_codigo} ...>
      {c.actividad_opciones.map((a) => (
        <option key={a.codigo} value={a.codigo}>{a.codigo} — {a.descripcion}</option>
      ))}
    </select>
    <p className="muted">
      FE deja la actividad a eleccion en este perfil. El contexto queda fijado en la elegida;
      si despues hace falta otra, se agrega un contexto nuevo.
    </p>
  </FormField>
) : null}
```

El estado `actividadOverrides` se inicializa en el preview igual que `overrides`, y viaja en el apply.

---

## 3. Validaciones

| Momento | Qué se valida |
|---|---|
| Parseo | `grupo_actividades` opcional, con escalares nulos tolerados |
| Mapper | Opciones ∩ archivo; sugerencia determinista; causa del nulo |
| Diff | Identidad del contexto por la actividad **efectiva** |
| Service | Overrides aplicables; el resto ignorado con advertencia |
| Repository | Sin cambios: recibe la actividad ya resuelta |

---

## 4. Estrategia de testing

**Fixtures nuevos**, derivados del export real de COMERCIAL IBAÑEZ documentado en la memoria del
proyecto (2 establecimientos, 4 actividades, perfiles `*-FE-TODAS` con `actividad_codigo: null`):

| Fixture | Cubre |
|---|---|
| `fe-config-grupo-actividades.json` | Perfil con actividad fija **y** grupo → `ignorados` |
| `fe-config-actividad-seleccionable.json` | `actividad_codigo: null` con grupo de 4 → RN-22, RN-23 |
| `fe-config-actividad-nula-sin-grupo.json` | `actividad_codigo: null` sin grupo → sigue bloqueando |

**Unitarios**: extensión de `backoffice.import.mapper.test.ts` (sugerencia, opciones, ambas causas del
nulo, ignorados) y de `backoffice.import.diff.test.ts` (identidad por actividad efectiva, overrides).

**Service**: override aplicado, e ignorado en los cuatro casos de la fase 5.

**Integración**: un import completo de un perfil seleccionable que deja el contexto con la actividad
elegida y resoluble por `context.repository.ts`.

**Playwright**: el selector visible y funcional en mobile y desktop; ausente en un perfil con actividad
fija.

**Contenedores**: `bash scripts/deploy.sh` y import real del fixture seleccionable.

---

## 5. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **Los fixtures nuevos se derivan de la memoria, no de un export real de COMERCIAL IBAÑEZ** que no está en este repositorio | Se marcan como derivados en `fixtures/README.md`, igual que los de v0.1. Se pueden reemplazar exportando desde fe-test con la clave del emisor 6 |
| 2 | **Elegir la actividad cambia la identidad del contexto**: si el operador elige distinto en dos imports, se crean dos contextos en vez de actualizar uno | Es correcto por modelo —la actividad es parte de la clave única— y RN-24 lo declara. La vista previa muestra `CREAR`, así que el operador lo ve antes de aplicar |
| 3 | **La sugerencia depende de `es_principal`**, que hasta ahora se ignoraba | Determinista y con fallback a la primera del grupo; cubierto por test |
| 4 | **La guía de FE sigue afirmando algo incorrecto** mientras no se corrija allá | El SPEC v0.2 §8 documenta la discrepancia y el import no depende de esa afirmación |

---

## 6. Qué queda fuera y por qué

- **Contexto por cada actividad del grupo** (RN-24): multiplicaría contextos y usuarios. Aditivo después.
- **Persistir el grupo**: el gateway manda una sola actividad; FE arma el `gActEco` desde el perfil.
- **`openapi.yaml` de referencia divergente**: hay que resolverlo con FE, no adivinando cuál vale.
