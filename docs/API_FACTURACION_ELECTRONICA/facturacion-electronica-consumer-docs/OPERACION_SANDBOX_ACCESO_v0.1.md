# OPERACION SANDBOX Y ACCESO DE PRUEBAS v0.1

## 1. Objetivo

Definir el flujo operativo para solicitar, habilitar y usar el ambiente de pruebas (`test`) del servicio core de facturación electrónica.

## 2. Alcance

Incluye:
- solicitud de acceso,
- habilitación de credenciales/API key de prueba,
- validación mínima de conectividad,
- guardrails de uso.

No incluye:
- despliegue productivo,
- cambios de código,
- soporte a integraciones externas no conectadas al core.

## 3. Flujo de solicitud de acceso sandbox

1. El equipo consumidor abre solicitud interna con:
   - nombre del sistema integrador,
   - responsable técnico,
   - correos de contacto,
   - RUC/emisor de pruebas a usar,
   - objetivo de pruebas (emisión, consulta, eventos, etc.).
2. El administrador de FE valida alcance y asigna:
   - API key de pruebas,
   - emisor/es permitidos,
   - entorno `test`.
3. El consumidor ejecuta smoke básico:
   - healthcheck,
   - consulta simple,
   - emisión de prueba controlada.
4. Si el smoke es OK, se habilita ventana de pruebas funcionales.

## 4. Guardrails operativos

- Usar solo ambiente `test`.
- No reutilizar credenciales de producción en sandbox.
- No exponer secretos en tickets, chats o logs compartidos.
- Mantener volumen de pruebas dentro de límites operativos acordados.
- Reportar errores con:
  - timestamp,
  - endpoint,
  - correlation/request id cuando exista,
  - payload mínimo reproducible.

## 5. Checklist de onboarding técnico

1. Base URL de sandbox confirmada.
2. API key válida entregada.
3. Emisor de prueba asignado.
4. Postman/cliente HTTP configurado.
5. Smoke de conectividad ejecutado.
6. Smoke funcional ejecutado.

## 6. Criterio de salida de sandbox a planificación productiva

Para pasar a planificación de salida productiva:
- smoke técnico y funcional en verde,
- validación de flujos críticos acordados,
- incidencias críticas cerradas o mitigadas,
- backlog de ajustes documentado en `SPEC/PLAN/TASKS` cuando aplique.
