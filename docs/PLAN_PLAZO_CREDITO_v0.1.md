# PLAN — Plazo de crédito escrito por el operador v0.1

**SPEC:** `docs/SPEC_PLAZO_CREDITO_v0.1.md` · **Backlog:** FS-92

## 1. Diseño

Cambio solo en `apps/web-operacion`. Sin API, base, contrato con FE ni `spec/openapi.yaml`.

| Pieza | Archivo | Qué hace |
|---|---|---|
| Reglas | `src/lib/plazoCredito.ts` (nuevo) | `PLAZO_CREDITO_DEFECTO = 30`, `PLAZO_CREDITO_PASO = 5`, `PLAZO_CREDITO_MIN = 1`, `PLAZO_CREDITO_MAX = 365`; `limpiarPlazo(texto)` (solo dígitos, sin ceros a la izquierda, hasta 3 cifras); `plazoValido(texto) → number \| null`; `errorPlazo(texto) → string \| null`; `sumarPlazo(texto, signo)` (±5 con tope 1..365; con texto inválido parte de 30) |
| Componente | `src/components/CampoPlazo.tsx` (nuevo, catálogo P-C1) | Grupo `[−][número][+]` con `Icono`, `aria-label` en los botones ("Restar 5 días", "Sumar 5 días") y en el campo ("Plazo en días"), `inputMode="numeric"`, `aria-invalid` y error. Props: `valor`, `onCambio`, `deshabilitado`, `error`. Clases con prefijo `.plazo-*` |
| Editor | `src/main.tsx` | El estado pasa de `creditoPlazoDias: number` a `creditoPlazoTexto: string`, inicial `"30"` (RN-01) en `useState` y en `createNuevaFactura`. El pedido usa `plazoValido(...)`; con Crédito y plazo inválido el pedido es `null` (no hay vista previa ni emisión). `motivoBloqueo` suma "Plazo de crédito: escribí un plazo de 1 a 365 días" después del tipo de cambio. El `select` de la banda se reemplaza por `CampoPlazo` |
| Estilos | `src/styles.css` | Reglas `.plazo-campo`, `.plazo-boton`, `.plazo-numero` con tokens (P-T): alto 38 px dentro de `.banda-campo`, botones de 36 px en escritorio y 44 px por debajo de 720 px; borde `--color-line`, radio `--radius-control`, foco visible. Ajustes de la implementacion: la columna del plazo en la banda de escritorio pasa de 110 a 140 px; desde 1024 px el error va debajo, en una linea y fuera del flujo (la banda suma 20 px abajo con `:has`), para no desalinear la fila |
| Icono | `src/components/Icono.tsx` | `mas` ya existia; se agrega `menos` (SVG de trazo, como los demás) |

El plazo del punto (`fiscal_context.credito_plazo_dias`) deja de leerse en la pantalla (D-1); el tipo se conserva porque lo usa la API.

## 2. Riesgos

- **Guiones que usan el `select`:** buscar `Plazo en días` y `banda-plazo` en `scripts/`; si alguno hace `selectOption`, adaptarlo en la misma tarea.
- **Pedido nulo con Contado:** el plazo inválido solo bloquea con Crédito (RN-06); con Contado no se valida.
- **Despliegue:** solo frontend. Regla E-2b de `PLAN_DESPLIEGUE_SEGEL_FS_v0.3`: el frontend se construye con `BUILD_COMMIT_SHA` igual al `X-App-Version` de la API desplegada, para que no salga el aviso de versión. En `segel-fs` solo con autorización explícita del usuario (Regla de Oro).

## 3. Validación

1. `npm run typecheck` y `npm run build` de `apps/web-operacion`.
2. Stack local de ensayo (`.local/segel-ensayo`, `segel-fs-*` en 18492, `fe-segel` contra SIFEN test) con la imagen del frontend reconstruida desde el árbol de trabajo y `BUILD_COMMIT_SHA` = versión de la API del stack.
3. Guion nuevo `scripts/segel-fs/playwright-plazo-credito.cjs`:
   - `pantalla` (sin emitir): CA-01 a CA-04 y CA-06 en 1440, 1280 y 390 px; intercepta el pedido de vista previa para leer `credito_plazo_dias`.
   - `sifen` (emite, con aviso previo a FE): facturas a crédito con 5, 35, 120 y 365 días, receptor `80026570-0`; espera la aprobación y guarda número y estado (CA-05).
4. Guion de reconocimiento (`playwright-reconocimiento-ux.cjs`) sin subir la línea base.
5. Pasar los números a FE para que confirme `dPlazoCre` en su base.
