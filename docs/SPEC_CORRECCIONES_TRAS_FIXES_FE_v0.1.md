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

- **RN-24.1.** Bandera de FS `VERIFICACION_LOTE_SIN_REFRESH`, `false` por defecto. Apagada, nada cambia.
- **RN-24.2.** Encendida, el worker lee primero el estado en FE (`GET /documentos/{uuid}`). Si es `SENT_BATCH` o `QUEUED_BATCH`, no consulta a SIFEN.
- **RN-24.3.** Encendida, un documento en `SENT_BATCH` se vuelve a mirar a los 15 min y no gasta intentos, hasta 48 h desde su creacion. Pasado ese plazo rige el backoff vigente.
- **RN-24.4.** Con cualquier otro estado, el flujo actual no cambia: consulta con `refresh` y backoff.
- **RN-24.5.** "Verificar estado fiscal" siempre consulta a SIFEN, con o sin bandera.
- **RN-24.6.** La bandera se enciende solo en una instancia cuyo FE tenga `RECONCILE_DEFERRED_ENABLED=true`. **Condicion de FE:** sin esa bandera, el `refresh` del worker es la unica via para destrabar un documento. No se retira antes.
- **RN-24.7.** El corte de 30 dias y la regla de documentos en cola (`SPEC_VERIFICACION_DOCUMENTOS_EN_COLA_v0.1`) siguen vigentes.

Criterios:

- **CA-24.1.** Bandera apagada: mismas llamadas y mismos tiempos que hoy.
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

## 7. FS-22: se cierra sin cambio

La proteccion de FS-11 evita consultar a SIFEN un documento ya anulado. Con el fix de FE-02 deja de ser necesaria para proteger el estado, pero sigue ahorrando una consulta inutil. **Se conserva.** No hay tarea.

## 8. Decisiones

| ID | Que | Propuesta | Decide |
|---|---|---|---|
| D-1 | FS-25: (A) retirar las 6; (B) retirar 5 y conservar "Inutilizar numeracion" migrada a la ruta publicada `POST /evento/inutilizacionnumfactura`; (C) hacerlas funcionar, con rutas nuevas de FE para consumidores o con credenciales de administrador de FE en FS | A. B suma trabajo y hay que verificar esa ruta. C es un cambio de contrato en FE, y "Reintentar mismo CDC" no funcionaria igual | Usuario |
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
