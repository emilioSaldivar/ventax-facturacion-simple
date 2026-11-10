# SPEC Planillas De Ejemplo Y Documentacion De La Planilla v0.1

**Fecha:** 2026-11-10 · **Rama:** `feat/identidad-segel` · **Estado:** en implementacion, paso (3) del orden del usuario (implementar contra el corte de FE y probar FS+FE antes de produccion).

## Alineacion

- `docs/BACKLOG.md`, FS-46: pedido de FE y respuestas del usuario (diccionario descargable en PDF o `.md`; ejemplos de todos los casos, agrupados por tipo de cliente y condicion).
- Corte de FE: tag `segel-rc4.25`, paquete de consumidores v0.40, `operativa/NOTA_DE_CORTE_v0.40.md` (punto 2, "Planilla por tipo"), guia secciones 40, 51, 55 y 57; esquemas `CargaEjemplo`, `CargaEjemplos` y `CargaDiccionario`.
- `docs/SPEC_DOCUMENTOS_ESCRITORIO_v0.1.md`, fase B1: selector de tipo en "Nueva carga".

## Objetivo

Que el operador descargue, desde "Nueva carga", la planilla del tipo elegido, cualquier ejemplo listo para subir con **su** punto y su numeracion, y la documentacion de la planilla en PDF o Markdown para entregar a quien arma los archivos.

## Contrato de FE que se consume

- `GET /v1/cargas/formatos/csv/1/ejemplos?tipo_documento=` → `{ formato, version_formato, ejemplos: [{ codigo, titulo, descripcion, tipo_documento, tipo_cliente, condicion, temas, columnas_que_muestra, procesamiento_disponible, columnas_no_habilitadas, href }], diccionario_href }`, ordenados por tipo de cliente, condicion y temas.
- `GET /v1/cargas/formatos/csv/1/ejemplos/{codigo}` y `GET /v1/cargas/formatos/csv/1` (plantilla): CSV con fechas del dia. Con `emisor_id` mas `emission_profile_code` (o `establecimiento` y `punto`), `numeracion`, `actividadEconomicaCodigo` y `tipo_documento`, los numeros salen con el punto del cliente, consecutivos desde su numerador y saltando los inutilizados (guia 57). Errores: `403` sin alcance sobre el emisor; `422 CARGA_PARAMETROS_INVALIDOS` con motivos; `404` ejemplo desconocido.
- `GET /v1/cargas/formatos/csv/1/diccionario?tipo_documento=&formato=pdf|md|json`.

## Reglas

- **RN-01.** FS pide plantilla y ejemplos con los mismos datos del contexto que manda al subir (`subirCarga`): emisor, perfil o punto, numeracion, actividad y tipo. Asi el archivo descargado se sube tal cual sin `PUNTO_DISTINTO`.
- **RN-02.** El menu de ejemplos se agrupa por tipo de cliente (Consumidor final B2C, Empresas B2B, Estado B2G, Exterior B2F) en el orden que entrega FE, y muestra titulo y descripcion. Un ejemplo con `procesamiento_disponible = false` se ofrece igual, marcado "aún no se procesa".
- **RN-03.** "Documentación de la planilla" descarga el PDF; tambien se ofrece en Markdown.
- **RN-04.** Todo depende del tipo elegido en "Nueva carga" (Factura o Nota de remision).
- **RN-05.** Los compradores, receptores y transportistas de los ejemplos son ficticios (lo advierte FE); la pantalla lo recuerda junto al menu.
- **RN-06.** Errores de FE: `422` y `403` se muestran con su mensaje y motivos; FE caido, como el resto de la carga (`FE_NO_DISPONIBLE`).

## Criterios de aceptacion

- **CA-01.** Con Factura elegida, el menu lista los ejemplos de FE agrupados por tipo de cliente y la documentacion; con Nota de remision, los `NRE_*`.
- **CA-02.** Un ejemplo descargado trae el punto del contexto del operador y se sube y valida sin `PUNTO_DISTINTO`.
- **CA-03.** El PDF y el Markdown de la documentacion se descargan con nombre propio.
- **CA-04.** La plantilla descargada trae el punto del contexto.
- **CA-05.** Escritorio 1440 y 1280, y 390, sin desplazamiento horizontal.
