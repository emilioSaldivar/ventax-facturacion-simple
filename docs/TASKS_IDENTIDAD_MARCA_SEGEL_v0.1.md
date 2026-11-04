# TASKS Identidad De Marca Segel v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_IDENTIDAD_MARCA_SEGEL_v0.1.md`
- `docs/PLAN_IDENTIDAD_MARCA_SEGEL_v0.1.md`

## Estado General

- `SPEC`: DONE (D-1 a D-5 confirmadas por el usuario, 2026-11-04).
- `PLAN`: DONE.
- `TASKS`: SGL-001 a SGL-010, SGL-012 y SGL-014 a SGL-016 y SGL-018 DONE. SGL-011 y SGL-017 PARTIAL (V-2, V-5 y V-6 con salvedades). SGL-013 PENDIENTE.
- Destino: solo staging (D-9). Produccion no se toca.

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| SGL-001 | SDD | Redactar SPEC, PLAN y TASKS, y contrastar sus referencias con el codigo | DONE (2026-11-04) | V-0 en verde |
| SGL-002 | SDD | Confirmar D-1 a D-5 con el usuario | DONE (2026-11-04) | Decisiones marcadas como confirmadas en el SPEC |
| SGL-003 | Assets | Copiar assets y generar iconos PWA (PLAN §1) | DONE (2026-11-04) | Archivos en destino. Iconos de 192 y 512 px revisados a ojo |
| SGL-004 | Web | Variables, fuente, tonos y logo en `styles.css` (PLAN §2) | DONE (2026-11-04) | V-2 y V-3 |
| SGL-005 | Web | Textos, logos y colores en `main.tsx` (PLAN §2) | DONE (2026-11-04) | V-1 y V-3 |
| SGL-006 | Web | `index.html`, `manifest.webmanifest` y `sw.js`; eliminar assets Ventax (PLAN §1 y §2) | DONE (2026-11-04) | V-1 y V-4 |
| SGL-007 | Backoffice | Variables, titulos y etiquetas (PLAN §3) | DONE (2026-11-04) | V-1, V-2 y V-3 |
| SGL-008 | API | Textos, HTML de entrega y test (PLAN §4) | DONE (2026-11-04) | V-1 y V-2 |
| SGL-009 | API | Plantillas de correo (PLAN §4), con test de la URL del logo y de la ausencia de textos Ventax | DONE (2026-11-04) | V-1, V-2 y CA-07 |
| SGL-010 | Validacion | Crear `scripts/playwright-identidad-segel.cjs` (V-3 y V-4) | DONE (2026-11-04) | El script pasa contra los contenedores |
| SGL-011 | Validacion | Corrida completa V-1 a V-6 sobre `bash scripts/deploy.sh` | PARTIAL (2026-11-04), ver Evidencia | Todo en verde, con evidencia en esta matriz |
| SGL-012 | Cierre | `README.md`, `AGENTS.md` y fila en `TASKS_IMPLEMENTACION_MVP_v0.1.md`; repasar SPEC, PLAN y TASKS | DONE (2026-11-04) | Documentos alineados con lo implementado |
| SGL-014 | Revision | Armar el kit en `packages/shared/brand/` desde la web oficial, con README (PLAN §6) | DONE (2026-11-04) | CA-10 |
| SGL-015 | Revision | Aplicar rojo, negro, Montserrat y logos oficiales en apps, API y correos (PLAN §6) | DONE (2026-11-04) | V-1, V-2 y V-3 |
| SGL-016 | Revision | Fondo blanco (PLAN §6) | DONE (2026-11-04) | V-3 y CA-09 |
| SGL-017 | Revision | Repetir V-1 a V-4 y V-6 sobre `bash scripts/deploy.sh` | PARTIAL (2026-11-04), ver Evidencia | Evidencia en esta matriz |
| SGL-018 | Staging | Desplegar en staging segun PLAN §7 y verificar | DONE (2026-11-04) | Identidad visible, FE de staging responde, produccion sin cambios y checkout en `master` |
| SGL-013 | Cierre | Decidir que hacer con `TMP/` una vez copiados los assets | PENDIENTE | Decision del usuario. `TMP/` no entra en ningun commit |

## Verificacion

| ID | Que comprueba | Como | Resultado esperado |
| --- | --- | --- | --- |
| V-0 | Las referencias de los documentos son reales | Revisar las rutas y lineas del PLAN contra `f08037d` | Sin diferencias |
| V-1 | No quedan textos ni assets Ventax (CA-01) | Comandos de abajo | Ambos sin resultados |
| V-2 | Calidad del codigo (CA-08) | `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build` | Todo en verde |
| V-3 | Aspecto visual (CA-02, CA-03, CA-04) | `scripts/playwright-identidad-segel.cjs` en 390x844 y 1280x800, con capturas | Ver escenarios |
| V-4 | PWA y service worker (CA-06) | Mismo script, con CDP de Chromium: `Page.getInstallabilityErrors` y estado del service worker | Sin errores de instalacion y service worker activo |
| V-5 | Sesion conservada (CA-05) | Iniciar sesion en el stack de `master`, desplegar la rama y recargar con el mismo navegador. Minimo: diff sin cambios en la cookie y las claves | Sigue la sesion, sin pasar por login |
| V-6 | Sin regresiones (CA-08) | `scripts/playwright-mock-flow.cjs` y `scripts/playwright-backoffice-import.cjs` contra los contenedores | Ambos pasan |

**Comandos de V-1**

```bash
# Nombre o assets con mayusculas. VENTAX_NOTIFY_EMAIL es la unica excepcion.
git grep -nE 'Ventax|VENTAX' -- apps/api/src apps/web-operacion/src apps/web-operacion/public \
  apps/web-operacion/index.html apps/backoffice/src apps/backoffice/index.html | grep -v 'VENTAX_NOTIFY'

# Iconos viejos y celeste de la marca anterior
git grep -nEi 'ventax-(icon|maskable)|07a7e1|00a7c8|006b86|7 167 225|eef7fb|e8f6fd|f0f9ff|b3dff2|048fc4|8fcde2|edf8fd|f3fbff|ebf8fe|9ed9ec|b9dff0|d7edf5|0c4f68|dbeafe|1d4ed8|93c5fd|c53938|197 57 56|fcf5f5|f4f8fa|Roboto|\bInter,' -- apps/api/src apps/web-operacion/src \
  apps/web-operacion/public apps/web-operacion/index.html apps/backoffice/src | grep -v -- '--bg: #f4f8fa'
```

`--bg` del backoffice es la unica excepcion: ya no pinta el fondo, solo hovers e inputs deshabilitados.

**Escenarios de V-3**

| Pantalla | Comprobaciones |
| --- | --- |
| Login de web-operacion | Logo visible, proporcion 3.41:1 con tolerancia de 0.05 y `naturalWidth > 0` |
| Cabecera de la aplicacion | Isotipo compacto de 34 px. La accion primaria tiene fondo `rgb(221, 10, 25)` |
| Mensajes | `.inline-message` en negro. El estado de error conserva `--color-danger-bg` y se distingue de la accion primaria en la captura |
| Pagina publica React | Logo sin deformar y sin el texto "Ventax" |
| Pagina publica HTML de la API | Logo sin deformar, boton rojo y `alt="Segel"` |
| Backoffice | Titulo `Segel Backoffice`, boton primario rojo y etiqueta `Segel` |
| Pestana activa de Catalogo | Texto blanco sobre fondo rojo |
| Cabecera de Nueva factura | "Volver" en una sola linea. Hover de accion primaria en `--segel-primary-600` |
| Todas | Montserrat cargada, fondo blanco, sin desborde horizontal (excepto la barra lateral del backoffice en mobile), 0 respuestas 404 en assets y 0 pedidos a dominios externos |

## Evidencia

| Tarea | Fecha | Evidencia |
| --- | --- | --- |
| SGL-001 | 2026-11-04 | Prueba de empaquetado en una copia descartable: `vite build` de backoffice genero los 4 woff2 con rutas `/backoffice/assets/` y `--font` resuelta. Contraste con blanco: `#C53938` 5.23:1, `#010101` 20.87:1. V-0: se contrastaron las lineas del PLAN con `f08037d`; se agregaron `email.templates.ts:228` y `:309`, se agrego `--accent-subtle` y se amplio el comando de V-1. Sin Playwright, porque no hay cambios visuales todavia. |
| SGL-002 | 2026-11-04 | El usuario confirmo D-1 a D-5 y autorizo usar imagenes de la web oficial. Se encontro el vector en la cabecera de `https://segel.com.py/`, asi que D-5 no amplia el PNG. |
| SGL-003 a SGL-010 | 2026-11-04 | Cambios aplicados con reemplazos exactos. Durante la validacion se sumaron 6 `Inter` no relevados: `main.tsx:550, 558, 680, 688, 706` y `entrega.service.ts:196`. |
| V-1 | 2026-11-04 | Ambos comandos sin resultados. |
| V-2 | 2026-11-04 | `typecheck`, `lint` y `build` en verde. `test`: 445 pasan, 23 omitidos, **6 fallan**. Los mismos 6 fallan en un worktree limpio de `f08037d` (`entrega.service.test.ts` 2, `facturas.service.test.ts` 4). No los causa este cambio y no se corrigieron por estar fuera de alcance. |
| V-3 | 2026-11-04 | `scripts/playwright-identidad-segel.cjs` contra contenedores en `127.0.0.1:8096`: 14 pantallas OK (7 escenarios en 390x844 y 1280x800). Capturas revisadas a ojo en `test-results/identidad-segel/`. |
| V-4 | 2026-11-04 | CDP: `Page.getInstallabilityErrors` y `Page.getAppManifest` sin errores, service worker activo e icono 512 en cache. |
| V-5 | 2026-11-04 | **Parcial.** Comprobado por diff: ninguna linea con `ventax_refresh_token` ni con las 3 claves de `localStorage` cambia. No se ejecuto el recorrido real (login en `master`, deploy, recarga). |
| V-6 | 2026-11-04 | **Parcial.** Pasan `playwright-backoffice-import` (46), `playwright-cancelacion-rechazo` (8) y `playwright-segmentacion-f0-f1` (8). `playwright-mock-flow` falla igual en `f08037d`: `getByLabel("Contrasena")` encuentra 2 elementos desde que existe el boton de mostrar contrasena, asi que **el flujo completo de emision no quedo validado por Playwright**. `playwright-estado-canonico` y `playwright-reintento-emision` no corrieron: requieren `E2E_USER`, `E2E_PASSWORD` y `E2E_RESEED_CMD`. |
| SGL-014 a SGL-016 | 2026-11-04 | Medido en `segel.com.py` con Chromium: cuerpo en Montserrat, `--bs-primary` `#dd0a19`, fondo blanco. Kit en `packages/shared/brand/`; `cmp` confirma copias publicas identicas. Las dos apps lo consumen con `@import`; no se probo copiarlo a un repositorio externo. |
| SGL-017 V-1 y V-2 | 2026-11-04 | V-1 sin resultados. `typecheck`, `lint` y `build` en verde. `test`: 445 pasan, 23 omitidos y los mismos 6 fallos preexistentes. |
| SGL-017 V-3 y V-4 | 2026-11-04 | `playwright-identidad-segel` contra contenedores en `127.0.0.1:8096`: 17 comprobaciones OK (8 pantallas en 390x844 y 1280x800, y PWA). |
| SGL-017 regresiones visuales | 2026-11-04 | Las capturas revelaron fallos que el script no cubria. (1) Pestana activa rojo sobre rojo, **causada por `--accent` de este cambio**: una regla posterior pisaba el texto blanco. (2) Hover de `.primary-action` en celeste y 12 acentos celestes mas. (3) "Volver" partido por el ancho de Montserrat. Corregidos, y (1) y (3) quedaron en el script. Recorrido mobile de 7 pantallas del menu sin desborde. No se revisaron formularios internos ni modales a ojo. |
| SGL-017 backoffice mobile | 2026-11-04 | Desborde preexistente: 666 px en `f08037d` y 687 px en la rama, sobre 390 px. La barra lateral tiene ancho fijo. Fuera de alcance; excepcion documentada en el script. |
| SGL-017 V-5 y V-6 | 2026-11-04 | Sin cambios respecto de la evidencia anterior: V-5 parcial por diff. Pasan `backoffice-import`, `cancelacion-rechazo` y `segmentacion-f0-f1`. `mock-flow` sigue roto desde antes; `estado-canonico` y `reintento-emision` no corrieron. |
| SGL-018 | 2026-11-04 | `304d597` desplegado en staging con bundle. Contenedores `api` y `frontend` healthy, 0 errores en 10 min. FE de staging (`fe-test-api-1`, el mismo de `festag-api.ventax.app`) responde `ok` desde el contenedor. `EMAIL_FROM` y `EMAIL_FROM_NAME` siguen en Ventax. `https://staging-factura.ventax.app/app/` responde 200 con titulo `Segel Factura`. `playwright-identidad-segel` por tunel SSH: 17 OK con la API mockeada. Produccion: mismas fechas de creacion y titulo `Ventax Factura`. Checkout de la VPS de vuelta en `master` (`7fe6ae8`). No se emitio un documento real contra el FE de staging. |
| SGL-018 datos reales | 2026-11-04 | Sin nuevo deploy: `sw.js` confirma `304d597`. Playwright contra `https://staging-factura.ventax.app` y API real, 390x844 y 1280x800: login, backoffice, nota, recibo y comprobante reales, 200 y sin textos Ventax. Tokens leidos de la base de staging solo en lectura, sin imprimirlos. Observado en 390 px: un importe de nota parte "Gs." y el numero en dos lineas por el ancho de Montserrat. Sin login operativo ni emision real; PDF/KUDE no abiertos. Produccion sin cambios. |
