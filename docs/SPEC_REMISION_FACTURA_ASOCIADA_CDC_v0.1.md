# SPEC Nota De Remision: Factura Asociada Por CDC v0.1

**Fecha:** 2026-11-12 · **BACKLOG:** FS-137 · **Decision del usuario (2026-11-12):** primero las facturas **electronicas** cargadas a mano por CDC, verificadas contra SIFEN con la consulta de FE (§31); la factura **impresa** (`tipo: IMPRESO`) queda para una etapa posterior, despues de probar esta. · **Estado:** refinada; FE respondio los puntos a-e el 2026-11-12 (ver "Respuesta de FE"). D-NRE2-1 decidida (opcion A). **ESPERA usuario:** orden de implementar en FS y orden a FE en su sesion; **ESPERA FE:** BL-213 (`segel-rc4.35`).

## Alineacion

- `docs/SPEC_NOTA_REMISION_v0.1.md`: R-4 y **RN-16 quedan reemplazadas por esta SPEC** (NRE-019 y NRE-021 de `TASKS_NOTA_REMISION_v0.1` pasan a esta cadena); RN-09 (bloque Motivo, "Fecha prevista"), RN-05 (snapshot con `documentosAsociados`), RN-28 (las impresas siguen fuera).
- Guia de FE: §53 (`documentosAsociados[]`: electronica por `cdc`; FE comprueba antes de numerar que sea propia, aprobada y del mismo receptor; SIFEN 2439/2441); §31 (`GET /v1/consultar/de-sifen/{cdc}`: XML de cualquier documento aprobado en SIFEN, clave de consumidor, permiso `SIFEN_DE_CONSULTA` por defecto, 1 consulta/segundo por emisor, 3 a 5 s por consulta).
- Respuesta de FE del 2026-11-12 (`PEDIDO_FACTURACION_SIMPLE_COBERTURA_MT150_v0.1` §12.2, repo de FE `b890236`): hoy `POST /v1/nota-remision` rechaza **antes de numerar** con `404 REFERENCED_DOCUMENT_NOT_FOUND` todo CDC que FE no tenga en su base, aunque sea del mismo emisor. FE propone adoptar el criterio de `anticipoCdc` (validar el emisor por el RUC del CDC y dejar el resto a SIFEN), de forma aditiva: **BL-213, NRE v0.2**. FS confirmo el caso el 2026-11-12 (mensaje a la sesion de FE).

## Situacion actual

FS no manda `documentosAsociados` en la nota de remision manual: con motivo 1 siempre pide "Fecha prevista de la factura" (RN-09) y la envia como `fechaFuturaFactura`. Las facturas asociadas de RN-16 (solo las emitidas por FS, del mismo cliente) tienen cadena y no tienen codigo. Hay clientes con facturas emitidas en otros sistemas que deben remisionarse: hoy no hay forma de asociarlas.

## Objetivo

Que el operador asocie a la nota de remision una o varias facturas electronicas **aprobadas en SIFEN**, esten o no en FS, cargando el CDC a mano (o eligiendo una factura de FS del mismo cliente), con FS verificando contra SIFEN que la factura existe, esta aprobada, es del propio facturador y del mismo destinatario, antes de emitir y sin consumir numero.

## Alcance (v0.1)

1. **Pantalla** (`Nueva nota de remision`, bloque "Motivo del traslado", solo con motivo 1): seccion **"Facturas asociadas"** con un campo "CDC de la factura" (44 digitos; se aceptan espacios y guiones al pegar), boton "Verificar", y la lista de las asociadas con numero, fecha, receptor, total y un boton "Quitar". Debajo, un buscador "Elegir una factura emitida en este sistema" con las facturas de FS aprobadas del mismo cliente (lo de RN-16). Con al menos una asociada, "Fecha prevista de la factura" se oculta y no se envia.
2. **API.** `POST /notas-remision/facturas-asociadas/verificar` `{ cdc, cliente: { documento_tipo, documento } }` → datos de la factura o el motivo del rechazo. `NotaRemisionInput.remision` suma `facturas_asociadas?: Array<{ cdc }>`.
3. **Emision.** FS vuelve a verificar cada CDC en el servidor (no confia en la pantalla), manda `documentosAsociados: [{ tipo: "ELECTRONICO", cdc }]` y omite `fechaFuturaFactura`.
4. **Ficha.** La ficha de la nota muestra "Facturas asociadas" con el numero leido del CDC (`est-pto-numero`) y, si la factura esta en FS, el enlace a su ficha.

## Fuera de alcance

- Factura impresa (`tipo: IMPRESO`): etapa siguiente, con su propia cadena, despues de probar esta.
- Asociar la nota desde la factura (`notasRemision[]` de `POST /v1/factura`, R-6).
- Guardar el XML consultado o convertirlo en documento de FS.
- Nota de remision por planilla con asociadas (la carga ya lo admite por su lado; no cambia).

## Decisiones

| ID | Tema | Decision | Motivo |
|---|---|---|---|
| D-1 | Fuente de verdad del estado de la factura externa | **Decision del usuario (2026-11-12, D-NRE2-1, opcion A): FE consulta SIFEN antes de numerar** (BL-213: existe, aprobada, `iTiDE` 1, mismo emisor, mismo receptor sin DV) y **FS ademas verifica en pantalla** con §31 (clave de consumidor del facturador) para mostrar numero, receptor y total y frenar el error antes de emitir | Una sola regla fiscal al emitir, tambien para la carga masiva de NRE, sin numero gastado; la emision de FS es asincronica (outbox), asi que sin la verificacion en pantalla el operador veria el rechazo recien en la ficha |
| D-2 | Que se lee del XML | Del `xml_rde`: `iTiDE`, `dRucEm`, `dDVEmi`, `dEst`, `dPunExp`, `dNumDoc`, `dFeEmiDE`, `iNatRec`, `dRucRec`, `dDVRec`, `iTipIDRec`, `dNumIDRec`, `dNomRec`, `dTotGralOpe`, `cMoneOpe`. Se leen como **elementos hoja por expresion regular** (los nombres son unicos dentro de `rDE` para una factura; el XML de SIFEN no usa prefijos). Sin dependencia nueva | Son 14 campos fijos del MT150; un parser completo no suma seguridad y si una dependencia. Si en la implementacion aparece un XML con prefijos o repetidos, se cambia a `fast-xml-parser` y se anota en el PLAN |
| D-3 | Facturas de FS | Una factura de FS (`EMITIDA`, con `cdc`, mismo cliente) se asocia **sin** consultar SIFEN: FS ya conoce estado, emisor y receptor. Por CDC a mano, si el CDC corresponde a una factura de FS, se trata igual (sin consulta) | Ahorra 3 a 5 s y el limite de 1/s; FS es fuente de verdad de sus propios documentos |
| D-4 | Cuando consulta SIFEN FS | Solo al "Verificar" en pantalla (y en `POST /notas-remision` si el CDC no paso por "Verificar" en los ultimos 10 minutos: cache en memoria de la API por `facturador + cdc`). Al emitir, la comprobacion fiscal la hace FE (D-1) | Dos consultas por factura externa (FS en pantalla, FE al numerar) dentro del cupo de 1/s; el cache evita una tercera. Con FE anterior a `segel-rc4.35`, la verificacion de FS es la unica y FE rechaza con `404` igual |
| D-5 | Mismo receptor | Comparacion en FS al verificar: contribuyente, `dRucRec` = documento del destinatario sin DV; no contribuyente, `iTipIDRec` + `dNumIDRec` normalizados = tipo y numero del destinatario. Si no coincide, FS rechaza con el mensaje de RN-05 y no emite. FE repite la misma comparacion al numerar (D-1) | Es lo que SIFEN rechaza con 2441; en pantalla el operador lo ve con el nombre del receptor real |
| D-6 | Clave de consumidor ausente o sin permiso | Sin clave de consumidor en el facturador, o `403` de FE en §31: la seccion "Facturas asociadas" se muestra deshabilitada con "Este facturador no puede verificar facturas en SIFEN. Pedilo a Segel." y la nota sigue saliendo con fecha prevista | Misma politica que `nota_remision_habilitada` (RN-01): lo que falta es configuracion, no codigo |
| D-7 | Tope de asociadas | Hasta **10** por nota (SIFEN admite 99) | Caso de uso real: pocas facturas por traslado; 10 consultas a 1/s son hasta 50 s de espera, mas no es operable |

## Reglas

- **RN-01. Formato del CDC.** 44 digitos (se quitan espacios y guiones), digito verificador modulo 11 (pesos 2 a 11 de derecha a izquierda sobre 43 digitos; resto 0 o 1 → DV 0), tipo de documento `01` (factura electronica), RUC y DV del CDC iguales a los del facturador. Si falla: `400 VALIDATION_ERROR` con `details.motivo` (`CDC_FORMATO`, `CDC_DV`, `CDC_NO_ES_FACTURA`, `CDC_OTRO_EMISOR`) y mensaje para el operador ("El CDC no es de una factura", "El CDC es de otro RUC", etc.). Sin llamar a FE.
- **RN-02. Consulta a SIFEN.** `GET /v1/consultar/de-sifen/{cdc}?emisor_id=<emisor>` con la clave de consumidor del facturador y el `env` del servicio. Se usa `xml_rde`. Sin clave: `409 CONFLICT`, `reason: SIFEN_CONSULTA_NO_DISPONIBLE` (D-6).
- **RN-03. Estado.** `estado` distinto de `APROBADO`: `409`, `reason: FACTURA_NO_APROBADA` ("SIFEN no tiene esa factura aprobada" / "La factura esta cancelada en SIFEN"). `404 CDC_INEXISTENTE` de FE: `409 FACTURA_NO_APROBADA` con "SIFEN no tiene una factura aprobada con ese CDC. Verificalo con quien la emitio".
- **RN-04. Tipo y emisor en el XML.** `iTiDE` = 1 y `dRucEm`-`dDVEmi` = RUC del facturador; si no, `409 FACTURA_NO_PROPIA`. (Redundante con RN-01 salvo CDC manipulado; se mantiene porque es gratis.)
- **RN-05. Mismo receptor (D-5).** Si no coincide: `409`, `reason: FACTURA_OTRO_RECEPTOR`, mensaje "La factura <numero> es de <dNomRec> (<documento>), no del destinatario de esta nota".
- **RN-06. Repetidos y tope.** Sin CDC repetidos; hasta 10 (D-7). `400`.
- **RN-07. Errores de la consulta.** `429` de FE: FS espera `Retry-After` (hasta 5 s) y reintenta una vez; si persiste, `503` "SIFEN esta ocupado, intenta en unos segundos". `409 CERTIFICADO_NO_DISPONIBLE`, `502`/`503`/`504` de FE: `503`, `reason: SIFEN_NO_DISPONIBLE`, "No se pudo consultar SIFEN. Reintenta en unos segundos o emiti la nota con fecha prevista". `403`: D-6. Nunca se emite la nota con una asociada sin verificar.
- **RN-08. Respuesta de la verificacion.** `{ cdc, numero: "est-pto-numero", fecha, receptor: { documento, nombre }, total, moneda, en_fs: { documento_id } | null, verificada_en }`.
- **RN-09. Emision.** Con `facturas_asociadas` no vacio: cada CDC pasa RN-01 a RN-06 en el servidor (cache D-4); se manda `documentosAsociados` y **no** `fechaFuturaFactura`; `fecha_futura_factura` deja de ser obligatoria. Sin asociadas: como hoy (RN-09 de la remision).
- **RN-10. Snapshot y ficha.** `fiscal_request_snapshot.documentosAsociados` queda como lo pide FE (RN-05 de la remision). `resumenRemision` suma `facturas_asociadas: [{ cdc, numero, documento_id | null }]`; la ficha las lista.
- **RN-11. Respuesta de FE al emitir.** `422 INVALID_REFERENCED_DOCUMENT`, `422 INVALID_REFERENCED_RECEIVER`, `409 INVALID_REFERENCED_DOCUMENT_STATUS` (con `details.cdc` desde `segel-rc4.35`) y, con FE anterior a `segel-rc4.35`, `404 REFERENCED_DOCUMENT_NOT_FOUND`: la nota queda `ERROR_OPERATIVO` con el mensaje "FE no acepto la factura asociada <cdc>: <motivo>" (el worker ya lleva los `422` a `ERROR_OPERATIVO`, CA-06 de la remision). Sin `details.cdc` (FE vieja), se nombra el primer asociado.
- **RN-12. Rechazo de SIFEN** (2439, 2441 u otro sobre `gCamDEAsoc`) despues de numerar: flujo actual de rechazo (RECHAZADA, inutilizar el numero); el motivo se ve en la ficha como hoy.

## Respuesta de FE (2026-11-12, sesion `facturacion-electronica-a7`, PEDIDO §12.3, repo de FE `8e64295`)

| # | Pregunta | Respuesta de FE (verificada por FE en `segel-rc4.34`) | Efecto |
|---|---|---|---|
| a | Validaciones y codigos con un CDC externo | Propuesta (sin SPEC de FE aun): `validateCdc` (44 digitos, numerico, tipo 01, DV modulo 11) y RUC+DV del CDC = `emisor_id` → `422 INVALID_REFERENCED_DOCUMENT` **con `details.cdc`**. Lo que necesita SIFEN (existe 2403, aprobada, mismo receptor 2441) se decide en (c). Para un CDC que si esta en la base no cambia nada, pero los cuatro rechazos pasan a traer `details.cdc`. El `404 REFERENCED_DOCUMENT_NOT_FOUND` deja de darse en la NRE: unico cambio de comportamiento, declarado aditivo | RN-11 actualizada: `404` solo con FE anterior a `segel-rc4.35` |
| b | `fechaFuturaFactura` con asociada externa | Confirmado: obligatoria solo con motivo 1 **y** sin `documentosAsociados` (2605); si se manda igual, rige 2604 | RN-09 sin cambios |
| c | Quien consulta SIFEN | FE recomienda hacerlo **FE antes de numerar**, reutilizando el caso de uso de §31 con el certificado del emisor (APROBADO, `iTiDE` 1, `dRucEm` = emisor, receptor sin DV). Costo: una consulta a SIFEN por asociado dentro de la emision (1 a 3 s, mismo cupo de §31); si SIFEN no responde, `503`/`504` sin numerar y FS reintenta con la misma clave. En carga masiva de NRE con asociados habria que serializar. **Decision del usuario (D-NRE2-1 en FE)**; mientras tanto FS mantiene RN-02 a RN-05 | D-1 (ver "Decision pendiente") |
| d | Permiso, certificado, limite, campos | `SIFEN_DE_CONSULTA` lo dio la migracion 041 (2026-10-23) a los consumidores que existian; los creados despues (RAJ, SALUMAX, LA MARY en `segel-fs`, noviembre) solo tienen lo que el administrador les asigno: **puede faltar**; se comprueba con una llamada a §31 (`403` sin permiso). Certificado: el mismo de la emision. Limite 1/s, rafaga 5, por instancia, sin cambios. `gDatRec` trae `iNatRec`, `dRucRec`/`dDVRec` o `iTipIDRec`/`dNumIDRec` (MT150 D2.2). Ejemplo `tecnica/ejemplos/get_consultar_de-sifen_cdc/ok.json` | D-2 y D-6 confirmadas; comprobar el permiso por facturador antes de habilitar (en produccion, solo con autorizacion) |
| e | Tag y fecha | Guia §68, paquete v0.53, tag `segel-rc4.35`, despues de mergear `docs/nc-parcial-por-monto`. FE necesita su cadena `SPEC/PLAN/TASKS_NOTA_REMISION_NRE_v0.2`; cadena, codigo y fecha esperan la **orden del usuario en la sesion de FE**. El despliegue en `fe-segel` lo hace FS con `FE_REF=segel-rc4.35`. Sin fecha comprometida | NRA-009 |

**Verificacion de FS (2026-11-12, FE local `fe-segel` `segel-rc4.34`, SIFEN test, consumidor del ensayo `5057016-1`):** `GET /v1/consultar/de-sifen/<cdc de 1010665>?emisor_id=5057016-1&env=test` respondio `200`, `estado: APROBADO`, `dCodRes 0422`, `desde_cache: false`. El `xml_rde` (9,4 KB, sin prefijos de namespace) trae `iTiDE` 1, `dRucEm` 5057016 / `dDVEmi` 1, `dEst` 001, `dPunExp` 001, `dNumDoc` 1010665, `dFeEmiDE`, `iNatRec` 1, `dRucRec` 80026570 / `dDVRec` 0, `dNomRec` SEGEL SA, `dTotGralOpe` 242300, `cMoneOpe` PYG; `iTipIDRec`/`dNumIDRec` ausentes (receptor contribuyente). El consumidor del ensayo tiene `SIFEN_DE_CONSULTA`. D-2 queda confirmada con un documento real.

## Decision del usuario D-NRE2-1 (2026-11-12): opcion A

Quien comprueba contra SIFEN que la factura externa existe, esta aprobada y es del mismo receptor. Elegida la **A**; comunicada a FE el mismo dia y **registrada por FE** en `PEDIDO_FACTURACION_SIMPLE_COBERTURA_MT150_v0.1` §12.4 (repo de FE `6768dd6`, sin push) con el alcance fijado de BL-213: `validateCdc` + RUC del CDC = `emisor_id`, consulta a SIFEN con el caso de uso de §31 antes de numerar (APROBADO, `iTiDE` 1, `dRucEm` = emisor, receptor sin DV), rechazos `422`/`409` con `details.cdc`, el `404` deja de darse, `fechaFuturaFactura` opcional. FE no arranca su cadena NRE v0.2 hasta la orden del usuario en su sesion. Las otras opciones quedan como registro.

- **Opcion A (elegida): FE antes de numerar, y FS ademas verifica en pantalla.** FE es la fuente de verdad al emitir (una regla, sin numero gastado, vale tambien para la carga masiva de NRE); FS conserva el boton "Verificar" con §31 para mostrar numero, receptor y total y frenar el error antes de llenar el resto del formulario (la emision de FS es asincronica por el outbox: sin esa verificacion previa el operador se enteraria del rechazo en la ficha, como `ERROR_OPERATIVO`). Costo: dos consultas a SIFEN por factura externa (una en pantalla, una en FE), dentro del cupo de 1/s.
- **Opcion B: solo FS** (lo escrito en D-1 hoy). FE no consulta SIFEN; FS verifica en pantalla y otra vez al emitir. FE solo valida formato y emisor. Menos cambio en FE; dos fuentes de verdad y la carga masiva de NRE queda sin control.
- **Opcion C: solo FE.** FS no parsea XML (D-2 y PLAN 3 se eliminan) y no ofrece "Verificar": el rechazo llega a la ficha como `ERROR_OPERATIVO`. Mas simple, peor para el operador.

## Criterios de aceptacion

- **CA-01.** Factura aprobada en SIFEN test **emitida fuera de FS** (por ejemplo, desde el frontend de FE o la carga del POS) para el cliente X: en la nota, pegar su CDC y "Verificar" muestra numero, fecha, receptor y total; emitir con esa asociada y sin fecha prevista; FE (con BL-213) la numera y SIFEN la aprueba; el KUDE de la remision muestra la factura asociada.
- **CA-02.** CDC con DV incorrecto, CDC de una nota de credito (`05`) y CDC de otro RUC: rechazados en pantalla sin llamar a FE, con el mensaje de RN-01.
- **CA-03.** CDC valido de una factura del cliente Y: `409 FACTURA_OTRO_RECEPTOR` con el nombre del receptor real; no se emite.
- **CA-04.** CDC inexistente en SIFEN (bien formado): `409 FACTURA_NO_APROBADA`.
- **CA-05.** Factura de FS del mismo cliente elegida del buscador: se asocia sin consultar SIFEN (sin llamada a `/consultar/de-sifen`), emitida y aprobada.
- **CA-06.** Dos asociadas (una externa y una de FS) en la misma nota; la ficha las lista y la de FS enlaza a su ficha.
- **CA-07.** FE sin BL-213 (o FE caido en §31): mensajes de RN-07/RN-11 sin consumir numero (`404` antes de numerar, confirmado por FE).
- **CA-08.** Playwright 1440, 1280 y 390: seccion "Facturas asociadas" sin desplazamiento horizontal; "Fecha prevista" se oculta al asociar y vuelve al quitar.
