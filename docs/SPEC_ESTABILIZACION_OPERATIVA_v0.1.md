# SPEC Estabilizacion Operativa v0.1

## 1. Proposito

Consolidar el MVP ya implementado para operar altas de nuevos facturadores con una prueba completa, repetible y segura:

1. configurar facturador y operador;
2. validar readiness;
3. crear cliente;
4. crear producto o servicio;
5. emitir factura electronica real contra `facturacion-electronica`;
6. confirmar estado SIFEN;
7. validar entrega publica y artefactos.

## 2. Contexto De Pruebas Recientes

El 2026-05-19 se confirmo que la emision real funciona contra `https://fe-api.ventax.app/fcws`.

Resultados observados en FE test:

- documento `0002106`, receptor `Roberto Saldivar`, CI `492019`: `APPROVED`, codigo SIFEN `0260`.
- documentos `0002104` y `0002105`, receptor `CLIENTE CONTRIBUYENTE SA`, RUC generico `80000000-1`: `REJECTED`, codigo SIFEN `1306`, mensaje `TEST - RUC del receptor inexistente en la base de datos de Marangatu`.

Conclusion:

- el flujo tecnico SaaS -> FE -> SIFEN funciona;
- el ambiente SIFEN test exige receptores existentes o validos en su base de prueba;
- no todo receptor generico sirve para una prueba aprobada.

## 3. Alcance

Incluye:

- checklist operativa para alta de facturador;
- smoke operativo reutilizable por facturador ya configurado;
- catalogo local de receptores de prueba validados;
- registro de resultados de prueba por facturador;
- mejora del diagnostico de rechazo fiscal para soporte;
- validacion de link publico, KUDE/PDF y XML despues de emision aprobada;
- prueba real de NCE total sobre factura aprobada, si el ambiente fiscal lo permite.

## 4. Fuera De Alcance

- crear facturadores automaticamente desde el smoke;
- administrar certificados, CSC o secretos fiscales desde la UI operativa;
- emision offline;
- soporte automatizado ante rechazo SIFEN;
- caja, inventario, compras, cobranzas o cuenta corriente.

## 5. Reglas

- El facturador se configura manualmente por backoffice o SQL antes del smoke.
- El operador smoke debe estar asociado a un unico facturador.
- Las credenciales y API keys no se versionan.
- El smoke debe fallar con mensaje claro cuando readiness no este completo.
- Para pruebas aprobadas se deben usar receptores validados contra SIFEN test.
- Los rechazos SIFEN se consideran resultados validos de integracion, pero no cierran una prueba de alta operativa exitosa.

## 6. Criterio De Aceptacion

Una alta de facturador se considera operativamente validada cuando:

- `/me/readiness` responde `ready: true`;
- el smoke crea cliente e item;
- la factura queda `EMITIDA`;
- existe `cdc`;
- existe numero fiscal;
- el estado SIFEN es aprobado o equivalente;
- el link publico abre;
- KUDE/PDF y XML estan disponibles;
- la evidencia queda registrada sin secretos.
