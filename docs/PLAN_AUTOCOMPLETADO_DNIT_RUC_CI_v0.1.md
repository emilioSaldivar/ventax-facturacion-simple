# PLAN Autocompletado DNIT RUC CI v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_AUTOCOMPLETADO_DNIT_RUC_CI_v0.1.md`
- `docs/SPEC_AGENDAS_CLIENTES_CATALOGO_v0.1.md`
- `docs/SPEC_REFINAMIENTO_USABILIDAD_EMISION_v0.1.md`
- `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md`
- `spec/openapi.yaml`

## Estrategia

Implementar una arquitectura simple de carga mensual DNIT, ejecutable desde Bash, con enfoque `snapshot` para mantener datos actualizados y almacenamiento minimo.

La carga DNIT debe estar aislada de la transaccionalidad de la app principal: si falla el loader, la operacion de emision/facturacion no debe caerse ni bloquearse.

## Fase 1 - Loader mensual standalone

Objetivo:
- crear un servicio `dnit-ruc-loader` ejecutable por `node`/`bash`.

Diseno:
- estructura dedicada:
  - `dnit-ruc-loader/src/{config,db,download,extract,import,main}.js`
  - `dnit-ruc-loader/sql/001_init.sql`
  - `dnit-ruc-loader/scripts/{run.sh,install-cron.sh}`
  - `dnit-ruc-loader/data/{downloads,extracted,logs}`
- fuente:
  - `https://www.dnit.gov.py/en/web/portal-institucional/listado-de-ruc-con-sus-equivalencias`
- deteccion dinamica de links `ruc*.zip` desde HTML.

Validacion:
- ejecucion manual de `scripts/run.sh` descarga, extrae y procesa sin pasos manuales intermedios.

## Fase 2 - Modelo de datos y recarga tipo snapshot

Objetivo:
- mantener una tabla final compacta con el estado DNIT vigente.

Diseno:
- tabla final `dnit_ruc_contribuyentes` con:
  - `ruc_sin_dv`, `dv`, `ruc` generado;
  - `nombre`, `apellido`, `razon_social`;
  - `codigo_dnit`, `estado`;
  - metadata de importacion.
- staging mensual (`dnit_ruc_contribuyentes_staging`) para carga temporal.
- estrategia de refresco por corrida:
  1. cargar TXT completo en staging por batches;
  2. validar conteos minimos;
  3. transaccion corta de swap:
     - `TRUNCATE dnit_ruc_contribuyentes`;
     - `INSERT INTO dnit_ruc_contribuyentes SELECT ... FROM staging`;
  4. limpiar staging.

Decision:
- no usar `diff` entre archivos de meses; se prioriza simplicidad y consistencia operativa.

Validacion:
- segunda corrida sobre mismo set no deja duplicados ni residuos.

## Fase 3 - Parseo y normalizacion

Objetivo:
- transformar lineas DNIT en identidad util para autocompletado.

Diseno:
- formato esperado:
  - `ruc_sin_dv|razon_social_fuente|dv|codigo_dnit|estado|`
- reglas:
  - ignorar lineas vacias/invalidas y registrar error;
  - soportar acentos, enie y caracteres especiales;
  - `codigo_dnit` puede ser vacio;
  - con `ruc_sin_dv <= 7` y coma en nombre: split `APELLIDO, NOMBRE`;
  - juridicas o sin patron confiable: conservar en `razon_social`.

Validacion:
- muestra real DNIT procesa fisicas y juridicas sin romper encoding.

## Fase 4 - Limpieza de almacenamiento

Objetivo:
- minimizar uso de disco y evitar acumulacion de artefactos.

Diseno:
- cada corrida usa solo carpeta del mes (`YYYY-MM`) en `downloads` y `extracted`.
- al finalizar una corrida exitosa:
  - eliminar ZIP descargados;
  - eliminar TXT extraidos;
  - conservar solo logs mensuales.
- al iniciar corrida:
  - limpiar remanentes de corridas previas incompletas.

Validacion:
- despues de corrida exitosa no quedan ZIP/TXT persistidos.

## Fase 5 - Aislamiento de la app principal (no interferencia)

Objetivo:
- evitar que el loader degrade o interrumpa la aplicacion transaccional.

Diseno:
- ejecucion fuera del proceso principal (cron/CLI independiente).
- conexion DB dedicada del loader (pool y credenciales separadas cuando sea posible).
- transacciones por batch en staging; no mantener transacciones gigantes.
- `lock_timeout` y `statement_timeout` conservadores en sesion del loader.
- swap final en ventana corta y fuera de horario pico (`02:00-04:00`).
- en error:
  - rollback de la corrida actual;
  - mantener tabla final previa intacta;
  - registrar fallo sin afectar endpoints de emision.

Validacion:
- simular fallo durante importacion y verificar que la API principal sigue operativa.

## Fase 6 - Integracion API/UI para autocompletado

Objetivo:
- usar la tabla DNIT solo como fallback de identidad para `RUC/CI`.

Diseno:
- API lookup por:
  - `(ruc_sin_dv, dv)` cuando entra con DV;
  - `ruc_sin_dv` cuando entra sin DV.
- UI mantiene prioridad:
  1. agenda del emisor;
  2. agenda global;
  3. autocompletado DNIT silencioso al `Enter`/`blur`/avance de campo.
- solo aplica a `RUC/CI`.
- para `pasaporte/otros`:
  - sin limpieza automatica;
  - carga manual alfanumerica;
  - sin autocompletado DNIT.

Validacion:
- pruebas de flujo mobile-first y desktop/tablet sin romper comportamiento actual de agenda.

## Fase 7 - Operacion mensual

Objetivo:
- automatizar ejecucion y observabilidad basica.

Diseno:
- `scripts/run.sh`:
  - prepara directorios;
  - ejecuta importador;
  - guarda `data/logs/import-YYYY-MM.log`.
- `scripts/install-cron.sh`:
  - instala `0 3 2 * *`.
- resumen final por corrida:
  - ZIP encontrados/descargados;
  - TXT procesados;
  - insertados;
  - lineas invalidas;
  - duracion total.

Validacion:
- cron instalado y corrida manual producen mismo resultado funcional.

## Riesgos Y Mitigaciones

- Riesgo: HTML DNIT cambie y no se detecten ZIP.
  - Mitigacion: log explicito de links detectados y alerta en cero resultados.
- Riesgo: lock o latencia en DB durante recarga.
  - Mitigacion: staging + swap corto + timeouts + horario valle.
- Riesgo: corrupcion por archivo incompleto.
  - Mitigacion: validar tamano/conteo minimo antes de swap.
- Riesgo: crecimiento de disco por artefactos.
  - Mitigacion: borrado post-exito y limpieza preventiva al inicio.

## Cierre documental esperado

- Crear `docs/TASKS_AUTOCOMPLETADO_DNIT_RUC_CI_v0.1.md` con matriz de ejecucion.
- Registrar evidencia tecnica y operativa en `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md` al cerrar tareas.
