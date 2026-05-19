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

## 6. Verificacion Recomendada

Por iteracion:

```bash
npm run ops:onboarding-smoke
npm run test --workspace @facturacion-simple/api
npm run typecheck
npm run lint
npm run build
npm run qa:no-secrets
```

Cuando se toque UI:

```bash
npm run build --workspace @facturacion-simple/web-operacion
```

mas validacion Playwright mobile/desktop.
