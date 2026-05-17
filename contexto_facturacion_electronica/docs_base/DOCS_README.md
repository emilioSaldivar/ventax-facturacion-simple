# Documentacion Del Repositorio

## Proposito

Este directorio concentra la documentacion funcional, tecnica y operativa del proyecto.

La metodologia oficial del repositorio es **Spec-Driven Development**, con la secuencia:

1. `SPEC`
2. `PLAN`
3. `TASKS`
4. `IMPLEMENT`

Referencia principal: `docs/METODOLOGIA_SDD.md`.

## Documentos Base

- `docs/METODOLOGIA_SDD.md`: norma de trabajo del repositorio.
- `AGENTS.md`: contexto global, reglas operativas y forma de colaboracion esperada para cualquier agente.
- `docs/SPEC_MVP_v0.1.md`: alcance funcional principal del MVP.
- `docs/PLAN_MVP_v0.1.md`: diseno tecnico principal del MVP.
- `docs/TASKS_MVP_v0.1.md`: backlog y estado de implementacion del MVP.
- `spec/openapi.yaml`: contrato API vigente.
- `docs/OPERACION_GIT_DEPLOY.md`: reglas de operacion local, servidor y deploy.

## Convencion De Trabajo

Para cada iniciativa relevante se debe mantener una terna documental:

- `SPEC_<tema>_vX.Y.md`
- `PLAN_<tema>_vX.Y.md`
- `TASKS_<tema>_vX.Y.md`

Ejemplos actuales:

- `SPEC_NCE_CREDITO_v0.1.md` / `PLAN_NCE_CREDITO_v0.1.md` / `TASKS_NCE_CREDITO_v0.1.md`
- `SPEC_FRONTEND_MVP_v0.1.md` / `PLAN_FRONTEND_MVP_v0.1.md` / `TASKS_FRONTEND_MVP_v0.1.md`
- `SPEC_WEB_APP_MULTI_FACTURADOR_v0.1.md` / `PLAN_WEB_APP_MULTI_FACTURADOR_v0.1.md` / `TASKS_WEB_APP_MULTI_FACTURADOR_v0.1.md`
- `SPEC_TICKET_TERMICO_v0.1.md` / `PLAN_TICKET_TERMICO_v0.1.md` / `TASKS_TICKET_TERMICO_v0.1.md`

## Regla Operativa

Si un cambio no tiene suficiente respaldo documental, primero se debe documentar y despues implementar.

Orden obligatorio:

1. definir o actualizar `SPEC`,
2. definir o actualizar `PLAN`,
3. definir o actualizar `TASKS`,
4. implementar,
5. validar y dejar evidencia.

## Tipos De Documentos En Este Directorio

- `SPEC_*`: definicion funcional y criterios de aceptacion.
- `PLAN_*`: diseno tecnico y estrategia de ejecucion.
- `TASKS_*`: descomposicion de trabajo y seguimiento de estado.
- `DEPLOY_*` u operativos: procedimientos de despliegue, endurecimiento o infraestructura.
- modelos/disenos complementarios: soporte de arquitectura o datos.

## Nota De Mantenimiento

Cuando cambie el alcance, la arquitectura o el estado real del trabajo, esta carpeta debe actualizarse junto con el codigo afectado.
