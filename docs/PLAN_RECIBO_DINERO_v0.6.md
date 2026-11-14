# PLAN Recibo de Dinero v0.6: perfil de emision y moneda

Implementa `docs/SPEC_RECIBO_DINERO_v0.6.md`. Base de codigo: rama `feat/identidad-segel` en `061e36a` (tag local `segel-fs-2026.11.13.2`, E-3). Sin migraciones.

## 1. Compartido

- La API valida con `monedasFactura` (PYG, USD, EUR, BRL; D-1). El formulario ofrece solo `PYG` y `USD` (constante local `MONEDAS_RECIBO_MANUAL`). Se reusan `monedasFactura`, `decimalesDeMoneda` y `tieneDecimalesValidos` de `packages/shared/src/money/moneda.ts`. No se crea una lista nueva de monedas del recibo: D-1 dice que son las de la factura.

## 2. API: validacion (`apps/api/src/modules/recibos/recibos.routes.ts`)

- `createBodySchema.moneda`: `z.enum(monedasFactura).optional()` en lugar de `z.string().min(1).optional()`.
- `createBodySchema` con `superRefine`: si `!tieneDecimalesValidos(importe, moneda ?? "PYG")`, issue en `["importe"]` con "En guaranies, el importe va sin decimales" o "El importe admite hasta 2 decimales". Se encadena con `refinarPagador`, que sigue igual.
- `updateBodySchema`: `moneda` con el mismo enum. La regla cruzada del `PATCH` va en el servicio (§3), porque necesita el borrador guardado.
- `POST /facturas/:documentoId/recibo` no cambia: `moneda: factura.moneda ?? "PYG"` ya es una de las cuatro (`facturas.routes.ts:83`) y `factura.totals.total` respeta los decimales de su moneda.

## 3. API: servicio (`recibos.service.ts`)

- `buildFiscalCrearReciboRequest` suma `emission_profile_code` desde `context.fiscal_context.perfil_emision_codigo`, solo si es distinto de `"NO_REQUERIDO"` (D-2). El flag `sendEmissionProfileCode` del cliente fiscal se respeta en el cliente (§4), no en el servicio.
- `editarRecibo`:
  - Calcula `monedaFinal = input.moneda ?? existing.moneda` e `importeFinal = input.importe ?? existing.importe`. Si `!tieneDecimalesValidos(importeFinal, monedaFinal)` → `HttpError(400, "VALIDATION_ERROR", ..., { issues: [{ path: ["importe"] }] })`, con el mismo formato de detalle que `validateRequest`. Hay que confirmar el formato al implementar.
  - El `patch` deja de mandar `actividad_economica_codigo` (D-3) y no manda `emission_profile_code`.
- `mapFiscalGatewayError` suma los casos:
  - `EMISSION_PROFILE_NOT_AVAILABLE` → 422 `VALIDATION_ERROR` con el texto de RN-05;
  - `ACTIVITY_PROFILE_MISMATCH` → 422 con el texto de RN-05;
  - `VALIDATION_ERROR` de FE con `body.details[].path[0]` igual a `"moneda"` o `"importe"` → 422 con el texto de RN-01 o RN-02.
- Mensajes con tildes en la pantalla (PAUTAS P-X): "Avisá a soporte", "emisión", "guaraníes".

## 4. Cliente fiscal (`fiscal-gateway.types.ts`, `fiscal-gateway.client.ts`)

- `FiscalCrearReciboRequest` suma `emission_profile_code?: string`. `FiscalEditarReciboRequest.patch` lo hereda por el `Partial<Omit<...>>`, pero el servicio no lo usa en el `PATCH`.
- `FiscalReciboResult` suma `emission_profile_code: string | null`; `mapFiscalReciboResponse` lo lee con `stringOrNull(data.emission_profile_code)`.
- `crearRecibo` real: si `this.config.sendEmissionProfileCode === false`, borra `emission_profile_code` del cuerpo antes de enviarlo, igual que la factura (`fiscal-gateway.client.ts:1035`).
- Mock (`crearRecibo` y `editarRecibo`):
  - reproduce §71: `moneda` fuera de las cuatro → 422 `VALIDATION_ERROR` con `details: [{ path: ["moneda"] }]`; PYG con decimales → `path ["importe"]`;
  - `emission_profile_code === "NO-EXISTE"` → 422 `EMISSION_PROFILE_NOT_AVAILABLE`;
  - devuelve `emission_profile_code` (null si no vino).

  Asi CA-03/CA-06 se prueban sin FE.

## 5. Repositorio y tipos (`recibos.repository.ts`, `recibos.types.ts`)

- `ReciboRecord.emission_profile_code: string | null`. El mapeo de fila lo lee de `fiscal_response_snapshot->'raw'->>'emission_profile_code'`, o de la clave que use hoy el snapshot guardado. Hay que confirmar al implementar con una fila del stack local. Sin columna nueva (RN-07).
- `ReciboCreateInput` y `ReciboUpdateInput`: `moneda?: MonedaFactura`.

## 6. Pantalla (`apps/web-operacion/src/main.tsx`, `RecibosView`)

- Entre "Concepto" e "Importe", un `<select>` "Moneda" con `PYG` y `USD` (D-1, RN-06); `value={formMoneda}`. Si el borrador en edicion tiene `referencia_documento_uuid` o una moneda fuera de esas dos, se agrega la opcion de su moneda y el select va deshabilitado (D-4).
- `onChange` de la moneda: si pasa a `PYG`, `setFormImporte(String(Math.trunc(Number(formImporte) || 0) || ""))`; si no, deja el importe.
- Validacion local: el campo ya normaliza el importe segun la moneda (`normalizeIntegerInput` en PYG, `normalizeDecimalInput` con 2 decimales en otra), asi que no puede quedar un importe fuera de RN-02; el frontend no importa `@facturacion-simple/shared`. Si la API igual rechaza, el mensaje se muestra en el aviso de error del formulario (`setError`), como hoy.
- `ReciboRecord` en `tipos.ts` suma `emission_profile_code?: string | null`. No se muestra en pantalla en esta version.
- PAUTAS: select con el componente y los tokens del catalogo (P-C) y etiqueta visible (P-A).

## 7. Contrato (`spec/openapi.yaml`)

- `ReciboCreateRequest.moneda` y `ReciboUpdateRequest.moneda`: `enum [PYG, USD, EUR, BRL]`, descripcion de decimales.
- `ReciboRecord.emission_profile_code`: string, nullable.
- Errores 400/422 nuevos en `POST /recibos` y `PATCH /recibos/{reciboId}`.

## 8. Pruebas

- Unitarias (`recibos.service.test.ts` y `recibos.routes.test.ts`, o los que existan):
  - perfil enviado y omitido con `NO_REQUERIDO`;
  - `PATCH` sin perfil ni actividad;
  - mapeo de los 3 errores nuevos;
  - CA-03 y CA-04.
- `npm run test`, `npm run typecheck` y `npm run lint` en la API; `npm run typecheck` y `npm run build` en `web-operacion`.
- Playwright `scripts/segel-fs/playwright-recibo-moneda.cjs` contra la pila local de Segel (`.local/segel-ensayo`, la misma de E-3), que usa el FE real de `fe-segel` y no el mock. Casos: `pantalla` (RN-06, RN-02 y CA-09 en 1440, 1280 y 390), `api` (CA-03 y CA-04) y `emitir` (CA-01 y CA-08 con el FE de la pila). CA-06 se cubre con las pruebas unitarias, porque el FE real no permite forzar un perfil inexistente desde la pantalla. CA-07 necesita una factura a credito aprobada y va con RDM-010.
- Pila `fe-segel` con el candidato de FE que lleve v0.56 (tag pendiente de FE):
  - CA-01, CA-02 y CA-07 con el PDF real (moneda, letras y cabecera del perfil);
  - CA-08 con `segel-rc4.37.1`: perfil enviado a un FE sin v0.56. Si FE rechaza el campo desconocido, se documenta y el envio del perfil queda detras del flag.
- Regresion de direccion (Playwright DIR) contra el mismo candidato de FE, porque el tren cambia.

## 9. Despliegue

- Tag FS nuevo sobre `061e36a` con v0.6. Pasa a ser el contenido de E-3 en `TASKS_DESPLIEGUE_SEGEL_FS_v0.4`, o de un E-4 si E-3 sale antes con `061e36a`, segun decida el usuario.
- Orden: FE primero (tren siguiente con `feat/recibo-perfil-moneda`), humo, despues FS. FS v0.6 tambien funciona con FE `rc4.37.1` si CA-08 da bien, asi que el orden no bloquea.
- Sin migracion: la vuelta atras es la imagen anterior.

## 10. Riesgos

- CA-08 sin verificar: no se sabe si FE `rc4.37.1` rechaza `emission_profile_code` en el recibo (esquema estricto). Mitigacion: flag `FE_SEND_EMISSION_PROFILE_CODE` y la prueba de CA-08 antes del deploy.
- Borradores en USD creados antes de v0.6 por el recibo desde factura: siguen editables; la regla RN-02 aplica sobre el resultado.
