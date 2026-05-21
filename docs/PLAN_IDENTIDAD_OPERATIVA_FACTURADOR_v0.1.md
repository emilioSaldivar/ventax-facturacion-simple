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

El nombre fantasia y los alias son exclusivamente datos de visualizacion/UX del SaaS. No se envian como reemplazo de razon social ni modifican el contrato con `fe-api`.

La solucion debe distinguir:

- datos fiscales: razon social, RUC, actividad economica oficial, establecimiento, punto, timbrado y perfil;
- datos operativos/UX: nombre fantasia, alias por actividad/perfil y titulo visible.

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
- `actividad_punto_perfiles.alias_operativo` o entidad equivalente cuando el alias dependa de actividad + perfil;
- campo derivado `titulo_operativo` en la respuesta de contexto.

Decision recomendada:

1. permitir nombre fantasia general del facturador para UX;
2. permitir alias por actividad economica/perfil cuando el mismo facturador tenga mas de un contexto de emision;
3. resolver el alias desde el contexto operativo asignado al usuario;
4. calcular `titulo_operativo` en backend para que el frontend no replique reglas de negocio.

## Contrato HTTP

Extender `GET /me/context` o endpoint equivalente para devolver:

- `facturador.nombre_fantasia` o equivalente, si existe;
- `fiscal_context.actividad_economica_alias` o equivalente, si existe;
- `fiscal_context.perfil_emision_alias` o alias combinado actividad/perfil si se modela asi;
- `display.titulo_operativo` o campo equivalente simple.

Si se agrega campo nuevo, actualizar `spec/openapi.yaml` y tipos frontend/backend.

No se modifica el contrato server-to-server con `fe-api`. La integracion fiscal debe seguir enviando los campos oficiales ya definidos por el gateway fiscal.

## UI

Pantalla principal:

- usar `titulo_operativo` como `h1`;
- mostrar razon social y RUC como texto secundario;
- mostrar actividad economica activa en una linea clara;
- mostrar el perfil/contexto de emision cuando ayude a diferenciar actividades habilitadas;
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
- perfil de emision asociado;
- alias operativo de la actividad/perfil si aplica.

El checklist manual debe reflejar estos datos para evitar que un facturador quede con encabezado poco claro.

## Validacion

Validaciones esperadas:

- tests de contexto que cubran fallback de titulo operativo;
- tests de resolucion de titulo por actividad economica/perfil asignado al usuario;
- tests de que razon social/RUC fiscales no cambian por alias;
- typecheck y build del frontend;
- Playwright mobile verificando que la pantalla principal muestra el titulo operativo y actividad economica;
- smoke de emision para confirmar que el alias no altera payload fiscal.
