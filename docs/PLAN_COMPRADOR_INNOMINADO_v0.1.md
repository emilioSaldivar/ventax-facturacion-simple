# PLAN - Comprador sin nombre (innominado) en la factura v0.1

SPEC: `docs/SPEC_COMPRADOR_INNOMINADO_v0.1.md`.

## Base y despliegue

- Rama `hotfix/comprador-innominado` desde `b252627` (lo que corre en `segel-fs`), para que a produccion entre solo este cambio. Despues se integra en `feat/identidad-segel`.
- Sin migraciones, sin variables nuevas, sin cambios de compose. Despliegue solo de FS (`migrate`, `api`, `frontend`) con el metodo de E-6 (`TASKS_DESPLIEGUE_SEGEL_FS_v0.2`): imagenes construidas en la estacion, transferidas por SSH, respaldo previo de la base y etiqueta `:antes-innominado` para volver atras.

## API (`apps/api`)

1. `facturas.types.ts`: `facturaDocumentoTipos = [...documentoIdentidadTipos, "INNOMINADO"]`, `FacturaDocumentoTipo`; `FacturaClienteInput.documento_tipo` pasa a `FacturaDocumentoTipo`. Constantes `INNOMINADO_DOCUMENTO = "0"`, `INNOMINADO_NOMBRE = "Sin Nombre"`, `TOPE_INNOMINADO_GS = 7_000_000`. La lista de la agenda (`documentoIdentidadTipos`) no cambia.
2. `facturas.routes.ts`: el esquema del cliente de la factura usa `facturaDocumentoTipos`.
3. `facturas.service.ts`:
   - `normalizarClienteInnominado(input)` al entrar a `previewFactura` y al crear (RN-03).
   - `validarTopeInnominado(input, totals)` tras calcular totales en `previewFactura`, que tambien usa la creacion (RN-04). Total en Gs = `totals.total` en PYG, `Math.round(totals.total * tipo_cambio)` fuera de PYG.
   - `esFacturaInnominada(documento)` (`cliente.documento_tipo === "INNOMINADO"`) en `getNotaCreditoIneligibility`, `emitNotaCreditoTotal` y `emitNotaCreditoParcial` con `MENSAJE_NOTA_CREDITO_INNOMINADA` (RN-06).
4. `fiscal-gateway.client.ts` `buildReceptor`: sin cambio de logica (pasa el tipo tal cual y solo suma `dv`/`naturaleza` con RUC). Se cubre con prueba (RN-05).
5. `spec/openapi.yaml`: `INNOMINADO` en el `documento_tipo` del cliente de la factura y el motivo `NOTA_CREDITO_INNOMINADA`.

## Web (`apps/web-operacion`)

1. `tipos.ts`: `FacturaDocumentoTipo` = `DocumentoIdentidadTipo | "INNOMINADO"` en `FacturaClienteInput` y en el cliente de `DocumentoResponse`.
2. `main.tsx`, editor de factura:
   - opcion `<option value="INNOMINADO">Sin nombre</option>` solo en el selector del editor (no en agenda ni recibos); la linea de estado del cliente dice "Consumidor final sin datos: no se guarda en la agenda y no admite nota de crédito" (la etiqueta larga no entraba en el selector a 1280/1440);
   - `cambiarTipoDocumento(tipo)`: a INNOMINADO fija `0`/`Sin Nombre`, `cliente_id: null`, `naturaleza: undefined`, `clienteOrigen: null`, sugerencias vacias, `guardarEnAgenda: false`; desde INNOMINADO a otro tipo vacia documento y nombre (RN-01, RN-02);
   - inputs de numero y nombre `readOnly` con innominado; sin autocompletado DNIT ni busqueda en agenda; casilla de agenda oculta; `emitFactura` no guarda en agenda;
   - motivo de bloqueo con el texto de RN-04 cuando el total en Gs llega al tope, calculado sobre las lineas validas del pedido (cantidad x precio, por el tipo de cambio fuera de PYG) para no depender de la vista previa; la API rechaza igual (400).
3. `views/DocumentsView.tsx`: `canEmitNotaCredito` devuelve `false` con innominado y se muestra el aviso de RN-06.
4. `components/ResultadoEmision.tsx`: el resultado muestra "Sin nombre (consumidor final)" en lugar de `INNOMINADO 0` (RN-07). La lista y la ficha de Documentos muestran el nombre "Sin Nombre" y el documento "0" sin cambios.
5. `lib/innominado.ts`: constantes y `esClienteInnominado`, compartidas por el editor, la ficha y el resultado.

## Pruebas

- API (vitest): normalizacion, tope en PYG y USD (justo debajo y en el tope), receptor enviado al gateway, NC total y parcial 409, candidatos con motivo.
- `npm run typecheck`, `npm run lint`, `npm run test` (api) y `npm run build` (web).
- Playwright contra el stack local (`bash scripts/deploy.sh`, FE mock) en 1280, 1440 y 390: editor con innominado (CA-01), bloqueo por tope (CA-02), ficha sin NC (CA-03).

## Riesgos

- El editor de b252627 es anterior a URA-009 y a los textos A-1..A-8; al integrar en `feat/identidad-segel` puede haber conflictos en `main.tsx`. Se resuelven a mano conservando ambos cambios.
- No se prueba contra SIFEN: en produccion no se emiten comprobantes de prueba (regla de `segel-fs`). La forma del receptor es la documentada por FE y ya cubierta en su coleccion.
