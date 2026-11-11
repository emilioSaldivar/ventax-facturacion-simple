# TASKS UX Del Resto De La App v0.1

## Alineacion

- `docs/SPEC_UX_RESTO_APP_v0.1.md`
- `docs/PLAN_UX_RESTO_APP_v0.1.md`
- Canvas de diseño: `https://claude.ai/artifact/R7AL4Ajj7oAX9PfydQDYWe`
- `docs/TASKS_MULTIPERFIL_USUARIO_v0.1.md` y `v0.2` (la fase 3 depende de esa matriz; URA-021 toca sus pantallas)
- `docs/PAUTAS_FRONTEND_v0.1.md` (la fase 0 las adopta; todas las tareas de frontend cierran con su lista §12)

## Estado

Documentada el 2026-11-10, **sin implementar**. Ninguna tarea empieza hasta que el usuario acepte el canvas (URA-000) y las pautas (URA-015) y lo indique. Orden: fase 0 (URA-024 primero, despues URA-016 a URA-023), fase 1, fase 2 y fase 3. Cada tarea lleva commit propio en `feat/identidad-segel` y se valida con `typecheck`, `lint` y `build`. Las facturas y notas reales en SIFEN test se emiten **despues** de cerrar las tareas de interfaz (URA-012), desde el stack local de Segel.

Requisito externo para URA-012: la clave del operador de ensayo en un archivo fuera del repositorio (`ENSAYO_PASSWORD_FILE`). No esta en el repositorio ni se escribe en ningun documento.

## Matriz

| ID | Fase | Tarea | Validacion | Estado |
|---|---|---|---|---|
| URA-000 | — | Aceptacion del canvas por el usuario, con las decisiones propuestas D-3 ("Presupuestos / Pedidos") y D-4 (boton "Nuevo"). Ajustar SPEC y canvas si cambia algo | Respuesta del usuario anotada en Evidencia | PENDIENTE |
| URA-015 | 0 | Aceptacion de las pautas (`PAUTAS_FRONTEND_v0.1`) y del reconocimiento (SPEC §G) por el usuario, con las decisiones D-10, D-13 (voseo) y D-14 (zoom). Si se aceptan, `AGENTS.md` pasa la regla de pautas de "propuesta" a vigente | Respuesta del usuario anotada en Evidencia | PENDIENTE |
| URA-024 | 0 | Guion de reconocimiento `scripts/segel-fs/playwright-reconocimiento-ux.cjs` (solo lectura) y su linea base versionada; corre primero y despues de cada tarea de frontend (PLAN 10.1; SPEC RN-11, H-23) | El guion reproduce las cuentas del anexo de las pautas en 1440, 1280 y 390 px | PENDIENTE |
| URA-016 | 0 | Tokens de espaciado, tipografia y capas; 221 hex a tokens; cortes en 720 y 1024 px (PLAN 10.2; pautas P-T; SPEC H-19) | `typecheck`, `build`; `grep` sin hex fuera de `:root` ni `z-index` numericos; capturas sin cambio a simple vista (CA-12) | PENDIENTE |
| URA-017 | 0 | Componentes base en `src/components/` y mapa `src/lib/estados.ts`, cada uno con su primer uso; `window.confirm` a `Dialogo` (PLAN 10.3; pautas P-C, P-L6; SPEC H-05, H-09, H-10, H-17) | `typecheck`, `lint`, `build`; `grep` sin `window.confirm` ni `confirm(`; Playwright de Escape y foco en un dialogo (CA-13) | PENDIENTE |
| URA-018 | 0 | `useApi`, descargas y paginas publicas por el cliente, onboarding con renovacion real (PLAN 10.4; pautas P-D; SPEC H-20) | `typecheck`, `build`; `grep` sin `fetch("/api/v1`; descarga de PDF de recibo con el token vencido renueva y descarga | PENDIENTE |
| URA-019 | 0 | Accesibilidad: foco visible, 44 px, menus ⋮, fila con teclado, Escape, zoom si se acepta D-14, HTML valido (PLAN 10.5; pautas P-A; SPEC H-13, H-21) | Guion de reconocimiento con 0 controles chicos y 0 sin nombre en 390 px; recorrido de teclado en Documentos | PENDIENTE |
| URA-020 | 0 | Textos con tildes, una voz, glosario y etiquetas de enums; guiones actualizados (PLAN 10.6; pautas P-X; SPEC H-12) | `typecheck`, `build`; regresiones de PLAN 7 con los textos nuevos | PENDIENTE |
| URA-021 | 0 | Varios puntos: `nombrePunto`, sin codigo de perfil ni "ultimo numero", numero completo en celular y ficha, aviso de punto distinto en el modal de Documentos, motivo y archivo de carga como borradores. Aviso previo a la cadena de multiperfil (PLAN 10.7; pautas P-P; SPEC H-01 a H-08) | `playwright-multiperfil.cjs` y `-v02.cjs` pasan; Playwright con dos puntos en 1440 y 390 (CA-14) | PENDIENTE |
| URA-022 | 0 | Limpieza: clases sin uso, selectores duplicados, `formatOperationViewTitle` (PLAN 10.8; pautas P-C6; SPEC H-19) | `typecheck`, `build`; capturas sin cambio | PENDIENTE |
| URA-023 | 0 | Particion de `main.tsx` en `api/`, `lib/`, `components/` y las vistas de la fase 1, solo movimientos, anunciados a la otra sesion (PLAN 10.9; pautas P-C2; SPEC D-12, H-18) | `typecheck`, `lint`, `build` y regresiones de PLAN 7 en cada movimiento | PENDIENTE |
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
| URA-014 | — | Repaso de SPEC, PLAN, TASKS y pautas con lo descubierto; `docs/BACKLOG.md` (FS-52, FS-53, FS-55 a FS-58); canvas actualizado si el diseño final difiere; linea base del guion de reconocimiento actualizada al cierre | Lectura cruzada | PENDIENTE |

## Fuera de esta matriz

Cada uno de estos tiene su propia cadena SPEC, PLAN y TASKS cuando el usuario lo indique:

- **FS-55, nota de debito.** Sobre la guia §59 de FE, `POST /v1/nota-debito`.
- **FS-56, nota de remision manual.** Sobre la guia §53, `POST /v1/nota-remision`.
- **FS-57, autofactura.** Cuando FE la publique para consumidores.
- **FS-58, rutas por URL (propuesto).** Atras del navegador y enlaces directos a cada pantalla (SPEC H-22).
- **Backoffice.** 75 campos con la etiqueta como hermana del control, sin `htmlFor` (`apps/backoffice/src/components/FormField.tsx`). Se corrige cuando se toque el backoffice, con las pautas.

Las tres usan el patron de SPEC §B y el catalogo `TIPOS_EMISION`: habilitar un tipo es cambiar su `estado` y agregar su vista.

## Evidencia

Se completa al cerrar cada tarea con el commit, los comandos ejecutados y su resultado. Para URA-012 y URA-013 se anotan los viewports, los escenarios, el resultado de Playwright y los numeros fiscales de los documentos aprobados en SIFEN test.

- 2026-11-10: canvas publicado con nueve pantallas y cadena SPEC, PLAN y TASKS documentada. Sin codigo.
- 2026-11-10 (noche): reconocimiento con Playwright sobre el stack local de Segel (frontend `3d6c6e3`, usuario de ensayo con 001-001 y 001-002), solo lectura, en 1440, 1280 y 390 px: 36 capturas de login, eleccion de punto, las ocho pantallas del menu, la ficha y el cambio de punto, mas una revision del codigo. Hallazgos H-01 a H-23 en SPEC §G; pautas en `docs/PAUTAS_FRONTEND_v0.1.md`; tareas URA-015 a URA-024. El canvas suma cinco tableros (cuatro de reconocimiento y uno de pautas) y corrige Elegir punto y Cambiar punto (sin "Ultimo numero", punto como titulo). Sin codigo.
