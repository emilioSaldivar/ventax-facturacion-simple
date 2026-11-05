# PLAN Búsqueda de clientes entre facturadores v0.1

- `clientes.repository.ts`, `search()`, CTE `compartida`: comparar `ci.documento_normalizado = $5` con el documento normalizado, sin `ilike`, y devolver `null` en los tres campos de contacto.
- `spec/openapi.yaml`: documentar RN-02 y RN-03 en `/clientes/search`. El esquema no cambia, porque los campos ya son `nullable`.
- Pruebas: integración en Postgres, con `DATABASE_URL_TEST`; y `isolation.cjs` sobre un stack aislado.

**Riesgo:** quien buscaba un cliente ajeno por nombre deja de encontrarlo y lo carga a mano. Es el comportamiento buscado.
