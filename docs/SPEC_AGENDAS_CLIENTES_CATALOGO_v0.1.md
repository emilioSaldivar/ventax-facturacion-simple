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

## 7. UX Operativa De Clientes (Seleccion Rapida Y Edicion Inmediata)

La pantalla de clientes debe priorizar el flujo operativo de facturacion:

- accion principal: seleccionar/usar cliente;
- accion secundaria: editar cliente;
- administracion completa como accion contextual, no como formulario fijo siempre visible.

### 7.1 Estructura Visual

- La lista de clientes debe renderizarse como tarjetas interactivas con jerarquia clara:
  - nombre/razon social con mayor peso visual;
  - documento en segundo nivel;
  - acciones rapidas visibles (`Usar`, `Editar`).
- El formulario fijo al final de la pantalla debe eliminarse.
- La creacion de cliente debe abrirse mediante accion principal (`+ Nuevo cliente`) en modal, bottom sheet o vista dedicada corta.

### 7.2 Edicion

- La edicion debe abrirse de forma inmediata desde cada tarjeta (modal o bottom sheet), sin obligar a desplazarse hasta el final.
- Campos de edicion esperados: documento, nombre/razon social, telefono, correo y direccion.

### 7.3 Busqueda Y Autocompletado

- La busqueda debe ser instantanea mientras el usuario escribe.
- Placeholder recomendado: `Buscar cliente...`.
- Debe reutilizarse la logica de autocompletado ya existente en el producto para:
  - sugerir cliente existente;
  - completar nombre/razon social;
  - inferir tipo de documento;
  - exponer estado de RUC cuando aplique al flujo actual.
- La UX debe evitar duplicados cuando el cliente ya exista.

### 7.4 Estados Vacios Y Mobile

- Sin resultados: mostrar estado vacio con mensaje amigable y CTA de creacion.
- Las tarjetas y acciones deben ser tactiles, de una sola mano y sin requerir precision extrema.

### 7.5 Restriccion Tecnica

- Esta iniciativa no modifica contratos HTTP, backend, modelos de datos ni validaciones fiscales.
- Alcance exclusivo: UX/UI frontend operativa, accesibilidad tactil y reorganizacion visual del flujo.
