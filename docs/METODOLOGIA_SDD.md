# METODOLOGIA SDD - Spec-Driven Development

## Proposito

Este repositorio adopta Spec-Driven Development como forma obligatoria para iniciar y evolucionar el producto.

La secuencia oficial es:

1. `SPEC`
2. `PLAN`
3. `TASKS`
4. `IMPLEMENT`

## SPEC

Define que problema se resuelve y que comportamiento final se espera.

Debe incluir:

- objetivo;
- alcance;
- fuera de alcance;
- usuarios o actores;
- reglas de negocio;
- entidades afectadas;
- contratos esperados;
- casos felices;
- errores relevantes;
- criterios de aceptacion.

## PLAN

Define como se implementara el SPEC.

Debe incluir:

- estrategia tecnica;
- arquitectura;
- modulos afectados;
- modelo de datos;
- cambios de API;
- integraciones;
- validaciones;
- riesgos;
- orden de implementacion;
- estrategia de testing.

## TASKS

Traduce el PLAN a una matriz de trabajo atomica y verificable.

Cada tarea debe tener:

- ID estable;
- etapa;
- descripcion;
- trazabilidad a SPEC/PLAN;
- estado;
- criterio de aceptacion;
- evidencia de cierre cuando pase a `DONE`.

Estados permitidos:

- `PENDING`
- `PARTIAL`
- `DONE`
- `BLOCKED`

## Regla Antes De Codificar

Antes de tocar codigo debe existir:

- `SPEC` aplicable;
- `PLAN` aplicable;
- `TASKS` aplicable;
- contrato API identificado si corresponde;
- estrategia de pruebas definida.

Si falta algo, se documenta primero.

## Regla Durante La Implementacion

Durante el trabajo:

- implementar solo lo cubierto por la documentacion vigente;
- actualizar `TASKS` al cerrar trabajo real;
- actualizar `PLAN` si cambia la solucion tecnica;
- actualizar `SPEC` si cambia el alcance funcional.

## Regla De Cierre

Antes de cerrar:

- codigo implementado si aplica;
- pruebas agregadas o justificadas;
- matriz de tareas actualizada;
- `SPEC` y `PLAN` alineados con la realidad;
- OpenAPI actualizado si aplica.
