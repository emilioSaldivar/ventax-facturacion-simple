# SPEC Autogestion del operador v0.1

**Fecha:** 2026-11-06, refinado el 2026-11-08. **Estado:** borrador con la decision del usuario sobre rechazos (seccion 0). Sin PLAN ni TASKS; no se implementa hasta que FE publique las rutas.
**Origen:** decision del usuario sobre FS-25 (`SPEC_CORRECCIONES_TRAS_FIXES_FE_v0.1`, D-1) y opinion de `facturacion-electronica` (FE) del 2026-11-06. FE no tiene nada de esto implementado ni en su orden de trabajo.

## 0. Decision del usuario sobre rechazos (2026-11-08)

1. Una factura rechazada por SIFEN se corrige **dentro del plazo**, con el **mismo numero y la misma idempotencia**, usando la autogestion de FE. Solo se cambian datos del receptor: RUC o CI, razon social, naturaleza y contacto. FE responde si se reutiliza el CDC o hace falta uno nuevo.
2. Si nadie actua dentro del plazo, se **inutiliza** la numeracion.
3. Recien despues, si hay que reprocesar, va una **factura nueva**.

**Estado en FE, verificado por FE en el codigo de `segel-rc3` (2026-11-08):** esa autogestion **no existe** para consumidores.
- Las rutas de correccion (`PATCH .../body`, `resend`, `validate-cdc-impact`, `retry-same-cdc`, `create-derived`) son solo de su backoffice, con un usuario de FE (`admin.route.ts`). No aceptan clave de consumidor ni compartida (FS-25).
- La inutilizacion existe: `POST /v1/evento/inutilizacionnumfactura`, con la **clave compartida**, y acepta numeros de facturas rechazadas (guia v0.12, 8.2 y 8.4). FE no inutiliza sola al vencer un plazo.
- Hay un borrador de FE sin aprobar ni codigo: `SPEC_AUTOGESTION_RECHAZOS_CONSUMIDOR_v0.1` (2026-11-01, worktree `fe-autogestion-rechazos`). Propone rutas de rechazados, regularizacion, reintento y correccion del receptor, plazos de 120 h (720 h extemporaneo) e inutilizacion en los 15 primeros dias del mes siguiente. **No es contrato:** FS no lo documenta como existente ni lo implementa.
- Dato tecnico de FE: el CDC no incluye datos del receptor (MT150), asi que corregir solo el receptor sin cambiar la fecha permite conservar CDC y `document_uuid`.

**Hasta que FE lo publique:** "Corregir y emitir de nuevo" crea una factura nueva con numero nuevo, precargada con los datos de la rechazada (FS-28). El numero rechazado queda sin inutilizar (D-3). Que la autogestion de FE entre antes o despues del despliegue en `segel-fs` lo decide el usuario con FE.

## 1. Objetivo

Que el usuario final resuelva solo, desde FS, los dos problemas mas frecuentes, sin llamar a soporte:

1. Una factura rechazada por datos del cliente, como el RUC o el nombre.
2. Un correo al comprador que no salio.

Criterio del usuario: no hacen falta las seis acciones internas de "Administracion fiscal". Solo las que se usen facil e intuitivamente desde FS.

## 2. Como esta hoy

| Caso | Hoy en FS | Problema |
|---|---|---|
| Rechazo por datos del cliente | "Corregir y emitir de nuevo" abre una factura nueva | Sale con otro numero. El rechazado queda sin usar, y hay que inutilizarlo ante SIFEN dentro de los 15 primeros dias del mes siguiente: FS no lo hace ni lo avisa |
| Correo fallido | Muestra el estado | No se puede corregir la direccion ni reenviar. FE no informa el motivo |
| Acciones internas (FS-25) | Seis botones para soporte | Llaman a rutas de FE que exigen un administrador de su backoffice: por lectura de codigo, nunca funcionaron |

## 3. Acciones propuestas

| Accion | Para el operador | Fundamento |
|---|---|---|
| A-1. Corregir los datos del cliente de una factura rechazada y reenviarla con el mismo numero | Si | Pedido del usuario. Es lo que indica el MT150 6.5 cuando la correccion no altera el CDC, y el receptor no forma parte del CDC |
| A-2. Ver que el correo fallo, corregir la direccion y reenviar | Si | Pedido del usuario. Sin riesgo fiscal |
| A-3. Frenar una factura antes de que salga a SIFEN | No, por ahora | FE: la ventana es de 15 min como mucho y deja un numero reservado sin emitir |
| Decision, validar impacto CDC, reintentar mismo CDC, crear derivado | No | Tecnicas. La decision de FE alimenta el mensaje, no es un boton |
| Inutilizar numeracion | No como boton | Pero alguien debe inutilizar los rechazados que se reemplazan: D-3 |

## 4. A-1: corregir un rechazo en el mismo documento

Reglas propuestas, a confirmar con el contrato que publique FE:

- **RN-01.** La correccion conserva `document_uuid` y numero. Con el prerequisito de FE (seccion 6), tambien el CDC.
- **RN-02.** Campos corregibles: documento y digito verificador del receptor, tipo y naturaleza, razon social, direccion, telefono y correo. No se corrigen fecha, items, montos, condicion ni numeracion.
- **RN-03.** FE dice si un documento es corregible y que campos admite. FS no interpreta codigos de SIFEN para decidirlo. Reemplaza, para estos casos, al catalogo local `sifen-causa-catalogo.ts`.
- **RN-04.** Solo con rechazo definitivo. Nunca con el lote abierto, ni sobre un numero ya inutilizado.
- **RN-05.** Un solo camino por rechazo: donde exista la correccion en el mismo documento, FS no ofrece "Corregir y emitir de nuevo". Evita dos facturas por la misma venta.
- **RN-06.** Plazos: la fecha de emision no cambia. FS avisa cuando la correccion ya es tardia y la bloquea cuando FE informe que supero el limite de SIFEN. Los umbrales los da FE.
- **RN-07.** Tope de intentos y clave de idempotencia por correccion. Cada correccion queda auditada con usuario, valores anteriores y nuevos.
- **RN-08.** La correccion actualiza el snapshot de la factura. Si tambien corrige la agenda de clientes se define en D-2; no puede sobrescribir datos de otro facturador (FS-17).
- **RN-09.** Corrige quien puede emitir en ese facturador y perfil.

Codigos que FE considera corregibles por datos del receptor: familia `1303` a `1309` (`1306` RUC inexistente, `1307` inactivo, `1309` digito verificador). `0160` a `0162` son de esquema y pueden deberse a SIFEN degradado: no se tratan como error del operador sin mirar el mensaje. Hoy el catalogo de FS los marca como corregibles: revisar.

## 5. A-2: correo fallido

- **RN-10.** FS muestra "no se pudo enviar" con el motivo que informe FE, en lenguaje simple.
- **RN-11.** El operador puede reenviar a la misma direccion o a otra. El documento no cambia: el XML conserva la direccion original.
- **RN-12.** Solo documentos aprobados, con tope de reenvios por documento.
- **RN-13.** "Enviado" significa que el servidor de correo acepto el mensaje, no que llego. FS no promete entrega: un rebote posterior no se ve.

## 6. Lo que necesita de FE

| # | Pedido | Opinion de FE (2026-11-06) |
|---|---|---|
| 1 | Motivo del fallo de correo en la consulta del documento | Viable. Hoy guarda los primeros 500 caracteres del error, sin clasificar, y no los expone |
| 2 | Ruta de consumidor para reenviar el correo, con direccion opcional | Viable y de bajo riesgo. Hoy no existe ninguna, ni en su backoffice |
| 3 | Conservar el codigo de seguridad al regenerar, para que el CDC no cambie | **Prerequisito de A-1.** Cambio chico, con prueba en SIFEN test. Hoy envia el KuDE antes de la aprobacion: el comprador puede tener un QR que apunta a un CDC que no va a existir |
| 4 | Ruta de consumidor para corregir y reenviar un rechazado | Viable. Mediano: cadena SDD completa, guia, OpenAPI y prueba en SIFEN test |
| 5 | Bloque de correccion en `GET /v1/documentos/{uuid}`: si es corregible, que campos, y limites de plazo | FE lo propone; el catalogo de codigos vive en FE |

Orden sugerido por FE: 1 y 2, luego 3, luego 4 y 5.

**Sin comprobar por FE:** si SIFEN produccion acepta el mismo numero con un CDC nuevo tras un rechazo; la tabla de composicion del CDC y la de plazos de transmision, que no se leen en su copia del manual.

## 7. Decisiones abiertas

| ID | Que | Propuesta | Decide |
|---|---|---|---|
| D-1 | Prioridad y orden frente a la carga masiva | Orden de FE, empezando por el correo. FS depende de que FE publique las rutas | Usuario |
| D-2 | ¿Corregir la factura corrige tambien al cliente en la agenda? | Ofrecerlo como opcion al corregir, solo sobre el cliente del propio facturador | Usuario |
| D-3 | Numeros rechazados que hoy quedan sin inutilizar | Decidido (seccion 0): se inutilizan si vence el plazo sin correccion. La dispara FE con lo que ya existe, en esta primera etapa (decision del usuario, 2026-11-08). La autogestion se libera en una segunda etapa | Usuario |
| D-4 | Que pasa con el bloque interno de seis acciones | Retirarlo cuando A-1 y A-2 esten disponibles; hasta entonces no se toca | Usuario |
| D-5 | Alcance: solo Segel, o tambien Ventax | Nace en la rama Segel. Ventax se decide aparte | Usuario |

## 8. Fuera de alcance

- Corregir items, montos o fecha de una factura rechazada.
- Notas de credito y recibos.
- Deteccion de rebotes de correo.
- Cualquier cambio en `segel-fs`.

## 9. Segunda etapa: lo planteado por el usuario el 2026-11-08

Visto en el ensayo local. Nada de esto se implementa en la segunda entrega; se refina con el usuario y con FE antes de su cadena SDD.

### 9.1 Corregir errores de una carga sin perder el hilo

- Un comprobante con error en una carga (por ejemplo `TOTAL_NO_COINCIDE` o `PAGOS_NO_COINCIDEN`) se corrige desde la misma pantalla de la carga, no editando el archivo.
- Flujo esperado por el usuario: entrar a la planilla con errores, corregir el problema 1 de 4 (nombre, RUC u otro dato del receptor), volver a la planilla y seguir con el 2 de 4, hasta terminar. La correccion no saca al usuario del listado de esa carga.
- Si el error no es de datos del receptor, un boton "Solicitar ayuda a soporte" que envie el caso por correo a la casilla de soporte parametrizada por instancia (en `segel-fs`, la de Segel). En la segunda entrega solo existe "Copiar datos para soporte" (FS-35).
- Depende de FE: hoy un comprobante `INVALIDO` no se corrige por API; habria que corregir el archivo y subirlo de nuevo. Pedir a FE si su autogestion (3.11 de su hoja de ruta) cubrira comprobantes de una carga o solo documentos emitidos.

### 9.2 Rechazo: inutilizar y emitir de nuevo desde FS

- Hoy "Corregir y emitir de nuevo" crea una factura nueva y la rechazada queda sin atender: su numero queda salteado hasta que soporte de FE lo inutilice (D-11 de la segunda entrega). FS lo avisa (FS-36).
- Minimo pedido por el usuario para despues del despliegue: que un usuario de FS pueda inutilizar el numero de la rechazada y luego emitir la factura nueva, si no puede corregirla. FE expone `POST /v1/evento/inutilizacionnumfactura` con la clave compartida.
- **Implementado (2026-11-10)** en `SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1`: el operador inutiliza el numero desde el detalle de la factura, y la correccion queda vinculada a la rechazada.
- Despues, la autogestion completa de la seccion 0: corregir con el mismo numero dentro del plazo.

### 9.3 Interfaz de escritorio

- Pasar de mobile primero a una version mas empresarial, para uso en PC: listado de documentos en tabla con fecha, numero, cliente, RUC o CI, condicion, estado con color, CDC, moneda, total, saldo y un menu de acciones por fila; filtros por fecha, busqueda y estado; pestanas por tipo de documento, incluida la carga masiva. Referencia: captura entregada por el usuario el 2026-11-08 de otro sistema de facturacion, no versionada porque muestra datos reales de clientes; el diseño queda descrito en esta seccion.
- Si es posible, detectar el dispositivo y mostrar la vista que corresponda; si no, responsive con prioridad de escritorio.
- Registrado tambien como FS-37 en `docs/BACKLOG.md`.

### 9.4 Forma de numerar en la carga

- La pantalla de nueva carga dice "La asigna el servicio" porque el contexto operativo numera por `SERVICIO`. Se cambia a "La trae el archivo" desde el backoffice de FS (contextos operativos, solo roles internos), y debe coincidir con el numerador de FE, que se configura en su backoffice; si no coinciden, FE rechaza la carga. El operador no la cambia (`SPEC_CARGA_MASIVA_FACTURAS_v0.1`, RN-21). Si el usuario quiere que el facturador la elija, es decision aparte.

