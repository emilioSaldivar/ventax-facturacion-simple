# TASKS Un Usuario Con Varios Perfiles De Emision v0.2 — Correcciones Tras La Revision

## Alineacion

- `docs/SPEC_MULTIPERFIL_USUARIO_v0.2.md`
- `docs/PLAN_MULTIPERFIL_USUARIO_v0.2.md`
- `docs/REVISION_MULTIPERFIL_USUARIO_v0.1.md` (origen de cada tarea)

## Estado

Documentada el 2026-11-10. **No se implementa hasta que el usuario lo indique.** Se implementa en `feat/identidad-segel`, por fases con commit propio; cada commit con `npm run typecheck`, `npm run lint`, `npm run test` (API, con `DATABASE_URL_TEST`) y `npm run build` (web y backoffice) en verde. La validacion visual es con Playwright contra los contenedores del stack local de Segel (API y frontend del mismo commit), nunca contra `segel-fs` ni produccion.

Requisitos externos: `ENSAYO_PASSWORD_FILE` (operador de ensayo); `BACKOFFICE_PASSWORD_FILE` solo si el usuario lo autoriza (MPU2-012); FE del stack local sin cambios. Ninguna clave en archivos del repo, documentos ni capturas.

## Matriz

| ID | Fase | Tarea | Referencia | Validacion | Estado |
|---|---|---|---|---|---|
| MPU2-000 | Prep. | Verificar el stack local (`segel-fs-api-1`, `segel-fs-frontend-1` en `2162094`; `fe-segel-api-1` sano), `DATABASE_URL_TEST` operativa, `operador-ensayo` con 001-001 y 001-002, y la version de Playwright del repo (para CA-16) | PLAN encabezado y 5.1 | Salidas registradas en Evidencia | PENDING |
| MPU2-001 | A | `facturador_id` en `PerfilDisponible` (shared, repositorio, contrato) y en la auditoria del refresh | PLAN 1.1 · SPEC A.1, A.3, CA-20 | `auth.perfil.test.ts` con `facturadorId` en el caso "uno restante"; `multiperfil.integration.test.ts` con `facturador_id` en la lista; `openapi.yaml` parsea | PENDING |
| MPU2-002 | B | Evento tipado `EventoPerfil` (ELEGIR / RECARGAR) en lugar de `pending_actions` sintetico | PLAN 2.1 · SPEC B.4, CA-22 | `grep` de `RECARGAR_CONTEXTO` vacio; `typecheck`, `build` | PENDING |
| MPU2-003 | B | `refreshSession` de un solo vuelo y aviso deduplicado por token | PLAN 2.2 · SPEC B.1, RN-14, CA-14, CA-15 | `typecheck`, `build`; Playwright en MPU2-010 | PENDING |
| MPU2-004 | B | Aviso bloqueante "Entendido" cuando el punto cambia desde el backoffice y hay borrador; `recargarConPunto` extraido | PLAN 2.3 · SPEC B.3, RN-16, D-14, CA-17 | `typecheck`, `build`; Playwright en MPU2-010 | PENDING |
| MPU2-005 | B | Pantalla de eleccion: limite visible de 10 minutos, 401 → login con mensaje, `PERFIL_NO_DISPONIBLE` → refrescar lista (D-16) | PLAN 2.4 · SPEC B.2, RN-15, CA-16 | `typecheck`, `build`; Playwright en MPU2-010 | PENDING |
| MPU2-006 | B | `/me/perfiles` con reintento, `perfilesError` en "Informacion y estado", `perfilActivo` de respaldo por claim `uoc` | PLAN 2.5 · SPEC B.5 | `typecheck`, `build`; verificacion manual con `page.route` que haga fallar `/me/perfiles` dos veces (incluir en MPU2-010) | PENDING |
| MPU2-007 | B | `requestRaw` en el cliente HTTP y `descargar` de carga masiva por el cliente comun | PLAN 2.6 · SPEC B.7, RN-17, CA-22 | `grep "fetch("` en `carga-masiva.tsx` vacio; `playwright-planillas-ejemplo.cjs` en verde | PENDING |
| MPU2-008 | C | Mostrar contraseña en `CambioPerfilDialog` | PLAN 3.1 · SPEC B.6 | `typecheck`, `build`; captura en MPU2-010 | PENDING |
| MPU2-009 | C | Quitar "Ultimo numero" de las tarjetas de eleccion y del dialogo | PLAN 3.2 · SPEC B.8, D-13, CA-23 | `typecheck`, `build`; captura en MPU2-010 | PENDING |
| MPU2-010 | E | `playwright-multiperfil.cjs` ampliado: CA-14, CA-15, CA-16, CA-17, CA-18, CA-19, CA-23 y la regresion de las 51 verificaciones de la v0.1 (menos "Ultimo numero") en 1440; eleccion y cambio en 1280 y 390 | PLAN 5.1 · SPEC D.2 | Resultado del guion, `resumen.json`, capturas por caso y viewport; contador de `/auth/refresh` por caso | PENDING |
| MPU2-011 | D | Texto del `confirm` al quitar un punto | PLAN 4.1 · SPEC C.1, RN-18, CA-21 | `grep "sesiones abiertas"` en `apps/backoffice/src` vacio; `typecheck`, `build` | PENDING |
| MPU2-012 | D | `scripts/playwright-backoffice-multiperfil.cjs` en 1440 px | PLAN 4.2 · SPEC C.2, CA-21 | Resultado y capturas; **BLOQUEADA** si no se autoriza `BACKOFFICE_PASSWORD_FILE` (documentar, no simular) | PENDING |
| MPU2-013 | E | Despliegue local desde el commit (API y frontend juntos, etiquetas `antes-v02`, respaldo de la base) y regresion con el usuario de un solo punto (`playwright-ux-nueva-factura.cjs`, `playwright-documentos-escritorio.cjs`) | PLAN encabezado y 5.2 · SPEC D.3 | 41/41 y 31/31; numeros fiscales de las facturas emitidas | PENDING |
| MPU2-014 | E | Documentacion de cierre: SPEC v0.1 §B.1 y tabla de casos limite, TASKS v0.1 MPU-013, REVISION con commit por hallazgo, BACKLOG FS-54, `AGENTS.md` | PLAN 5.3 | Lectura cruzada | PENDING |

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
