# Operación — Verificación de capacidad para 200 clientes v0.1

Guía para quien corre las pruebas y para la persona que observa.

## Alineación

- `docs/SPEC_VERIFICACION_CAPACIDAD_200_v0.1.md`
- `docs/PLAN_VERIFICACION_CAPACIDAD_200_v0.1.md`
- `docs/TASKS_VERIFICACION_CAPACIDAD_200_v0.1.md`

## 1. Lo que hace falta antes de una corrida real

| De quién | Qué | Para qué |
|---|---|---|
| Equipo de FE | FE aislado con SIFEN simulado, conectado a la red Docker `fs_carga_fiscal` | Modo real (RN-04) |
| Equipo de FE | `FE_API_BASE_URL`, clave compartida, versión de FE y modo de SIFEN | `.local/carga/env.carga` y el informe |
| Equipo de FE | Manifiesto de 200 facturadores (PLAN §3.2), con export y clave de consumidor de cada uno, por un canal seguro | Las altas |
| Equipo de FE | Forma de inyectar F2, F7, F8 y F9, y a qué emisores afecta | Los fallos |
| Equipo de FE | Sus métricas de cada corrida, y el cruce de `documentos.jsonl` contra el XML de cada evento | P1, P2, CA-14 |
| Usuario | Fechas, y la persona que observa | R-7 |

**Nunca** apuntar nada de esto a producción ni a staging: las guardas de `stack.sh` lo impiden y no se deben desactivar.

## 2. Perfil de producción

**No se corre en esta etapa, que es solo local.** La carga usa el supuesto de FE: 50 facturas por hora en pico y 250 en un día fuerte.

Para una etapa posterior: es de solo lectura y devuelve agregados, sin nombres ni RUC. Lo correría el usuario en la VPS, después de revisarlo:

```bash
docker exec -i ventax-facturacion-simple-prod-postgres-1 \
  psql -U facturacion_simple -d facturacion_simple -At -F ' | ' < scripts/carga/sql/perfil-produccion.sql
```

## 3. Preparar el stack

Apagar antes los otros stacks de la estación, y anotarlo: compiten por memoria y CPU.

```bash
bash scripts/carga/stack.sh destroy         # si quedó el stack de la prueba en mock
rm .local/carga/env.carga .local/carga/operadores.json .local/carga/admin.json
bash scripts/carga/stack.sh init            # completar FE_API_BASE_URL y FE_API_KEY en .local/carga/env.carga
bash scripts/carga/stack.sh up
```

`up` termina con estas comprobaciones: `X-App-Version=7fe6ae8`, `FE_GATEWAY_MODE=real`, frontend sin Segel y correo falso activo. Si falla alguna, no seguir.

## 4. Orden de las corridas

Sustituir `<M>` por la ruta del manifiesto.

```bash
# Altas (P4): una corrida en serie mide el costo real de operar altas.
node scripts/carga/seed.cjs --manifiesto <M> --corrida altas

# Aislamiento, sin carga.
node scripts/carga/isolation.cjs --corrida ais-base --pares 5

# E1: un escalón por vez, cambiando --operadores a 50, 100 y 150.
node scripts/carga/collect.cjs --corrida e1-50 --duracion-s 1500 &
node scripts/carga/simulate.cjs --corrida e1-50 --operadores 50 --total-por-hora 62 --duracion-s 1200 --limite-final-s 300

# E8: 60 min con los 200, más el drenaje.
node scripts/carga/collect.cjs --corrida e8 --duracion-s 12600 &
node scripts/carga/simulate.cjs --corrida e8 --operadores 200 --total-por-hora 250 --duracion-s 3600 &
node scripts/carga/isolation.cjs --corrida e8-ais --pares 5   # a los 30 min, con la carga arriba
wait %2

# E9: 50 cancelaciones simultáneas, sobre lo aprobado en E8.
node scripts/carga/cancelar-simultaneo.cjs --corrida e8 --cantidad 50 --mismo-emisor 25 --ventana-s 5

# Cierre de cada corrida.
node scripts/carga/reconcile.cjs --corrida e8 --fe-url <url-de-FE-alcanzable> --manifiesto <M>
node scripts/carga/report.cjs --corrida e8 --manifiesto <M>
```

Para rastrear una factura de punta a punta: `node scripts/carga/reconcile.cjs --buscar cg-e8-f001-000001`.

Ráfaga E3 y cliente concentrado (H-2):

```bash
node scripts/carga/simulate.cjs --corrida e3 --operadores 200 --escenario rafaga --ventana-rafaga-s 60
node scripts/carga/simulate.cjs --corrida e3b --operadores 200 --total-por-hora 50 --duracion-s 1800 \
  --escenario concentrado --ref-concentrado f001 --cantidad-concentrado 500
```

Los resultados quedan en `test-results/carga/<corrida>/`, y `informe.md` es el resumen. Si el informe dice `NO ES EVIDENCIA`, leer el motivo: esa corrida no se usa para responder las preguntas.

## 5. Fallos, con la persona presente

Dejar la carga corriendo con un operador reservado, fuera de ella: agregar `--excluir f001` al simulador. Para cada fallo:

1. Anotar la hora y lo que se espera.
2. Inyectar.
3. Capturar: `node scripts/carga/observar-fallos.cjs --corrida fallos --etiqueta F1 --ref f001 --emitir`
4. La persona usa la app como operador, en móvil y escritorio, y completa la tabla de §6.
5. Restaurar, capturar de nuevo con otra etiqueta, y anotar cuánto tardó en recuperarse sin ayuda.

| # | Fallo | Inyección | Restauración |
|---|---|---|---|
| F1 | FE caído | `bash scripts/carga/fallos.sh f1 inyectar` | `... f1 restaurar` |
| F2 | FE lento | Equipo de FE | Equipo de FE |
| F3 | Clave compartida inválida | `bash scripts/carga/fallos.sh f3 inyectar` | `... f3 restaurar` |
| F4 | Clave de consumidor inválida | `PUT /backoffice/facturadores/:id/api-key` en un facturador | Volver a poner su clave |
| F5 | API muere con trabajo en curso | `bash scripts/carga/fallos.sh f5`, con cola ocupada | Automática o no: es lo que se mide |
| F6 | Base reiniciada | `bash scripts/carga/fallos.sh f6` | Hoy la API muere y no vuelve (H-14): `docker start fs-carga-api-1`. Anotarlo |
| F7 | Emisor sin configuración | Equipo de FE, sobre un emisor ya dado de alta | Equipo de FE |
| F8 | Lotes demorados en `0361` | SIFEN simulado de FE | Equipo de FE |
| F9 | `1002` después de un reenvío | SIFEN simulado de FE | Equipo de FE |

**Revisar las capturas a ojo.** El script guarda también el texto visible, pero ya hubo un caso de texto invisible dado por bueno.

## 6. Hoja de la persona que observa

Una fila por fallo.

| Fallo | Hora | Qué muestra la app | ¿Es verdad? | ¿El operador sabe qué hacer? | ¿Lo resuelve sin soporte? | Tiempo de recuperación | Captura |
|---|---|---|---|---|---|---|---|
| F1 | | | | | | | |
| F2 | | | | | | | |
| F3 | | | | | | | |
| F4 | | | | | | | |
| F5 | | | | | | | |
| F6 | | | | | | | |
| F7 | | | | | | | |
| F8 | | | | | | | |
| F9 | | | | | | | |

Puntos a mirar:

- En F3, si la emisión sigue "funcionando" mientras KUDE, verificación y cancelación fallan.
- En F7, si sus reintentos demoran a otros clientes en la cola.
- En F8, si la factura se ve "Procesando" mucho tiempo después de aprobada (H-13).
- En F9, si se muestra como rechazada mientras FE la reconcilia, y si cancelar usa el CDC vigente (H-12).

## 7. Backups (E6)

Con el stack aislado, en frío y bajo carga, cronometrando cada comando desde `.local/carga/worktree`:

```bash
cd .local/carga/worktree
time APP_ENV_FILE=.env.carga BACKUP_DIR=$PWD/backups/carga bash scripts/backup.sh
time APP_ENV_FILE=.env.carga BACKUP_DIR=$PWD/backups/carga bash scripts/verify-restore.sh
```

El estado real del cron en la VPS queda para una etapa posterior.

## 8. Limpieza

```bash
bash scripts/carga/stack.sh down      # detiene y conserva los datos
bash scripts/carga/stack.sh destroy   # borra el stack aislado, con confirmación
```

`.local/carga/` conserva claves y contraseñas de la prueba: borrarlo al cerrar. FE rota las claves del entorno aislado.
