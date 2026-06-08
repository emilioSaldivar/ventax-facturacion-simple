# OPERACION EVENTOS FISCALES v0.1

## 1. Proposito

Guia de operacion diaria para eventos fiscales SIFEN:
- cancelacion de documentos aprobados,
- inutilizacion de numeracion no utilizada,
- seguimiento y refresco de estado de eventos.

Complementa `OPERACION_RECHAZOS_Y_AUTOGESTION_v0.1.md` (rechazos y reintento de DEs).

## 2. Tipos de evento soportados

| Tipo | Codigo SIFEN | Accion | Restriccion principal |
|------|-------------|--------|-----------------------|
| Cancelacion | `CANCEL` | Anular DE aprobado en SIFEN | Ventana 48 horas desde aprobacion |
| Inutilizacion de numeracion | `VOID_RANGE` | Marcar numeracion como no utilizada | Ventana 15 dias (360 horas), rango max 1000 |

## 3. Cancelacion fiscal

### 3.1 Cuando aplica

- El DE fue aprobado por SIFEN (`APPROVED`).
- Han transcurrido menos de 48 horas desde la aprobacion.
- Se necesita anular la operacion comercial completa.

### 3.2 Cuando NO aplica

- El DE esta en estado `REJECTED`, `PENDING`, `DRAFT` — no existe en SIFEN, no se cancela.
- Han pasado mas de 48 horas desde la aprobacion — usar NCE como alternativa (ver `SPEC_NCE_CREDITO_v0.1.md`).
- La cancelacion ya fue enviada para ese CDC — no se duplica.

### 3.3 Endpoint

```
POST /evento/cancelar
```

Cuerpo minimo:
```json
{
  "cdc": "<cdc-del-de>",
  "motivo": "<texto-libre-del-motivo>"
}
```

### 3.4 Estados posibles del evento post-envio

| Estado local | Significado | Accion recomendada |
|-------------|-------------|-------------------|
| `PENDING` | Enviado, esperando respuesta SIFEN | Refrescar estado |
| `ACCEPTED` | Cancelacion aceptada por SIFEN | Ninguna |
| `REJECTED` | Rechazada por SIFEN | Revisar motivo; evaluar si hay correccion posible |
| `ERROR` | Error de comunicacion o estructura | Refrescar o reintentar |

### 3.5 Guardrails MT150

- La cancelacion solo es valida dentro de la ventana de 48 horas desde la fecha de aprobacion del DE original.
- El sistema notifica `NCE_REQUIRED` cuando el documento esta `APPROVED` pero fuera de ventana de 48 horas.
- No se puede cancelar un DE que ya tiene un evento de cancelacion en estado `ACCEPTED`.

## 4. Inutilizacion de numeracion

### 4.1 Cuando aplica

- Numeracion ya asignada que no fue utilizada (DE nunca emitido o emitido con error irrecuperable).
- El DE fue rechazado, la correccion cambia el CDC, y la numeracion original ya no puede reutilizarse.
- Numeracion perdida por falla tecnica antes de emision exitosa.

### 4.2 Cuando NO aplica

- El DE fue aprobado por SIFEN — no se inutiliza la numeracion, se cancela el evento.
- Ya transcurrieron mas de 15 dias (360 horas) desde la emision del timbrado.

### 4.3 Endpoint

```
POST /evento/inutilizacionnumfactura
```

Cuerpo minimo:
```json
{
  "emisorId": "<id-del-emisor>",
  "serie": "<serie>",
  "desde": <numero-desde>,
  "hasta": <numero-hasta>,
  "motivo": "<texto-libre-del-motivo>"
}
```

Restriccion: `hasta - desde + 1 <= 1000`.

### 4.4 Guardrails MT150

- Rango maximo 1000 numeros por request.
- Motivo es obligatorio y queda registrado en SIFEN.
- Ventana maxima 15 dias (360 horas) desde el timbrado de los numeros.

## 5. Seguimiento de estado de eventos

### 5.1 Consulta por CDC (publico/consumer)

```
GET /consultar/evento/{cdc}
```

Retorna estado actual del evento asociado al CDC en SIFEN.

### 5.2 Consulta por documento (admin)

```
GET /admin/emisores/{id}/facturas/{documentId}/eventos
```

Retorna lista de eventos asociados al documento con metadata local.

### 5.3 Refresco manual

Cuando un evento queda en `PENDING` o `ERROR`, el operador puede solicitar refresco:
- Puntual: usar `GET /consultar/evento/{cdc}` para verificar si SIFEN ya tiene resultado.
- Masivo (pendiente de implementacion): `POST /admin/emisores/{id}/eventos/refresh` — ver `TASKS_EVENTOS_ADMIN_v0.1.md`.

### 5.4 Criterio de elegibilidad para refresco

Un evento es elegible para refresco si:
- Estado local es `PENDING` o `ERROR`.
- No fue refrescado recientemente (umbral configurable).

## 6. Flujo de decision operativa

```
Documento APPROVED
    |
    +--- < 48h desde aprobacion? --> SI --> POST /evento/cancelar
    |
    +--- >= 48h desde aprobacion? --> SI --> Emitir NCE (alternativa fiscal)

Numeracion no utilizada
    |
    +--- < 15 dias desde timbrado? --> SI --> POST /evento/inutilizacionnumfactura
    |
    +--- >= 15 dias? --> Numeracion vencida, no se puede inutilizar

Evento en PENDING o ERROR
    |
    +--- Refrescar estado via GET /consultar/evento/{cdc}
    +--- Si persiste: escalar a soporte tecnico
```

## 7. Bandeja global de eventos (proxima iteracion)

Los siguientes endpoints estan en backlog (`TASKS_EVENTOS_ADMIN_v0.1.md`) y no estan disponibles aun:

- `GET /admin/emisores/{id}/eventos` — listado con filtros avanzados
- `POST /admin/emisores/{id}/eventos/refresh` — refresh masivo
- `POST /admin/emisores/{id}/eventos/{eventId}/refresh` — refresh puntual
- `GET /admin/emisores/{id}/eventos/{eventId}` — detalle con payload + respuesta SIFEN

Hasta que esten disponibles, usar los endpoints de consulta por documento descritos en seccion 5.

## 8. Restricciones de la capa core

- WhatsApp y notificaciones externas no son responsabilidad de esta capa.
- Personalizaciones por consumidor (templates, integraciones) quedan fuera del core.
- El evento de cancelacion crea trazabilidad fiscal; no sustituye flujos de negocio del consumidor.
