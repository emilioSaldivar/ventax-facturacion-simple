# SPEC - Despliegue en `segel-fs` de la version con validaciones, catalogo en USD, descuentos y nota de remision v0.3

Estado: **en refinamiento** (2026-11-11). Solo documentacion: el despliegue se ejecuta cuando el usuario confirme las decisiones D-1 a D-8 y de la orden directa. Reemplaza, para esta version, la seccion E-6 de `TASKS_DESPLIEGUE_SEGEL_FS_v0.2` como procedimiento de referencia.

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

Todo lo que hay entre `ed8b493` y el commit que se etiquete (62 commits al 2026-11-11, 91 archivos de codigo y pruebas). Por cadena:

| Cadena | Que cambia para el operador | Migraciones | Evidencia |
|---|---|---|---|
| Validaciones del receptor (FS-62, FS-60) | La agenda, la factura y el recibo no aceptan RUC sin digito verificador o con uno incorrecto, correos con espacios, telefonos fuera de 6 a 15 digitos ni nombres de menos de 4 letras; el mensaje dice que corregir. El padron ya no cambia un RUC a CI por su cuenta. Los clientes ya cargados no cambian: en `segel-fs` ninguno queda marcado "Revisar datos" (VAL-009) | ninguna | `TASKS_VALIDACIONES_RECEPTOR_v0.1` |
| Catalogo en moneda extranjera (FS-59) | Cada articulo tiene moneda (Gs. o USD); en una factura en USD, un articulo en USD completa su precio y "Guardar en el catalogo" funciona | `0046` (`moneda`, `precio_unitario` pasa a `numeric(18,2)`) | `TASKS_CATALOGO_MONEDA_v0.1` |
| Descuentos (FS-66) | Columna "Descuento" por linea (porcentaje o monto) y "Descuento sobre el total"; fila "Descuento" en totales, resultado y ficha. Una factura con descuento solo admite nota de credito total | `0047` (`descuento` y `descuento_global` por linea, default 0) | `TASKS_DESCUENTOS_FACTURA_v0.1` |
| Nota de remision manual, E1 (FS-56) | La pestaña "Nueva nota de remision" existe, pero en produccion queda **"Proximamente"** para todos (ver RN-03). Las notas de remision de carga masiva pasan a ofrecer "Anular" en la ficha | `0048` (permisos y tipos del consumidor, domicilio del cliente, tablas reutilizables vacias), `0049` (tipos de documento del emisor) | `TASKS_NOTA_REMISION_v0.1` |
| Textos del operador (ATO-009) | "Proximo numero 0000002" desaparece; ayuda del tipo de cambio; error visible al emitir un recibo desde la ficha; "Pedidos"; plantilla y "Ver nota de remision" correctos en remisiones; resultado "Nota de credito" tras una NC | ninguna | `TASKS_AJUSTES_TEXTOS_OPERADOR_v0.1` |
| Catalogo y Agenda en tabla (URA-009, FS-53) | En escritorio, tabla a lo ancho con el alta en un panel lateral; en celular, tarjetas | ninguna | `TASKS_UX_RESTO_APP_v0.1` |
| Falta de numerador en FE (RN-01b, FE v0.50) | Si FE rechaza una emision por numerador faltante, bloqueado o agotado (500 actual o 409 de FE v0.50), el documento queda en error a corregir con el motivo en la ficha, sin reintentos. Hoy no afecta a ninguna factura de produccion | ninguna | `TASKS_NOTA_REMISION_v0.1` NRE-030 |
| Herramientas de los tutoriales (TUT-001 a TUT-010) | Nada visible: guiones y scripts fuera de la app (se confirma en DSF-002) | ninguna | `TASKS_TUTORIALES_VIDEO_v0.1` |

Sin cambios de `docker-compose`, variables de entorno, plantillas ni imagenes de FE (`git diff ed8b493..HEAD -- infra` vacio). El loader DNIT no se toca.

## Decisiones del usuario a confirmar antes de ejecutar

| ID | Decision | Propuesta |
|---|---|---|
| D-1 | **Cuando.** Fecha y franja horaria del despliegue | Fuera del horario en que RAJ y SALUMAX facturan; el corte es menor a un minuto (solo se recrean `migrate`, `api` y `frontend`) |
| D-2 | **Que commit.** El HEAD de `feat/identidad-segel` al momento de la orden, etiquetado `segel-fs-2026.11.12` | Si, sin cherry-picks: la rama se probo entera |
| D-3 | **Remision en produccion.** No re-importar ningun facturador en esta version: `fe_consumer_permisos` y `fe_tipos_documento` quedan vacios y la pestaña dice "Proximamente" | Si (decision del 2026-11-11: nadie la usa todavia). Cuando un cliente la pida: FE carga el numerador tipo 7 en **todos** sus puntos, se re-exporta e importa, y se le avisa que la pestaña se activa sola |
| D-4 | **SALUMAX.** Su alta en FS la hizo el usuario con un export anterior al cambio; si alguien lo re-importa, Logistica y TICS veran la remision y Licitaciones (003) tendra el error de numerador | No re-importar hasta decidir el 003 (FS-72 o numerador en 003) |
| D-5 | **Descuentos en USD en SIFEN test (DES-013).** ¿Antes o despues del despliegue? | Antes, desde el stack local, con aviso a FE: no bloquea, pero cierra CA-10b |
| D-6 | **Comunicacion a los operadores.** Que se les avisa: desaparece el "Proximo numero", descuentos disponibles, moneda del catalogo, validacion del RUC con DV (quien cargue un RUC sin DV vera el mensaje y tendra que corregirlo) | Un mensaje corto por cliente, lo redacta FS a pedido |
| D-7 | **Quien ejecuta.** La sesion de FS, con orden directa en su sesion, desde la estacion por SSH a `segel-fs`; FE no se toca | Igual que E-6 |
| D-8 | **Prueba en produccion.** Solo verificacion sin emitir (CA-03 a CA-08) o ademas una factura real con descuento de 1 unidad al cliente de prueba del usuario | Sin emitir; el usuario decide si quiere la factura de prueba y con que cliente |

## Reglas

- **RN-01. Respaldo primero.** `pg_dump -Fc` de la base de FS sin el padron DNIT, en la VPS, con la lista de imagenes y SHA256; restauracion comprobada en un Postgres descartable antes de tocar nada (D-28 de v0.2). No se copia a la estacion.
- **RN-02. Imagenes del commit etiquetado.** API/migrate y frontend se construyen en la estacion con `BUILD_COMMIT_SHA` igual al commit del tag, desde `git archive` (sin archivos sin versionar), y se transfieren por SSH. Las imagenes actuales quedan etiquetadas `:antes-2026.11.12` para volver atras.
- **RN-03. Remision oculta hasta que se decida.** No se ejecuta ninguna importacion de export de FE en esta version. `nota_remision_habilitada` debe responder `false` para los 4 facturadores despues del despliegue (CA-06). Es el efecto esperado de D-3 y D-4, no un defecto.
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

- Decisiones D-1 a D-8.
- No bloquean: NRE-014 (formulario precargado desde "Corregir y emitir de nuevo"), VAL-013 (errores por campo en Recibos), DES-013 (USD en SIFEN test), la entrega E2 de la remision y FS-72 (numeradores por punto en el export de FE).

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
- **CA-06.** `nota_remision_habilitada = false` para los 4 facturadores (`fe_tipos_documento` vacio); la pestaña dice "Proximamente".
- **CA-07.** 0 errores en el log de la API en los primeros 10 minutos; el worker de verificacion sigue corriendo (siguiente verificacion programada visible).
- **CA-08.** Con una sesion de operador que el usuario indique (o sin ella, si no la hay): Nueva factura sin "Proximo numero", columna "Descuento" visible, catalogo con selector de moneda, agenda en tabla; sin emitir.
- **CA-09.** Imagenes `:antes-2026.11.12` presentes y procedimiento de vuelta atras anotado antes de dar por cerrado.
- **CA-10.** `docs/BACKLOG.md` con las filas FS-59, FS-62/60, FS-66, FS-56 (E1), ATO-009 y URA-009 en **DONE, en produccion**, y esta cadena cerrada.
