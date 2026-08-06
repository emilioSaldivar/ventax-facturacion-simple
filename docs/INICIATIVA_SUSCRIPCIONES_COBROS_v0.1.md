# INICIATIVA — Gestión de Suscripciones y Cobros v0.1

**Fecha de registro:** 2026-07-31
**Estado:** PENDIENTE DE REFINAMIENTO — no implementar todavía
**Precondición:** completar primero el trabajo de alineación con facturacion-electronica (`docs/SPEC_BACKOFFICE_ALINEACION_FE_v0.1.md`)

---

## Objetivo de negocio

Alinear la tecnología a los planes comerciales de Ventax: gestionar las suscripciones de los tenants para realizar los cobros, armar la operativa de cobranza y automatizarla (reportes, notificaciones, bloqueos por impago).

## Qué existe hoy (punto de partida)

- Tabla `tenant_suscripciones` con plan, estado y vigencia; catálogo de planes con gestión en backoffice (`GET /backoffice/planes`, selección de plan al crear tenant).
- El readiness operativo ya bloquea la emisión cuando la suscripción no está al día (`suscripcion_al_dia` en `web-operacion`), pero el estado de la suscripción se cambia **a mano**.
- No existe: ciclo de facturación de la suscripción, registro de pagos/cobros del tenant, vencimientos, notificaciones, ni bloqueo automático.

## Alcance tentativo (a refinar)

1. **Parametrización de cobro por plan/tenant**: día de cobro, periodicidad, monto, moneda, período de gracia.
2. **Ciclo de cobranza**: generación automática de vencimientos/cuotas por período; registro de pagos (manual primero; conciliación bancaria después si aplica).
3. **Notificaciones**: aviso de vencimiento próximo, vencido y suspensión inminente (email vía el servicio existente; evaluar WhatsApp).
4. **Bloqueo automático por impago**: pasado el período de gracia, transición automática de la suscripción a estado moroso/suspendido — el readiness existente ya haría efectivo el bloqueo operativo sin cambios en web-operacion.
5. **Reactivación**: al registrar el pago, reactivación automática o con aprobación.
6. **Reportes para cobranza**: vista/export en backoffice de qué tenants deben, cuánto y desde cuándo; resumen periódico automático por email al equipo.
7. **Auditoría**: historial de cambios de estado de suscripción con actor y motivo.

## Preguntas abiertas para el refinamiento

- ¿Los cobros a tenants se documentan con recibos de dinero firmados de nuestro propio facturador (dogfooding del módulo recibos) o con factura electrónica?
- ¿Medios de pago a soportar y si hay conciliación automática (transferencia, pasarela)?
- ¿El bloqueo es total (no emitir) o degradado (solo lectura)? ¿Con cuántos días de gracia por defecto?
- ¿Quién recibe las notificaciones del tenant (email del admin del tenant vs contacto comercial)?
- Definición final de los planes comerciales (hoy el catálogo es mínimo).

## Siguiente paso

Sesión de refinamiento → SPEC → PLAN → TASKS (flujo SDD), recién después implementación.
