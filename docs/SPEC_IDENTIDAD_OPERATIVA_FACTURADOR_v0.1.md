# SPEC Identidad Operativa Facturador v0.1

## Objetivo

Permitir que cada facturador se identifique en la operacion diaria por un titulo comercial simple, asociado a su actividad economica, nombre fantasia o alias operativo.

El operador no siempre reconoce su negocio por la razon social fiscal. La pantalla principal debe mostrar un titulo cercano a la actividad real que realiza, sin perder los datos fiscales obligatorios.

## Problema

Hoy la UI usa principalmente `facturador.razon_social` como encabezado.

Esto es correcto fiscalmente, pero puede ser poco claro para negocios que operan con:

- nombre fantasia;
- alias comercial;
- varias actividades economicas;
- razon social juridica distinta al nombre usado ante clientes.

## Modelo Funcional

Cada facturador debe poder tener un `titulo_operativo` visible en la aplicacion.

El titulo puede originarse desde:

1. nombre fantasia del facturador;
2. alias operativo definido manualmente;
3. alias de la actividad economica activa;
4. descripcion de la actividad economica;
5. razon social fiscal como fallback final.

La razon social y RUC siguen disponibles como datos fiscales, pero no necesariamente son el titulo principal de la pantalla.

## Actividad Economica

La actividad economica debe ser visible para el operador porque define el contexto fiscal-operativo de emision.

La UI debe mostrar:

- titulo operativo como encabezado principal;
- razon social y RUC como datos secundarios;
- codigo y descripcion de actividad economica activa;
- establecimiento, punto y timbrado cuando corresponda.

Si el negocio necesita un nombre diferente para la actividad, debe poder configurarse como `actividad_alias` o campo equivalente.

## Pantalla Principal

En la pantalla principal o vista inicial de operacion:

- el `titulo_operativo` debe aparecer como titulo;
- la razon social no debe competir visualmente con el titulo operativo;
- el operador debe entender rapidamente que esta emitiendo para la actividad correcta;
- si no existe alias/nombre fantasia, se usa la descripcion de actividad economica;
- si tampoco existe descripcion, se usa la razon social.

## Reglas De Privacidad Y Claridad

- No comunicar al cliente final detalles internos de configuracion.
- No confundir nombre fantasia con razon social fiscal en comprobantes.
- No enviar alias operativo como dato fiscal si `facturacion-electronica` requiere razon social oficial.
- El alias es para experiencia operativa y puede aparecer en pantallas internas; los comprobantes fiscales conservan datos oficiales.

## Criterios De Aceptacion

- El contexto operativo devuelve o permite derivar un `titulo_operativo`.
- La pantalla principal muestra ese titulo como encabezado.
- La actividad economica activa se muestra de forma legible.
- Existe fallback deterministico: alias/nombre fantasia -> alias actividad -> descripcion actividad -> razon social.
- La emision fiscal sigue usando datos fiscales oficiales.
- La configuracion puede validarse por facturador sin afectar otros facturadores.
