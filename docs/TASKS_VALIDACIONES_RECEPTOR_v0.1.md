# TASKS - Validaciones del receptor antes de emitir v0.1

SPEC: `docs/SPEC_VALIDACIONES_RECEPTOR_v0.1.md` · PLAN: `docs/PLAN_VALIDACIONES_RECEPTOR_v0.1.md`.

| ID | Tarea | Reglas | Validacion | Estado |
|---|---|---|---|---|
| VAL-001 | API: `shared/validation/receptor.ts` con normalizacion, modulo 11 y validadores | RV-01 a RV-07 | vitest con la tabla de casos de abajo | Pendiente |
| VAL-002 | Tabla unica de casos (API y web) | todas | revision: los mismos casos en los dos archivos de prueba | Pendiente |
| VAL-003 | API: `superRefine` en clientes, facturas (crear y preview) y recibos; respuesta 400 con campo y mensaje | RV-08, RV-09 | vitest de rutas: cada campo invalido responde 400 con su mensaje; CA-06 con mock (0 llamadas a FE) | Pendiente |
| VAL-004 | API: `observaciones` en `GET /clientes`; padron sin cambiar el tipo de documento solo | RV-10, RV-11 | vitest de `clientes.service`; `spec/openapi.yaml` actualizado | Pendiente |
| VAL-005 | Web: `lib/validacionReceptor.ts` espejo de la API | RV-01 a RV-07 | prueba unitaria con la tabla VAL-002 | Pendiente |
| VAL-006 | Web: agenda con errores por campo, boton bloqueado con motivo, pastilla "Revisar datos", aviso del DV de la DNIT | RV-09, RV-10, RV-11 | Playwright CA-01 a CA-04, CA-07, CA-08 en 1440/1280/390 | Pendiente |
| VAL-007 | Web: editor de factura, bloque Cliente, y recibo desde la ficha | RV-08, RV-09 | Playwright CA-01 a CA-03 en el editor, 1440/1280/390 | Pendiente |
| VAL-008 | `scripts/segel-fs/playwright-validaciones-receptor.cjs` | CA-01 a CA-08, CA-10 | corrida completa contra `.local/segel-ensayo` | Pendiente |
| VAL-009 | Consulta de diagnostico de clientes existentes y cifra para el usuario | RV-11 | corrida en local; en `segel-fs` solo lectura con confirmacion del usuario | Pendiente |
| VAL-010 | Regresion: `npm run test`, `typecheck`, `lint` (api); `typecheck`, `build` (web); `playwright-ux-resto-app.cjs` agenda/nuevo/ficha; `playwright-nc-cuerpo.cjs` | CA-09 | salidas en esta tabla | Pendiente |
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

Pendiente.
