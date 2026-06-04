# PLAN Estabilizacion Operativa v0.1

## 1. Objetivo

Definir una iteracion corta para convertir las pruebas manuales recientes en una rutina operativa repetible para cada nuevo facturador.

## 2. Flujo Principal De Emision

La emision principal funciona asi:

1. El operador inicia sesion en el SaaS.
2. El backend resuelve su `tenant`, `facturador` y `fiscal_context`.
3. El backend valida readiness operativo y fiscal.
4. El operador crea o selecciona cliente.
5. El operador crea o selecciona producto/servicio.
6. La UI pide preview; el backend calcula totales e IVA.
7. La UI envia `POST /facturas` con `Idempotency-Key`.
8. El SaaS persiste la factura en estado `EMITIENDO`.
9. El outbox/worker envia el payload fiscal a `facturacion-electronica`.
10. `facturacion-electronica` genera XML, firma, QR, CDC, envia a SIFEN y responde estado.
11. El SaaS guarda `document_id`, `cdc`, numero fiscal, estado y snapshot fiscal.
12. La UI/listado permite refrescar, entregar link, KUDE/PDF y XML.

La numeracion fiscal no la decide el SaaS. Con `FE_SERVICE_NUMBERING=true`, FE toma el siguiente numero desde su numerador.

## 3. Receptores De Prueba

Mantener un set pequeno de receptores aprobables en SIFEN test.

Estado actual:

| Tipo | Documento | Razon social | Resultado |
| --- | --- | --- | --- |
| CI | 492019 | Roberto Saldivar | Aprobado en documento `0002106` |
| RUC | 80000000-1 | CLIENTE CONTRIBUYENTE SA | Rechazado SIFEN test `1306` |

## 4. Smoke Operativo

El comando base es:

```bash
npm run ops:onboarding-smoke
```

El smoke debe mantenerse simple:

- no crea facturadores;
- no cambia configuracion fiscal;
- no modifica certificados ni secretos;
- usa el operador configurado en `.env`;
- crea cliente e item de prueba;
- emite factura real;
- valida entrega.

## 5. Mejoras Tecnicas

### 5.1 Diagnostico De Rechazo

Cuando FE/SIFEN rechaza, guardar y mostrar:

- codigo SIFEN;
- mensaje resumido;
- CDC si existe;
- numero fiscal consumido;
- recomendacion operativa breve.

### 5.2 Artefactos

Despues de una factura aprobada, validar:

- link publico;
- KUDE/PDF;
- XML.

### 5.3 NCE Real

Probar NCE total contra la factura aprobada mas reciente del smoke, con idempotencia propia y evidencia separada.

Si FE rechaza la NCE antes de confirmar identidad fiscal o estado recuperable, el API SaaS debe propagar el rechazo como error fiscal (`502`) y no persistir una NCE operativa en `ERROR_TEMPORAL`, porque no existe outbox recuperable para ese documento.

### 5.4 Catalogo Operativo

Agregar una vista de catalogo para que el operador pueda:

- buscar productos o servicios del facturador;
- filtrar activos e inactivos;
- crear un item nuevo;
- editar codigo, descripcion, precio, IVA y estado activo.

La vista reutiliza los endpoints SaaS existentes `/catalogo/items` y no llama directamente a FE.

### 5.5 Documentos Y Consulta SIFEN

La vista de documentos debe permitir:

- listar facturas y notas por estado o busqueda;
- abrir detalle con cliente, total, numero fiscal, CDC y estado operativo;
- mostrar codigo/mensaje SIFEN cuando existan en `fiscal_status`;
- ejecutar `POST /facturas/{id}/refresh-status` como consulta de estado contra FE/SIFEN;
- conservar acciones de entrega, anulacion, reintento y NCE.

### 5.6 Navegacion Mobile

La UI operativa debe comportarse como una app simple:

- topbar fija con marca, titulo de pantalla y menu hamburguesa;
- menu lateral con Inicio, Nueva factura, Catalogo, Documentos y Salir;
- contenido centrado con ancho mobile en desktop para facilitar pruebas de operador final;
- accesos rapidos en Inicio como respaldo, sin reemplazar el menu principal.

### 5.7 Usuario Admin Local

Para completar validaciones manuales locales, `admin/admin` debe tener una configuracion operativa activa contra el facturador test ya configurado.

La configuracion debe apuntar a:

- emisor `80136968-1`;
- establecimiento `001`;
- punto `001`;
- actividad `82110`;
- perfil local `SERV`.

Esta asignacion es solo de entorno local/test y no versiona secretos.

## 6. Verificacion Recomendada

Por iteracion:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm run qa:no-secrets
bash scripts/deploy.sh
npm run ops:onboarding-smoke
```

Cuando se toque UI:

```bash
npm run build --workspace @facturacion-simple/web-operacion
```

mas validacion Playwright mobile/desktop contra la aplicacion servida por los contenedores redeployados.

Regla operativa: toda validacion HTTP, smoke o visual que represente uso real debe correr despues de `bash scripts/deploy.sh`, usando los puertos y rutas del stack Docker Compose activo.
