# SPEC Nota De Credito Sobre Factura Externa v0.1

**Fecha:** 2026-11-12 · **BACKLOG:** FS-138 · **Pedido del usuario (2026-11-12):** emitir notas de credito (total, por items o por monto) sobre facturas que no estan en FS. La factura se **trae** de dos formas: **desde SIFEN por CDC** (consulta de FE, guia §31: datos reales y firmados) o **a mano** (el operador la carga). · **Prioridad:** antes que FS-137 (remision), decision del usuario. · **Estado:** refinada; FE respondio los puntos a-d el 2026-11-12 (ver "Respuesta de FE"). **ESPERA usuario:** orden de implementar en FS y orden a FE en su sesion (un solo cambio `segel-rc4.35` con NC primero, o NC en rc4.35 y NRE en rc4.36). El camino a mano con referencia **impresa** no depende de FE, pero FS **debe** validar formatos (FE no lo hace antes de numerar).

## Alineacion

- `docs/SPEC_NOTA_CREDITO_PARCIAL_v0.1.md` (por lineas), `docs/SPEC_NOTA_CREDITO_POR_MONTO_v0.1.md` (por monto, FS-136), `docs/SPEC_NOTA_CREDITO_TRABADA_v0.1.md` (clave y reintento), `docs/SPEC_MONEDA_EXTRANJERA_v0.1.md`, `docs/SPEC_DESCUENTOS_FACTURA_v0.1.md` RN-09 (con descuento, la total va por referencia a FE: **no aplica a facturas externas**).
- `docs/SPEC_REMISION_FACTURA_ASOCIADA_CDC_v0.1.md` (FS-137): comparte la **base "factura por CDC"** (validacion del CDC, consulta §31, lectura del `rDE`). Esa base se implementa en esta cadena primero (NCX-001 a NCX-003) y FS-137 la reutiliza.
- Guia de FE: §6 (`POST /v1/nota-credito`: `referencia` `ELECTRONICO` con `cdc` o `IMPRESO` con `timbrado`, `establecimiento`, `puntoExpedicion`, `numero`, `fecha`; el receptor de la nota no puede ser innominado; items sin `descuento`); §31 (consulta por CDC); §67 (por monto).
- Codigo de FE `segel-rc4.34` (leido el 2026-11-12): `issue-nce.use-case.ts` usa `resolveReferencedFactura` → `404 REFERENCED_DOCUMENT_NOT_FOUND` si el CDC no esta en su base; con la factura en su base controla receptor (`assertSameReceptor`), moneda (2438) y suma de notas (`CREDIT_NOTE_TOTAL_EXCEEDED`, 2417). Con `tipo: IMPRESO` no busca nada (`validateReferencedDocument` sale si no hay referenciada).

## Situacion actual

Una nota de credito en FS nace solo de una factura **emitida por FS** (`FACTURA`, `EMITIDA`, con `cdc`). Las facturas emitidas por otros sistemas (o impresas) no se pueden acreditar desde FS.

## Objetivo

Que el operador traiga a FS una factura que no emitio FS, con datos fiables cuando vienen de SIFEN, y la acredite con los mismos tres modos de nota (total, por lineas, por monto), el mismo saldo y la misma ficha que una factura propia.

## Alcance (v0.1)

0. **Iteraciones (instruccion del usuario, 2026-11-12):** en esta iteracion se documenta de punta a punta (SPEC, PLAN a nivel de implementacion fina, TASKS); la implementacion es la iteracion siguiente.
1. **Factura externa como documento de FS.** Se guarda en `facturas_operativas` como `tipo = 'FACTURA'`, `estado = 'EMITIDA'`, con `origen` (`SIFEN` o `MANUAL`), sin `document_uuid` ni `fiscal_document_id`, con su receptor, lineas y totales. Desde ahi, **todo el flujo de nota de credito existente aplica sin ramas nuevas** (candidatas, saldo por lineas y por monto, ventana Total / Parcial / Por monto, ficha con sus notas).
2. **Traer desde SIFEN por CDC** (`origen = SIFEN`): pantalla "Traer factura" en Notas de credito: campo CDC → FS valida (formato, DV, tipo 01, RUC del facturador) → consulta §31 con la clave del facturador → muestra la factura leida del `rDE` (receptor, lineas con cantidad, precio, descuentos e IVA, totales por tasa, moneda y tipo de cambio) **sin edicion** → "Guardar". Lineas y totales salen del XML, no se recalculan.
3. **Cargar a mano** (`origen = MANUAL`): la misma pantalla con el formulario del editor de factura (cliente de la agenda o nuevo, lineas, moneda), mas la **referencia**: electronica (CDC, con las mismas validaciones de formato) o **impresa** (timbrado 8 digitos, establecimiento, punto, numero de 7 digitos, fecha). Los totales los calcula FS como en Nueva factura. Se guarda sin emitir nada. En los dos caminos, al guardar se abre la ficha de la factura en Documentos, que ya tiene "Crear nota de credito" con la ventana Total / Parcial / Por monto (PLAN 7).
4. **Nota de credito sobre la externa:** `POST /facturas/:id/nota-credito` como hoy. Con referencia electronica, `referencia { tipo: ELECTRONICO, cdc }` (como hoy); con impresa, `referencia { tipo: IMPRESO, ... }`. Nunca por referencia (`/nota-credito/total`): FE no tiene la factura.
5. **Ficha y listados:** pastilla "Externa · de SIFEN" / "Externa · cargada a mano"; sin KUDE, XML, enlace publico, correo, anulacion ni inutilizacion (no es un documento de FS en FE); "Desde esta factura" ofrece solo "Crear nota de credito".

## Fuera de alcance

- Traer una factura externa para otra cosa que no sea la nota de credito (recibos, remision: FS-137 tiene su propio uso de la base).
- Nota de debito.
- Editar una factura externa ya guardada (se elimina y se vuelve a traer, solo si no tiene notas).
- Notas de credito emitidas por otros sistemas sobre la misma factura: FS no las conoce (ver "Riesgos").

## Decisiones

| ID | Tema | Decision | Motivo |
|---|---|---|---|
| D-1 | Modelo | La factura externa es un documento `FACTURA` mas, con `origen` y sin identidad en FE | Reutiliza intacto el flujo de NC (tres modos, saldo, clave de idempotencia por factura, ficha); evita un segundo modelo de "factura referenciada" |
| D-2 | Datos de SIFEN | Del `rDE` se toman tal cual: receptor (`gDatRec`), cada `gCamItem` (`dCodInt`, `dDesProSer`, `dCantProSer`, `dPUniProSer`, `dDescItem`, `dDescGloItem`, `dTotOpeItem`, `iAfecIVA`, `dTasaIVA`, `dPropIVA`), `gTotSub` (gravadas, IVA, exenta, exonerada, descuentos, redondeo, total), `cMoneOpe`, `dTiCam`, `iCondOpe`. `totals.fuente = "SIFEN"`. Verificado el 2026-11-12 con la factura 1010665 en `fe-segel` | Son los montos que SIFEN aprobo; recalcular en FS solo podria introducir diferencias |
| D-3 | Nota **total** sobre externa con descuentos | **Con FE `segel-rc4.35` o posterior** (declara `descuento` y `descuentoGlobal` en la NC): la total **copia las lineas reales** del `rDE` con sus descuentos, como la factura. **Con FE anterior:** FE descarta `descuento` en silencio y la nota saldria por el bruto; por eso FS **no manda `descuento` en ninguna NC** hasta rc4.35 y arma la total **por tasa** (reparto de §67 sobre el total neto, motivo 1) con las lineas `AJ-IVA10`/`AJ-IVA5`/`AJ-EXE` y descripcion "Devolucion total de la factura <numero>". La version de FE se detecta por `GET /me/context` → `fe_version`/capacidad (ver PLAN 5) | Respuesta de FE (b): el mapper ya soporta descuentos (los usa `/nota-credito/total`); declararlos en el schema es aditivo y entra en el mismo cambio. Mandarlos antes es peligroso: no hay error |
| D-4 | Nota **por lineas** sobre externa con descuentos | **Con rc4.35+:** precio bruto y `descuento` por unidad del `rDE`, como en la factura; el prorrateo del global (`dDescGloItem`) va como `descuentoGlobal` proporcional a lo acreditado. **Con FE anterior:** la linea con descuento se **bloquea** en la ventana con "Esta linea tiene descuento: usa la nota por monto"; las lineas sin descuento se acreditan como hoy | FE no valida ni avisa si descarta el descuento; por monto cubre el caso mientras tanto |
| D-5 | Saldo por monto sin FE | `emitNotaCreditoPorMonto` y `getNotaCreditoSaldo` usan `totals` guardados (`fuente SIFEN` o `MANUAL`) cuando la factura no tiene `document_uuid`; las notas emitidas sobre ella si piden `/totales` a FE (son de FE) | No hay `/totales` de una factura que FE no tiene |
| D-6 | Carga a mano: fiabilidad | Se avisa en la pantalla y en la ficha "Cargada a mano: los datos no fueron verificados en SIFEN". Para una referencia electronica a mano se exige CDC valido; si §31 esta disponible, se ofrece "Traer de SIFEN" antes de guardar | El usuario pidio los dos caminos; el riesgo de un dato mal tipeado es del operador |
| D-7 | Duplicados | No se guarda una externa si ya existe en FS una factura con ese `cdc` (propia o externa) o la misma referencia impresa del facturador: `409 FACTURA_YA_EXISTE` con el enlace | Una factura, un saldo |
| D-8 | Receptor innominado o del exterior | Si el `rDE` trae receptor innominado (`iNatRec` 2 con `dNumIDRec` 0 / tipo 5) o B2F, se guarda igual pero la NC se rechaza con el mensaje actual de FS (`MENSAJE_NOTA_CREDITO_INNOMINADA`; B2F segun moneda extranjera) | Misma regla que para facturas propias (SPEC_COMPRADOR_INNOMINADO RN-06) |
| D-9 | Verificacion fiscal | Una externa no entra al worker de verificacion ni a `refreshDocumentoStatus` (sin `document_uuid`); `origen` lo bloquea aunque tenga `cdc` | FE responderia `404` por CDC |
| D-10 | Quien controla contra SIFEN al emitir (camino CDC) | Como D-NRE2-1 de FS-137: **FE** valida antes de numerar con §31 (aprobada, tipo 01, mismo emisor, mismo receptor, moneda) y **FS** ya lo verifico al traerla `[FE]` | Una sola regla fiscal al numerar; FS no gasta numero |

## Reglas

- **RN-01. CDC.** Normalizacion, 44 digitos, DV modulo 11, tipo `01`, RUC y DV del facturador (misma funcion compartida que FS-137 RN-01). `400` con `details.motivo`.
- **RN-02. Consulta.** `GET /v1/consultar/de-sifen/{cdc}?emisor_id=` con la clave del facturador; `estado` distinto de `APROBADO` → `409 FACTURA_NO_APROBADA`; `404 CDC_INEXISTENTE` → `409 FACTURA_NO_APROBADA`; `403`/sin clave → `409 SIFEN_CONSULTA_NO_DISPONIBLE` ("Este facturador no puede consultar SIFEN. Pedilo a Segel"; queda el camino a mano); `429`/`5xx` → `503 SIFEN_NO_DISPONIBLE` con reintento unico.
- **RN-03. Lectura del `rDE`.** `iTiDE` = 1 y emisor = facturador (si no, `409 FACTURA_NO_PROPIA`); receptor, items y `gTotSub` como D-2; `cMoneOpe`/`dTiCam` → `moneda`/`tipo_cambio`. Un campo obligatorio ausente → `503` con log (cambio de formato).
- **RN-04. Guardado.** `POST /facturas/externas` `{ origen: "SIFEN", cdc }` o `{ origen: "MANUAL", referencia: { tipo: "ELECTRONICO", cdc } | { tipo: "IMPRESO", timbrado, establecimiento, punto, numero, fecha }, cliente, items, moneda, tipo_cambio, descuento_global? }`. Responde `DocumentoResponse` con `origen`, `estado EMITIDA`, `numero_fiscal` (`est-pto-numero` del CDC o de la referencia), `fecha_emision` (del `dFeEmiDE` o de la referencia), `fiscal_response_snapshot` con `{ sifen: { dProtAut, dFecProc }, consultado_en }` (SIFEN) o `null` (MANUAL). RN-07 de D-7.
- **RN-05. Manual.** Mismas validaciones de receptor (RV-01 a RV-08) y lineas que Nueva factura; referencia impresa: **timbrado 8 digitos, establecimiento y punto 3 digitos, numero 7 digitos, todos con ceros a la izquierda, fecha `AAAA-MM-DD` obligatoria y no futura** (MT150 H011-H014). **FE no valida estos formatos antes de numerar** (respuesta c): un formato malo falla en la generacion del XML con el numero ya tomado, asi que la validacion de FS es obligatoria y bloqueante, tambien al emitir la nota. Referencia electronica: RN-01. Sin emision: no se encola nada.
- **RN-06. Nota de credito.** Elegibilidad y saldo como hoy. Con `origen`: `por_referencia` nunca; la **total** se arma por tasa (D-3) salvo que la factura no tenga descuentos ni exonerados, en cuyo caso copia las lineas como hoy; **por lineas** con D-4; **por monto** con D-5. Referencia impresa → `referencia { tipo: IMPRESO, ... }` en el gateway; electronica → `cdc`.
- **RN-07. Clave de idempotencia.** `buildNotaCreditoExternalRef(context, facturaId, intento)` con el `id` de la externa: no cambia.
- **RN-08. Respuesta de FE al emitir sobre externa electronica.** Con FE anterior a rc4.35: `404 REFERENCED_DOCUMENT_NOT_FOUND` → `409` "El servicio fiscal todavia no acepta notas sobre facturas emitidas en otro sistema" sin numerar. Con rc4.35 (respuesta a, todos con `details.cdc`, antes de numerar): `422 INVALID_REFERENCED_DOCUMENT` (CDC/emisor invalido, inexistente en SIFEN 2403, no es factura, moneda distinta 2438 con `details.moneda_factura`), `409 INVALID_REFERENCED_DOCUMENT_STATUS` (no aprobada), `422 INVALID_REFERENCED_RECEIVER` (2441), `422 UNIDENTIFIED_REFERENCED_RECEIVER` (innominada, 1331), `409 CREDIT_NOTE_TOTAL_EXCEEDED` (FE suma **sus** NC sobre ese CDC contra `dTotGralOpe` neto del `rDE`) → FS los traduce a `409` con el mensaje por codigo, como RN-05 de la parcial.
- **RN-09. Ficha y listados.** `origen` visible (pastilla y texto de D-6); acciones limitadas (alcance 5); "Eliminar factura externa" solo sin notas (borrado logico).
- **RN-10. Permisos.** Traer/cargar una externa requiere el permiso de emitir nota de credito (mismo que `POST /facturas/:id/nota-credito`).

## Riesgos (se aceptan, se documentan)

- **Notas de otros sistemas** sobre la misma factura: ni FS ni FE las conocen; si la suma supera el total, SIFEN rechaza con 2417 **despues** de numerar (RECHAZADA, inutilizar). Regla operativa: una vez traida a FS, las notas de esa factura salen solo de FS.
- **Carga a mano** con datos distintos de los de SIFEN: la nota puede ser rechazada por SIFEN (receptor 2441, moneda 2438, total 2417). D-6.

## Respuesta de FE (2026-11-12, sesion `facturacion-electronica-a7`, PEDIDO §12.5, repo de FE `34dc386`, verificada en `segel-rc4.34`)

| # | Respuesta | Efecto |
|---|---|---|
| a | Si, con el criterio de D-NRE2-1 = A y como **un solo cambio con BL-213**: la busqueda de la factura es el guard compartido `resolveReferencedFactura` de NC, NDE y NRE; la "factura externa" y la consulta §31 en la emision se hacen una vez, **NC primero**. Codigos: ver RN-08. El `404` deja de darse. Tope 2417: FE suma sus propias NC sobre ese CDC contra `dTotGralOpe` (neto) del `rDE`; las notas de otros sistemas quedan como riesgo de FS. `/nota-credito/total` no sirve para externas | RN-08, D-10 |
| b | **Hoy `descuento` y `descuentoGlobal` NO entran por `POST /v1/nota-credito`:** el schema no los declara y descarta lo desconocido, **sin error**; la nota saldria por el bruto. El mapper ya los soporta; declararlos es aditivo y entra en el mismo cambio (con las reglas de la factura; tambien `afectacionIva`/`proporcionGravada`, que hoy se descartan). **Hasta rc4.35 no mandar `descuento`.** Para el tope, FE compara la NC en neto | D-3, D-4 reescritas; PLAN 5 (capacidad por version de FE) |
| c | Con `IMPRESO` no hay busqueda ni control de suma. Zod solo exige cadenas no vacias; `fecha` opcional. **Los largos (H011-H014) no se validan antes de numerar:** un formato malo falla en xmlgen con el numero tomado. Mandar ceros a la izquierda. FE suma esas validaciones al schema en el mismo cambio | RN-05 reescrita: FS valida y bloquea |
| d | Un solo cambio `segel-rc4.35` / guia §68 con BL-213 ampliado a "documento asociado externo en NC, NRE y NDE" (guard, §31 en la emision, `details.cdc`, descuentos en la NC, formatos del impreso). Si el usuario quiere la NC sola antes: rc4.35 NC y rc4.36 NRE, en serie. Lo decide el usuario en la sesion de FE con la orden de arrancar | NCX-010 |

## Criterios de aceptacion

- **CA-01.** Factura aprobada en SIFEN test **emitida fuera de FS** (frontend de FE o POS) para el cliente X, con IVA 10/5/exento y descuentos: "Traer factura" por CDC la muestra con receptor, 3 lineas y totales iguales al KUDE; se guarda como `origen SIFEN`; aparece en candidatas; la ficha dice "Externa · de SIFEN".
- **CA-02.** Sobre esa externa: nota **por monto** de 100.000 aprobada (FE con el cambio `[FE]`); nota **total** por el saldo armada por tasa, aprobada; la factura queda acreditada por completo.
- **CA-03.** Externa sin descuentos (traida por CDC): nota **por lineas** de 1 unidad aprobada, con el precio de la factura.
- **CA-04.** CDC con DV malo, de una NC, o de otro RUC: `400` en pantalla sin consultar; CDC inexistente en SIFEN: `409 FACTURA_NO_APROBADA`; CDC de una factura ya en FS: `409 FACTURA_YA_EXISTE` con el enlace.
- **CA-05.** Carga a mano con referencia **impresa** (timbrado/est/pto/numero/fecha de una factura preimpresa del facturador) y dos lineas: se guarda como `origen MANUAL`; nota total emitida con `referencia IMPRESO` y **aprobada en SIFEN test** (no depende de FE).
- **CA-06.** Carga a mano con referencia electronica (CDC valido): se guarda con el aviso de D-6; con FE sin el cambio, la nota responde el `409` de RN-08 sin numerar.
- **CA-07.** La externa no tiene KUDE, enlace, correo ni anulacion; no entra al worker de verificacion (log sin consultas a FE por su CDC).
- **CA-08.** Playwright 1440, 1280 (Traer factura y Cargar a mano) y 390 (Traer factura) sin desplazamiento horizontal.
