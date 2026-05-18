# AGENTS.md - Reglas globales del proyecto Facturacion Simple Cliente

## Contexto Del Proyecto

**Nombre provisional:** `facturacion-simple-cliente`

Este repositorio inicia una aplicacion web SaaS multi-facturador para facturacion electronica simple en Paraguay. La aplicacion debe consumir el backend fiscal `facturacion-electronica` como API externa para configuracion SIFEN, generacion de XML, firma, QR, envio a SIFEN, consulta de estado y artefactos fiscales.

El repositorio actualmente contiene material de contexto y referencia. La implementacion de producto debe nacer desde los documentos SDD propios ubicados en `docs/`.

## Fuente De Verdad Documental

La fuente de verdad de este proyecto es:

- `docs/METODOLOGIA_SDD.md`
- `docs/SPEC_PRODUCTO_MVP_v0.1.md`
- `docs/PLAN_PRODUCTO_MVP_v0.1.md`
- `docs/PLAN_IMPLEMENTACION_MVP_v0.1.md`
- `docs/TASKS_PRODUCTO_MVP_v0.1.md`
- `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md`
- `spec/openapi.yaml`

Los documentos bajo `contexto_facturacion_electronica/` y `contexto_pos_graciela/` son antecedentes. No son la especificacion final del nuevo producto.

## Metodo De Trabajo Obligatorio

Este repositorio se trabaja con Spec-Driven Development.

Todo cambio funcional, tecnico, visual, operativo o estructural debe seguir esta secuencia:

1. `SPEC`
2. `PLAN`
3. `TASKS`
4. `IMPLEMENT`

No se implementa primero y no se documenta despues.

## Regla Para Agentes

Cualquier agente que trabaje en este repositorio debe:

- leer `AGENTS.md` antes de proponer o modificar codigo;
- identificar el `SPEC`, `PLAN` y `TASKS` aplicables;
- actualizar primero la documentacion si el alcance no esta cubierto;
- implementar solo cuando la cadena `SPEC -> PLAN -> TASKS` sea consistente;
- preservar cambios existentes del usuario;
- no copiar logica fiscal SIFEN al frontend ni al backend SaaS si debe vivir en `facturacion-electronica`;
- no exponer certificados, CSC, passwords ni secretos fiscales en UI, logs o respuestas no autorizadas.

## Limite De Dominio

Este proyecto es responsable de:

- plataforma SaaS, tenants, planes y suscripciones;
- usuarios, roles y permisos del cliente;
- facturadores operativos vinculados a `emisor_id` fiscal;
- clientes comerciales del facturador;
- catalogo simple de items, productos o servicios;
- pantalla de emision simple tipo factura manual;
- borradores y facturas operativas propias;
- integracion server-to-server con `facturacion-electronica`;
- traduccion de estados fiscales a estados simples para operadores;
- entrega de XML/KUDE/PDF/enlaces segun la decision documentada.

`facturacion-electronica` es responsable de:

- estructura SIFEN;
- XML, firma, QR y CSC;
- certificado PKCS#12;
- envio y consulta SIFEN;
- numeracion fiscal final;
- artefactos fiscales generados por el backend fiscal.

## Reglas Arquitectonicas Iniciales

- `tenant_id` es obligatorio en todo dato operativo.
- `facturador_id` es obligatorio en todo dato de emision.
- El frontend no decide ni incrementa numeracion fiscal.
- El backend SaaS valida tenant, suscripcion, permisos y facturador antes de llamar al backend fiscal.
- El backend fiscal devuelve `document_id`, `cdc`, numero fiscal y estados; el SaaS los persiste como referencia.
- Cada factura operativa debe guardar snapshot de cliente, items, totales, usuario emisor y respuesta fiscal resumida.
- La primera version excluye caja, inventario, compras, proveedores, balanza, cuentas corrientes y POS local complejo.

## Convencion De Documentos

Para cada iniciativa se deben crear o actualizar:

- `docs/SPEC_<tema>_vX.Y.md`
- `docs/PLAN_<tema>_vX.Y.md`
- `docs/TASKS_<tema>_vX.Y.md`

Si cambia un contrato HTTP propio del SaaS, se debe actualizar tambien la especificacion OpenAPI cuando exista.

## Regla De Cierre

Un cambio se considera cerrado solo cuando:

- el `SPEC` refleja el alcance final;
- el `PLAN` refleja el diseno realmente adoptado;
- `TASKS` refleja el estado real de la matriz;
- la implementacion y pruebas estan alineadas con esos documentos;
- las integraciones con `facturacion-electronica` respetan el limite de responsabilidad fiscal.
