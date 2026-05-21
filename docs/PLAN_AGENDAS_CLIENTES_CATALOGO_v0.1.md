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
