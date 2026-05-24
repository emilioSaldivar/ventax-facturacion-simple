# SPEC Autogestion Avanzada Soporte v0.1

## Objetivo

Habilitar autogestion avanzada de documentos rechazados para roles internos (`SOPORTE_INTERNO`, `ADMIN_INTERNO`), sin exponer complejidad tecnica al operador comercial.

## Alcance

- Flujos de regularizacion sobre documentos con rechazo o inconsistencia fiscal.
- Uso de endpoints admin de `facturacion-electronica` para decision y correccion operativa.
- Guardrails de ventana y auditoria obligatoria.

Fuera de alcance:

- Exposicion de estas acciones al rol `OPERADOR_FACTURACION`.
- Automatismos que emitan/reenvien sin accion explicita de soporte.

## Endpoints FE Objetivo

- `decision`
- `validate-cdc-impact`
- `retry-same-cdc`
- `create-derived`
- `void-number`
- `cancel-send`
- `eventos`

## Reglas Operativas

- Ventana de regularizacion: 72 horas.
- Cancelacion fiscal: 48 horas.
- Inutilizacion numeracion: 15 dias, rango maximo 1000.
- Toda accion requiere motivo y confirmacion explicita.

## Auditoria Minima

- actor
- timestamp
- motivo
- request/response resumido
- resultado final

## Referencias

- `docs/API_FACTURACION_ELECTRONICA/OPERACION_RECHAZOS_Y_AUTOGESTION_v0.1.md`
- `docs/API_FACTURACION_ELECTRONICA/openapi.yaml`
