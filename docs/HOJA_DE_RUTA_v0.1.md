# Hoja de ruta de Facturacion Simple (Segel) v0.1

**Fecha:** 2026-11-11 · **Rama:** `feat/identidad-segel` · **Produccion:** `segel-fs` (FS `ed8b493`, FE `segel-rc4.32`, paquete de consumidores v0.49)

## Para que sirve

Hasta hoy los pendientes estaban repartidos en tres lugares sin un orden comun:

- `docs/BACKLOG.md`: la tabla de iniciativas de julio a noviembre, los hallazgos FS-01 a FS-65 y el mapa de UX (R-1 a R-10, P-1 a P-4).
- Las cadenas SDD con tareas abiertas (20 archivos `TASKS_*` con al menos una tarea sin cerrar).
- Los pedidos del usuario del 2026-11-11.

Este documento los ordena por la **prioridad que fijo el usuario el 2026-11-11**. No reemplaza al BACKLOG: el detalle de cada punto sigue en su fila FS-xx o en su cadena. Cada punto se implementa con su propia cadena `SPEC -> PLAN -> TASKS`, como manda `AGENTS.md`.

"FE publica" se refiere a la guia de consumidores del paquete v0.49 (`segel-rc4.32`, el que corre en `segel-fs`).

## Resumen

| # | Prioridad | Tema | Ya existe en FS | FE lo publica | Bloqueos o decisiones |
|---|---|---|---|---|---|
| 1 | **Critico, comprometido para el 2026-11-12** | Catalogo en moneda extranjera (USD primero) | Catalogo solo en guaranies | No hace falta FE | Preguntas (a) a (d) de FS-59 |
| 2 | **Critico, 2026-11-12** | Descuentos en la factura | Solo se muestran en facturas de carga | Si, §43 y §50 | Decisiones D-1 a D-5 de abajo |
| 3 | **Critico, 2026-11-12** | Documentos nuevos; primero la **nota de remision** (urgente) | Remision solo por planilla | Si, §53 a §55 (remision), §59 (debito), §63 (autofactura) | Permiso `NRE_EMIT` en la clave de cada facturador; decisiones R-1 a R-6 |
| 3b | **Critico** (decision del usuario, 2026-11-11) | ATO-009: desplegar los textos del operador en `segel-fs` | Hecho y probado en local (17/17) | No aplica | Solo la orden directa de despliegue |
| 3c | **Critico** (decision del usuario, 2026-11-11) | FS-62 ampliado: validar RUC con DV, correo, telefono y direccion en **todos los documentos que llevan RUC** (clientes, factura, NC, remision, recibo) | Zod minimo: RUC de 2 caracteres, correo con `.email()`, telefono y direccion sin formato | FE valida el DV del transportista (v0.49) y el formato del correo; el resto se confirma con FE | Reglas exactas de FE (pedidas a FE el 2026-11-11) |
| 4 | Menos critico | Recibos asociados a facturas a credito | Un recibo por factura desde la ficha | Si, §16.4.1 (una factura por recibo) | Saldo y cobros parciales |
| 5 | Menos critico | Documentos asociados entre si | Solo "Corrige a" / "Corregida por" | Las referencias fiscales ya viajan | Que se muestra y donde |
| 6 | Menos critico | Backoffice: mejoras y automatizacion | Backoffice basico | Parcial | Varias cadenas sin PLAN |
| 7 | Bajo | Pantallas, contraseñas, recupero, seguridad, correos de alta | Cambio de contraseña con sesion | No hace falta FE | Ordenar dentro del grupo |

## 1. Catalogo en moneda extranjera (FS-59)

**Hoy:** `catalogo_items.precio_unitario` es entero en guaranies, sin moneda. En una factura en USD el articulo completa descripcion e IVA pero no el precio, y "Guardar en el catalogo" no esta disponible.

**Que se hace:** columna `moneda` (por omision `PYG`; `USD` en esta etapa) con precio de hasta 2 decimales en USD; API y `spec/openapi.yaml`; selector de moneda en el catalogo; el editor completa el precio de los articulos de la moneda de la factura y guarda en esa moneda. FE no cambia.

**Decisiones del usuario antes de la SPEC** (FS-59), con la propuesta para avanzar:

| Id | Pregunta | Propuesta |
|---|---|---|
| (a) | ¿Un articulo tiene una sola moneda o precio en las dos? | Una sola moneda por articulo. Si vende lo mismo en las dos monedas, son dos articulos. Es lo mas simple y no exige convertir |
| (b) | En una factura en USD, ¿se ofrecen los articulos en Gs.? | Si, sin precio, como hoy, debajo de los de USD |
| (c) | En una factura en Gs., ¿se ofrece un articulo en USD? | Si, sin precio. No convertir: la cotizacion es del dia y la decide el operador |
| (d) | ¿Se puede cambiar la moneda de un articulo ya usado? | Si: las facturas guardan su copia y no cambian |

**Tamaño estimado:** chico a mediano (migracion, API, catalogo y editor). Cadena `SPEC/PLAN/TASKS_CATALOGO_MONEDA_v0.1`. Prueba con mock y una factura USD en SIFEN test, con aviso a FE.

## 2. Descuentos en la factura (nuevo, FS-66)

**FE publica (§43 y §50):**

- `items[].descuento`: descuento **por unidad**, menor que el precio.
- `descuentoGlobal`: monto sobre toda la factura. FE lo reparte como un porcentaje unico sobre cada precio (Nota Tecnica 1).
- `total = Σ cantidad × (precio − descuento) − descuentoGlobal`. FE calcula los porcentajes y totales de SIFEN. Rechaza antes de numerar si un precio neto queda en cero o negativo.
- Moneda: §50 dice que en moneda extranjera los descuentos van con 2 decimales. §43.4 todavia dice "por ahora solo guaranies". **A confirmar con FE** antes de prometer descuentos en USD.

**Hoy en FS:** la factura manual no tiene descuentos (`SPEC_EDITOR_FACTURA_PC_v0.1` D-2 los dejo para despues). Solo las facturas de carga los muestran, con los totales de FE (`SPEC_TOTALES_FE_EN_CARGA_v0.1`). Una factura de carga con descuento solo admite nota de credito total (RN-07).

**Decisiones del usuario:**

| Id | Pregunta | Propuesta |
|---|---|---|
| D-1 | ¿Por linea, global o los dos? | Los dos, como FE |
| D-2 | ¿El operador escribe monto o porcentaje? | Porcentaje o monto en la linea; FS lo pasa a monto por unidad. Global en monto |
| D-3 | ¿En el modo simple o solo en el completo? | En los dos, como columna o campo plegable |
| D-4 | Nota de credito parcial de una factura con descuento | v0.1: solo nota total, como las de carga. La parcial con descuento va despues |
| D-5 | ¿Descuento en presupuestos y pedidos? | Despues; primero la factura |

**Ademas:** guardar los totales que devuelve FE (`GET /v1/documentos/{uuid}/totales`, §60.3) para que la ficha y el resultado muestren el total oficial; vista previa con el mismo calculo que FE; KUDE ya lo resuelve FE.

**Tamaño estimado:** mediano (editor, vista previa, API, snapshot, totales). Cadena `SPEC/PLAN/TASKS_DESCUENTOS_FACTURA_v0.1`.

## 3. Documentos nuevos

### 3.1 Nota de remision manual (FS-56), urgente

**FE publica (§53 a §55):** `POST /v1/nota-remision`, con el permiso `NRE_EMIT`, que **no se otorga por defecto**. Sin precios, IVA ni totales. Lleva:

- receptor con domicilio completo, no innominado;
- datos de la remision: motivo, responsable, kilometros, fecha futura de factura;
- transporte: tipo, modalidad, fechas, local de salida, una entrega, un vehiculo y el transportista, que siempre es obligatorio;
- articulos con rastreo opcional;
- facturas asociadas, opcionales.

Despues de emitir: cancelar hasta 168 h, inutilizar, KUDE de remision y el evento de cambio de transporte (§54). Una factura puede asociar notas de remision (`notasRemision[]`).

**Hoy en FS:** la remision solo entra por planilla (`SPEC_DOCUMENTOS_ESCRITORIO_v0.1` B1). El tipo `NOTA_REMISION` ya existe en la base, y el menu tiene su espacio con "Emitidas" y "Por planilla" (`SPEC_UX_RESTO_APP_v0.1` §B.3).

**Prerrequisito externo:** pedir a FE el permiso `NRE_EMIT` para la clave de cada facturador que la use, en SIFEN test y en `segel-fs`. Sin el permiso, FE responde 403 y no hay nada que probar.

**Decisiones del usuario:**

| Id | Pregunta | Propuesta |
|---|---|---|
| R-1 | ¿Que motivos se ofrecen? | Venta (1) y traslado entre locales propios (7) primero; el resto despues |
| R-2 | ¿Se guardan los datos de transporte para reusarlos? | Si: vehiculo, transportista y local de salida por facturador, para no cargarlos cada vez |
| R-3 | ¿El destinatario sale de la agenda? | Si, pidiendo el domicilio que falte (departamento, ciudad, numero de casa) |
| R-4 | ¿Asociar facturas en el alta? | Si, opcional, eligiendo una factura aprobada del mismo cliente |
| R-5 | ¿Cambio de transporte despues de emitir (§54)? | Segunda etapa |
| R-6 | ¿Desde la factura, "Asociar nota de remision"? | Segunda etapa, con el punto 5 |

**A verificar en el PLAN:** si FS tiene los catalogos de departamento, distrito y ciudad que pide FE, o si hay que traerlos del catalogo de FE.

**Tamaño estimado:** el mayor de los tres criticos. Pantalla nueva, gateway, tipo en la API, ficha, KUDE y cancelacion. Cadena `SPEC/PLAN/TASKS_NOTA_REMISION_v0.1`. Prueba en SIFEN test con aviso a FE.

### 3.2 Los demas documentos

| Documento | ID | FE | Estado en FS |
|---|---|---|---|
| Nota de debito | FS-55 | Publicada (§59), permiso `NDE_EMIT`, solo guaranies | Espacio "Proximamente" en el menu; sin cadena |
| Autofactura | FS-57 | **Ya publicada** en el paquete v0.49 (§63), permiso `AFE_EMIT`, solo contado y guaranies | El BACKLOG todavia dice "espera la publicacion de FE": hay que actualizar la fila |

Orden propuesto: remision, nota de debito, autofactura.

## 4. Recibos asociados a facturas a credito (nuevo, FS-67)

**Hoy:** desde la ficha de una factura a credito, "Emitir recibo de cobro" crea un recibo con `referencia_documento_uuid` (FE §16.4.1). FE acepta **una factura por recibo**.

**Falta:**

- el saldo de la factura;
- varios recibos parciales sobre la misma factura;
- el estado de cobro (pendiente, parcial, cobrada) en el listado y en la ficha;
- ver los recibos de una factura y la factura de un recibo;
- un filtro de facturas a credito pendientes.

Un recibo que cobre varias facturas necesita un cambio en FE.

**Relacion:** la fila de julio "Saldo por documento en el listado" y la iniciativa de suscripciones y cobros (`INICIATIVA_SUSCRIPCIONES_COBROS_v0.1`, que es sobre el cobro del SaaS, no del facturador).

## 5. Documentos asociados entre si (nuevo, FS-68)

**Hoy:** la ficha muestra "Corrige a" y "Corregida por" entre una factura rechazada y su correccion (`documento_relacionado_id`, `FS-51`). La nota de credito ya referencia su factura ante SIFEN, pero la ficha de la factura no lista sus notas de credito.

**Propuesta:** una seccion "Documentos asociados" en la ficha, en las dos direcciones:

- factura y sus notas de credito o debito;
- factura y sus recibos (punto 4);
- factura y sus notas de remision (punto 3);
- correccion y factura corregida.

Cada documento asociado abre su ficha. Se apoya en el punto 3 (remision con facturas) y en el 4 (recibos).

## 6. Backoffice: mejoras y automatizacion

| Punto | Estado |
|---|---|
| `SPEC_BACKOFFICE_ALINEACION_FE_v0.2` (permisos de la clave de FE por facturador, verificacion fiscal automatica) | SPEC refinada; falta PLAN y TASKS |
| `TASKS_SCRIPTS_BACKOFFICE_ABM_v0.1` | 12 tareas abiertas |
| FS-18: aceptacion de T&C en el backoffice | Sin cadena |
| FS-25: las 6 acciones de "Administracion fiscal" no autentican contra FE | Decidir si se retiran o se arreglan |
| FS-63: descartar una factura que nunca llego a FE | Sin cadena |
| FS-64: identidad `RUC XXX` en `segel-fs` | Espera la confirmacion del usuario |
| FS-65: correo de acceso a usuarios (pedido de FE) | Registrado; pendiente de commit en el BACKLOG por otra sesion |
| Permisos de documentos (`NRE_EMIT`, `NDE_EMIT`, `AFE_EMIT`) visibles por facturador | Entra con el punto 3 y la alineacion v0.2 |

## 7. Bajo: pantallas, contraseñas y seguridad

| Punto | Estado |
|---|---|
| Fase 2 y 3 de `SPEC_UX_RESTO_APP_v0.1`: URA-010 (presupuestos y recibos), URA-011, URA-013 y URA-014 | En curso; **se pausa** por esta prioridad |
| FS-52 (P-1 a P-4) y FS-58 (rutas por URL) | Sin cadena |
| Recuperar contraseña (olvido) y autogestion de usuarios (nuevo, FS-69) | Hoy solo hay cambio de contraseña con sesion iniciada; el recupero no existe |
| Seguridad: sesiones, bloqueo por intentos, rotacion de claves | Sin relevar. Antecedentes: la clave compartida de FE quedo en logs de staging (memoria del proyecto) |
| Correos automaticos de alta (onboarding) | Junto con FS-65 |

## Fuera de las 7, ya en marcha o con riesgo en produccion

Para que el usuario decida si entran antes, junto o despues de los criticos:

| Punto | Por que importa | Propuesta |
|---|---|---|
| ATO-009: textos del operador sin desplegar ("Proximo numero 0000002") | RAJ lo ve hoy | Desplegar con orden directa del usuario; solo frontend, menos de un minuto de corte |
| FS-62: validar RUC con DV | FE rechaza despues de numerar (caso RAJ 0000745) | Hacerlo con el punto 3: la remision exige RUC con DV en el receptor y el transportista |
| FS-61: numero fiscal vacio tras adoptar un borrador | Dato incompleto en produccion | Chico; despues de los criticos |
| FS-60: RUC no activo pasa a CI sin avisar | Se relaciona con FS-62 | Con FS-62 |
| `SPEC_ESTADO_FISCAL_CANONICO_v0.1`, carga masiva G3 contra FE real, `TASKS_CONTRATO_CANONICO_FISCAL_v0.1`, `TASKS_VERIFICACION_CAPACIDAD_200_v0.1` | Cadenas abiertas con decisiones o pruebas pendientes | Revisar una por una; varias pueden cerrarse como superadas |
| Tutoriales en video | Los lleva otra sesion | Sin cambio |

## Decisiones del usuario (2026-11-11)

- Acepta las propuestas (a) a (d) del catalogo, D-1 a D-5 de descuentos y R-1 a R-6 de la remision.
- **FE define las reglas.** Como se aplican los descuentos, las validaciones y los valores predefinidos que espera SIFEN los dice FE; FS los reproduce antes de numerar y redacta las SPEC en coordinacion con FE. No se inventan reglas en FS.
- **Validar antes de emitir, en todo documento.** FS-62 se amplia: RUC con DV en todo documento que lleve RUC; correo sin espacios ni caracteres invalidos; telefono y direccion con el formato que FE acepte. Toda iniciativa de documento nuevo nace con sus validaciones.
- **Direcciones codificadas.** Para la remision, consultar con FE la codificacion de domicilio del MT150 (`GET /v1/parametrizaciones/geografia`: departamento, distrito, ciudad) y usarla en FS.
- ATO-009 y FS-62 pasan a criticos.
- Autoriza validar en SIFEN test y escribir las SPEC/PLAN/TASKS ahora.

## Cadenas escritas el 2026-11-11

| Cadena | Documentos | Migracion | Tareas | Estimacion | Decisiones pendientes del usuario |
|---|---|---|---|---|---|
| Validaciones del receptor (FS-62 ampliado, FS-60) | `SPEC/PLAN/TASKS_VALIDACIONES_RECEPTOR_v0.1` | ninguna | VAL-001 a VAL-012 | 1 jornada | D-2 (si FS exige el DV o lo calcula cuando el padron no tiene el RUC), D-3 (telefonos con texto) |
| Catalogo en moneda extranjera (FS-59) | `SPEC/PLAN/TASKS_CATALOGO_MONEDA_v0.1` | `0046` | CAM-001 a CAM-014 | 7 a 9 h | DP-1 (orden de los articulos de otra moneda en la busqueda), DP-2 (filtro que recuerda la moneda) |
| Descuentos en la factura (FS-66) | `SPEC/PLAN/TASKS_DESCUENTOS_FACTURA_v0.1` | `0047` | DES-001 a DES-012 | 16 a 18 h | DP-2 (conmutador % / monto por grilla), DP-3 (global solo en monto). Riesgo: PYG con global que no divide exacto, sin verificar en SIFEN |
| Nota de remision manual (FS-56) | `SPEC/PLAN/TASKS_NOTA_REMISION_v0.1` | `0048` | NRE-001 a NRE-029 en tres entregas E1/E2/E3 | E1 10 a 12 h, E2 5 a 6 h, E3 2 a 3 h | DP-4 (mas motivos ahora o despues), DP-5 (transportista precargado con el facturador en transporte propio), DP-6 (facturadores de `segel-fs` para `NRE_EMIT`), DP-7 (bloque Domicilio en la agenda para todos) |

Total: unas 5 a 6 jornadas de implementacion. Para el 2026-11-12 es realista: validaciones del receptor, catalogo en USD y la entrega E1 de la remision; los descuentos van al dia siguiente. FE ya habilito `NRE_EMIT` en el FE local de prueba y confirmo las reglas de descuentos, geografia y receptor (registradas en cada SPEC).

## Orden de trabajo propuesto para el compromiso del 2026-11-12

1. **Hoy:** pedir a FE el permiso `NRE_EMIT` para las claves de prueba y de los facturadores que lo usen; confirmar con FE los descuentos en USD.
2. **Hoy:** respuestas del usuario a FS-59 (a)-(d), D-1 a D-5 y R-1 a R-6; con eso, SPEC, PLAN y TASKS de las tres cadenas.
3. Implementacion en paralelo donde no se pisan archivos: la remision es una pantalla nueva (`views/`); el catalogo y los descuentos tocan el editor de factura, asi que van en serie.
4. Validacion de cada cadena: pruebas de API, typecheck, build, Playwright en 1440, 1280 y 390 contra el stack local, y una emision por tipo en SIFEN test con aviso a FE.
5. Despliegue en `segel-fs` solo con orden directa del usuario.

**Riesgo:** las tres cadenas completas en un dia es un plazo justo, sobre todo la remision. Si no alcanza, la propuesta es entregar primero la remision (urgente) y el catalogo en USD (el mas chico), y los descuentos al dia siguiente.
