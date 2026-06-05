# Scripts SQL de Backoffice — ABM Facturador y Usuario

Scripts SQL reutilizables para gestión operativa del SaaS. Cada script usa variables `\set` al inicio y es idempotente (se puede re-ejecutar sin duplicados ni errores).

---

## Conexión a psql

### Contenedor local (staging o testing)

```bash
docker compose -f docker-compose.yml exec postgres psql -U facturacion_simple -d facturacion_simple
```

### Contenedor con env específico

```bash
APP_ENV_FILE=.env.production docker compose -f docker-compose.yml exec postgres \
  psql -U facturacion_simple -d facturacion_simple
```

### Ejecutar un script directamente

```bash
docker compose -f docker-compose.yml exec -T postgres \
  psql -U facturacion_simple -d facturacion_simple \
  < scripts/sql/query_facturador.sql
```

---

## Generar Hash de Password (Argon2id)

El sistema usa Argon2id. `crypt()` de pgcrypto NO es compatible — siempre usar este comando:

```bash
# Reemplazar TU_PASSWORD con el password temporal real
docker compose exec -T api node -e \
  "require('argon2').hash('TU_PASSWORD',{type:require('argon2').argon2id}).then(console.log)"
```

Copiar el resultado (empieza con `$argon2id$`) y usarlo como valor de `\set password_hash` en `create_usuario.sql` o `reset_usuario.sql`.

**Nunca guardar el password en claro en archivos, tickets, Git ni logs. Solo pasar el hash.**

---

## Orden de Ejecución para Alta Completa de un Cliente

```
1. alta_facturador.sql            → crea tenant, facturador, establecimiento, puntos, perfiles
2. create_usuario.sql             → crea operador y asigna config operativa
3. query_facturador.sql           → verificar estado completo del facturador
4. query_usuarios_facturador.sql  → verificar usuario y config operativa activa
```

Luego del alta SQL, verificar operatividad con el smoke:

```bash
SMOKE_USERNAME=<username> \
SMOKE_PASSWORD=<password-temporal> \
npm run ops:onboarding-smoke
```

Ver `docs/CHECKLIST_ALTA_FACTURADOR_MVP_v0.1.md` para el checklist completo de cierre.

---

## Catálogo de Scripts

| Script | Operación | Cuándo usar |
|---|---|---|
| `alta_facturador.sql` | Alta completa desde ficha FE | Nuevo cliente |
| `add_punto_expedicion.sql` | Agregar un punto a facturador existente | Nuevo punto en establecimiento existente |
| `create_usuario.sql` | Crear operador + asignar config operativa | Nuevo operador |
| `update_usuario_config.sql` | Cambiar punto/perfil de un operador existente | Reasignación de punto |
| `update_timbrado.sql` | Actualizar timbrado/fecha/número de referencia | Renovación de timbrado |
| `reset_usuario.sql` | Desbloquear + resetear password | Operador bloqueado o sin acceso |
| `deactivate_usuario.sql` | Dar de baja a un operador | Baja de operador |
| `deactivate_facturador.sql` | Dar de baja a un facturador | Baja de cliente |
| `update_tenant_suscripcion.sql` | Activar / suspender / cancelar suscripción | Gestión de suscripción |
| `query_facturador.sql` | Consulta completa del estado de un facturador | Diagnóstico y verificación |
| `query_usuarios_facturador.sql` | Listar usuarios y sus configs operativas | Diagnóstico de acceso |

---

## Reglas Generales

- No guardar passwords, hashes, API keys ni secretos en estos archivos.
- Para producción, usar el env correcto y hacer backup antes de cualquier operación de escritura.
- Todos los scripts cierran con un `SELECT` de verificación — revisar el resultado antes de dar por cerrada la operación.
- El SaaS no gestiona configuración de `facturacion-electronica` (numeradores, coberturas, perfiles FE). Eso se hace en el backoffice de FE por separado.
