# SPEC — Plazo de crédito escrito por el operador v0.1

**Fecha:** 2026-11-12 · **Backlog:** FS-92 (prioridad Alta, fijada por el usuario el 2026-11-12) · **Rama:** `feat/identidad-segel`

## 1. Problema

En Nueva factura, con condición **Crédito**, el plazo solo se elige entre 30, 60 y 90 días (`main.tsx`, lista fija). Hay clientes con condiciones de 5, 45, 120 o hasta 365 días, que hoy no pueden facturar desde FS.

Hay además un defecto latente: el valor inicial sale del punto (`fiscal_context.credito_plazo_dias`), que el backoffice admite con cualquier entero mayor que 0. Si no es 30, 60 o 90, la lista muestra 30 pero la factura sale con el valor del punto; si es mayor que 365, la API responde 400.

## 2. Reglas verificadas (2026-11-12)

| Fuente | Regla | Evidencia |
|---|---|---|
| SIFEN, Manual Técnico v150 | E643 `dPlazoCre`: alfanumérico de 2 a 15 caracteres, obligatorio con crédito a plazo (E641 = 1). Texto libre, sin catálogo ni tope. Solo validaciones 1703 (falta) y 1704 (sobra). Ninguna nota técnica lo modifica | `manual_150.md:3801`, `:8131`, `:8134`; respuesta de FE (sesión `facturacion-electronica-7c`), búsqueda en las 27 NT |
| FE (`segel-rc4.34`) | `credito.plazoDias`: entero positivo, sin máximo; sale como `"<N> dias"`. El KUDE imprime `dPlazoCre` tal cual | `factura.schema.ts:376`, `fe.mapper.ts:221`, `Factura.jrxml:788`, guía §62.2 |
| FS API | `credito_plazo_dias`: entero de 1 a 365; se manda a FE tal cual | `facturas.routes.ts:51`, `fiscal-gateway.client.ts` `buildCondicionOperacion` |

Conclusión: el cambio es **solo de pantalla**. No cambian la API, el contrato con FE, la base ni `spec/openapi.yaml`.

## 3. Alcance

**Entra:** el campo "Plazo (días)" de la banda Comprobante de Nueva factura, en modo completo y en modo simple.

**No entra:** la carga masiva (la planilla ya acepta cualquier entero positivo, por FE), presupuestos y pedidos (no tienen plazo), el backoffice (sigue editando el plazo del punto) y el texto "dias" sin tilde ni singular que arma FE (es de FE; estético, informado por FE).

## 4. Reglas de negocio

- **RN-01 — Valor inicial 30.** Al abrir Nueva factura y al crear una factura nueva, el plazo vale 30 días. Decisión del usuario del 2026-11-12. El plazo del punto deja de precargar la pantalla (D-1).
- **RN-02 — Incrementador.** El campo tiene un botón para restar y otro para sumar, de **5 en 5** días, y se puede escribir el número directamente.
- **RN-03 — Rango.** Entero de **1 a 365** (tope de FS: evita errores de tipeo; SIFEN y FE no tienen tope, D-2). Restar nunca baja de 1 y sumar nunca pasa de 365: el botón queda deshabilitado en el extremo.
- **RN-04 — Escritura.** Solo se aceptan dígitos (se descartan otros caracteres al escribir). El campo puede quedar vacío mientras se escribe.
- **RN-05 — Error claro.** Con el campo vacío, en 0 o mayor que 365, el campo se marca como inválido, muestra "Escribí un plazo de 1 a 365 días" y "Crear factura" queda bloqueado con el motivo "Plazo de crédito: escribí un plazo de 1 a 365 días".
- **RN-06 — Solo con Crédito.** Con Contado el plazo no se envía (como hoy). En modo completo el campo se ve deshabilitado con Contado; en modo simple se muestra solo con Crédito (como hoy). Pasar de Crédito a Contado y volver conserva lo escrito.
- **RN-07 — Pedido.** Con Crédito y plazo válido, el pedido lleva `credito_plazo_dias` con ese entero, igual que hoy.

## 5. Interfaz

Mismo lenguaje visual que la banda Comprobante (`PAUTAS_FRONTEND_v0.1`): control de 38 px de alto, borde `--color-line`, radio `--radius-control`, fondo `--color-surface`, botones con `Icono` (menos y más) y número centrado. En celular, los botones miden 44 px (P-A). Etiqueta "Plazo (días)" y error con la clase `campo-error`, como el descuento sobre el total.

## 6. Criterios de aceptación

- **CA-01:** al abrir Nueva factura y elegir Crédito, el plazo dice 30 (1440, 1280 y 390 px).
- **CA-02:** sumar lleva 30 → 35; restar lleva 30 → 25; desde 3, restar deja 1 y el botón queda deshabilitado; desde 362, sumar deja 365 y el botón queda deshabilitado.
- **CA-03:** escribir 120 deja 120; escribir "12a0" deja 120; vacío, 0 y 400 muestran el error de RN-05 y bloquean "Crear factura".
- **CA-04:** la vista previa y la emisión mandan `credito_plazo_dias` con el valor del campo; con Contado no lo mandan.
- **CA-05:** SIFEN test aprueba facturas a crédito con 5, 35, 120 y 365 días emitidas desde la pantalla, y FE confirma `dPlazoCre` en su base.
- **CA-06:** sin desborde horizontal ni emojis; botones con nombre accesible; guion de reconocimiento sin subir la línea base.

## 7. Decisiones

| Id | Decisión | Estado |
|---|---|---|
| D-1 | El valor inicial es 30 fijo (pedido del usuario), no el plazo del punto. Hoy todos los puntos conocidos tienen 30 (import con `CREDITO_PLAZO_DIAS_DEFAULT = 30`; bases locales: 13 de 13). La API sigue usando el plazo del punto si un pedido llega sin plazo | Decidida (usuario, 2026-11-12) |
| D-2 | Tope de 365 días de FS | Decidida (usuario, 2026-11-12, "si eso es lo que necesitamos") |
| D-3 | Paso de 5 días, sin redondear a múltiplos de 5 (32 + 5 = 37) | Decidida (usuario, 2026-11-12) |
