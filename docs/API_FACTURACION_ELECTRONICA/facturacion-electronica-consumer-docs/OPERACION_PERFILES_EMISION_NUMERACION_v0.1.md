# OPERACION PERFILES DE EMISION Y NUMERACION v0.1

## Objetivo

Explicar el modelo de perfiles de emisión y numeración del sistema, cómo se resuelven los numeradores por tipo de documento, y qué debe configurarse para operar múltiples tipos documentales (facturas, notas de crédito, notas de débito, etc.) sin crear un perfil por cada tipo.

Aplica a: administradores de emisores, integradores, soporte y sistemas consumidores que operen múltiples tipos documentales bajo una misma actividad económica.

---

## Principio Central

**El perfil de emisión diferencia actividades económicas — no tipos de documento.**

Un consumidor usa el mismo identificador de perfil para emitir una Factura Electrónica y para emitir una Nota de Crédito Electrónica bajo la misma actividad. El sistema resuelve automáticamente el numerador correcto según el tipo de documento del endpoint invocado.

---

## Jerarquía de Configuración

```
Actividad Económica (actividad_id)
  └── Establecimiento (codigo: 001)
       └── Punto de Expedición (codigo: 001)
            ├── Numerador tipo 1  →  FE   (Factura Electrónica)
            ├── Numerador tipo 5  →  NCE  (Nota de Crédito Electrónica)
            ├── Numerador tipo 6  →  NDE  (Nota de Débito Electrónica)
            └── Numerador tipo 7  →  NRE  (Nota de Remisión Electrónica)
                     ↑
         Un único perfil de emisión cubre todos
```

Cada tipo documental tiene su propio contador secuencial dentro de la misma boca, pero todos quedan bajo el mismo perfil y la misma actividad económica.

---

## Qué Es Un Perfil de Emisión

Un perfil define una combinación operativa reutilizable identificada por un código:

| Campo | Descripción |
|---|---|
| `codigo` | Identificador enviado por el consumidor en el campo `emission_profile_code` |
| `actividad_id` | Actividad económica a la que aplica |
| `establecimiento_id` | Establecimiento (puede ser nulo → aplica a todos) |
| `punto_expedicion_id` | Punto de expedición (puede ser nulo → aplica a todos) |
| `separation_strategy` | Cómo se organiza la numeración (ver abajo) |
| `numerador_id` | Numerador fijo (solo en estrategia `SEPARATE_EXPEDITION_POINT`) |

El perfil **no tiene campo `tipo_documento`**. El tipo documental lo determina el endpoint que usa el consumidor (`POST /factura`, `POST /nota-credito`, etc.), no el perfil.

---

## Estrategias de Separación de Numeración

### SHARED_SEQUENCE (recomendada)

El perfil no fija un numerador. En cada emisión el sistema busca el numerador configurado para `(establecimiento, punto, tipoDocumento)`.

- Un solo perfil para todos los tipos documentales de la boca.
- Cada tipo tiene su propio contador, resuelto automáticamente.
- El consumidor solo cambia de endpoint para cambiar el tipo de documento.

### FISCAL_SERIES

Igual que `SHARED_SEQUENCE` pero con una serie fiscal adicional (`serie_fiscal`) que identifica la subsecuencia dentro del mismo punto. Sirve para separar, por ejemplo, cajas o terminales dentro de un mismo punto de expedición.

### SEPARATE_EXPEDITION_POINT

El perfil apunta a un `numerador_id` específico. La numeración queda atada a ese numerador sin importar el tipo documental. Solo aplica cuando el negocio requiere separación explícita de secuencias por punto físico.

---

## Cuándo Usar Perfiles

### Sin perfiles configurados

La API opera con secuencia compartida automática. El consumidor debe enviar:
- el código de actividad económica en cada request,
- el establecimiento y punto en el campo `timbrado`.

No se requiere `emission_profile_code`.

### Con perfiles configurados

El consumidor envía `emission_profile_code` y omite la actividad económica (el perfil la resuelve). Útil para simplificar la integración cuando:

- el emisor tiene múltiples actividades económicas,
- el consumidor no quiere gestionar qué actividad corresponde a cada boca,
- se requiere separar series por punto o por actividad de forma explícita.

---

## Resolución de Numerador en Tiempo de Emisión

Para cualquier tipo documental el sistema ejecuta la misma cadena:

```
1. Leer emission_profile_code (si viene en el request)
2. Resolver actividad económica:
   perfil.actividad → request.actividad → principal del emisor
3. Si hay cobertura configurada: validar que la actividad+boca+timbrado
   cubra el tipo de documento
4. Llamar takeNextNumber(emisorId, establecimientoId, puntoId, tipoDocumento)
   └── Si el perfil tiene numerador_id → usar ese numerador directamente
   └── Si no → buscar numerador por (establecimiento, punto, tipoDocumento)
5. Si no existe numerador para esa combinación → error:
   "No existe numerador configurado para la combinación fiscal"
```

El paso 4 garantiza que una Nota de Crédito y una Factura bajo el mismo perfil usen contadores distintos y correctos sin intervención del consumidor.

---

## Cobertura (Timbrado-Actividad)

La cobertura relaciona un timbrado con una actividad económica, opcionalmente por establecimiento, punto y tipo documental.

La validación de cobertura aplica **solo si el emisor tiene filas de cobertura configuradas**. Si no hay ninguna fila, el check se omite.

### Comportamiento del campo `tipo_documento` en cobertura

| Valor en la fila de cobertura | Efecto |
|---|---|
| `NULL` | Cubre todos los tipos documentales (FE, NCE, NDE, NRE) |
| `1` | Solo cubre Factura Electrónica |
| `5` | Solo cubre Nota de Crédito Electrónica |
| (otro valor específico) | Solo cubre ese tipo |

**Configuración recomendada:** crear una sola fila de cobertura por actividad+timbrado con `tipo_documento = NULL`. Esto habilita todos los tipos documentales sin necesidad de filas adicionales por tipo.

Si se configuraron filas con tipo_documento específico (ej. solo `1` para FE), agregar una fila con `tipo_documento = 5` para habilitar NCE — o reemplazar ambas por una fila con `NULL`.

---

## Configuración Mínima Para Emitir Múltiples Tipos Documentales

Para que un emisor pueda emitir FE y NCE desde la misma boca:

1. **Numeradores** — crear una entrada por tipo en "Numeradores y series":
   - `(establecimiento_id, punto_expedicion_id, tipo_documento=1)` → FE
   - `(establecimiento_id, punto_expedicion_id, tipo_documento=5)` → NCE
   - Repetir para NDE (`6`) y NRE (`7`) si aplica.

2. **Cobertura** — si el emisor usa coberturas:
   - Verificar que la fila de cobertura tenga `tipo_documento = NULL` (aplica a todos), o
   - Agregar fila de cobertura específica para cada tipo adicional necesario.

3. **Perfil de emisión** — opcional. Si se usa:
   - Crear un único perfil con `separation_strategy = SHARED_SEQUENCE`.
   - No crear perfiles distintos por tipo de documento.

---

## Ejemplo Operativo

### Emisor con actividad "Venta al por menor" — establecimiento 001 — punto 001

Configuración:

```
Numerador A: establecimiento=001, punto=001, tipo_documento=1,  siguiente_nro=1
Numerador B: establecimiento=001, punto=001, tipo_documento=5,  siguiente_nro=1

Perfil "VENTA_MINORISTA":
  actividad_id = id_venta_minorista
  establecimiento_id = 001
  punto_expedicion_id = 001
  separation_strategy = SHARED_SEQUENCE
```

Operación del consumidor:

```
# Emitir factura
POST /fcws/factura
{ "emission_profile_code": "VENTA_MINORISTA", ... }
→ USA Numerador A → CDC: 001-001-0000001 (FE)

# Emitir nota de crédito sobre esa factura
POST /fcws/nota-credito
{ "emission_profile_code": "VENTA_MINORISTA", "referencia": { "cdc": "..." }, ... }
→ USA Numerador B → CDC: 001-001-0000001 (NCE)
```

El consumidor usa el mismo `emission_profile_code`. El sistema elige el numerador correcto por tipo.

---

## Lo Que No Se Debe Hacer

- Crear un perfil de emisión por tipo de documento — genera complejidad innecesaria para el consumidor.
- Usar `SEPARATE_EXPEDITION_POINT` con un numerador de tipo 1 y esperar que cubra NCE — ese numerador solo aplica a FE.
- Crear filas de cobertura con tipo_documento específico sin agregar la de NCE — bloquea la emisión de notas de crédito.
- Asumir que sin numerador de tipo 5 se puede emitir NCE — el error es en tiempo de emisión, no en la configuración previa.

---

## Reglas de Operación

1. Un perfil de emisión representa una boca bajo una actividad, no un tipo de documento.
2. Configurar un numerador por tipo de documento que se vaya a emitir en cada boca.
3. La cobertura con `tipo_documento = NULL` es la configuración más simple y cubre todos los tipos.
4. El consumidor cambia el tipo de documento cambiando el endpoint, no el perfil.
5. Si no se usan perfiles, el consumidor debe enviar la actividad económica en cada request.
6. No mezclar estrategias dentro de la misma boca sin documentar el motivo.

---

## Checklist Operativo por Boca

- [ ] Numerador tipo 1 configurado (FE).
- [ ] Numerador tipo 5 configurado (NCE) — si el emisor opera notas de crédito.
- [ ] Numerador tipo 6 configurado (NDE) — si aplica.
- [ ] Numerador tipo 7 configurado (NRE) — si aplica.
- [ ] Cobertura con `tipo_documento = NULL` — o filas específicas para cada tipo habilitado.
- [ ] Perfil de emisión con `SHARED_SEQUENCE` — si se opta por perfiles.
- [ ] Prueba de emisión FE y NCE con el mismo `emission_profile_code`.
