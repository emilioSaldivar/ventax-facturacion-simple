# TASKS — Tutoriales en video para operadores v0.1

**SPEC:** `docs/SPEC_TUTORIALES_VIDEO_v0.1.md` · **PLAN:** `docs/PLAN_TUTORIALES_VIDEO_v0.1.md`

## Pendientes del usuario

| Id | Pregunta | Estado |
|---|---|---|
| P-1 | Que cedula se usa para mostrar el autocompletado por CI. | **Resuelta (2026-11-11):** `5057016`, del usuario, y `SEGEL SA` para empresas (SPEC D-6) |
| P-2 | Si los hallazgos se corrigen antes de grabar. | **Resuelta (2026-11-11):** primero las correcciones, con su cadena, y despues los tutoriales; ademas, quitar el "Próximo número" estimado. Hecho en `SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1` (SPEC D-8) |
| P-3 | Buzon que recibe el codigo de V1. | **Resuelta (2026-11-11):** `emilio.saldivar@segel.com.py`; en pantalla, `ejemplo@ejemplo.com`; usuario demo `operador.ejemplo` (SPEC D-7) |
| P-5 | Si se abren las paginas publicas de presupuesto y recibo en V6 (SPEC §3.9). | **Resuelta (2026-11-11):** el usuario lo delego a TUT-001; no muestran datos del emisor, **se abren** |
| P-6 | Si se regraba V5 por la actividad real ("TALLERES DE CHAPERÍA Y PINTURA") que se ve en el recuadro "Perfil" de una carga nueva (dos escenas). No es nombre ni RUC; ya esta corregido en `lib.cjs`. Regrabar emite 3 facturas y 2 remisiones mas en SIFEN test | Abierta |
| P-7 | Si se regraban V1 (subtitulo "Reenviar código" con el boton en cuenta regresiva, H-13) y V4 (subtitulo "la misma nota de crédito" sobre la ventana corta, H-11). V1 manda otro correo con codigo; V4 emite 2 NC mas | Abierta |
| P-4 | Formato y ubicacion de los videos (SPEC D-4 y D-5, hoy "propuesta"): MP4 1440 x 900, de 2 a 6 minutos, fuera de git. | **Resuelta (2026-11-11):** se acepta la propuesta |

## Matriz

| Id | Tarea | Verificacion | Estado |
|---|---|---|---|
| TUT-000 | SPEC, PLAN y TASKS | revision del usuario | HECHO (borrador 2026-11-11; refinado el mismo dia con el mapa de la app, SPEC §3, el glosario de estados, §4, y las escenas completas, PLAN §5) |
| TUT-001 | `lib.cjs`: navegador 1440 x 900, subtitulos, cursor, `senalar`, reemplazo por zonas, guardia, `espera`, `linea.json`, cobertura por `paso` | prueba en seco sobre "Información y estado" y sobre `/verificar/recibo/…`: captura con subtitulo, sin datos prohibidos; la guardia falla a proposito con un texto prohibido inyectado; `cobertura.json` lista los ids declarados. Decide si las paginas publicas se abren (SPEC §3.9) | HECHO (2026-11-11) |
| TUT-002 | `montar.sh` y `cobertura.cjs`: webm → mp4 H.264 1440 x 900 con cortes de espera; union de coberturas | `ffprobe`: codec h264, 1440x900, duracion = bruto − esperas cortadas (± 2 s); `cobertura.cjs` sobre dos `cobertura.json` de prueba lista lo que falta | HECHO (2026-11-11) |
| TUT-003 | `preparar-v1.cjs`: usuario `operador.ejemplo` idempotente en la base local (2 puntos, `must_change_password`, sin T&C ni OTP) y los CSV de `datos/` | dos corridas seguidas dejan un solo usuario activo; login → `CHANGE_PASSWORD`, `ACCEPT_TYC`; los CSV pasan la validacion de la app | HECHO (2026-11-11, sin los CSV: pasan a TUT-008) |
| TUT-004 | V1 primer ingreso | Playwright: todas las escenas de PLAN §5 V1; guardia sin fallas; mp4 | HECHO (2026-11-11) |
| TUT-005 | V2 recorrido por la app | idem; cubre todas las filas de SPEC §3.1, §3.2 y §3.4 asignadas a V2 y los estados de §4 asignados a V2 | HECHO (2026-11-11) |
| TUT-006 | V3 facturas (contado, credito, CI, sin nombre, USD) | cinco facturas "Aprobada · KUDE listo" en SIFEN test; numeros en `estado.json`; mp4 | HECHO (2026-11-11) |
| TUT-007 | V4 notas de credito total y parcial | dos NC aprobadas; mp4 | HECHO (2026-11-11) |
| TUT-008 | V5 carga masiva de facturas (3) y remisiones (2) | cargas "Finalizada", filas "Aprobado"; mp4 | HECHO (2026-11-11) |
| TUT-009 | V6 comercial y agendas | recibo de la factura a credito y recibo suelto "Emitido"; presupuesto "Aceptado" y convertido sin emitir; producto del catalogo usado en Nueva factura; mp4 | HECHO (2026-11-11) |
| TUT-010 | Revision final | una captura por escena revisada a ojo y con la guardia; seis mp4 en `test-results/tutoriales/`; salida de `cobertura.cjs` sin filas pendientes (o cada una justificada aca); resumen en esta matriz | HECHO (2026-11-11), con P-6 y P-7 abiertas |
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

### TUT-004 a TUT-010 (2026-11-11)

Stack local en `6e549e7` (API y frontend), FE local `fe-segel-*` contra SIFEN test, FE avisado (`facturacion-electronica-7c`, que confirmo y advirtio sobre la NC de facturas sin nombre y la numeracion compartida). Orden real: V1, V3, V4, V5, V6, V2.

| Video | mp4 (`test-results/tutoriales/<video>/`) | Duracion | Pasos | Guardia | Resultado en SIFEN test |
|---|---|---|---|---|---|
| V1 primer ingreso | `v1-primer-ingreso.mp4` | 2:20 | 19 | sin fallas | no emite; correo con codigo a `emilio.saldivar@segel.com.py` |
| V2 recorrido | `v2-recorrido.mp4` | 3:41 | 29 | sin fallas | no emite |
| V3 facturas | `v3-facturas.mp4` | 4:58 (bruto 31:04) | 39 | sin fallas | 1010624 contado, 1010625 credito, 1010626 CI, 1010627 sin nombre, 1010628 USD: aprobadas |
| V4 notas de credito | `v4-notas-credito.mp4` | 2:32 (bruto 12:59) | 20 | sin fallas | NC 1010027 total (USD, sobre 1010628) y 1010028 parcial (sobre 1010624): aprobadas |
| V5 carga masiva | `v5-carga-masiva.mp4` | 3:30 (bruto 6:46) | 27 | sin fallas | carga de 3 facturas (1010632 a 1010634) y de 2 remisiones (0000507 y 0000508): "Finalizada", todas aprobadas |
| V6 comercial y agendas | `v6-comercial-agendas.mp4` | 3:57 | 29 | sin fallas | recibos (no van a SIFEN), presupuesto 0000004 aceptado y convertido sin emitir, MANT-01 en el catalogo, BANCO CENTRAL DEL PARAGUAY en la agenda |

Todos: `ffprobe` h264, 1440x900. Paginas publicas de recibo y presupuesto abiertas en V6 (P-5).

**Cobertura** (`node scripts/tutoriales/cobertura.cjs`): **72/73 filas**. Falta `4-rechazada` en V3: el estado "Rechazada por SIFEN" se muestra en V2, con una factura rechazada real de un dia anterior; V3 no fuerza un rechazo (R-8). Queda justificado.

**Corridas fallidas y lo que dejaron** (todas por el guion, ninguna por la app ni por FE):
- V1: dos intentos (selector de "Nueva contraseña"; la guardia freno por `segel.com.py` legitimo de los T&C). Dos correos de codigo extra.
- V3: un intento cortado en la factura en USD (el selector encontraba tambien el subtitulo; desde ahi el subtitulo va por CSS). Dejo 1010620 a 1010623 aprobadas.
- V4: un intento cortado en el atajo de Documentos (clic detras de la ventana). Dejo NC 1010025 (total, CI) y 1010026 (parcial, contado) aprobadas.
- V5: un intento sin emitir (selector) y otro con las remisiones **rechazadas** por SIFEN (2303, transportista ficticio de la planilla de ejemplo, H-12): `001-001-0000505` y `0000506`, sin inutilizar; la carga queda "Requiere atención". Las 3 facturas de esa corrida (1010629 a 1010631) salieron aprobadas.
- V6: cuatro intentos (boton "Anular", sugerencia del catalogo, panel de "Nuevo cliente"). Dejaron recibos y presupuestos de mas en la base local; no van a SIFEN.
- V2: una corrida completa descartada por un codigo interno a la vista ("Servicio FS51-FE-3rdj") y textos de botones; regrabada.

**Revision a ojo:** hojas de capturas de cada video revisadas (`hoja.png` en cada carpeta). Hallazgos de la app H-9 a H-16 en PLAN §6.
