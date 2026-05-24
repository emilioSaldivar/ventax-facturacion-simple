# PLAN Autogestion Avanzada Soporte v0.1

## Enfoque

Implementar modulo de soporte interno separado del flujo comercial:

1. API SaaS de soporte (proxy controlado + normalizacion de errores FE).
2. UI de soporte condicionada por rol y contexto.
3. Auditoria de acciones y evidencia trazable.

## Fases

1. Contrato API SaaS soporte y normalizacion de respuestas.
2. Permisos por rol (`SOPORTE_INTERNO`, `ADMIN_INTERNO`).
3. UI operativa de decision y accion.
4. Guardrails de ventana y validaciones previas obligatorias.
5. QA e2e con casos `REJECTED` dentro/fuera de ventana.

## Seguridad

- Nunca exponer CSC, passwords ni material sensible de certificados.
- Registrar request/response resumido evitando payloads sensibles completos.
