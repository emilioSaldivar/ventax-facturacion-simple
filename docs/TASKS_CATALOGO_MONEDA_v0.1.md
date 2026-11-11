# TASKS - Catalogo de productos y servicios con moneda v0.1

SPEC: `docs/SPEC_CATALOGO_MONEDA_v0.1.md` · PLAN: `docs/PLAN_CATALOGO_MONEDA_v0.1.md`.

Estimacion total: 7 a 9 horas de implementacion y prueba, sin contar el despliegue.

| ID | Tarea | Reglas | Validacion | Estado |
|---|---|---|---|---|
| CAM-001 | Base: migracion `0046_catalogo_moneda.sql` (columna `moneda`, `numeric(18, 2)`, checks, indice); aplicada en el stack local | RN-01, RN-02 | `migrate` del stack local sin error; `\d catalogo_items` muestra la columna y los checks; los articulos existentes quedan en `PYG` con el mismo precio | Pendiente |
| CAM-002 | API: tipos (`monedasCatalogo`), esquemas Zod, `normalizeCatalogoInput` con validacion por moneda, repositorio con `moneda` en select/insert/update, filtro en `list` y orden en `search` | RN-03 a RN-08 | vitest `catalogo.service.test.ts` ampliado (CA-01 a CA-03, repositorio en memoria); `npm run test`, `typecheck`, `lint` | Pendiente |
| CAM-003 | `spec/openapi.yaml`: `moneda` en `CatalogoItem` y `CatalogoItemUpsertRequest`, `precio_unitario` numerico, parametro `moneda` en listado y busqueda | RN-03, RN-04, RN-06, RN-07 | revision del diff; el frontend consume solo lo documentado | Pendiente |
| CAM-004 | Web, catalogo: `tipos.ts`, `nombreMoneda`, formulario con "Moneda" y precio por moneda, validacion local, envio con `moneda` | RN-09, RN-12 | `typecheck`, `build`; Playwright `catalogo-moneda.cjs` caso `catalogo` en 1440/1280/390 (CA-04, CA-05) | Pendiente |
| CAM-005 | Web, catalogo: precio con moneda en tabla y tarjetas; filtro "Moneda"; `styles.css` de `.catalogo-filtros` a tres columnas | RN-10, RN-11 | mismo caso `catalogo`; capturas de los tres anchos sin desborde | Pendiente |
| CAM-006 | Web, editor: `applyCatalogItem` por moneda, mensajes de RN-13/RN-14, sugerencias con precio y moneda, busqueda con `moneda` | RN-13, RN-14, RN-15, RN-07 | Playwright caso `editor` CA-06 y CA-07 en 1440 y 390 | Pendiente |
| CAM-007 | Web, editor: "Guardar en el catálogo" en cualquier moneda (`puedeGuardar`, `saveQuickCatalogItem`, hoja de linea en celular), sin el aviso del pie de la grilla | RN-16 | Playwright CA-08 en 1440 y 390, interceptando `POST /catalogo/items` y comprobando `moneda` y `precio_unitario` | Pendiente |
| CAM-008 | Web, presupuestos (`NotasView`): articulo en USD sin precio y con mensaje; guardado sigue en PYG | RN-17 | Playwright: desde Presupuestos, elegir el articulo USD deja el precio vacio con el mensaje | Pendiente |
| CAM-009 | Guion `scripts/segel-fs/playwright-catalogo-moneda.cjs` (casos `api`, `catalogo`, `editor`) con limpieza de los articulos de prueba | CA-01 a CA-08 | corrida completa en verde contra el stack local, resultado y capturas registrados aqui | Pendiente |
| CAM-010 | Guiones y documentos previos: `playwright-ux-nueva-factura.cjs` CA-05 reescrito; nota de reemplazo en `SPEC_UX_NUEVA_FACTURA_v0.1` CA-05, `SPEC_EDITOR_FACTURA_PC_v0.1` D-4/CA-06 y `SPEC_MONEDA_EXTRANJERA_v0.1` "Fuera de alcance"; `BACKLOG.md` FS-59 apunta a esta cadena | — | diff revisado; `ux-nueva-factura` en verde en lo que no emite | Pendiente |
| CAM-011 | Regresion: `ux-resto-app` (caso `agenda`), `editor-pc`, `documentos-escritorio`, reconocimiento sin subir la linea base; `npm run test`, `typecheck`, `lint` (api); `typecheck`, `build` (web); lista §12 de PAUTAS | CA-09 | resultados por guion anotados aqui | Pendiente |
| CAM-012 | Emision real en SIFEN test desde el stack local: factura en USD con articulo del catalogo en USD y una linea guardada desde el editor; aviso previo a FE (`facturacion-electronica-7c`) | CA-10 | documento aprobado, KUDE con precios en USD; `document_uuid` y numero anotados aqui | Pendiente |
| CAM-013 | Cierre de la cadena: SPEC, PLAN y TASKS releidos y ajustados con lo descubierto; decisiones DP-1 y DP-2 resueltas o confirmadas | — | repaso con el usuario | Pendiente |
| CAM-014 | Despliegue en `segel-fs` (produccion): respaldo previo, migracion `0046`, API y frontend; verificacion sin emitir | — | **solo con orden directa del usuario**; procedimiento de `TASKS_DESPLIEGUE_SEGEL_FS_v0.2.md` E-6 | Pendiente |

## Decisiones pendientes

- DP-1 (orden o agrupacion de los articulos de otra moneda en la busqueda del editor) y DP-2 (recordar el filtro de moneda): propuestas en la SPEC; se implementa la propuesta salvo que el usuario diga otra cosa antes de CAM-006.

## Evidencia

(Se completa al cerrar cada tarea: commit, comando, resultado, viewports y capturas.)
