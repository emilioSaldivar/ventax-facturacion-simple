# TASKS — Scripts Backoffice ABM v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_SCRIPTS_BACKOFFICE_ABM_v0.1.md`
- `docs/PLAN_SCRIPTS_BACKOFFICE_ABM_v0.1.md`

---

## Matriz

| ID | Grupo | Script | Estado | Criterio de aceptacion |
|---|---|---|---|---|
| SAB-001 | README | `scripts/sql/README.md` | PENDIENTE | Documenta: (1) cómo generar hash Argon2 desde el contenedor, (2) orden de ejecución para alta completa, (3) cómo conectar a psql del contenedor, (4) referencia al checklist de alta. |
| SAB-002 | A | `alta_facturador.sql` | PENDIENTE | Ejecutado con la ficha FE de ejemplo crea: tenant, suscripción, facturador, establecimiento 001, puntos 001 y 002, actividades 45203 y 96099, perfiles AC445203-E001-P001-FE-PTO y AC496099-E001-P002-FE-PTO, dos `actividad_punto_perfiles`. Re-ejecutado dos veces no duplica datos. Query final muestra todos los registros creados. |
| SAB-003 | A | `add_punto_expedicion.sql` | PENDIENTE | Agrega un punto nuevo a un facturador y establecimiento ya existentes (identificados por `tenant_slug` y `emisor_id`). Crea actividad, perfil y `actividad_punto_perfiles` para ese punto. Re-ejecutable. |
| SAB-004 | A | `create_usuario.sql` | PENDIENTE | Crea usuario operador en el tenant, asigna rol `OPERADOR_FACTURACION`, crea `usuario_operacion_config` activa apuntando al `actividad_punto_perfiles` del punto indicado. Password recibido como `\set password_hash` (Argon2id). Re-ejecutable: si el username ya existe, actualiza display_name y desbloquea. |
| SAB-005 | A | `update_usuario_config.sql` | PENDIENTE | Desactiva la config operativa activa del usuario e inserta una nueva apuntando al punto/actividad/perfil indicado. No elimina la config anterior (auditoría). Falla con mensaje claro si el usuario no existe. |
| SAB-006 | B | `update_timbrado.sql` | PENDIENTE | Actualiza `timbrado`, `timbrado_inicio` y `documento_nro` en el `actividad_punto_perfiles` identificado por tenant + emisor + establecimiento + punto + actividad. No toca otras columnas. Query final confirma los valores actualizados. |
| SAB-007 | B | `reset_usuario.sql` | PENDIENTE | Reinicia `failed_login_count = 0`, borra `bloqueado_at`, setea `activo = true`, revoca todos los refresh tokens activos del usuario. Actualiza `password_hash` si se pasa `\set password_hash`. |
| SAB-008 | B | `deactivate_usuario.sql` | PENDIENTE | Setea `activo = false`, `deleted_at = now()` en el usuario. Revoca todos los refresh tokens activos. Desactiva su `usuario_operacion_config` activa. |
| SAB-009 | B | `deactivate_facturador.sql` | PENDIENTE | En una sola transacción: desactiva el facturador, todos sus `actividad_punto_perfiles`, y todas las `usuario_operacion_config` que apunten a ese facturador. No desactiva usuarios ni puntos físicos. Query final muestra el estado resultante. |
| SAB-010 | B | `update_tenant_suscripcion.sql` | PENDIENTE | Permite setear `estado` de la suscripción activa a `ACTIVA`, `SUSPENDIDA` o `CANCELADA`. Si `CANCELADA`, también setea `activo = false` y `deleted_at` en la suscripción. Actualiza también `tenants.estado` en consecuencia (`ACTIVO`/`SUSPENDIDO`/`CANCELADO`). |
| SAB-011 | C | `query_facturador.sql` | PENDIENTE | Devuelve en una sola consulta: tenant (id, nombre, slug, estado), suscripción (estado), facturador (id, emisor_id, ruc, razon_social, nombre_fantasia, activo), todos los puntos con su establecimiento, actividad, perfil, timbrado, timbrado_inicio, documento_nro y credito_plazo_dias. |
| SAB-012 | C | `query_usuarios_facturador.sql` | PENDIENTE | Lista todos los usuarios del tenant que tienen `usuario_operacion_config` apuntando al facturador indicado: username, display_name, rol, activo, establecimiento asignado, punto asignado, perfil asignado, config activa (sí/no). |
| SAB-013 | FUTURO | Cambio de password desde perfil/primer login | MAPEADO — NO IMPLEMENTAR | El usuario puede cambiar su propia contraseña: (a) en primer login si el sistema detecta que es password temporal, (b) desde la pantalla de Información y Estado. Requiere: campo `password_changed_at` o flag `require_password_change` en `usuarios`, endpoint `PATCH /me/password`, UI en la pantalla de Info/Estado. Esta tarea se especifica e implementa en una iniciativa futura separada. |

---

## Evidencia

- 2026-06-04: SAB-001 a SAB-012 implementados. Todos los scripts en `scripts/sql/`. README con instrucciones de conexión, generación de hash Argon2id y orden de ejecución. `alta_facturador.sql` espeja exactamente el formato "DATOS FE PARA INTEGRACION EXTERNA" con bloques para dos puntos. Todos los scripts de escritura son idempotentes via `ON CONFLICT DO UPDATE`. Hash de passwords: se usa Argon2id via Node.js — `crypt()` de pgcrypto no es compatible con `argon2.verify()` del sistema de auth. SAB-013 (cambio de password desde perfil) mapeado como tarea futura, no implementado.
- SAB-002 a SAB-012 PENDIENTE VALIDACION en ambiente local: ejecutar scripts con ficha FE de ejemplo y verificar query final de cada script.
