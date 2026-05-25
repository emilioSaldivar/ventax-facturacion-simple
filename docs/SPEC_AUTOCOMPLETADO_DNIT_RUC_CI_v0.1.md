# SPEC Autocompletado DNIT RUC CI v0.1

## Alineacion

- `AGENTS.md`
- `docs/METODOLOGIA_SDD.md`
- `docs/SPEC_PRODUCTO_MVP_v0.1.md`
- `docs/SPEC_AGENDAS_CLIENTES_CATALOGO_v0.1.md`
- `docs/SPEC_REFINAMIENTO_USABILIDAD_EMISION_v0.1.md`
- `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`
- `spec/openapi.yaml`

## Objetivo

Incorporar autocompletado de identidad basica desde una fuente DNIT (`dnit_ruc_contribuyentes`) en el flujo de `Nueva factura`, sin reemplazar la agenda del facturador ni la agenda global existente.

El autocompletado DNIT se enfoca en completar identidad (nombre, apellido o razon social) cuando el operador captura documento `RUC` o `CI` y no elige una sugerencia de agenda.

## Problema

1. Hoy el flujo de sugerencias depende de agenda del emisor y fallback en agenda global.
2. Cuando no hay match en agendas, el operador debe cargar manualmente todos los datos.
3. Para `RUC` y `CI` existe fuente publica DNIT util para autocompletar identidad basica, pero no incluye datos de contacto completos (correo/celular/direccion).
4. La logica de limpieza/normalizacion de documento no debe afectar tipos distintos de `RUC` y `CI` (por ejemplo pasaporte u otros alfanumericos).

## Alcance Funcional

### 1) Prioridad de busqueda en cliente

Cuando el tipo de documento sea `RUC` o `CI`, la UI mantiene el orden actual:

1. sugerencias desde agenda del facturador;
2. fallback en agenda global;
3. si no se selecciona ninguna sugerencia y el documento queda completo, autocompletado silencioso con DNIT.

El concepto de DNIT no se expone como "agenda"; se usa solo para completar identidad de forma operativa.

### 2) Trigger de autocompletado

Para `RUC` o `CI`, el autocompletado DNIT se ejecuta al finalizar carga del campo documento:

- `Enter`;
- `blur` (salir del campo);
- avance al siguiente campo del formulario.

No se agrega dropdown/sugerencia visual DNIT en pantalla. El completado es directo sobre campos de identidad cuando hay match univoco.

### 3) Tipos de documento alcanzados y limpieza

- Solo para `RUC` y `CI` se permite limpieza/normalizacion del numero para lookup.
- Para `PASAPORTE` u otros tipos, no se limpia ni restringe de forma numerica; se mantiene carga manual alfanumerica.
- El autocompletado DNIT no corre para tipos distintos de `RUC` y `CI`.

### 4) Resultado de autocompletado

Si hay match DNIT:

- completar `nombre` y `apellido` cuando la identidad sea persona fisica;
- completar `razon_social` cuando corresponda juridica o cuando no aplique split confiable de nombre/apellido.

Siempre queda en manos del operador completar o ajustar datos opcionales:

- correo;
- celular;
- direccion.

### 5) Reglas de matching de documento

- Entrada permitida: con o sin DV (`1234567` o `1234567-8`).
- Con DV: match por `(ruc_sin_dv, dv)`.
- Sin DV: match por `ruc_sin_dv`.
- Si el match por `ruc_sin_dv` devuelve mas de un DV posible, no autocompletar y solicitar verificacion del DV.

## Modelo DNIT Requerido

La tabla operativa `dnit_ruc_contribuyentes` debe contemplar:

- `ruc_sin_dv` (obligatorio);
- `dv` (obligatorio);
- `nombre` (nullable);
- `apellido` (nullable);
- `razon_social` (obligatorio, normalizada);
- `codigo_dnit` (nullable);
- `estado` (nullable);
- metadata de importacion (`fuente_archivo`, `fecha_importacion`, timestamps).

Restriccion de idempotencia:

- unicidad por `(ruc_sin_dv, dv)`;
- importacion mensual con `ON CONFLICT ... DO UPDATE`.

## Reglas de Clasificacion de Identidad

### Personas fisicas (heuristica operativa inicial)

- Candidata: `ruc_sin_dv` de 7 digitos o menos.
- Si la razon social fuente cumple patron `APELLIDO, NOMBRE`:
  - `apellido = izquierda de coma`;
  - `nombre = derecha de coma`;
  - `razon_social = nombre + espacio + apellido` normalizado.
- Si no hay patron confiable con coma:
  - conservar en `razon_social`;
  - dejar `nombre/apellido` nulos.

### Personas juridicas (heuristica operativa inicial)

- Candidata: `ruc_sin_dv` de mas de 7 digitos.
- Conservar texto fuente como `razon_social` normalizada.
- `nombre/apellido` nulos.

## No Alcance

- Reemplazar agenda del facturador por DNIT.
- Mostrar DNIT como origen visible para usuario final.
- Completar automaticamente correo, celular o direccion desde DNIT.
- Cambios en logica fiscal SIFEN o numeracion fiscal.

## Reglas y Restricciones

- Se mantiene limite de dominio: DNIT es fuente de autocompletado de identidad, no de relacion comercial.
- `tenant_id` y `facturador_id` obligatorios en toda operacion de emision/agenda.
- No exponer secretos ni datos sensibles en UI/logs.
- Si se modifica contrato HTTP para lookup/autocompletado, actualizar `spec/openapi.yaml`.

## Criterios De Aceptacion

1. Con tipo `RUC` o `CI`, se mantiene prioridad agenda emisor -> agenda global.
2. Si no se selecciona sugerencia y el documento se completa, el sistema intenta autocompletado DNIT al `Enter`, `blur` o avance de campo.
3. El autocompletado DNIT no muestra sugerencias visuales en lista.
4. Para tipos distintos de `RUC` y `CI`, no se aplica limpieza forzada ni autocompletado DNIT.
5. Con match univoco DNIT, se completa identidad (`nombre/apellido` o `razon_social`) y el operador completa opcionales manualmente.
6. El importador DNIT es idempotente por `(ruc_sin_dv, dv)` y no duplica registros al rerun.
7. Casos juridicos con razon social extensa (EAS, SA, fideicomisos, subcomisiones) se preservan en `razon_social` sin split forzado.
8. Casos fisicos con formato `APELLIDO, NOMBRE` se normalizan a `nombre`, `apellido` y `razon_social` consistente.

## Validacion Minima Esperada

- Backend:
  - `npm run test --workspace @facturacion-simple/api`
  - `npm run typecheck --workspace @facturacion-simple/api`
  - `npm run lint --workspace @facturacion-simple/api`
- Frontend:
  - `npm run typecheck --workspace @facturacion-simple/web-operacion`
  - `npm run build --workspace @facturacion-simple/web-operacion`
- Aplicacion desplegada:
  - `bash scripts/deploy.sh`
- E2E/visual con Playwright sobre contenedores:
  - flujo `RUC/CI` con agenda emisor, fallback global y fallback DNIT;
  - flujo `otros documentos` con carga manual alfanumerica sin limpieza automatica;
  - validacion mobile-first y al menos un viewport desktop/tablet.
