# SPEC — Scripts Backoffice ABM v0.1

## Objetivo

Producir un conjunto de scripts SQL reutilizables que cubran el ciclo de vida completo de facturadores y usuarios en el SaaS, organizados por caso de uso operativo y parametrizados para espejear el formato "DATOS FE PARA INTEGRACION EXTERNA" que entrega el backend fiscal.

El resultado permite a soporte ejecutar cualquier operación de ABM sin escribir SQL ad hoc, reduciendo errores operativos y tiempo de alta de nuevos clientes.

---

## Contexto

El proceso actual requiere:
1. Un bloque SQL monolítico para el alta completa (documentado en `GUIA_PRODUCCION_ALTA_CLIENTE_FINAL_v0.1.md`).
2. Tres endpoints de backoffice para crear usuario, resetear password y asignar config operativa.
3. SQL manual para cualquier otra operación (actualizar timbrado, agregar punto, desactivar usuario, etc.).

Esto genera SQL ad hoc cada vez, con riesgo de error. Se necesita un catálogo de scripts parametrizados, idempotentes y verificables.

---

## Alcance

### Incluye

Scripts SQL para las siguientes operaciones, organizados por caso de uso:

| Script | Operación | Entidades tocadas |
|---|---|---|
| `alta_facturador.sql` | Alta completa de un facturador desde ficha FE | tenant, suscripción, facturador, establecimiento, punto(s), actividad(es), perfil(es), actividad_punto_perfiles |
| `add_punto_expedicion.sql` | Agregar un punto de expedición a facturador existente | punto, actividad, perfil, actividad_punto_perfiles |
| `update_timbrado.sql` | Actualizar timbrado vigente, fecha inicio y número de referencia en un punto | actividad_punto_perfiles |
| `create_usuario.sql` | Crear operador y asignarle config operativa activa | usuario, usuario_roles, usuario_operacion_config |
| `update_usuario_config.sql` | Cambiar el punto/perfil/actividad operativa de un usuario existente | usuario_operacion_config |
| `reset_usuario.sql` | Desbloquear usuario, reiniciar intentos fallidos y revocar refresh tokens | usuarios, refresh_tokens |
| `deactivate_usuario.sql` | Desactivar usuario y revocar sesiones activas | usuarios, refresh_tokens |
| `deactivate_facturador.sql` | Desactivar facturador y sus puntos/configuraciones | facturadores, actividad_punto_perfiles, usuario_operacion_config |
| `update_tenant_suscripcion.sql` | Activar, suspender o cancelar suscripción de un tenant | tenants, tenant_suscripciones |
| `query_facturador.sql` | Consulta de estado completo de un facturador | todos los joins relevantes |
| `query_usuarios_facturador.sql` | Usuarios y sus configs operativas para un facturador | usuarios, usuario_operacion_config, actividad_punto_perfiles |

### Fuera de alcance

- Configuración en el backend fiscal `facturacion-electronica` (numeradores, coberturas, perfiles FE, certificados, timbrados en FE) — eso tiene su propio backoffice.
- Endpoints HTTP nuevos en la API del SaaS — eso es una fase posterior.
- UI de backoffice — fase posterior.
- Scripts de migración de datos productivos.
- Gestión de planes (`planes` table) — se considera dato de sistema, no operativo.

---

## Formato del Input

Cada script con operaciones de escritura acepta variables `\set` al inicio, espejando el formato de ficha FE:

```sql
-- Ejemplo: alta_facturador.sql
\set tenant_slug        'cliente-acme'
\set tenant_nombre      'Cliente ACME'
\set plan_codigo        'BASICO_MVP'

-- Datos del emisor (directo de la ficha FE)
\set emisor_id          '5057016-1'
\set ruc                '5057016-1'
\set razon_social       'EMILIO MATIAS SALDIVAR CAPUTO'
\set nombre_fantasia    '1811 BRANDING Y SOFTWARE'

-- Establecimiento
\set establecimiento            '001'
\set establecimiento_nombre     'CASA MATRIZ ITA'
\set establecimiento_direccion  'BERNARDINO CABALLERO 112 - ITA'

-- Punto 001
\set punto_001                  '001'
\set punto_001_nombre           'TALLERES DE CHAPERIA Y PINTURA'
\set actividad_001_codigo       '45203'
\set actividad_001_descripcion  'TALLERES DE CHAPERIA Y PINTURA'
\set perfil_001_codigo          'AC445203-E001-P001-FE-PTO'
\set timbrado_001               '05057016'
\set timbrado_001_inicio        '2026-05-19'
\set documento_nro_001          '0000009'   -- siguiente_numero_fe como 7 dígitos
\set credito_plazo_dias         30

-- Punto 002 (opcional — comentar si no aplica)
\set punto_002                  '002'
\set punto_002_nombre           'OTRAS ACTIVIDADES DE SERVICIOS PERSONALES N.C.P.'
\set actividad_002_codigo       '96099'
\set actividad_002_descripcion  'OTRAS ACTIVIDADES DE SERVICIOS PERSONALES N.C.P.'
\set perfil_002_codigo          'AC496099-E001-P002-FE-PTO'
\set timbrado_002               '05057016'
\set timbrado_002_inicio        '2026-05-19'
\set documento_nro_002          '0000019'   -- siguiente_numero_fe como 7 dígitos
```

---

## Reglas de Diseño para los Scripts

1. **Idempotentes**: todos los `INSERT` usan `ON CONFLICT DO UPDATE` para que el mismo script pueda re-ejecutarse sin error ni duplicado.
2. **Transaccionales**: cada script opera dentro de `BEGIN; ... COMMIT;` con `ROLLBACK` implícito ante error.
3. **Verificación al final**: cada script de escritura cierra con un `SELECT` que confirma el estado resultante de las entidades creadas o modificadas.
4. **Sin secretos**: ningún script incluye passwords, API keys, hashes ni datos sensibles. Los passwords se generan fuera del script y se pasan como variable.
5. **Anotados**: cada bloque de variables tiene comentario de origen (qué campo de la ficha FE mapea).
6. **Sin lógica de FE**: los scripts no llaman, suponen ni replican configuración del backend fiscal. Solo gestionan el modelo local del SaaS.
7. **Sin fecha relativa**: las fechas se setean explícitamente como variables, no con `now()` en los datos de negocio (sí en `updated_at` que es infraestructura).

---

## Mapeo Ficha FE → Schema SaaS

| Campo ficha FE | Tabla SaaS | Columna |
|---|---|---|
| `emisor_id` | `facturadores` | `emisor_id` |
| `ruc_emisor` | `facturadores` | `ruc` |
| `razon_social` | `facturadores` | `razon_social` |
| `nombre_fantasia` | `facturadores` | `nombre_fantasia` |
| `nombre_oficial` (establecimiento) | `facturador_establecimientos` | `nombre` |
| `direccion` (establecimiento) | `facturador_establecimientos` | `direccion` |
| `codigo_actividad_economica_sifen` | `facturador_actividades` | `codigo` |
| `descripcion_actividad_economica` | `facturador_actividades` | `descripcion` |
| `perfil_emision_asociado` | `facturador_perfiles_emision` | `codigo` |
| `timbrado_vigente` | `actividad_punto_perfiles` | `timbrado` |
| `fecha_inicio_timbrado` | `actividad_punto_perfiles` | `timbrado_inicio` |
| `siguiente_numero_fe` (7 dígitos) | `actividad_punto_perfiles` | `documento_nro` |
| `FE_SERVICE_NUMBERING` | Solo env del servidor | (no persiste en DB del SaaS) |
| `FE_SEND_EMISSION_PROFILE_CODE` | Solo env del servidor | (no persiste en DB del SaaS) |
| `factura_electronica_normal_habilitada` | Solo referencia documental | (no persiste en DB del SaaS) |
| `nota_credito_electronica_habilitada` | Solo referencia documental | (no persiste en DB del SaaS) |

Los campos `FE_SERVICE_NUMBERING`, `FE_SEND_EMISSION_PROFILE_CODE` y los flags de habilitación de documentos son variables de entorno del servidor, no datos de la DB del SaaS.

---

## Nota Arquitectónica — Separación del Backoffice (Fase 2)

Para la fase 2 (API de backoffice), la recomendación es crear una aplicación separada en el monorepo: **`apps/backoffice-api`**.

**Razón principal**: el backoffice requiere acceso cross-tenant y privilegios de administración que no deben estar en el mismo proceso que maneja las emisiones operativas del operador final. Un error o deploy del backoffice no debe afectar la disponibilidad de `apps/api`.

| Opción | Descripción | Recomendación |
|---|---|---|
| `apps/backoffice-api` (nuevo app en monorepo) | Express separado, mismo DB, puerto propio, auth de admin independiente | **Recomendada** |
| Nuevas rutas en `apps/api` | Prefijo `/backoffice/` con auth de rol fuerte | Aceptable a corto plazo, acoplada |
| Repositorio separado | Máxima separación, overhead de mantenimiento | Solo si el backoffice crece mucho |

Esta decisión no bloquea la Fase 1 (scripts SQL). Los scripts se conectan directamente a la DB sin depender de ninguna app.

---

## Ubicación de los Scripts

```
scripts/
  sql/
    alta_facturador.sql
    add_punto_expedicion.sql
    update_timbrado.sql
    create_usuario.sql
    update_usuario_config.sql
    reset_usuario.sql
    deactivate_usuario.sql
    deactivate_facturador.sql
    update_tenant_suscripcion.sql
    query_facturador.sql
    query_usuarios_facturador.sql
    README.md
```

---

## Criterios de Aceptación

1. Los 11 scripts existen en `scripts/sql/`.
2. `alta_facturador.sql` ejecutado con la ficha FE de ejemplo crea el tenant, facturador, dos puntos, dos actividades, dos perfiles y dos `actividad_punto_perfiles` correctamente, verificable con la query de cierre del propio script.
3. Todos los scripts de escritura son idempotentes: re-ejecutar con los mismos parámetros no genera duplicados ni errores.
4. `create_usuario.sql` requiere que el operador NO incluya el hash de password en los parámetros — el script documenta cómo generarlo fuera.
5. `query_facturador.sql` devuelve el estado completo de un facturador (tenant, suscripción, establecimientos, puntos, actividades, perfiles, timbrado, documento_nro) en una sola consulta.
6. Ningún script versiona, asume ni expone passwords, API keys ni secretos.
7. `scripts/sql/README.md` documenta el orden de ejecución para el flujo de alta completa y referencia el checklist existente.

---

## Referencias

- `docs/GUIA_PRODUCCION_ALTA_CLIENTE_FINAL_v0.1.md`
- `docs/CHECKLIST_ALTA_FACTURADOR_MVP_v0.1.md`
- `docs/API_FACTURACION_ELECTRONICA/facturacion-electronica-consumer-docs/OPERACION_PERFILES_EMISION_NUMERACION_v0.1.md`
- `db/migrations/0002_saas_foundation.sql`
- `db/migrations/0003_auth.sql`
- `db/migrations/0004_operational_context.sql`
- `db/migrations/0009_fiscal_context_effective_config.sql`
- `db/migrations/0013_identidad_operativa_facturador.sql`
- `AGENTS.md`
