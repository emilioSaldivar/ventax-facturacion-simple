# SPEC - Despliegue en `segel-fs` de la nota de credito unificada v0.4

Estado: **escrita el 2026-11-13; decisiones D-1 a D-8 pendientes del usuario**. Repite el procedimiento de `SPEC/PLAN/TASKS_DESPLIEGUE_SEGEL_FS_v0.3` (E-1, 2026-11-12) con tres migraciones nuevas, dos variables de entorno y una dependencia de FE.

## Alineacion

- `AGENTS.md`: regla de cierre; **regla de oro** (ninguna accion en produccion, ni de lectura, sin autorizacion explicita del usuario para esa accion); respaldo previo obligatorio (D-28 de v0.2).
- `docs/PLAN_DESPLIEGUE_SEGEL_FS_v0.3.md`: procedimiento de referencia (imagenes desde el tag con `git archive`, respaldo con restauracion de prueba, corte `migrate` → `api` → `frontend`, verificacion sin emitir, vuelta atras por imagenes) y regla de `BUILD_COMMIT_SHA` igual en API y frontend.
- Cadenas que entran: `SPEC_NOTA_CREDITO_POR_MONTO_v0.1` (FS-136), `SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1` (FS-138), `SPEC_NOTA_CREDITO_UNIFICADA_v0.1` (FS-141, resuelve FS-77). FS-139 y FS-140 son defectos de FE que corrige `segel-rc4.36`.
- `docs/BACKLOG.md`: FS-136, FS-138, FS-139, FS-140, FS-141 ("despliegue espera FS-141", decision del usuario del 2026-11-12).

## Objetivo

Llevar a produccion la nota de credito en una sola pantalla (devolver y ajustar por item o sobre el total, en PYG y USD) y la nota de credito sobre facturas que no emitio FS, sin cambiar el resto de lo que los operadores usan.

## Que corre hoy en produccion (a confirmar con la lectura DSF4-005)

- FS API `8e5a172` (tag `segel-fs-2026.11.12`) y frontend `9481fc9` construido con `BUILD_COMMIT_SHA=8e5a172` (`segel-fs-2026.11.12.2`); 49 migraciones (hasta `0049`).
- FE `segel-rc4.34` (`c4e243e`). Con rc4.34: las notas en USD con algunos precios de 2 decimales se rechazan (FS-139) y FE no acepta notas sobre facturas que no conoce (BL-213 llega en rc4.35).
- Respaldos previos en `/home/esaldivar/segel/backups/fs/` (el ultimo, `20261112T174841Z`).

## Que entra

Todo lo que hay entre `8e5a172` y el commit que se etiquete `segel-fs-2026.11.13` (ver D-2):

| Cadena | Que cambia para el operador | Migraciones | Evidencia |
|---|---|---|---|
| Nota de credito por monto (FS-136) | Base del ajuste por monto sobre la factura, repartido por tasa (§67 de FE); en la pantalla nueva es el "Ajuste sobre el total" | `0050` (`nce_modo`, `nce_motivo_codigo`) | `TASKS_NOTA_CREDITO_POR_MONTO_v0.1` |
| Nota de credito sobre factura externa (FS-138) | En Notas de credito, "¿La factura no está en el sistema? Traela por CDC o cargala a mano": trae la factura de SIFEN por CDC (consulta de FE) o se carga a mano (electronica o impresa); queda como factura "Externa" sin PDF ni enlace, solo para emitir notas | `0051` (`origen`, `referencia_impresa`, `sifen_consulta`, `fecha_emision`; indices unicos solo sobre externas) | `TASKS_NOTA_CREDITO_FACTURA_EXTERNA_v0.1` |
| Nota de credito unificada (FS-141, FS-77) | Una sola pantalla: Devolver (cantidad) y Ajuste (monto o %) por item, Ajuste sobre el total, "Toda la factura", Motivo en SIFEN sugerido y editable, Resumen con desglose por tasa y saldo. La ficha de Documentos ya no abre la ventana corta: "Crear nota de crédito" lleva a esta pantalla con la factura elegida. Una factura con descuento admite devolucion al neto (con `FE_NC_DESCUENTOS`) | `0052` (`linea_factura`, `origen_nc` por linea; `nce_modo` gana `COMBINADA`) | `TASKS_NOTA_CREDITO_UNIFICADA_v0.1` |
| Tutoriales (TUT2) | Nada visible: guiones fuera de la app | ninguna | `TASKS_TUTORIALES_VIDEO_v0.2` |

Las tres migraciones solo **agregan** columnas que admiten null, checks e indices parciales: los datos existentes no cambian y la version anterior las ignora. `git diff 8e5a172..HEAD -- infra` vacio (se confirma en DSF4-002).

### Variables de entorno nuevas en `.env.segel` de FS

| Variable | Valor | Por que |
|---|---|---|
| `FE_NC_DESCUENTOS` | `true` | Devolver lineas con descuento al neto y la nota total con descuentos (requiere FE `segel-rc4.35` o mayor). Sin ella, esas lineas quedan deshabilitadas con "Esta línea tiene descuento: ajustala por monto" |
| `FE_NC_MONEDA_EXTRANJERA` | segun D-4 | Notas de credito sobre facturas en USD. Con rc4.34 hay rechazos (FS-139); con rc4.36 estan corregidos |

## Que no entra

- FS-142 (la busqueda por numero no encuentra facturas externas): abierto, sin cadena; la factura externa recien cargada aparece en la lista.
- FS-137 (factura externa asociada a una nota de remision).
- Notas de debito, autofactura y lo listado como pendiente en v0.3.

## Dependencia de FE

FE `segel-rc4.36` (`a8dd889`) **en produccion antes del corte de FS** (D-3). Lo despliega la sesion de FE con la orden del usuario en esa sesion; FS no toca FE. Segun FE (2026-11-13): rc4.36 no trae migraciones (sigue en 052), ni variables, ni cambios de lotes o workers; descuentos en la NC y factura externa por CDC funcionan sin bandera en FE; FE exige en su prelectura 0 documentos en curso, 0 lotes abiertos y 0 cargas en curso. En `segel-fs` las imagenes de FE se llaman `fe-segel-*:latest` (sin version en el nombre): la guarda de FS compara el id de imagen de `fe-segel-api-1` con el que informa FE (rc4.36: `sha256:5410b9161f34`). Si alguien reconstruye `fe-segel-*` en la estacion antes del corte, los ids cambian y FE los vuelve a informar. Sin rc4.36: la nota sobre factura externa responde que FE no la soporta (FS-138 con rc4.34), las notas con descuentos fallan y FS-139 sigue.

## Decisiones del usuario (pendientes)

| ID | Decision | Propuesta |
|---|---|---|
| D-1 | **Cuando.** Fecha y franja | Fuera del horario transaccional; corte de FS menor a un minuto |
| D-2 | **Que commit.** Commit de lo de FS-141 (solo los cambios de esta sesion: los de otras sesiones sin commit, `ajustes visuales`, `identidad marca`, `TMP/`, `guia-uso-segel.cjs`, quedan fuera), push de la rama y tag local `segel-fs-2026.11.13` sobre ese commit | Si |
| D-3 | **Orden FE → FS.** FE despliega `segel-rc4.36` y avisa; recien despues FS | Si |
| D-4 | **USD.** `FE_NC_MONEDA_EXTRANJERA=true` en produccion | Si, con rc4.36 (FS-139 corregido; NC USD probadas en SIFEN test) |
| D-5 | **Alcance de la autorizacion.** Como en v0.3 (DSF-006): una orden que cubra todo el procedimiento en `segel-fs` (lectura previa, respaldo, variables, `migrate`/`api`/`frontend`, verificacion) con vuelta atras automatica si falla una verificacion; o autorizar paso por paso | La elige el usuario |
| D-6 | **Aviso a operadores** del cambio de pantalla de notas de credito | La elige el usuario |
| D-7 | **Validacion contable del reparto por tasa** (FS-136, decision abierta) | No bloquea: es el metodo de §67 de FE, probado en SIFEN test |
| D-9 | **Permiso `SIFEN_DE_CONSULTA`** de cada consumidor de FS en FE. "Traer por CDC" (FS-138) consulta SIFEN con la clave del consumidor del facturador (`resolveConsumerGateway`); sin el permiso FE responde 403 y ese facturador solo puede cargar la factura externa a mano | FE lo verifica con un SELECT de solo lectura en su prelectura; si falta, el usuario decide si FE lo otorga (cambio en FE de produccion, con su autorizacion en la sesion de FE) |
| D-8 | **Prueba manual del usuario** en el stack local (NCU-008) antes del corte | Recomendado |

## Reglas

- **RN-01. Respaldo previo** con restauracion de prueba; si los conteos no coinciden, no se toca produccion.
- **RN-02. Solo FS:** se recrean `migrate`, `api` y `frontend`; `postgres` y el loader DNIT no se tocan. FE lo despliega FE.
- **RN-03. Imagenes desde el tag** (`git archive`), API y frontend con el mismo `BUILD_COMMIT_SHA` (el commit del tag).
- **RN-04. Variables:** se agregan al `.env.segel` de FS con copia previa del archivo (`.env.segel.antes-2026.11.13`); nunca se imprimen secretos.
- **RN-05. Nada se emite en produccion** como prueba (regla de v0.3, D-8 retirada).
- **RN-06. Vuelta atras** por imagenes `:antes-2026.11.13` y el `.env.segel` anterior; el esquema no se revierte (columnas aditivas). Si ya se cargaron facturas externas, se informa: la version anterior las mostraria como facturas propias sin documento fiscal.

## Criterios de aceptacion

- **CA-01.** Imagenes `segel-fs-prod-{api,frontend}:<sha>` en la VPS.
- **CA-02.** Respaldo con restauracion de prueba (facturas y ultima migracion iguales a la lectura previa).
- **CA-03.** Migraciones `0050`, `0051`, `0052` aplicadas (52 en total).
- **CA-04.** `X-App-Version: <sha>` en API y frontend; `/app/` 200; contenedores `healthy`; FE por la red interna responde con `segel-rc4.36`.
- **CA-05.** Datos sin cambios: facturas, notas, usuarios, facturadores y clientes iguales a la lectura previa; 0 facturas externas; 0 notas `COMBINADA`.
- **CA-06.** `FE_NC_DESCUENTOS=true` (y `FE_NC_MONEDA_EXTRANJERA` segun D-4) presentes en el contenedor de la API (`docker exec segel-fs-api-1 printenv` de esas dos variables, que no son secretas); el usuario lo ve en CA-08 (devolver una linea con descuento no queda deshabilitado).
- **CA-07.** Sin errores (`level 50`) en la API a los 10 minutos del corte.
- **CA-08.** El usuario revisa la pantalla de notas de credito con su acceso.
