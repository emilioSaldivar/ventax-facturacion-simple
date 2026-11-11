# TASKS - Comprador sin nombre (innominado) en la factura v0.1

SPEC: `docs/SPEC_COMPRADOR_INNOMINADO_v0.1.md` · PLAN: `docs/PLAN_COMPRADOR_INNOMINADO_v0.1.md`.

| ID | Tarea | Reglas | Validacion | Estado |
|---|---|---|---|---|
| INN-001 | API: tipos, esquema y normalizacion del cliente innominado | RN-03 | vitest de `previewFactura` y creacion | Hecha |
| INN-002 | API: tope de Gs. 7.000.000 (PYG y moneda extranjera) | RN-04 | vitest justo debajo y en el tope | Hecha |
| INN-003 | API: receptor enviado a FE | RN-05 | vitest de `buildReceptor` / gateway | Hecha |
| INN-004 | API: nota de credito no elegible (candidatos, total, parcial) | RN-06 | vitest 409 `NOTA_CREDITO_INNOMINADA` sin llamar a FE | Hecha |
| INN-005 | `spec/openapi.yaml` | RN-03, RN-06 | revision del diff | Hecha |
| INN-006 | Web: opcion en el editor, campos bloqueados, sin agenda ni DNIT, motivo del tope | RN-01, RN-02, RN-04 | typecheck, build, Playwright 1280/1440/390 | Hecha |
| INN-007 | Web: ficha sin nota de credito y aviso; etiqueta "Sin nombre" | RN-06, RN-07 | Playwright | Hecha |
| INN-008 | Regresion: suites existentes de api y web | CA-04 | `npm run test`, `typecheck`, `lint`, `build` | Hecha |
| INN-009 | Despliegue solo FS en `segel-fs` con respaldo e imagenes `:antes-innominado` | PLAN | health, `X-App-Version`, 0 errores; sin emitir | Pendiente |
| INN-010 | Integrar en `feat/identidad-segel` | PLAN | typecheck/build en la rama | Pendiente |

## Evidencia

### 2026-11-11 - INN-001 a INN-008 (rama `hotfix/comprador-innominado` desde `b252627`)

- **API:** `npm run lint` y `typecheck` OK; `vitest run` 774 pasan, 48 omitidas, 0 fallas (51 archivos). Pruebas nuevas en `tests/facturas.service.test.ts` (normalizacion RN-03; tope en PYG con 6.999.999 / 7.000.000 sin encolar y en USD con 999,99 / 1000 a 7000; el tope no aplica a RUC; NC total y parcial 409 `NOTA_CREDITO_INNOMINADA` sin llamar a FE y candidato no elegible) y `tests/fiscal-gateway.test.ts` (receptor `INNOMINADO` / `0` / `Sin Nombre` sin `dv` ni `naturaleza`).
- **Web:** `typecheck`, `lint` y `build` OK.
- **Playwright** `scripts/playwright-comprador-innominado.cjs` contra un stack aislado con FE mock (`docker compose -p fs-inn`, env en `.local/innominado/env`, fuera de git; no se tocaron los stacks locales de otras sesiones): **21/21 OK**.
  - 1440 y 1280 (modo completo): "Sin nombre" deja `0` y `Sin Nombre` sin editar, sin casilla de agenda y con el texto de consumidor final (CA-01, RN-01); con Gs. 7.000.000 no deja crear y muestra el motivo de RN-04 (CA-02); volver a RUC vacia documento y nombre (RN-02); sin desplazamiento horizontal.
  - 1440: factura de Gs. 50.000 creada; el resultado dice "Sin nombre (consumidor final)"; la base guarda `INNOMINADO` / `0` / `Sin Nombre` en el cliente y en el pedido a FE; 0 clientes nuevos en la agenda; emitida por el mock; en Documentos "Crear nota de crédito" queda deshabilitado con el aviso de RN-06 (CA-03).
  - 390 (modo simple): mismo comportamiento del cliente y sin desplazamiento horizontal.
  - Capturas en `test-results/comprador-innominado/` (fuera de git).
- **Ajuste descubierto en la validacion:** la etiqueta "Sin nombre (consumidor final)" se cortaba en el selector a 1280/1440; quedo "Sin nombre" en el selector y la explicacion en la linea de estado del cliente (SPEC RN-01 y PLAN actualizados).
- **Ajuste de soporte de pruebas:** `scripts/sql/seed_e2e_carga_masiva.sql` usaba `on conflict (usuario_id)`, que dejo de existir con multiperfil (indice unico `usuario_id, actividad_punto_perfil_id`); se corrigio el `on conflict`.
- **Sin SIFEN:** no se emitio en `segel-fs` (produccion, sin emisiones de prueba). La forma del receptor es la de la coleccion de FE "Emitir FE SYNC - INNOMINADO".
- **Pendiente fuera de alcance:** facturas de carga masiva con receptor `INNOMINADO` siguen guardandose como `NO_ESPECIFICADO` en FS (`cargas.mapeo.ts`); FE igual rechaza su nota de credito con 422.
