# TASKS Correcciones Tras El Ensayo De Volumen v0.1

## Alineacion

- `docs/SPEC_CORRECCIONES_ENSAYO_VOLUMEN_v0.1.md`
- `docs/PLAN_CORRECCIONES_ENSAYO_VOLUMEN_v0.1.md`

## Estado

Documentado el 2026-11-08; implementacion en curso en la misma fecha, sin despliegue (D-14 de despliegue v0.2).

## Matriz

| ID | Tema | Tarea | Validacion | Estado |
|---|---|---|---|---|
| CEV-001 | — | SPEC, PLAN y TASKS; `AGENTS.md`; `BACKLOG.md` | Documentos consistentes | DONE (2026-11-08) |
| CEV-101 | CEV-1 | `agendaPorCorreo`, `contarCorreosPendientes` y su uso en el worker | Pruebas de PLAN, seccion 1 | TODO |
| CEV-102 | CEV-1 | Ensayo: carga de 20 con correo, sin intervencion manual | CA-02 | TODO |
| CEV-201 | CEV-2 | Topes por variable en el compose de FS; valores en `fs.env.example` | `docker compose config` con y sin variables (CA-03) | TODO |
| CEV-202 | CEV-2 | Topes de FE en `fe.env.example` con lo que confirme FE; pedido de rotacion de logs y tope de su Postgres | Respuesta de FE registrada | TODO |
| CEV-203 | CEV-2 | Topes aplicados en el ensayo e importacion DNIT completa | `docker inspect`; pico del cargador; sin `OOMKilled` (CA-03, CA-04) | TODO |
| CEV-301 | CEV-3 | Estado del correo de la nota de credito | Prueba unitaria; nota real en el ensayo (CA-05) | BLOCKED: respuesta de FE sobre `email_status` |
| CEV-401 | CEV-4 | `FE_REF=segel-rc4.1` y tres variables | `bash -n`; `init-env.sh test` en un directorio temporal | TODO |
| CEV-501 | CEV-2, CEV-4, CEV-5 | Runbook | Lectura cruzada (CA-07) | TODO |
| CEV-601 | Todos | Suites, `deploy.sh` (fs-cm), Playwright de regresion | CA-06 | TODO |
| CEV-602 | Todos | Cierre: SPEC, PLAN y TASKS repasados; `BACKLOG` y cadena de despliegue v0.2 | Documentos alineados | TODO |

## Evidencia

Pendiente.
