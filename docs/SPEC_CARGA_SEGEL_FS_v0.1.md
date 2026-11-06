# SPEC Carga Segel en VPS v0.1

**Fecha:** 2026-11-06 · **Rama:** `feat/identidad-segel` · **Estado:** en ejecucion.

## Alineacion

- `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.1.md`
- `docs/SPEC_VERIFICACION_CAPACIDAD_200_v0.1.md`

## Objetivo

Comprobar la resiliencia de la instancia de `segel-fs` con varios operadores simultaneos que facturan, emiten notas de credito y cancelan, y medir cuanta memoria, CPU y disco consume.

## Decisiones

| ID | Tema | Decision |
|---|---|---|
| D-1 | Permiso | El usuario pidio la prueba y autorizo crear usuarios (2026-11-06) |
| D-2 | Destino | Instancia de test en `segel-fs`, por tunel, con SIFEN test real |
| D-3 | Emisor | Solo `5057016-1`, el unico con certificado |
| D-4 | Correo | Clientes de carga sin correo: no se generan rebotes en la cuenta de Microsoft 365 |
| D-5 | Volumen | Por etapas y moderado. Una etapa empieza solo si la anterior no dejo un problema sin explicar |

## Reglas

- **RN-01.** Nunca contra produccion. El script se niega si `SIFEN_ENV` no es `test`.
- **RN-02.** Solo se crean usuarios, clientes e items con prefijo `carga`, y se pueden desactivar al terminar.
- **RN-03.** No se modifican recursos de la VPS ni el certificado.
- **RN-04.** Se corta la corrida si `/var` supera 85 %, la memoria disponible baja de 300 MiB o un contenedor queda reiniciando.
- **RN-05.** Un rechazo de SIFEN test se registra con su codigo; no se reintenta en bucle.

## Etapas

| Etapa | Operadores | Ritmo | Objetivo |
|---|---|---|---|
| E0 Humo | 2 | 6 facturas | Validar datos y circuito |
| E1 Base | 5 | 60 por hora, 15 min | Linea base |
| E2 Doble | 10 | 120 por hora, 15 min | Efecto de duplicar |
| E3 Rafaga | 10 | 1 cada uno en 60 s, 3 veces | Picos |
| E4 Fallas | 5 | 60 por hora, con reinicios | Reinicio de API FS, API FE y Postgres FS |

## Criterios de aceptacion

- **CA-01.** Sin documentos duplicados: cada `idempotency_key` y cada `numero_fiscal` aparece una sola vez.
- **CA-02.** Todo documento llega a un estado final o tiene una causa explicada.
- **CA-03.** Tras cada reinicio, el servicio vuelve solo y los documentos en curso terminan.
- **CA-04.** Sin errores 5xx sin explicar; p95 y consumo de recursos informados por etapa.
- **CA-05.** Sin fuga entre operadores ni secretos en logs.

## Fuera de alcance

- **Aislamiento entre emisores bajo carga.** Hay un solo certificado. Los operadores comparten emisor, asi que esta prueba no demuestra el comportamiento de muchos clientes distintos.
- **El limite maximo.** Eso requiere SIFEN simulado, porque SIFEN test no es de la instancia (SV-406 de FE).
- **Correo masivo.** Se prueba aparte, con un envio real.
