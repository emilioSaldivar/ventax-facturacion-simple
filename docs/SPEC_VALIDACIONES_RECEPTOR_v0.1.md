# SPEC - Validaciones del receptor antes de emitir v0.1

Estado: borrador del 2026-11-11, escrito con las reglas confirmadas por FE ese dia. Critico por decision del usuario (2026-11-11). Reemplaza y amplia FS-62 del BACKLOG; incorpora FS-60.

## Origen

El 2026-11-11 una operadora de RAJ SA cargo en `segel-fs` un cliente con RUC `xxx`. FS lo acepto (la agenda exige 2 caracteres y la factura 1) y lo mando a FE. FE `segel-rc4.32` lo rechazo con `500 ISSUE_FE_FAILED` "RUC requiere dv o docNro con formato base-dv" **despues de numerar**: la factura 001-001-0000745 quedo como borrador en FE y FS la trato como error temporal (caso cerrado a mano; ver FS-61 y FS-63).

FE confirmo el 2026-11-11 que en la factura **no verifica el digito verificador del receptor** y que controla la forma `base-dv` recien al armar el XML, despues de numerar. Lo registro como defecto propio. Mientras tanto, y como regla permanente, FS debe validar los datos del receptor **antes** de llamar a FE, en todo documento que los lleve.

Decision del usuario (2026-11-11): validar RUC con DV en todos los documentos que soporten RUC; evitar caracteres especiales y espacios en el correo; validar tambien direccion y telefono; toda iniciativa de documento nuevo nace con sus validaciones. Las reglas y valores los define FE segun el MT150; FS los reproduce.

## Contrato de FE (consumer-docs v0.49, `segel-rc4.32`; confirmaciones de la sesion de FE del 2026-11-11)

Fuente en FE: `src/domain/factura.schema.ts` (receptor 347-367, domicilio 290-310) y `src/domain/nota-remision.schema.ts` (receptor 61-76). No hay un catalogo por campo; estas son las reglas vigentes:

| Campo | Factura (`POST /v1/factura`) | Nota de remision (`POST /v1/nota-remision`) | MT150 |
|---|---|---|---|
| RUC del receptor | `dv` o `docNro` con forma `base-dv`; **no calcula el DV**; base de 3 a 8 caracteres exigida por xmlgen, despues de numerar | Igual; el receptor es `.strict()` (un campo de mas da 422) | D206, D207 |
| RUC del transportista (NRE) | — | `^[0-9A-Z]{3,8}-\d$`, DV verificado con el **modulo 11 de SIFEN**; 422 antes de numerar con el DV correcto en el mensaje | 4318 |
| CI y otros documentos | `docNro` string, minimo 1; no exige solo digitos | Igual | D206 (1 a 20) |
| Razon social | Minimo 1 | 4 a 255 con `trim` | D211 (4 a 255) |
| Correo | `z.string().email()` opcional; `""` se toma como nulo | Igual | — |
| Telefono | Quita todo lo que no es digito; no valida largo | `^\d{6,15}$` | D214 (6 a 15) |
| Direccion | String opcional sin largo validado; sola no se transmite | 1 a 255 con `trim`, obligatoria | D213 (1 a 255) |
| Numero de casa | `^\d{1,6}$`; "0" si no tiene | Igual, obligatorio | D218 |
| Departamento, distrito, ciudad | Codigos de `GET /v1/parametrizaciones/geografia`; si llega alguno de numeroCasa, departamento, distrito o ciudad, el domicilio viaja completo y pasan a ser obligatorios direccion, numeroCasa, departamento y ciudad (1328) | Obligatorios departamento y ciudad; distrito opcional (se toma el de la ciudad) | D219 a D224 |
| Celular | 10 a 20 caracteres | — | D215 |
| Innominado | `INNOMINADO`, `docNro "0"`, "Sin Nombre"; tope Gs. 7.000.000 | No se acepta (1331) | D208 |

Los codigos de geografia son estables: cambian solo con una version nueva del catalogo (`version` en la respuesta). FS puede guardarlos y refrescar el catalogo una vez al dia.

Modulo 11 de SIFEN para el DV del RUC (el que FE aplica al transportista): se recorre la base de derecha a izquierda multiplicando cada digito por 2, 3, ... 11 y volviendo a 2; resto = suma mod 11; DV = 0 si el resto es 0 o 1, si no 11 - resto. Pendiente con FE: como trata las letras de `[0-9A-Z]` (la SET usa el codigo ASCII del caracter).

## Reglas

Todas las reglas se aplican **antes** de llamar a FE, en la API y en la interfaz, con el mismo algoritmo en los dos lados.

- **RV-01. RUC con digito verificador.** Con `documento_tipo = RUC`, el documento se normaliza (RV-07) y debe tener la forma `base-dv`: base de 3 a 8 caracteres `[0-9A-Z]`, guion, un digito. El DV debe coincidir con el modulo 11 de SIFEN sobre la base. Si no coincide, se rechaza con el DV que corresponde en el mensaje: "El RUC 80012345-1 no es válido: el dígito verificador que corresponde es 0". Si falta el DV: "Falta el dígito verificador del RUC. Ejemplo: 80012345-0". FS **no completa ni corrige el DV por su cuenta**: solo el padron de la DNIT puede completarlo (RV-10). Mientras FE no confirme el tratamiento de las letras, una base con letras se acepta solo si el DV coincide tratando cada letra como su codigo ASCII, y se anota en el PLAN como riesgo.
- **RV-02. Otros documentos de identidad.** `CI`: solo digitos, de 1 a 20. `PASAPORTE`, `CEDULA_EXTRANJERA`, `CARNET_RESIDENCIA`: de 1 a 20 caracteres `[0-9A-Z]`, sin puntos, espacios ni guiones. `NO_ESPECIFICADO`: de 1 a 20 caracteres `[0-9A-Z]`. `INNOMINADO`: lo fija el servidor (`SPEC_COMPRADOR_INNOMINADO_v0.1` RN-03) y no se valida aqui.
- **RV-03. Correo.** Se recorta y, si queda vacio, es "sin correo". Si tiene algo: sin espacios ni caracteres de control, un solo `@`, al menos un punto despues del `@`, maximo 180 caracteres en la agenda y 240 en la factura (limites actuales), y debe pasar la misma regla que el `email()` de Zod en la API. Mensaje: "El correo no es válido. Revisá que no tenga espacios y que tenga la forma nombre@dominio". Se guarda tal como se escribio, recortado (la columna ya es `citext`).
- **RV-04. Telefono.** Se normaliza a solo digitos (se quitan `+`, espacios, guiones, puntos y parentesis). Si queda vacio, es "sin telefono". Si tiene algo, debe tener de 6 a 15 digitos. Mensaje: "El teléfono tiene que tener entre 6 y 15 números. Ejemplo: 0981123456 o 595981123456". Se guarda normalizado (solo digitos), que es lo que FE transmite y lo que ya usa el boton de WhatsApp.
- **RV-05. Razon social o nombre.** Se recorta y los espacios repetidos se reducen a uno. Debe tener de 4 a 255 caracteres. Mensaje: "El nombre o razón social tiene que tener entre 4 y 255 caracteres". No aplica al innominado.
- **RV-06. Domicilio.** Si hay direccion, se recorta y debe tener de 1 a 255 caracteres. Numero de casa, cuando exista el campo: `^\d{1,6}$`, con "0" si no tiene; mensaje "El número de casa son hasta 6 números; poné 0 si no tiene". Departamento, distrito y ciudad, cuando existan los campos: codigos del catalogo de geografia de FE, con la ciudad dentro del distrito y del departamento; se eligen de listas, no se tipean. En la factura rige la regla de FE: si se informa cualquiera de numero de casa, departamento, distrito o ciudad, deben estar direccion, numero de casa, departamento y ciudad; si no, FS manda solo `direccion` como hoy (no se transmite). Donde se guardan estos campos en la agenda y como se usan en la nota de remision lo define `SPEC_NOTA_REMISION_v0.1`; esta SPEC define solo el formato.
- **RV-07. Normalizacion.** Antes de validar y de guardar: `trim` en todos los textos; RUC y documentos en mayusculas y sin puntos ni espacios (el guion del RUC se conserva; si el operador escribe la base y el DV sin guion, por ejemplo `800123450`, no se adivina donde va el guion: se pide la forma `base-dv`); telefono a digitos; espacios repetidos a uno en nombre y direccion. La normalizacion nunca cambia el significado de un valor: no se corrige un DV, no se recorta una base.
- **RV-08. Donde se aplica.** API: `POST /clientes`, `PATCH /clientes/{id}`, `POST /facturas`, `POST /facturas/preview`, `POST /facturas/{id}/recibo` y `POST /recibos` (pagador con `pagador_documento_tipo = RUC`: RV-01; nombre: RV-05), y toda ruta de documento nuevo (nota de remision, nota de debito, autofactura) desde su primera version. La nota de credito toma el cliente del snapshot de la factura y no se revalida. Web: agenda (alta y edicion), editor de factura (bloque Cliente), recibo desde la ficha y el formulario de cada documento nuevo. La carga masiva no cambia: valida FE.
- **RV-09. Mensajes y respuesta.** En la interfaz el mensaje va debajo del campo, al salir del campo y al intentar guardar o emitir; el boton principal queda deshabilitado con el motivo visible (patron RN-04 de `SPEC_UX_NUEVA_FACTURA_v0.1`). En la API, `400 VALIDATION_ERROR` con el campo y el mismo mensaje que la interfaz, antes de encolar nada: FE no recibe ningun documento con receptor invalido.
- **RV-10. Padron de la DNIT.** Al autocompletar un RUC desde el padron, el DV sale del padron. Si el operador escribio otro DV, se avisa: "Según la DNIT el dígito verificador es 0" y se ofrece corregirlo con un clic; no se cambia solo. Un RUC **no activo** en el padron se informa ("Este RUC figura como no activo en la DNIT") y el tipo de documento **no cambia solo de RUC a CI** (hoy pasa sin avisar, FS-60): el operador decide.
- **RV-11. Datos ya cargados.** Los clientes existentes que no cumplan estas reglas no se modifican ni se bloquean en el listado. `GET /clientes` devuelve por cliente `observaciones: string[]` (vacio si cumple) y la agenda muestra la pastilla "Revisar datos" con los motivos; al editar o al usarlo en un documento se exige corregirlo. Un documento ya emitido con datos que hoy serian invalidos no cambia (snapshot).

## Fuera de alcance

- Validar el RUC contra el padron como condicion para emitir (el padron no esta siempre al dia; solo se usa para completar y avisar).
- Cambiar los tipos de documento que admite la agenda (`cliente_identidades`), ni agregar `INNOMINADO` o `TARJETA_DIPLOMATICA` a la agenda.
- `celular`, `nombreFantasia`, `codigoCliente`, `documentoDescripcion` y `pais` del receptor de FE: FS no los manda hoy.
- Guardar el domicilio codificado en la agenda y las validaciones propias de la nota de remision: `SPEC_NOTA_REMISION_v0.1`.
- Corregir en FE la validacion tardia del DV: lo registra FE.

## Criterios de aceptacion

- CA-01. En la agenda y en el editor, un RUC con DV incorrecto (`80012345-1`) no se guarda ni se emite; el mensaje dice el DV correcto. El mismo RUC con DV correcto se acepta. RUC `xxx` y `80012345` (sin DV) se rechazan con sus mensajes.
- CA-02. Un correo con espacio o sin `@` se rechaza en la agenda, en el editor y en la API; `""` se guarda como sin correo.
- CA-03. Un telefono `+595 (981) 123-456` se guarda como `595981123456`; `12345` se rechaza; vacio se guarda como sin telefono.
- CA-04. Un nombre de 3 caracteres se rechaza; uno con espacios repetidos se guarda con uno solo.
- CA-05. Numero de casa `ABC` o de 7 digitos se rechaza donde exista el campo.
- CA-06. Con el gateway mock, ninguna llamada a `emitFactura` ni a `crearRecibo` recibe un receptor que incumpla RV-01 a RV-05 (prueba de API que intenta 10 receptores invalidos y cuenta 0 llamadas).
- CA-07. Al autocompletar desde el padron un RUC escrito con otro DV, aparece el aviso con el DV de la DNIT y el tipo de documento no cambia solo cuando el RUC esta no activo.
- CA-08. Un cliente existente con RUC `xxx` se lista con "Revisar datos" y "RUC sin dígito verificador"; al editarlo no se puede guardar sin corregirlo; al elegirlo en el editor se pide corregirlo antes de emitir.
- CA-09. Regresion: suites de api y web en verde; `playwright-ux-resto-app.cjs` casos `agenda`, `nuevo` y `ficha`; `playwright-nc-cuerpo.cjs`.
- CA-10. Escritorio primero: Playwright en 1440 y 1280, y 390 para agenda y editor.

## Decisiones pendientes

- D-1. Letras en la base del RUC: FS trata cada letra como su codigo ASCII (algoritmo de la SET) hasta que FE confirme. Si FE usa otra regla, se ajusta el algoritmo en los dos lados.
- D-2. Si el operador escribe solo la base del RUC y el padron no lo tiene, FS exige el DV (propuesta) en lugar de calcularlo: calcularlo haria pasar un RUC con un digito mal tipeado. El usuario puede preferir que FS lo complete y lo muestre para confirmar.
- D-3. Telefonos del exterior con mas de 15 digitos no existen en el E.164, asi que el tope de 15 alcanza; se confirma con el usuario que no haya clientes con telefonos "0981 123 456 int. 12" que hoy se guardan tal cual.
