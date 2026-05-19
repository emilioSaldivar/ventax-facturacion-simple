# Receptores SIFEN Test v0.1

Catalogo local de receptores usados para validar el ambiente FE/SIFEN test del proyecto. No contiene secretos.

## Aprobables

| Tipo | Documento | Razon social esperada | Uso recomendado | Evidencia |
| --- | --- | --- | --- | --- |
| CI | `492019` | `Roberto Saldivar` | Smoke operativo aprobado de factura y NCE total | Factura `0002106` aprobada, CDC `01801369681001001000210622026051918996595030` |

## Rechazo Controlado

| Tipo | Documento | Razon social usada | Resultado esperado | Evidencia |
| --- | --- | --- | --- | --- |
| RUC | `80000000-1` | `CLIENTE CONTRIBUYENTE SA` | Rechazo SIFEN test `1306` | Mensaje FE/SIFEN: `TEST - RUC del receptor inexistente en la base de datos de Marangatu` |

## Variables De Smoke

Para una corrida aprobada:

```bash
SMOKE_USERNAME=admin \
SMOKE_PASSWORD=admin \
ONBOARDING_SMOKE_CLIENTE_TIPO=CI \
ONBOARDING_SMOKE_CLIENTE_DOCUMENTO=492019 \
ONBOARDING_SMOKE_CLIENTE_RAZON_SOCIAL="Roberto Saldivar" \
npm run ops:onboarding-smoke
```

Para validar NCE total sobre una factura nueva:

```bash
SMOKE_USERNAME=admin \
SMOKE_PASSWORD=admin \
ONBOARDING_SMOKE_CLIENTE_TIPO=CI \
ONBOARDING_SMOKE_CLIENTE_DOCUMENTO=492019 \
ONBOARDING_SMOKE_CLIENTE_RAZON_SOCIAL="Roberto Saldivar" \
ONBOARDING_SMOKE_NCE=YES \
npm run ops:onboarding-smoke
```

## Regla Operativa

No usar documentos genericos para cerrar una prueba de alta operativa aprobada. Si SIFEN test rechaza un receptor nuevo, agregarlo a esta matriz con codigo, mensaje, fecha y smoke id antes de volver a utilizarlo.
