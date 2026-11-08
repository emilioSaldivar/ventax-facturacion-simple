# SPEC Correcciones de FS tras los fixes de FE v0.1

**Fecha:** 2026-11-06. **Rama:** `feat/identidad-segel`, sin merge a `master`. **Estado:** borrador; D-1 espera al usuario.
**Origen:** revision de FS frente a cada fix de `facturacion-electronica` (FE), con produccion ya activa en `segel-fs`.

## 1. Alcance

Seis errores de FS que aparecieron o cambiaron con los fixes de FE-02, H09, FE-04 y FE-09. Tres tienen el codigo escrito y falta validarlos; dos no tienen codigo; uno se cierra sin cambio.

| ID | Error | Prioridad | Estado |
|---|---|---|---|
| FS-20 | El operador pierde la causa real de un rechazo | Alta | Codigo en `2b1eed9`, sin validar con FE real ni desplegar |
| FS-21 | Un `0422` da por aprobado un documento cancelado | Baja | Igual |
| FS-23 | Rechazo `0100` al cancelar, sin orientacion | Media | Igual |
| FS-24 | Una factura aprobada tarde sigue "Procesando" por horas | Media | Sin codigo |
| FS-25 | Las 6 acciones de "Administracion fiscal" no funcionan | Media | Sin codigo. Espera D-1 |
| FS-27 | Una factura rechazada con correo queda "en cola" para siempre | Alta | Codigo en la segunda entrega (seccion 7b) |
| FS-28 | "Corregir y emitir de nuevo" abre el editor vacio | Alta | Codigo en la segunda entrega (seccion 7c) |
| FS-29 | El mensaje de `1306` solo sirve en pruebas | Alta | Igual |
| FS-30 | El aviso al facturador no dice que es para el ni que el cliente no recibio correo | Media | Igual |
| FS-22 | Retirar la proteccion de FS-11 | Baja | Se cierra sin cambio (seccion 7) |

**No entra:** los demas hallazgos abiertos del backlog (seccion 9), la carga masiva y cualquier cambio en FE.

**Limite de la evidencia:** FS-24 y FS-25 salen de leer el codigo de FS y de FE. Ninguno se reprodujo en ejecucion. En `segel-fs` no se prueba.

## 2. FS-20: causa real del rechazo

- **Sintoma:** ante un rechazo, el operador ve "contactar soporte" en vez de la causa y como corregirla.
- **Causa:** la consulta con `refresh=true` solo responde `0420` "no existe o fue rechazado". FS guardaba ese codigo y pisaba el original.
- **Evidencia:** facturas `0003249` y `0003250` de la instancia de test: SIFEN respondio `1306` (receptor no valido) y FS mostro `0420`.
- **Correccion:** si el documento queda `RECHAZADA`, FS lee el motivo guardado por FE en `GET /documentos/{uuid}/sifen` sin `refresh`. Busca primero la forma de lote y luego la sincronica. Si no hay motivo, conserva una causa ya guardada antes que pisarla con `0420`.
- **Depende de:** el tag de FE con H09. Sin el, FE tambien pierde el motivo.

Criterios:

- **CA-20.1.** Un rechazo `1306` muestra "Receptor no valido" y la accion de corregir, antes y despues de pulsar "Verificar estado fiscal".
- **CA-20.2.** Si FE no tiene el motivo, se muestra `0420` y no se borra una causa anterior.
- **CA-20.3.** Si la lectura del motivo falla, el estado se actualiza igual y queda un aviso en el log.

## 3. FS-21: `0422` no significa vigente

- **Sintoma posible:** una factura cancelada se ve emitida.
- **Causa:** `mapDocumentStatusWithCode` daba por aprobado cualquier `0422`. SIFEN responde `0422` "CDC encontrado" tambien para un documento cancelado (confirmado por FE en SIFEN test).
- **Correccion:** el `status` de FE manda sobre el codigo. `CANCELLED` y `VOIDED` nunca se dan por aprobados.
- **Alcance real:** raro. Se usa en respuestas de emision, y FS resuelve antes la idempotencia localmente.

Criterio:

- **CA-21.1.** Una respuesta con `status` `CANCELLED` o `VOIDED` y codigo `0422` queda `ANULADA`.

## 4. FS-23: rechazo `0100` al cancelar

- **Sintoma:** SIFEN rechaza una cancelacion con `0100 Error Inesperado`. El operador reintenta enseguida y vuelve a fallar.
- **Causa:** desconocida. Segun FE es no determinista: unas 9 de 61 cancelaciones en produccion. Un caso de FE se acepto reintentando a los 59 s. Dos rechazos de FS sobre `0001102`, a 2 minutos entre si, no encajan del todo: puede haber mas de una causa.
- **Correccion:** el mensaje pide esperar un minuto antes de reintentar. FS no bloquea la cancelacion. Cada rechazo registra `segundos_desde_creacion`, para que FE confirme o descarte la hipotesis del tiempo.

Criterios:

- **CA-23.1.** Ante `0100`, el operador ve el mensaje de espera y puede reintentar.
- **CA-23.2.** El log del rechazo trae codigo y `segundos_desde_creacion`, sin datos del receptor ni claves.

## 5. FS-24: factura aprobada tarde sigue "Procesando"

- **Sintoma:** una factura que SIFEN aprueba con demora se ve "Procesando" horas despues de aprobada, salvo que el operador pulse "Verificar estado fiscal".
- **Causa:** el worker de verificacion trata `SENT_BATCH` (enviado, esperando a SIFEN) como un intento fallido y espacia las consultas: 5 min, 35 min, 1 h 35, 7 h 35, 19 h 35 y 43 h 35 desde la emision.
- **Por que importa ahora:** con `RECONCILE_DEFERRED_ENABLED`, FE deja de rechazar en falso esos documentos y los mantiene en `SENT_BATCH` hasta 48 h. Maximo observado en produccion de FE: 3 h 51. Esa factura se veria aprobada recien a las 7 h 35.
- **Segundo efecto:** cada consulta del worker usa `refresh=true` y va a SIFEN, aunque con la bandera FE ya consulta sola cada 10 min.

Reglas:

**Refinamiento (2026-11-07):** la regla se parte en dos, porque `RECONCILE_DEFERRED_ENABLED` queda apagada en la segunda entrega y, sin ella, el `refresh` sigue siendo la unica via para destrabar un documento (RN-24.6). Esperar `SENT_BATCH` no depende de ninguna bandera; omitir el `refresh`, si.

- **RN-24.0.** Siempre: un documento en `SENT_BATCH` se vuelve a mirar a los 15 min y no gasta intentos, hasta 48 h desde su creacion. Pasado ese plazo rige el backoff vigente. El fallo real es `REJECTED`, o seguir en `SENT_BATCH` a las 48 h.
- **RN-24.1.** Bandera de FS `VERIFICACION_LOTE_SIN_REFRESH`, `false` por defecto. Apagada, el worker sigue consultando con `refresh`.
- **RN-24.2.** Encendida, el worker lee primero el estado en FE (`GET /documentos/{uuid}`). Si es `SENT_BATCH` o `QUEUED_BATCH`, no consulta a SIFEN.
- **RN-24.4.** Con cualquier otro estado, el flujo actual no cambia: consulta con `refresh` y backoff.
- **RN-24.5.** "Verificar estado fiscal" siempre consulta a SIFEN, con o sin bandera.
- **RN-24.6.** Corregido por FE (2026-11-07): el `refresh` del worker **no** es lo que destraba un documento. Sin `RECONCILE_DEFERRED_ENABLED`, el poller de FE consulta los lotes abiertos y, al agotar intentos, reconcilia por CDC y re-encola. El `refresh` solo adelanta lo que FS ve. `VERIFICACION_LOTE_SIN_REFRESH` queda apagada en la segunda entrega para no cambiar dos cosas juntas: decision del usuario, 2026-11-07. Encenderla despues es decision aparte.
- **RN-24.8.** Tope de consultas: el worker reclama `FE_VERIFY_BATCH_SIZE` (10) documentos cada 30 s, los de `verificacion_next_at` mas antigua, asi que no suma mas de 20 consultas por minuto a un SIFEN lento. FE pedia un tope de 20 por corrida: ya se cumple.
- **RN-24.9.** Riesgo de FE-09, sin la bandera: un lote trabado puede terminar en un `REJECTED` con `1002` falso. Para FS no es un rechazo confiable: no reemitir sin consultar el CDC. Registrado en `docs/BACKLOG.md`.
- **RN-24.7.** El corte de 30 dias y la regla de documentos en cola (`SPEC_VERIFICACION_DOCUMENTOS_EN_COLA_v0.1`) siguen vigentes.

Criterios:

- **CA-24.1.** Bandera apagada: el worker sigue llamando con `refresh=true`; en `SENT_BATCH` reprograma a 15 min sin gastar intentos.
- **CA-24.2.** Bandera encendida y `SENT_BATCH`: 0 llamadas con `refresh=true`, proxima consulta a 15 min, intentos sin cambio.
- **CA-24.3.** Una factura que pasa de `SENT_BATCH` a aprobada se ve `EMITIDA` en la consulta siguiente: a lo sumo 15 min mas el ciclo del worker.
- **CA-24.4.** Un documento con mas de 48 h en `SENT_BATCH` vuelve al backoff vigente.
- **CA-24.5.** Si la lectura del estado falla, rige el backoff vigente: no se sabe si sigue en lote.
- **CA-24.6.** El boton manual hace la consulta con `refresh=true` aunque la bandera este encendida.

## 6. FS-25: acciones de "Administracion fiscal" que no funcionan

- **Sintoma esperado:** para soporte interno, las 6 acciones responden error: decision, validar impacto CDC, reintentar mismo CDC, crear DE derivado, cancelar envio local e inutilizar numeracion.
- **Causa:** FS llama a `/admin/emisores/{id}/facturas/{documentId}/...` de FE solo con `x-api-key`. Esas rutas exigen `Authorization: Bearer` de un usuario del backoffice de FE; fuera de produccion aceptan `x-api-key` solo con `x-user-id`, que FS no manda. FE responde `401` y FS lo muestra como `502`.
- **Evidencia:** lectura de `fiscal-gateway.client.ts` y de `require-admin-user.ts` de FE; FE lo confirmo por lectura (su V048). Sin reproducir.
- **Historia:** FE exige `Bearer` en produccion desde el 2026-04-22 (`ba114db`). FS sumo estas acciones el 2026-05-28 (`SPEC_AUTOGESTION_AVANZADA_SOPORTE_v0.1`), probadas solo con el mock: su tarea de QA, AGS-009, quedo `PENDING`. FS nunca envio `Bearer` ni `x-user-id`. `OPERACION_PARIDAD_FE_v0.1` suponia que alcanzaba la clave compartida. Por lectura, nunca funcionaron contra un FE real.
- **Alternativa de soporte:** el backoffice de FE ya tiene las seis, mas el reenvio.
- **Alcance:** el mismo bloque existe en `master` (Ventax). Este SPEC cubre solo la rama Segel.
- **Dos datos mas de FE:** "Reintentar mismo CDC" responderia siempre `409 CDC_CHANGE_REQUIRED`, porque cada regeneracion cambia el CDC (su OBS-005, sin corregir). Y sobre un documento con lote abierto, esas rutas responden `409 DOCUMENT_IN_PROCESS_AT_SIFEN` desde su fix FIX009.
- **Riesgo:** bajo. Nadie puede reenviar un documento desde FS. El costo es mostrar a soporte botones que fallan, y mantener codigo y contrato que no sirven.

**Propuesta (D-1): retirarlas de FS.**

- **RN-25.1.** Se quita de la pantalla de documentos el bloque con esas 6 acciones. Soporte las usa desde el backoffice de FE.
- **RN-25.2.** Se quitan las 6 rutas `/facturas/{id}/gestion/...`, sus metodos del gateway y su parte de `spec/openapi.yaml`.
- **RN-25.3.** No se tocan `/facturas/gestion/batch-pendientes` ni `/facturas/gestion/reconciliacion`: leen la base de FS.
- **RN-25.4.** Antes de retirar, se confirma el `401` en un stack local con FE en `APP_ENV=production`. Si alguna accion funciona, se detiene y se vuelve a este SPEC.

Criterios:

- **CA-25.1.** Con rol interno, la pantalla de un documento no muestra las 6 acciones, y el resto del detalle funciona igual.
- **CA-25.2.** Las 6 rutas responden `404`.
- **CA-25.3.** Las pruebas de roles siguen pasando: ningun rol gana ni pierde otro permiso.

## 7b. FS-27: correo de una factura rechazada

- **Origen:** FE retiene el correo hasta la aprobacion de SIFEN (`EMAIL_TRAS_APROBACION`, decision del usuario del 2026-11-07, `segel-rc3`). Si SIFEN rechaza, FE no manda correo e informa `email_status: NOT_APPLICABLE` con `email_error: documento_rechazado_por_sifen`. No es un fallo de correo.
- **Defecto de FS:** al resolver un correo `PENDING`, `getEmailStatus` intenta guardar `NOT_APPLICABLE` en `email_estado`, y la restriccion de la columna (migracion 0036) no admite ese valor. El error se registra como advertencia y el documento queda `PENDING`: "El correo esta en cola" para siempre, consultando a FE cada vez que se abre. Con envio por lote para todos, le pasaria a toda factura rechazada con correo. Por lectura de codigo; existia antes, pero solo FE lo dispara ahora.
- **RN-27.1.** `NOT_APPLICABLE` se guarda como `email_estado` nulo, que FS ya lee como "sin correo". Sin migracion.
- **RN-27.2.** Si el documento esta `RECHAZADA`, el mensaje dice que no se envio correo porque SIFEN rechazo la factura, no que el cliente no tiene correo.
- **CA-27.1.** Con FE informando `NOT_APPLICABLE`, el estado deja de ser `PENDING` y la siguiente apertura no consulta a FE.
- **CA-27.2.** Una factura rechazada con correo muestra el mensaje de RN-27.2; una sin correo, el de siempre.

## 7c. FS-28, FS-29 y FS-30: corregir un rechazo sin confundir a nadie

Vistos por el usuario en el ensayo local del 2026-11-07, sobre la factura rechazada a proposito con `1306`. Decision del usuario: corregirlos antes del despliegue en `segel-fs`.

- **FS-28.** "Corregir y emitir de nuevo" solo navegaba al editor vacio. **RN-28.1:** abre el editor con el cliente (tipo y numero de documento, razon social, naturaleza, direccion, telefono y correo) y los items de la factura rechazada. **RN-28.2:** el editor muestra que se esta corrigiendo la factura N, que se emitira con numero nuevo y que la rechazada queda como esta. **RN-28.3:** nada cambia en la rechazada ni en el backend: es una factura nueva, con su propia clave de idempotencia. Corregir en el mismo documento, con el mismo numero, sigue siendo A-1 de `SPEC_AUTOGESTION_OPERADOR_v0.1`.
- **FS-29.** El texto de `1306` hablaba solo del ambiente de pruebas. **RN-29.1:** dice lo que vale en produccion y en pruebas: SIFEN no encontro el RUC del cliente en el registro de la SET; revisar numero y digito verificador, o emitir con la cedula si el cliente no tiene RUC. **RN-29.2:** el mismo criterio en el mensaje de la ficha del documento (`getRejectedSifenMessage`), que repetia el texto de pruebas.
- **FS-30.** **RN-30.1:** el aviso "requiere accion" dice que es para el equipo de facturacion y que el cliente no recibio la factura por correo. Solo se manda por documentos no aprobados, asi que la frase es cierta en todos los casos con el correo retenido hasta la aprobacion.

Criterios: **CA-28.1** el editor abre con cliente e items de la rechazada y el aviso de correccion; **CA-28.2** emitir crea una factura nueva y la rechazada no cambia; **CA-29.1** ni la ficha ni el banner de un `1306` mencionan "pruebas" ni "Marangatu test"; **CA-30.1** el aviso incluye las dos frases de RN-30.1. Validacion: pruebas unitarias y Playwright en 390 y 1280 px sobre el ensayo local.

## 7. FS-22: se cierra sin cambio

La proteccion de FS-11 evita consultar a SIFEN un documento ya anulado. Con el fix de FE-02 deja de ser necesaria para proteger el estado, pero sigue ahorrando una consulta inutil. **Se conserva.** No hay tarea.

## 8. Decisiones

| ID | Que | Propuesta | Decide |
|---|---|---|---|
| D-1 | FS-25 | **Decidido por el usuario (2026-11-06): opcion C, reorientada.** No se trata de reparar las 6 acciones para soporte interno, sino de que el operador final se autogestione desde FS: corregir RUC y nombre de un rechazo, y reenviar o corregir un correo fallido. Solo las acciones que se usen facil e intuitivamente. Pidio la opinion de FE antes de definir: consultada, sin respuesta. Sale de este SPEC y tendra su propia cadena (`AUTOGESTION_OPERADOR`). El bloque interno actual no se toca hasta entonces | Usuario |
| D-2 | Cuando se despliega | Junto con el proximo tag de FE: FS-20 lo necesita y FS-24 necesita su bandera. Un solo cambio en produccion | Usuario, con confirmacion directa |

## 9. Otros errores abiertos, fuera de este SPEC

Siguen en `docs/BACKLOG.md`. Cada uno necesita su cadena.

| ID | Error | Situacion |
|---|---|---|
| FS-17 | Un facturador puede sobrescribir la razon social global de un documento, y otro verla | Hipotesis leida en el codigo. **Antes de cargar clientes reales** |
| FS-18 | El backoffice no tiene pantalla de T&C: un administrador nuevo queda bloqueado | Confirmado en produccion. Se destraba entrando por `/app/` |
| FS-19 | La raiz de `backoffice.factura` lleva a `/app/` | Confirmado. Parte es del NGINX de infraestructura |
| FS-06, FS-16 | Mensajes confusos con una clave invalida | Confirmados. No afectan datos |
| FS-12 | KuDE lento: p95 de 4,9 s | Confirmado. Falta separar la parte de FE |
| FS-05, FS-08, FS-15 | Reparto de la cola, CDC local al cancelar, compartir sin numero fiscal | Hipotesis, sin medir |
| FS-09 | Pestana activa poco legible | Confirmado, visual |
| Backups | Sin backups automaticos | Pospuestos por el usuario; antes de datos reales |
