# SPEC Estabilizacion para la salida de Segel v0.1

**Fecha:** 2026-11-06 · **Rama:** `feat/identidad-segel`. Lo que sirva a `master` se aplica alli por separado.

## Objetivo

Dejar FS estable para desplegar en produccion, corrigiendo lo que puede danar datos fiscales o exponer secretos. El reparto fue definido por el usuario: FE se ocupa del correo de comprobantes y de su prueba de sobrecarga; FS, del OTP.

## Corregido

| ID | Problema | Correccion |
|---|---|---|
| E-01 | El OTP quedaba en texto plano en los logs si fallaba el correo | No se registra el contenido |
| E-02 | Los encabezados de clave de API no se ocultaban en logs | `x-api-key`, `api-key` y `x-consumer-key` ocultos |
| FS-11 | Una factura anulada podia volver a verse emitida, con FE-02 sin corregir en `segel-rc1` | Un documento anulado no consulta SIFEN con refresh y se conserva anulado |
| FS-14 | Con FE inalcanzable, KuDE respondia 500 | 502 o 504, con un mensaje de servicio |
| FS-07 | Una factura aprobada seguia "Procesando" hasta 15 min mas, con el documento en cola de FE | Con el documento en cola, se vuelve a consultar cada 5 min |
| E-03 | 6 pruebas fallaban: quedaron viejas tras cambios deliberados, entre ellos RN-F1-1.3 y RN-F1-1.6 | Actualizadas; no eran regresiones |
| E-04 | Faltaba la ciudad en los T&C | Asuncion |
| FS-20 | Tras un refresh, FS guardaba `0420` y perdia la causa real del rechazo | Lee el motivo original en `/documentos/{uuid}/sifen`. Solo funciona con el fix H09 de FE: antes, ese motivo se pierde. Sin desplegar |
| FS-21 | `0422` se tomaba como aprobado aunque el documento estuviera cancelado | El estado manda sobre el codigo. Sin desplegar |
| FS-23 | Ante `0100`, el operador podia reintentar enseguida; un caso de FE se acepto a los 59 s | Mensaje: esperar un minuto. Registra segundos desde la creacion del documento para que FE confirme o descarte la hipotesis. Sin desplegar |

## Pendiente, sin corregir

| ID | Riesgo | Motivo |
|---|---|---|
| FS-17 | Un facturador sobrescribe la razon social global de un documento, y otro puede verla | Requiere definir que identidad es global. Antes de cargar clientes reales |
| FS-05 | Un cliente con mucho volumen demora a todos | Hipotesis, a medir |
| FS-06, FS-16 | Mensajes confusos con clave invalida | No afecta datos |
| FS-08 | Cancelar usa el CDC local | Hipotesis |
| FS-15 | Acciones de compartir sin numero fiscal | Hipotesis |
| FE-02, FE-04, FE-07, FE-09 | Defectos de FE sin corregir en `segel-rc1` | Responsabilidad de FE |
| Backups | Sin backups automaticos | Pospuestos por el usuario; antes de datos reales |
