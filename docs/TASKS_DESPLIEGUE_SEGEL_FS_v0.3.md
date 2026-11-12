# TASKS - Despliegue en `segel-fs` v0.3

SPEC: `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.3.md` · PLAN: `docs/PLAN_DESPLIEGUE_SEGEL_FS_v0.3.md`.

Nada se ejecuta en produccion sin la orden directa del usuario en la sesion de FS (DSF-006), y cada accion posterior sobre produccion, incluso de solo lectura, se pide por separado (regla de oro de `AGENTS.md`). Las tareas DSF-001 a DSF-005 son de documentacion y pruebas en la rama.

| ID | Paso | Tarea | Hecho cuando | Quien | Estado |
|---|---|---|---|---|---|
| DSF-001 | 1 | SPEC, PLAN y TASKS v0.3; cadenas que entran apuntando aqui; `AGENTS.md` y `BACKLOG.md` al dia | Documentos commiteados; el BACKLOG lista esta cadena como CON CADENA | FS | DONE (2026-11-11) |
| DSF-002 | 1 | Confirmar el contenido: `git diff ed8b493..HEAD -- infra` vacio; herramientas de los tutoriales sin cambios en `apps/`; hotfix `de57c38` equivalente a `ed8b493` | Salidas anotadas en E-1 | FS | DONE (2026-11-11): infra sin diff; hotfix equivalente salvo una linea de imports ya ampliada por URA-009; tutoriales por confirmar en el tag |
| DSF-003 | 1 | Decisiones D-1 a D-8 del usuario | Respuestas anotadas en la SPEC | Usuario | DONE (2026-11-12): SALUMAX por SQL, 003 queda sin remision, prueba fina de descuentos antes, sin aviso a operadores, regla de oro en `AGENTS.md`, D-8 retirada |
| DSF-004 | 1 | Prueba fina de descuentos antes del despliegue (D-5): DES-013 a DES-016 desde el stack local, con aviso a FE | Evidencia en `TASKS_DESCUENTOS_FACTURA_v0.1`; las cuatro Hechas | FS | EN CURSO (2026-11-12) |
| DSF-004b | 1 | Pestaña de remision en gris "No habilitado" en lugar de "Proximamente" para facturadores sin configuracion (RN-02b de la remision, NRE-037) | Playwright `playwright-nota-remision.cjs permiso` y regresion de `ux-resto-app` | FS | EN CURSO (2026-11-12) |
| DSF-004c | 1 | Confirmar con la sesion de FE (`facturacion-electronica-7c`) que en produccion el consumidor de SALUMAX (`80018828-4`) tiene `NRE_EMIT` y numeradores tipo 7 en 001 y 002, y que 003 no los tiene ni los tendra | Respuesta de FE anotada en E-1 | FS | PENDIENTE |
| DSF-005 | 1 | Regresion final sobre el commit candidato (PLAN §1.3) y tag local `segel-fs-2026.11.12` | Todo en verde; `git tag -n1 segel-fs-2026.11.12` | FS | PENDIENTE |
| DSF-006 | 2 | **Orden directa del usuario** ("Desplega segel-fs-2026.11.12 en segel-fs") | Mensaje del usuario en la sesion | Usuario | PENDIENTE |
| DSF-007 | 2 | Aviso previo a FE (`facturacion-electronica-7c`): commit, franja, nada de FE | Mensaje enviado | FS | PENDIENTE |
| DSF-008 | 2 | Imagenes del tag con `BUILD_COMMIT_SHA` y transferencia a la VPS (PLAN §2.1) | `docker images` en la VPS con las tres nuevas; CA-01 | FS | PENDIENTE |
| DSF-009 | 2 | Respaldo y restauracion de prueba (PLAN §2.2) | Ruta, tamano, SHA256 y conteos en E-1; CA-02 | FS | PENDIENTE |
| DSF-010 | 2 | Reetiquetar `:antes-2026.11.12`, arrancar `migrate`, `api`, `frontend`, `restart frontend` (PLAN §2.3) | Hora de corte y de vuelta en E-1 | FS | PENDIENTE |
| DSF-010b | 2 | SQL de habilitacion de la remision para SALUMAX (RN-03): `update facturadores set fe_consumer_permisos = '["NRE_EMIT"]', fe_tipos_documento = '["NRE"]', updated_at = now() where emisor_id = '80018828-4' and deleted_at is null` (1 fila) | Fila afectada y `nota_remision_habilitada` por facturador en E-1 | FS | PENDIENTE |
| DSF-011 | 2 | Verificacion sin emitir (PLAN §2.4) | CA-03 a CA-07 con sus salidas en E-1 | FS | PENDIENTE |
| DSF-012 | 2 | Pantallas (CA-08): las revisa el usuario con su acceso | Confirmacion del usuario | Usuario | PENDIENTE |
| DSF-013 | 2 | Factura real de prueba en produccion | — | — | RETIRADA (D-8, 2026-11-12) |
| DSF-014 | 3 | Cierre: evidencia E-1, `BACKLOG.md` a DONE en produccion, memoria, aviso a FE | CA-09 y CA-10 | FS | PENDIENTE |
| DSF-015 | 3 | Vuelta atras ejecutada (solo si hizo falta), con causa y resultado | E-2 | FS | — |

## Evidencia

### E-1. Despliegue

Pendiente.

### E-2. Vuelta atras

No hizo falta.
