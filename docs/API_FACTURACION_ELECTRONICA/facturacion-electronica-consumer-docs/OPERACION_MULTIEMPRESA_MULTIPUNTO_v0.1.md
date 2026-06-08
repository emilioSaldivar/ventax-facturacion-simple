# OPERACION MULTIEMPRESA Y MULTIPUNTO v0.1

## 1. Objetivo

Definir lineamientos operativos para administrar emisores (multiempresa) y bocas de emisión (establecimiento/punto) en el core de facturación electrónica.

## 2. Alcance operativo

Incluye:
- alta base de facturador por `ADMIN_GLOBAL`,
- asignación de operadores por emisor,
- gestión de establecimientos, puntos, timbrados, numeradores,
- controles de readiness por emisor/boca.

## 3. Roles y responsabilidades

### ADMIN_GLOBAL
- crea emisor base,
- define ambiente inicial (`test`/`prod`),
- asigna usuarios operadores al emisor.

### OPERADOR_FACTURADOR
- administra configuración operativa del emisor asignado,
- mantiene timbrados, numeradores y parámetros de emisión,
- opera flujos de emisión/consulta/eventos dentro de su alcance.

## 4. Flujo operativo mínimo por nuevo emisor

1. Crear emisor base (RUC, DV, razón social, régimen, estado).
2. Asignar operador(es) responsables.
3. Configurar:
   - actividades económicas,
   - establecimiento(s) y punto(s),
   - timbrado(s),
   - numerador(es),
   - CSC por ambiente,
   - certificado vigente.
4. Validar `readiness`.
5. Ejecutar pruebas de emisión controlada.

## 5. Reglas de multiempresa/multipunto

- Ningún operador no asignado debe ver ni operar otro emisor.
- La numeración fiscal se gestiona por emisor + establecimiento + punto + tipo documental (+ serie cuando aplique).
- No mezclar configuración de `test` y `prod`.
- Toda actualización crítica (timbrado, certificado, CSC, numerador) debe dejar trazabilidad.

## 6. Checklist operativo por boca de emisión

1. Establecimiento y punto activos.
2. Timbrado vigente y compatible.
3. Numerador consistente.
4. Certificado vigente y activo.
5. CSC válido para ambiente.
6. Readiness en `OK`.

## 7. Incidencias típicas y respuesta

- Readiness incompleto:
  - revisar faltantes reportados y corregir antes de emitir.
- Error de numeración:
  - validar secuencia y configuración por punto.
- Error de ambiente:
  - confirmar emisor y credenciales del entorno correcto.

## 8. Evidencia mínima de operación

Mantener evidencia para auditoría operativa:
- alta/edición de configuración crítica,
- emisiones de validación,
- eventos de cancelación/inutilización cuando existan,
- resultados de consultas y sync.
