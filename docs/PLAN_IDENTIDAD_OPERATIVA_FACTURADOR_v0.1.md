# PLAN Identidad Operativa Facturador v0.1

## Referencias

- `AGENTS.md`
- `docs/SPEC_IDENTIDAD_OPERATIVA_FACTURADOR_v0.1.md`
- `docs/SPEC_PRODUCTO_MVP_v0.1.md`
- `docs/PLAN_IMPLEMENTACION_MVP_v0.1.md`
- `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`
- `spec/openapi.yaml`

## Enfoque

Agregar una capa de identidad operativa por facturador sin cambiar los datos fiscales oficiales usados para emitir.

La solucion debe distinguir:

- datos fiscales: razon social, RUC, actividad economica oficial;
- datos operativos/UX: nombre fantasia, alias de actividad, titulo visible.

## Modelo De Datos

Revisar el modelo actual de:

- `facturadores`;
- `facturador_actividades`;
- `actividad_punto_perfiles`;
- contexto operativo de usuario.

Campos candidatos:

- `facturadores.nombre_fantasia`;
- `facturadores.alias_operativo`;
- `facturador_actividades.alias_operativo`;
- campo derivado `titulo_operativo` en la respuesta de contexto.

Decision recomendada:

1. permitir alias general del facturador;
2. permitir alias por actividad economica cuando el mismo facturador tenga mas de una actividad;
3. calcular `titulo_operativo` en backend para que el frontend no replique reglas de negocio.

## Contrato HTTP

Extender `GET /me/context` o endpoint equivalente para devolver:

- `facturador.nombre_fantasia` o equivalente, si existe;
- `fiscal_context.actividad_economica_alias` o equivalente, si existe;
- `display.titulo_operativo` o campo equivalente simple.

Si se agrega campo nuevo, actualizar `spec/openapi.yaml` y tipos frontend/backend.

## UI

Pantalla principal:

- usar `titulo_operativo` como `h1`;
- mostrar razon social y RUC como texto secundario;
- mostrar actividad economica activa en una linea clara;
- no repetir la misma informacion en bloques grandes;
- mantener el acceso directo a emision sin scroll innecesario.

Editor de factura:

- usar titulo operativo de forma compacta cuando ayude al operador;
- mantener datos fiscales oficiales disponibles pero secundarios.

## Backoffice / Alta Manual

El alta de facturador debe permitir registrar o confirmar:

- razon social fiscal;
- RUC;
- nombre fantasia si aplica;
- actividad economica principal;
- alias operativo de la actividad si aplica.

El checklist manual debe reflejar estos datos para evitar que un facturador quede con encabezado poco claro.

## Validacion

Validaciones esperadas:

- tests de contexto que cubran fallback de titulo operativo;
- tests de que razon social/RUC fiscales no cambian por alias;
- typecheck y build del frontend;
- Playwright mobile verificando que la pantalla principal muestra el titulo operativo y actividad economica;
- smoke de emision para confirmar que el alias no altera payload fiscal.
