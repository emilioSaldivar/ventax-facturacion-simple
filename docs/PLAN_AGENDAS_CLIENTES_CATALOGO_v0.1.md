# PLAN Agendas Clientes Catalogo v0.1

## 1. Objetivo

Alinear el modelo tecnico con `docs/SPEC_AGENDAS_CLIENTES_CATALOGO_v0.1.md`, manteniendo tres fronteras claras:

- identidad global de clientes del sistema;
- agenda privada por facturador;
- catalogo privado por facturador.

## 2. Modelo De Clientes

### 2.1 Identidad Global

Usar una entidad global equivalente a `cliente_identidades`.

Responsabilidad:

- almacenar identidad fiscal reutilizable por documento;
- servir como fuente de autocompletado cuando un documento no existe en la agenda del facturador;
- consolidar datos nuevos o corregidos que los facturadores carguen manualmente.

Clave recomendada:

- `documento_tipo`;
- `documento_normalizado`;
- restriccion unica para identidades activas.

### 2.2 Agenda Del Facturador

Usar una entidad equivalente a `facturador_clientes`.

Responsabilidad:

- representar la agenda privada del facturador;
- vincularse con una identidad global;
- guardar datos personalizados por facturador;
- aislar busquedas y modificaciones por `facturador_id`.

Indices recomendados:

- `(facturador_id, cliente_identidad_id)` unico para agenda activa;
- `(facturador_id, documento_normalizado)` o indice equivalente por join para busqueda rapida por documento;
- `(facturador_id, razon_social)` para busquedas por nombre cuando el volumen lo justifique.

## 3. Escrituras Y Sincronizacion

Alta manual desde agenda o factura:

1. normalizar documento;
2. crear o actualizar identidad global;
3. crear o actualizar entrada de agenda del facturador;
4. devolver la entrada de agenda, no la identidad global como concepto visible.

Edicion de cliente en agenda:

1. validar pertenencia por `facturador_id`;
2. actualizar solo la entrada de agenda de ese facturador;
3. actualizar la identidad global con datos fiscales normalizados;
4. no propagar cambios a agendas de otros facturadores.

## 4. Lecturas Y Autocompletado

La busqueda debe priorizar:

1. agenda del facturador;
2. base global de identidades;
3. carga manual si no hay resultado.

La respuesta puede incluir una marca tecnica interna de origen si el frontend la necesita para decidir alta/actualizacion, pero la UI no debe mostrar textos como "cliente compartido", "base compartida" o equivalentes al operador o cliente final.

## 5. Catalogo

El catalogo se mantiene en una entidad por facturador equivalente a `catalogo_items`.

Plan tecnico:

- todos los endpoints de catalogo deben requerir contexto autenticado y resolver `facturador_id`;
- toda consulta debe filtrar por `facturador_id`;
- los codigos deben ser unicos solo por facturador;
- no se crea base global de productos/servicios;
- no se sugieren productos entre facturadores.

## 6. Validacion

Validaciones esperadas:

- tests de aislamiento de agenda entre facturadores con el mismo documento;
- tests de fallback desde identidad global cuando el cliente no existe en la agenda;
- tests de alta manual que actualiza identidad global y agenda propia;
- tests de edicion que no modifica agendas ajenas;
- tests de catalogo que impiden listar, buscar, editar o reutilizar items de otro facturador.

## 7. Plan UX Clientes (Sin Cambios Backend)

### 7.1 Objetivo Operativo

Reducir friccion para seleccionar cliente al facturar, minimizando scroll y separando claramente:

- seleccion rapida;
- edicion inmediata;
- creacion bajo demanda.

### 7.2 Diseno De Interaccion

1. Reemplazar listado plano por tarjetas de cliente con acciones:
   - primaria: `Usar cliente`;
   - secundaria: `Editar`.
2. Remover formulario persistente al final.
3. Incorporar accion principal `+ Nuevo cliente` que abre modal/bottom sheet.
4. Implementar busqueda instantanea al escribir, sin boton `Buscar`.
5. Agregar estado vacio con CTA de creacion.

### 7.3 Reuso Tecnico

- Reutilizar hooks/servicios/frontend state ya existentes para:
  - busqueda de clientes;
  - autocompletado por documento;
  - normalizacion de `RUC/CI`;
  - señales de estado de RUC ya disponibles en UI principal cuando correspondan.
- Mantener APIs y payloads actuales sin cambios de contrato.

### 7.4 Criterios De No Regresion

- No romper alta/edicion de agenda existente.
- No romper flujo de `Nueva factura` que consume cliente seleccionado.
- No introducir nuevas reglas fiscales ni mover logica SIFEN al frontend.

### 7.5 Validacion UX/UI

- `npm run typecheck --workspace @facturacion-simple/web-operacion`
- `npm run build --workspace @facturacion-simple/web-operacion`
- Playwright mobile-first sobre contenedores desplegados (`bash scripts/deploy.sh`) cubriendo:
  - buscar cliente mientras escribe;
  - usar cliente desde tarjeta;
  - editar cliente desde tarjeta;
  - crear cliente desde CTA principal;
  - estado vacio con CTA.

## 8. Plan UX Agenda Compacta (Incremental Sin Cambios Backend)

### 8.1 Objetivo

Incrementar densidad operativa de la agenda para que el operador vea mas clientes por pantalla y conserve una accion primaria simple (`Usar`), delegando acciones secundarias a menu contextual.

### 8.2 Decisiones De Interaccion (Sin Ambiguedad)

1. Reemplazar tarjeta alta por fila compacta con:
   - bloque izquierdo: nombre + documento;
   - bloque derecho: boton `Usar` + trigger `⋮`.
2. Menu `⋮` por cliente con orden fijo:
   - `Usar cliente`;
   - `Editar`;
   - `WhatsApp`;
   - separador;
   - `Eliminar cliente` (estilo destructivo).
3. Eliminar boton visible de `WhatsApp` por fila.
4. Eliminar boton visible de `Eliminar` por fila.
5. En formulario de edicion:
   - conservar campos operativos;
   - remover bloque de informacion duplicada;
   - mantener `Guardar`;
   - agregar `Eliminar cliente de mi agenda` al final, con confirmacion.

### 8.3 No Regresion

- No romper seleccion de cliente en `Nueva factura`.
- No romper alta/edicion de cliente existente.
- Mantener payloads actuales de alta/edicion y agregar solo endpoint de baja operativa de agenda (`DELETE /clientes/{clienteId}`).
- No mover ni duplicar logica fiscal fuera de `facturacion-electronica`.

### 8.4 Validacion Por Lote (Cobertura Maxima)

Ejecutar un flujo unico Playwright mobile-first contra contenedores (`bash scripts/deploy.sh`) para validar en una sola corrida:

1. busqueda incremental de cliente;
2. `Usar` desde fila compacta;
3. apertura de `⋮` y ejecucion de `Editar`;
4. verificacion de formulario sin bloque duplicado;
5. `Guardar` cambios;
6. `WhatsApp` desde menu contextual;
7. `Eliminar cliente` desde menu + confirmacion `Cancelar`;
8. `Eliminar cliente` desde menu + confirmacion `Eliminar`.

Luego correr viewport adicional desktop/tablet para validar jerarquia visual y densidad sin solapamientos.

## 9. Plan Navegacion Agenda -> Factura (Prefill Cliente)

### 9.1 Diseno Tecnico

1. En `OperationHome`, introducir estado de solicitud de prefill de cliente para `InvoiceEditor`.
2. En `ClientesAgendaView`, al ejecutar `Usar`:
   - emitir callback con payload de cliente seleccionado;
   - navegar a vista `invoice`.
3. En `InvoiceEditor`, aplicar prefill al recibir solicitud nueva:
   - setear `cliente_id`, `documento_tipo`, `documento`, `razon_social`, `direccion`, `telefono`, `email`;
   - limpiar sugerencias abiertas y dejar mensaje operativo breve de cliente cargado.
4. Marcar la solicitud como consumida para evitar reaplicaciones no intencionales.

### 9.2 No Regresion

- Mantener flujo manual actual de carga/autocompletado de cliente en factura.
- Mantener comportamiento de `Agenda` para editar/WhatsApp/eliminar.
- No alterar API de clientes ni contrato OpenAPI.

### 9.3 Validacion

- `npm run typecheck --workspace @facturacion-simple/web-operacion`
- `npm run build --workspace @facturacion-simple/web-operacion`
- Playwright en contenedores (mobile + desktop) validando:
  1. abrir `Agenda/Clientes`;
  2. tocar `Usar` en un cliente;
  3. confirmar navegacion a `Nueva factura`;
  4. confirmar prefill de cliente en formulario.
