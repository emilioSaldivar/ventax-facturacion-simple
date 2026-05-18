# Relevamiento Competencia - CheFactura v0.1

## Objetivo

Relevar modulos visibles de CheFactura para entender cobertura funcional desde el lado operativo de facturacion, sin copiar diseno, codigo ni flujos propietarios.

Fecha de revision: 2026-05-17.

Fuentes revisadas:

- `https://app.chefactura.com.py/login`
- `https://app.chefactura.com.py/`
- bundle publico SPA `assets/index.e166fe47.js`
- chunks publicos de rutas principales.

Nota:
- la URL `https://app.chefactura.com.py/login%20medinaautomotores9@gmail.com/admin` devuelve pantalla 404 (`Oops. Nada aqui...`).
- no se inicio sesion, no se emitieron facturas y no se ejecutaron acciones de negocio.

## Modulos Detectados

### Operacion principal

- Dashboard.
- Ventas.
- Venta POS mobile.
- Listado de ventas y facturacion.
- Emision/gestion de factura.
- Consulta SET/SIFEN desde ventas.
- Reenvio a SET.
- Ver KUDE.
- Imprimir/ver PDF.
- Anulacion/cancelacion.
- Estados de venta/documento.

### Caja y cobranza

- Apertura de caja.
- Cierre de caja.
- Verificacion de caja abierta.
- Cobranza de ventas.
- Registro de cobro.
- Recibos emitidos.
- Plan de cuotas.
- Seleccion de cuotas a cobrar.
- Metodos de pago.
- Cuenta de fondo.

Observacion para nuestro MVP:
- caja, recibos y cobranza quedan fuera de alcance.
- para factura credito, nuestro MVP solo emite; no gestiona cuotas ni cobros posteriores.

### Clientes y personas

- Clientes.
- Datos de clientes.
- Personas.
- Datos personales.
- Busqueda de cliente por nombre o RUC.
- Consulta RUC/SET.
- Email requerido para enviar comprobante.
- Persistencia de email en ficha de cliente.

Observacion para nuestro MVP:
- conviene mantener busqueda rapida por RUC/CI y popup de carga rapida.
- email debe ser opcional, pero si existe se delega envio al backend fiscal Ventax.

### Productos e inventario

- Productos.
- Inventario.
- Nuevo producto.
- Busqueda en catalogo.
- Venta libre / nuevo item.
- Lista de precio.
- Tipo IVA.
- Precio.
- Cantidad.
- Subtotal.

Observacion para nuestro MVP:
- no copiar inventario.
- si mantener catalogo simple de productos/servicios por facturador.
- permitir item rapido con IVA 10% por defecto.

### Documentos electronicos

- Factura.
- Nota de credito.
- Nota de debito.
- Nota de remision.
- KUDE.
- CDC.
- Estados SIFEN/SET.

Observacion para nuestro MVP:
- incluir Factura Electronica contado/credito y Nota de Credito.
- Nota de Debito y Nota de Remision quedan fuera del MVP, pero aparecen como posibles extensiones.

### Configuracion fiscal

- Empresas.
- Sucursales.
- Puntos de expedicion.
- Timbrados.
- Setup facturacion.
- Configuracion unificada.
- Timbrados activos.
- Cambio de sucursal.
- Punto de expedicion activo.
- Auditoria SIFEN.

Observacion para nuestro MVP:
- el operador no debe cambiar facturador en pantalla principal.
- la asociacion usuario -> facturador -> establecimiento -> punto -> perfil -> actividad debe vivir en backoffice interno.

### Administracion y SaaS

- Usuarios.
- Roles y permisos.
- Planes.
- Modulos.
- Socios.
- Proveedores.
- Compras.

Observacion para nuestro MVP:
- usuarios y configuracion operativa son necesarios en backoffice interno.
- planes/modulos, proveedores/compras y socios quedan fuera del servicio principal.

## Estados Y Acciones Observadas En Ventas

Estados o textos detectados:

- `APROBADO`
- `PENDIENTE`
- `PENDIENTE_ENVIO`
- `EN_PROCESO`
- `RECHAZADO`
- `FALLO_ENVIO`
- `FALLO_CONSULTA`
- `ANULADO`
- `CANCELADO SET`
- `CANCELADO EN SIFEN`
- `NO_APLICA`

Acciones detectadas:

- consultar SET;
- reenviar a SET;
- ver KUDE;
- imprimir/ver PDF;
- anular;
- cobrar;
- ver recibos;
- cargar mas;
- filtrar por fecha, estado y numero de factura.

## Aprendizajes Para Nuestro Producto

### Mantener En MVP

- pantalla operativa mobile-first;
- flujo directo de venta/facturacion;
- busqueda rapida de cliente;
- catalogo simple;
- item libre controlado;
- listado de documentos;
- filtros por fecha/estado/texto;
- estados SIFEN simples;
- ver/descargar KUDE y XML;
- cancelar/anular si backend fiscal lo permite;
- NCE desde documento elegible;
- soporte visible ante rechazo.

### Evitar En MVP

- caja;
- apertura/cierre;
- cobranzas;
- recibos;
- plan de cuotas;
- compras;
- proveedores;
- inventario completo;
- socios;
- selector operativo de sucursal para usuario final;
- configuracion fiscal expuesta al operador.

### Posibles Extensiones Post-MVP

- Nota de debito.
- Nota de remision.
- Cobranza/recibos para facturas credito.
- Caja.
- Reportes operativos.
- Auditoria SIFEN avanzada.

## Impacto Sobre Nuestro SPEC Actual

El SPEC actual queda consistente con el relevamiento:

- nuestro foco en operador simple y mobile-first es correcto;
- separar backoffice de operacion evita complejidad visible;
- excluir caja/cobranza/inventario reduce carga cognitiva;
- mantener listado, KUDE/XML, cancelacion y NCE cubre las necesidades operativas principales;
- el contrato debe preservar filtros simples por fecha, estado y texto en listado de documentos.
