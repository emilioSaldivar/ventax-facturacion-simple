# PLAN Planillas De Ejemplo Y Documentacion De La Planilla v0.1

**Fecha:** 2026-11-10 · **SPEC:** `docs/SPEC_PLANILLAS_EJEMPLO_v0.1.md`

## 1. Gateway

- Tipo `FeParametrosPlanilla = { emisorId, numeracion, actividadEconomicaCodigo, emissionProfileCode? | establecimiento?, punto?, tipoDocumento? }` (los mismos campos de `FeCrearCargaInput` que fijan el punto).
- `getPlantillaCarga(tipo?)` pasa a `getPlantillaCarga(parametros?: FeParametrosPlanilla)`; arma la query con esos campos.
- Nuevos: `listEjemplosCarga(tipo)` → `FeCargaEjemplos`; `getEjemploCarga(codigo, parametros)` → CSV; `getDiccionarioCarga(tipo, formato: "pdf" | "md")` → archivo.
- Mock: dos ejemplos de factura (B2C contado, B2B credito con cuotas) y uno de NRE; diccionario como texto; `404 EJEMPLO_NOT_FOUND` para un codigo desconocido.

## 2. Servicio y rutas (`cargas.service.ts`, `cargas.routes.ts`)

- `parametrosDePlanilla(context, tipo)` reutiliza el armado de `subirCarga` (perfil o establecimiento y punto).
- `descargarPlantilla(context, deps, tipo)` usa esos parametros.
- `GET /cargas/ejemplos?tipo_documento=` → `{ ejemplos: [...sin href], tipo_documento }`.
- `GET /cargas/ejemplos/:codigo?tipo_documento=` → CSV adjunto `ejemplo-<codigo>.csv`; `codigo` con `^[A-Z0-9_]{1,60}$`.
- `GET /cargas/diccionario?tipo_documento=&formato=pdf|md` → adjunto `planilla-<facturas|notas-remision>.pdf|md`.
- Errores con `traducirErrorFe`; ademas `404` de FE con `EJEMPLO_NOT_FOUND` responde `404 NOT_FOUND`.

## 3. Pantalla (`carga-masiva.tsx`)

- En "Nueva carga", bajo el selector de tipo: boton "Descargar planilla de ejemplo" que despliega un menu agrupado por `tipo_cliente` (RN-02) y cierra con "Documentación de la planilla (PDF)" y "(Markdown)". Al cambiar el tipo se vuelve a pedir la lista. Aviso de RN-05.
- Las descargas reutilizan `descargar(path, nombre)`.

## 4. Contrato propio

`spec/openapi.yaml`: las tres rutas nuevas y los parametros de la plantilla.

## 5. Pruebas

- Unitarias: gateway real (URL y query de ejemplo, plantilla y diccionario), mock, rutas (validacion del codigo, adjuntos).
- Playwright con FE `segel-rc4.25` en el stack local: menu por tipo, descarga de un ejemplo de factura y uno de NRE, subida del ejemplo de factura sin `PUNTO_DISTINTO`, PDF de la documentacion; 1440, 1280 y 390.
