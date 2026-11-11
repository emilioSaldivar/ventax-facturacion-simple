# TASKS Un Usuario Con Varios Perfiles De Emision v0.2 — Correcciones Tras La Revision

## Alineacion

- `docs/SPEC_MULTIPERFIL_USUARIO_v0.2.md`
- `docs/PLAN_MULTIPERFIL_USUARIO_v0.2.md`
- `docs/REVISION_MULTIPERFIL_USUARIO_v0.1.md` (origen de cada tarea)

## Estado

Documentada el 2026-11-10. **Implementada el 2026-11-10 por indicacion del usuario** (`8193fd1`, `3d6c6e3`, `43255a8`) y validada en el stack local de Segel (`3d6c6e3`). El usuario autorizo usar en local la clave de `admin-backoffice` del paquete de ensayo. Se implementa en `feat/identidad-segel`, por fases con commit propio; cada commit con `npm run typecheck`, `npm run lint`, `npm run test` (API, con `DATABASE_URL_TEST`) y `npm run build` (web y backoffice) en verde. La validacion visual es con Playwright contra los contenedores del stack local de Segel (API y frontend del mismo commit), nunca contra `segel-fs` ni produccion.

Requisitos externos: `ENSAYO_PASSWORD_FILE` (operador de ensayo); `BACKOFFICE_PASSWORD_FILE` solo si el usuario lo autoriza (MPU2-012); FE del stack local sin cambios. Ninguna clave en archivos del repo, documentos ni capturas.

## Matriz

| ID | Fase | Tarea | Referencia | Validacion | Estado |
|---|---|---|---|---|---|
| MPU2-000 | Prep. | Verificar el stack local (`segel-fs-api-1`, `segel-fs-frontend-1` en `2162094`; `fe-segel-api-1` sano), `DATABASE_URL_TEST` operativa, `operador-ensayo` con 001-001 y 001-002, y la version de Playwright del repo (para CA-16) | PLAN encabezado y 5.1 | Salidas registradas en Evidencia | DONE (2026-11-10) |
| MPU2-001 | A | `facturador_id` en `PerfilDisponible` (shared, repositorio, contrato) y en la auditoria del refresh | PLAN 1.1 · SPEC A.1, A.3, CA-20 | `auth.perfil.test.ts` con `facturadorId` en el caso "uno restante"; `multiperfil.integration.test.ts` con `facturador_id` en la lista; `openapi.yaml` parsea | DONE (8193fd1) |
| MPU2-002 | B | Evento tipado `EventoPerfil` (ELEGIR / RECARGAR) en lugar de `pending_actions` sintetico | PLAN 2.1 · SPEC B.4, CA-22 | `grep` de `RECARGAR_CONTEXTO` vacio; `typecheck`, `build` | DONE (3d6c6e3) |
| MPU2-003 | B | `refreshSession` de un solo vuelo y aviso deduplicado por token | PLAN 2.2 · SPEC B.1, RN-14, CA-14, CA-15 | `typecheck`, `build`; Playwright en MPU2-010 | DONE (3d6c6e3) |
| MPU2-004 | B | Aviso bloqueante "Entendido" cuando el punto cambia desde el backoffice y hay borrador; `recargarConPunto` extraido | PLAN 2.3 · SPEC B.3, RN-16, D-14, CA-17 | `typecheck`, `build`; Playwright en MPU2-010 | DONE (3d6c6e3) |
| MPU2-005 | B | Pantalla de eleccion: limite visible de 10 minutos, 401 → login con mensaje, `PERFIL_NO_DISPONIBLE` → refrescar lista (D-16) | PLAN 2.4 · SPEC B.2, RN-15, CA-16 | `typecheck`, `build`; Playwright en MPU2-010 | DONE (3d6c6e3) |
| MPU2-006 | B | `/me/perfiles` con reintento, `perfilesError` en "Informacion y estado", `perfilActivo` de respaldo por claim `uoc` | PLAN 2.5 · SPEC B.5 | `typecheck`, `build`; verificacion manual con `page.route` que haga fallar `/me/perfiles` dos veces (incluir en MPU2-010) | DONE (3d6c6e3; sin prueba de falla doble de /me/perfiles, ver Evidencia) |
| MPU2-007 | B | `requestRaw` en el cliente HTTP y `descargar` de carga masiva por el cliente comun | PLAN 2.6 · SPEC B.7, RN-17, CA-22 | `grep "fetch("` en `carga-masiva.tsx` vacio; `playwright-planillas-ejemplo.cjs` en verde | DONE (3d6c6e3) |
| MPU2-008 | C | Mostrar contraseña en `CambioPerfilDialog` | PLAN 3.1 · SPEC B.6 | `typecheck`, `build`; captura en MPU2-010 | DONE (3d6c6e3) |
| MPU2-009 | C | Quitar "Ultimo numero" de las tarjetas de eleccion y del dialogo | PLAN 3.2 · SPEC B.8, D-13, CA-23 | `typecheck`, `build`; captura en MPU2-010 | DONE (3d6c6e3) |
| MPU2-010 | E | `playwright-multiperfil.cjs` ampliado: CA-14, CA-15, CA-16, CA-17, CA-18, CA-19, CA-23 y la regresion de las 51 verificaciones de la v0.1 (menos "Ultimo numero") en 1440; eleccion y cambio en 1280 y 390 | PLAN 5.1 · SPEC D.2 | Resultado del guion, `resumen.json`, capturas por caso y viewport; contador de `/auth/refresh` por caso | DONE (43255a8, 27/27) |
| MPU2-011 | D | Texto del `confirm` al quitar un punto | PLAN 4.1 · SPEC C.1, RN-18, CA-21 | `grep "sesiones abiertas"` en `apps/backoffice/src` vacio; `typecheck`, `build` | DONE (3d6c6e3) |
| MPU2-012 | D | `scripts/playwright-backoffice-multiperfil.cjs` en 1440 px | PLAN 4.2 · SPEC C.2, CA-21 | Resultado y capturas; **BLOQUEADA** si no se autoriza `BACKOFFICE_PASSWORD_FILE` (documentar, no simular) | DONE (43255a8, 9/9) |
| MPU2-013 | E | Despliegue local desde el commit (API y frontend juntos, etiquetas `antes-v02`, respaldo de la base) y regresion con el usuario de un solo punto (`playwright-ux-nueva-factura.cjs`, `playwright-documentos-escritorio.cjs`) | PLAN encabezado y 5.2 · SPEC D.3 | 41/41 y 31/31; numeros fiscales de las facturas emitidas | DONE (2026-11-10) |
| MPU2-014 | E | Documentacion de cierre: SPEC v0.1 §B.1 y tabla de casos limite, TASKS v0.1 MPU-013, REVISION con commit por hallazgo, BACKLOG FS-54, `AGENTS.md` | PLAN 5.3 | Lectura cruzada | DONE (2026-11-10) |

## Dependencias

```
MPU2-000 ──▶ MPU2-001
MPU2-002 ──▶ MPU2-003 ──▶ MPU2-004
MPU2-002 ──▶ MPU2-005, MPU2-006, MPU2-007
MPU2-008, MPU2-009 (independientes)
MPU2-011 ──▶ MPU2-012
MPU2-001..009, MPU2-011 ──▶ MPU2-013 ──▶ MPU2-010 ──▶ MPU2-014
```

Orden recomendado de commits: (1) MPU2-001; (2) MPU2-002 + MPU2-003; (3) MPU2-004 + MPU2-005; (4) MPU2-006 + MPU2-007 + MPU2-008 + MPU2-009; (5) MPU2-011; (6) MPU2-013 y MPU2-010; (7) MPU2-012 si hay clave; (8) MPU2-014.

## Puntos criticos a vigilar

| Punto | Donde | Si falla |
|---|---|---|
| Una sola llamada a `/auth/refresh` con pedidos concurrentes | MPU2-010 CA-14 y CA-15 (contador de red) | F-1 sigue abierto: no desplegar |
| El operador nunca queda atrapado en la eleccion | MPU2-010 CA-16 | F-2 sigue abierto: no desplegar |
| Un borrador no se descarta en silencio por cambio externo | MPU2-010 CA-17 | Revisar `hayBorradorSinEmitir` y el orden del listener |
| Usuarios de un solo punto sin cambios | MPU2-013 | Se detiene: el caso base se rompio |
| API y frontend del mismo commit en el stack local | MPU2-013 | Banner "Nueva version disponible" y recargas en cada navegacion; reconstruir |
| Ninguna clave en archivos ni capturas | Todas | Rotar la clave y corregir |

## Evidencia

Se completa al cerrar cada tarea: commit, comandos y resultado (conteo de pruebas ejecutadas y saltadas); para MPU2-010 y MPU2-012, viewports, escenarios, resultado de Playwright y contador de `/auth/refresh`; para MPU2-013, numeros fiscales de las facturas de regresion.

- 2026-11-10, MPU2-000: stack local sano (`segel-fs-api-1`, `segel-fs-frontend-1`, `fe-segel-api-1`); `operador-ensayo` con 001-001 y 001-002; Playwright del repo 1.61.1 (`page.clock` disponible). La clave de `admin-backoffice` del stack local esta en el paquete de ensayo (`BACKOFFICE_PASSWORD_FILE`, fuera del repo); login 200 sin tocar la base.
- 2026-11-10, MPU2-001: `auth.perfil.test.ts`, `multiperfil.integration.test.ts` (con `DATABASE_URL_TEST`) y `context.service.test.ts`: 40/40. Suite de la API: 764 OK, 48 omitidos, 0 fallos. `openapi.yaml` parsea.
- 2026-11-10, MPU2-002 a MPU2-009 y MPU2-011: `typecheck` sin errores; `build` de web y backoffice OK; `grep RECARGAR_CONTEXTO` en la web y `grep "fetch("` en `carga-masiva.tsx` vacios (CA-22); `grep "sesiones abiertas"` en el backoffice vacio.
- 2026-11-10, MPU2-013 despliegue local: imagenes anteriores etiquetadas `antes-v02`, respaldo `.local/segel-ensayo/backups/fs/antes-v02-20261110-2235.sql.gz`. El primer build de la API fallo por red (`apk add`, error transitorio) mientras el frontend si se construyo: se reintento hasta que los dos quedaron en `3d6c6e3` (`X-App-Version: 3d6c6e3`). Regresion con `operador-ensayo` reducido temporalmente a 001-001 por SQL: Documentos 31/31, planillas 11/11 (descarga por `requestRaw`, M-7), Nueva factura 41/41 con tres facturas aprobadas en SIFEN test (1010617, 1010618, 1010619). Repuesto 001-002; `playwright-multiperfil.cjs` de la v0.1 con `MPU_FACTURA_ID` y `MPU_SIN_NC=1` (sin emitir): 47/47.
- 2026-11-10, MPU2-010 (`scripts/segel-fs/playwright-multiperfil-v02.cjs`): **27/27** en 1440, 1280 y 390. CA-14: con el token de acceso invalidado y tres pedidos paralelos al recargar, **una** llamada a `/auth/refresh` y sin login; **con el frontend anterior (`antes-v02`) la misma prueba hace 3 llamadas**: la prueba detecta el defecto y la v0.2 lo corrige. CA-15: punto activo quitado, una renovacion, sigue en 001 con el aviso. CA-16: `page.clock` a 10 minutos deshabilita la lista y "Volver a entrar" lleva al login con el motivo; un 401 simulado al elegir hace lo mismo. CA-17: aviso bloqueante con tres lineas cargadas, un solo boton, editor vacio despues. CA-18 (adaptado, ver abajo). CA-19: usuario nuevo creado por la API del backoffice con 001-001, segundo punto por `POST operation-config` (201, dos items), onboarding completo (clave, TyC, OTP resuelto por base) → eleccion → entra por 001-002 en 390 sin desborde; usuario dado de baja al final (`mpu-onb-1794361466188`, soft delete). CA-23 y B.6 verificados. Capturas en `test-results/multiperfil-v02/`.
  - CA-18 adaptado: dos pestañas del **mismo** contexto de navegador (cookies y `localStorage` compartidos, como un navegador real). Tras cambiar a 001 en A, B sigue en 002 mientras su token en memoria vale (C-3) y al recargar toma 001 sin login. No se pudo forzar el vencimiento del token de B en memoria sin esperar 15 minutos; el camino "refresh devuelve otro `uoc` → recarga con aviso" esta cubierto por CA-15.
- 2026-11-10, MPU2-012 (`scripts/playwright-backoffice-multiperfil.cjs`): **9/9** en 1440. Listado con una fila por usuario, tabla de dos puntos, texto RN-01, `confirm` sin "sesiones abiertas", quitar → una fila, agregar con tenant y facturador fijos y sin el punto ya asignado → dos filas. Cierra tambien la validacion visual pendiente de MPU-014 de la v0.1. El caso 422 `FACTURADOR_DISTINTO` no es alcanzable desde la pantalla (facturador fijo); queda cubierto por `multiperfil.integration.test.ts`.
- 2026-11-10, CA-13 en la v0.2: la clave del operador y la de `admin-backoffice` aparecen 0 veces en `docker logs segel-fs-api-1`.
- Pendiente menor: MPU2-006 (falla doble de `/me/perfiles`) no tiene caso de Playwright; se verifico por lectura y `typecheck`. Observado en las capturas: el pie del menu lateral sigue mostrando "ultimo numero 0000001" (comportamiento previo, fuera de D-13, que solo cubre la eleccion); va a FS-52.
