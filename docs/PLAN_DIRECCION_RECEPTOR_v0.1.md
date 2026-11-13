# PLAN — Dirección del cliente en la factura (hotfix) v0.1

**SPEC:** `docs/SPEC_DIRECCION_RECEPTOR_v0.1.md` · **Backlog:** FS-152, FS-154, FS-155

## 1. Diseño

Cambio en base, API, contrato y pantalla de FS. FE no cambia para FS-152 (ya acepta y valida el domicilio completo); las plantillas del KuDE las hace FE aparte (FS-153).

### 1.1 Base

Migración `0053_domicilio_cliente.sql`, aditiva y sin backfill. En `facturador_clientes` (la agenda del facturador) se agregan columnas nulas: `numero_casa text`, `departamento integer`, `departamento_descripcion text`, `distrito integer`, `distrito_descripcion text`, `ciudad integer`, `ciudad_descripcion text`. No se tocan `cliente_identidades`: el domicilio es dato de la agenda de cada facturador, no se comparte entre facturadores (FS-01, FS-17). Las filas existentes quedan con domicilio incompleto (RN-05).

### 1.2 Reglas compartidas

- `apps/api/src/shared/validation/receptor.ts` y su par `apps/web-operacion/src/lib/validacionReceptor.ts` (mantienen el mismo contenido, como hoy):
  - `limpiarDireccion(valor)`: reemplaza `\r`, `\n` y `\t` por espacio, junta espacios, recorta; vacío → `null`.
  - `validarDireccion(valor)`: además del máximo 255, rechaza los caracteres fuera de `^[\p{L}\p{M}0-9 .,/\-ºª°#()'"&]*$` (con `u`), y el mensaje lista los rechazados (RN-06).
  - `domicilioCompleto(c)`: calle, `numero_casa` válido (`validarNumeroCasa`), `departamento` y `ciudad`.
- La remisión usa ya `normalizarNombre` y `largo()` en `notas-remision.validacion.ts`: sus direcciones (local de salida y entrega, domicilio del destinatario, domicilio fiscal del transportista y dirección del chofer) pasan a `limpiarDireccion` y `validarDireccion`.

### 1.3 API

| Pieza | Archivo | Cambio |
|---|---|---|
| Agenda | `clientes/clientes.routes.ts`, `clientes.types.ts`, `clientes.repository.ts` (lecturas en ~102, ~176, ~214 y escrituras ~291-326 de `facturador_clientes`) | Campos opcionales `numero_casa`, `departamento`, `departamento_descripcion`, `distrito`, `distrito_descripcion`, `ciudad`, `ciudad_descripcion`; se leen en la lista, la búsqueda y el detalle; validación RN-03 y RN-06. Un domicilio parcial no es error (RN-02): se guarda y no se envía a FE. Si el pedido no trae ningún campo de domicilio, se conserva el guardado (`parametrosDomicilio`); si los trae vacíos, se borra. `clientes.service.ts` los pasa al repositorio |
| Factura | `facturas/facturas.routes.ts` (cliente, ~58), `facturas.types.ts` | Mismos campos opcionales en `cliente` de `POST /facturas` y de la vista previa; `direccion` con RN-06 (hoy `max(240)`, pasa a 255); se guardan en `cliente_snapshot` (RN-08) |
| Envío a FE | `fiscal-gateway/fiscal-gateway.client.ts` `buildReceptor` (~2022) | Con `domicilioCompleto`: `direccion`, `numeroCasa`, `departamento`, `distrito` (si está) y `ciudad`. Si no: como hoy (solo `direccion`, que FE ignora). Mock local igual |
| Geografía | `geografia/geografia.service.ts`, `geografia.routes.ts` | Ruta nueva `GET /geografia/ciudades?departamento=N` (RN-04): FE solo filtra ciudades por distrito, así que FS pide los distritos del departamento y las ciudades de cada uno (las mismas llamadas que ya usa `leerGeografia`, con su caché de 24 h), las une, agrega a cada ciudad su `distrito` y las ordena por descripción. Todas las listas de ciudades filtran `descripcion.length > 30` (RN-07, FS-155) antes de guardar en caché; constante `MAX_DESCRIPCION_CIUDAD = 30` con referencia a FS-155. La ruta por distrito se mantiene para la remisión |
| Contrato | `spec/openapi.yaml` | Esquemas de cliente de agenda y de factura con el domicilio |

### 1.4 Pantalla

| Pieza | Archivo | Cambio |
|---|---|---|
| Nueva factura | `main.tsx`, bloque Cliente (~2290) | La calle sale de "Dirección, teléfono y correo (opcionales)" y pasa a la sección nueva `CampoDireccion` (RN-02): cerrada por defecto con "Agregar dirección"; abierta muestra calle, número de casa, departamento y ciudad, y "Quitar dirección". Se abre sola si el cliente de la agenda trae domicilio. Aviso de RN-02 con `Aviso`. Autocompletar desde la agenda trae el domicilio; el guardado en agenda (~2036) manda los campos nuevos |
| Agenda | `views/AgendaView.tsx` (editor) | `SelectorDomicilio` debajo de "Dirección"; la lista muestra la dirección con número y ciudad cuando están |
| Ficha | `views/DocumentsView.tsx` | La dirección del cliente con número, ciudad y departamento cuando el snapshot los tiene |
| Componente | `components/CampoDireccion.tsx` (nuevo, catálogo P-C1) | Sección plegable con calle, número de casa y dos listas: Departamento (`/geografia/departamentos`) y Ciudad (`/geografia/ciudades?departamento=N`), que se vacía al cambiar el departamento y guarda el distrito de la ciudad elegida. Lo usan Nueva factura y la agenda. `SelectorDomicilio` (remisión, con distrito visible) no cambia en esta cadena; unificarlos queda anotado como mejora |

## 2. Riesgos

- **Contrato con FE:** solo se mandan campos que FE ya documenta (`numeroCasa`, `departamento`, `distrito`, `ciudad`; guía de consumidores, receptor). Un domicilio mal formado lo rechaza FE con `422` antes de numerar; la pantalla muestra el error como hoy (FS-74).
- **Ciudades largas:** el filtro de RN-07 cambia también la remisión de producción en el próximo despliegue (es el objetivo); verificar que ninguna remisión guardada use una ciudad filtrada (local: consulta; producción: solo con autorización).
- **Regla de caracteres más estricta:** direcciones ya guardadas con caracteres fuera de la lista no se rechazan al leer; se validan al guardar o emitir. Contar en local cuántas hay; en producción, solo con autorización.
- **B2F:** FS no emite B2F desde el editor; si llega, FE pide solo el número. Fuera de alcance.
- **Despliegue:** API, migración y frontend. Solo con autorización explícita, con respaldo previo, después de `segel-rc4.37` o por separado según decida el usuario.

## 3. Validación

1. API: `npm run test`, `typecheck` y `lint`; pruebas de `limpiarDireccion`/`validarDireccion` (casos de CA-03), del repositorio de clientes con domicilio, de `buildReceptor` (completo e incompleto) y del filtro de ciudades.
2. Frontend: `typecheck` y `build`.
3. Stack local de ensayo reconstruido (API, migración y frontend del mismo commit) contra `fe-segel` en SIFEN test.
4. Playwright `scripts/segel-fs/playwright-direccion-receptor.cjs`: agenda y Nueva factura en 1440, 1280 y 390; aviso de RN-02; caracteres de CA-03; selector sin ciudades largas (CA-05); emisión en SIFEN test de una factura con domicilio completo (CA-01, con aviso a FE) y una con calle sola (CA-02); lectura del XML en la base de `fe-segel` y del KuDE.
5. Regresión: `playwright-nota-remision.cjs`, `playwright-validaciones-receptor.cjs`, `playwright-ux-nueva-factura.cjs` y reconocimiento UX.
6. Con `segel-rc4.37` de FE: repetir CA-01 y comprobar número, ciudad y departamento impresos en factura y remisión.

## 4. Catálogo geográfico: fuente única (pedido a FE, 2026-11-13)

Decisión del usuario: los valores de departamento y ciudad vienen de FE, como el mismo ENUM que FE usa para validar y escribir el XML (tablas del MT150 de xmlgen, `CATALOG_VERSION` 2026.11). FS no mantiene una lista propia. Hoy `GET /v1/parametrizaciones/geografia` entrega las ciudades solo por distrito; se pidió a FE (`facturacion-electronica-da`):

1. ciudades por departamento, con distrito y departamento de cada una, ordenadas;
2. el catálogo completo en una llamada, con versión y ETag, como contrato estable;
3. que las ciudades de más de 30 caracteres vengan marcadas en el catálogo (FS-155), en lugar de filtrarlas en FS;
4. confirmación de que los códigos publicados son los que valida `factura.schema.ts` y escribe xmlgen.

Según la respuesta, la ruta `GET /geografia/ciudades?departamento=N` de FS (§1.3) pasa a ser un reenvío con caché de la ruta de FE, y el filtro de ciudades largas usa la marca de FE. Si FE no lo publica a tiempo para el hotfix, se usa la reconstrucción por distritos descrita en §1.3, que da el mismo resultado con los mismos códigos.

**Respuesta de FE (`facturacion-electronica-da`, 2026-11-13; decisión del usuario en la sesión de FE):**

- **`segel-rc4.37`** (rama `fix/kude-direcciones`, en curso): plantillas del KuDE (FS-153) y validaciones del domicilio. Las ciudades de más de 30 caracteres pasan a rechazarse con `422` **antes de numerar**, con un mensaje que explica la razón.
- **`segel-rc4.38`** (aparte): ciudades por departamento (propuesta `?departamento=N&nivel=ciudades`, ordenadas por descripción), catálogo completo en una llamada y marca de ciudades no emitibles.
- **Contrato estable:** los códigos de `DEPARTAMENTOS`, `DISTRITOS` y `CIUDADES` de FE (`xmlgen-tables.catalog.ts`, de `facturacionelectronicapy-xmlgen` 1.0.277, tablas 2.1 y 2.2 del MT150): 18 departamentos, 272 distritos y 6.766 ciudades. El endpoint publica exactamente las constantes que valida `factura.schema.ts` y escribe xmlgen, sin espacios sobrantes ni códigos repetidos.
- **Avisos de cambio:** cambian el `ETag` y `version` (`CATALOG_VERSION` 2026.11). FS guarda el `ETag`, revalida con `If-None-Match` y, si recibe `200` en lugar de `304`, reemplaza su copia. Un cambio de códigos además se comunica.

**Diseño adoptado para el hotfix:** FS usa el catálogo de FE como única fuente:
- arma las ciudades de un departamento con `?departamento=N` y luego `?distrito=N` de cada distrito, guardando el `ETag`;
- excluye las ciudades de más de 30 caracteres con la misma regla de FE (son 58).

Cuando salga `segel-rc4.38`, la ruta de FS pasa a reenviar la de FE y el filtro pasa a usar la marca del catálogo (DIR-017); la pantalla no cambia.

## 5. Ajustes de la implementación (2026-11-13)

- `textarea`/inputs: los cuatro controles de `CampoDireccion` llevan `aria-label` exacto ("Calle", "Nº de casa", "Departamento", "Ciudad"), porque el nombre accesible de la lista de ciudades incluía el texto "Primero el departamento".
- Al cambiar el departamento, la lista de ciudades se vacía antes de pedir la nueva (antes se veían un instante las del departamento anterior; lo detectó Playwright).
- `normalizarDireccion` además pasa las comillas tipográficas (‘ ’ “ ”) a `'` y `"` antes de validar.
- La calle se movió de "Dirección, teléfono y correo" a la sección propia; el botón de opcionales pasa a "Teléfono y correo (opcionales)". Se actualizaron `playwright-ux-nueva-factura.cjs` y `playwright-validaciones-receptor.cjs`.
- La emisión va por la cola: un pedido con la ciudad 6531 responde `201` y termina en `ERROR_OPERATIVO` sin número ni `document_uuid`. El texto para el operador es el genérico de FE (`VALIDATION_ERROR`), tema de FS-93; en pantalla no se puede elegir esa ciudad.

