# SPEC Documentos En Escritorio v0.1

**Fecha:** 2026-11-09 · **Rama:** `feat/identidad-segel` · **Estado:** autorizada por el usuario el 2026-11-09 ("lo que si podemos comenzar a implementar son los modulos donde se van a ir viendo los documentos en nuestra app web"). Sin despliegue: se espera la version estable de FE.

## Alineacion

- `AGENTS.md` (regla de validacion visual, actualizada por esta decision).
- `docs/SPEC_AUTOGESTION_OPERADOR_v0.1.md`, seccion 9.3 (interfaz de escritorio) y `docs/BACKLOG.md` FS-37.
- `docs/BACKLOG.md` FS-50 (b): selector de tipo de documento de FE (FACTURA, NOTA_REMISION disponibles; NC, ND y autofactura "proximamente").
- `docs/SPEC_VERSION_ESTABLE_PRODUCCION_v0.1.md` del repositorio de FE (VE-F01, VE-F04): contrato de tipos y de la nota de remision, pendiente.

## Decision del usuario (2026-11-09)

La app web pasa de **mobile primero** a **escritorio primero (PC first)**, y sigue siendo responsive. La mayoria de los clientes la usa en PC, desde el navegador o instalada como app web (la app ya es instalable: `manifest.webmanifest` y `sw.js`).

## Objetivo

Que en PC la app se use como un sistema de facturacion de escritorio: navegacion siempre visible y documentos en tabla, con pestañas por tipo de documento preparadas para los tipos que FE va a ir habilitando. En celular se conserva lo que hay hoy.

## Alcance

### Fase A (esta iteracion, sin depender de FE)

1. **Marco de la app en escritorio** (ancho >= 1024 px): menu lateral fijo con las mismas opciones del menu actual y la barra superior a lo ancho. El boton de menu se oculta en escritorio. Documentos usa el ancho disponible (hasta 1440 px); las demas pantallas conservan su ancho actual, centradas. Debajo de 1024 px queda el menu actual.
2. **Documentos en tabla** (>= 1024 px), para facturas y notas de credito: columnas Fecha, Numero, Cliente, RUC o CI, Condicion, Estado (con color), CDC (abreviado, completo al pasar el mouse), Moneda, Total y Acciones (menu por fila con las mismas acciones de hoy). Clic en la fila abre la ficha. Debajo de 1024 px quedan las tarjetas actuales.
3. **Pestañas por tipo**: Facturas, Notas de credito, Notas de debito, Notas de remision, Autofacturas y Carga masiva. Las tres nuevas se muestran **"Próximamente"**, deshabilitadas, hasta que FS las incorpore (Fase B).
4. Filtros que ya existen (estado, tipo de operacion, fechas, busqueda), en una barra horizontal en escritorio. Paginacion de la tabla con el `limit`/`offset` que ya admite la API.

### Fase B (cuando FE publique los contratos de VE-F01 y VE-F04)

- Tipos `NOTA_REMISION`, `NOTA_DEBITO` y `AUTOFACTURA` en FS (migracion de `facturas_operativas_tipo_check`), incorporacion desde la carga (hoy RN-05 de `SPEC_TOTALES_FE_EN_CARGA_v0.1` los descarta) y su listado propio. La nota de remision lleva columnas propias (sin total ni IVA; transporte y rastreo).
- Disponibilidad de cada pestaña segun el estado que publique FE (`DISPONIBLE` o `PROXIMAMENTE`).

## Fuera de alcance

- **Saldo**: FS no calcula saldos de credito (FS-45); la columna llega con cobranzas.
- **Moneda extranjera**: FS-49. La columna Moneda muestra "PYG" hasta resolverlo.
- Cambiar el estilo del resto de las pantallas: conservan su ancho. Cada pantalla se pasa a escritorio en su propia cadena.

## Reglas

- **RN-01.** El punto de corte es 1024 px. Por encima, menu lateral y tabla; por debajo, menu desplegable y tarjetas. Sin deteccion de dispositivo.
- **RN-02.** La tabla no agrega acciones nuevas: el menu de cada fila ofrece lo mismo que la tarjeta de hoy, con las mismas reglas.
- **RN-03.** Una pestaña "Próximamente" no consulta la API ni muestra datos.
- **RN-04.** La validacion visual pasa a escritorio primero: 1280 y 1440 px, y al menos 390 px.

## Criterios de aceptacion

- **CA-01.** En 1280 y 1440 px se ve el menu lateral y Documentos en tabla, sin desplazamiento horizontal de la pagina.
- **CA-02.** En 390 px se ve lo de hoy: menu desplegable y tarjetas.
- **CA-03.** Clic en una fila abre la ficha; el menu de la fila ofrece las acciones de la tarjeta.
- **CA-04.** Las pestañas Notas de debito, Notas de remision y Autofacturas se ven "Próximamente" y no se pueden abrir.
- **CA-05.** Los filtros y la paginacion funcionan en la tabla.
- **CA-06.** Los recorridos E2E existentes (carga masiva, atencion, nota de credito) siguen pasando con el menu lateral.
