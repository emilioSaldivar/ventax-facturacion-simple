# SPEC Búsqueda de clientes entre facturadores v0.1

**Fecha:** 2026-11-05. **Origen:** hallazgo FS-01 de `SPEC_VERIFICACION_CAPACIDAD_200_v0.1.md`, comprobado en stack aislado con el commit de producción.

## Alineación

- `AGENTS.md`: `facturador_id` es la clave de aislamiento operativo.
- `docs/SPEC_AGENDAS_CLIENTES_CATALOGO_v0.1.md` §4: búsqueda global **por documento**, para precargar.

## Problema

`GET /clientes/search` cae en la base global `cliente_identidades` buscando por fragmento de documento o de razón social, y devuelve dirección, teléfono y correo. Un operador lista clientes de otros facturadores con sus datos de contacto, escribiendo dos letras.

## Reglas

- **RN-01.** La agenda del propio facturador se sigue buscando por fragmento de documento o de razón social. No cambia.
- **RN-02.** La base global solo responde si el texto buscado, normalizado, es **igual** a `documento_normalizado`.
- **RN-03.** Un resultado de la base global devuelve `direccion`, `telefono` y `email` en `null`. Sigue devolviendo tipo, documento, razón social y naturaleza, porque precargan la identidad.
- **RN-04.** La UI no cambia: al aplicar la sugerencia, el operador completa los datos de contacto.

## Criterios de aceptación

- **CA-01.** Con `q` igual a un fragmento de razón social ajena, ningún resultado es de otro facturador.
- **CA-02.** Con `q` igual a un fragmento de documento ajeno, tampoco.
- **CA-03.** Con el documento exacto ajeno, un resultado `IDENTIDAD_COMPARTIDA` sin datos de contacto.
- **CA-04.** La agenda propia sigue encontrando por fragmento, con sus datos de contacto.
- **CA-05.** `scripts/carga/isolation.cjs` deja de reportar el fragmento de nombre, y el caso de documento exacto queda sin contacto.

## Fuera de alcance

- Datos ya guardados en `cliente_identidades`: no se borran.
- Probar documentos exactos uno por uno sigue revelando la razón social, como autoriza `SPEC_AGENDAS` §4. Límite de intentos: decisión aparte.
- FS-17, a registrar: `upsertForFacturador` sobrescribe la razón social global con lo que cargue cualquier facturador, y otro puede verla.
