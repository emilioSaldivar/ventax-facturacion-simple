# SPEC Recibo de Dinero v0.6: perfil de emision y moneda

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RECIBO_DINERO_v0.5.md` (recibo firmado por FE; esta version lo amplia sin cambiar su ciclo de vida)
- `docs/PLAN_RECIBO_DINERO_v0.6.md`
- `docs/TASKS_RECIBO_DINERO_v0.6.md`
- Guia de FE para consumidores, paquete v0.56, seccion 71 "Recibo de Dinero con Perfil de Emision y Monedas Admitidas" (repo de FE, rama `feat/recibo-perfil-moneda`, sin tag al 2026-11-13); confirmaciones de contrato de la sesion `facturacion-electronica-7b` del 2026-11-13
- `docs/SPEC_SEGMENTACION_PERFIL_EMISION_v0.1.md` y `docs/SPEC_MULTIPERFIL_USUARIO_v0.1.md` (perfil del punto del usuario)
- `docs/SPEC_MONEDA_EXTRANJERA_v0.1.md` (monedas de la factura y decimales)
- `docs/BACKLOG.md`: FS-158 (este alcance), FS-159 (otras monedas) y FS-160 (numeracion por punto), ambos fuera

## 1. Problema

1. El operador no puede emitir un recibo suelto en dolares: el formulario de "Cobros / Recibos" arranca siempre en guaranies y no tiene selector de moneda (`main.tsx`, `formMoneda` fijo en `PYG`).
2. El recibo sale con la cabecera del emisor y la actividad principal, no con la del punto del usuario: FS no manda `emission_profile_code` (FE lo admite desde v0.56, §71.1).
3. La API de FS acepta cualquier texto como `moneda` y no controla los decimales del importe segun la moneda (`recibos.routes.ts:59`, `z.string().min(1)`); con FE v0.56 una moneda fuera de PYG/USD/EUR/BRL o un PYG con decimales vuelve como 422 de FE y se ve como error generico.

## 2. Alcance

Entra:

- Selector de moneda en el formulario del recibo suelto: guaranies y dolares (D-1). Euros y reales solo en el recibo que nace de una factura en esa moneda (D-4).
- Importe con decimales segun la moneda.
- `emission_profile_code` del punto del usuario al crear el recibo, suelto o desde factura.
- Validacion de moneda e importe en la API de FS, antes de llamar a FE.
- Traduccion de los errores nuevos de FE a mensajes para el operador.
- `emission_profile_code` en la respuesta del recibo de FS (solo lectura).

No entra: otras monedas (FS-159), numeracion por establecimiento y punto (FS-160; el recibo sigue el correlativo unico del emisor, §71.1), tipo de cambio (el recibo no lo lleva, §71.3), cambiar el perfil de un borrador ya creado, migraciones de base de datos.

## 3. Decisiones

| ID | Decision | Estado |
|---|---|---|
| D-1 | El recibo manual admite PYG y USD; las demas monedas en el formulario quedan para FS-159 (BACKLOG FS-158, D-1 del usuario). La API de FS y FE admiten PYG, USD, EUR y BRL, las de la factura (`monedasFactura`), para que el recibo desde una factura en EUR o BRL salga en su moneda (decision del usuario del 2026-11-13, con FE). | Decidida (usuario, 2026-11-13) |
| D-2 | El recibo sale con el perfil del punto con que opera el usuario (`fiscal_context.perfil_emision_codigo`), salvo `NO_REQUERIDO` o con `FE_SEND_EMISSION_PROFILE_CODE=false`, igual que la factura. La actividad que ya se manda sale del mismo contexto, asi que perfil y actividad coinciden. | Decidida (usuario, 2026-11-13) |
| D-3 | Editar un borrador no cambia su perfil ni su actividad: el `PATCH` a FE no manda `emission_profile_code` ni `actividad_economica_codigo` (FE deja los dos como estaban, §71.5). El borrador queda en el punto donde se creo, como ya queda `actividad_punto_perfil_id`. Hoy el `PATCH` manda la actividad del contexto; con el perfil, eso podria dar `ACTIVITY_PROFILE_MISMATCH` si el usuario cambio de punto. | Decidida (usuario, 2026-11-13) |
| D-5 | Ya decididas en FS-158: el recibo se parametriza por perfil de emision con la plantilla comun de FE y la cabecera del perfil; la numeracion sigue el correlativo de FE por emisor (FS-160); los recibos ya emitidos no se tocan. | Decidida (usuario, 2026-11-13) |
| D-4 | El recibo desde una factura (`POST /facturas/{id}/recibo`) hereda la moneda de la factura y el importe de su total, como hoy. En el formulario, al editar un borrador que referencia una factura, la moneda no se puede cambiar. | Decidida (usuario, 2026-11-13) |

## 4. Reglas

- **RN-01 Moneda.** `moneda` es una de `PYG`, `USD`, `EUR`, `BRL`; sin el campo, `PYG`. Otra moneda: 400 `VALIDATION_ERROR` en FS con `path: ["moneda"]`, sin llamar a FE.
- **RN-02 Importe.** Mayor que cero. En `PYG`, entero. En `USD`, `EUR` y `BRL`, hasta 2 decimales. Fuera de regla: 400 `VALIDATION_ERROR` con `path: ["importe"]`, sin llamar a FE. En la edicion la regla se controla sobre el recibo resultante (moneda nueva o la del borrador, con el importe nuevo o el del borrador), igual que FE (§71.3).
- **RN-03 Perfil al crear.** Segun D-2. Sin perfil todo funciona como en v0.5.
- **RN-04 Perfil al editar.** Segun D-3.
- **RN-05 Errores de FE.**
  - `422 EMISSION_PROFILE_NOT_AVAILABLE` → 422 "El perfil de emision de tu punto no esta disponible en el sistema fiscal. Avisa a soporte." Al emitir, el borrador queda sin numero.
  - `422 ACTIVITY_PROFILE_MISMATCH` → 422 "La actividad del recibo no corresponde al perfil de tu punto. Avisa a soporte."
  - `422 VALIDATION_ERROR` de FE con `details[].path` `["moneda"]` o `["importe"]` → 422 con el texto de RN-01 o RN-02 (no deberia ocurrir con RN-01/RN-02 de FS; queda como respaldo).
- **RN-06 Pantalla.**
  - El formulario muestra "Moneda" antes de "Importe", con las opciones "Guaraníes (Gs.)" y "Dólares (USD)", y guaraníes por defecto. Si se edita un borrador en EUR o BRL (desde factura), la opcion de esa moneda se muestra y el selector queda fijo (D-4).
  - La etiqueta del importe sigue la moneda ("Importe (USD)").
  - Al cambiar a guaranies, el importe pierde los decimales; al cambiar a otra moneda, el importe queda como esta.
  - Lista, ficha y verificacion publica muestran el importe con `formatMonto` (ya vigente: "USD 150,50").
  - El mensaje de error del importe aparece junto al campo.
- **RN-07 Respuesta de FS.** `ReciboRecord` suma `emission_profile_code` (string o null), leido de la ultima respuesta de FE guardada. Sin migracion: sale de `fiscal_response_snapshot`.

## 5. Criterios de aceptacion

- **CA-01:** Un recibo suelto en USD por 150,50, emitido, se ve como "USD 150,50" en la lista y en la ficha; el PDF de FE lo muestra en USD, con el monto en letras en dolares y la cabecera del perfil del punto.
- **CA-02:** El selector solo ofrece Gs. y USD. Un recibo desde una factura a credito en EUR (o BRL) sale en esa moneda con 2 decimales, y al editarlo la moneda no se puede cambiar.
- **CA-03:** En PYG el campo no admite decimales; la API rechaza `importe: 1500.5` con `moneda: PYG` (400, `path ["importe"]`) y `moneda: GBP` (400, `path ["moneda"]`), sin llamar a FE.
- **CA-04:** Un `PATCH` que cambia la moneda de USD a PYG con importe 150,50 se rechaza (400, `path ["importe"]`).
- **CA-05:** Crear un recibo manda a FE el `emission_profile_code` del punto. Con `NO_REQUERIDO` no lo manda. Editar no manda perfil ni actividad (D-3).
- **CA-06:** `EMISSION_PROFILE_NOT_AVAILABLE` y `ACTIVITY_PROFILE_MISMATCH` muestran el mensaje de RN-05, no un error generico.
- **CA-07:** El recibo desde una factura a credito en USD sale en USD por el total de la factura, con el perfil del punto.
- **CA-08:** Un FE sin v0.56 (rc4.37.1) sigue funcionando con FS v0.6: ignora el campo de perfil y acepta las cuatro monedas.
- **CA-09:** El formulario se ve bien en 1440, 1280 y 390 px.
