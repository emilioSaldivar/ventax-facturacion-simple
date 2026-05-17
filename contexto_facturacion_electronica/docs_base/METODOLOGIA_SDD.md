# METODOLOGIA SDD — Spec-Driven Development

## Proposito

Este repositorio adopta **Spec-Driven Development (SDD)** como forma de trabajo obligatoria para cambios funcionales, tecnicos y operativos con impacto en producto, arquitectura, contratos o datos.

La secuencia oficial de trabajo es:

1. `SPEC`
2. `PLAN`
3. `TASKS`
4. `IMPLEMENT`

## Regla Central

No se inicia implementacion sin pasar antes por documentacion suficiente.

Esto aplica a:

- nuevas features,
- cambios de comportamiento,
- endpoints nuevos o modificados,
- migraciones,
- integraciones SIFEN,
- cambios operativos del backend,
- cambios relevantes del frontend administrativo.

## Definicion De Cada Artefacto

### SPEC

El `SPEC` define **que** problema se resuelve y **que** comportamiento final se espera.

Debe incluir como minimo:

- objetivo,
- alcance,
- fuera de alcance,
- reglas de negocio,
- contratos esperados,
- casos felices,
- errores relevantes,
- restricciones,
- impacto sobre estados o entidades,
- criterios de aceptacion.

### PLAN

El `PLAN` define **como** se implementara el `SPEC`.

Debe incluir como minimo:

- estrategia tecnica,
- modulos afectados,
- cambios de modelo de datos,
- cambios de API,
- validaciones,
- decisiones de arquitectura,
- riesgos,
- orden recomendado de implementacion,
- estrategia de testing.

### TASKS

`TASKS` traduce el `PLAN` a trabajo ejecutable y verificable.

Cada tarea debe ser:

- atomica,
- concreta,
- comprobable,
- trazable a `SPEC` y `PLAN`.

Cada tarea debe tener estado visible. Se recomienda usar:

- `PENDING`
- `PARTIAL`
- `DONE`

## Flujo Obligatorio

### 1. Antes De Implementar

- identificar si ya existe `SPEC`,
- identificar si ya existe `PLAN`,
- identificar si ya existe `TASKS`,
- validar que no esten desalineados entre si,
- actualizar esos documentos si el alcance real cambio.

### 2. Durante La Implementacion

- implementar solo lo cubierto por la documentacion vigente,
- actualizar `TASKS` a medida que se cierra trabajo real,
- actualizar `PLAN` si cambia la solucion tecnica adoptada,
- actualizar `SPEC` si cambia el alcance funcional acordado.

### 3. Al Cerrar

- dejar el estado real reflejado en `TASKS`,
- dejar evidencia tecnica en codigo, tests, OpenAPI o migraciones,
- alinear la documentacion con la implementacion final.

## Convencion De Nombres

Para cada iniciativa se deben crear, como minimo, estos archivos:

- `docs/SPEC_<tema>_v0.1.md`
- `docs/PLAN_<tema>_v0.1.md`
- `docs/TASKS_<tema>_v0.1.md`

Ejemplos:

- `docs/SPEC_MVP_v0.1.md`
- `docs/PLAN_MVP_v0.1.md`
- `docs/TASKS_MVP_v0.1.md`

## Regla De Versionado Documental

- usar sufijo de version cuando el documento represente una iteracion formal,
- actualizar la misma version si el cambio es menor y aun no hay corte estable,
- abrir nueva version cuando cambie el alcance de forma importante o se quiera preservar una baseline previa.

## Relacion Con OpenAPI

Si el cambio afecta endpoints, payloads, errores o respuestas:

- el `SPEC` debe describir el comportamiento esperado,
- el `PLAN` debe explicar la estrategia tecnica,
- `spec/openapi.yaml` debe reflejar el contrato final.

OpenAPI no reemplaza a `SPEC`, `PLAN` ni `TASKS`; los complementa.

## Checklist Minimo Antes De Codificar

- existe `SPEC` aplicable,
- existe `PLAN` aplicable,
- existe `TASKS` aplicable,
- el cambio esta dentro del alcance documentado,
- el contrato API esta identificado si corresponde,
- la estrategia de pruebas esta definida.

## Checklist Minimo Antes De Cerrar

- codigo implementado,
- tests agregados o ajustados,
- `TASKS` actualizado,
- `PLAN` consistente con la solucion final,
- `SPEC` consistente con el comportamiento final,
- `spec/openapi.yaml` alineado si aplica.

## Regla Para Agentes

Cualquier agente que participe en este repositorio debe tratar esta metodologia como norma de trabajo y no como recomendacion.

Si recibe una solicitud ambigua, debe:

- ubicar la documentacion existente,
- detectar vacios,
- proponer o realizar primero la actualizacion documental,
- y solo despues implementar.
