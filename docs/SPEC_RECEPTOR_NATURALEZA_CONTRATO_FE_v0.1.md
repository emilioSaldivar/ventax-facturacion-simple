# SPEC Receptor Naturaleza y Contrato FE v0.1

## Alineacion

- `AGENTS.md`
- `docs/METODOLOGIA_SDD.md`
- `docs/SPEC_AJUSTE_CONTRATO_FE_AUTOGESTION_v0.1.md`
- `docs/SPEC_AUTOCOMPLETADO_DNIT_RUC_CI_v0.1.md`
- `spec/openapi.yaml`
- Origen externo: `facturacion-electronica` commits `3e37265` (naturaleza receptor) y `1d6a971` (NCE modo BATCH por defecto + fallback SIFEN 1264), reflejados en `facturacion-electronica/documentacion_integraciones/` (actualizado 2026-08-10).

## Objetivo

Alinear `facturacion-simple-cliente` con la actualizacion del 2026-08-10 del contrato de integracion de `facturacion-electronica`:

1. nuevo campo `receptor.naturaleza` (`FISICA`/`JURIDICA`) en `POST /factura` y `POST /nota-credito`, que determina `iTiContRec` en el XML fiscal;
2. nuevo valor de `delivery_mode` (`SYNC_FALLBACK_BATCH`) para Notas de Credito que piden `SYNC`/`AUTO` explicito y SIFEN rechaza con codigo `1264`.

## Hallazgo Que Origina Este Cambio

El proveedor `facturacion-electronica` documenta en `docs/SPEC_RECEPTOR_TIPO_CONTRIBUYENTE_v0.1.md` un reclamo real de produccion: un receptor con RUC que es Persona Juridica fue emitido con `iTiContRec=1` (Fisica) porque el backend fiscal hardcodeaba ese valor para todo receptor con RUC. La correccion agrega `receptor.naturaleza` como campo opcional, con default `FISICA` (preserva compatibilidad con integradores existentes que no lo envian).

`facturacion-simple-cliente` hoy no envia `naturaleza` en ningun caso (`buildReceptor()` en `apps/api/src/modules/fiscal-gateway/fiscal-gateway.client.ts:1323-1337` no incluye ese campo), por lo que **todo receptor con RUC emitido por este sistema queda fijado como `FISICA` ante SIFEN**, incluyendo clientes que en realidad son personas juridicas.

## Investigacion: Origen Del Tipo De Persona Desde Datos De La SET

Se investigo si existe una forma de derivar `naturaleza` (Fisica/Juridica) automaticamente desde datos provistos por la SET/SIFEN, para evitar depender de que el operador lo declare a mano. Conclusion: **no existe hoy ninguna fuente de datos de la SET, ni en este repositorio ni en el backend fiscal, que exponga el tipo de persona de un RUC.**

Evidencia verificada:

1. **Consulta RUC en vivo contra SIFEN** (`GET /v1/consultar/ruc/{ruc}` de `facturacion-electronica`, ver `documentacion_integraciones/openapi.integracion-clientes.yaml` y `docs/SPEC_CONSULTA_RUC_NORMALIZADA_v0.1.md`): la respuesta normalizada (`ConsultaRucNormalizedResponse.contribuyente`) solo expone `ruc`, `dv`, `ruc_completo`, `razon_social`, `estado_codigo`, `estado_descripcion`, `estado_normalizado`, `es_facturador_electronico`. No hay ningun campo de naturaleza/tipo de persona.
2. **Verificado a nivel de implementacion del proveedor** (`facturacion-electronica/src/catalogs/sifen-consulta-ruc-field-map.json` + `src/services/sifen-ruc-normalizer.service.ts`): los campos reales que devuelve el servicio SIFEN `siConsRUC` (Manual Tecnico v150) son `dCodRes`, `dMsgRes`, `dRUCCons`, `dRazCons`, `dCodEstCons`, `dDesEstCons`, `dRUCFactElec`, `dDigVer`. Ninguno corresponde a tipo de contribuyente/persona. El servicio publico de Consulta RUC de SIFEN **no** incluye esa clasificacion.
3. **El propio proveedor lo confirma explicitamente como brecha conocida**: `docs/SPEC_RECEPTOR_TIPO_CONTRIBUYENTE_v0.1.md` (seccion "Fuera de alcance") deja fuera "Validacion cruzada de `naturaleza` contra el padron real de RUC ante SET (requeriria integracion con Consulta RUC...) — no incluida en esta iteracion". Es decir, ni siquiera el backend fiscal puede resolverlo hoy de forma automatica y confiable.
4. **Fuente DNIT/SET propia de este repositorio** (`dnit_ruc_contribuyentes`, cargada mensualmente desde el padron publico de DNIT, ver `docs/SPEC_AUTOCOMPLETADO_DNIT_RUC_CI_v0.1.md`): tampoco trae un campo nativo de tipo de persona. La clasificacion Fisica/Juridica que ya usa este repo (`isJuridicaByRuc()` en `apps/api/src/modules/clientes/clientes.service.ts:179-181`, y la seccion "Reglas de Clasificacion de Identidad" del SPEC de autocompletado) es una **heuristica explicitamente documentada como "operativa inicial"**: RUC de 7 digitos o menos se asume Fisica, mas de 7 digitos se asume Juridica. No es un dato oficial de la SET, es una inferencia por longitud de numero.

**Conclusion operativa**: no hay ninguna fuente autoritativa (ni consulta RUC en vivo, ni padron DNIT cargado) que indique el tipo de persona real de un RUC. El dato debe declararlo quien conoce al cliente (el operador), con `FISICA` como default seguro y compatible con el comportamiento actual del proveedor. La heuristica de longitud de RUC existente puede reusarse como **sugerencia no vinculante** en la UI (ya que ahora el dato tiene efecto fiscal directo sobre `iTiContRec` en el XML aprobado ante SIFEN, a diferencia de su uso actual que solo decide `tipoDocumento` CI vs RUC en autocompletado), pero nunca como fuente de verdad silenciosa.

## Investigacion Complementaria: Datos Propios Del Repositorio (2026-08-13)

A pedido explicito se reverifico si alguna fuente **ya cargada en este repositorio** (no en el proveedor externo) permite derivar `naturaleza` con mas precision que la heuristica de longitud de RUC. Evidencia verificada:

1. **`dnit_ruc_contribuyentes`** (`db/migrations/0014_dnit_ruc_contribuyentes.sql`, replicada en `dnit-ruc-loader/sql/001_init.sql`): columnas reales `ruc_sin_dv, dv, ruc, nombre, apellido, razon_social, codigo_dnit, estado, fuente_archivo, fecha_importacion`. **No existe ninguna columna de tipo de contribuyente/tipo de persona.** `estado` es el estado del RUC ante SET (ej. "ACTIVO"), no naturaleza. El archivo fuente de DNIT que alimenta el loader (`dnit-ruc-loader/src/import.js`) trae solo 5 campos separados por `|` (`ruc_sin_dv | rawName | dv | codigo_dnit | estado`): nunca existio un campo de naturaleza en el padron, no es un dato descartado.
2. **Heuristica de nombre del loader** (`import.js`, funcion `normalizeIdentity`, `isFisicaCandidate`): separa `nombre`/`apellido` si el string cumple el patron `"APELLIDO, NOMBRE"`, pero **solo evalua ese patron cuando `ruc_sin_dv.length <= 7`**. Es un subconjunto derivado de la misma heuristica de longitud, no una senal independiente; `isJuridicaByRuc()` (`clientes.service.ts:179-181`) tampoco lee `nombre`/`apellido`, solo la longitud.
3. **`documento_tipo = 'CI'` implica `FISICA` con certeza** (una cedula paraguaya nunca se emite a persona juridica; CHECK de `documento_tipo` en `db/migrations/0005_clientes.sql`). Es una senal 100% cierta pero irrelevante para el problema real: el Alcance de este SPEC ya limita el envio de `naturaleza` a FE solo cuando `documento_tipo === 'RUC'`, caso en el que esta senal no aplica.
4. **Senal nueva no contemplada en la version anterior de este SPEC: sufijos societarios en `razon_social`** (`S.A.`, `S.R.L.`, `E.A.S.`, `LTDA`, `COOP`, etc.). No existe hoy ningun analisis de texto sobre el nombre ya guardado (ni en este repo ni en el loader DNIT). Es una heuristica **adicional** plausible — mas precisa que la longitud sola para el caso "RUC largo sin sufijo societario visible" — pero sigue sin ser autoritativa: no hay ground truth en el repo para medir su tasa de error, y el propio padron DNIT no valida ese patron contra nada oficial.

**Conclusion**: se sostiene la conclusion original, no hay fuente autoritativa propia. Se incorpora la senal de sufijos societarios como refuerzo **combinado** de la sugerencia no vinculante (ver Alcance y Reglas De Negocio), no como reemplazo de la heuristica de longitud ni como fuente de verdad.

## Nota De Terminologia SIFEN (2026-08-14)

El Manual Tecnico SIFEN v150 (`documents_info/manual_150.md` en el repo `facturacion-electronica`) define **dos campos distintos** que no deben confundirse entre si:

- `iNatRec` (D201) — "**Naturaleza** del receptor": `1=contribuyente`, `2=no contribuyente`. No es el campo que implementa este SPEC.
- `iTiContRec` (D205) — "**Tipo de contribuyente**" del receptor: `1=Persona Fisica`, `2=Persona Juridica`. **Este es el campo real que implementa este SPEC**, obligatorio solo si `iNatRec=1`.

El proveedor `facturacion-electronica` eligio la clave `naturaleza` en el contrato JSON hacia este SaaS para representar `iTiContRec` (confirmado en su documentacion de integracion), pero su propia UI interna usa el label "Tipo de contribuyente" (`frontend/src/modules/facturas/FacturaDetailPage.tsx`), no "Naturaleza". Es decir, el nombre `naturaleza` es una eleccion de nomenclatura del contrato de API del proveedor, no el termino oficial del manual SIFEN para este dato.

**Decision para este SPEC**: se mantiene `naturaleza` como nombre de campo en base de datos, tipos y contrato API propio (`spec/openapi.yaml`), para no romper el contrato ya acordado con `facturacion-electronica` ni forzar una migracion de nombres sin necesidad real. El **label mostrado al operador en la UI es "Tipo de Persona"** (mas natural para el usuario final que "Tipo de Contribuyente", termino tecnico del manual, y evita el choque semantico con el "Naturaleza" real del manual SIFEN). Ver `docs/PLAN_RECEPTOR_NATURALEZA_CONTRATO_FE_v0.1.md`, seccion "Sugerencia No Vinculante En UI".

## Alcance

Incluye:

- agregar `naturaleza` (`FISICA` | `JURIDICA`, opcional, default `FISICA`) a la identidad de cliente (`cliente_identidades` y `facturador_clientes`), API propia de clientes y UI de alta/edicion en `apps/web-operacion`;
- sugerencia no vinculante de `JURIDICA` en el formulario de cliente cuando `documento_tipo=RUC` y **(a)** el RUC tenga mas de 7 digitos (misma heuristica que `isJuridicaByRuc`) **o (b)** `razon_social` contenga un sufijo societario conocido (`S.A.`, `S.R.L.`, `E.A.S.`, `LTDA`, `COOP`, lista cerrada a definir en PLAN), siempre editable por el operador antes de guardar, sin autocompletar en silencio;
- enviar `receptor.naturaleza` en `buildReceptor()` del `FiscalGatewayClient` al emitir factura y nota de credito, solo cuando `documento_tipo === 'RUC'` (igual regla que el proveedor: sin efecto para otros tipos de documento);
- extender `FiscalDeliveryMode` (`apps/api/src/modules/fiscal-gateway/fiscal-gateway.types.ts`) para incluir `SYNC_FALLBACK_BATCH` y propagarlo correctamente en `mapDeliveryMode()`, evitando que se pierda como `null` en la traza de Notas de Credito;
- actualizar `spec/openapi.yaml` con el campo `naturaleza` en el contrato propio de clientes.

No incluye:

- integrar el endpoint `GET /v1/consultar/ruc/{ruc}` del proveedor para validacion cruzada automatica de `naturaleza` — no aporta ese dato (ver investigacion arriba); si en el futuro SIFEN/SET expone esa clasificacion, se evalua en una iteracion nueva;
- reemision retroactiva de documentos ya emitidos con `naturaleza` implicita incorrecta — se corrige, si el cliente lo requiere, con el flujo de Nota de Credito ya existente;
- cualquier logica fiscal SIFEN adicional (esto vive en `facturacion-electronica`, fuera del limite de dominio de este repo).

## Reglas De Negocio

- `naturaleza` es opcional en alta/edicion de cliente; si se omite, el sistema asume `FISICA` (igual que el default del proveedor, sin cambio de comportamiento para clientes existentes).
- `naturaleza` solo tiene efecto fiscal cuando `documento_tipo === 'RUC'`; para `CI`, `PASAPORTE`, `CEDULA_EXTRANJERA` y `NO_ESPECIFICADO` el campo se puede guardar pero no se envia a `facturacion-electronica`.
- La sugerencia combinada (RUC >7 digitos y/o sufijo societario conocido en `razon_social` → sugerir Juridica) es solo un valor prellenado editable en el formulario, nunca se guarda ni se emite sin confirmacion del operador. Ninguna de las dos senales es autoritativa (ver "Investigacion Complementaria"); si `razon_social` aun no fue cargada al momento de sugerir, se usa solo la senal de longitud de RUC.
- El cambio es aditivo y retrocompatible: clientes ya cargados sin `naturaleza` siguen emitiendo como `FISICA`, igual que hoy.

## Entidades Afectadas

- `cliente_identidades`, `facturador_clientes` (migracion nueva, columna `naturaleza`);
- `ClienteUpsertInput`, `ClienteSearchResult`, `ClienteResponse` (`apps/api/src/modules/clientes/clientes.types.ts`);
- `FiscalEmitFacturaRequest["cliente"]`, `buildReceptor()` (`apps/api/src/modules/fiscal-gateway/fiscal-gateway.client.ts`);
- `FiscalDeliveryMode` (`apps/api/src/modules/fiscal-gateway/fiscal-gateway.types.ts`);
- formulario de cliente en `apps/web-operacion/src/main.tsx`.

## Contratos Esperados

- `spec/openapi.yaml`: `ClienteUpsertRequest` y respuestas de cliente incluyen `naturaleza` (`FISICA` | `JURIDICA`, default `FISICA`).
- Request hacia `facturacion-electronica` (`POST /factura`, `POST /nota-credito`): `receptor.naturaleza` presente cuando `documento_tipo === 'RUC'` y el cliente tiene el dato guardado; ausente para otros tipos de documento (deja que el proveedor aplique su propio default).

## Casos Felices

1. Operador crea cliente con RUC, marca `naturaleza=JURIDICA` explicitamente → factura emitida contiene `receptor.naturaleza=JURIDICA` → XML aprobado con `iTiContRec=2`.
2. Operador crea cliente con RUC sin tocar `naturaleza` → se guarda `FISICA` por default → comportamiento igual al actual (sin regresion).
3. Cliente con `documento_tipo=CI` → `naturaleza` no se envia a FE, sin cambios.
4. NCE con `envio.mode=SYNC` explicito rechazada por SIFEN con codigo `1264` → FE responde `delivery_mode=SYNC_FALLBACK_BATCH` → el sistema lo reconoce y lo traduce a estado `PENDIENTE_SIFEN` sin perder la distincion en la traza/logs.

## Errores Relevantes

- `naturaleza` con valor fuera de `FISICA`/`JURIDICA` → `422` en API propia de clientes (validacion Zod).
- Respuesta de FE con `delivery_mode` desconocido (valor no contemplado) → se mantiene el comportamiento actual de fallback a `null`/`PENDIENTE_SIFEN`, sin romper el flujo.

## Criterios De Aceptacion

- Existe cadena SDD completa (`SPEC`, `PLAN`, `TASKS`) para esta iniciativa.
- `naturaleza` es persistible, editable y visible en alta/edicion/listado de cliente, con default `FISICA`.
- `buildReceptor()` envia `naturaleza` a FE solo para receptores `RUC`, reflejando el dato guardado del cliente.
- `FiscalDeliveryMode` reconoce `SYNC_FALLBACK_BATCH` sin perder informacion en la traza de NCE.
- `spec/openapi.yaml` actualizado y consistente con el schema real.
- Se documenta en este SPEC (seccion "Investigacion") que no existe fuente SET/SIFEN autoritativa para derivar `naturaleza` automaticamente, para evitar que una futura iteracion asuma que "ya se resolvio" sin verificar de nuevo si el proveedor agrego esa capacidad.
