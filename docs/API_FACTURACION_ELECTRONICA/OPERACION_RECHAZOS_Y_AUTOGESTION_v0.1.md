# OPERACION RECHAZOS Y AUTOGESTION v0.1

## 1. Proposito

Definir la operativa diaria para documentos rechazados por SIFEN, con foco en:

- evitar acciones incorrectas,
- guiar al operador con lenguaje simple,
- mantener trazabilidad completa,
- alinear el flujo con Manual Tecnico v150.

## 2. Alcance funcional actual

### Implementado

- Diagnostico por documento (`decision`).
- Prevalidacion CDC (`validate-cdc-impact`).
- Reintento preservando CDC (`retry-same-cdc`).
- Reenvio manual (`resend`).
- Inutilizacion puntual de numeracion (`void-number`).
- Creacion de DE derivado (`create-derived`).
- Panel de eventos por documento (`eventos`).
- `sync` consulta SIFEN sin reenvio automatico de correo cuando `email_status` es terminal (`SENT`, `FAILED`, `NOT_APPLICABLE`).
- Alerta por email al correo principal del facturador cuando el documento queda `REJECTED`.
- Alerta por ventana de regularizacion:
  - dentro de 72h,
  - fuera de 72h.

### Pendiente (iteracion futura)

- Prevalidacion formal de impacto CDC (`CDC_NO_CHANGE` / `CDC_CHANGE`) como endpoint dedicado.
- Accion dedicada `retry-same-cdc`.
- Accion `create-derived` para nuevo DE derivado.
- Lista adicional de emails de alerta por facturador con validacion Zod.

## 3. Base operativa MT150 aplicada

- Ventana general de transmision: 72 horas desde firma digital.
- Rechazo:
  - si correccion no cambia base CDC: reintentar manteniendo CDC,
  - si correccion cambia CDC: inutilizar numeracion y emitir nuevo DE.
- Cancelacion fiscal:
  - solo para documentos existentes/aprobados en SIFEN,
  - ventana de 48 horas desde aprobacion.
- Inutilizacion de numeracion:
  - hasta 15 dias (360 horas),
  - rango maximo 1000,
  - motivo obligatorio.

## 4. Politica de correo y sync

### Regla vigente

`Lanzar sync` no debe reenviar correo fiscal por defecto cuando el documento ya esta cerrado en terminos de email.

### Comportamiento

- `email_status=SENT`: no reenvia.
- `email_status=FAILED`: no reintenta en sync.
- `email_status=NOT_APPLICABLE`: no reintenta en sync.
- `email_status=NULL` o `PENDING`: puede ejecutar entrega fiscal normal.

## 5. Alerta de rechazo al facturador

### Destinatario

- Email principal del facturador (establecimiento/emisor configurado).

### Contenido

- Mensaje no tecnico y accionable.
- Referencia de documento para soporte.
- Recomendacion de actuar desde panel operativo.

### Dedupe

Se evita duplicado por idempotencia de alerta:

- `REJECT_ALERT:<documentId>:WITHIN_72H`
- `REJECT_ALERT:<documentId>:OVER_72H`

## 6. Flujo operativo recomendado para REJECTED

1. Abrir documento rechazado en panel.
2. Revisar causa visible y contexto del cliente.
3. Usar `decision` para evaluar siguiente paso.
4. Ejecutar `validate-cdc-impact`.
5. Si `CDC_NO_CHANGE`: usar `retry-same-cdc`.
6. Si `CDC_CHANGE`: inutilizar numeracion y luego `create-derived`.
7. Revisar `eventos` para auditoria y estado final.

## 7. Casuisticas frecuentes

### Caso A: codigo 0420 (no existe en SIFEN o rechazado)

- Tratar como rechazo no regularizado.
- No asumir aprobacion por solo existir localmente.
- Regularizar de inmediato si esta en ventana.

### Caso B: rechazo dentro de 72h

- Prioridad alta de regularizacion.
- Mantener contacto con cliente final.
- Resolver con reintento controlado o plan de reemplazo.

### Caso C: rechazo fuera de 72h

- Escalar operativamente.
- Definir estrategia interna con evidencia.
- Si aplica, inutilizar y reemitir conforme politica fiscal interna.

## 8. Uso de la herramienta (operador)

### Vista listado de facturas

- Filtrar por `REJECTED`.
- Revisar fecha de emision y semaforo de ventana.
- Priorizar casos cercanos al vencimiento de 72h.

### Vista detalle de factura

- Boton `Inutilizar numeracion` con popup de confirmacion.
- Seccion de eventos para auditoria (cancelacion/inutilizacion y respuestas).
- Acciones de reenvio solo cuando corresponda.

## 9. Guardrails de inutilizacion

- No inutilizar numeraciones aprobadas/usadas en SIFEN.
- Respetar secuencia y rango <= 1000.
- Respetar ventana de 15 dias.
- Motivo obligatorio y claro.

## 10. Auditoria y trazabilidad

Toda accion debe quedar trazada con:

- quien ejecuto,
- cuando,
- motivo,
- request/response,
- resultado final.

Fuentes de auditoria:

- `de_send_attempts` (envios, consultas, alertas),
- `de_events` (eventos fiscales),
- historial en detalle de factura.

## 11. Checklist operativo diario

1. Ejecutar sync de estado segun ventana operativa.
2. Revisar rechazados nuevos.
3. Priorizar <=72h.
4. Confirmar que no haya reenvios de correo no deseados en sync.
5. Validar alertas emitidas al facturador.
6. Cerrar casos con evidencia en eventos.

## 12. Notas de implementacion para equipo tecnico

- Alerta de rechazo actual usa correo principal del facturador.
- Emails adicionales por coma quedan para fase futura.
- Flujo CDC completo (validacion formal + retry same CDC + create derived) sigue en backlog.
