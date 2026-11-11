# SPEC - Comprador sin nombre (innominado) en la factura v0.1

Estado: aprobado por el usuario el 2026-11-11 como hotfix de produccion (`segel-fs`).

## Origen

El 2026-11-11 una operadora de RAJ SA cargo en `segel-fs` una factura a un consumidor sin datos. La app no ofrece un tipo de documento para ese caso, asi que cargo el cliente como RUC `xxx`, "Sin nombre". FE respondio `500 ISSUE_FE_FAILED` ("RUC requiere dv o docNro con formato base-dv"), FS lo trato como error temporal y la factura quedo en "Requiere revision". FE ademas dejo numerado un borrador (001-001-0000745); ese numero lo resuelve FE (fuera de alcance de este SPEC).

El usuario pidio un hotfix para que la operadora pueda emitir a un comprador sin nombre de la forma que FE y SIFEN definen.

## Contrato de FE (consumer-docs, `segel-rc4.32`)

- Receptor innominado: `tipoDocumento: "INNOMINADO"`, `docNro: "0"`, `razonSocial: "Sin Nombre"` (coleccion Postman "Emitir FE SYNC - INNOMINADO"; MT150 D208 = 5).
- Tope: con total en guaranies de 7.000.000 o mas, `POST /v1/factura` responde `422 UNIDENTIFIED_RECEIVER_OVER_LIMIT` antes de numerar (NT024, SIFEN 1321). En moneda extranjera el tope es sobre el total por el tipo de cambio.
- Nota de credito: sobre una factura innominada FE responde `422 UNIDENTIFIED_REFERENCED_RECEIVER` sin numerar (guia §27). La via para anularla es cancelarla dentro del plazo.

## Reglas

- **RN-01.** El editor de factura ofrece el tipo de documento "Sin nombre" y, debajo del cliente, el texto "Consumidor final sin datos: no se guarda en la agenda y no admite nota de crédito". Al elegirlo, el documento queda en `0` y el nombre en `Sin Nombre`, los dos sin editar; no se busca en la agenda ni en el padron DNIT; la casilla de la agenda no se muestra y el cliente no se guarda en la agenda. Direccion, telefono y correo siguen siendo opcionales y editables (el correo sirve para entregar el documento).
- **RN-02.** Al volver a otro tipo de documento desde "Sin nombre", documento y nombre quedan vacios.
- **RN-03.** La API (`POST /facturas` y `POST /facturas/preview`) acepta `documento_tipo: "INNOMINADO"` y fija en el servidor `documento = "0"`, `razon_social = "Sin Nombre"`, `cliente_id = null` y sin naturaleza, sin importar lo que llegue.
- **RN-04.** Tope: si el total en guaranies (total, o total por tipo de cambio fuera de PYG) es 7.000.000 o mas, la API responde `400 VALIDATION_ERROR` con el mensaje "Una factura sin nombre tiene que ser menor a Gs. 7.000.000. Identificá al comprador con su RUC o CI." y no encola nada. El editor muestra el mismo motivo y no deja crear la factura.
- **RN-05.** Envio a FE: `tipoDocumento: "INNOMINADO"`, `docNro: "0"`, `razonSocial: "Sin Nombre"`, sin `dv` ni `naturaleza`.
- **RN-06.** Nota de credito: una factura cuyo cliente es innominado no es elegible. Motivo visible: "SIFEN no admite nota de crédito de una factura sin nombre. Para anularla, usá Anular dentro de las 48 horas." La API rechaza la total y la parcial con `409 CONFLICT`, `reason: NOTA_CREDITO_INNOMINADA`, sin llamar a FE. Anular (cancelacion) sigue disponible como hoy.
- **RN-07.** Donde se muestra el tipo de documento del cliente de un documento, `INNOMINADO` se lee "Sin nombre".

## Fuera de alcance

- Agenda: no se agrega el tipo (la base solo admite RUC, CI, PASAPORTE, CEDULA_EXTRANJERA y NO_ESPECIFICADO en `cliente_identidades`).
- Validar el formato base-dv del RUC al guardar clientes o facturas, y una accion para descartar facturas que nunca llegaron a FE. Quedan anotadas para su propia cadena.
- Carga masiva (FE valida el innominado en la planilla) y recibos.
- El borrador 0000745 de FE y la factura de RAJ que lo adopto (`3005fc26`): los resuelve FE con el usuario.

## Criterios de aceptacion

- CA-01. En el editor, elegir "Sin nombre" deja `0` y `Sin Nombre` bloqueados y oculta la casilla de agenda; la factura se crea y FE (mock) recibe `INNOMINADO` / `0` / `Sin Nombre`.
- CA-02. Con un total de Gs. 7.000.000 o mas (o su equivalente en USD), el editor no deja crear y la API responde 400 sin encolar.
- CA-03. Una factura innominada emitida no ofrece nota de credito y la API responde 409 `NOTA_CREDITO_INNOMINADA` a la total y a la parcial.
- CA-04. Los demas tipos de documento se comportan igual que antes (pruebas existentes en verde).
