# SPEC Import de Configuración de Facturador v0.1

**Versión:** 0.1
**Fecha:** 2026-09-19
**Estado:** DRAFT — pendiente PLAN/TASKS

## Alineación

- `AGENTS.md` (Límite de Dominio: tenants, planes y suscripciones son responsabilidad de este repo; la lógica fiscal vive en `facturacion-electronica`)
- `docs/SPEC_BACKOFFICE_ADMIN_v0.1.md` (alta por formularios entidad por entidad — este SPEC la complementa, no la reemplaza)
- `docs/SPEC_SEGMENTACION_PERFIL_EMISION_v0.1.md` (consume los perfiles de emisión que este import crea: define qué catálogo y qué documentos ve el operador asignado a cada perfil, y agrega el rol de consulta que se asigna a un facturador sin perfil)
- `docs/SPEC_SCRIPTS_BACKOFFICE_ABM_v0.1.md` y `scripts/sql/alta_facturador.sql` (semántica de upsert idempotente ya probada en producción)
- `docs/API_FACTURACION_ELECTRONICA/facturacion-electronica-consumer-docs/GUIA_INTEGRACION_CONSUMIDORES.md` (contrato del consumidor FE)
- `facturacion-electronica/src/services/export-configuracion-consumidor.service.ts` y `export-consumidor-field-refs.ts` (**generador real del archivo**, leído y verificado; ver §5.3), expuesto en `GET /admin/emisores/:id/configuracion/export-consumidor`
- Código: `apps/api/src/modules/backoffice/*`, `apps/api/src/modules/context/context.repository.ts`, `apps/backoffice/src/main.tsx`, `db/migrations/0004_operational_context.sql`, `0009_fiscal_context_effective_config.sql`

**Principio rector:** todo es aditivo. El import nunca borra ni desactiva entidades existentes, y el alta manual por formularios y los scripts SQL siguen funcionando exactamente igual como camino de contingencia.

---

## 1. Objetivo

Reemplazar el alta manual de un facturador nuevo —hoy siete formularios encadenados o la ejecución a mano de `scripts/sql/alta_facturador.sql`— por la **subida de un único archivo de configuración JSON/YAML exportado por `facturacion-electronica`**, con vista previa de los cambios, confirmación explícita y aplicación atómica.

Como cierre del circuito, el **alta de usuario** debe permitir elegir en el mismo formulario el facturador asignado y su perfil de emisión (código de actividad), sin pasar por una segunda pantalla.

El flujo objetivo completo es:

```
1. SUBIDA DEL ARCHIVO DE CONFIGURACIÓN (JSON o YAML)
2. VALIDACIÓN DE LA EXISTENCIA DEL FACTURADOR
3. CREACIÓN (SI CORRESPONDE) DEL FACTURADOR Y TODOS SUS DATOS FISCALES
4. MAPEO DE ESOS DATOS AL MODELO OPERATIVO DEL SaaS
5. ALTA DE USUARIO ELIGIENDO FACTURADOR + PERFIL (CÓDIGO DE ACTIVIDAD)
```

---

## 2. Contexto y motivación

### 2.1 Cómo se da de alta un facturador hoy (estado verificado 2026-09-19)

Existen dos caminos, ambos manuales:

**Camino A — backoffice web** (`apps/backoffice/src/main.tsx`): siete formularios independientes que hay que recorrer en orden, cada uno con su propia llamada HTTP y su propia transacción:

| Paso | Vista | Endpoint | Tabla |
|---|---|---|---|
| 1 | `TenantCreateView` (`main.tsx:431`) | `POST /backoffice/tenants` | `tenants` + `tenant_suscripciones` |
| 2 | `FacturadorCreateView` (`main.tsx:655`) | `POST /backoffice/tenants/:tenantId/facturadores` | `facturadores` |
| 3 | `EstablecimientoCreateView` (`main.tsx:1468`) | `POST /backoffice/facturadores/:id/establecimientos` | `facturador_establecimientos` |
| 4 | `PuntoCreateView` (`main.tsx:1526`) | `POST /backoffice/establecimientos/:id/puntos` | `facturador_puntos_expedicion` |
| 5 | `ActividadCreateView` (`main.tsx:1582`) | `POST /backoffice/facturadores/:id/actividades` | `facturador_actividades` |
| 6 | `PerfilCreateView` (`main.tsx:1640`) | `POST /backoffice/facturadores/:id/perfiles` | `facturador_perfiles_emision` |
| 7 | `ContextoCreateView` (`main.tsx:1694`) | `POST /backoffice/facturadores/:id/contextos` | `actividad_punto_perfiles` |

Luego, en otras dos pantallas: alta de usuario (`UserCreateView`, `main.tsx:1909`) y recién después asignación de configuración operativa (`UserDetailView`, `main.tsx:2248-2330`).

**Camino B — SQL manual**: `scripts/sql/alta_facturador.sql`, parametrizado con `\set` completados a mano desde la ficha "DATOS FE PARA INTEGRACION EXTERNA", ejecutado con acceso directo a la base de producción. Es lo que se usa en la práctica (`scripts/sql/alta_facturador_80136968_prod.sql` es el caso real de AWAPUREA).

### 2.2 Problemas concretos

1. **Sin atomicidad.** Cada paso del camino A es una transacción propia. Si el alta se interrumpe en el paso 5, el facturador queda incompleto: `context.repository.ts:43-130` exige `timbrado`, `timbrado_inicio` y `documento_nro` no nulos para resolver el contexto, así que el operador recibe `409 Usuario sin configuracion operativa completa` sin ninguna pista de qué falta.
2. **Transcripción manual propensa a error.** Códigos de establecimiento y punto de tres dígitos, código SIFEN de actividad, número de timbrado y código de perfil de emisión se copian a mano. Un perfil mal tipeado se detecta recién en la primera emisión, cuando FE lo rechaza.
3. **Lento y no delegable.** El camino B exige credenciales de base de datos de producción.
4. **Sin trazabilidad.** No queda registro de qué ficha FE originó qué configuración ni de quién la cargó.
5. **El dato ya existe estructurado.** `facturacion-electronica` exporta toda la configuración del emisor en un archivo versionado (contrato v0.1), en JSON y en YAML. Hoy ese archivo se lee con los ojos y se retipea.

### 2.3 El hallazgo que hace viable la automatización

El bloque `perfiles_emision.items[]` del archivo es **exactamente** la tupla que modela la tabla `actividad_punto_perfiles`:

```yaml
- codigo: A45203-E001-P001-FE-PTO   # → facturador_perfiles_emision.codigo
  actividad_codigo: "45203"          # → actividad_id
  establecimiento_codigo: "001"      # → establecimiento_id
  punto_codigo: "001"                # → punto_expedicion_id
```

Es decir: **los contextos operativos no hay que inventarlos ni pedirlos, se derivan del archivo**. Eso convierte el paso más delicado del alta (el paso 7, el único que combina cuatro entidades y tres campos fiscales) en una derivación mecánica y verificable.

---

## 3. Alcance

### Incluido

**Backend**
- Endpoint de **vista previa** (`preview`) que recibe el archivo, lo parsea, lo valida, lo mapea al modelo del SaaS y devuelve un diff completo contra el estado actual de la base, sin escribir nada.
- Endpoint de **aplicación** (`apply`) que repite el cálculo y persiste todo en **una única transacción**.
- Soporte de **JSON y YAML** para el mismo contrato v0.1, con resultado idéntico.
- Validación de existencia del facturador por `(tenant_id, emisor_id)` y semántica **upsert aditiva** para re-import.
- Registro de auditoría por import aplicado (archivo, versión de contrato, usuario, resumen aplicado).

**Frontend (backoffice)**
- Vista nueva de importación: subir archivo → elegir/crear tenant → revisar diff → confirmar → resultado.
- Edición del `documento_nro` inicial por contexto nuevo dentro de la vista previa.
- Informe visible de bloqueantes, advertencias y datos del archivo que no se importan.

**Alta de usuario**
- Selección opcional de facturador + contexto operativo (que expone el código de actividad y el perfil de emisión) dentro del mismo formulario de creación, creando usuario y configuración operativa en una sola transacción.
- El formulario contempla los dos modos de asignación definidos en `SPEC_SEGMENTACION_PERFIL_EMISION_v0.1`: **operador**, que lleva facturador y contexto operativo, y **consulta**, que lleva únicamente facturador. El modo de consulta depende de que ese SPEC esté implementado; mientras no lo esté, el formulario ofrece solo el modo operador.

### Excluido

- **Carga de la API key del consumidor** (`facturadores.fe_consumer_api_key`): el archivo no la contiene y seguirá cargándose en el panel actual de `FacturadorDetailView` (`main.tsx:816-945`).
- **Sincronización automática contra FE** vía `GET /admin/emisores/{id}/configuracion`. El diseño deja el camino abierto (ver §13) pero v0.1 es solo archivo subido por el operador.
- **Borrado o desactivación** de cualquier entidad: si algo existe en la base y no está en el archivo, se informa y **no se toca**.
- **Configuración por facturador de la conexión fiscal** (`base_url`, `ambiente`, `FE_SERVICE_NUMBERING`, `FE_SEND_EMISSION_PROFILE_CODE`): siguen siendo variables de entorno del deployment (`apps/api/src/config/env.ts`).
- **Cambios en la resolución de contexto operativo ni en el camino de emisión.** `context.repository.ts` y `fiscal-gateway.client.ts` no se tocan.
- Import masivo de varios facturadores en un solo archivo.
- Programación o versionado de configuraciones futuras (el archivo es una foto del momento, como declara el propio `contrato.aviso_vigencia`).

---

## 4. Actores y roles

| Actor | Rol | Acceso |
|---|---|---|
| Soporte interno | `SOPORTE_INTERNO` | Preview y apply del import; alta de usuario con configuración operativa |
| Admin interno | `ADMIN_INTERNO` | Ídem |

Se reutiliza el guard `requireAuth + requireBackofficeRole` ya existente (`backoffice.routes.ts:199-220`). No se introducen roles ni permisos nuevos. El operador final (`OPERADOR_FACTURACION`) no ve nada de esto.

---

## 5. El contrato de configuración v0.1

### 5.1 Forma general

El archivo es un documento JSON o YAML donde **casi todo campo escalar viene envuelto** en un objeto `{ valor, referencia }`, donde `referencia` es un ancla a la guía de integración de FE:

```yaml
emisor:
  razon_social:
    valor: EMILIO MATIAS SALDIVAR CAPUTO
    referencia: GUIA_INTEGRACION_CONSUMIDORES.md#4-lo-que-el-administrador-configura-para-vos
```

El import debe **desenvolver ese patrón de forma genérica** y conservar las `referencia` para mostrarlas en la vista previa (es la trazabilidad de dónde salió cada dato; hoy se pierde).

Un objeto se trata como envoltorio solo si tiene la clave `valor` **y** todas sus claves pertenecen al conjunto `{valor, referencia, nota, fuente}`. Así, un objeto de negocio futuro que casualmente tenga un campo `valor` no se destruye.

### 5.2 Bloques y obligatoriedad

| Bloque | Obligatorio | Uso en el SaaS |
|---|---|---|
| `contrato.version` | **Sí** | Compuerta de compatibilidad. v0.1 es la única soportada |
| `contrato.generado_en` | No | Antigüedad de la foto → advertencia si supera 30 días |
| `contrato.guia_referencia`, `contrato.aviso_vigencia` | No | Informativo, se ignora |
| `servicio.*` | No | Verificación cruzada contra el deployment; ningún campo se persiste |
| `emisor.emisor_id`, `emisor.razon_social` | **Sí** | Identidad del facturador |
| `emisor.nombre_fantasia`, `emisor.ambiente` | No | Nombre comercial; validación de ambiente |
| `actividades_economicas[]` (≥1) | **Sí** | Actividades económicas del facturador |
| `establecimientos[]` (≥1), cada uno con `puntos_expedicion[]` (≥1) | **Sí** | Establecimientos y puntos de expedición |
| `timbrados[]` | No* | Timbrado de los contextos. *Obligatorio en la práctica si hay contextos nuevos que crear |
| `perfiles_emision.items[]` | No* | Perfiles **y contextos operativos**. *Ver regla RN-08 |
| `numeracion.*` | No | Determina el tratamiento de `documento_nro` |
| `envio.modos_habilitados`, `tipos_documento_habilitados` | No | Informativo, se ignora |
| `consumidor[]` | No | Verificación de permisos de la API key; no se persiste |

El esquema es **tolerante a claves desconocidas** (passthrough) para no romper ante versiones futuras del exportador de FE, pero rechaza una `contrato.version` que no conozca.

### 5.3 Contrato verificado contra el generador de FE

El archivo no se interpretó: se leyó el código que lo produce.

**Origen exacto:** `GET /admin/emisores/:id/configuracion/export-consumidor?env=&formato=&consumer=`
(`facturacion-electronica/src/api/routes/admin.route.ts:1082`, sesión de administrador, no clave de consumidor),
implementado por `ExportConfiguracionConsumidorService.project()`
(`facturacion-electronica/src/services/export-configuracion-consumidor.service.ts`), con el allowlist de 40 campos
en `export-consumidor-field-refs.ts`.

Hechos del generador que condicionan el import:

| Hecho verificado | Consecuencia para nosotros |
|---|---|
| `emisor.emisor_id` se proyecta desde `emisores.ruc_completo` | `emisor_id` **es** el RUC con dígito verificador. Escribirlo en `facturadores.emisor_id` y en `facturadores.ruc` no es un supuesto: es el mismo dato de origen. Deja de ser un riesgo |
| `withRef()` devuelve `undefined` si el campo no está en el allowlist | Cualquier campo puede **faltar** por completo. El esquema los trata como opcionales y nunca asume presencia |
| Todos los escalares pasan por `toNullableString()` | `valor` puede ser **`null`** en campos que para nosotros son obligatorios (por ejemplo `razon_social`). Un `null` en un campo obligatorio debe producir un **bloqueante con mensaje claro**, nunca un error de esquema genérico |
| Antes de resolver los perfiles, FE filtra actividades, establecimientos y puntos por `activo` | Un perfil apuntado a un establecimiento o punto **inactivo** exporta `actividad_codigo`, `establecimiento_codigo` o `punto_codigo` en `null`. Es un caso real y frecuente, no un archivo corrupto: se reporta como `REFERENCIA_INTERNA_ROTA` y el esquema debe aceptar el `null` para poder reportarlo |
| `numeracion.autoridad` = `SERVICE` si hay numeradores no bloqueados, `CLIENT` si no | `CLIENT` es alcanzable (emisor sin numeradores). `documento_nro_requerido` es exactamente `autoridad === 'CLIENT'`, y `rango_min`/`rango_max` solo traen valor con `CLIENT` |
| `perfiles_emision.requerido` = `perfiles.length > 1` | Es un derivado informativo, no una orden de FE. El import usa `items[]`, nunca este flag |
| `tipos_documento_habilitados` traduce el código SIFEN: `1 → FE`, `5 → NCE`, otro → `TIPO_<n>` | La lista puede traer etiquetas `TIPO_<n>` desconocidas; se ignoran sin romper |
| `perfiles_emision.items[].tipo_documento` es el código crudo, `"1"` | **No** vale `"FE"`. Sin destino en nuestro modelo |
| `envio.modos_habilitados` = `['SYNC','BATCH','AUTO']` si batch está habilitado, `['SYNC']` si no | Informativo; el SaaS usa su propio outbox |
| `timbrados[].vigente` lo calcula FE como `activo && (vigente_hasta ?? fecha_fin) > ahora`, y es `true` si no hay límite | El flag ya viene resuelto; `fecha_fin` puede ser un centinela lejano (`2099-01-01`) |
| `servicio` se omite entero si el generador no resuelve la URL; `url_verificada` puede ser `false` con un `aviso` que nombra la causa | El bloque completo es opcional |
| `consumidor[].alcance[].emisor_id` es el RUC completo, y el export admite filtrar por `consumer` | Sirve para verificar permisos y alcance, no se persiste |
| El generador **nunca** emite `siguiente_numero`, CSC, certificados, paths ni claves | El archivo no contiene secretos: puede guardarse íntegro en la auditoría del import |

**Archivos de referencia** (fixtures en `apps/api/tests/fixtures/`): la exportación real del emisor `5057016-1`
del 2026-09-19 —2 actividades, 1 establecimiento, 2 puntos, 1 timbrado vigente, 2 perfiles— más las variantes
generadas desde el stack de desarrollo (§12 del PLAN).

**Rótulo a corregir:** `FacturadorCreateView` (`main.tsx:655`) llama al `emisor_id` "UUID del backend fiscal",
cuando es un RUC con dígito verificador.

### 5.4 Datos que hoy no exporta FE y convendría agregar

`emisores` tiene `email_contacto` y `telefono_contacto` (`facturacion-electronica/src/migrations/002_multi_emisor.sql:10-11`),
pero **ninguno está en el allowlist del export**. Incorporarlos sería aditivo y no rompería a ningún consumidor
—nuestro esquema es tolerante a campos nuevos— y nos permitiría precargar:

- `tenants.email_administrativo` (columna existente, `0028_verificacion_fiscal.sql:33`);
- el email del primer usuario operativo en su alta, que hoy se tipea a mano;
- `facturadores.telefono` (columna existente, `0021_facturador_logo_rubro.sql`).

Mientras no se agreguen, esos tres campos se completan a mano y el import no los reclama.

**Lo que no corresponde pedirle a FE:** un `tenant_id`. El tenant es un concepto exclusivo de este SaaS
(`AGENTS.md`, Límite de Dominio); FE administra emisores y consumidores. Exportar un identificador de FE
como si fuera nuestro tenant ataría nuestra estructura comercial a los identificadores internos de otro
sistema, que es justamente lo que RN-04 evita.

---

## 6. Reglas de negocio

### 6.1 Identidad y existencia

- **RN-01 — Identidad del facturador.** Un facturador se identifica por `(tenant_id, emisor_id)`, que es el índice único parcial ya existente (`facturadores_tenant_emisor_uidx`). El import busca por esa clave: si no existe lo crea, si existe lo actualiza.
- **RN-02 — Un emisor vive en un solo tenant.** Si el `emisor_id` del archivo ya existe en un tenant distinto al de destino, el import **bloquea**. Duplicar un contribuyente real en dos tenants es un error de operación, no un caso de uso.
- **RN-03 — Identidad de entidades hijas.** Siempre por código, nunca por posición en el archivo: establecimiento por `codigo`, punto por `(establecimiento, codigo)`, actividad por `codigo`, perfil por `codigo`, contexto por la tupla `(actividad, establecimiento, punto, perfil)`. Coinciden exactamente con los índices únicos parciales de `0004_operational_context.sql`.
- **RN-04 — El tenant es nuestro.** El archivo no trae tenant porque `facturacion-electronica` no conoce el concepto: administra emisores y consumidores. El operador elige un tenant existente o lo crea en el mismo paso, con nombre y slug precargados desde `emisor.razon_social` y `consumidor[0].nombre` pero siempre editables y confirmados por él.

### 6.2 Mapeo al modelo operativo

- **RN-05 — Mapeo de campos.**

| Origen (archivo) | Destino | Regla |
|---|---|---|
| `emisor.emisor_id` | `facturadores.emisor_id` y `facturadores.ruc` | Mismo valor en ambas columnas: FE lo proyecta desde `emisores.ruc_completo`, así que el `emisor_id` **es** el RUC (§5.3). Si el facturador ya existe con un `ruc` distinto —por haberse creado a mano— **no se pisa** y se emite advertencia |
| `emisor.razon_social` | `facturadores.razon_social` | Crear y actualizar |
| `emisor.nombre_fantasia` | `facturadores.nombre_fantasia` | Crear y actualizar; un `null` del archivo no borra un valor existente |
| `establecimientos[].codigo` | `facturador_establecimientos.codigo` | Clave |
| `establecimientos[].denominacion` | `facturador_establecimientos.nombre` | Crear y actualizar |
| `establecimientos[].direccion` | `facturador_establecimientos.direccion` | Crear y actualizar |
| `…puntos_expedicion[].codigo` | `facturador_puntos_expedicion.codigo` | Clave |
| `…puntos_expedicion[].descripcion` | `facturador_puntos_expedicion.nombre` | Crear y actualizar |
| `actividades_economicas[].codigo` | `facturador_actividades.codigo` | Clave |
| `actividades_economicas[].descripcion` | `facturador_actividades.descripcion` | Crear y actualizar |
| `actividades_economicas[].descripcion` | `facturador_actividades.alias_operativo` | **Solo al crear**, truncado a 100 caracteres. Al actualizar se preserva el alias existente |
| `perfiles_emision.items[].codigo` | `facturador_perfiles_emision.codigo` | Clave |
| `perfiles_emision.items[].descripcion` | `facturador_perfiles_emision.descripcion` | Crear y actualizar |
| `perfiles_emision.items[]` (tupla) | `actividad_punto_perfiles` | **Un item = un contexto operativo** (RN-06) |
| `timbrados[vigente].numero` | `actividad_punto_perfiles.timbrado` | Crear y actualizar (RN-07) |
| `timbrados[vigente].fecha_inicio` | `actividad_punto_perfiles.timbrado_inicio` | Crear y actualizar |
| — | `actividad_punto_perfiles.documento_nro` | Solo al crear (RN-09) |
| — | `actividad_punto_perfiles.credito_plazo_dias` | `30` solo al crear |
| — | `actividad_punto_perfiles.tipo_transaccion_default` | Nunca se toca (default 2 del modelo) |
| `perfiles_emision.items[].descripcion` | `actividad_punto_perfiles.alias_operativo` | Solo al crear; si falta, usa la descripción de la actividad |

- **RN-06 — Derivación de contextos.** Cada item de `perfiles_emision.items[]` produce un contexto operativo, resolviendo actividad, establecimiento, punto y perfil por sus códigos **dentro del propio archivo**. Si un item referencia un código que el archivo no define, el import bloquea (integridad referencial interna).

- **RN-07 — Elección del timbrado.** El archivo puede traer varios timbrados; el modelo guarda uno por contexto.
  - Exactamente uno con `vigente: true` → se usa para todos los contextos.
  - Ninguno vigente y hay contextos **nuevos** que crear → **bloqueante**: sin timbrado el contexto nunca resolverá y el operador no podrá emitir.
  - Ninguno vigente pero todos los contextos ya existen → advertencia; no se toca el timbrado que ya tienen.
  - Varios vigentes → advertencia + elección determinista (mayor `fecha_inicio` que sea menor o igual a hoy; desempate por mayor `fecha_fin`; luego por `numero`). **La elección se muestra explícitamente en la vista previa** y el operador la confirma al aplicar.
  - El timbrado elegido con `fecha_fin` anterior a hoy → advertencia de timbrado vencido, no bloqueante (el alta es aditiva y el timbrado se corrige después en el panel de contextos).

- **RN-08 — Perfiles de emisión obligatorios.** Cuando el deployment envía el código de perfil a FE (`FE_SEND_EMISSION_PROFILE_CODE=true`, `fiscal-gateway.client.ts:1216`), FE valida ese código en cada emisión. Por lo tanto **está prohibido inventar códigos sintéticos**: si el archivo llega sin `perfiles_emision.items`, el import bloquea y pide una exportación completa a FE. Solo con la variable en `false` se permite generar códigos con la convención histórica (`A<actividad>-E<est>-P<punto>-FE-PTO`) y se avisa.

- **RN-09 — `documento_nro` y autoridad de numeración.** La resolución de contexto exige `documento_nro` no nulo (`context.repository.ts:104-107`), pero cuando la autoridad de numeración es `SERVICE` el número lo asigna FE y el valor local es irrelevante (`FE_SERVICE_NUMBERING=true` hace que el gateway envíe `null`). Regla:
  - Al **crear** un contexto se escribe el valor indicado en la vista previa, precargado en `0000001` y **editable por contexto** (siete dígitos).
  - Al **actualizar** un contexto existente el `documento_nro` **nunca se pisa**: es numeración operativa viva.
  - Si `numeracion.autoridad` es `CLIENT` con `documento_nro_requerido: true`, se emite advertencia fuerte recordando verificar el siguiente número real antes de emitir.

### 6.3 Aditividad e idempotencia

- **RN-10 — Aditivo estricto.** El import solo crea y actualiza. Nunca ejecuta `delete` ni pone `activo = false`. Las entidades que existen en la base y no aparecen en el archivo se listan en la vista previa como "no tocadas" y quedan intactas.
- **RN-11 — Reactivación.** Si una entidad existente está inactiva y el archivo la contiene, el import la reactiva y lo declara explícitamente en el diff.
- **RN-12 — Idempotencia.** Aplicar dos veces el mismo archivo sobre el mismo estado produce el mismo resultado: la segunda corrida reporta todo como "sin cambios" y no genera ninguna escritura de datos operativos.
- **RN-13 — Atomicidad.** La aplicación completa (tenant, suscripción, facturador, establecimientos, puntos, actividades, perfiles y contextos) ocurre en una sola transacción. Si algo falla, no queda nada a medias.
- **RN-14 — Concurrencia.** Dos imports simultáneos del mismo emisor se serializan; el segundo ve el resultado del primero y reporta "sin cambios" en lugar de duplicar o fallar con violación de índice.
- **RN-15 — Vigencia de la vista previa.** El diff mostrado debe corresponder al estado real al momento de aplicar. Si la base cambió entre la vista previa y la confirmación, la aplicación se rechaza y se pide previsualizar de nuevo.

### 6.4 Coherencia con el deployment

- **RN-16 — Ambiente.** Si `emisor.ambiente` o `servicio.ambiente_esperado` no coinciden con el ambiente fiscal del deployment (`FE_API_ENV`), el import **bloquea**. Un facturador de `test` cargado en producción produce rechazos SIFEN en toda emisión y es indistinguible a simple vista. El operador puede forzarlo con una confirmación explícita ("entiendo que estoy importando configuración de *test* en un deployment *prod*"), que queda registrada en la auditoría.
- **RN-17 — Datos sin destino.** Los campos del archivo que no tienen lugar en el modelo del SaaS se informan en la vista previa con su ruta, su valor y el motivo. No se descartan en silencio.

| Ruta del archivo | Motivo |
|---|---|
| `servicio.base_url`, `servicio.base_path` | La conexión fiscal es global del deployment (`FE_API_BASE_URL`) |
| `servicio.aviso`, `contrato.guia_referencia`, `contrato.aviso_vigencia` | Texto informativo |
| `envio.modos_habilitados` | El SaaS usa su propio outbox de emisión |
| `tipos_documento_habilitados` | Informativo (pero ver ADV-07) |
| `numeracion.serie_fiscal`, `rango_min`, `rango_max` | Sin columna en el modelo |
| `actividades_economicas[].es_principal` | Sin columna; solo ordena la lista en la vista previa |
| `perfiles_emision.items[].tipo_documento` | Sin columna; el perfil ya es por punto |
| `consumidor[].permisos`, `consumidor[].alcance` | La API key se administra aparte |

### 6.5 Alta de usuario

- **RN-18 — Configuración operativa en el alta.** El formulario de alta de usuario permite elegir, de forma **opcional**, el facturador y el contexto operativo (que expone establecimiento, punto, perfil de emisión y **código de actividad**). Si se elige, usuario y configuración se crean en la misma transacción. Si no se elige, el comportamiento es idéntico al actual y la asignación puede hacerse después en el detalle del usuario.
- **RN-19 — Un contexto activo por usuario.** Se mantiene la regla vigente del modelo: un usuario tiene como máximo una configuración operativa activa (`usuario_operacion_config_usuario_activa_uidx`).
- **RN-20 — Falla de resolución no crea usuario a medias.** Si el contexto indicado no resuelve (facturador ajeno al tenant, códigos inexistentes, entidad inactiva), la operación completa se revierte y no se crea el usuario.

---

## 7. Entidades afectadas

**Escritas por el import** (todas ya existentes, sin cambios de esquema):

| Tabla | Migración | Acción del import |
|---|---|---|
| `tenants`, `tenant_suscripciones` | `0002` | Crear solo en modo "tenant nuevo" |
| `facturadores` | `0004` | Crear o actualizar (nunca `fe_consumer_api_key`) |
| `facturador_establecimientos` | `0004` | Crear o actualizar |
| `facturador_puntos_expedicion` | `0004` | Crear o actualizar |
| `facturador_actividades` | `0004`, `0013` | Crear o actualizar |
| `facturador_perfiles_emision` | `0004` | Crear o actualizar |
| `actividad_punto_perfiles` | `0004`, `0009`, `0013`, `0030` | Crear o actualizar (respetando RN-09) |

**Escrita por el alta de usuario:** `usuarios`, `usuario_roles`, `usuario_operacion_config` (`0003`, `0004`).

**Tabla nueva:** un registro de auditoría de imports aplicados, con el archivo recibido, la versión de contrato, el usuario que lo aplicó y el resumen de lo que se cambió. Justificación: el re-import puede modificar el timbrado de contextos productivos; sin traza no hay forma de auditar qué archivo produjo qué cambio. El archivo no contiene secretos (la API key no viaja en él).

**No se toca:** `facturas_operativas`, `recibos`, catálogo, clientes, ni ninguna tabla del camino de emisión.

---

## 8. Contratos esperados

### 8.1 Superficie HTTP nueva

Bajo el router de backoffice existente, con el mismo guard de roles internos:

| Endpoint | Propósito |
|---|---|
| `POST /api/v1/backoffice/facturadores/import/preview` | Parsea, valida y mapea el archivo; devuelve el diff completo. **No escribe nada** |
| `POST /api/v1/backoffice/facturadores/import/apply` | Repite el cálculo y persiste en una transacción |

El archivo viaja como **texto dentro de un cuerpo JSON** (`filename`, `format`, `content`), no como multipart: el cliente HTTP del backoffice es JSON-only y el archivo pesa pocos KB. El detalle técnico se define en el PLAN.

`apply` recibe además: la referencia de la vista previa que el operador vio (RN-15), la confirmación de ambiente distinto si corresponde (RN-16) y los `documento_nro` elegidos por contexto (RN-09).

### 8.2 Forma del diff

La respuesta de `preview` describe, por cada entidad, una de tres acciones: **CREAR**, **ACTUALIZAR** o **SIN CAMBIOS** (más **USAR EXISTENTE** para el tenant). Para las de tipo ACTUALIZAR se listan únicamente los campos que cambian, con valor actual y valor nuevo.

Incluye además: datos del contrato y del archivo, resumen numérico (cuántas se crean, actualizan, quedan igual y cuántas quedan sin tocar), listas separadas de **bloqueantes**, **advertencias** e **ignorados**, las `referencia` del archivo por ruta, el timbrado elegido con su justificación, y por cada contexto nuevo el `documento_nro` sugerido y editable; por cada contexto existente, cuántos usuarios operativos lo tienen asignado.

La respuesta de `apply` es el mismo objeto más el resultado de la aplicación (identificadores creados, recuento de cambios) y los próximos pasos sugeridos (cargar la API key, crear el usuario operativo).

### 8.3 Política de respuesta

- La vista previa responde **éxito aun cuando haya bloqueantes**, marcando que no se puede aplicar. El objetivo es que el operador vea el informe completo de una sola vez, no que descubra los problemas de a uno.
- Solo se responde error de validación cuando el archivo no se puede parsear o no cumple el esquema del contrato.
- La aplicación se rechaza si el recálculo en el servidor encuentra bloqueantes, o si la vista previa quedó desactualizada.

### 8.4 Cambio en el contrato de alta de usuario

El cuerpo de creación de usuario acepta un bloque opcional de configuración operativa con la misma forma que el endpoint de asignación ya existente, **menos el tenant**, que se deriva del usuario que se está creando.

`spec/openapi.yaml` se actualiza con ambos endpoints nuevos y con el contrato de alta de usuario. Se aprovecha para corregir una deuda documental detectada: el esquema documentado de creación de usuario no declara `tenant_id` ni `email`, que la API sí exige.

---

## 9. Catálogo de hallazgos

Todo hallazgo tiene un código estable, un nivel, un mensaje en español orientado a la acción, y la ruta del archivo que lo originó.

### 9.1 Bloqueantes

| Código | Condición |
|---|---|
| `ARCHIVO_INVALIDO` | El JSON/YAML no parsea o no cumple el esquema del contrato |
| `CONTRATO_VERSION_NO_SOPORTADA` | `contrato.version` distinta de `v0.1` |
| `EMISOR_ID_INVALIDO` | `emisor_id` sin forma de RUC con dígito verificador |
| `CAMPO_OBLIGATORIO_VACIO` | Un campo que el modelo exige llega en `null` o ausente (FE lo permite: §5.3). Se reporta con su ruta, no como error de esquema |
| `CODIGO_INVALIDO` | Código de establecimiento o punto que no son tres dígitos (violaría los CHECK del modelo) |
| `REFERENCIA_INTERNA_ROTA` | Un perfil apunta a una actividad, establecimiento o punto que el propio archivo no define |
| `CODIGO_DUPLICADO` | Dos entidades del mismo tipo con el mismo código |
| `CONTEXTO_DUPLICADO` | Dos perfiles producen la misma tupla actividad/establecimiento/punto/perfil |
| `SIN_CONTEXTOS` | Sin `perfiles_emision.items` y el deployment envía el código de perfil a FE (RN-08) |
| `TIMBRADO_VIGENTE_AUSENTE` | Ningún timbrado vigente y hay contextos nuevos que crear (RN-07) |
| `FACTURADOR_EN_OTRO_TENANT` | El `emisor_id` ya existe en otro tenant (RN-02) |
| `TENANT_SLUG_EXISTENTE` | Modo "tenant nuevo" con un slug ya usado |
| `AMBIENTE_DISTINTO` | Ambiente del archivo distinto al del deployment; salvable con confirmación explícita (RN-16) |

### 9.2 Advertencias

| Código | Condición |
|---|---|
| `URL_NO_VERIFICADA` | El archivo declara `url_verificada: false` |
| `BASE_URL_DISTINTA` | La URL del archivo no coincide con la del deployment |
| `TIMBRADO_VENCIDO` | El timbrado elegido tiene `fecha_fin` anterior a hoy |
| `TIMBRADO_VIGENTE_MULTIPLE` | Varios timbrados vigentes; se informa cuál se eligió y por qué |
| `CONTRATO_ANTIGUO` | `generado_en` con más de 30 días |
| `PERMISOS_CONSUMIDOR_INCOMPLETOS` | Ningún consumidor con los permisos mínimos (`FACTURA_EMIT`, `DOCUMENTO_READ`, `SIFEN_STATUS_READ`) o sin alcance activo para el emisor y ambiente |
| `TIPO_DOCUMENTO_FE_AUSENTE` | `tipos_documento_habilitados` sin `FE` |
| `NUMERACION_CLIENT` | Autoridad `CLIENT` con número requerido: verificar el siguiente número real antes de emitir |
| `RUC_DISTINTO` | El facturador existente tiene un RUC distinto al `emisor_id` del archivo |
| `REACTIVACION` | El import reactiva una entidad que estaba inactiva |
| `API_KEY_AUSENTE` | El facturador no tiene API key FE cargada |
| `ENTIDADES_HUERFANAS` | Hay entidades en la base que el archivo no contiene; se listan y no se tocan |
| `CONTEXTO_EN_USO` | Un contexto cuyo timbrado se va a actualizar tiene usuarios operativos asignados |

### 9.3 Ignorados

Los definidos en RN-17: no son problemas, son datos del archivo sin destino en este modelo. Se muestran agrupados y colapsados.

---

## 10. Casos felices

### Caso A — Alta de un facturador nuevo

1. Soporte entra a la vista de importación y sube `configuracion-5057016-1-2026-09-19.yaml`.
2. Elige "crear tenant nuevo"; el formulario propone nombre y slug derivados de la razón social, que ajusta.
3. La vista previa muestra: tenant CREAR, facturador CREAR, 1 establecimiento CREAR, 2 puntos CREAR, 2 actividades CREAR, 2 perfiles CREAR, 2 contextos CREAR con timbrado `18861677` (inicio 2026-05-19) y `documento_nro` `0000001` editable en cada uno. Advertencias: `URL_NO_VERIFICADA` y `API_KEY_AUSENTE`. Ignorados: 8 rutas, colapsadas.
4. Confirma. Todo se aplica en una transacción y el resultado enlaza al detalle del facturador y al alta de usuario, recordando cargar la API key.
5. Verificación: el facturador tiene sus dos contextos completos y el readiness solo marca pendiente la API key.

### Caso B — Re-import tras cambio de timbrado en FE

1. Soporte sube la nueva exportación del mismo emisor.
2. La vista previa muestra todo SIN CAMBIOS salvo los dos contextos en ACTUALIZAR, con `timbrado` y `timbrado_inicio` viejo → nuevo, marcando que el `documento_nro` se preserva y que uno de los contextos tiene un usuario asignado (`CONTEXTO_EN_USO`).
3. Confirma; solo se actualizan esos dos campos. Ninguna otra fila se toca.

### Caso C — Re-import idéntico

Se sube el mismo archivo ya aplicado: la vista previa reporta todo SIN CAMBIOS y el resumen indica cero creaciones y cero actualizaciones (RN-12).

### Caso D — Alta de usuario operativo con facturador y perfil

1. Soporte crea el usuario eligiendo tenant, username, email, nombre visible y rol.
2. En el mismo formulario, en el bloque de configuración operativa, elige el facturador importado y luego el contexto, cuyo rótulo muestra el código de actividad, el establecimiento, el punto y el perfil de emisión.
3. Al guardar, usuario, rol y configuración operativa quedan creados en una sola transacción, y la pantalla muestra la contraseña temporal una única vez.
4. Verificación: ese usuario, al entrar a la app operativa, resuelve contexto y puede emitir sin pasos adicionales.

### Caso E — Paridad JSON/YAML

Subir el `.json` y el `.yaml` de la misma exportación produce diffs idénticos salvo el nombre y el formato del archivo.

---

## 11. Errores relevantes

| Situación | Comportamiento esperado |
|---|---|
| Archivo que no es JSON ni YAML válido | Error de validación con el formato detectado y, en YAML, la línea del problema |
| Archivo válido pero de otro contrato (versión desconocida) | Bloqueante `CONTRATO_VERSION_NO_SOPORTADA`; no se intenta adivinar el mapeo |
| Archivo demasiado grande | Error explícito de tamaño, no un error genérico del servidor |
| Confirmación de un diff que ya no corresponde al estado actual | Rechazo con indicación de volver a previsualizar (RN-15) |
| Confirmación con bloqueantes presentes | Rechazo, aun si el cliente intentara saltarse la vista previa |
| Dos imports simultáneos del mismo emisor | El segundo espera y reporta "sin cambios" (RN-14) |
| Falla a mitad de la aplicación | Nada queda persistido (RN-13) |
| Alta de usuario con contexto que no resuelve | No se crea el usuario; error de validación explicando qué no resolvió (RN-20) |
| Facturador sin API key tras el import | No es error: advertencia con el próximo paso |

---

## 12. Criterios de aceptación

**Del import**

1. Subir el archivo de referencia (`.json` o `.yaml`) sobre una base sin ese emisor crea tenant, suscripción, facturador, 1 establecimiento, 2 puntos, 2 actividades, 2 perfiles y 2 contextos completos, en una sola transacción.
2. Los contextos creados quedan con timbrado, `timbrado_inicio`, `documento_nro` y `credito_plazo_dias` tales que la resolución de contexto operativo devuelve resultado sin tocar ninguna otra pantalla.
3. El mismo archivo en `.json` y en `.yaml` produce diffs idénticos.
4. Re-aplicar el mismo archivo reporta todo "sin cambios" y no modifica ninguna fila operativa.
5. Un re-import con timbrado nuevo actualiza solo `timbrado` y `timbrado_inicio`, y deja `documento_nro` intacto.
6. Ninguna corrida del import ejecuta `delete` ni desactiva entidades; las entidades ausentes del archivo se listan y quedan intactas.
7. Cada código del catálogo de hallazgos (§9) se dispara en su caso correspondiente y se muestra en la vista previa con su ruta.
8. Con bloqueantes presentes, la confirmación está deshabilitada en la UI y además rechazada por el servidor.
9. Un archivo de ambiente distinto al del deployment no se puede aplicar sin la confirmación explícita, y esa confirmación queda registrada.
10. Cada aplicación deja un registro de auditoría con archivo, versión de contrato, usuario y resumen.
11. Dos imports simultáneos del mismo emisor no producen duplicados ni violaciones de índice único.

**Del alta de usuario**

12. Crear un usuario sin configuración operativa se comporta exactamente como antes del cambio (retrocompatible).
13. Crear un usuario con facturador y contexto deja ambos creados en una sola transacción y el usuario resuelve contexto en su primer ingreso.
14. Si el contexto no resuelve, no se crea el usuario.

**Transversales**

15. `spec/openapi.yaml` documenta los dos endpoints nuevos y el contrato actualizado de alta de usuario.
16. Validación visual con Playwright en un viewport mobile y uno desktop, cubriendo: vista previa correcta, vista previa con advertencias, vista previa con bloqueante, aplicación exitosa y alta de usuario con contexto.
17. `npm run test`, `npm run typecheck`, `npm run lint` y `npm run build` en verde; validación end-to-end contra el stack levantado con `bash scripts/deploy.sh`.
18. El alta por formularios entidad por entidad y los scripts SQL siguen funcionando sin cambios de comportamiento.

---

## 13. Fuera de alcance y evolución futura

- **Sincronización directa con FE.** El archivo lo produce `GET /admin/emisores/:id/configuracion/export-consumidor` (§5.3), que ya está implementado y en uso. La v0.2 natural es reemplazar "subir archivo" por "traer la configuración del emisor", reutilizando sin cambios el mapeo, el diff y la aplicación definidos acá. Este SPEC exige que el parseo y el mapeo queden desacoplados del transporte justamente para dejar ese camino abierto.
- **Configuración fiscal por facturador** (URL, ambiente, numeración por servicio, envío del código de perfil): hoy son variables de entorno del deployment. Moverlas a la base es un cambio de alcance propio, no de este SPEC.
- **Administración de la API key desde el import**, incluyendo la creación de la clave del consumidor en FE.
- **Import masivo** de varios emisores en una sola operación.
- **Reconciliación bidireccional**: detectar que la base se apartó de FE y proponer correcciones sin archivo de por medio.
