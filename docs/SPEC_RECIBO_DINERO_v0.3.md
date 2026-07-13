# SPEC Recibo de Dinero v0.3

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RECIBO_DINERO_v0.1.md`
- `docs/SPEC_RECIBO_DINERO_v0.2.md`
- `docs/PLAN_RECIBO_DINERO_v0.3.md`
- `docs/TASKS_RECIBO_DINERO_v0.3.md`

---

## Contexto y motivacion

El campo "Pagador" del formulario de recibos (`docs/SPEC_RECIBO_DINERO_v0.1.md`, seccion 9.3) es hoy un input de texto libre sin ningun vinculo con la agenda de clientes del facturador. El founder pidio replicar, en el formulario de Recibo de Dinero, el mismo patron de autocompletado por RUC/CI que ya existe en Facturas (`InvoiceEditor`) y, de forma reducida, en Notas de Pedido/Presupuesto (`NotasView`):

- buscar en la agenda propia del facturador (y en la identidad compartida del tenant) a medida que se escribe el documento;
- autocompletar por el padron local de DNIT si no hay coincidencia en la agenda;
- permitir guardar el pagador como cliente nuevo en la agenda, o actualizar sus datos si ya existe, sin salir del formulario de recibo.

Investigacion previa a este documento confirmo que este patron **no es un componente compartido**: esta duplicado de forma independiente en `ClientesAgendaView`, `InvoiceEditor` (Facturas) y `NotasView`, cada uno con su propia copia de estado y funciones (`tryAutocompleteDnit`/`autocompleteFromDnit`, `applyClienteSuggestion`/`applySuggestion`, `saveClienteRapido`/`saveCliente`). El backend si es compartido: `GET /clientes/search`, `GET /clientes/dnit/autocomplete`, `POST /clientes`, `PATCH /clientes/:id` (`apps/api/src/modules/clientes/`) ya son genericos, no dependen de estar dentro del flujo de Facturas, y **no requieren ningun cambio** para esta version.

Decisiones tomadas con el founder antes de este SPEC (dos ambiguedades reales, resueltas explicitamente):

1. **Persistencia**: el recibo (`recibos_dinero`) sigue guardando exactamente lo mismo que hoy — `pagador_nombre`, `pagador_documento_tipo`, `pagador_documento`. No se agregan columnas `direccion`/`telefono`/`email`/`cliente_id` a `recibos_dinero`. Estos campos nuevos viven **solo en el estado local del formulario**, y se usan para (a) prellenar desde la agenda/DNIT y (b) alimentar el guardado/actualizacion del cliente en `/clientes`. **No se crea ninguna migracion.**
2. **Estrategia de implementacion**: se duplica el patron una cuarta vez dentro de `RecibosView` (mismo criterio que ya siguen Agenda/Facturas/Notas), en vez de extraer un hook o componente compartido. No se toca `InvoiceEditor` ni `NotasView`.

---

## Alcance v0.3

### 1. Campo "Documento" con busqueda en agenda + autocompletado DNIT

- El input de documento del pagador dispara, con debounce de 300ms, `GET /clientes/search?q=<texto>&limit=5` a partir de 2 caracteres — igual que Facturas (`main.tsx:3812-3832`).
- Los resultados se muestran como lista de sugerencias debajo del input (documento, razon social, origen "Agenda"/"Sugerencia"); click en una sugerencia rellena el formulario completo (documento_tipo, documento, nombre, direccion, telefono, email, y guarda el `cliente_id` en estado local del formulario).
- Al perder foco del input o presionar Enter/Tab, si `documento_tipo` es `RUC` o `CI` y no hubo coincidencia exacta ya mostrada en las sugerencias, se llama `GET /clientes/dnit/autocomplete?documento_tipo=&documento=` — igual regla que Facturas (`main.tsx:4102-4144`). Autocompleta `documento_tipo`, `documento` y nombre; **no** completa direccion/telefono/email (DNIT no los provee).
- Si DNIT no encuentra nada, no hay error visible ni bloqueo — el operador completa el nombre a mano, igual que en Facturas y Notas.
- Al cambiar manualmente el documento, se resetea el `cliente_id` local y los campos nombre/direccion/telefono/email, para no dejar datos de un pagador anterior pegados a un documento distinto.

### 2. Tipo de documento — ampliar a los 5 valores estandar

El selector de "Tipo documento" del formulario de recibo pasa de 3 opciones (`CI`, `RUC`, `PASAPORTE`) a los 5 valores de `DocumentoIdentidadTipo` ya usados en Facturas/Notas/Agenda: `RUC`, `CI`, `PASAPORTE`, `CEDULA_EXTRANJERA`, `NO_ESPECIFICADO`. Necesario para que el mismo flujo de busqueda/autocompletado funcione igual que en el resto del sistema. `recibos_dinero.pagador_documento_tipo` ya es `text` sin `CHECK` (acepta cualquier valor) — no requiere cambios de esquema.

### 3. Campos nuevos en el formulario: Direccion, Telefono, Correo (opcionales)

Se agregan al formulario de alta/edicion de recibo, debajo de "Nombre o razon social", con el mismo estilo que Facturas (`field-grid`, `<small>(opcional)</small>`). **Estos tres campos no se envian en el payload de creacion/edicion del recibo** (`POST /recibos`, `PATCH /recibos/:id` no cambian de contrato) — solo se usan para prellenar y para el guardado en `/clientes` (ver punto 4). Al editar un recibo existente (`openEdit`), estos tres campos quedan vacios porque el recibo no los persiste — es una limitacion conocida y aceptada de la decision "sin migracion" (ver "Fuera de alcance").

### 4. Guardar/actualizar cliente en la agenda desde el formulario de recibo

- Boton "Guardar cliente" (si no hay `cliente_id` local) o "Actualizar" (si lo hay), deshabilitado mientras falten documento o nombre — igual criterio que Facturas (`main.tsx:4478-4488`).
- "Guardar cliente" abre un modal de confirmacion con resumen (documento + razon social) y boton "Confirmar alta" — mismo componente visual que el modal de Facturas (`main.tsx:4864-4892`), adaptado al contexto de recibo.
- "Actualizar" (cuando ya hay `cliente_id`) guarda directo, sin modal, igual que Facturas.
- Ambos casos llaman `POST /clientes` o `PATCH /clientes/:id` (endpoints ya existentes, sin cambios) con `{ documento_tipo, documento, razon_social, direccion, telefono, email }`.
- Al guardar con exito, se sincroniza el `cliente_id` local con la respuesta del backend (para que un siguiente click sea "Actualizar" en vez de "Guardar cliente" otra vez).

### 5. Sin cambios de backend

- No se crea ninguna migracion.
- No se agregan ni modifican endpoints. `/clientes/search`, `/clientes/dnit/autocomplete`, `POST /clientes`, `PATCH /clientes/:id` se consumen tal cual existen hoy.
- `POST /recibos` y `PATCH /recibos/:id` no cambian de contrato — `spec/openapi.yaml` no requiere cambios para este alcance.

---

## Criterios de aceptacion

- Escribir un RUC/CI ya guardado en la agenda del facturador (u otro facturador del mismo tenant) muestra una sugerencia; al seleccionarla se completan documento, nombre, direccion, telefono y correo.
- Escribir un RUC/CI que no esta en la agenda pero si en el padron local de DNIT autocompleta al menos el nombre/razon social al salir del campo o presionar Enter/Tab.
- Escribir un documento que no esta ni en agenda ni en DNIT no genera error visible; el formulario queda editable para carga manual, igual que hoy.
- Se puede guardar un pagador nuevo como cliente de la agenda sin salir del formulario de recibo, y el recibo se puede seguir creando/emitiendo normalmente con esos datos.
- Se puede actualizar los datos de un cliente ya existente en la agenda (direccion/telefono/email) desde el formulario de recibo.
- El recibo creado sigue teniendo exactamente los mismos campos que en v0.1/v0.2 (`pagador_nombre`, `pagador_documento_tipo`, `pagador_documento`) — sin regresiones de contrato ni de PDF.
- `InvoiceEditor` y `NotasView` quedan sin modificar.

---

## Fuera de alcance (esta version)

- Persistir `direccion`/`telefono`/`email`/`cliente_id` en `recibos_dinero` (requeriria migracion — descartado explicitamente por el founder para esta version).
- Extraer un hook o componente compartido de autocompletado de cliente (`useClienteAutocomplete`) que unifique Agenda/Facturas/Notas/Recibos — descartado explicitamente por el founder para esta version; queda como mejora tecnica futura si se decide reducir la duplicacion.
- Vincular recibos existentes a la agenda retroactivamente.
- Mostrar en el recibo o su PDF datos de direccion/telefono/email del pagador (el PDF sigue mostrando solo lo que ya define `docs/SPEC_RECIBO_DINERO_v0.1.md` seccion 7).
