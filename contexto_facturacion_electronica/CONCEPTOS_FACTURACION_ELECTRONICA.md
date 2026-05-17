# Conceptos Clave Para La Web Multi Facturador

Este resumen explica los conceptos fiscales que la nueva aplicacion debe conocer para consumir `facturacion-electronica` sin duplicar reglas SIFEN.

## 1. Facturador / Emisor

El facturador es el contribuyente que emite documentos electronicos. En el backend actual se representa como `emisor`.

Datos relevantes:
- RUC base y digito verificador;
- razon social;
- nombre fantasia;
- tipo de contribuyente;
- regimen;
- ambiente SIFEN (`test` o `prod`);
- actividades economicas;
- establecimientos;
- puntos de expedicion;
- timbrados;
- certificados;
- CSC;
- numeradores.

La nueva web puede tener su propio registro comercial de facturador, pero debe vincularlo con el `emisor_id` fiscal del backend.

## 2. Actividad Economica

Representa la actividad declarada ante SET para el contribuyente.

Uso esperado:
- el backend necesita una actividad activa para construir el documento fiscal;
- puede existir una actividad principal y varias secundarias;
- la nueva web no deberia exponer esto al operador de emision simple salvo que el negocio lo requiera.

## 3. Establecimiento

Es la sucursal/local fiscal del emisor. En facturacion electronica forma parte del numero fiscal.

Ejemplo:

```text
001
```

Datos comunes:
- codigo de establecimiento;
- denominacion;
- direccion;
- departamento/distrito/ciudad;
- telefono/email.

## 4. Punto De Expedicion

Es la boca de emision dentro de un establecimiento. Tambien forma parte del numero fiscal.

Ejemplo:

```text
001-001-0000001
    ^^^
    punto de expedicion
```

Un establecimiento puede tener varios puntos de expedicion.

## 5. Timbrado

El timbrado habilita al contribuyente a emitir documentos dentro de una vigencia.

Datos relevantes:
- numero de timbrado;
- fecha de inicio;
- fecha de fin si aplica;
- estado activo/vigente;
- establecimiento asociado si corresponde.

Sin timbrado vigente no se debe emitir.

## 6. Numerador

Controla el correlativo fiscal por emisor, establecimiento, punto de expedicion y tipo de documento.

Ejemplo de numero fiscal:

```text
001-001-0000001
```

Partes:
- `001`: establecimiento;
- `001`: punto de expedicion;
- `0000001`: numero correlativo.

El consumidor externo no debe decidir el numero fiscal final. Debe pedir emision al backend y recibir el numero asignado.

## 7. Serie

La serie fiscal puede aplicar segun el Manual Tecnico y configuracion del documento.

Regla practica:
- no usar la serie como etiqueta libre de negocio;
- si se requiere una etiqueta comercial, manejarla en la nueva web como dato externo;
- dejar que el backend fiscal controle la serie cuando corresponda.

## 8. CSC e IdCSC

El CSC es el Codigo de Seguridad del Contribuyente y se usa para generar el QR AA002.

Reglas:
- es un secreto fiscal;
- no debe exponerse a operadores;
- `IdCSC` debe usarse exactamente como SET lo habilito;
- el backend lo utiliza despues de firmar el XML para insertar/generar QR.

## 9. Certificado Digital PKCS#12

El certificado se usa para firmar digitalmente el XML.

Reglas:
- archivo `.pfx` o `.p12`;
- requiere password;
- es informacion sensible;
- debe administrarse en el backend fiscal o en un canal seguro, no en la UI operativa.

## 10. CDC

El CDC es el identificador fiscal del documento electronico.

La nueva web debe guardarlo como referencia principal del documento aprobado o enviado.

Uso:
- consultar estado;
- descargar XML/KUDE;
- cruzar soporte;
- mostrar al cliente cuando corresponda.

## 11. XML, Firma Y QR

Flujo fiscal:
1. el backend genera XML desde datos normalizados;
2. firma el XML con certificado;
3. genera QR AA002 usando CSC;
4. envia a SIFEN;
5. guarda estado y artefactos.

La nueva web no debe generar ni modificar XML.

## 12. KUDE / PDF

El KUDE es la representacion grafica del documento electronico.

Para la nueva web:
- puede descargarlo desde este backend si existe endpoint/artefacto;
- o puede generarlo en su propio backend si se define asi;
- debe estar disponible para el cliente final junto con XML cuando corresponda.

## 13. Receptor / Cliente Final

Datos minimos para factura simple:
- razon social o nombre;
- RUC, CI u otro documento valido para facturacion.

Datos utiles:
- correo;
- telefono/WhatsApp;
- direccion.

La nueva web puede mantener clientes globales y clientes por facturador. Este backend solo necesita los datos fiscales usados al emitir.

## 14. Items

La nueva web controla el catalogo comercial.

Para emision fiscal se envia:
- cantidad;
- codigo opcional;
- descripcion;
- precio unitario;
- tasa IVA 5% o 10%.

El backend debe devolver totales y estado fiscal. La web puede mantener sus propios codigos comerciales tipo `FAC1-...`, pero no deben confundirse con numeracion fiscal.

## 15. Estados

Estados internos relevantes del backend:
- `DRAFT`;
- `XML_GENERATED`;
- `XML_SIGNED`;
- `QR_ATTACHED`;
- `SENT_SYNC`;
- `SENT_BATCH`;
- `APPROVED`;
- `APPROVED_WITH_OBS`;
- `REJECTED`.

La nueva web debe traducir estos estados a mensajes simples para el operador.

## 16. Integracion Recomendada

La nueva web deberia:
- guardar `external_ref` propio de la venta;
- enviar payload simple al backend fiscal;
- guardar `document_id`, `cdc`, numero fiscal y estado devuelto;
- consultar por `external_ref` o `cdc` cuando necesite refrescar estado;
- usar endpoints de artefactos para descargar XML/KUDE/PDF;
- no exponer secretos, XML editable ni configuracion SIFEN al operador.
