# Modelo Preliminar Multi-Emisor / Multi-Sucursal (v0.1)

## Objetivo
Definir una estructura de datos escalable para soportar:
- `1 emisor -> N establecimientos`
- `1 establecimiento -> N puntos de expedicion`
- Credenciales y configuraciones propias por emisor (`certificado`, `CSC`, `timbrado`, timeouts, ambiente).

No incluye implementación. Es una base de diseño para futuras migraciones y servicios.

## Principios de diseño
- Multi-tenant por emisor (aislamiento lógico por `emisor_id`).
- Historial de cambios en credenciales y timbrados (no sobrescribir sin trazabilidad).
- Versionado/estado para vigencias (`activo`, `vigente_desde`, `vigente_hasta`).
- Secretos fuera de logs y preferentemente cifrados/repositorio de secretos.

## Entidades y relaciones

### 1) `emisores`
Representa la empresa/contribuyente emisor.

Campos sugeridos:
- `id` (uuid, pk)
- `ruc_base` (varchar(8), not null)  -- ej: `80136968`
- `ruc_dv` (varchar(1), not null)    -- ej: `1`
- `ruc_completo` (varchar(10), unique, generado: `80136968-1`)
- `razon_social` (varchar(255), not null)
- `nombre_fantasia` (varchar(255), null)
- `tipo_contribuyente` (smallint, not null) -- MT v150
- `tipo_regimen` (smallint, not null)       -- MT v150
- `email_contacto` (varchar(255), null)
- `telefono_contacto` (varchar(30), null)
- `sifen_ambiente` (varchar(10), not null, default `test`) -- `test|prod`
- `activo` (boolean, default true)
- `created_at`, `updated_at`

Relaciones:
- `emisores 1 -> N establecimientos`
- `emisores 1 -> N emisor_actividades`
- `emisores 1 -> N emisor_timbrados`
- `emisor_timbrados N -> N emisor_actividades` mediante `emisor_timbrado_actividades` para cobertura operativa
- `emisores 1 -> N emisor_perfiles_emision`
- `emisores 1 -> N emisor_certificados`
- `emisores 1 -> N emisor_csc`
- `emisores 1 -> N documentos_electronicos`

### 2) `emisor_actividades`
Actividades economicas del emisor (CAT SET).

Campos sugeridos:
- `id` (uuid, pk)
- `emisor_id` (uuid, fk -> emisores.id, not null)
- `codigo_actividad` (varchar(10), not null)  -- ej: `82110`
- `descripcion_actividad` (varchar(255), not null) -- debe coincidir catalogo SET
- `es_principal` (boolean, default false)
- `activo` (boolean, default true)
- `created_at`, `updated_at`

Restricciones:
- Unique (`emisor_id`, `codigo_actividad`)

### 3) `establecimientos`
Sucursal/local del emisor (MT `dEst`, datos de direccion).

Campos sugeridos:
- `id` (uuid, pk)
- `emisor_id` (uuid, fk -> emisores.id, not null)
- `codigo_establecimiento` (char(3), not null) -- ej: `001`
- `denominacion` (varchar(255), not null)      -- ej: `CENTRAL`
- `direccion` (varchar(255), not null)
- `numero_casa` (varchar(6), not null)
- `complemento_direccion_1` (varchar(255), null)
- `complemento_direccion_2` (varchar(255), null)
- `departamento_codigo` (int, not null)
- `departamento_desc` (varchar(120), not null)
- `distrito_codigo` (int, not null)
- `distrito_desc` (varchar(120), not null)
- `ciudad_codigo` (int, not null)
- `ciudad_desc` (varchar(120), not null)
- `telefono` (varchar(30), null)
- `email` (varchar(255), null)
- `activo` (boolean, default true)
- `created_at`, `updated_at`

Restricciones:
- Unique (`emisor_id`, `codigo_establecimiento`)

Relaciones:
- `establecimientos 1 -> N puntos_expedicion`
- `establecimientos 1 -> N emisor_timbrados` (si timbrado aplica por establecimiento)

### 4) `puntos_expedicion`
Puntos de expedicion por establecimiento (MT `dPunExp`).

Campos sugeridos:
- `id` (uuid, pk)
- `establecimiento_id` (uuid, fk -> establecimientos.id, not null)
- `codigo_punto` (char(3), not null)  -- ej: `001`
- `descripcion` (varchar(255), null)
- `activo` (boolean, default true)
- `created_at`, `updated_at`

Restricciones:
- Unique (`establecimiento_id`, `codigo_punto`)

Relaciones:
- `puntos_expedicion 1 -> N numeradores_documentos`
- `puntos_expedicion 1 -> N documentos_electronicos`

### 5) `emisor_timbrados`
Timbrados del emisor (con vigencia y estado).

Campos sugeridos:
- `id` (uuid, pk)
- `emisor_id` (uuid, fk -> emisores.id, not null)
- `establecimiento_id` (uuid, fk -> establecimientos.id, null)
- `numero_timbrado` (varchar(20), not null)
- `fecha_inicio` (date, not null)
- `fecha_fin` (date, null)
- `activo` (boolean, default true)
- `vigente_desde` (timestamp, not null)
- `vigente_hasta` (timestamp, null)
- `created_at`, `updated_at`

Restricciones:
- Unique (`emisor_id`, `numero_timbrado`, `fecha_inicio`)

### 6) `emisor_timbrado_actividades`
Asociacion operativa entre actividades economicas y una configuracion de timbrado/boca de emision.

Nota de alcance:
- No representa una dependencia fiscal directa definida por SIFEN entre actividad y timbrado.
- Sirve para controlar internamente que actividades del RUC pueden usarse al emitir desde un timbrado, establecimiento, punto o tipo de documento.
- Si no existen asociaciones para un timbrado, el modo permisivo permite usar cualquier actividad activa del emisor.

Campos sugeridos:
- `id` (uuid, pk)
- `emisor_id` (uuid, fk -> emisores.id, not null)
- `timbrado_id` (uuid, fk -> emisor_timbrados.id, not null)
- `actividad_id` (uuid, fk -> emisor_actividades.id, not null)
- `establecimiento_id` (uuid, fk -> establecimientos.id, null)
- `punto_expedicion_id` (uuid, fk -> puntos_expedicion.id, null)
- `tipo_documento` (smallint, null)
- `activo` (boolean, default true)
- `vigente_desde` (timestamp, not null)
- `vigente_hasta` (timestamp, null)
- `created_at`, `updated_at`

Restricciones:
- Unique (`emisor_id`, `timbrado_id`, `actividad_id`, `establecimiento_id`, `punto_expedicion_id`, `tipo_documento`)
- Validar que `timbrado_id`, `actividad_id`, `establecimiento_id` y `punto_expedicion_id` pertenezcan al mismo `emisor_id`.

### 7) `emisor_perfiles_emision`
Unidad operativa que vincula integraciones externas, actividades economicas, timbrado, serie y numerador fiscal.

Objetivo:
- evitar que clientes externos decidan directamente serie fiscal o correlativo;
- permitir que varios perfiles compartan el mismo timbrado, establecimiento y punto;
- soportar diferentes actividades economicas sobre el mismo timbrado con reglas internas claras.

Campos sugeridos:
- `id` (uuid, pk)
- `emisor_id` (uuid, fk -> emisores.id, not null)
- `codigo` (varchar(50), not null) -- ej: `SERV`, `VENTA`, `POS_C1`
- `descripcion` (varchar(255), not null)
- `timbrado_id` (uuid, fk -> emisor_timbrados.id, not null)
- `establecimiento_id` (uuid, fk -> establecimientos.id, not null)
- `punto_expedicion_id` (uuid, fk -> puntos_expedicion.id, not null)
- `tipo_documento` (smallint, not null)
- `numerador_id` (uuid, fk -> numeradores_documentos.id, not null)
- `serie_operativa` (varchar(50), null) -- etiqueta interna/comercial, no se envia a SIFEN
- `serie_fiscal` (char(2), null) -- MT v150 `C010 dSerieNum`, si aplica
- `separation_strategy` (varchar(30), not null) -- `SHARED_SEQUENCE|FISCAL_SERIES|SEPARATE_EXPEDITION_POINT`
- `modo_actividad` (varchar(20), not null) -- `PRINCIPAL|SELECCIONADA|MULTIPLE`
- `activo` (boolean, default true)
- `vigente_desde` (timestamp, not null)
- `vigente_hasta` (timestamp, null)
- `created_at`, `updated_at`

Restricciones:
- Unique (`emisor_id`, `codigo`)
- `serie_fiscal` debe ser null o dos letras mayusculas permitidas por el MT v150.
- `numerador_id` debe pertenecer al mismo emisor, establecimiento, punto y tipo de documento.
- Si `serie_fiscal` no es null, debe coincidir con la serie fiscal del numerador asociado.
- `FISCAL_SERIES` requiere `serie_fiscal` informada.
- `SHARED_SEQUENCE` no permite repetir numeros por actividad: todas las actividades del perfil comparten la misma clave fiscal.
- `SEPARATE_EXPEDITION_POINT` requiere punto de expedicion distinto cuando se busca secuencia independiente frente a otros perfiles del mismo establecimiento/timbrado.

Notas:
- `codigo`/`serie_operativa` puede ser `SERV` o `VENTA`.
- `serie_fiscal` no debe usarse como etiqueta libre; en MT v150 corresponde a `dSerieNum` de longitud 2.

### 8) `emisor_certificados`
Certificados digitales por emisor (rotables/versionables).

Campos sugeridos:
- `id` (uuid, pk)
- `emisor_id` (uuid, fk -> emisores.id, not null)
- `alias` (varchar(120), not null)
- `storage_type` (varchar(20), not null) -- `path|vault|kms|secret_manager`
- `cert_path` (varchar(500), null)        -- si `storage_type=path`
- `cert_secret_ref` (varchar(500), null)  -- referencia segura
- `password_value` (varchar(500), not null)
- `subject` (varchar(500), null)
- `issuer` (varchar(500), null)
- `serial_number` (varchar(200), null)
- `valid_from` (timestamp, null)
- `valid_to` (timestamp, null)
- `activo` (boolean, default true)
- `vigente_desde` (timestamp, not null)
- `vigente_hasta` (timestamp, null)
- `created_at`, `updated_at`

Notas:
- Para el estado actual del proyecto se guarda `password_value` en texto plano por simplicidad operativa.

### 9) `emisor_csc`
CSC por emisor y ambiente (rotables).

Campos sugeridos:
- `id` (uuid, pk)
- `emisor_id` (uuid, fk -> emisores.id, not null)
- `ambiente` (varchar(10), not null) -- `test|prod`
- `csc_id` (varchar(10), not null)
- `csc_value` (varchar(500), not null)
- `activo` (boolean, default true)
- `vigente_desde` (timestamp, not null)
- `vigente_hasta` (timestamp, null)
- `created_at`, `updated_at`

Restricciones:
- Unique (`emisor_id`, `ambiente`, `csc_id`, `vigente_desde`)

### 10) `numeradores_documentos`
Control de numeracion por emisor/establecimiento/punto/tipo DE.

Campos sugeridos:
- `id` (uuid, pk)
- `emisor_id` (uuid, fk -> emisores.id, not null)
- `establecimiento_id` (uuid, fk -> establecimientos.id, not null)
- `punto_expedicion_id` (uuid, fk -> puntos_expedicion.id, not null)
- `tipo_documento` (smallint, not null) -- 1..8 MT
- `serie_fiscal` (char(2), null)
- `siguiente_numero` (int, not null)    -- ej base `950`
- `rango_min` (int, null)
- `rango_max` (int, null)
- `bloqueado` (boolean, default false)
- `updated_at`

Restricciones:
- Unique (`emisor_id`, `establecimiento_id`, `punto_expedicion_id`, `tipo_documento`, `serie_fiscal_normalizada`)
- `serie_fiscal` debe ser null o dos letras mayusculas permitidas por el MT v150.
- No incluir `actividad_id` en la unicidad fiscal: una actividad distinta no permite repetir el mismo numero fiscal.
- Si se necesita secuencia independiente por actividad, debe existir un perfil de emision con punto de expedicion distinto o serie fiscal valida distinta.

### 11) `documentos_electronicos` (resumen)
Documento emitido con referencias a configuraciones usadas.

Campos sugeridos:
- `id` (uuid, pk)
- `emisor_id` (uuid, fk)
- `establecimiento_id` (uuid, fk)
- `punto_expedicion_id` (uuid, fk)
- `timbrado_id` (uuid, fk)
- `certificado_id` (uuid, fk)
- `csc_id_ref` (uuid, fk -> emisor_csc.id)
- `actividades_economicas_snapshot` (jsonb, null)
- `perfil_emision_snapshot` (jsonb, null)
- `tipo_documento` (smallint)
- `numero_documento` (int)
- `cdc` (char(44), unique)
- `estado_interno` (varchar(40))
- `estado_sifen` (varchar(40))
- `codigo_respuesta_sifen` (varchar(10), null)
- `mensaje_respuesta_sifen` (text, null)
- `xml_unsigned`, `xml_signed`, `xml_qr` (text o storage ref)
- `protocolo_autorizacion` (varchar(30), null)
- `created_at`, `updated_at`

## Vista de relaciones (alto nivel)

`emisores`
-> `emisor_actividades`
-> `emisor_timbrado_actividades`
-> `emisor_perfiles_emision`
-> `establecimientos`
-> `puntos_expedicion`
-> `numeradores_documentos`
-> `documentos_electronicos`

`emisores`
-> `emisor_timbrados`
-> `emisor_timbrado_actividades`
-> `emisor_perfiles_emision`
-> `documentos_electronicos`

`emisores`
-> `emisor_certificados`
-> `documentos_electronicos`

`emisores`
-> `emisor_csc`
-> `documentos_electronicos`

## Parametros adicionales recomendados por emisor

Configurar por emisor (no global):
- `sifen_ambiente` (`test|prod`)
- `sifen_timeout_ms`
- `setapi_timeout_ms`
- `log_level_operativo` (opcional)
- `politica_reintentos_sync` (max reintentos, backoff)
- `timezone_operativa` (ej. `America/Asuncion`)
- `modo_generacion_cdc`/estrategia de `codigoSeguridadAleatorio`

Configurar por establecimiento/punto:
- Serie y numerador por tipo DE.
- Estado operativo (`activo/bloqueado`).
- Cobertura de actividades economicas por timbrado/boca de emision cuando el emisor requiera modo estricto.
- Perfiles de emision consumibles por sistemas externos (`codigo`, actividad, timbrado, punto, tipo, serie fiscal y numerador).

## Consideraciones de seguridad
- Secretos (`password`, `CSC value`) solo en `secret_ref`.
- Enmascarar secretos en logs y respuestas.
- Auditoria de cambios en credenciales/timbrados (`created_by`, `updated_by`, bitacora).

## Proximos pasos sugeridos (cuando implementemos)
1. Definir migraciones SQL iniciales para `emisores`, `establecimientos`, `puntos_expedicion`, `emisor_certificados`, `emisor_csc`, `numeradores_documentos`.
2. Crear `seed` para emisor AWAPURA (`001/001`, timbrado y configuraciones test).
3. Ajustar casos de uso para resolver configuracion por `emisor_id` en BD en lugar de `.env`.
4. Agregar cobertura operativa `emisor_timbrado_actividades` y snapshot de actividades por documento si se habilita seleccion multi-actividad.
5. Agregar `emisor_perfiles_emision` para que integraciones externas no manejen directamente serie/correlativo fiscal.
6. Agregar tests de integracion multi-emisor/multi-sucursal.
