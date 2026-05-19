# Checklist Alta Facturador MVP v0.1

Checklist manual para soporte interno antes de entregar un operador listo para emitir.

## Datos Del Facturador

- Confirmar RUC, razon social, nombre fantasia si aplica y estado activo.
- Registrar `emisor_id` fiscal usado por `facturacion-electronica`.
- Confirmar tenant y suscripcion activos.

## Timbrado Y Punto

- Confirmar establecimiento y punto de expedicion.
- Confirmar timbrado vigente y rango numerico disponible.
- Confirmar que la numeracion la controla FE/SIFEN o el backend fiscal configurado, no la UI.

## Perfil Fiscal

- Confirmar actividad economica principal.
- Confirmar perfil de emision local si aplica.
- Confirmar flags operativos necesarios para FE, por ejemplo numeracion `ONLINE/SERVICE` y envio u omision de `emission_profile_code`.

## Operador

- Crear o asignar usuario operativo.
- Asociar el usuario a un unico facturador, establecimiento y punto por defecto.
- Entregar credencial temporal y forzar cambio si corresponde.

## Readiness

Validar en la pantalla `Informacion y estado`:

- Tenant activo.
- Suscripcion activa.
- Usuario con configuracion operativa.
- Facturador activo.
- Contexto fiscal local completo.
- Backend fiscal disponible.

## Smoke Obligatorio

Ejecutar despues de `bash scripts/deploy.sh`, usando un receptor aprobado del catalogo local:

```bash
SMOKE_USERNAME=<operador> \
SMOKE_PASSWORD=<password> \
ONBOARDING_SMOKE_CLIENTE_TIPO=CI \
ONBOARDING_SMOKE_CLIENTE_DOCUMENTO=492019 \
ONBOARDING_SMOKE_CLIENTE_RAZON_SOCIAL="Roberto Saldivar" \
npm run ops:onboarding-smoke
```

Para validar NCE total en el mismo alta:

```bash
SMOKE_USERNAME=<operador> \
SMOKE_PASSWORD=<password> \
ONBOARDING_SMOKE_CLIENTE_TIPO=CI \
ONBOARDING_SMOKE_CLIENTE_DOCUMENTO=492019 \
ONBOARDING_SMOKE_CLIENTE_RAZON_SOCIAL="Roberto Saldivar" \
ONBOARDING_SMOKE_NCE=YES \
npm run ops:onboarding-smoke
```

## Cierre

Registrar en la tarea o ticket de alta:

- usuario operativo validado;
- numero fiscal, CDC y estado de la factura smoke;
- disponibilidad de link publico, KUDE/PDF y XML;
- CDC y estado de NCE si se ejecuto `ONBOARDING_SMOKE_NCE=YES`;
- bloqueo exacto si SIFEN rechaza o FE no devuelve artefactos.
