# TASKS - Despliegue en `segel-fs` v0.3

SPEC: `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.3.md` · PLAN: `docs/PLAN_DESPLIEGUE_SEGEL_FS_v0.3.md`.

Nada se ejecuta en produccion sin la orden directa del usuario en la sesion de FS (DSF-006). Las tareas DSF-001 a DSF-005 son de documentacion y pruebas en la rama.

| ID | Paso | Tarea | Hecho cuando | Quien | Estado |
|---|---|---|---|---|---|
| DSF-001 | 1 | SPEC, PLAN y TASKS v0.3; cadenas que entran apuntando aqui; `AGENTS.md` y `BACKLOG.md` al dia | Documentos commiteados; el BACKLOG lista esta cadena como CON CADENA | FS | DONE (2026-11-11) |
| DSF-002 | 1 | Confirmar el contenido: `git diff ed8b493..HEAD -- infra` vacio; herramientas de los tutoriales sin cambios en `apps/`; hotfix `de57c38` equivalente a `ed8b493` | Salidas anotadas en E-1 | FS | DONE (2026-11-11): infra sin diff; hotfix equivalente salvo una linea de imports ya ampliada por URA-009; tutoriales por confirmar en el tag |
| DSF-003 | 1 | Decisiones D-1 a D-8 del usuario | Respuestas anotadas en la SPEC | Usuario | PENDIENTE |
| DSF-004 | 1 | Si D-5 = antes: DES-013 (USD con descuento en SIFEN test) con aviso a FE | Evidencia en `TASKS_DESCUENTOS_FACTURA_v0.1` | FS | PENDIENTE (depende de D-5) |
| DSF-005 | 1 | Regresion final sobre el commit candidato (PLAN §1.3) y tag local `segel-fs-2026.11.12` | Todo en verde; `git tag -n1 segel-fs-2026.11.12` | FS | PENDIENTE |
| DSF-006 | 2 | **Orden directa del usuario** ("Desplega segel-fs-2026.11.12 en segel-fs") | Mensaje del usuario en la sesion | Usuario | PENDIENTE |
| DSF-007 | 2 | Aviso previo a FE (`facturacion-electronica-7c`): commit, franja, nada de FE | Mensaje enviado | FS | PENDIENTE |
| DSF-008 | 2 | Imagenes del tag con `BUILD_COMMIT_SHA` y transferencia a la VPS (PLAN §2.1) | `docker images` en la VPS con las tres nuevas; CA-01 | FS | PENDIENTE |
| DSF-009 | 2 | Respaldo y restauracion de prueba (PLAN §2.2) | Ruta, tamano, SHA256 y conteos en E-1; CA-02 | FS | PENDIENTE |
| DSF-010 | 2 | Reetiquetar `:antes-2026.11.12`, arrancar `migrate`, `api`, `frontend`, `restart frontend` (PLAN §2.3) | Hora de corte y de vuelta en E-1 | FS | PENDIENTE |
| DSF-011 | 2 | Verificacion sin emitir (PLAN §2.4) | CA-03 a CA-07 con sus salidas en E-1 | FS | PENDIENTE |
| DSF-012 | 2 | Pantallas (CA-08) con el usuario de prueba o el usuario | Capturas o confirmacion del usuario | Usuario / FS | PENDIENTE |
| DSF-013 | 2 | Si D-8 lo pide: una factura real de prueba con descuento, al cliente y por el monto que el usuario indique | Numero, estado y KUDE | Usuario / FS | PENDIENTE (depende de D-8) |
| DSF-014 | 3 | Cierre: evidencia E-1, `BACKLOG.md` a DONE en produccion, memoria, aviso a FE, mensaje a operadores (D-6) | CA-09 y CA-10 | FS | PENDIENTE |
| DSF-015 | 3 | Vuelta atras ejecutada (solo si hizo falta), con causa y resultado | E-2 | FS | — |

## Evidencia

### E-1. Despliegue

Pendiente.

### E-2. Vuelta atras

No hizo falta.
