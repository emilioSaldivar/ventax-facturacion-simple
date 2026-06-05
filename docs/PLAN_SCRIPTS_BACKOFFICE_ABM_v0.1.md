# PLAN — Scripts Backoffice ABM v0.1

## Referencias

- `AGENTS.md`
- `docs/SPEC_SCRIPTS_BACKOFFICE_ABM_v0.1.md`
- `docs/GUIA_PRODUCCION_ALTA_CLIENTE_FINAL_v0.1.md`
- `db/migrations/0002_saas_foundation.sql`
- `db/migrations/0003_auth.sql`
- `db/migrations/0004_operational_context.sql`
- `db/migrations/0009_fiscal_context_effective_config.sql`
- `db/migrations/0013_identidad_operativa_facturador.sql`

---

## Enfoque

Producir 11 scripts SQL + 1 README dentro de `scripts/sql/`, cada uno parametrizado con `\set` y ejecutable desde `psql`. Todos los scripts de escritura son idempotentes y terminan con una query de verificación.

Los scripts se organizan en tres grupos:

- **Grupo A — Alta y configuración** (4 scripts): flujos que crean o amplían entidades.
- **Grupo B — Gestión operativa** (4 scripts): actualizaciones y operaciones de soporte.
- **Grupo C — Consulta y diagnóstico** (2 scripts): solo lectura.
- **README**: referencia de uso, orden de ejecución y generación de hashes.

---

## Decisiones de Diseño

### Password hashing

El sistema usa Argon2id. `crypt()` de pgcrypto produce bcrypt/DES — **incompatibles con `argon2.verify()`**, el login fallaría. Los scripts usan `\set password_hash` como variable. El README documenta el comando de una línea para generar el hash con Argon2 desde el contenedor API antes de ejecutar el script.

```bash
# Generar hash Argon2id desde el contenedor (sin exponer en archivos)
docker compose exec -T api node -e \
  "require('argon2').hash('TU_PASSWORD',{type:require('argon2').argon2id}).then(console.log)"
```

### Idempotencia

Todos los `INSERT` usan `ON CONFLICT DO UPDATE` con el conjunto de columnas que pueden cambiar legítimamente. Columnas de identidad (IDs, slugs, códigos) nunca se actualizan en el `DO UPDATE`.

### Múltiples puntos en un establecimiento

`alta_facturador.sql` incluye dos bloques de punto (001 y 002) para reflejar el caso de la ficha FE de ejemplo. El segundo bloque está delimitado con comentarios — si el facturador tiene un solo punto, se puede comentar el bloque completo del punto 002 sin tocar nada más.

### `documento_nro` como string de 7 dígitos

`siguiente_numero_fe` en la ficha FE es un entero (ej: `9`). El schema requiere `^[0-9]{7}$`. El script declara la variable ya formateada: `\set documento_nro_001 '0000009'`.

### `actividad_punto_perfiles` como nodo central

Esta tabla vincula actividad + establecimiento + punto + perfil + timbrado. Es el nodo que determina el contexto fiscal operativo completo. Un usuario tiene una `usuario_operacion_config` que apunta a un único `actividad_punto_perfiles` activo a la vez.

### Desactivación en cascada lógica

No se hace `DELETE` de ninguna entidad. Se setea `activo = false` y `deleted_at = now()`. `deactivate_facturador.sql` desactiva también todos sus `actividad_punto_perfiles` y las `usuario_operacion_config` asociadas, en una sola transacción.

---

## Estructura de archivos

```
scripts/
  sql/
    README.md                      ← instrucciones de uso, generación de hash, orden de ejecución
    alta_facturador.sql            ← Grupo A
    add_punto_expedicion.sql       ← Grupo A
    create_usuario.sql             ← Grupo A
    update_usuario_config.sql      ← Grupo A
    update_timbrado.sql            ← Grupo B
    reset_usuario.sql              ← Grupo B
    deactivate_usuario.sql         ← Grupo B
    deactivate_facturador.sql      ← Grupo B
    update_tenant_suscripcion.sql  ← Grupo B
    query_facturador.sql           ← Grupo C
    query_usuarios_facturador.sql  ← Grupo C
```

---

## Orden de Ejecución para Alta Completa

```
1. alta_facturador.sql          ← crea tenant + facturador + establecimiento + puntos
2. create_usuario.sql           ← crea operador y le asigna config operativa
3. query_facturador.sql         ← verificar estado completo del facturador
4. query_usuarios_facturador.sql ← verificar usuario y config operativa
```

Para facturadores con más de dos puntos: ejecutar `add_punto_expedicion.sql` una vez por cada punto adicional, usando los IDs devueltos por `alta_facturador.sql`.

---

## Validación

Los scripts son archivos SQL estáticos — no tienen tests automatizados. La validación es:

- Ejecutar cada script con los datos de la ficha FE de ejemplo en un ambiente de testing local.
- Verificar que la query final de cada script devuelve los datos esperados.
- Verificar idempotencia: ejecutar el mismo script dos veces y confirmar que no hay duplicados ni errores.
- Verificar con `npm run ops:onboarding-smoke` que el usuario creado puede emitir.
- Registrar evidencia en `docs/TASKS_SCRIPTS_BACKOFFICE_ABM_v0.1.md`.
