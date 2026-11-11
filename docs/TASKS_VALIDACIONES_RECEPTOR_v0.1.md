# TASKS - Validaciones del receptor antes de emitir v0.1

SPEC: `docs/SPEC_VALIDACIONES_RECEPTOR_v0.1.md` · PLAN: `docs/PLAN_VALIDACIONES_RECEPTOR_v0.1.md`.

| ID | Tarea | Reglas | Validacion | Estado |
|---|---|---|---|---|
| VAL-001 | API: `shared/validation/receptor.ts` con normalizacion, modulo 11 y validadores | RV-01 a RV-07 | vitest con la tabla de casos de abajo | Hecha (2026-11-11) |
| VAL-002 | Tabla unica de casos (API y web) | todas | revision: los mismos casos en los dos archivos de prueba | Hecha (2026-11-11) |
| VAL-003 | API: `superRefine` en clientes, facturas (crear y preview) y recibos; respuesta 400 con campo y mensaje | RV-08, RV-09 | vitest de rutas: cada campo invalido responde 400 con su mensaje; CA-06 con mock (0 llamadas a FE) | Hecha (2026-11-11) |
| VAL-004 | API: `observaciones` en `GET /clientes`; padron sin cambiar el tipo de documento solo | RV-10, RV-11 | vitest de `clientes.service`; `spec/openapi.yaml` actualizado | Hecha (2026-11-11) |
| VAL-005 | Web: `lib/validacionReceptor.ts` espejo de la API | RV-01 a RV-07 | prueba unitaria con la tabla VAL-002 | Hecha (2026-11-11) |
| VAL-006 | Web: agenda con errores por campo, boton bloqueado con motivo, pastilla "Revisar datos", aviso del DV de la DNIT | RV-09, RV-10, RV-11 | Playwright CA-01 a CA-04, CA-07, CA-08 en 1440/1280/390 | Hecha (2026-11-11) |
| VAL-007 | Web: editor de factura, bloque Cliente, y recibo desde la ficha | RV-08, RV-09 | Playwright CA-01 a CA-03 en el editor, 1440/1280/390 | Hecha (2026-11-11) |
| VAL-008 | `scripts/segel-fs/playwright-validaciones-receptor.cjs` | CA-01 a CA-08, CA-10 | corrida completa contra `.local/segel-ensayo` | Hecha (2026-11-11) |
| VAL-009 | Consulta de diagnostico de clientes existentes y cifra para el usuario | RV-11 | corrida en local; en `segel-fs` solo lectura con confirmacion del usuario | Pendiente |
| VAL-010 | Regresion: `npm run test`, `typecheck`, `lint` (api); `typecheck`, `build` (web); `playwright-ux-resto-app.cjs` agenda/nuevo/ficha; `playwright-nc-cuerpo.cjs` | CA-09 | salidas en esta tabla | Hecha (2026-11-11) |
| VAL-011 | Cierre: repaso de SPEC/PLAN/TASKS, BACKLOG (FS-60, FS-62 cerrados por esta cadena), `HOJA_DE_RUTA` | — | revision | Pendiente |
| VAL-012 | Despliegue en `segel-fs` | — | **solo con orden directa del usuario**; respaldo previo; aviso de la cifra de VAL-009 | Pendiente |

## Tabla de casos (VAL-002)

| Campo | Entrada | Resultado esperado |
|---|---|---|
| RUC | `80012345-0` (DV calculado para la base) | valido, se guarda igual |
| RUC | ` 80012345 - 0 ` | valido, se guarda `80012345-0` |
| RUC | `80012345-1` | invalido: "El RUC 80012345-1 no es válido: el dígito verificador que corresponde es 0" |
| RUC | `80012345` | invalido: "Falta el dígito verificador del RUC. Ejemplo: 80012345-0" |
| RUC | `xxx` | invalido: falta el DV |
| RUC | `12-3` | invalido: la base tiene menos de 3 caracteres |
| RUC | `123456789-0` | invalido: la base tiene mas de 8 caracteres |
| RUC | `4543629-0`, `80044279-2`, `80136968-1` (RUC reales conocidos) | validos: el modulo 11 de la SPEC da 0, 2 y 1 (comprobado el 2026-11-11) |
| RUC | `80120841-6`, `5057016-1`, `A123456-5` (vectores de FE) | validos; `A123456-8` invalido (seria el resultado de un algoritmo equivocado con letras) |
| CI | `1234567` | valido |
| CI | `1.234.567` | valido, se guarda `1234567` |
| CI | `123456A` | invalido |
| PASAPORTE | `AB123456` | valido |
| PASAPORTE | `AB 123456` | valido, se guarda `AB123456` |
| Correo | `cliente@dominio.com` | valido |
| Correo | `cliente @dominio.com` | invalido |
| Correo | `cliente@dominio` | invalido |
| Correo | `` o `   ` | sin correo (nulo) |
| Telefono | `+595 (981) 123-456` | valido, se guarda `595981123456` |
| Telefono | `0981123456` | valido |
| Telefono | `12345` | invalido (menos de 6) |
| Telefono | `1234567890123456` | invalido (mas de 15) |
| Telefono | `` | sin telefono (nulo) |
| Nombre | `ABC` | invalido (menos de 4) |
| Nombre | `Juan   Perez` | valido, se guarda `Juan Perez` |
| Nombre | 256 caracteres | invalido |
| Direccion | 256 caracteres | invalido |
| Numero de casa | `0`, `123456` | valido |
| Numero de casa | `ABC`, `1234567` | invalido |

Los DV de la tabla ya se comprobaron con el algoritmo de la SPEC sobre RUC reales (`80012345` da 0). Se dejan fijos en las pruebas.

## Evidencia

**2026-11-11, stack local de Segel (API y frontend del mismo commit, `X-App-Version` verificado).** Commits `4ca39bb`, `a2d41ff`, `cba6d2b`.

- Decisiones aplicadas: D-1 resuelta con FE (letras expandidas a ASCII); D-2 con la propuesta (FS no calcula el DV, lo pide; solo el padron lo completa); D-3 sin cambio (el telefono se normaliza al guardar).
- Algoritmo del DV contra el padron real de la DNIT cargado en el stack: 365 RUC con letras y 20.000 al azar, 0 diferencias.
- vitest: `receptor.validacion.test.ts` 63, `receptor.paridad.test.ts` 15 (misma tabla contra API y web), `clientes.service.test.ts` 20; suite completa de la API en verde; `typecheck` y `lint` OK; `typecheck` y `build` de la web OK.
- Playwright `scripts/segel-fs/playwright-validaciones-receptor.cjs`, 1440 / 1280 / 390: **67/67** (CA-01 a CA-05; CA-07 con el aviso del DV de la DNIT y el boton "Usar 80136968-1"; CA-08 con un cliente viejo `RUC xxx` creado por SQL y borrado al final).
- Regresion: `playwright-ux-resto-app.cjs` agenda, nuevo, componentes y teclado 85/85; `playwright-nc-cuerpo.cjs` 4/4; `playwright-documentos-escritorio.cjs` 31/31; `playwright-editor-pc.cjs` 18/18.
- Hallazgos: (1) el caso `ficha` de `ux-resto-app` falla por datos: la primera fila de Documentos es una factura de una carga masiva que hizo otra sesion y abre el detalle de la carga; no es de este cambio. (2) Varios guiones usaban el RUC inventado `80000000-1`, con DV incorrecto: la app ahora lo bloquea, como corresponde; se cambio por `80000000-5` en los guiones del repo (`cba6d2b`). `scripts/guia-uso-segel.cjs`, de otra sesion, sigue con el viejo. (3) El texto de ayuda del documento del editor no cambio: lo usan 13 guiones.
- Recibos: la API valida el pagador (RV-01, RV-05); la pantalla de recibos todavia no marca el error por campo (muestra el mensaje de la API).
- Pendiente: VAL-009 (cifra de clientes de `segel-fs` que veran "Revisar datos", solo lectura y con confirmacion), VAL-011 (cierre de docs) y VAL-012 (despliegue con orden directa).
