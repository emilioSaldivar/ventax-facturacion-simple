# SPEC Frontend Formularios Y UX v0.1

## 1. Contexto

El frontend administrativo ya permite operar facturadores, usuarios, facturas, reenvios y sincronizaciones SIFEN. La base visual actual es adecuada: paleta sobria, fondo claro, sidebar oscuro, botones primarios azules y estados con badges.

El problema principal en la primera etapa fue la configuracion fiscal del facturador: muchos CRUD dependian de `JsonCrudSection`, textareas JSON y payloads manuales. Eso ya fue reemplazado en gran parte por formularios operativos.

El problema actual pasa a ser de **estabilidad visual y UX de detalle**: los formularios existen y funcionan, pero todavia presentan errores de visualizacion, jerarquia inconsistente y problemas de layout que reducen claridad operativa.

Esta especificacion define dos tramos complementarios:
- migracion hacia formularios tipados, claros y guiados, sin cambiar la identidad visual del panel;
- ajuste visual y de usabilidad de esos formularios una vez operativos.

## 2. Objetivos

- Preparar primero los contratos backend necesarios para eliminar dependencias de edicion JSON en flujos operativos criticos.
- Asegurar que los contratos nuevos sean reutilizables por otros clientes, no solo por este frontend.
- Separar claramente la experiencia entre configuracion del facturador y operacion de facturas.
- Reemplazar edicion JSON por formularios especificos para cada entidad fiscal.
- Mantener JSON solo como vista tecnica avanzada o diagnostico, no como forma principal de carga.
- Mejorar la pantalla de facturador con una navegacion por secciones operativas.
- Reducir errores en campos criticos: `IdCSC`, CSC, timbrado, numeracion, ambiente, certificado, establecimiento y punto.
- Exponer validaciones y ayudas contextuales antes de enviar al backend.
- Mantener compatibilidad con los endpoints existentes.
- Corregir errores de visualizacion y consistencia de layout en formularios ya implementados.
- Llevar la pantalla del facturador desde "funcional" a "operable con claridad" sin rediseñar la identidad visual base.
- Hacer clara la disposicion de filtros de fechas en bandeja operativa (`emision` vs `envio`) para evitar interpretaciones ambiguas.
- Exponer en bandeja el tipo de DE y la condicion de operacion para lectura operativa inmediata (`FE`/`NCE`, `CONTADO`/`CREDITO`).
- Incorporar una validacion automatizada UI/UX con Playwright para comprobar login, navegacion administrativa y elementos visuales criticos del frontend.

## 3. No Objetivos Iniciales

- No redisenar la paleta de colores.
- No hacer un rediseno visual amplio antes de resolver contratos y formularios operativos.
- No reconstruir la pantalla completa con un nuevo design system en esta etapa.
- No construir un wizard completo de emision de facturas en esta fase.
- No eliminar las vistas JSON de diagnostico tecnico.
- No cambiar la autenticacion ni permisos.
- No implementar en esta iniciativa todas las acciones avanzadas de correccion documental sobre XML y CDC; deben quedar documentadas como contratos y backlog derivado si no entran en la primera tanda ejecutable.

## 4. Diagnostico Del Frontend Actual

### 4.1 Pantallas existentes

- `DashboardPage`: resumen simple de facturadores visibles y readiness.
- `FacturadoresPage`: tabla base de facturadores.
- `FacturadorDetailPage`: pantalla principal de configuracion fiscal.
- `FacturasPage`: bandeja operativa de documentos y sync.
- `FacturaDetailPage`: diagnostico individual, JSON editable y reenvio.
- `UsersPage` / `UserDetailPage`: CRUD de usuarios y asignaciones.
- `SyncJobPage`: seguimiento de job de sincronizacion.

### 4.2 Problemas UX detectados

- `FacturadorDetailPage` mezcla demasiadas responsabilidades en una sola pagina vertical.
- La migracion de JSON a formularios ya existe, pero no todos los formularios tienen una presentacion visual madura.
- No hay ayudas de formato en campos sensibles.
- No hay agrupacion clara por flujo operativo.
- El usuario debe conocer nombres internos de propiedades como `codigo_establecimiento`, `punto_expedicion_id`, `vigente_desde`, `poll_max_tries`.
- En CSC, el incidente del 2026-04-27 demostro que un formato incorrecto de `IdCSC` puede causar rechazo SIFEN `2501`.
- En factura detalle, editar el body JSON completo sigue siendo necesario para soporte avanzado, pero no deberia ser el camino normal para correcciones simples.
- Actualmente no existe una experiencia clara para inspeccionar y corregir el XML generado/enviado de una factura rechazada. Esto es necesario para soporte avanzado, pero debe estar controlado porque modificar XML firmado o con QR invalida firma digital y hash QR.
- En `FacturasPage`, los filtros de fechas se muestran en secuencia lineal y generan dudas de lectura cuando se mezclan rango de emision y rango de envio.
- En `FacturasPage`, falta visibilidad directa del tipo de documento electronico y de la condicion de operacion para diferenciar factura vs nota de credito y contado vs credito.

### 4.3 Problemas UX posteriores a la migracion funcional

Una vez implementados los formularios, quedan problemas visibles que deben tratarse como una etapa propia:

- `FacturadorDetailPage` mantiene una densidad vertical alta y repite estructuras de `panel` dentro de `panel`.
- La jerarquia visual entre lista lateral, formulario y metadatos no siempre es clara.
- Los estados seleccionados de listas laterales pueden resultar ambiguos si no tienen contraste visual suficiente.
- `form-grid` y `summary-grid` no siempre expresan una grilla operativa estable de dos columnas en desktop.
- Acciones en `panel-header` y `button-row` pueden comprimirse o quebrarse de forma poco clara.
- En viewport estrecho la pantalla es usable, pero todavia no consistente ni optimizada.
- Algunos formularios muestran demasiados campos con el mismo peso visual, sin destacar inputs criticos, errores o ayudas cortas.

## 5. Principios De Diseño

- Interfaz operativa, densa y clara, no landing ni vista de marketing.
- Mantener colores actuales; mejorar estructura, jerarquia y controles.
- Usar formularios especificos con labels humanos y campos del tipo correcto.
- Usar selects para opciones cerradas, checkboxes para booleanos, inputs numericos para codigos y cantidades, file input para certificados.
- Mostrar previews utiles: RUC completo, factura fiscal, ambiente activo, readiness y faltantes.
- Evitar textos largos de ayuda dentro de la UI; usar microcopy corto donde previene errores fiscales.
- No anidar cards dentro de cards. Usar secciones full-width y paneles solo para grupos de formulario o listas.
- Todas las acciones destructivas o riesgosas deben tener confirmacion.
- La seleccion activa debe ser visible de inmediato sin depender de lectura fina.
- Los formularios operativos deben tener consistencia de ancho, alineacion y espaciado entre secciones.
- En desktop, el layout debe privilegiar lectura comparativa lista/formulario; en mobile, apilar sin romper claridad.

## 6. Arquitectura Frontend Propuesta

### 6.1 Componentes compartidos

Crear una capa de componentes reutilizables en `frontend/src/shared/components`:

- `FormSection`: encabezado, descripcion breve, acciones y contenido.
- `TextField`: input controlado con label, error y hint.
- `NumberField`: input numerico con min/max/step.
- `SelectField`: select tipado.
- `DateField`: input date/datetime segun caso.
- `CheckboxField`: booleano.
- `SecretField`: campo sensible con mascara y opcion de reemplazo.
- `FormActions`: guardar, cancelar, reset, estado de loading.
- `InlineAlert`: error, warning, success.
- `EntityList`: lista lateral de registros con estado activo/inactivo.
- `Tabs` o `SectionNav`: navegacion interna de configuracion.

`JsonCrudSection` debe quedar deprecado para uso operativo y conservarse solo como herramienta temporal o fallback tecnico.

### 6.1A Componentes y estilos de pulido UX

La segunda parte de esta iniciativa debe cerrar una capa de consistencia visual:

- variantes visuales para `EntityList` con estado activo seleccionado;
- grilla real para formularios de 2 columnas en desktop;
- reglas de `stack` para viewport estrecho;
- headers de seccion con acciones que no colisionen con labels inline;
- metadatos secundarios visualmente separados del formulario editable;
- feedback inline mas consistente para errores, warnings y estados operativos.

### 6.2 Modelo de formularios

Cada formulario tendra:

- estado local tipado;
- `fromApi` para transformar respuesta backend a formulario;
- `toPayload` para transformar formulario a payload API;
- validacion frontend minima antes de llamar al endpoint;
- render de errores API normalizados.

La base de formularios para esta iniciativa sera:

- `react-hook-form` para estado y submit;
- `zod` para validaciones y parsing;
- adaptadores `fromApi` / `toPayload` por entidad.

Esta decision evita reescribir formularios en una segunda iteracion.

### 6.3 Contratos backend primero

Antes de completar la migracion UX en frontend, deben existir contratos backend suficientes para:

- operar configuracion fiscal multi-facturador sin editar JSON manual;
- soportar manejo de datos sensibles sin sobrescribir secretos por accidente;
- exponer acciones futuras de correccion documental y reenvio con una API reutilizable por otros clientes.

Esta iniciativa prioriza primero el backend cuando el frontend dependa de endpoints nuevos o mas precisos.

## 7. Nueva UX Para Facturador

Esta iniciativa cubre dos superficies relacionadas pero distintas:

- **Panel del facturador**: configuracion integral de emision.
- **Panel operativo de facturas**: bandeja, detalle, diagnostico y acciones operativas.

La UX debe dejar esta separacion visible en navegacion, encabezados y permisos.

### 7.1 Estructura de pantalla

`FacturadorDetailPage` debe transformarse en una pantalla con resumen superior y secciones:

- Resumen
- Datos fiscales
- Actividades
- Establecimientos y puntos
- Timbrados
- CSC
- Certificados
- Numeradores
- Batch
- Diagnostico tecnico

La navegacion puede ser tabs horizontales en desktop y select/segmentado en mobile.

La pantalla debe presentarse como configuracion del facturador, no como bandeja de documentos.

### 7.1A Criterios de calidad visual de la pantalla

Para considerar cerrada esta iniciativa, `FacturadorDetailPage` debe cumplir tambien con estos criterios:

- no depender de paneles anidados de forma repetitiva cuando una grilla simple resuelve la composicion;
- mantener consistencia entre anchos de campos, alineacion de labels y acciones;
- dejar visualmente claro que hay una columna de seleccion y otra de edicion cuando aplique;
- evitar headers con acciones que empujen controles fuera de lectura;
- mantener usabilidad real en viewport estrecho, no solo compilacion responsive.

### 7.2 Resumen superior

Debe mostrar:

- razon social;
- RUC;
- ambiente seleccionado;
- readiness;
- cantidad de faltantes;
- acciones principales:
  - ver facturas;
  - refrescar;
  - cambiar ambiente.

Si hay faltantes, mostrar lista corta con CTA hacia la seccion correspondiente.

## 8. Formularios Requeridos

### 8.1 Datos fiscales del emisor

Campos:

- RUC base;
- DV;
- razon social;
- nombre fantasia;
- tipo contribuyente;
- tipo regimen;
- ambiente SIFEN;
- logo path;
- activo.

Validaciones:

- RUC base numerico, 6 a 8 digitos recomendado;
- DV numerico de 1 digito;
- razon social requerida;
- ambiente `test` o `prod`;
- activo booleano.

### 8.2 Actividades economicas

Campos:

- codigo de actividad;
- descripcion;
- principal;
- activo.

UX:

- lista de actividades a la izquierda;
- formulario a la derecha;
- badge para actividad principal;
- solo una actividad principal debe quedar marcada.

Requisito visual adicional:

- la actividad seleccionada y la actividad principal deben distinguirse con claridad inmediata.

### 8.3 Establecimientos

Campos:

- codigo establecimiento;
- descripcion/denominacion;
- direccion;
- numero casa;
- departamento codigo/descripcion;
- distrito codigo/descripcion;
- ciudad codigo/descripcion;
- telefono;
- email;
- activo.

Validaciones:

- codigo establecimiento de 3 digitos;
- direccion requerida;
- codigos geograficos numericos;
- email valido si se carga.

Requisito visual adicional:

- los campos geograficos y de contacto deben leerse como grupos y no como una sola lista plana de inputs.

### 8.4 Puntos de expedicion

Campos:

- establecimiento asociado;
- codigo punto;
- descripcion;
- activo.

UX:

- selector obligatorio de establecimiento;
- agrupar puntos debajo del establecimiento;
- mostrar `001-001` como preview fiscal.

Validaciones:

- codigo punto de 3 digitos.

Requisito visual adicional:

- el filtro por establecimiento y el formulario de punto no deben competir por jerarquia visual.

### 8.5 Timbrados

Campos:

- establecimiento opcional;
- numero timbrado;
- fecha inicio;
- fecha fin;
- vigente desde;
- vigente hasta;
- activo.

UX:

- mostrar si el timbrado esta vigente;
- alertar si hay multiples timbrados activos para el mismo emisor;
- alertar si fecha fin esta vencida.

Requisito visual adicional:

- vigencia, establecimiento y estado deben poder leerse rapido desde la lista.

Validaciones:

- numero timbrado requerido;
- fecha inicio requerida;
- fecha fin mayor o igual a fecha inicio si se informa.

### 8.6 CSC

Campos:

- ambiente;
- `IdCSC`;
- CSC;
- vigente desde;
- vigente hasta;
- activo.

UX:

- Campo `IdCSC` debe indicar: "Usar exactamente el valor habilitado por SET".
- No autocompletar ceros a la izquierda.
- CSC debe tratarse como secreto: al editar, el campo aparece vacio y solo se reemplaza si el usuario escribe uno nuevo.
- Mostrar longitud del CSC guardado si el backend la expone en el futuro; si no, mostrar solo mascara.
- Si `IdCSC` o `CSC` se envian vacios en edicion, el backend no debe interpretarlos como borrado implicito salvo accion administrativa explicita.

Validaciones:

- `IdCSC` requerido, trim sin padding.
- CSC requerido en alta.
- En edicion, un valor vacio en `CSC` significa "no cambiar" y no "reemplazar por vacio".

Requisito visual adicional:

- `IdCSC` y `CSC` deben destacar como campos sensibles sin recargar toda la seccion.

### 8.7 Certificados

Mantener upload operativo como camino principal.

Campos:

- alias;
- password;
- vigente desde;
- vigente hasta;
- archivo `.pfx/.p12`;
- activo.

UX:

- eliminar o esconder edicion manual por `cert_path` para usuarios normales;
- mostrar metadatos del certificado si estan disponibles: subject, issuer, serial, vigencia.
- si no se adjunta un nuevo archivo en edicion, el certificado vigente no cambia;
- la administracion de secretos y certificados queda restringida a usuarios administradores del facturador.

Validaciones:

- extension `.pfx` o `.p12`;
- password requerida;
- fechas coherentes.

Requisito visual adicional:

- metadatos del certificado no deben mezclarse visualmente con campos de carga o edicion.

### 8.8 Numeradores

Campos:

- establecimiento;
- punto de expedicion;
- tipo documento;
- siguiente numero;
- rango minimo;
- rango maximo;
- bloqueado;
- activo.

UX:

- preview de siguiente factura: `001-001-0000001`.
- tipo documento como select: FE, NCE, otros soportados.
- advertencia al editar numeradores porque afecta emision fiscal.

Validaciones:

- siguiente numero positivo;
- rango maximo mayor o igual a minimo;
- siguiente numero dentro de rango si ambos existen.

Requisito visual adicional:

- el preview fiscal debe percibirse como salida derivada, no como otro campo editable equivalente.

### 8.9 Batch Config

Campos:

- ambiente;
- tipo agenda: CRON o INTERVAL;
- cron expr;
- intervalo minutos;
- max documentos;
- poll seconds;
- poll max tries;
- enabled.

UX:

- mostrar campos condicionales segun tipo agenda.
- boton "Reset override" con confirmacion.

Validaciones:

- CRON requiere cron expr;
- INTERVAL requiere intervalo;
- max documentos entre 1 y 50.

Requisito visual adicional:

- el cambio entre `CRON` e `INTERVAL` debe mostrar u ocultar campos sin dejar huecos o saltos confusos en la grilla.

## 9. Facturas Y Reenvios

Esta seccion se divide en dos niveles:

- **nivel implementable inmediato**: mejoras de bandeja, diagnostico, visualizacion de artefactos y contratos backend base;
- **nivel de backlog contractual**: correccion avanzada XML, prevalidacion CDC, reintento manteniendo CDC, inutilizacion y creacion de nuevo DE.

### 9.1 Bandeja de facturas

Mejoras:

- estados como badges, no texto plano;
- filtros con selects para estado interno y freshness;
- fechas formateadas;
- CDC con boton copiar;
- resumen por estado con chips clicables.
- indicadores visibles de aprobadas, rechazadas y pendientes.

### 9.2 Detalle de factura

Mantener JSON tecnico, pero reorganizar:

- Resumen y diagnostico arriba.
- Datos operativos del receptor visibles en un bloque claro.
- Acciones de reenvio con confirmacion.
- Edicion avanzada JSON colapsada bajo "Modo soporte".
- Visualizacion de XML para documentos enviados y rechazados por SET, con evolucion posterior hacia correccion y reenvio controlado.
- Historial de revisiones con diffs o snapshots descargables en fase posterior.

El objetivo del detalle no es editar libremente la factura, sino ayudar a:
- entender el rechazo;
- ubicar datos operativos potencialmente incorrectos;
- ejecutar la accion correcta segun elegibilidad backend.

### 9.2.1 Correcciones operativas permitidas

Cuando el backend lo soporte, la UI debe priorizar correcciones acotadas sobre datos operativos como:
- RUC;
- CI;
- nombre;
- correo;
- direccion.

Estas correcciones deben modelarse como formularios o acciones guiadas, no como edicion libre del documento completo.

### 9.3 Editor Avanzado De XML Para Reenvio

Estado de esta capacidad en la iniciativa actual:

- debe quedar documentada en `SPEC`, `PLAN` y contratos OpenAPI;
- su implementacion puede dividirse en una iniciativa posterior si el backend base aun no esta listo.

El detalle de factura debe permitir inspeccionar los artefactos XML asociados al documento:

- XML sin firma (`xml_unsigned`);
- XML firmado (`xml_signed`);
- XML final con QR (`xml_qr`);
- respuesta SIFEN asociada al ultimo envio.

Para documentos no aceptados por SIFEN (`REJECTED`, `TRANSMISSION_FAILED`, `SENT_SYNC`, `SENT_BATCH`, `QUEUED_SYNC`, `QUEUED_BATCH` segun elegibilidad backend), la UI debe ofrecer un "Modo soporte XML" con estas opciones:

- ver XML original en modo solo lectura;
- copiar XML;
- descargar XML;
- editar XML base para reenvio;
- registrar motivo obligatorio de edicion;
- guardar revision;
- reenviar por `SYNC` o reencolar por `BATCH`.

Regla fiscal obligatoria:

- Si el usuario modifica cualquier XML, el sistema debe volver a firmar y regenerar QR antes de reenviar.
- No se debe reenviar un `xml_signed` o `xml_qr` editado manualmente sin re-firma y re-generacion de QR.
- El editor debe advertir que editar `xml_signed`, `Signature`, `DigestValue`, `dCarQR`, `IdCSC` o `cHashQR` directamente puede invalidar el documento.

Modelo recomendado:

- La edicion principal debe ser sobre `xml_unsigned_override`.
- Al reenviar, backend usa el XML editado como base, firma con certificado vigente, genera QR con CSC vigente y envia el XML final.
- `xml_signed` y `xml_qr` se muestran como artefactos derivados. Si se habilita su edicion, debe ser una accion de soporte excepcional con confirmacion reforzada y validacion previa.

Validaciones UI minimas:

- XML no vacio.
- XML parseable.
- CDC/numero/timbrado visibles antes de reenviar.
- Motivo de revision obligatorio.
- Confirmacion explicita: "Se generara una nueva firma y un nuevo QR antes del envio".

Trazabilidad requerida:

- Guardar snapshot anterior y nuevo del XML editado.
- Mostrar revision generada.
- Mostrar resultado SIFEN posterior al reenvio.
- Mantener visible el CDC resultante, que puede cambiar si se regenera el DE.

### 9.5 Contratos Backend Requeridos Para Esta Iniciativa

El backend debe quedar preparado para ser consumido por multiples facturadores y por multiples clientes administrativos, no solo por el frontend propio del repo.

Contratos minimos a contemplar:

- endpoints administrativos por `facturador/emisor` para formularios tipados;
- reglas de actualizacion parcial segura para secretos y archivos;
- lectura de artefactos documentales (`xml_unsigned`, `xml_signed`, `xml_qr`, respuesta SIFEN);
- endpoint de revision documental o extension del existente para cambios auditados;
- endpoint de prevalidacion de correccion con impacto CDC;
- endpoints o acciones equivalentes para reintento, reencolado, inutilizacion y eventual creacion de nuevo DE derivado.

Reglas contractuales:

- todo endpoint sensible debe operar con alcance explicito por `emisor_id` o identificador equivalente;
- secretos vacios en edicion significan "no cambiar";
- archivos omitidos en edicion significan "no cambiar";
- las respuestas deben devolver estado suficiente para renderizar UI sin inferencias fragiles;
- los contratos deben documentarse en `spec/openapi.yaml` antes o junto con su implementacion.

### 9.4 Acciones Para Reintento Hasta Aprobacion

Para documentos rechazados por SET, el panel debe guiar al operador segun la regla normativa:

- Si la correccion no modifica la estructura de datos que compone el CDC, permitir reintentar con el mismo CDC.
- Si la correccion modifica el CDC, bloquear el reenvio con la misma numeracion y ofrecer inutilizar la numeracion para emitir un nuevo DE.

Acciones requeridas en `FacturaDetailPage`:

- `Reintentar manteniendo CDC`: regenera firma y QR, envia a SET y conserva CDC si el backend confirma que no cambio.
- `Guardar correccion y validar CDC`: calcula o extrae el CDC resultante antes de transmitir y compara contra el CDC original.
- `Reenviar SYNC`: disponible solo si la validacion CDC es compatible o si no hubo edicion de datos base.
- `Reencolar BATCH`: mismas reglas que SYNC, pero deja el documento en cola.
- `Inutilizar numeracion`: disponible para rechazos donde el ajuste implique nuevo CDC o cuando no se logro aprobacion y corresponde anular el numero no utilizado.
- `Crear nuevo DE desde correccion`: crea un nuevo documento con nueva numeracion/CDC reutilizando el body corregido cuando corresponda.

Estados visuales:

- `CDC conservado`: se permite reenvio.
- `CDC cambiaria`: se bloquea reenvio con mismo numero y se ofrece inutilizacion.
- `Requiere revision`: el sistema no pudo determinar impacto CDC; pedir confirmacion de soporte o bloquear hasta validar.

Reglas de seguridad:

- No permitir estas acciones sobre documentos `APPROVED`, `APPROVED_WITH_OBS`, `CANCELLED` o `VOIDED`.
- Toda accion debe registrar motivo y crear revision.
- El resultado SET debe actualizar estado, respuesta SIFEN y timestamps.
- El panel debe permitir repetir el ciclo correccion -> validacion CDC -> firma/QR -> envio hasta obtener aprobacion o decidir inutilizar.

## 10. Estados Y Feedback

Todas las mutaciones deben mostrar:

- loading en boton;
- success visible despues de guardar;
- error API con `message` y detalle si existe;
- invalidacion/refetch al completar;
- prevencion de doble submit.

Adicionalmente:

- si un usuario no tiene permiso para una pantalla o accion, la UI no debe presentarla como disponible;
- si una accion esta bloqueada por estado del documento, la UI debe explicar el motivo.

## 11. Accesibilidad Y Responsive

- Labels visibles en todos los inputs.
- Foco visible en inputs, botones y links.
- Botones con texto claro.
- Layout mobile en una sola columna cuando no complique de forma importante la implementacion.
- Tablas con overflow horizontal en pantallas chicas.
- Campos no deben desbordar su contenedor.
- Si una optimizacion mobile completa complejiza demasiado una fase, el minimo aceptable es que la pantalla sea usable en viewport estrecho.

## 12. Criterios De Aceptacion

- Los contratos backend necesarios para eliminar formularios JSON operativos estan definidos y, cuando corresponda, reflejados en `spec/openapi.yaml`.
- Un usuario puede configurar un facturador ready sin escribir JSON.
- La UI diferencia claramente entre panel del facturador y panel operativo de facturas.
- CSC permite cargar `IdCSC=1` exactamente, sin convertir a `0001`.
- En edicion, secretos vacios y archivos omitidos no reemplazan valores existentes.
- Certificado se carga por formulario con archivo y password.
- Numerador muestra preview fiscal.
- Batch config usa campos condicionales.
- Factura detalle conserva JSON solo como modo avanzado.
- Factura detalle expone al menos los artefactos y diagnosticos base requeridos para una futura correccion documental controlada.
- Factura detalle permite entender la causa del rechazo y ubicar datos operativos relevantes del documento.
- La visibilidad de pantallas, tabs y acciones refleja rol y permisos efectivos.
- Las capacidades avanzadas de XML y CDC quedan documentadas como contratos backend reutilizables aunque su implementacion completa se ejecute en otra iniciativa.
- `JsonCrudSection` ya no aparece en el flujo principal de configuracion del facturador.
- Existe una validacion Playwright ejecutable con `cd frontend && npx playwright test` que cubre login administrativo y bandeja de facturas en viewport desktop y mobile.
- `npm run build` pasa.
