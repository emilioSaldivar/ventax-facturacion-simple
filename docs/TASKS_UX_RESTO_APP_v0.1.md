# TASKS UX Del Resto De La App v0.1

## Alineacion

- `docs/SPEC_UX_RESTO_APP_v0.1.md`
- `docs/PLAN_UX_RESTO_APP_v0.1.md`
- Canvas de diseño: `https://claude.ai/artifact/R7AL4Ajj7oAX9PfydQDYWe`
- `docs/TASKS_MULTIPERFIL_USUARIO_v0.1.md` (la fase 3 depende de esa matriz)

## Estado

Documentada el 2026-11-10, **sin implementar**. Ninguna tarea empieza hasta que el usuario acepte el canvas (URA-000) y lo indique. Cada tarea lleva commit propio en `feat/identidad-segel` y se valida con `typecheck`, `lint` y `build`. Las facturas y notas reales en SIFEN test se emiten **despues** de cerrar las tareas de interfaz (URA-012), desde el stack local de Segel.

Requisito externo para URA-012: la clave del operador de ensayo en un archivo fuera del repositorio (`ENSAYO_PASSWORD_FILE`). No esta en el repositorio ni se escribe en ningun documento.

## Matriz

| ID | Fase | Tarea | Validacion | Estado |
|---|---|---|---|---|
| URA-000 | — | Aceptacion del canvas por el usuario, con las decisiones propuestas D-3 ("Presupuestos / Pedidos") y D-4 (boton "Nuevo"). Ajustar SPEC y canvas si cambia algo | Respuesta del usuario anotada en Evidencia | PENDIENTE |
| URA-001 | 1 | Linea de base del cuerpo de `POST /facturas/{id}/nota-credito`, total y parcial, con la API mockeada, en `test-results/ux-resto/nc-*.json`, **antes** de tocar `CreditNoteView` (PLAN 7) | JSON presentes | PENDIENTE |
| URA-002 | 1 | Base comun: pesos, bordes, radios, `.eyebrow`; componentes `EncabezadoPantalla` y `PastillaEstado` (PLAN 1; SPEC D R-1) | `typecheck`, `build` | PENDIENTE |
| URA-003 | 1 | Catalogo `TIPOS_EMISION`, menu en cuatro grupos, estados Disponible, Por planilla y Proximamente, cambios de nombre ("Notas de credito", "Presupuestos / Pedidos"), iconos nuevos, guion `playwright-carga-masiva.cjs:374` actualizado (PLAN 2; SPEC A.1, A.2, A.4, A.5, RN-01, RN-02, RN-06) | `typecheck`, `build`; `grep` sin "Devolver factura" ni "Notas / Presupuestos" en `apps/` y `scripts/` versionados | PENDIENTE |
| URA-004 | 1 | Boton y menu "Nuevo" en la barra de escritorio, con tipo inicial `NOTA_REMISION` hacia la carga masiva (PLAN 3; SPEC A.3, RN-07) | `typecheck`, `build` | PENDIENTE |
| URA-005 | 1 | Notas de credito con el patron de §B: encabezado con proximo numero, pestañas, tarjetas, panel fijo y `ResultadoEmision`, sin cambiar el cuerpo del pedido (PLAN 4; SPEC B.1, RN-03, RN-04) | `typecheck`, `build`; cuerpo identico a URA-001 | PENDIENTE |
| URA-006 | 1 | Espacio Notas de remision (vista `remision`) con "Emitidas" y "Por planilla" (PLAN 4; SPEC B.3) | `typecheck`, `build` | PENDIENTE |
| URA-007 | 1 | Documentos: pestañas, filtros en una fila, `PastillaEstado` (P-1), ficha lateral de 360 px con "Desde esta factura"; `playwright-ensayo-documentos.cjs` sin emojis (PLAN 5; SPEC C) | `typecheck`, `build` | PENDIENTE |
| URA-008 | 1 | Informacion y estado en dos columnas, checks con `Icono` y tarjeta "Documentos que podes emitir" (PLAN 5; SPEC D R-8) | `typecheck`, `build` | PENDIENTE |
| URA-009 | 2 | Agenda / Clientes y Catalogo en tabla, con el alta del catalogo en panel lateral (PLAN 6; SPEC D R-3, R-4) | `typecheck`, `build` | PENDIENTE |
| URA-010 | 2 | Presupuestos / Pedidos con `GrillaLineas` y Cobros / Recibos en tabla (PLAN 6; SPEC D R-5, R-6) | `typecheck`, `build`; prueba de convertir un presupuesto en factura | PENDIENTE |
| URA-011 | 2 | Carga masiva con tokens y pastillas; paginas publicas sin emojis (PLAN 6; SPEC D R-9, R-10) | `typecheck`, `build` | PENDIENTE |
| URA-012 | 1-2 | Despliegue local con API y frontend del mismo commit. Guion `scripts/segel-fs/playwright-ux-resto-app.cjs` en 1440, 1280 y 390 px: CA-01 a CA-09 y CA-11, con **una factura y una nota de credito parcial reales en SIFEN test** hasta "Aprobada". Regresion `playwright-ux-nueva-factura.cjs`, `playwright-documentos-escritorio.cjs`, `playwright-editor-pc.cjs` y `playwright-carga-masiva.cjs` (PLAN 7) | Resultado del guion, capturas, numeros de los documentos aprobados | PENDIENTE |
| URA-013 | 3 | Despues de `TASKS_MULTIPERFIL_USUARIO` cerrada: "Cambiar punto de expedicion" en el menu de celular; `establecimiento` y `punto_expedicion` en `GET /facturas` (perfil, o CDC en el historial); filtro `punto`; `spec/openapi.yaml`; "Se emite por" en cada espacio (PLAN 8; SPEC F, CA-10) | `npm run test -w apps/api` con pruebas de ruta y repositorio; `typecheck`, `lint`, `build`; OpenAPI valido; Playwright con dos perfiles en 1440 y 390 | PENDIENTE (bloqueada por multiperfil) |
| URA-014 | — | Repaso de SPEC, PLAN y TASKS con lo descubierto; `docs/BACKLOG.md` (FS-52, FS-53, FS-55 a FS-57); canvas actualizado si el diseño final difiere | Lectura cruzada | PENDIENTE |

## Fuera de esta matriz

Cada uno de estos tiene su propia cadena SPEC, PLAN y TASKS cuando el usuario lo indique:

- **FS-55, nota de debito.** Sobre la guia §59 de FE, `POST /v1/nota-debito`.
- **FS-56, nota de remision manual.** Sobre la guia §53, `POST /v1/nota-remision`.
- **FS-57, autofactura.** Cuando FE la publique para consumidores.

Las tres usan el patron de SPEC §B y el catalogo `TIPOS_EMISION`: habilitar un tipo es cambiar su `estado` y agregar su vista.

## Evidencia

Se completa al cerrar cada tarea con el commit, los comandos ejecutados y su resultado. Para URA-012 y URA-013 se anotan los viewports, los escenarios, el resultado de Playwright y los numeros fiscales de los documentos aprobados en SIFEN test.

- 2026-11-10: canvas publicado con nueve pantallas y cadena SPEC, PLAN y TASKS documentada. Sin codigo.
