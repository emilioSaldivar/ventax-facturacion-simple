# SPEC Segmentación por Perfil de Emisión, Atribución de Usuario y Rol de Consulta v0.1

**Versión:** 0.1
**Fecha:** 2026-09-19
**Estado:** DRAFT — pendiente PLAN/TASKS

## Alineación

- `docs/SPEC_IMPORT_CONFIG_FACTURADOR_v0.1.md` (el import crea los perfiles de emisión y el alta de usuario los asigna; este SPEC define qué significa operativamente esa asignación)
- `docs/SPEC_IDENTIDAD_OPERATIVA_FACTURADOR_v0.1.md` (alias operativo por actividad y por contexto)
- `docs/SPEC_AGENDAS_CLIENTES_CATALOGO_v0.1.md` (modelo actual del catálogo, scopeado por facturador)
- `docs/SPEC_RECIBO_DINERO_v0.5.md`, `docs/SPEC_PRESUPUESTOS_v0.2.md`
- `docs/SPEC_BACKOFFICE_ALINEACION_FE_v0.2.md` (precedente de bloque F0: bugs de precondición que el diseño nuevo pisaría)
- Código: `apps/api/src/modules/{catalogo,facturas,recibos,notas,context,auth}/*`, `apps/web-operacion/src/main.tsx`
- Migraciones: `0003_auth.sql`, `0004_operational_context.sql`, `0006_catalogo.sql`, `0007_facturacion_operativa.sql`, `0022_notas_comerciales.sql`, `0023_recibos_dinero.sql`

**Principio rector:** aditivo y reversible. Ninguna columna nueva es obligatoria para los datos existentes, ningún documento histórico se oculta por falta de dato, el comportamiento actual se conserva íntegro para los facturadores con un solo perfil de emisión, y **el camino de emisión no se modifica**.

---

## 0. F0 — Precondición: autorización por lista blanca

Debe resolverse **antes** de introducir el rol de consulta (§6.5), porque el diseño nuevo lo pisaría.

Hoy el sistema decide "este usuario es soporte interno" **por descarte**, con la forma `role !== "OPERADOR_FACTURACION"`, en seis lugares:

| Ubicación | Qué habilita |
|---|---|
| `facturas.service.ts:400` | Historial fiscal avanzado del documento |
| `facturas.service.ts:438` | Autogestión avanzada (decisión fiscal) |
| `facturas.service.ts:524` | Reconciliación contra el registro fiscal de FE |
| `facturas.service.ts:572` (`assertInternalSupportRole`) | Helper genérico usado por acciones avanzadas |
| `apps/web-operacion/src/main.tsx:1778` (`isInternalSupport`) | Acciones avanzadas en el listado |
| `apps/web-operacion/src/main.tsx:2311` | Panel "Gestión de documentos" |

Cualquier rol nuevo que se agregue queda automáticamente del lado de "soporte interno" y hereda esos permisos. Un rol pensado para **solo lectura** entraría con más capacidades que un operador de facturación.

**Regla:** ninguna capacidad se otorga por descarte de rol. Los seis puntos pasan a lista blanca explícita de los roles que sí deben tener acceso (`SOPORTE_INTERNO`, `ADMIN_INTERNO`). Es un cambio de comportamiento nulo para los roles actuales y condición necesaria para todo lo que sigue.

Además, `roles.codigo` tiene un CHECK con los tres códigos hardcodeados (`0003_auth.sql:11`), por lo que incorporar un rol requiere migración de la restricción y del seed.

---

## 1. Objetivo

Tres cosas, en el mismo modelo:

1. Que un facturador con **varios perfiles de emisión** opere como si fueran unidades de negocio separadas: catálogo propio, documentos propios y visibilidad acotada al perfil asignado.
2. Que quede **registrado y visible quién emitió cada documento**.
3. Que exista un **usuario de consulta** por facturador que vea **todos** los documentos de **todos** los perfiles, sin poder emitir ni modificar nada, como base para la reportería de ventas que se especificará más adelante.

---

## 2. Contexto y motivación

### 2.1 El multi-perfil ya está en producción

`actividad_punto_perfiles` (`0004_operational_context.sql:88-104`) admite tantos contextos por facturador como combinaciones de actividad × establecimiento × punto × perfil existan. No es un caso hipotético: el emisor `5057016-1` tiene hoy **dos perfiles activos**, uno de chapería y pintura en el punto 001 y otro de servicios personales en el punto 002, cada uno con su propia actividad económica SIFEN.

`usuario_operacion_config` (`0004:106-122`) ya asigna **un contexto activo por usuario** (índice único parcial `usuario_operacion_config_usuario_activa_uidx`), y `context.repository.ts:43-130` lo resuelve completo en **cada request**, incluyendo `actividad_punto_perfil_id`.

Es decir: la infraestructura de segmentación existe y se resuelve en cada llamada. Lo que falta es que los **datos operativos la usen**.

### 2.2 Qué pasa hoy (estado verificado 2026-09-19)

**Catálogo — sin segmentación.** `catalogo_items` (`0006_catalogo.sql`) se scopea por `facturador_id`, con índice único `(facturador_id, codigo_normalizado)`. No tiene ninguna columna de perfil ni de actividad. `listCatalogoItems` (`catalogo.service.ts:31-33`) recibe el contexto operativo completo pero solo usa `context.facturador.id`. Resultado: el operador de chapería ve y puede facturar los ítems de servicios personales.

**Facturas — sin segmentación.** `buildListWhere` (`facturas.repository.ts:1497-1499`) arma su cláusula con `facturador_id = $1` y `deleted_at is null`, más los filtros de tipo, estado, fecha y búsqueda. No hay filtro por contexto ni por usuario. Resultado: cualquier operador del facturador ve todas las facturas de todos los perfiles y de todos los operadores.

**Atribución en facturas — el dato existe, no se muestra.** `facturas_operativas.usuario_id` es `not null` (`0007:5`), así que **toda fila lo tiene por definición**: lo escriben los tres `insert into facturas_operativas` del repositorio (`facturas.repository.ts:316, 488, 648`). Las otras seis apariciones de `usuario_id` en ese archivo son `insert into audit_events`, otra tabla. Pero **ninguna consulta de lectura lo selecciona** y `DocumentoResponse` (`facturas.types.ts:109-140`) no tiene el campo. Es un gap exclusivamente de exposición: **el histórico completo está intacto y no requiere backfill** para empezar a mostrarse.

**Qué perfil se usó — no está como dato.** `facturas_operativas` no guarda `actividad_punto_perfil_id`. La información está dentro de `fiscal_request_snapshot` (jsonb), como establecimiento, punto y código de perfil, pero no es una columna consultable ni indexable.

**Recibos y presupuestos — peor: sin atribución alguna.** `recibos_dinero` (`0023`) y `notas_comerciales` (`0022`, presupuestos y pedidos) **no tienen `usuario_id`**. No hay forma de saber quién creó un recibo o un presupuesto, ni siquiera consultando la base. Tampoco tienen perfil.

**Vista global — no existe para el cliente.** El backoffice no tiene pantallas de documentos (fuera de alcance de `SPEC_BACKOFFICE_ADMIN_v0.1`), y el operador ve lo de su facturador sin distinción de perfil. Cuando la segmentación entre en vigencia, el dueño del contribuyente se quedaría sin ninguna pantalla que muestre sus dos unidades de negocio juntas. De ahí el rol de consulta de §6.5.

### 2.3 Consecuencias operativas

1. Un operador puede facturar con ítems que no corresponden a su actividad económica, lo que produce facturas fiscalmente incoherentes (actividad declarada vs. concepto facturado).
2. No hay privacidad ni foco entre unidades de negocio del mismo contribuyente.
3. Ante una factura con problema, no se puede identificar al responsable sin entrar a la base.
4. En recibos y presupuestos, la responsabilidad es directamente irrecuperable hacia atrás.
5. El dueño del facturador no tiene forma de ver su operación completa ni de pedir un reporte de ventas.

---

## 3. Alcance

### Incluido

- **F0 — Autorización por lista blanca** (§0), precondición del resto.
- **Catálogo**: perfil de emisión opcional por ítem; los ítems sin perfil quedan compartidos por todo el facturador.
- **Facturas y notas de crédito**: registro del perfil de emisión usado y visibilidad acotada al perfil del operador; exposición del usuario emisor.
- **Recibos de dinero**: registro del perfil y del usuario que lo emitió, con backfill del histórico; visibilidad acotada al perfil.
- **Presupuestos y pedidos** (`notas_comerciales`): ídem recibos.
- **Rol de consulta por facturador**: acceso de solo lectura a todos los documentos y a todo el catálogo del facturador, de todos los perfiles, sin capacidad de emisión ni de edición.
- Migración de datos históricos con reglas explícitas y sin ocultar documentos.
- Exposición en la UI operativa: quién emitió cada documento y a qué perfil pertenece.

### Excluido

- **Los reportes de ventas propiamente dichos.** Este SPEC habilita el acceso y la superficie de lectura; el contenido, los agrupamientos y los formatos del reporte se especifican aparte, más adelante.
- **Agenda de clientes** (`facturador_clientes`): sigue siendo compartida por todo el facturador. La cartera de clientes es del contribuyente, no de la unidad de negocio.
- **Numeración segregada por perfil** de recibos y presupuestos: se mantiene una única serie por facturador (ver RN-14 y §12).
- **Selección de perfil de emisión desde la pantalla**: el perfil sigue derivándose de la configuración operativa del usuario, nunca se elige al emitir. El rol de consulta no emite, así que no introduce esa necesidad (RN-18).
- **Capacidades de escritura para el rol de consulta**: no emite, no anula, no crea recibos ni presupuestos, no edita catálogo ni clientes.
- Cambios en el catálogo fiscal, en el cálculo de impuestos o en el camino de emisión hacia `facturacion-electronica`.
- Reasignación masiva de documentos históricos entre perfiles desde la UI.
- Segmentación de la configuración del facturador (logo, rubro, datos de contacto): sigue siendo por facturador.

---

## 4. Actores

| Actor | Rol | Efecto del cambio |
|---|---|---|
| Operador de facturación | `OPERADOR_FACTURACION` | Ve y opera únicamente el perfil que tiene asignado; ve quién emitió cada documento de su perfil |
| Usuario de consulta del facturador | **Rol nuevo** | Ve todos los documentos y todo el catálogo del facturador, de todos los perfiles, en modo lectura. No emite ni modifica nada |
| Soporte / Admin interno | `SOPORTE_INTERNO`, `ADMIN_INTERNO` | Asigna perfil a los operadores y da de alta usuarios de consulta desde el backoffice; conserva sus capacidades actuales, ahora otorgadas por lista blanca (F0) |

**Nombre del rol.** Debe evitar la colisión conceptual con "perfil de emisión", que es un concepto fiscal. El rol se denomina de consulta (por ejemplo `CONSULTA_FACTURADOR`) y en la interfaz se presenta como "Consulta y reportes". No se lo llama "perfil" en ninguna pantalla.

---

## 5. Modelo conceptual

El **contexto operativo** (`actividad_punto_perfiles`) pasa de ser solamente la fuente de los datos fiscales de la emisión a ser además la **unidad de segmentación** de los datos operativos.

```
facturador
 ├── contexto operativo A (perfil de emisión + actividad + establecimiento + punto)
 │    ├── ítems de catálogo propios      (o compartidos a nivel facturador)
 │    ├── facturas y notas de crédito
 │    ├── recibos de dinero
 │    └── presupuestos y pedidos
 ├── contexto operativo B
 │    └── (ídem, aislado de A)
 └── usuario de consulta  ──lee──▶  A + B + lo que no tenga perfil
```

Dos formas de asignar un usuario a un facturador, mutuamente excluyentes:

- **Operativa**: facturador **y** contexto operativo. Habilita emisión, acotada a ese contexto. Es la que existe hoy.
- **De consulta**: facturador **sin** contexto operativo. Habilita solo lectura, sobre todos los contextos.

---

## 6. Reglas de negocio

### 6.1 Catálogo

- **RN-01 — Perfil opcional.** Un ítem de catálogo puede tener un perfil de emisión o no tenerlo. Sin perfil significa **compartido**: visible y usable por todos los operadores del facturador.
- **RN-02 — Visibilidad.** Un operador ve los ítems de su perfil más los compartidos. Nunca ve los ítems de otro perfil.
- **RN-03 — Los ítems existentes quedan compartidos.** La migración no asigna perfil a ningún ítem actual: todos pasan a ser compartidos, con lo cual **ningún operador pierde acceso a lo que ya usaba**. La separación se construye desde ahí, ítem por ítem, sin big bang.
- **RN-04 — Ítems nuevos nacen en el perfil de quien los crea.** Cuando un operador crea un ítem, queda en su perfil. Puede marcarlo explícitamente como compartido al crearlo o editarlo. Si el facturador tiene un solo contexto, la distinción es invisible y el comportamiento es idéntico al actual.
- **RN-05 — Código único por facturador.** Se conserva la unicidad actual `(facturador, código)`: dos perfiles no pueden usar el mismo código para ítems distintos. Motivo: el selector del operador mezcla compartidos y propios, y dos códigos iguales en la misma lista son una fuente de error de facturación. El código es el identificador interno del contribuyente, no del perfil.
- **RN-06 — Edición y baja.** Un operador solo puede editar o dar de baja ítems de su perfil. Los compartidos se editan desde cualquier perfil del facturador, porque pertenecen al facturador; toda edición queda atribuida en `updated_by`, que ya existe.

### 6.2 Documentos (facturas, notas de crédito, recibos, presupuestos y pedidos)

- **RN-07 — Perfil de emisión registrado.** Todo documento nuevo registra el contexto operativo con el que se creó, tomado del contexto ya resuelto en el request. No se le pide nada adicional al operador.
- **RN-08 — Visibilidad acotada.** El operador ve únicamente los documentos de su perfil. Esto incluye listados, búsquedas, filtros, totales y cualquier selector que liste documentos (por ejemplo, elegir la factura a la que se imputa un recibo, o el presupuesto que se convierte en factura).
- **RN-09 — Documentos históricos sin perfil.** Los documentos que la migración no pueda atribuir a un perfil con certeza quedan **sin perfil** y siguen siendo **visibles para todos los operadores del facturador**, marcados como tales. Es deliberado: es preferible mostrar de más que ocultar historia del contribuyente por una inferencia dudosa.
- **RN-10 — Coherencia en la emisión.** Una factura solo puede incluir ítems del perfil del operador o compartidos. Un recibo solo puede imputarse a una factura visible para ese operador. Un presupuesto solo se convierte en factura dentro del mismo perfil.
- **RN-11 — Cambio de perfil de un usuario.** Si soporte reasigna a un operador de un perfil a otro, el operador pasa a ver los documentos y el catálogo del perfil nuevo y deja de ver los del anterior. Los documentos ya emitidos **no se reasignan**: siguen perteneciendo al perfil con el que se emitieron. Es la consecuencia esperada de la segmentación.
- **RN-12 — Facturador con un solo perfil.** El comportamiento es exactamente el actual. La segmentación solo se nota cuando hay más de un contexto.

### 6.3 Atribución de usuario

- **RN-13 — Quién emitió.** Todo documento registra el usuario que lo creó y lo expone en el detalle y en el listado.
  - **Facturas y notas de crédito**: el dato ya existe y está completo desde el primer documento emitido. Solo hay que exponerlo. **Sin backfill.**
  - **Recibos y presupuestos/pedidos**: se agrega el dato. Para los documentos ya emitidos se atribuye al **operador más antiguo del facturador**, definido de forma determinista como el usuario activo con configuración operativa para ese facturador cuya configuración sea la más antigua. Si un facturador no tiene ningún operador, sus documentos quedan sin atribución.
  - La atribución retroactiva se marca como tal, para no presentarla como un dato cierto: la UI la muestra como atribución histórica, no como autoría verificada.

### 6.4 Numeración

- **RN-14 — Una sola serie por facturador.** Recibos y presupuestos mantienen su numeración correlativa por facturador (`recibos_dinero_numeracion`, `notas_comerciales_numeracion`). No se segrega por perfil.
  **Consecuencia aceptada:** un operador que ve solo su perfil verá su serie con huecos (por ejemplo recibos 1, 4 y 9, porque 2, 3 y 5 son del otro perfil). Es visible en pantalla y debe estar contemplado en la ayuda al operador. La alternativa —una serie por perfil— quedó descartada para no arriesgar colisiones de número entre perfiles del mismo facturador. El usuario de consulta, que ve todos los perfiles, ve la serie completa y sin huecos.
- La numeración fiscal de facturas no se toca: la asigna `facturacion-electronica` por timbrado, establecimiento y punto de expedición, que ya son distintos entre perfiles.

### 6.5 Rol de consulta y reportería

- **RN-15 — Asignación sin perfil.** Un usuario de consulta se asigna a **un** facturador y **no** se le asigna contexto operativo. La ausencia de contexto es lo que lo define: sin contexto no hay datos fiscales y, por lo tanto, no hay emisión posible.
- **RN-16 — Alcance de lectura.** Ve, de ese facturador y de **todos** sus perfiles: facturas, notas de crédito, recibos de dinero, presupuestos y pedidos, y el catálogo completo. Incluye los documentos e ítems sin perfil. Cada documento muestra a qué perfil pertenece y quién lo emitió.
- **RN-17 — Solo lectura, sin excepciones.** No puede emitir, anular, crear notas de crédito, crear ni imputar recibos, crear ni convertir presupuestos, ni crear, editar o dar de baja ítems de catálogo o clientes. Tampoco accede a la autogestión fiscal avanzada, que queda reservada a soporte interno por lista blanca (F0).
- **RN-18 — Nunca elige perfil.** El usuario de consulta no tiene "perfil activo" ni selector de perfil en ninguna pantalla. La noción de perfil aparece solamente como un dato de cada documento y como filtro de lectura. Esto es deliberado: introducir selección de perfil complicaría la emisión, que es justamente lo que este rol evita tocar.
- **RN-19 — Un facturador, el suyo.** El usuario de consulta ve un único facturador, dentro de su propio tenant. No hay consulta multi-facturador ni multi-tenant.
- **RN-20 — Camino de lectura propio.** El acceso de consulta no atraviesa la resolución de contexto operativo fiscal. Consecuencia buscada: **el camino de emisión no se modifica en absoluto** para habilitar este rol, y un error en la reportería no puede degradar la facturación.
- **RN-21 — Base para reportes.** La superficie de lectura queda preparada para colgar de ella el reporte de ventas, que se especifica más adelante. En esta versión no se entrega ningún reporte agregado: solo el acceso y los listados.
- **RN-22 — Exclusión mutua.** Un mismo usuario es operador o es de consulta, nunca ambos. Cambiar a un usuario de un modo al otro es una operación explícita de soporte.

---

## 7. Entidades afectadas

| Tabla | Cambio | Backfill |
|---|---|---|
| `roles` | Incorporar el código del rol de consulta (restricción y seed) | Ninguno |
| `usuario_operacion_config` | Admitir la asignación a facturador **sin** contexto operativo, para el rol de consulta. El modelado físico (columna opcional o vínculo propio) se define en el PLAN | Ninguno: las asignaciones existentes no cambian |
| `catalogo_items` | Perfil de emisión opcional | Ninguno: todos los ítems quedan compartidos (RN-03) |
| `facturas_operativas` | Perfil de emisión opcional | Best-effort desde `fiscal_request_snapshot`, que ya contiene establecimiento, punto y código de perfil de cada emisión. Lo que no resuelva queda sin perfil (RN-09) |
| `recibos_dinero` | Perfil opcional + usuario que lo emitió | Usuario: operador más antiguo del facturador (RN-13). Perfil: solo si el facturador tiene un único contexto; si tiene varios, queda sin perfil |
| `notas_comerciales` | Perfil opcional + usuario que lo creó | Ídem recibos |

**Sin cambios:** `facturador_clientes` y `cliente_identidades` (fuera de alcance), `factura_items_snapshot`, `actividad_punto_perfiles`, y todas las tablas de configuración del facturador.

**Índices:** cada tabla segmentada necesita un índice que soporte el filtro combinado por facturador y perfil, alineado con los índices parciales que ya existen (`facturas_operativas_facturador_created_idx`, `catalogo_items_facturador_idx`, `recibos_dinero_facturador_idx`, `notas_comerciales_facturador_idx`). El rol de consulta lee por facturador, que ya está indexado.

---

## 8. Contratos esperados

### 8.1 Para el operador — sin endpoints nuevos

Los existentes cambian de dos formas:

1. **Alcance de las lecturas**: todos los listados y búsquedas de catálogo, facturas, recibos y presupuestos pasan a estar acotados por el contexto operativo del usuario, además del facturador. El cliente no envía nada nuevo: el contexto ya se resuelve en el servidor a partir del token.
2. **Datos expuestos**: las respuestas de documentos incorporan el usuario emisor (identificador y nombre visible) y el perfil de emisión al que pertenece el documento, con una marca cuando el documento no tiene perfil (histórico) o cuando la atribución de usuario es retroactiva.

El catálogo incorpora en su representación si el ítem es compartido o propio del perfil, y acepta esa marca al crear y editar.

### 8.2 Para el usuario de consulta — superficie de lectura propia

Un conjunto de endpoints de consulta, todos de lectura, que resuelven el facturador a partir del usuario sin pasar por el contexto operativo fiscal:

- El **contexto de consulta**: identidad del usuario, facturador al que accede y lista de perfiles de emisión de ese facturador (para usarlos como filtro).
- **Listado y detalle** de facturas y notas de crédito, recibos, presupuestos y pedidos, y catálogo, siempre de todos los perfiles, con filtro opcional por perfil y por usuario emisor, además de los filtros que ya existen (tipo, estado, fechas, búsqueda).

Estos endpoints reutilizan los mismos filtros, paginación y representaciones que los operativos; lo que cambia es la resolución del alcance. No aceptan ningún verbo de escritura.

La app operativa detecta el rol al iniciar sesión y presenta una navegación recortada: documentos y catálogo en modo lectura, sin emisión, sin cobros y sin acciones de gestión.

### 8.3 Compatibilidad

- Los campos nuevos son **aditivos** en las respuestas: ningún consumidor existente se rompe.
- Para un facturador con un solo perfil, las respuestas al operador son funcionalmente equivalentes a las actuales.
- No hay cambios en los cuerpos de creación de documentos: el perfil se deriva del contexto, nunca se envía desde el cliente (enviarlo permitiría a un operador emitir en un perfil ajeno).
- `spec/openapi.yaml` se actualiza con los esquemas de respuesta ampliados, la superficie de consulta y la documentación del alcance de cada listado.

---

## 9. Casos felices

### Caso A — Dos perfiles, dos catálogos

El facturador `5057016-1` tiene los perfiles de chapería (punto 001) y servicios personales (punto 002). Ana está asignada a chapería y Bruno a servicios personales. Ana crea el ítem "Pintura de guardabarros": queda en su perfil. Bruno no lo ve ni lo puede facturar. El ítem "Traslado" lo marcan como compartido: ambos lo ven.

### Caso B — Facturas aisladas por perfil

Ana emite tres facturas y Bruno dos. En la pantalla de documentos, Ana ve solo sus tres; Bruno solo sus dos. Si mañana entra Carla al perfil de chapería, ve las tres facturas de ese perfil, cada una con el nombre de quien la emitió.

### Caso C — Quién emitió, sobre el histórico

Al desplegar, las facturas ya emitidas muestran inmediatamente el operador que las emitió, sin migración de datos, porque el dato siempre se guardó.

### Caso D — Recibos históricos

Los recibos previos a la migración quedan atribuidos al operador más antiguo del facturador, marcados como atribución histórica, y visibles para todos los operadores de ese facturador si no se pudo determinar su perfil.

### Caso E — Facturador de un solo perfil

Un facturador con un único contexto operativo no nota ningún cambio: su catálogo es el de siempre, sus documentos se ven completos, y solo gana la columna de quién emitió.

### Caso F — El dueño mira toda su operación

Emilio, dueño del contribuyente, entra con su usuario de consulta por el mismo login de siempre. Ve una app recortada: el listado completo de documentos de los dos perfiles, cada uno indicando perfil y operador, con filtros por perfil, por operador, por estado y por fecha; y el catálogo completo en modo lectura. No tiene botón de emitir, ni de cobrar, ni de editar. Los recibos se ven con su numeración completa y sin huecos.

---

## 10. Errores y bordes relevantes

| Situación | Comportamiento esperado |
|---|---|
| Operador intenta facturar un ítem de otro perfil | Rechazo con mensaje claro; el ítem no debería ser alcanzable desde su selector |
| Operador intenta abrir por URL directa un documento de otro perfil | Tratado como inexistente, igual que hoy se trata un documento de otro facturador |
| Recibo que se quiere imputar a una factura de otro perfil | La factura no aparece en el selector; si se fuerza, se rechaza |
| Documento histórico sin perfil | Visible para todos los operadores del facturador, marcado como sin perfil; nunca se oculta |
| Usuario sin configuración operativa activa | Comportamiento actual sin cambios: 409, no puede operar |
| Facturador sin operadores al momento del backfill | Sus recibos y presupuestos quedan sin atribución, explícitamente marcados |
| Soporte reasigna el perfil de un operador | El operador cambia de universo visible; los documentos ya emitidos no se mueven (RN-11) |
| Ítem compartido que se quiere volver exclusivo de un perfil | Permitido; deja de verse desde los demás perfiles, sin afectar las facturas ya emitidas que lo usaron (los ítems de factura son snapshots) |
| Usuario de consulta intenta cualquier escritura, por UI o por llamada directa | Rechazo por autorización, no por ausencia de datos: la negativa es explícita y no depende de que la pantalla esconda el botón |
| Usuario de consulta intenta acceder a autogestión fiscal avanzada | Rechazo: esas capacidades son de soporte interno por lista blanca (F0) |
| Usuario de consulta sin facturador asignado | Mensaje explícito de cuenta sin facturador asignado, sin exponer datos de otros |
| Usuario con rol de consulta que además tuviera contexto operativo | Situación imposible por RN-22; si apareciera por datos inconsistentes, prevalece el modo consulta (el más restrictivo) |

---

## 11. Criterios de aceptación

**Precondición**

1. Ninguna capacidad se otorga por descarte de rol: los seis puntos de F0 usan lista blanca y los roles actuales conservan exactamente sus permisos.

**Catálogo**

2. Con dos perfiles activos, un operador ve en su catálogo únicamente los ítems de su perfil más los compartidos.
3. Tras la migración, **todos** los ítems de catálogo preexistentes son compartidos y ningún operador pierde acceso a lo que usaba.
4. Un ítem creado por un operador queda en su perfil y no es visible desde el otro perfil.
5. El código de ítem sigue siendo único por facturador y el intento de duplicarlo entre perfiles se rechaza.

**Documentos y atribución**

6. Un operador ve en documentos únicamente facturas, notas de crédito, recibos y presupuestos de su perfil, incluidos filtros, búsquedas y selectores.
7. El acceso directo a un documento de otro perfil se comporta como inexistente.
8. Cada documento muestra quién lo emitió, en listado y en detalle.
9. Las facturas históricas muestran su emisor sin haber ejecutado ningún backfill.
10. Los recibos y presupuestos históricos quedan atribuidos al operador más antiguo del facturador y marcados como atribución histórica.
11. Los documentos históricos que no se pudieron atribuir a un perfil quedan visibles para todos los operadores del facturador y marcados como sin perfil.
12. Las facturas históricas con `fiscal_request_snapshot` obtienen su perfil correctamente en la migración, verificado contra establecimiento, punto y código de perfil.
13. Un facturador con un solo contexto operativo se comporta exactamente como antes del cambio.
14. Una factura no puede emitirse con ítems de otro perfil.
15. La numeración de recibos y presupuestos sigue siendo una sola por facturador y la UI explica los huecos al operador.

**Rol de consulta**

16. Un usuario de consulta ve la totalidad de facturas, notas de crédito, recibos, presupuestos, pedidos e ítems de catálogo del facturador, de todos los perfiles, incluidos los que no tienen perfil.
17. Cada documento que ve indica su perfil de emisión y su usuario emisor, y puede filtrar por ambos.
18. Ningún verbo de escritura está disponible para ese rol, ni desde la UI ni por llamada directa a la API.
19. El alta de un usuario de consulta no requiere elegir contexto operativo, y el usuario no ve ningún selector de perfil.
20. Habilitar el rol de consulta no introduce ningún cambio en la resolución del contexto operativo ni en el camino de emisión, verificado porque las pruebas de emisión existentes pasan sin modificación.

**Transversales**

21. La migración es reversible en su efecto visible: dejar todos los documentos e ítems sin perfil restaura el comportamiento actual.
22. Validación visual con Playwright en un viewport mobile y uno desktop, con dos perfiles, dos operadores y un usuario de consulta, cubriendo catálogo, emisión, listado de documentos, recibos, presupuestos y la vista de consulta.
23. `npm run test`, `npm run typecheck`, `npm run lint` y `npm run build` en verde, y validación end-to-end contra el stack levantado con `bash scripts/deploy.sh`.

---

## 12. Consecuencias aceptadas y deuda declarada

1. **Huecos en la numeración de recibos y presupuestos** para el operador (RN-14). El usuario de consulta no los ve.
2. **La atribución retroactiva de recibos y presupuestos es una convención, no un hecho.** Está marcada como tal en la UI y documentada acá para que nadie la use como evidencia.
3. **La agenda de clientes queda compartida**: un operador puede ver clientes que solo opera el otro perfil.
4. **Ítems de catálogo compartidos editables desde cualquier perfil**: es coherente con que pertenecen al facturador, pero significa que un operador puede cambiar el precio de un ítem que usa el otro perfil. Queda trazado en `updated_by`.
5. **El rol de consulta no reemplaza un rol de supervisor**: no puede intervenir (anular, corregir, reasignar) ni administrar usuarios. Si más adelante hace falta que el dueño actúe y no solo mire, es un alcance nuevo.
6. **Los reportes agregados no están en esta versión**: el usuario de consulta ve listados, no indicadores. El reporte de ventas se especifica aparte.

---

## 13. Relación con el import de configuración

Los dos SPEC son parte del mismo programa y se ordenan así:

1. `SPEC_IMPORT_CONFIG_FACTURADOR_v0.1` crea el facturador y **sus perfiles de emisión** a partir del archivo exportado por `facturacion-electronica`, y permite asignar el perfil en el alta del usuario.
2. Este SPEC define qué significa operativamente esa asignación: qué catálogo ve, qué documentos ve, qué queda registrado de lo que hace, y quién puede ver todo junto.

El alta de usuario del primer SPEC incorpora el modo de asignación de este: al crear un usuario se elige si es operador —y entonces se le asigna facturador y perfil— o si es de consulta —y entonces se le asigna solo el facturador—.

Técnicamente son independientes: este SPEC funciona sobre facturadores dados de alta a mano. El valor completo aparece cuando un facturador con varios perfiles se da de alta con un archivo, sus operadores quedan asignados a perfiles distintos desde el primer día, y el dueño entra con su usuario de consulta a ver todo junto.
