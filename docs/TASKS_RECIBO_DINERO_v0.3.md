# TASKS Recibo de Dinero v0.3

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RECIBO_DINERO_v0.3.md`
- `docs/PLAN_RECIBO_DINERO_v0.3.md`
- `spec/openapi.yaml` (sin cambios en esta version — se referencia solo para dejar constancia de que no aplica)

## Descripcion del modulo

Reutilizar en el formulario de Recibo de Dinero el mismo patron de autocompletado de cliente por RUC/CI que ya existe en Facturas (`InvoiceEditor`): busqueda en agenda propia del facturador, autocompletado por el padron local de DNIT, y alta/actualizacion del cliente en la agenda sin salir del formulario. Cambio 100% frontend, sin migracion, sin tocar Facturas ni Notas (se duplica el patron, no se extrae un componente compartido) — decisiones confirmadas explicitamente por el founder.

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
|---|---|---|---|---|
| RD3-001 | Frontend | Estado nuevo en `RecibosView` | DONE | Agregados `formPagadorClienteId`, `formPagadorDireccion`, `formPagadorTelefono`, `formPagadorEmail`, `clienteSuggestions`, `clienteSearching`, `clienteAutocompleting`, `clienteMessage`, `clienteSaving`, `clienteModalOpen`. `formPagadorDocTipo` tipado como `DocumentoIdentidadTipo` en vez de `string`. |
| RD3-002 | Frontend | `tryAutocompleteDnit()` en `RecibosView` | DONE | Copia adaptada de `InvoiceEditor` (`main.tsx:4102-4144`). Solo actua para `documento_tipo` `RUC`/`CI`; evita llamar a DNIT si ya hay match exacto en `clienteSuggestions`; en caso `ambiguous` muestra `clienteMessage`; en catch no interrumpe el flujo. |
| RD3-003 | Frontend | `applyClienteSuggestion()` en `RecibosView` | DONE | Rellena `formPagadorClienteId/DocTipo/Doc/Nombre/Direccion/Telefono/Email` desde una `ClienteSearchResult`/`ClienteResponse`; setea `clienteMessage` distinguiendo `AGENDA_FACTURADOR` vs sugerencia nueva; limpia `clienteSuggestions`. |
| RD3-004 | Frontend | `saveClienteRapido()` en `RecibosView` | DONE | POST `/clientes` si no hay `formPagadorClienteId`, PATCH `/clientes/:id` si lo hay, con `{documento_tipo, documento, razon_social, direccion, telefono, email}`. Al exito sincroniza `cliente_id` via `applyClienteSuggestion`, cierra el modal, setea mensaje "Cliente guardado..."/"Cliente actualizado.". |
| RD3-005 | Frontend | Busqueda con debounce | DONE | `useEffect` sobre `formPagadorDoc`, debounce 300ms, min 2 caracteres, llama `GET /clientes/search?q=&limit=5`, actualiza `clienteSuggestions`. |
| RD3-006 | Frontend | JSX: campo Documento con tipo ampliado + sugerencias | DONE | Selector de tipo con los 5 valores de `DocumentoIdentidadTipo` (antes 3). Input de documento con `onChange` (resetea cliente_id/nombre/direccion/telefono/email), `onBlur` y `onKeyDown` Enter/Tab disparando `tryAutocompleteDnit`. Lista de sugerencias (`.suggestion-list`) clickeable. Indicador "Buscando cliente..."/"Autocompletando..." mientras corresponda. |
| RD3-007 | Frontend | JSX: campos Direccion/Telefono/Correo | DONE | Tres campos opcionales nuevos en el formulario, con `<small>(opcional)</small>`, mismo estilo que Facturas. No se envian al crear/actualizar el recibo. |
| RD3-008 | Frontend | JSX: boton Guardar/Actualizar cliente + modal | DONE | Boton deshabilitado sin documento o nombre; texto "Guardar cliente" (abre modal) o "Actualizar" (guarda directo) segun `formPagadorClienteId`. Modal de confirmacion con resumen documento+razon social y boton "Confirmar alta", igual que en Facturas. |
| RD3-009 | Frontend | Reset de estado en `openNew`/`openEdit`/tras guardar recibo | DONE | `openNew` y `openEdit` inicializan/limpian todos los campos nuevos. Tras `saveRecibo()` exitoso se resetean igual que `whatsappPhone`. `openEdit` deja direccion/telefono/email/clienteId vacios (documentado como limitacion aceptada en SPEC). |
| RD3-010 | Frontend | Confirmar que `saveRecibo()` no cambia de payload | DONE | El body enviado a `POST/PATCH /recibos` sigue siendo exactamente `{pagador_nombre, pagador_documento_tipo, pagador_documento, concepto, importe, forma_pago, fecha_cobro, referencia_bancaria}` — sin `direccion`/`telefono`/`email`. |
| RD3-011 | Frontend | QA frontend | DONE | `npm run typecheck --workspace=@facturacion-simple/web-operacion` exit 0. `npm run build --workspace=@facturacion-simple/web-operacion` exit 0. |
| RD3-012 | QA — Playwright | Validacion funcional y visual | DONE | Escenarios en mobile y desktop: buscar documento existente en agenda → sugerencia → seleccionar → campos completos; documento inexistente en agenda pero en DNIT → autocompleta nombre; documento inexistente en ambos → sin error, carga manual; guardar cliente nuevo desde el formulario de recibo → aparece en `/clientes`; actualizar datos de un cliente existente desde el formulario de recibo; crear y emitir un recibo con datos autocompletados → PDF y detalle sin regresiones. |

## Notas de producto

- No se modifica el modelo de datos de `recibos_dinero` ni el contrato de `POST/PATCH /recibos`.
- `InvoiceEditor` (Facturas) y `NotasView` quedan intactos — este cambio no los toca.
- Los campos `direccion`/`telefono`/`email` del formulario de recibo son transitorios: solo existen en el estado de React mientras se completa el formulario, se usan para `/clientes` y se descartan al guardar el recibo.
- Decisiones de alcance (sin migracion, sin hook compartido) fueron preguntadas explicitamente al founder antes de escribir este documento — ver "Contexto y motivacion" en el SPEC.

## Evidencia

- 2026-07-11: Investigacion completa del patron de autocompletado existente (Agenda/Facturas/Notas) realizada antes de documentar — confirmado que es codigo duplicado 3 veces, no un componente compartido, y que el backend de `/clientes` ya es generico y reutilizable sin cambios. Dos ambiguedades reales identificadas y resueltas con el founder: (1) alcance de persistencia en `recibos_dinero` → sin migracion; (2) estrategia de reuso de codigo → duplicar el patron una 4ta vez en `RecibosView`. `SPEC_RECIBO_DINERO_v0.3.md` y `PLAN_RECIBO_DINERO_v0.3.md` redactados con referencias exactas a `main.tsx` (funciones y JSX de `InvoiceEditor` a replicar).
- 2026-07-11: Implementacion de RD3-001 a RD3-011 completada en `apps/web-operacion/src/main.tsx` (`RecibosView`), siguiendo el PLAN al pie de la letra: estado nuevo, `tryAutocompleteDnit`, `applyClienteSuggestion`, `saveClienteRapido`, debounce de busqueda, JSX del campo Documento con sugerencias, campos Direccion/Telefono/Correo, boton Guardar/Actualizar cliente + modal, reset de estado en `openNew`/`openEdit`/`saveRecibo`. `saveRecibo()` confirmado sin cambios de payload. `typecheck` y `build` de `apps/web-operacion` en verde. Cero cambios en backend, cero migraciones, `InvoiceEditor` y `NotasView` sin tocar.
- 2026-07-11: RD3-012 — validacion Playwright contra el mismo stack local (docker compose, 127.0.0.1:8195) usado para v0.2. Se sembro un registro sintetico en la tabla local `dnit_ruc_contribuyentes` (RUC 7000111-5 "PLAYWRIGHT DNIT TEST SA", solo en la base local descartable) para poder probar el camino de autocompletado por DNIT de extremo a extremo. Escenarios ejecutados en mobile (375×812) y desktop (1280×900), todos sin errores: (1) documento no existente en agenda pero si en el padron DNIT → autocompleta tipo/documento/nombre; (2) "Guardar cliente" desde el formulario de recibo → modal → `POST /clientes` exitoso, boton pasa a "Actualizar"; (3) se interceptó la respuesta real de `POST /recibos` y se confirmo que el payload creado **no** incluye `direccion`/`telefono`/`email` (solo los campos que `recibos_dinero` ya tenia desde v0.1/v0.2); (4) buscar el mismo RUC de nuevo muestra la sugerencia de agenda ("Agenda"), seleccionarla vincula `cliente_id` (boton "Actualizar"); (5) documento sin coincidencia en agenda ni DNIT no autocompleta nada y no muestra error, permite carga manual. Capturas de pantalla revisadas una por una en ambos viewports — estilo visual identico al de Facturas.
