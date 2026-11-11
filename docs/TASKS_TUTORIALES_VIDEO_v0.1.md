# TASKS — Tutoriales en video para operadores v0.1

**SPEC:** `docs/SPEC_TUTORIALES_VIDEO_v0.1.md` · **PLAN:** `docs/PLAN_TUTORIALES_VIDEO_v0.1.md`

## Pendientes del usuario

| Id | Pregunta | Estado |
|---|---|---|
| P-1 | Que cedula se usa para mostrar el autocompletado por CI. | **Resuelta (2026-11-11):** `5057016`, del usuario, y `SEGEL SA` para empresas (SPEC D-6) |
| P-2 | Si los hallazgos se corrigen antes de grabar. | **Resuelta (2026-11-11):** primero las correcciones, con su cadena, y despues los tutoriales; ademas, quitar el "Próximo número" estimado. Hecho en `SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1` (SPEC D-8) |
| P-3 | Buzon que recibe el codigo de V1. | **Resuelta (2026-11-11):** `emilio.saldivar@segel.com.py`; en pantalla, `ejemplo@ejemplo.com`; usuario demo `operador.ejemplo` (SPEC D-7) |
| P-5 | Si se abren las paginas publicas de presupuesto y recibo en V6 (SPEC §3.9). | **Resuelta (2026-11-11):** el usuario lo delego a TUT-001; no muestran datos del emisor, **se abren** |
| P-4 | Formato y ubicacion de los videos (SPEC D-4 y D-5, hoy "propuesta"): MP4 1440 x 900, de 2 a 6 minutos, fuera de git. | **Resuelta (2026-11-11):** se acepta la propuesta |

## Matriz

| Id | Tarea | Verificacion | Estado |
|---|---|---|---|
| TUT-000 | SPEC, PLAN y TASKS | revision del usuario | HECHO (borrador 2026-11-11; refinado el mismo dia con el mapa de la app, SPEC §3, el glosario de estados, §4, y las escenas completas, PLAN §5) |
| TUT-001 | `lib.cjs`: navegador 1440 x 900, subtitulos, cursor, `senalar`, reemplazo por zonas, guardia, `espera`, `linea.json`, cobertura por `paso` | prueba en seco sobre "Información y estado" y sobre `/verificar/recibo/…`: captura con subtitulo, sin datos prohibidos; la guardia falla a proposito con un texto prohibido inyectado; `cobertura.json` lista los ids declarados. Decide si las paginas publicas se abren (SPEC §3.9) | HECHO (2026-11-11) |
| TUT-002 | `montar.sh` y `cobertura.cjs`: webm → mp4 H.264 1440 x 900 con cortes de espera; union de coberturas | `ffprobe`: codec h264, 1440x900, duracion = bruto − esperas cortadas (± 2 s); `cobertura.cjs` sobre dos `cobertura.json` de prueba lista lo que falta | HECHO (2026-11-11) |
| TUT-003 | `preparar-v1.cjs`: usuario `operador.ejemplo` idempotente en la base local (2 puntos, `must_change_password`, sin T&C ni OTP) y los CSV de `datos/` | dos corridas seguidas dejan un solo usuario activo; login → `CHANGE_PASSWORD`, `ACCEPT_TYC`; los CSV pasan la validacion de la app | HECHO (2026-11-11, sin los CSV: pasan a TUT-008) |
| TUT-004 | V1 primer ingreso | Playwright: todas las escenas de PLAN §5 V1; guardia sin fallas; mp4 | PENDIENTE |
| TUT-005 | V2 recorrido por la app | idem; cubre todas las filas de SPEC §3.1, §3.2 y §3.4 asignadas a V2 y los estados de §4 asignados a V2 | PENDIENTE |
| TUT-006 | V3 facturas (contado, credito, CI, sin nombre, USD) | cinco facturas "Aprobada · KUDE listo" en SIFEN test; numeros en `estado.json`; mp4 | PENDIENTE |
| TUT-007 | V4 notas de credito total y parcial | dos NC aprobadas; mp4 | PENDIENTE (TUT-006) |
| TUT-008 | V5 carga masiva de facturas (3) y remisiones (2) | cargas "Finalizada", filas "Aprobado"; mp4 | PENDIENTE |
| TUT-009 | V6 comercial y agendas | recibo de la factura a credito y recibo suelto "Emitido"; presupuesto "Aceptado" y convertido sin emitir; producto del catalogo usado en Nueva factura; mp4 | PENDIENTE (TUT-006) |
| TUT-010 | Revision final | una captura por escena revisada a ojo y con la guardia; seis mp4 en `test-results/tutoriales/`; salida de `cobertura.cjs` sin filas pendientes (o cada una justificada aca); resumen en esta matriz | PENDIENTE |
| TUT-011 | Hallazgos H-1..H-8 | H-1..H-7 corregidos (`SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1`); H-8 en `BACKLOG` como FS-60 | HECHO (2026-11-11) |
| TUT-012 | Segunda pasada del inventario contra `ea396f7` | mapa de SPEC §3 con cada etiqueta buscada en `apps/web-operacion/src`; nada nuevo que corregir antes de grabar | HECHO (2026-11-11) |

## Antes de cada corrida

1. Stack local en la punta de la rama, con API y frontend del mismo commit (`X-App-Version`).
2. Aviso a la sesion de FE (`facturacion-electronica-7c`) con la cantidad aproximada de emisiones: 5 facturas, 2 NC, 3 facturas y 2 remisiones por carga, y 2 recibos (los recibos no van a SIFEN).
3. Ningun otro guion sobre `operador-ensayo` mientras dure la grabacion.
4. `ENSAYO_PASSWORD_FILE` apuntando al archivo fuera del repo.
5. Releer PLAN §5 contra el codigo si hubo commits de otra sesion en `apps/web-operacion` desde la ultima pasada (TUT-012).

## Evidencia

### TUT-012 (2026-11-11)

Etiquetas del mapa buscadas con `grep` en `apps/web-operacion/src`: menu (`main.tsx` 826-868), tipos de emision y su estado (`lib/tiposEmision.ts`), pestañas y filtros de Documentos (`views/DocumentsView.tsx` 698, 760-830), acciones de la ficha (1205-1490), estados simples (`lib/estados.ts` 40-82), resultado de emision (`components/ResultadoEmision.tsx`), notas de credito (`views/CreditNoteView.tsx`), remisiones (`views/RemisionView.tsx`), cargas (`carga-masiva.tsx`), presupuestos y recibos (`main.tsx` 3540-4700), agenda y catalogo (`views/AgendaView.tsx`, `views/CatalogView.tsx`), paginas publicas (`main.tsx` 55-57). Todas las etiquetas citadas existen; no se encontraron hallazgos nuevos.

### TUT-001 a TUT-003 (2026-11-11)

Stack local en `6e549e7` (API y frontend, `X-App-Version` verificado), redesplegado para incluir el hotfix del comprador sin nombre que muestra V3. Nada emitido.

- **TUT-001** `scripts/tutoriales/prueba-seca.cjs` con `operador-ensayo`, 1440 x 900: **9/9**.
  - Barra superior: "Empresa Ejemplo S.A. RUC 80000000-0 · Timbrado 12345678 · … · SERVICIOS DE CONSULTORÍA INFORMÁTICA … Operador Demo".
  - Tarjeta "Facturador y sesión" y encabezado de "Información y estado" sin `5057016` ni `SALDIVAR`.
  - Ficha de Documentos, "Información fiscal": CDC `0112345678…`, sin `05057016`.
  - Guardia: falla con `operador-ensayo` inyectado en la pagina.
  - Paginas publicas `/verificar/recibo/79a42c74…` y `/verificar/nota/3c4cafa5…`: sin datos del emisor (P-5).
  - `cobertura.json` con los ids declarados; `bruto.webm` grabado.
  - Hallazgos de diseño, llevados al PLAN §2: el reemplazo pasa del DOM a las respuestas de la API; el timbrado y el CDC llevan el RUC del emisor; la actividad local no pegaba con los items; la lectura de 55 ms por palabra no alcanzaba (pasa a 300 ms).
- **TUT-002** `montar.sh` sobre el bruto de la prueba seca (20,72 s) con una espera simulada de 6,0 a 10,4 s: mp4 de **17,27 s** (esperado 17,32 s: menos 1 s inicial y 2,4 s de espera); `ffprobe`: `h264,1440,900,yuv420p`. `cobertura.cjs` con dos `cobertura.json` de prueba: lista las filas faltantes por video y avisa el id `x-raro` fuera del mapa.
- **TUT-003** `preparar-v1.cjs` corrido dos veces: "operador.ejemplo: 1 usuario activo, 2 puntos"; clave en `fe-local-data/segel-ensayo/tutorial-v1.pass` (600, 14 caracteres). Login: 200 con `CHANGE_PASSWORD`, `ACCEPT_TYC`. Los CSV de `datos/` se arman en TUT-008, a partir de las planillas de ejemplo.

(el resto se completa al cerrar cada tarea)
