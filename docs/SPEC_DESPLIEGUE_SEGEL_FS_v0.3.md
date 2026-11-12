# SPEC - Despliegue en `segel-fs` de la version con validaciones, catalogo en USD, descuentos y nota de remision v0.3

Estado: **decisiones tomadas el 2026-11-12**; falta la prueba fina de descuentos (DES-013 a DES-016), la regresion final y la orden directa del usuario. Reemplaza, para esta version, la seccion E-6 de `TASKS_DESPLIEGUE_SEGEL_FS_v0.2` como procedimiento de referencia.

## Alineacion

- `AGENTS.md` (regla de cierre; despliegue con `bash scripts/deploy.sh` o el procedimiento de `OPERACION_DESPLIEGUE_SEGEL_FS_v0.1`; respaldo previo obligatorio, D-28 de v0.2).
- `docs/TASKS_DESPLIEGUE_SEGEL_FS_v0.2.md`, E-6: el ultimo despliegue de FS (`segel-fs-2026.11.11`, `b252627`), cuyo procedimiento se repite.
- Cadenas que entran: `SPEC_VALIDACIONES_RECEPTOR_v0.1`, `SPEC_CATALOGO_MONEDA_v0.1`, `SPEC_DESCUENTOS_FACTURA_v0.1`, `SPEC_NOTA_REMISION_v0.1` (entrega E1), `SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1` (ATO-009), `SPEC_UX_RESTO_APP_v0.1` (URA-009).
- `docs/BACKLOG.md`: tablero por prioridad.

## Objetivo

Llevar a produccion (`segel-fs`, VPS propia de Segel) la version de FS que hoy esta en `feat/identidad-segel`, probada en el stack local del ensayo y con SALUMAX en SIFEN test, sin tocar FE y sin cambiar lo que los operadores ya usan salvo lo que esta SPEC declara.

## Que corre hoy en produccion

- FS `ed8b493`: el tag `segel-fs-2026.11.11` (`b252627`) mas el hotfix del comprador sin nombre. Ese hotfix esta en la rama como `de57c38` con el mismo contenido (la unica diferencia es una linea de importaciones que URA-009 ya habia ampliado): la version nueva **lo incluye**.
- FE `segel-rc4.32`, 45 migraciones de FS aplicadas, 311 facturas, 1 articulo de catalogo, 4 facturadores (5057016-1, RAJ, SALUMAX y 80093554-3), 20 usuarios (medido el 2026-11-11 en solo lectura).
- Ningun facturador emite notas de remision manuales: FE les dio el permiso `NRE_EMIT`, pero FS no tiene re-importados sus exports, y solo SALUMAX tiene numeradores tipo 7 (en 001 y 002).

## Que entra

Todo lo que hay entre `ed8b493` y el commit que se etiquete (63 commits al 2026-11-11; 64 archivos en `apps`, `packages`, `db` y `spec`). Por cadena:

| Cadena | Que cambia para el operador | Migraciones | Evidencia |
|---|---|---|---|
| Validaciones del receptor (FS-62, FS-60) | La agenda, la factura y el recibo no aceptan RUC sin digito verificador o con uno incorrecto, correos con espacios, telefonos fuera de 6 a 15 digitos ni nombres de menos de 4 letras; el mensaje dice que corregir. El padron ya no cambia un RUC a CI por su cuenta. Los clientes ya cargados no cambian: en `segel-fs` ninguno queda marcado "Revisar datos" (VAL-009) | ninguna | `TASKS_VALIDACIONES_RECEPTOR_v0.1` |
| Catalogo en moneda extranjera (FS-59) | Cada articulo tiene moneda (Gs. o USD); en una factura en USD, un articulo en USD completa su precio y "Guardar en el catalogo" funciona | `0046` (`moneda`, `precio_unitario` pasa a `numeric(18,2)`) | `TASKS_CATALOGO_MONEDA_v0.1` |
| Descuentos (FS-66) | Columna "Descuento" por linea (porcentaje o monto) y "Descuento sobre el total"; fila "Descuento" en totales, resultado y ficha. Una factura con descuento solo admite nota de credito total | `0047` (`descuento` y `descuento_global` por linea, default 0) | `TASKS_DESCUENTOS_FACTURA_v0.1` |
| Nota de remision manual, E1 (FS-56) | La pestaña "Nueva nota de remision" se **habilita para SALUMAX** (D-3, RN-03) y queda en gris, **"No habilitado"**, para los otros tres facturadores hasta que FE les configure permiso y numerador. Las notas de remision de carga masiva pasan a ofrecer "Anular" en la ficha | `0048` (permisos y tipos del consumidor, domicilio del cliente, tablas reutilizables vacias), `0049` (tipos de documento del emisor) | `TASKS_NOTA_REMISION_v0.1` |
| Textos del operador (ATO-009) | "Proximo numero 0000002" desaparece; ayuda del tipo de cambio; error visible al emitir un recibo desde la ficha; "Pedidos"; plantilla y "Ver nota de remision" correctos en remisiones; resultado "Nota de credito" tras una NC | ninguna | `TASKS_AJUSTES_TEXTOS_OPERADOR_v0.1` |
| Catalogo y Agenda en tabla (URA-009, FS-53) | En escritorio, tabla a lo ancho con el alta en un panel lateral; en celular, tarjetas | ninguna | `TASKS_UX_RESTO_APP_v0.1` |
| Falta de numerador en FE (RN-01b, FE v0.50) | Si FE rechaza una emision por numerador faltante, bloqueado o agotado (500 actual o 409 de FE v0.50), el documento queda en error a corregir con el motivo en la ficha, sin reintentos. Hoy no afecta a ninguna factura de produccion | ninguna | `TASKS_NOTA_REMISION_v0.1` NRE-030 |
| Herramientas de los tutoriales (TUT-001 a TUT-010) | Nada visible: guiones y scripts fuera de la app (se confirma en DSF-002) | ninguna | `TASKS_TUTORIALES_VIDEO_v0.1` |

Sin cambios de `docker-compose`, variables de entorno, plantillas ni imagenes de FE (`git diff ed8b493..HEAD -- infra` vacio). El loader DNIT no se toca.

## Que no entra todavia (para D-1)

- Nota de remision **E2**: transportistas, vehiculos y locales guardados para reutilizar, domicilio del cliente en la agenda, remision asociada a una factura ("Nota de remision para esta venta" sigue "Proximamente" en la ficha). El formulario de E1 ya usa departamento, distrito y ciudad con los codigos SIFEN que publica FE (`GET /geografia`, MT150); la revision de su diseño con `/design` queda como tarea de E2.
- Nota de debito y autofactura (FS-55, FS-57): "Proximamente", sin cadena.
- Permisos por usuario y por tipo de documento (FS-70), frecuencia de verificacion (FS-71), numeradores por punto en el export de FE (FS-72).
- Recibos asociados a facturas a credito (FS-67), documentos asociados entre si (FS-68), backoffice, contraseñas y recupero (FS-69).
- Remision para 5057016-1, RAJ y 80093554-3: en gris hasta que FE les configure permiso y numerador y el usuario pida habilitarlos (mismo SQL que SALUMAX o re-importacion, a su eleccion).

## Decisiones del usuario (tomadas el 2026-11-12)

| ID | Decision | Resolucion |
|---|---|---|
| D-1 | **Cuando.** Fecha y franja horaria del despliegue | El usuario quiere hacerlo **el 2026-11-12 fuera del horario transaccional**, despues de entender que entra y que no (tabla "Que entra" y "Que no entra todavia"). El corte es menor a un minuto (solo se recrean `migrate`, `api` y `frontend`) |
| D-2 | **Que commit.** El HEAD de `feat/identidad-segel` al momento de la orden, etiquetado `segel-fs-2026.11.12` | **Si.** Verificado el 2026-11-12 que ninguna otra rama tiene trabajo que falte aqui: la unica rama sin fusionar es `hotfix/comprador-innominado` y sus dos commits (`ed8b493`, `812a200`) ya estan en esta rama con el mismo contenido (`de57c38` e INN-010). Sin stashes |
| D-3 | **Remision en produccion.** SALUMAX la necesita; el resto no esta configurado en FE | **Se habilita para SALUMAX** cargando por SQL `fe_consumer_permisos = ["NRE_EMIT"]` y `fe_tipos_documento = ["NRE"]` en su facturador (opcion B, equivalente a importar el export; `TASKS_NOTA_REMISION` evidencia E1). **No se re-exporta ni re-importa**: el usuario no quiere arriesgar la clave del consumidor hasta tener algo mas limpio desde el backoffice. Los valores se confirman con la sesion de FE (o su backoffice) antes del SQL. Para los otros tres facturadores la pestaña queda en gris "No habilitado" (RN-02b de la remision), no "Proximamente": la funcion existe, falta configuracion |
| D-4 | **SALUMAX, punto 003 (Licitaciones).** No tiene numerador tipo 7 en FE y no lo tendra: Licitaciones no emite remisiones | **Se deja asi.** Si alguien del 003 intenta una remision, FE la rechaza antes de numerar (sin hueco) y FS la deja en error a corregir con "Este punto de expedicion todavia no tiene numeracion para notas de remision. Pedila a Segel." Logistica (001/002) y TICS (001) emiten con normalidad |
| D-5 | **Descuentos: prueba fina antes del despliegue.** | **Antes.** Se agregan DES-013 a DES-016 en `TASKS_DESCUENTOS_FACTURA_v0.1` (USD en SIFEN test, matriz PYG con IVA mixto y exentas, nota de credito total sobre factura con descuento en SIFEN test, descuento visible en el KUDE) y se ejecutan desde el stack local con aviso a FE. El despliegue espera a que esten en verde |
| D-6 | **Comunicacion a los operadores.** | **No hace falta**: no es un cambio operativo, es visual y el formulario es intuitivo |
| D-7 | **Quien ejecuta y cuando se toca produccion.** | La sesion de FS, por SSH, igual que E-6, **solo con autorizacion explicita del usuario para cada accion, incluidas las consultas de solo lectura**. Quedo como regla de oro en `AGENTS.md` ("Regla De Oro: Produccion Solo Con Autorizacion Explicita") |
| D-8 | **Prueba en produccion.** Venia de E-6: el ingreso del operador no se probo porque la sesion de FS no tiene credenciales de produccion, y se habia propuesto una factura real minima como alternativa | **Retirada.** Solo verificacion sin emitir (CA-03 a CA-07); la revision de pantallas (CA-08) la hace el usuario con su propio acceso cuando quiera |

## Reglas

- **RN-01. Respaldo primero.** `pg_dump -Fc` de la base de FS sin el padron DNIT, en la VPS, con la lista de imagenes y SHA256; restauracion comprobada en un Postgres descartable antes de tocar nada (D-28 de v0.2). No se copia a la estacion.
- **RN-02. Imagenes del commit etiquetado.** API/migrate y frontend se construyen en la estacion con `BUILD_COMMIT_SHA` igual al commit del tag, desde `git archive` (sin archivos sin versionar), y se transfieren por SSH. Las imagenes actuales quedan etiquetadas `:antes-2026.11.12` para volver atras.
- **RN-03. Remision solo para SALUMAX, por SQL.** No se ejecuta ninguna importacion de export de FE. Tras las migraciones, dentro del mismo despliegue, se cargan en el facturador `80018828-4` las dos columnas (`fe_consumer_permisos = '["NRE_EMIT"]'`, `fe_tipos_documento = '["NRE"]'`) despues de confirmar con la sesion de FE que en produccion su consumidor tiene `NRE_EMIT` y numeradores tipo 7 en 001 y 002. `nota_remision_habilitada` queda `true` para SALUMAX y `false` para los otros tres, que ven la pestaña en gris "No habilitado" (CA-06). El SQL queda anotado en E-1 y se revierte poniendo `'[]'` en ambas columnas.
- **RN-04. Migraciones aditivas.** `0046` a `0049` agregan columnas, tablas e indices y cambian `catalogo_items.precio_unitario` de `integer` a `numeric(18,2)`. Ninguna borra ni reescribe datos. El unico articulo de produccion queda en `PYG` con el mismo precio.
- **RN-05. Nada de FE.** No se cambian imagenes, variables ni configuracion de FE. FE v0.50 (409 `NUMERADOR_*`) no es requisito: FS reconoce el formato actual y el nuevo.
- **RN-06. Verificacion sin emitir.** Despues del arranque se comprueban version, migraciones, conteos, salud y contexto (CA-03 a CA-08) sin crear documentos. Una emision real solo si el usuario la pide (D-8).
- **RN-07. Vuelta atras.** Volver a etiquetar `:antes-2026.11.12` como `:latest`, restaurar el respaldo y recrear `migrate`, `api` y `frontend`. Las migraciones no tienen reversa automatica; `precio_unitario` vuelve a `integer` solo si no hay articulos con decimales (en produccion no los habra si se vuelve atras el mismo dia).
- **RN-08. Evidencia.** Todo queda en `TASKS_DESPLIEGUE_SEGEL_FS_v0.3`: horas, tamano del respaldo, comandos ejecutados (sin secretos), salidas de verificacion y, si hubo, la vuelta atras.

## Impacto sobre lo que ya corre

- **Facturas y notas existentes:** no cambian. Las lineas guardadas reciben `descuento 0` por default; la ficha no muestra la fila "Descuento" cuando es 0.
- **Clientes de la agenda:** ninguno queda marcado (VAL-009). Al editarlos, se exige el formato nuevo.
- **Catalogo:** el articulo existente queda en Gs.; la pantalla suma el selector de moneda.
- **Carga masiva, recibos, notas de credito, multiperfil:** sin cambios de comportamiento; las notas de remision de carga suman "Anular" (RN-26 de la remision; antes la ficha no lo ofrecia para ese tipo).
- **Rendimiento:** sin cambios de consultas en listados; `GET /clientes` calcula `observaciones` por fila en memoria (4 clientes hoy).

## Bloqueos y pendientes

- DES-013 a DES-016 en verde (D-5) y la regresion final (DSF-005).
- No bloquean: NRE-014 (formulario precargado desde "Corregir y emitir de nuevo"), VAL-013 (errores por campo en Recibos), la entrega E2 de la remision y FS-72 (numeradores por punto en el export de FE).

## Fuera de alcance

- Desplegar FE o cambiar su configuracion.
- Re-importar facturadores o cargar numeradores tipo 7 (va con la decision del usuario, FS-56 y FS-72).
- Habilitar el envio sincronico (RN-24b de la remision: siempre por lote).
- Permisos por usuario por tipo de documento (FS-70).

## Criterios de aceptacion

- **CA-01.** Tag `segel-fs-2026.11.12` creado sobre el commit confirmado en D-2; imagenes construidas con ese `BUILD_COMMIT_SHA`; `git diff ed8b493..<tag> -- infra` vacio.
- **CA-02.** Respaldo en la VPS con tamano y SHA256 registrados; restauracion comprobada (conteo de facturas y ultima migracion iguales a produccion) en un contenedor descartable que se elimina.
- **CA-03.** `migrate` aplica `0046`, `0047`, `0048` y `0049` sin error (49 migraciones).
- **CA-04.** `X-App-Version` del frontend y de la API igual al commit del tag; `/app/` responde 200; `api` y `frontend` `healthy`; salud de FE por la red interna OK.
- **CA-05.** Conteos iguales a los previos: facturas, articulos (todos con `moneda = 'PYG'`), facturadores, usuarios; `factura_items_snapshot` con `descuento = 0` en todas las lineas.
- **CA-06.** `GET /me/context` responde `nota_remision_habilitada = true` para los usuarios de SALUMAX y `false` para los otros tres facturadores (`fe_tipos_documento` vacio), cuya pestaña dice "No habilitado" en gris.
- **CA-07.** 0 errores en el log de la API en los primeros 10 minutos; el worker de verificacion sigue corriendo (siguiente verificacion programada visible).
- **CA-08.** El usuario, con su acceso: Nueva factura sin "Proximo numero", columna "Descuento" visible, catalogo con selector de moneda, agenda en tabla, "Nueva nota de remision" habilitada para Logistica/TICS de SALUMAX; sin emitir.
- **CA-09.** Imagenes `:antes-2026.11.12` presentes y procedimiento de vuelta atras anotado antes de dar por cerrado.
- **CA-10.** `docs/BACKLOG.md` con las filas FS-59, FS-62/60, FS-66, FS-56 (E1), ATO-009 y URA-009 en **DONE, en produccion**, y esta cadena cerrada.
