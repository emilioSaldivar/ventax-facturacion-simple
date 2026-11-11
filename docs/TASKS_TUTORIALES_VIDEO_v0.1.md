# TASKS — Tutoriales en video para operadores v0.1

**SPEC:** `docs/SPEC_TUTORIALES_VIDEO_v0.1.md` · **PLAN:** `docs/PLAN_TUTORIALES_VIDEO_v0.1.md`

## Pendientes del usuario (bloquean la grabacion)

| Id | Pregunta | Estado |
|---|---|---|
| P-1 | Que cedula se usa para mostrar el autocompletado por CI (una persona con RUC ACTIVO en el padron; su nombre se oculta en pantalla). La CI 5057036 de pruebas anteriores no figura en el padron local. | Abierta |
| P-2 | Si los hallazgos H-1..H-5 y H-7 (PLAN §6) se corrigen antes de grabar, con su propia cadena, o se graba como esta. | Abierta |
| P-3 | Buzon que recibe el correo real con el codigo de V1 (propuesta: `esaldivar.segel@gmail.com`). | Abierta |

## Matriz

| Id | Tarea | Verificacion | Estado |
|---|---|---|---|
| TUT-000 | SPEC, PLAN y TASKS | revision del usuario | HECHO (borrador 2026-11-11) |
| TUT-001 | `lib.cjs`: navegador 1440 x 900, subtitulos, cursor, `senalar`, reemplazo de datos, guardia, `espera` y `linea.json` | prueba en seco sobre "Información y estado": captura con subtitulo, sin datos prohibidos; la guardia falla a proposito con un texto prohibido inyectado | PENDIENTE |
| TUT-002 | `montar.sh`: webm → mp4 H.264 1440 x 900 con cortes de espera | `ffprobe`: codec h264, 1440x900, duracion = bruto − esperas cortadas (± 2 s) | PENDIENTE |
| TUT-003 | `preparar-v1.cjs`: usuario `demo-tutorial` idempotente en la base local (2 puntos, `must_change_password`, sin T&C ni OTP) | dos corridas seguidas dejan un solo usuario activo; login → `CHANGE_PASSWORD`, `ACCEPT_TYC` | PENDIENTE (P-3) |
| TUT-004 | V1 primer ingreso | Playwright: todas las escenas de PLAN §5 V1; guardia sin fallas; mp4 | PENDIENTE |
| TUT-005 | V2 secciones | idem | PENDIENTE |
| TUT-006 | V3 facturas (contado, credito, CI, USD) | cuatro facturas "Aprobada · KUDE listo" en SIFEN test; numeros en `estado.json`; mp4 | PENDIENTE (P-1) |
| TUT-007 | V4 notas de credito total y parcial | dos NC aprobadas; mp4 | PENDIENTE (TUT-006) |
| TUT-008 | V5 carga masiva de facturas (3) y remisiones (2) | cargas "Finalizada", filas "Aprobado"; mp4 | PENDIENTE |
| TUT-009 | V6 recibos, presupuesto, clientes y catalogo | recibo de la factura a credito y recibo suelto "Emitido"; presupuesto convertido sin emitir; mp4 | PENDIENTE (TUT-006) |
| TUT-010 | Revision final | una captura por escena revisada a ojo y con la guardia; seis mp4 en `test-results/tutoriales/`; resumen en esta matriz | PENDIENTE |
| TUT-011 | Hallazgos H-1..H-8 en `docs/BACKLOG.md` | filas nuevas con referencia a esta cadena | PENDIENTE |

## Antes de cada corrida

1. Stack local en la punta de la rama, con API y frontend del mismo commit (`X-App-Version`).
2. Aviso a la sesion de FE (`facturacion-electronica-7c`) con la cantidad aproximada de emisiones: 4 facturas, 2 NC, 3 facturas y 2 remisiones por carga, y 2 recibos.
3. Ningun otro guion sobre `operador-ensayo` mientras dure la grabacion.
4. `ENSAYO_PASSWORD_FILE` apuntando al archivo fuera del repo.

## Evidencia

(se completa al cerrar cada tarea)
