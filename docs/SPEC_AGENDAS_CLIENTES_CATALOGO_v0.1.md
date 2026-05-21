# SPEC Agendas Clientes Catalogo v0.1

## 1. Proposito

Definir el modelo funcional de clientes, agendas por facturador y catalogo para que el sistema pueda reutilizar informacion fiscal de clientes sin romper la percepcion de propiedad de cada facturador.

Cada facturador debe operar como si tuviera su propia agenda y su propio catalogo. La base global de clientes existe solo como infraestructura interna de autocompletado y normalizacion de datos fiscales.

## 2. Clientes Globales Del Sistema

Debe existir una base global de identidades de clientes del sistema, orientada a datos fiscales reutilizables:

- tipo de documento;
- documento normalizado;
- RUC/CI u otro documento;
- razon social o nombre;
- datos fiscales/comerciales generales disponibles para autocompletar.

La base global se actualiza cuando un facturador carga manualmente un cliente nuevo o modifica datos de un cliente existente en su agenda.

La base global no representa una relacion comercial entre un facturador y un cliente. Tampoco debe exponerse al operador ni al cliente final como "cliente compartido".

## 3. Agenda Por Facturador

Cada facturador debe tener su propia agenda de clientes.

La agenda por facturador debe:

- diferenciar los clientes de cada facturador aunque el documento sea el mismo;
- permitir datos personalizados por facturador;
- usar `facturador_id` como clave principal de aislamiento operativo;
- permitir busqueda eficiente por `facturador_id` y documento normalizado;
- guardar la relacion comercial propia entre facturador y cliente.

Cuando un cliente se modifica en la agenda de un facturador:

- se actualiza la agenda de ese facturador;
- no se modifica la agenda de otros facturadores;
- se actualiza o normaliza la identidad global del sistema para mejorar futuros autocompletados.

## 4. Flujo De Busqueda Y Alta De Cliente

La busqueda por documento debe seguir este orden:

1. buscar en la agenda del facturador;
2. si no existe en su agenda, buscar en la base global de clientes;
3. si existe en la base global, precargar datos para agregarlo a la agenda del facturador;
4. si no existe en la base global, cargar manualmente y crear tanto la identidad global como la entrada de agenda del facturador.

La UI debe comunicar el resultado como parte de la agenda del facturador. No debe indicar al operador ni al cliente final que el dato proviene de una base compartida.

## 5. Catalogo Por Facturador

El catalogo de productos/servicios es exclusivo de cada facturador.

Reglas:

- no existe catalogo global de productos/servicios;
- un producto del facturador A nunca debe mostrarse, sugerirse ni reutilizarse para el facturador B;
- cada busqueda, alta, edicion, activacion o desactivacion de item debe estar filtrada por `facturador_id`;
- los codigos de productos solo deben ser unicos dentro del catalogo del facturador;
- las modificaciones de catalogo afectan solo al facturador propietario.

## 6. Criterios De Aceptacion

- Un mismo documento puede estar en la agenda de multiples facturadores sin mezclar datos personalizados.
- La base global mejora el autocompletado, pero no se expone como concepto al usuario.
- Un alta manual de cliente crea o actualiza identidad global y crea/actualiza agenda del facturador.
- Una edicion de agenda no modifica agendas de otros facturadores.
- El catalogo no comparte datos entre facturadores.
