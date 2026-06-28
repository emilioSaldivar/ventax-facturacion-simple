-- Presupuestos v0.2: ciclo de vida comercial, vigencia, observaciones y tracking de catalogo

-- Vigencia del presupuesto (se auto-asigna a fecha_emision + 30 dias al emitir si es null)
ALTER TABLE notas_comerciales ADD COLUMN valido_hasta date;

-- Observaciones libres (condiciones, notas, bullet points)
ALTER TABLE notas_comerciales ADD COLUMN observaciones text;

-- Estado comercial del presupuesto (solo aplica cuando estado = 'EMITIDO')
CREATE TYPE nota_estado_comercial AS ENUM (
  'PENDIENTE_RESPUESTA',
  'ACEPTADO',
  'RECHAZADO'
);
ALTER TABLE notas_comerciales
  ADD COLUMN estado_comercial nota_estado_comercial;

-- Referencia al item de catalogo en cada fila (para preservar iva_tipo al convertir en factura)
-- ON DELETE SET NULL: si el item del catalogo se elimina, la fila de nota queda sin referencia pero no se borra
ALTER TABLE notas_comerciales_items
  ADD COLUMN catalog_item_id uuid REFERENCES catalogo_items(id) ON DELETE SET NULL;
