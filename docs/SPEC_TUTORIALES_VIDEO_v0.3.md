# SPEC — Tutoriales en video para operadores v0.3

**Estado:** cerrada (2026-11-13). Escrita y grabada con el stack local en `3613087` (punta de la app en la rama)
**Rama:** `feat/identidad-segel` (marca Segel). No va a `master`.
**Cadena:** `SPEC_TUTORIALES_VIDEO_v0.3` → `PLAN_TUTORIALES_VIDEO_v0.3` → `TASKS_TUTORIALES_VIDEO_v0.3`
**Base:** `SPEC_TUTORIALES_VIDEO_v0.1` y `v0.2` siguen vigentes (mapa, estados, mensajes M-1 a M-11, decisiones D-1 a D-15, restricciones R-1 a R-10). Aca solo lo que cambia. **BACKLOG:** FS-146.

## 1. Motivo

Entre el 2026-11-12 y el 2026-11-13 pasaron a produccion en `segel-fs` (cadena `DESPLIEGUE_SEGEL_FS_v0.4` y su hotfix `segel-fs-2026.11.13.1`) tres cambios de la nota de credito que dejan desactualizados los videos:

- **Nota de credito unificada** (FS-141, resuelve FS-77): una sola pantalla, la misma desde "Notas de crédito" y desde la ficha, con "Devolver" (cantidad) y "Ajuste" (monto o %) por item, "Ajuste sobre el total", "Toda la factura", "Motivo en SIFEN" sugerido y editable y un panel "Resumen" con el saldo. Se elimino la ventana corta de la ficha y las opciones "Toda la factura" / "Algunas líneas" de V4.
- **Nota de credito por monto** (FS-136): ajuste sobre el total, sin devolver items.
- **Nota de credito sobre factura de otro sistema** (FS-138): la factura se trae de SIFEN por CDC o se carga a mano (referencia electronica o impresa).

Ademas, con `FE_NC_DESCUENTOS=true` (en produccion segun `TASKS_DESPLIEGUE_SEGEL_FS_v0.4`), una factura con descuento **ya admite** nota de credito parcial: se devuelve al neto o se ajusta. El cierre de V7 ("solo admite nota de crédito por el total", "Parcial" deshabilitado) dejo de ser cierto.

Pedido del usuario del 2026-11-13: planificar las grabaciones de la nota de credito y de cualquier otro punto con relevancia operativa; los ajustes pequenos no se regraban.

## 2. Alcance

| # | Video | Que se hace | Por que | Emite en SIFEN test |
|---|---|---|---|---|
| V4 | Notas de credito | **Se regraba completo** con la pantalla unica (§3.5b) | V4 muestra pantallas que ya no existen | 3 notas de credito |
| V11 | Nota de credito sobre una factura de otro sistema | **Nuevo** (§3.14) | Funcion nueva en produccion | 2 notas de credito (y 1 factura que emite FE fuera de FS, P-11) |
| V7 | Descuentos | **Se regraba** con un cierre nuevo: la factura con descuento admite nota de credito; se muestra la pantalla con la columna "Neto u." y se dice que se devuelve al neto o se ajusta (sin emitir la nota) | El cierre actual afirma algo falso | 1 factura PYG |

**No se regraban** (ajustes pequenos o sin cambio operativo):

| Video | Cambio en la app | Decision |
|---|---|---|
| V3 | "Plazo (días)" pasa a escribirse de 1 a 365 con incrementador de 5 en 5 (FS-92); el subtitulo de V3 dice "30, 60 o 90" | No se regraba (propuesta, P-12): el flujo de la factura a credito es el mismo y el campo admite esos valores. Si el usuario lo prefiere, se regraba solo V3 (5 facturas) |
| V2, V10 | La ficha sigue ofreciendo "Crear nota de crédito"; ahora abre la pantalla unica | No se regraban: no muestran la nota de credito por dentro |
| Todos | Ajustes visuales del operador (`SPEC_AJUSTES_VISUALES_OPERADOR_v0.1`, en curso en otra sesion) | No se regraban: son de presentacion |
| V8 | Factura asociada por CDC en la remision (FS-137) | Fuera: todavia no esta implementada (ESPERA usuario y FE). Cuando se despliegue, se agrega una escena a V8 en otra version |

## 3. Mapa: filas nuevas y reemplazadas

Etiquetas leidas del arbol de accesibilidad en `3613087` (2026-11-13). Se vuelven a buscar antes de grabar (TUT3-001), porque la otra sesion esta cambiando textos (ajustes visuales).

### 3.5b Notas de credito (reemplaza §3.5 de la v0.1)

| Elemento | Que hace | Video |
|---|---|---|
| Encabezado "Devolvé ítems o ajustá montos y porcentajes de una factura aprobada · Se emite por el Punto …"; pestañas "Nueva nota de crédito" y "Emitidas · N" | Entrada. | V4 |
| "Factura de la nota": "Buscar factura" (cliente, documento, número o total), candidatas con "Elegible" o el motivo; "Cambiar factura" | Elegir la factura. | V4 |
| "Qué se devuelve o ajusta": columnas "Facturado", "Precio", "IVA", "Ya devuelto o ajustado", "Devolver" (con "máx. N"), "Importe" | Devolver cantidades. | V4 |
| "Toda la factura" | Llena "Devolver" con el saldo de cada linea. | V4 |
| "Agregar ajuste" / "Ocultar ajustes" / "Quitar ajustes"; columna "Ajuste" con "%" / moneda; "Ajuste sobre el total" ("Se reparte en proporción a lo que la factura tiene en cada tasa") | Ajustes por item y sobre el total (nota por monto, FS-136). | V4 |
| Validacion: "Supera lo que queda por devolver (N)." en "Devolver", "Supera lo disponible en este ítem" en "Ajuste", "Indicá qué se devuelve o se ajusta" | Topes por item y por saldo. | V4 |
| "Motivo en SIFEN" ("Sugerido según lo que cargaste; podés cambiarlo") y "Detalle para el cliente" | Motivo fiscal (2 Devolución, 3 Descuento, 1 Devolución y ajuste de precios, 4, 8) y texto para el cliente. | V4 |
| "Resumen": "Devolución de ítems", "Ajuste por ítem", "Ajuste sobre el total", "Total de la nota", "Saldo de la factura", "Saldo después de la nota", "Emitir nota de crédito" con el motivo de bloqueo | Control antes de emitir. | V4 |
| Ficha: "Crear nota de crédito" lleva a la misma pantalla con la factura elegida | Un solo camino (FS-77). | V4 |
| Factura con descuento: columna "Neto u."; "Devolver" devuelve al neto | Descuentos y nota de credito. | V7 |
| Avisos M-4 (punto) y factura "Sin nombre" sin nota de credito | Limites que siguen. | V4 |

### 3.14 Nota de credito sobre una factura de otro sistema (FS-138)

| Elemento | Que hace | Video |
|---|---|---|
| "¿La factura no está en el sistema? Traela por CDC o cargala a mano" | Entrada desde "Factura de la nota". | V11 |
| Traer por CDC: campo CDC, validacion (formato, digito, que sea factura del propio RUC) y la factura leida de SIFEN (cliente, items, totales) | Datos reales y firmados de SIFEN. | V11 |
| Cargar a mano: cliente, items y referencia electronica (CDC) o impresa (timbrado, establecimiento, punto, numero, fecha); aviso "Cargada a mano: los datos no fueron verificados en SIFEN" | Para facturas preimpresas o sin acceso al CDC. | V11 |
| Ficha: pastilla "Externa · de SIFEN" / "Externa · cargada a mano"; sin KuDE, enlace, anulacion; "Desde esta factura" solo "Crear nota de crédito"; "Eliminar factura externa" sin notas | Que se puede hacer con una externa. | V11 |
| Nota de credito sobre la externa: misma pantalla (§3.5b) | Total, por items o por monto. | V11 |

## 4. Mensajes nuevos

- **M-12 Devolver o ajustar.** "Devolver" es por cantidad (el cliente devuelve productos); "Ajuste" es por monto o porcentaje (descuento, bonificacion o error de precio), por item o sobre el total. Se pueden combinar en una sola nota. El motivo en SIFEN se sugiere segun lo cargado y se puede cambiar. La nota no puede superar el saldo de la factura.
- **M-13 Factura de otro sistema.** Si la factura no la emitiste con esta app, la traés de SIFEN con su CDC (datos verificados) o la cargás a mano; cargada a mano, los datos no se verifican y SIFEN puede rechazar la nota si no coinciden.

## 5. Decisiones

| Id | Tema | Decision | Fecha |
|---|---|---|---|
| D-16 | Que se regraba | V4 completo, V7 (cierre) y V11 nuevo. V3 no (P-12). Ajustes visuales y textos menores, no (pedido del usuario) | 2026-11-13 (aceptada con la orden de grabar) |
| D-17 | Factura externa para "Traer por CDC" | Hace falta una factura **nueva** emitida fuera de FS (las de prueba `9300006` a `9300008` ya estan cargadas y con notas). Propuesta: pedirla a la sesion de FE en su pila de prueba, a nombre de SEGEL SA. Alternativa sin FE: V11 muestra el campo CDC y la validacion, y emite solo sobre la factura cargada a mano (P-11) | 2026-11-13 (aceptada: FE emitio `9300011`, `9300013` y `9300014`; se uso `9300014`, las otras se consumieron en corridas fallidas) |

| D-18 | CDC real en pantalla | El CDC lleva el RUC del emisor real: en pantalla se escribe un CDC de ejemplo (RUC 80000000-0, digito verificador valido) y el guion lo cambia por el real solo en la llamada a la API (PLAN §6) | 2026-11-13 |

## 6. Criterios de aceptacion

- **CA-12** `v4-notas-credito.mp4` regrabado con la pantalla unica: una nota total ("Toda la factura"), una combinada (devolver un item y ajuste en %) y una por monto ("Ajuste sobre el total"), aprobadas en SIFEN test; cubre §3.5b y M-12.
- **CA-13** `v11-nota-credito-externa.mp4`: una externa traida por CDC (o solo la validacion, segun P-11) y una cargada a mano con referencia impresa; nota de credito aprobada sobre al menos una; cubre §3.14 y M-13.
- **CA-14** `v7-descuentos.mp4` regrabado sin la frase "solo admite nota de crédito por el total"; el cierre muestra la columna "Neto u.".
- **CA-3** de la v0.1 vale para los videos nuevos.

## 7. Resultado (2026-11-13)

CA-12, CA-13 y CA-14 cumplidos: `v4-notas-credito.mp4` (3:55; NC `1010053`, `1010054`, `1010055`), `v11-nota-credito-externa.mp4` (2:50; NC `1010058` por CDC y `1010059` a mano) y `v7-descuentos.mp4` (2:47; factura `1010681`). Cobertura 113/114 (falta `4-rechazada`, justificada en la v0.1). Evidencia en `TASKS_TUTORIALES_VIDEO_v0.3`.
