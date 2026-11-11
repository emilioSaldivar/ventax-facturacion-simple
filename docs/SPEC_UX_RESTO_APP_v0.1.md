# SPEC UX Del Resto De La App v0.1

**Fecha:** 2026-11-10 · **Rama:** `feat/identidad-segel` · **Estado:** aceptada por el usuario el 2026-11-11 (canvas `https://claude.ai/artifact/R7AL4Ajj7oAX9PfydQDYWe`, pautas y propuestas D-3, D-4, D-10, D-13 y D-14), **lista para implementar** por otro agente con el protocolo del PLAN §12. Sin codigo todavia.

**Revision del 2026-11-10 (noche):** con multiperfil v0.1 y v0.2 implementadas, se hizo un recorrido de reconocimiento sobre el stack local (§G) y se fijaron las pautas de frontend y componentes (§H, `docs/PAUTAS_FRONTEND_v0.1.md`). Su adopcion es la fase 0 de esta cadena (URA-015 a URA-024).

## Alineacion

- `docs/SPEC_UX_NUEVA_FACTURA_v0.1.md` (cerrada): tokens, iconos SVG, barra superior, menu lateral, banda, grilla, totales fijos y pantalla de resultado (`ResultadoEmision`). Esta SPEC lleva ese diseño al resto de la app.
- `docs/BACKLOG.md`: FS-52 (P-1 a P-4), FS-53 (R-1 a R-10), FS-54 (varios perfiles por usuario) y los nuevos FS-55 a FS-57 (nota de debito, nota de remision manual, autofactura).
- `docs/SPEC_DOCUMENTOS_ESCRITORIO_v0.1.md`: pestañas por tipo en Documentos ("Proximamente" mientras FS no incorpore el tipo, RN-03 y CA-04) y la fase B1, donde las notas de remision ya entran **por planilla** y tienen su pestaña.
- `docs/SPEC_NOTA_CREDITO_PARCIAL_v0.1.md`: nota de credito total o parcial por lineas, con saldo.
- `docs/PAUTAS_FRONTEND_v0.1.md`: reglas para todo cambio de frontend y catalogo de componentes (§H).
- `docs/SPEC_MULTIPERFIL_USUARIO_v0.1.md` y `v0.2` (implementadas y validadas en local el 2026-11-10, frontend en `3d6c6e3`): eleccion del punto de expedicion al entrar (C.1), punto activo como boton en la barra (C.2), ventana de cambio con contraseña (C.3, C.4), perfil guardado en cada documento (RN-05) y aviso cuando la nota de credito sale por otro punto que la factura (D-1). Esta SPEC **adopta** esas pantallas sin cambiarlas y propone tres agregados en §F.
- `docs/SPEC_PRESUPUESTOS_v0.2.md`: la pantalla que hoy se llama "Notas / Presupuestos".
- Documentos de FE para consumidores (`facturacion-electronica-consumer-docs`, paquete v0.41 del 2026-11-10): nota de remision por API (`POST /v1/nota-remision`, permiso `NRE_EMIT` no otorgado por defecto, guia §53), nota de debito por API (`POST /v1/nota-debito`, permiso `NDE_EMIT` no otorgado por defecto, guia §59) y el catalogo `CARGA_TIPO_DOCUMENTO` (FACTURA, NOTA_REMISION, NOTA_CREDITO, NOTA_DEBITO, AUTOFACTURA). La autofactura **no** esta publicada para consumidores: FE la documenta en su rama `feat/autofactura` (SPEC v0.2, VE-F06).

## Situacion actual

Medido el 2026-11-10 sobre `84fb241` (stack local de Segel, 1440 px).

1. El menu (`menuItems`, `apps/web-operacion/src/main.tsx:1586`) tiene tres grupos: "Operaciones" (Nueva factura, Agenda / Clientes, Documentos), "Secundarias" (Notas / Presupuestos, Cobros / Recibos, Catalogo, **Devolver factura**) y "Administracion" (Informacion y estado).
2. "Devolver factura" es la vista interna `credit-note`: titulo y pista en `formatOperationViewTitle` y `getOperationViewHint` (`main.tsx:6996`, `:7010`), icono `devolver`, y el boton de la pantalla de inicio (`main.tsx:1888`). La pantalla es una columna de 520 px con buscador de facturas candidatas y emision (`main.tsx:3950-4110`).
3. Los unicos tipos que FS guarda son `FACTURA`, `NOTA_CREDITO` y `NOTA_REMISION` (`facturas_operativas_tipo_check`, migracion `0040`). La nota de remision solo entra desde una carga masiva; no hay emision manual.
4. Documentos ya tiene pestañas por tipo (`main.tsx:2552`): Facturas, Notas de credito, Notas de remision (habilitada en la fase B1), Carga masiva (solo con `carga_masiva_habilitada`), y Notas de debito y Autofacturas deshabilitadas con "Próximamente" (`TIPOS_PROXIMAMENTE`, `main.tsx:1897`). Solo se ve la cantidad de la pestaña activa, en el paginador.
5. No hay un lugar que diga que documentos puede emitir el facturador. Un tipo nuevo de FE no tiene donde aparecer en el menu.
6. "Notas / Presupuestos" usa la palabra "notas" para notas de pedido, comprobantes comerciales que no van a SIFEN. Con notas de credito, de debito y de remision en el mismo menu, el nombre confunde.
7. El contenido de las pantallas, salvo Nueva factura, conserva el estilo anterior (BACKLOG FS-53, R-1 a R-10): columnas de 520 px, pesos de 800 y 900, emojis de estado.

## Objetivo

Que cada tipo de documento fiscal tenga su propio espacio en la app desde ahora, aunque todavia no se pueda emitir, y que el operador vea en un solo lugar que puede emitir y por que punto. "Devolver factura" pasa a llamarse "Notas de credito". Las pantallas del operador quedan con el diseño de Nueva factura. Los tipos que todavia no se emiten (nota de debito, nota de remision manual, autofactura) quedan reservados con un patron fijo, para que cada uno entre con su propia cadena sin rehacer el marco.

## Alcance (v0.1)

### A. Marco y navegacion

1. **Grupos del menu.** El menu lateral pasa a cuatro grupos:

   | Grupo | Elementos |
   |---|---|
   | Emitir | Nueva factura, Notas de credito, Notas de debito, Notas de remision, Autofacturas |
   | Consultar | Documentos, Agenda / Clientes, Catalogo |
   | Comercial | Presupuestos / Pedidos, Cobros / Recibos |
   | Administracion | Informacion y estado |

2. **Un espacio por tipo.** Cada tipo fiscal tiene su elemento en "Emitir" con uno de tres estados (RN-01):
   - **Disponible:** se abre normalmente.
   - **Por planilla:** se abre el espacio, pero solo con "Emitidas" y "Por planilla"; la etiqueta "Por planilla" va a la derecha del nombre.
   - **Proximamente:** el elemento se ve en gris, con la etiqueta "Proximamente", y no se puede abrir (RN-02).

   Estado de cada tipo al cerrar esta SPEC:

   | Tipo | Estado en FS | Base |
   |---|---|---|
   | Factura | Disponible | — |
   | Nota de credito | Disponible | `SPEC_NOTA_CREDITO_PARCIAL_v0.1` |
   | Nota de remision | Por planilla, si la carga masiva esta habilitada para el facturador; si no, Proximamente | `SPEC_DOCUMENTOS_ESCRITORIO_v0.1` fase B1 |
   | Nota de debito | Proximamente | FE publico `POST /v1/nota-debito`; FS no lo integra (FS-55) |
   | Autofactura | Proximamente | FE no la publico para consumidores (FS-57) |

3. **Boton "Nuevo"** en la barra superior, a la izquierda del operador, con el estilo del boton principal. Abre un menu con tres bloques:
   - "Documentos electronicos (SIFEN)": Factura, Nota de credito, Nota de debito, Nota de remision, Autofactura. Cada uno tiene icono, nombre, una linea de descripcion y el estado de A.2. Uno "Proximamente" no se puede elegir; Nota de remision "Por planilla" lleva a la carga masiva con el tipo ya elegido.
   - "Comprobantes comerciales (no van a SIFEN)": Presupuesto o pedido y Recibo de dinero.
   - "Carga masiva por planilla", solo si la carga masiva esta habilitada.

   Al pie del menu dice "Se emite por EST-PUNTO titulo" (RN-07).
4. **Cambios de nombre.**
   - "Devolver factura" pasa a **"Notas de credito"** en el menu, el titulo, la pista, el boton de Informacion y estado y los guiones (D-1).
   - "Notas / Presupuestos" pasa a **"Presupuestos / Pedidos"** (D-3, propuesta).
   - "Nueva factura" conserva su nombre (D-6).
   - La vista interna sigue siendo `credit-note`; cambian solo los textos (RN-06).
5. **Iconos.** El componente `Icono` suma `debito` (documento con signo mas), `remision` (camion), `autofactura` (documento con persona) y `nuevo` (signo mas). `devolver` pasa a ser el documento con signo menos y se renombra `credito`.

### B. Espacio de cada tipo de documento

Patron comun para Notas de credito, Notas de debito y Notas de remision:

1. Encabezado con el titulo en plural y un subtitulo con la descripcion del tipo y el proximo numero del punto activo (RN-03).
2. Pestañas: "Nueva <tipo>", "Emitidas · N" (abre Documentos en la pestaña del tipo; N sale de un `GET /facturas?tipo=...&limit=1` al abrir el espacio, sin cambio de contrato) y, para la nota de remision, "Por planilla" (abre la carga masiva con `tipo_documento=NOTA_REMISION`).
3. El editor usa la grilla de Nueva factura (`1fr 320px`): tarjetas a la izquierda y un panel fijo a la derecha con los totales o el resumen, el boton "Emitir <tipo>" y el motivo de bloqueo (patron RN-04 de `SPEC_UX_NUEVA_FACTURA`).
4. Al emitir, el resultado reemplaza al formulario con `ResultadoEmision`: pasos, resumen y "Entregar al cliente" (RN-04).

Contenido de cada espacio:

- **B.1 Notas de credito (R-7, en esta cadena).**
  - **Factura a devolver.** Buscador de facturas candidatas, el mismo de hoy. Al elegir una, una tarjeta muestra factura, cliente, fecha y saldo a devolver, con el enlace "Cambiar factura".
  - **Que se devuelve.** El conmutador "Toda la factura" o "Algunas lineas" y una tabla con las columnas #, Descripcion, Facturado, Ya devuelto, Devolver (campo) e Importe.
  - **Motivo.** El campo "Detalle para el cliente". El selector "Tipo de motivo" (tabla E401) se muestra solo cuando se resuelva FS-44; mientras FS mande siempre el codigo 1, no se ofrece.
  - **Panel derecho.** Gravado, IVA, "Total a devolver", "Queda por devolver" y "Emitir nota de credito".
  - **Aviso de punto distinto.** Con varios perfiles, si la factura se emitio por otro punto, la tarjeta de la factura muestra el aviso de `SPEC_MULTIPERFIL_USUARIO` RN-05.
- **B.2 Notas de debito (reservado, FS-55).** Hoy se muestra "Proximamente". Cuando se habilite, con su propia cadena, el espacio tendra:
  - la factura asociada, electronica o impresa;
  - el motivo, con tipo E401 y detalle;
  - los conceptos a sumar, con precio unitario e IVA, usando la grilla de Nueva factura;
  - solo guaranies, con el cliente y la moneda tomados de la factura;
  - un panel derecho con "Total a sumar".

  El canvas muestra ese estado futuro. Esta SPEC no fija campos ni validaciones: son de la cadena de FS-55, sobre la guia §59 de FE.
- **B.3 Notas de remision (FS-56 para la emision manual).** Hoy el espacio se abre con "Emitidas" y "Por planilla". La pestaña "Nueva nota de remision" aparece cuando FS integre `POST /v1/nota-remision` con su propia cadena. El canvas muestra ese estado:
  - destinatario, domicilio de entrega y motivo del traslado;
  - el traslado, con fechas, origen, tipo de transporte, vehiculo y chofer;
  - la mercaderia, con cantidad, unidad, lote y vencimiento, sin precios;
  - un panel derecho con lineas, unidades y destino.
- **B.4 Autofacturas (reservado, FS-57).** "Proximamente" hasta que FE la publique para consumidores.

### C. Documentos (R-2 y P-1)

1. Pestañas por tipo: Facturas, Notas de credito, Notas de debito y Autofacturas ("Proximamente", como hoy en `TIPOS_PROXIMAMENTE`), Notas de remision y "Cargas por planilla" (hoy "Carga masiva", solo con la carga masiva habilitada). Solo la pestaña activa muestra su cantidad, con el total que ya trae `GET /facturas`. Las demas no la muestran, para no sumar un pedido por pestaña (D-9).
2. Barra de filtros en una sola fila: busqueda (numero, cliente, RUC o CDC), estado, punto de expedicion (§F.2) y periodo. "Cargando…" y "Buscar mas documentos" salen de entre los filtros: la carga se indica en la tabla y "Ver mas" va al pie.
3. Tabla a lo ancho con las columnas Fecha, Numero, Cliente, Punto (§F.2), Total y Estado. El estado es la pastilla de la pantalla de resultado: punto de color y texto, sin emoji (P-1, RN-05).
4. **Ficha lateral de 360 px** con el esquema de la pantalla de resultado:
   - numero y pastilla de estado;
   - los cuatro pasos;
   - cliente, "Emitida por" (punto y operador), total y CDC;
   - la entrega en una grilla de dos columnas: WhatsApp, Copiar enlace, KUDE en PDF y XML;
   - el bloque "Desde esta factura": Nota de credito, Nota de debito y Nota de remision para esta venta, cada una con el estado de A.2.

   Se reemplazan los botones apilados a lo ancho.
5. En celular se conserva la lista actual de tarjetas, con la pastilla en lugar del emoji.
6. **Busqueda por numero completo (pedido del usuario del 2026-11-11, D-15).** El buscador de Documentos y el de Notas de credito aceptan el numero como lo ve el operador: `001-001-1010006` (o `0010011010006`, sin guiones) encuentra el documento `1010006` **de ese establecimiento y punto**, y no el mismo numero de otro punto. Lo que ya se buscaba sigue igual: solo el numero (`1010006`, como prefijo), el CDC, el documento o la razon social del cliente (RN-12).

### D. Resto de las pantallas del operador (R-1, R-3 a R-6, R-8 a R-10)

Se toma tal cual el ajuste propuesto en `docs/BACKLOG.md`, seccion "UX en el resto de la app":

| ID | Pantalla | Ajuste |
|---|---|---|
| R-1 | Base comun | Tokens de Nueva factura en todas las reglas: peso maximo 700, linea `#dde3e7`, radios de 6 y 8 px, sin `.eyebrow` en mayusculas. Un encabezado de pantalla unico: titulo y subtitulo a la izquierda, acciones a la derecha |
| R-3 | Agenda / Clientes | Tabla a lo ancho con nombre, documento, contacto, ultima factura y acciones. "Nuevo cliente" en el encabezado. Tarjetas en celular |
| R-4 | Catalogo | Tabla a lo ancho con codigo, descripcion, precio, IVA, estado y acciones. Alta en un panel lateral |
| R-5 | Presupuestos / Pedidos | Tabla con estado en pastilla. El editor reutiliza `GrillaLineas` |
| R-6 | Cobros / Recibos | Tabla con fecha, pagador, concepto, factura, importe, forma de pago, estado y acciones |
| R-8 | Informacion y estado | Dos columnas: "Facturador y sesion" y "Estado para facturar", con checks de `Icono`. Debajo, la tarjeta nueva "Documentos que podes emitir", que lista los cinco tipos con su estado de A.2 y una linea de descripcion |
| R-9 | Carga masiva | Tokens, encabezado y pastillas de R-1 y C |
| R-10 | Paginas publicas | Sin emojis y con los tokens. El login no cambia |

### E. Celular

1. El menu de celular sigue los grupos de A.1 con las mismas etiquetas. Arriba lleva el operador y el punto activo, y abajo "Cambiar punto de expedicion" (§F.1) y "Salir".
2. El boton "Nuevo" no va en la barra de celular, que ya tiene el bloque compacto del punto. Los tipos se eligen desde el menu.

### F. Varios perfiles de emision (`SPEC_MULTIPERFIL_USUARIO_v0.1`)

> Actualizado tras el reconocimiento (§G): la columna "Punto" de la tabla de escritorio ya existe (multiperfil, lee `documento.perfil_emision`; sin perfil muestra "—"). De F.2 quedan la tarjeta de celular, la ficha, la lectura por CDC para documentos viejos y el filtro.

Se adoptan sin cambios la pantalla "Elegir punto de expedicion" (C.1), el boton del punto activo en la barra (C.2), la ventana de cambio con contraseña y su aviso de documento sin emitir (C.3 y C.4) y la tarjeta de Informacion y estado (C.5). El canvas las dibuja con el diseño de esta SPEC.

Hay tres agregados. Multiperfil v0.1 y v0.2 ya estan implementadas en local (2026-11-10), asi que F.1 entra en la fase 0 (URA-021) y F.2 y F.3 en la fase 3 (URA-013):

1. **Menu de celular.** El elemento "Cambiar punto de expedicion" va arriba de "Salir", solo con mas de un perfil, y abre la misma ventana de C.3.
2. **Punto en Documentos.**
   - La columna "Punto" muestra EST-PUNTO.
   - Sale del perfil guardado en el documento (multiperfil RN-05). Para documentos anteriores sin perfil, sale de las posiciones 12 a 17 del CDC (establecimiento y punto, como en `facturas.inutilizacion.ts`). Sin perfil ni CDC, se muestra "—".
   - El filtro "Punto de expedicion" lista los puntos del facturador. Filtrar en el servidor pide un parametro nuevo en `GET /facturas` y su entrada en `spec/openapi.yaml` (RN-08).
3. **"Se emite por"** al pie del menu "Nuevo" y en el subtitulo de cada espacio de §B. Recuerda el punto activo antes de emitir.

### G. Reconocimiento del 2026-11-10

Recorrido con Playwright sobre el stack local de Segel (frontend `3d6c6e3`, usuario de ensayo con los puntos 001-001 y 001-002) en 1440, 1280 y 390 px: login, eleccion de punto, las ocho pantallas del menu, la ficha de un documento y el cambio de punto. No emitio ni guardo nada. Se completo con una revision del codigo de `apps/web-operacion/src`. Las capturas marcadas estan en el canvas, en los tableros "Reconocimiento".

**Varios puntos (multiperfil):**

| ID | Hallazgo | Mejora | Tarea |
|---|---|---|---|
| H-01 | La descripcion fiscal del perfil ("Perfil para la emision de comprobantes para actividad economica…") es el titulo de Informacion y estado: 5 renglones en escritorio, 8 en celular, repetida tres veces | Titulo "Punto 001-001", actividad como texto secundario (P-P1) | URA-021 |
| H-02 | Elegir y cambiar punto: la negrita es la descripcion larga, cortada a mitad de palabra ("Otras actividades de servi"); el punto, que es lo que distingue las opciones, va en gris chico | "Punto 001-002" en negrita, actividad y timbrado debajo, "…" con el texto completo en `title` | URA-021 |
| H-03 | Informacion y estado muestra el codigo del perfil (`AC445203-E001-P001-FE-PTO`) | Sacarlo de la pantalla del operador | URA-021 |
| H-04 | La barra lateral sigue diciendo "ultimo numero 0000001" (`main.tsx:2245`); la eleccion ya no lo muestra (multiperfil CA-23) y la barra no dice el punto | "Listo para facturar · Punto 001-001" | URA-021 |
| H-05 | En el dialogo de cambio, el campo de contraseña no ocupa el ancho y el ojo queda suelto a la derecha (1440 y 390) | `CampoContrasena` comun con el login | URA-017, URA-021 |
| H-06 | El menu de celular no tiene "Cambiar punto de expedicion" y su cabecera muestra la descripcion larga | §F.1 y P-P1 | URA-021 |
| H-07 | En las tarjetas de celular y en la ficha no se ve el punto: "1010619" y "0008487" son de puntos distintos | Numero completo `001-002-0008487` (P-E3) | URA-021 |
| H-08 | La lista de facturas de Notas de credito no dice el punto de cada factura; el modal de nota de credito de Documentos no avisa si la factura es de otro punto (CreditNoteView si avisa) y su motivo no se registra como borrador | Punto en cada candidata; mismo aviso en los dos caminos; motivo y archivo de carga masiva registrados (P-P4) | URA-021 |

**Marco y componentes:**

| ID | Hallazgo | Mejora | Tarea |
|---|---|---|---|
| H-09 | Cuatro encabezados distintos: Documentos (rotulo, titulo y Volver a la derecha), Notas de credito y Presupuestos (columna angosta centrada), Cobros ("← Volver" arriba a la izquierda) | `EncabezadoPantalla` y dos anchos (P-L1, P-L2) | URA-017 |
| H-10 | Tres estilos de pastilla ("🟢 Factura emitida", "Pendiente", "EMITIDO" en mayusculas) y 12 implementaciones del mapeo de estado | `PastillaEstado` y un mapa de estados (P-E1, P-E2) | URA-017 |
| H-11 | La ficha repite el estado tres veces y apila botones de 1100 px; los datos van en una columna; "sistemasGs. 300.000" sin espacio | §C.4 con P-L4 y P-L7 | URA-007 |
| H-12 | Textos sin tildes ("Informacion", "Catalogo", "Contrasena") junto a datos con tildes; voseo y usted mezclados; "Integracion con facturacion-electronica" a la vista | P-X1 a P-X4 | URA-020 |
| H-13 | En 390 px hay controles de 16 a 38 px (Salir, ⋮, Contado, Credito, Mostrar contraseña, "Cambiar punto") | 44 px (P-A1) | URA-019 |
| H-14 | En celular, las seis pestañas de Documentos ocupan tres renglones | Una fila con desplazamiento lateral | URA-007 |
| H-15 | Informacion y estado repite el menu con cinco botones a todo el ancho | Solo la accion principal (§D R-8) | URA-008 |
| H-16 | Emojis como iconos en Agenda (👤), Documentos (🟢) y la ficha (📄📱🔗📋↩⚠), aunque `Icono` ya tiene esos iconos | P-I1 | URA-007, URA-011 |
| H-17 | Anular factura tiene el mismo estilo que Copiar enlace; tres confirmaciones con `window.confirm` | P-L6 y `Dialogo` | URA-017 |

**Codigo:**

| ID | Hallazgo | Mejora | Tarea |
|---|---|---|---|
| H-18 | `main.tsx` tiene 9979 lineas; `DocumentsView` (~1580) e `InvoiceEditor` (~1520) tienen 37 estados cada una; el backoffice ya separa `api/` y `components/` | Particion incremental (P-C2) | URA-023 |
| H-19 | `styles.css`: 221 colores hex fuera de `:root`, 20 tamaños de letra, 52 paddings, 9 `z-index` sin escala (el menu de tarjetas, 100, queda sobre los dialogos), cortes en 720, 1024, 1040 y 1023 px con un solape en 720, 10 selectores duplicados y ~21 clases sin uso | Tokens y limpieza (P-T1 a P-T6, P-C6) | URA-016, URA-022 |
| H-20 | Las descargas de PDF y XML de Presupuestos y Recibos y las paginas publicas usan `fetch` directo y no renuevan la sesion; el onboarding descarta el token renovado | Un solo cliente (P-D1, P-D2) | URA-018 |
| H-21 | Accesibilidad: sin `:focus-visible` en los botones, ⋮ sin nombre ni `aria-haspopup`, fila de tabla que solo abre con el mouse, dialogos sin Escape ni foco atrapado (salvo el cambio de punto), zoom bloqueado en `index.html`, `<div>` dentro de `<button>` | P-A1 a P-A8 | URA-019 |
| H-22 | No hay rutas por URL: el boton Atras del navegador y los enlaces directos no llevan a una pantalla | Fuera de esta cadena (FS-58 propuesto) | — |
| H-23 | Al cargar sin sesion, la consola muestra un 401 de `/auth/refresh` | Esperado (sin cookie de renovacion); se documenta para que el guion de reconocimiento lo ignore | URA-024 |

### H. Pautas de frontend y componentes

1. `docs/PAUTAS_FRONTEND_v0.1.md` fija las reglas para todo cambio en `apps/web-operacion`: tokens (P-T), catalogo de componentes (P-C), pantallas (P-L), estados (P-E), iconos (P-I), accesibilidad (P-A), textos (P-X), punto de expedicion (P-P), datos y API (P-D) y validacion (P-V), con una lista para cerrar cada cambio y la linea base medida en §G.
2. `AGENTS.md` la lista entre las fuentes de verdad y la hace obligatoria para cambios de frontend (D-10).
3. Las fases 1 y 2 de esta cadena se construyen con los componentes del catalogo. Por eso la fase 0 (URA-016 a URA-019) va antes.
4. El canvas tiene el tablero "Pautas de frontend" con los tokens y los componentes dibujados.

## Fuera de alcance (v0.1)

- **La emision de tipos nuevos.** La emision de nota de debito, la nota de remision manual y la autofactura no se implementan aca. Cada una necesita su cadena SPEC, PLAN y TASKS (FS-55 a FS-57), con el contrato de FE vigente. La habilitacion por facturador desde el backoffice tambien va en esas cadenas, porque en FE los permisos `NDE_EMIT` y `NRE_EMIT` no se otorgan por defecto.
- **El tipo de motivo de la nota de credito.** Depende de FS-44.
- **El resto de FS-52.** P-2 (quitar "Calcular"), P-3 (guion de identidad) y P-4 (modo oscuro) siguen en ese item.
- **Otras areas.** El backoffice, cualquier cambio en FE y cualquier logica fiscal. Las pautas valen para el backoffice cuando se toque, pero esta cadena no lo cambia (sus 75 campos sin etiqueta asociada quedan anotados en el BACKLOG).
- **Rutas por URL (H-22).** Se propone como FS-58 con su propia cadena.

## Decisiones

- **D-1 — "Notas de credito".** "Devolver factura" se llama "Notas de credito". Decision del usuario del 2026-11-10.
- **D-2 — Un espacio por tipo desde ahora.** Cada tipo fiscal tiene su lugar en "Emitir" aunque no se pueda emitir todavia, para que los tipos entren sin rehacer el menu. Decision del usuario del 2026-11-10.
- **D-3 — "Presupuestos / Pedidos".** Evita que "notas" mezcle comprobantes comerciales con fiscales. Aceptada por el usuario el 2026-11-11.
- **D-4 — Boton "Nuevo".** Un solo punto de entrada para todo lo que se emite, en la barra, a la vista desde cualquier pantalla. Aceptada por el usuario el 2026-11-11.
- **D-5 — Mostrar, no ocultar.** Un tipo no habilitado se ve en gris con "Proximamente", igual que las pestañas de Documentos (`SPEC_DOCUMENTOS_ESCRITORIO` CA-04). El operador sabe que existe y que llegara.
- **D-6 — "Nueva factura" no cambia.** Es la accion principal y la usan los guiones de Playwright y la guia de uso.
- **D-7 — Un patron, varias cadenas.** Esta SPEC fija el marco y el patron de §B. Los campos y validaciones de cada tipo nuevo son de su propia cadena.
- **D-8 — Multiperfil se adopta, no se redefine.** Las pantallas de perfil son las de `SPEC_MULTIPERFIL_USUARIO`. Esta SPEC solo propone §F.1 a §F.3.
- **D-9 — Cantidad solo en la pestaña activa.** Contar todos los tipos pediria un pedido por pestaña o un contrato nuevo. La pestaña activa ya trae su total.
- **D-10 — Pautas obligatorias.** Todo cambio de frontend sigue `docs/PAUTAS_FRONTEND_v0.1.md`. El codigo existente se pone al dia cuando se toca, sin ampliar el alcance de la tarea sin anotarlo (pautas §0). Aceptada por el usuario el 2026-11-11 (URA-015).
- **D-11 — Nombre corto del punto.** "Punto EST-PTO" y la actividad (`actividad_economica_descripcion`) como texto secundario. `titulo_operativo` y `perfil_emision_alias` traen hoy la descripcion fiscal larga (en la base, `alias_operativo` de los dos perfiles de ensayo); no se usan como titulo. Sin cambio de contrato.
- **D-12 — Particion incremental.** `main.tsx` se divide en `api/`, `components/`, `lib/` y `views/` por etapas, empezando por lo que cada fase toca, y cada paso sin cambio de comportamiento, comprobado con las regresiones de Playwright. No hay un refactor de una sola vez.
- **D-13 — Voseo.** La interfaz usa voseo, como multiperfil y Nueva factura. Aceptada por el usuario el 2026-11-11.
- **D-15 — Busqueda por numero completo.** Pedido del usuario del 2026-11-11, al probar la app: escribir `001-001-1010006` no encontraba nada y solo funcionaba `1010006`. Se resuelve en la API (el filtro ya esta ahi; el frontend no recorta el texto) y vale para los dos buscadores que usan `GET /facturas` y `GET /facturas/nce-candidatas`.
- **D-14 — Zoom permitido.** Se quita `maximum-scale=1.0, user-scalable=no` del `viewport`. El riesgo es que el celular agrande la pantalla al enfocar un campo de menos de 16 px; se cubre con campos de 16 px en celular. Aceptada por el usuario el 2026-11-11.

## Reglas

- **RN-01 — Estado de cada tipo.** FS calcula el estado de cada tipo con un catalogo fijo en su codigo y el contexto del facturador: `canEmit`, carga masiva habilitada y, mas adelante, la habilitacion por tipo. Nunca consulta a FE para pintar el menu.
- **RN-02 — "Proximamente" no hace nada.** Un tipo "Proximamente" no navega, no abre ventanas y no consulta la API. Es el mismo criterio de `SPEC_DOCUMENTOS_ESCRITORIO` RN-03.
- **RN-03 — Proximo numero del punto activo.** Cada espacio de §B muestra el proximo numero estimado del punto activo con el mismo calculo que Nueva factura. Con numeracion del cliente no se muestra.
- **RN-04 — Un solo resultado.** Toda emision desde un espacio termina en `ResultadoEmision`, con los pasos por estado y la relectura cada 15 s de `SPEC_UX_NUEVA_FACTURA` RN-11. La nota de remision no muestra montos.
- **RN-05 — Sin emojis.** Ninguna pantalla del operador ni pagina publica usa emojis para estados o acciones. Los estados son pastillas con punto de color y texto, y las acciones llevan iconos de `Icono`.
- **RN-06 — Solo cambian los textos.** El cambio de nombre no cambia identificadores internos, rutas ni contratos. Los guiones que buscan los textos viejos se actualizan en la misma tarea.
- **RN-07 — El punto siempre a la vista.** Antes de emitir, el operador ve por que punto sale el documento: en la barra, en el pie del menu "Nuevo" y en el subtitulo de cada espacio.
- **RN-08 — Contrato solo donde se dice.** El unico cambio de contrato de esta cadena es el filtro por punto de §F.2, que va despues de multiperfil y se documenta en `spec/openapi.yaml`. El resto es solo de interfaz.
- **RN-09 — Escritorio primero.** Se valida primero en 1440 y 1280 px y despues en 390 px, sin desplazamiento horizontal (decision del 2026-11-09).
- **RN-10 — Sin cambio de comportamiento en la fase 0.** Tokens, componentes base, cliente de API, accesibilidad, textos y particion no cambian lo que se envia a la API ni los flujos. Lo comprueban las regresiones de Playwright y la linea base de la nota de credito (URA-001).
- **RN-12 — Numero completo.** Un texto de busqueda con la forma `EEE-PPP-NNNNNNN` (con guiones: tres, tres y hasta siete digitos; sin guiones: las 13 cifras, para que un numero suelto como `1010006` se siga buscando como antes) filtra por establecimiento y punto y por el numero: exacto si tiene 7 cifras, como prefijo si tiene menos, y tambien con ceros a la izquierda (`001-002-8487` encuentra `0008487`). El establecimiento y el punto del documento salen de su perfil (`actividad_punto_perfil_id`) o, si no lo tiene, del CDC (posiciones 12 a 17), como en `facturas.inutilizacion.ts`. Cualquier otro texto se busca como antes.
- **RN-11 — La linea base no sube.** El guion de reconocimiento (URA-024) corre al cerrar cada tarea de frontend. Ninguna cuenta del anexo de las pautas puede subir.

## Criterios de aceptacion

- **CA-01.** En 1440 y 1280 px, el menu muestra los cuatro grupos de A.1. Notas de debito y Autofacturas aparecen en gris con "Proximamente" y un clic no cambia de pantalla ni dispara pedidos a la API.
- **CA-02.** Notas de remision muestra "Por planilla" con la carga masiva habilitada y "Proximamente" con la carga masiva apagada.
- **CA-03.** Ningun texto visible dice "Devolver factura" ni "Notas / Presupuestos". "Notas de credito" abre la pantalla de B.1.
- **CA-04.** El boton "Nuevo" abre el menu de A.3 con los estados de A.2. "Factura" abre Nueva factura, "Nota de credito" abre B.1 y "Nota de remision" abre la carga masiva con el tipo elegido. Los "Proximamente" no se pueden elegir.
- **CA-05.** Notas de credito: con una factura de tres lineas se devuelven 10 unidades de la primera y el panel muestra el total y lo que queda por devolver. La nota se emite y el resultado reemplaza al formulario. Con el stack local se emite una **nota de credito real en SIFEN test** y llega a "Aprobada" desde la pantalla de resultado.
- **CA-06.** Documentos: pestañas con cantidades, filtros en una fila, pastillas sin emoji y ficha lateral con los bloques de C.4. Una factura aprobada ofrece "Nota de credito" desde la ficha.
- **CA-07.** Informacion y estado muestra la tarjeta "Documentos que podes emitir" con los cinco tipos y su estado.
- **CA-08.** Ninguna pantalla del operador ni pagina publica contiene emojis. Lo comprueba un recorrido de Playwright que busca caracteres del rango de emojis en el texto visible.
- **CA-09.** En 390 px: el menu sigue los grupos de A.1, no hay desplazamiento horizontal y Documentos conserva las tarjetas con la pastilla de estado.
- **CA-10.** Fase 3 (§F.2 y §F.3): con dos perfiles, la columna "Punto" muestra el punto de cada documento, tambien en los anteriores por su CDC. El filtro por punto devuelve solo los documentos de ese punto. "Se emite por" aparece en cada espacio de §B.
- **CA-11.** Las regresiones de Nueva factura (`playwright-ux-nueva-factura.cjs`), Documentos escritorio y carga masiva pasan con los textos actualizados.
- **CA-12.** Al cerrar URA-016 y URA-022 (fase 0): `styles.css` sin `z-index` numericos, sin valores que coincidan con un token escritos a mano, con `1040px` corregido y sin el solape en 720 px; sin las clases sin uso ni los selectores duplicados de H-19; las capturas de 1440 y 390 px de las ocho pantallas no cambian a simple vista respecto del recorrido del 2026-11-10. Al cerrar URA-002 (fase 1, R-1): ningun color hex fuera de `:root`.
- **CA-13.** `EncabezadoPantalla`, `PastillaEstado`, `Aviso`, `EstadoVacio`, `Dialogo`, `MenuFila`, `CampoFormulario` y `CampoContrasena` existen en `src/components/` y reemplazan a sus variantes (sin `window.confirm` en el codigo).
- **CA-14.** Con dos puntos: la eleccion, el cambio, Informacion y estado y el menu de celular nombran el punto como "Punto 001-002" con la actividad como texto secundario, sin la descripcion fiscal larga ni el codigo del perfil ni "ultimo numero"; el menu de celular ofrece "Cambiar punto de expedición" y abre el dialogo; las tarjetas de celular y la ficha muestran el numero completo (`001-002-0008487`); el modal de nota de credito de Documentos avisa cuando la factura es de otro punto; con un motivo escrito en ese modal, "Cambiar punto" ofrece "Descartar y cambiar".
- **CA-16.** En Documentos (pestaña Notas de crédito) y en Notas de crédito, `001-001-1010006` encuentra la nota 1010006 de 001-001; `001-002-1010006` no la encuentra; `1010006` la sigue encontrando; `001-002-8487` encuentra la factura 0008487 de 001-002. `spec/openapi.yaml` describe el formato del parametro `q`.
- **CA-15.** Guion de reconocimiento (PLAN §11) en 1440, 1280 y 390 px: 0 desplazamiento horizontal, 0 controles sin nombre, 0 campos sin etiqueta, 0 controles de menos de 44 px y 0 campos de menos de 16 px en 390 px al cerrar URA-020; 0 emojis al cerrar URA-011 (los emojis de estado y de acciones salen en las fases 1 y 2, con las pantallas). Entre tareas, ningun total sube respecto de la linea base (RN-11).

## Limitaciones conocidas

- El estado de los tipos se fija en el codigo de FS (RN-01). Cuando FE habilite un tipo, FS cambia su catalogo en la cadena de ese tipo, no automaticamente.
- Sin multiperfil implementado, la columna y el filtro "Punto" no se muestran. Con un solo punto por usuario no agregan informacion.
