# Extraccion Desde POS Graciela Para SaaS De Facturacion Simple

Este documento resume informacion relevante observada en los repositorios de `POS_GRACIELA` para modelar un nuevo SaaS multi-facturador enfocado solo en facturacion electronica simple.

Repositorios leidos:
- `/home/s4ldiv/ESALDIVAR/POS_GRACIELA/pos-graciela-api`
- `/home/s4ldiv/ESALDIVAR/POS_GRACIELA/pos-graciela-frontend`
- `/home/s4ldiv/ESALDIVAR/POS_GRACIELA/saas-core`

Repositorios revisados solo como contexto secundario:
- `infra-pos-graciela`
- `pos-printer`
- `agente_productos`

## 1. Que Debemos Reutilizar Conceptualmente

El POS Graciela es mas amplio que el producto objetivo: inventario, compras, caja, impresora local, balanza, presentaciones, creditos y flujos offline. Para el nuevo SaaS conviene extraer solo estos patrones:

- separacion entre plataforma SaaS y operacion del cliente;
- tenant/facturador como frontera de aislamiento;
- roles y permisos por tenant;
- usuarios asignados a contexto operativo;
- estructura fiscal jerarquica;
- resolucion centralizada de serie/numeracion;
- integracion donde el servicio fiscal es autoridad del numero fiscal;
- estados comerciales del SaaS separados de estados operativos;
- errores funcionales claros para el operador.

## 2. Separacion De Dominios Recomendada

El repo `saas-core` define una separacion util:

- `saas-core`: cliente SaaS, tenant, plan, suscripcion, estado comercial, acceso.
- `pos-core`: usuarios operativos, sucursales, ventas, caja, fiscalidad del comercio.

Para nuestro SaaS simple:

- `platform-core`: clientes SaaS, tenants/facturadores, planes, suscripciones, acceso.
- `billing-app`: UI de administracion y operacion de facturas.
- `facturacion-electronica`: backend fiscal externo que genera XML, firma, QR, envia a SIFEN y devuelve CDC/estado.

Regla clave:
- la UI del nuevo SaaS no debe decidir si un facturador puede operar por estado comercial;
- el backend del SaaS debe resolver acceso, permisos y tenant antes de llamar a `facturacion-electronica`.

## 3. Tenant Y Facturador

En POS Graciela, el modelo SaaS usa:
- `cliente_saas`: organizacion compradora del servicio;
- `tenant`: instancia logica operativa;
- `plan`: limites y capacidades;
- `suscripcion`: estado comercial.

Para el nuevo SaaS:

### Entidades recomendadas

- `clientes_saas`
  - comprador del servicio;
  - razon social, RUC, contacto, estado.
- `tenants`
  - frontera tecnica de aislamiento;
  - `tenant_id`, `cliente_saas_id`, `slug`, estado.
- `facturadores`
  - entidad operativa/fiscal visible en el producto;
  - vincula `tenant_id` con `emisor_id` de `facturacion-electronica`.
- `planes`
  - limites: usuarios, facturadores, establecimientos, puntos, volumen mensual.
- `suscripciones`
  - estado comercial de acceso.

### Decisiones

- Un tenant puede tener uno o varios facturadores si el plan lo permite.
- Cada facturador debe mapear a un `emisor_id` fiscal en `facturacion-electronica`.
- Todo dato operativo debe incluir `tenant_id`.
- Todo dato fiscal-operativo debe incluir `facturador_id`.

## 4. Aislamiento Multi-Facturador

El POS original era una instancia por cliente. Nuestro sistema sera una instancia para muchos facturadores.

Reglas obligatorias:

- todas las tablas operativas deben tener `tenant_id`;
- tablas propias del facturador deben tener `facturador_id`;
- clientes, items, facturas, usuarios y documentos no deben consultarse sin filtro de tenant;
- los endpoints deben resolver el tenant desde la sesion/token, no desde un campo manipulable por frontend;
- `facturador_id` solicitado debe pertenecer al tenant autenticado;
- logs, auditoria y errores deben incluir request id y tenant, sin exponer secretos fiscales.

## 5. Estructura Fiscal A Extraer

El modulo `Mantenimiento > Fiscal` de POS Graciela modela correctamente la jerarquia:

```text
Empresa / Facturador
  -> Establecimiento / Sucursal
      -> Punto de Expedicion
          -> Serie / Numeracion
  -> Timbrado
```

Para nuestro SaaS:

```text
tenant
  -> facturador
      -> establecimiento
          -> punto_expedicion
              -> perfil_emision o serie_operativa
      -> timbrado
      -> certificado
      -> CSC
```

## 6. Establecimiento

Aprendizaje del POS:
- `establecimiento` equivale a `sucursal` desde el punto de vista fiscal;
- no debe ser un string suelto;
- debe estar en una tabla maestra;
- debe poder activarse/inactivarse;
- el codigo de establecimiento debe ser unico dentro del facturador.

Campos recomendados:
- `establecimiento_id`
- `tenant_id`
- `facturador_id`
- `codigo_establecimiento`
- `nombre`
- `nombre_comercial_factura`
- `direccion`
- `telefono`
- `activo`

Para el producto simple, no necesitamos depositos ni inventario por sucursal.

## 7. Punto De Expedicion

Aprendizaje del POS:
- un establecimiento puede tener varios puntos;
- el punto pertenece a un establecimiento;
- el codigo es unico dentro del establecimiento;
- se usa para resolver la numeracion fiscal.

Campos recomendados:
- `punto_expedicion_id`
- `tenant_id`
- `facturador_id`
- `establecimiento_id`
- `codigo_punto_expedicion`
- `nombre`
- `descripcion`
- `activo`

## 8. Timbrado

Aprendizaje del POS:
- timbrado debe tener vigencia;
- no se debe asociar timbrado vencido a una serie/perfil nuevo;
- se debe validar estado activo.

Campos recomendados:
- `timbrado_id`
- `tenant_id`
- `facturador_id`
- `numero_timbrado`
- `fecha_inicio`
- `fecha_fin`
- `activo`

## 9. Serie / Perfil De Emision

El POS usa `SerieFiscal` como combinacion:

```text
establecimiento + punto de expedicion + timbrado + numeracion activa
```

En `facturacion-electronica` ya existe el concepto mas fuerte de numerador/perfil de emision. Para nuestro SaaS conviene nombrarlo `perfil_emision` o `boca_emision`.

Campos recomendados:
- `perfil_emision_id`
- `tenant_id`
- `facturador_id`
- `establecimiento_id`
- `punto_expedicion_id`
- `timbrado_id`
- `tipo_documento`
- `serie_fiscal` opcional si aplica MT;
- `predeterminado`
- `activo`
- `numerador_id` o referencia equivalente en `facturacion-electronica`.

Reglas:
- solo una predeterminada por facturador/tipo documento cuando aplique;
- no se permite perfil activo con establecimiento, punto o timbrado inactivo;
- el frontend no debe inventar establecimiento/punto/timbrado;
- la numeracion oficial debe resolverla `facturacion-electronica`.

## 10. Numeracion Fiscal

Aprendizaje critico de POS:
- si un sistema comercial intenta gobernar numeracion y el backend fiscal tiene otra secuencia, aparecen rechazos por desalineacion;
- `facturacion-electronica` debe ser la autoridad de numeracion fiscal online;
- el SaaS puede guardar `external_ref`, numero visible interno o borrador, pero no debe imponer el numero fiscal definitivo.

Regla para nuestro SaaS:
- no mantener numeradores fiscales propios para emision online normal;
- pedir emision a `facturacion-electronica`;
- persistir el `nro_factura`, `cdc`, `document_id` y estado devuelto;
- usar idempotencia para reintentos.

## 11. Usuarios, Roles Y Permisos

El POS aporta reglas utiles de identidad:

- estados de cuenta separados:
  - `PENDIENTE_ACTIVACION`
  - `ACTIVO`
  - `BLOQUEADO`
  - `INACTIVO`
- alta por administrador sin conocer password final;
- primer ingreso con cambio de password;
- bloqueo por intentos fallidos;
- auditoria de eventos sensibles;
- no inactivar al ultimo administrador activo.

Para nuestro SaaS:

### Roles iniciales

- `PLATFORM_ADMIN`
  - opera la plataforma SaaS completa.
- `TENANT_ADMIN`
  - administra facturadores, usuarios, establecimientos, puntos y configuracion no sensible de su tenant.
- `FACTURADOR_ADMIN`
  - administra un facturador especifico si el tenant tiene varios.
- `OPERADOR_FACTURACION`
  - emite facturas y consulta documentos.
- `SOPORTE_FISCAL`
  - rol interno o delegado para configuracion fiscal sensible.

### Permisos sugeridos

- `ver_facturadores`
- `editar_facturadores`
- `ver_configuracion_fiscal`
- `editar_configuracion_fiscal`
- `gestionar_usuarios`
- `emitir_facturas`
- `ver_facturas`
- `descargar_documentos`
- `reenviar_documentos`
- `ver_reportes_basicos`

## 12. Contexto Operativo

El POS usa contexto operativo para sucursal/caja. En nuestro SaaS simple no necesitamos caja, pero si necesitamos contexto de facturacion.

Contexto recomendado al iniciar sesion:

```json
{
  "tenant_id": "uuid",
  "user_id": "uuid",
  "roles": ["OPERADOR_FACTURACION"],
  "facturadores": [
    {
      "facturador_id": "uuid",
      "emisor_id": "uuid",
      "nombre": "Cliente Demo",
      "establecimientos_habilitados": [],
      "perfil_emision_default": "uuid"
    }
  ]
}
```

Reglas:
- si un usuario tiene un solo facturador, seleccionarlo por defecto;
- si tiene varios, exigir seleccion explicita;
- cambiar facturador debe limpiar borradores y contexto de emision;
- un operador no debe poder emitir si el facturador no esta fiscalmente listo.

## 13. Acceso SaaS Y Suscripcion

El `tenant_access_lease` de `saas-core` es util como patron, pero nuestro servicio probablemente sera cloud-first. Aun asi, rescatar:

- estado comercial separado del estado operativo;
- `access_allowed`;
- `tenant_status`;
- `subscription_status`;
- `plan_code`;
- `reason_code`;
- `reason_message`;
- entitlements por plan.

Para el nuevo SaaS:

Estados de tenant:
- `PENDING_SETUP`
- `ACTIVE`
- `SUSPENDED`
- `CANCELLED`

Estados de suscripcion:
- `TRIAL`
- `ACTIVE`
- `PAST_DUE`
- `SUSPENDED`
- `CANCELLED`

Regla:
- si `access_allowed=false`, bloquear emision y administracion operativa;
- mostrar mensaje de negocio simple;
- no llamar a `facturacion-electronica` si el tenant esta bloqueado.

## 14. Clientes Comerciales

Aunque POS Graciela tiene modulo de clientes/credito, para el SaaS simple conviene reducir:

Campos minimos:
- `cliente_id`
- `tenant_id`
- `facturador_id`
- `tipo_documento`
- `documento`
- `dv`
- `razon_social`
- `email`
- `telefono`
- `direccion`
- `activo`

Regla:
- se puede tener una base global de clientes normalizados, pero el historial y relacion comercial pertenece al facturador;
- la busqueda global nunca debe exponer ventas ni datos privados de otro facturador;
- alta rapida debe bastar con razon social, documento, email opcional y direccion opcional.

## 15. Items / Servicios

Del POS no conviene heredar inventario, presentaciones, stock, deposito ni balanza.

Para nuestro SaaS:

Campos minimos:
- `item_id`
- `tenant_id`
- `facturador_id`
- `codigo_externo` opcional;
- `codigo_sistema`;
- `descripcion`
- `precio_unitario`
- `iva_default` (`10` o `5`)
- `activo`

Regla:
- si el usuario no define codigo, generar uno estable por facturador;
- no mezclar codigo de item con numero fiscal;
- al emitir, guardar snapshot de descripcion, precio e IVA usados.

## 16. Flujo De Emision Recomendado

1. Backend SaaS valida tenant, suscripcion y permisos.
2. Resuelve facturador y perfil de emision.
3. Recibe cliente e items desde UI simple.
4. Guarda borrador/venta operativa propia si aplica.
5. Llama a `facturacion-electronica` con payload simplificado e idempotencia.
6. Persiste:
   - `external_ref`;
   - `document_id`;
   - `cdc`;
   - `nro_factura`;
   - `estado`;
   - request/response resumidos;
   - usuario que emitio;
   - snapshot de cliente/items.
7. Devuelve al frontend resultado y acciones de descarga/envio.

## 17. Estados A Mostrar En UI Simple

No exponer toda la maquina interna al operador.

Estados recomendados:
- `BORRADOR`
- `EMITIENDO`
- `EMITIDA`
- `PENDIENTE_SIFEN`
- `RECHAZADA`
- `ERROR_OPERATIVO`

Mapeo:
- `APPROVED` -> `EMITIDA`
- `APPROVED_WITH_OBS` -> `EMITIDA` con observacion
- `REJECTED` -> `RECHAZADA`
- errores 4xx de FE -> `ERROR_OPERATIVO`
- timeout/5xx -> `PENDIENTE_SIFEN` o `ERROR_TEMPORAL` segun politica

## 18. Que No Debemos Copiar Del POS

No copiar para v0.1:
- caja y cierre de caja;
- movimientos de efectivo;
- compras;
- proveedores;
- inventario;
- depositos;
- lotes;
- presentaciones;
- balanzas;
- impresora local RAW;
- contingencia fiscal local compleja;
- credito con cuentas corrientes;
- pedidos separados de factura;
- autoabastecimiento;
- transferencia entre sucursales.

Estas piezas son valiosas para un POS, pero contradicen el objetivo: facturacion simple para servicios, honorarios y ventas livianas.

## 19. Documentos Fuente Mas Relevantes

Prioridad alta:
- `pos-graciela-api/spec/maintenance-fiscal-config.md`
- `pos-graciela-api/spec/facturacion-electronica-integration.md`
- `pos-graciela-api/spec/identity-access-management.md`
- `pos-graciela-api/spec/saas-integration.md`
- `saas-core/spec/saas-core-platform.md`
- `saas-core/spec/tenant-access-lease.md`
- `pos-graciela-frontend/docs/modules/mantenimiento-fiscal.md`
- `pos-graciela-frontend/docs/modules/usuarios-roles-permisos.md`
- `pos-graciela-frontend/docs/modules/saas-acceso-suscripcion.md`

Prioridad media:
- `pos-graciela-api/spec/domain-map.md`
- `pos-graciela-api/spec/maintenance-operational-config.md`
- `pos-graciela-frontend/docs/modules/ventas-pedidos-facturacion.md`

Prioridad baja para este nuevo SaaS:
- inventario, compras, proveedores, balanza, impresora local, caja.

## 20. Modelo Inicial Propuesto Para Nuestro SaaS

```text
clientes_saas
tenants
planes
suscripciones
usuarios
roles
permisos
usuario_facturadores

facturadores
facturador_config_fe
establecimientos
puntos_expedicion
perfiles_emision

clientes_globales
facturador_clientes
facturador_items

facturas_operativas
factura_items_snapshot
factura_delivery
factura_audit_events
```

Relaciones clave:

```text
cliente_saas 1 -> N tenants
tenant 1 -> N facturadores
facturador 1 -> N establecimientos
establecimiento 1 -> N puntos_expedicion
facturador 1 -> N perfiles_emision
facturador 1 -> N usuarios via usuario_facturadores
facturador 1 -> N clientes
facturador 1 -> N items
facturador 1 -> N facturas_operativas
```

## 21. Reglas De Arquitectura Que Deben Quedar Desde El Inicio

1. `tenant_id` obligatorio en todo dato operativo.
2. `facturador_id` obligatorio en todo dato de emision.
3. `facturacion-electronica` es autoridad fiscal.
4. La UI no gobierna numeracion fiscal.
5. Los secretos fiscales no se exponen a operadores.
6. Los errores de negocio se traducen a mensajes claros.
7. El plan/suscripcion puede bloquear operacion antes de emitir.
8. Los clientes e items son del SaaS, no de `facturacion-electronica`.
9. Cada emision guarda snapshot.
10. La primera version evita caja, inventario y compras.
