# Operación — Alta de facturador desde el export de FE v0.1

**Fecha:** 2026-10-14
**Estado:** vigente. Camino automático desde el import v0.3; el manual (§5) queda como respaldo
**Caso real que lo origina:** CARDOZO BENITEZ JILSSE ZULMINA (`4543629-0`), nombre visible
**METAMORFOSIS AGENCIA DIGITAL**, cargado en staging el 2026-10-14.

## Alineación

- `docs/SPEC_IMPORT_CONFIG_FACTURADOR_v0.1.md` (RN-05 mapeo, RN-08 perfiles, RN-09 numeración)
- `docs/SPEC_IMPORT_CONFIG_FACTURADOR_v0.2.md`
- `docs/SPEC_IMPORT_CONFIG_FACTURADOR_v0.3.md` (DRAFT: automatiza el camino manual de este runbook)
- `docs/facturacion-electronica-consumer-docs/GUIA_INTEGRACION_CONSUMIDORES.md` §20.2 y §21

---

## 1. Qué decide este runbook

**Desde el import v0.3** (`SPEC_IMPORT_CONFIG_FACTURADOR_v0.3.md`), el alta normal es **automática**
desde el backoffice, con o sin perfiles en FE:

1. Exportar la configuración del emisor desde FE (JSON o YAML, son equivalentes).
2. Backoffice → *Importar configuración* → subir el archivo → elegir el tenant.
3. Revisar la vista previa: bloqueantes, advertencias, contextos.
4. Ajustar los **textos visibles** (nombre visible, establecimiento, punto, alias del contexto): solo
   son editables en lo que se crea.
5. Pegar la **API key** del consumidor: obligatoria si el facturador es nuevo o no tiene clave. Sin
   ella, "Aplicar" queda deshabilitado.
6. Aplicar. Revisar el detalle del facturador (supervisión humana).
7. Crear y asignar el usuario operativo. El backoffice rechaza la asignación si el facturador no tiene
   API key.

| Condición del archivo | Qué hace el import v0.3 |
|---|---|
| `perfiles_emision.items` con perfiles | Un contexto por perfil, como en v0.2 |
| `requerido: false` y `items: []` | Perfil centinela `NO_REQUERIDO`, un contexto por punto, actividad principal editable (RN-28, RN-29) |
| `items: []` sin `requerido: false` | Bloquea con `SIN_CONTEXTOS`: pedir a FE una exportación completa |

**Re-import** (por ejemplo, tras un cambio de timbrado): se actualiza lo fiscal (razón social,
dirección, timbrado) y se **conservan** los textos visibles. Si FE trae otros, la vista previa lo
avisa con `TEXTO_VISIBLE_DIFIERE`; para adoptarlos, marcar la casilla correspondiente.

El camino **manual por API** (§5) queda como respaldo mientras v0.3 no esté desplegado en el ambiente,
o ante un caso que el import no cubra.

El centinela `NO_REQUERIDO` lo reconoce el gateway y **no lo envía** a FE
(`fiscal-gateway.client.ts:1231` y `:1277`). Precedentes: RACING MULTIMARCAS (`3457905-2`) y el primer
alta de `4543629-0`.

---

## 2. Lo que provee el responsable del alta

| # | Insumo | Dónde se obtiene | Cómo se entrega |
|---|---|---|---|
| 1 | Archivo de configuración (`configuracion-<emisor>-<fecha>.json` o `.yaml`) | FE del ambiente correspondiente → exportar configuración del consumidor | Archivo. JSON y YAML son equivalentes; se usa JSON |
| 2 | API key del consumidor del facturador | FE, al crear el consumidor | **Nunca en el chat ni en el repo.** En el archivo de credenciales de la VPS (§3) |
| 3 | Credenciales de un usuario backoffice (`ADMIN_INTERNO` o `SOPORTE_INTERNO`) | Backoffice del ambiente | En el archivo de credenciales de la VPS (§3) |
| 4 | Nombre visible en la app (`nombre_fantasia`) | Decisión comercial | Texto. Es el **único** dato que se cambia respecto del archivo |
| 5 | Tenant de destino | Backoffice | Slug o id. Puede existir de antes (el de este caso se creó a mano antes del export) |

---

## 3. Preparación de credenciales (una vez por ambiente)

Solo para el camino manual por API. En el camino automático, la API key se pega en la pantalla del
import y nunca toca un archivo.

En la VPS (`ssh hetzner`), fuera de cualquier repositorio:

```bash
mkdir -p ~/.config/ventax && install -m 600 /dev/null ~/.config/ventax/staging-backoffice.env
nano ~/.config/ventax/staging-backoffice.env
```

```
BO_USERNAME=<usuario-backoffice>
BO_PASSWORD=<password>
FE_CONSUMER_API_KEY=<api-key-del-facturador>
```

Las llamadas se hacen **desde la VPS** contra `http://127.0.0.1:8091/api/v1` (staging) o `:8191`
(producción): las credenciales no salen del servidor ni pasan por Cloudflare. La VPS no tiene `jq`;
se usa `python3` (incluido en el sistema). No instalar paquetes en el host (`AGENTS.md`).

Cuando se cargue el facturador siguiente, la línea `FE_CONSUMER_API_KEY` se reemplaza por la del
nuevo facturador.

---

## 4. Verificación previa (siempre, en los dos caminos)

1. **Stack arriba.** `docker ps --filter label=com.docker.compose.project=ventax-facturacion-simple`
   muestra `api`, `frontend` y `postgres` en `healthy`. Si está caído:
   `APP_ENV_FILE=.env.staging bash scripts/deploy.sh` en `/home/deploy/apps/ventax-facturacion-simple`.
2. **Login backoffice.** `POST /auth/login` → 200 con rol `ADMIN_INTERNO` o `SOPORTE_INTERNO`.
3. **Tenant.** `GET /backoffice/tenants/{id}` → `estado: ACTIVO` y suscripción `ACTIVA`.
4. **El emisor no existe.** `GET /backoffice/tenants/{id}/facturadores` sin el `emisor_id`.
5. **Vista previa del import** (no escribe nada):
   `POST /backoffice/facturadores/import/preview` con
   `{filename, format: "json", content, target: {mode: "EXISTENTE", tenant_id}}`.
   - `puede_aplicar: true` → seguir por el **camino automático** en la UI del backoffice.
   - Único bloqueante `SIN_CONTEXTOS` y el archivo dice `perfiles_emision.requerido: false` →
     **camino manual** (§5).
   - Cualquier otro bloqueante → detenerse y resolverlo en FE o con el responsable.

Advertencias esperables y no bloqueantes: `BASE_URL_DISTINTA` (el archivo trae la URL pública de FE;
el SaaS usa la red Docker interna), `CONSUMIDOR_ESTADO_DESCONOCIDO` y `API_KEY_AUSENTE`.

---

## 5. Camino manual: mapeo y orden de carga

Aplica RN-05 del SPEC v0.1 campo por campo; lo único que no sale del archivo es lo marcado
*estructura*.

| Paso | Endpoint | Cuerpo | Origen |
|---|---|---|---|
| 1 Facturador | `POST /backoffice/tenants/{tenant}/facturadores` | `emisor_id` y `ruc` = `emisor.emisor_id`; `razon_social` = `emisor.razon_social`; `nombre_fantasia` = **nombre visible elegido** | archivo + insumo 4 |
| 2 API key | `PUT /backoffice/facturadores/{id}/api-key` | `{api_key}` desde el archivo de credenciales. Responde **204** | insumo 2 |
| 3 Establecimiento | `POST /backoffice/facturadores/{id}/establecimientos` | `codigo`, `nombre` = `denominacion`, `direccion` | `establecimientos[]` |
| 4 Punto | `POST /backoffice/establecimientos/{est}/puntos` | `codigo`, `nombre` = `descripcion` | `establecimientos[].puntos_expedicion[]` |
| 5 Actividad | `POST /backoffice/facturadores/{id}/actividades` | `codigo`, `descripcion`, `alias_operativo` = descripción truncada a 100 | `actividades_economicas[]` |
| 6 Perfil | `POST /backoffice/facturadores/{id}/perfiles` | `codigo: "NO_REQUERIDO"`, descripción explicativa | *estructura* |
| 7 Contexto | `POST /backoffice/facturadores/{id}/contextos` | ids de 3–6; `timbrado` y `timbrado_inicio` del timbrado vigente; `documento_nro: "0000001"`; `credito_plazo_dias: 30`; `alias_operativo` = descripción del punto | `timbrados[vigente]` + defaults del import |
| 8 Readiness | `GET /backoffice/facturadores/{id}/readiness` | — | — |

Con varias actividades, establecimientos o puntos: un contexto por cada combinación válida que el
facturador vaya a usar, todos con el perfil `NO_REQUERIDO`. Sin perfiles en FE, la combinación la
decide el responsable del alta: el archivo no la declara.

`documento_nro` es irrelevante cuando `numeracion.autoridad` es `SERVICE` (el número lo asigna FE),
pero la resolución de contexto lo exige no nulo.

`tipo_transaccion_default` no se envía: queda el `2` (prestación de servicios) del modelo.

---

## 6. Verificación posterior

1. **Readiness**: todos los checks en verde salvo `usuarios_operativos: 0`, que se completa al asignar
   el usuario. `fiscal_backend_available: true`.
2. **Base** (solo lectura): el contexto une facturador, actividad, establecimiento, punto y perfil
   con `activo = true` y la API key presente (`fe_consumer_api_key is not null`).
3. **Secretos**: los logs del contenedor `api` de los últimos 30 minutos no contienen la API key ni la
   password. Se verifica leyendo los valores del archivo de credenciales dentro de la VPS, sin
   escribirlos en la línea de comandos.
4. **Supervisión humana**: el responsable revisa en el backoffice (detalle del facturador) el nombre
   visible, el establecimiento, el punto y el contexto. Lo único editable a gusto son los textos
   visibles: `nombre_fantasia`, nombre del establecimiento, nombre del punto y alias operativos.

---

## 7. Después del alta

1. Crear el usuario operativo y asignarle el facturador y el contexto (backoffice → Usuarios). Con
   eso el readiness pasa a `ready: true`.
2. Primera emisión de prueba desde la app. Es la que valida la API key contra FE: el readiness no la
   prueba.
3. Si la API key se compartió por un canal no seguro, rotarla en FE y recargarla con el paso 2.

---

## 8. Evidencia — 4543629-0 en staging (2026-10-14)

| Paso | Resultado |
|---|---|
| Stack | Estaba detenido desde 02:46 UTC; redeploy con `APP_ENV_FILE=.env.staging bash scripts/deploy.sh` (realizado por el usuario) |
| Tenant | `metamorfosis-agencia-1` (`67a764d7-…`), ACTIVO, plan PROFESIONAL, suscripción ACTIVA, sin facturadores |
| Preview | `puede_aplicar: false`; bloqueante único `SIN_CONTEXTOS`; advertencias `BASE_URL_DISTINTA`, `CONSUMIDOR_ESTADO_DESCONOCIDO`, `API_KEY_AUSENTE`; 9 rutas ignoradas, **sin** mencionar `perfiles_emision.requerido` |
| 1 Facturador | 201 · `a0f786fc-edb2-49c6-a442-df3dee342815` · nombre visible `METAMORFOSIS AGENCIA DIGITAL` |
| 2 API key | 204 · `has_api_key: true` |
| 3–6 | 201 · establecimiento `001`, punto `001`, actividad `96099`, perfil `NO_REQUERIDO` |
| 7 Contexto | 201 · `4ce5bf66-…` · timbrado `04543629` desde `2026-10-14`, `documento_nro 0000001` |
| 8 Readiness | `ready: false` solo por `usuarios_operativos: 0`; `fiscal_backend_available: true` |
| Secretos en logs | NO (199 líneas revisadas) |

**Incidente de ejecución:** el primer script trató el 204 del paso 2 como error y se detuvo después
de crear el facturador. Se retomó desde el paso 3, verificando antes `has_api_key: true` y que no
hubiera establecimientos creados. No quedaron duplicados. Para scripts futuros: aceptar 200, 201 y
204.

## 9. Corrección con el re-export de FE (2026-10-14, 13:47 UTC)

FE re-exportó `4543629-0` con el perfil real `A96099-E001-P001-FE-COMP` y el punto `001` renombrado
a `METAMORFOSIS AGENCIA DIGITAL`. Con ese archivo el import automático es aplicable
(`puede_aplicar: true`), y el alta pasó a la configuración de FE.

| Paso | Resultado |
|---|---|
| Preview + apply del import | 200 · crea perfil `A96099-E001-P001-FE-COMP` y contexto `de234a01-…`; renombra el punto. **Revierte `nombre_fantasia`** a `JILSSE ZULMINA CARDOZO BENITEZ` (D-4 del SPEC v0.3) |
| Restaurar nombre visible | `PATCH /facturadores/{id}` → `METAMORFOSIS AGENCIA DIGITAL` |
| Desactivar centinela | Contexto `4ce5bf66-…` y perfil `NO_REQUERIDO` en `activo: false` (no se borran: tienen facturas asociadas por historia) |
| Efecto colateral 1 | El PATCH del perfil borró su `descripcion` (bug §1.4 del SPEC v0.3). Restaurada |
| Efecto colateral 2 | El usuario `metamorfosis_test`, creado a las 14:23 UTC, estaba asignado al contexto desactivado. Reasignado al contexto `A96099-E001-P001-FE-COMP` con `PUT /backoffice/users/{id}/operation-config` |
| Emisiones previas | Facturas `0000001` (14:25) y `0000002` (14:27) EMITIDAS con el centinela, sin perfil enviado; SIFEN test `0422 CDC encontrado`. Validan la API key y la habilitación de FE |
| Re-preview | `crear 0`, `actualizar 1` (solo `nombre_fantasia`, por D-4), `sin_cambios 6` |
| Readiness final | `ready: true`, 1 contexto activo, 1 usuario |
| Secretos en logs | NO (643 líneas, 90 min) |

**Lecciones para el runbook:**
- Antes de cargar, confirmar con FE que el export tenga perfiles si el emisor los va a tener: el
  camino manual con `NO_REQUERIDO` solo corresponde si FE no define ninguno.
- Antes de desactivar un contexto, revisar `usuarios_asignados` y reasignar primero.
- Mientras no se corrija el bug §1.4, todo PATCH parcial por API debe reenviar los textos de la
  entidad.

## 10. Evidencia — 4543629-0 en producción (2026-10-14)

Camino manual (§5): producción corre código anterior al import v0.3 (migración `0032`), y el export
de FE prod (16:46 UTC) trae `requerido: false` con `items: []`.

| Paso | Resultado |
|---|---|
| Plan PROFESIONAL | Activo, mismos límites que BASICO_MVP (10 usuarios / 3 facturadores); el código no tiene reglas por código de plan |
| Backup previo | `pg_dump -Fc` → `/home/deploy/backups/facturacion-simple-prod/pre-alta-4543629-0-20261014-165149.dump` (64 MB, 36 tablas; verificado con `pg_restore --list`). `pg_dump` no bloquea escrituras |
| Credenciales | `~/.config/ventax/prod-backoffice.env` en la VPS (600, usuario deploy); llamadas desde la VPS a `127.0.0.1:8191` |
| Guardas | Slug y emisor inexistentes en los 6 tenants previos |
| 0 Tenant | 201 · `metamorfosis-agencia-digital` (`94d349a1-…`), plan PROFESIONAL, suscripción ACTIVA |
| 1–2 Facturador + API key | 201 / 204 · `89238815-b7d1-49f9-8906-4f3fe659a15f`, nombre visible `METAMORFOSIS AGENCIA DIGITAL`, `has_api_key: true` |
| 3–7 | 201 · establecimiento `001`, punto `001` METAMORFOSIS AGENCIA DIGITAL, actividad `96099`, perfil `NO_REQUERIDO`, contexto con timbrado `19190616` desde `2026-10-14` |
| Readiness | `ready: false` solo por `usuarios_operativos: 0`; `fiscal_backend_available: true` |
| Producción | Contenedores healthy, `factura.ventax.app` 200, 0 respuestas 5xx y secretos ausentes de los logs (143 líneas, 20 min) |

Solo se usaron altas (POST): el bug de PATCH parcial (SPEC import v0.3 §1.4) sigue en producción
hasta desplegar v0.3, así que **no desactivar ni editar por PATCH sin reenviar los textos**.
