# PLAN Documentos En Escritorio v0.1

**Fecha:** 2026-11-09 · **SPEC:** `docs/SPEC_DOCUMENTOS_ESCRITORIO_v0.1.md` · Fase A.

Todo en `apps/web-operacion` (`main.tsx` y `styles.css`). Sin cambios de API ni de base.

## 1. Punto de corte

Hook `useEsEscritorio()` con `window.matchMedia("(min-width: 1024px)")` y su evento `change`. Lo usan el marco y Documentos para elegir que dibujar; el CSS usa la misma media query para el armado.

## 2. Marco (`operation-shell`)

- En escritorio, `operation-shell` pasa a grilla de dos columnas: `nav.side-nav` (240 px, fija con `position: sticky`) y el contenido. La barra superior ocupa todo el ancho, sin el tope de 520 px.
- `side-nav` reutiliza `menuSections` y `menuItems` con el mismo `goTo` y las mismas reglas de `disabled`; muestra icono y etiqueta, sin los textos de ayuda. Marca la vista activa.
- El boton "Abrir menu" no se dibuja en escritorio.
- Los guiones de Playwright del repo abren las pantallas con un helper que usa el menu lateral si esta visible y, si no, el boton de menu.

## 3. Documentos

- La seccion usa `documents-view-ancha` (hasta 1440 px) en escritorio.
- Pestañas: `FACTURAS`, `NOTAS_CREDITO`, `NOTAS_DEBITO`, `NOTAS_REMISION`, `AUTOFACTURAS`, `CARGA_MASIVA` (esta ultima solo con carga masiva habilitada, como hoy). Las tres nuevas: boton deshabilitado con la etiqueta "Próximamente" y `title` explicativo; nunca cambian `docKindTab` (RN-03).
- Filtros: los mismos controles, en fila (`documents-filtros` con `flex-wrap`) en escritorio.
- Tabla (`table.documents-tabla`) en escritorio, en lugar de las tarjetas:
  - Columnas: Fecha (`formatShortDate(created_at)`), Numero (con el icono de accion y la marca de carga), Cliente, RUC o CI (`cliente.documento`), Condicion (`condicion_venta`), Estado (`EstadoDocumentoPill`), CDC (primeros 8 y ultimos 4, `title` con el completo), Moneda (`"PYG"`), Total (`formatGuaranies`), Acciones.
  - Clic en la fila (salvo en la columna de acciones) abre `openDetail`.
  - Acciones: el mismo menu de la tarjeta, extraido a `menuDeFila(documento)` para que tarjeta y tabla compartan la misma regla (RN-02).
- Paginacion: estado `pagina`; `loadDocuments` manda `offset = (pagina - 1) * 30` y guarda `total`. Anterior y siguiente debajo de la lista, en escritorio y en celular. Cambiar un filtro o la pestaña vuelve a la pagina 1.

## 4. Estilos

Media query `(min-width: 1024px)`: grilla del marco, `side-nav`, ancho de `topbar`, `documents-tabla` (encabezado fijo dentro del contenedor, filas con hover, columnas numericas alineadas a la derecha) y `documents-filtros`. Sin cambios debajo de 1024 px.

## 5. Pruebas

- `typecheck` y `build` de `web-operacion`.
- Playwright contra el stack local (`scripts/segel-fs/playwright-documentos-escritorio.cjs`): CA-01 a CA-05 en 1280, 1440 y 390.
- CA-06: volver a correr `playwright-atencion-comprobantes.cjs` y `playwright-nota-credito-referencia.cjs` con el helper de navegacion.

## 6. Fase B1: notas de remision

- **Migracion `0040`:** `facturas_operativas_tipo_check` suma `NOTA_REMISION`; `condicion_venta` admite `null` (check `null` o `CONTADO`/`CREDITO`); `cargas_masivas.tipo_documento text not null default 'FACTURA'` con check `FACTURA`/`NOTA_REMISION`.
- **Tipos:** `DocumentoTipo` suma `NOTA_REMISION`; `DocumentoResponse.condicion_venta` pasa a `CondicionVenta | null`; `DocumentoResponse.remision?` con `{ motivo, motivo_descripcion, inicio_traslado, fin_traslado, transportista, vehiculo, kilometros }` armado desde `fiscal_request_snapshot` solo para NRE.
- **Gateway:** `FeCrearCargaInput.tipoDocumento?` va como `tipo_documento` en la URL de `POST /v1/cargas`; `getPlantillaCarga(tipo?)` agrega `?tipo_documento=`. `FeCarga.tipo_documento?`. Detalle NRE como tipo propio.
- **Carga:** la ruta de subida acepta `?tipo_documento=FACTURA|NOTA_REMISION`; la plantilla `?tipo_documento=`. El repositorio guarda `tipo_documento` de la carga. `comprobanteADocumento` elige: `FACTURA` como hoy; `NOTA_REMISION` arma el documento sin montos (totales en cero, lineas con precio 0 e `iva_tipo` `EXENTA` por la restriccion de la tabla, que no se muestran); otros tipos se descartan con aviso.
- **Mock:** una carga con `tipoDocumento: NOTA_REMISION` devuelve detalles NRE.
- **Pantalla:** selector de tipo en "Nueva carga" con el catalogo fijado en el codigo (`TIPOS_DE_CARGA`); tipo en la lista y en el encabezado de la carga; pestaña "Notas de remision" habilitada con `tipo=NOTA_REMISION`, columnas de RN-08 y menu de fila de RN-09; ficha de NRE con los datos de remision y lineas sin precio.
- **Contrato propio:** `spec/openapi.yaml` (parametros `tipo_documento`, `NOTA_REMISION` en el enum de tipo, `remision`, `condicion_venta` nullable).
- **Pruebas:** unitarias del mapeo NRE, mock, ruta y servicio; Playwright con FE `segel-rc4.21` en SIFEN test: una carga NRE con los ejemplos de FE, la pestaña y la ficha, en 1440, 1280 y 390.

