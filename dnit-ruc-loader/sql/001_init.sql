CREATE TABLE IF NOT EXISTS dnit_ruc_contribuyentes (
    id BIGSERIAL PRIMARY KEY,
    ruc_sin_dv VARCHAR(20) NOT NULL,
    dv VARCHAR(2) NOT NULL,
    ruc VARCHAR(30) GENERATED ALWAYS AS (ruc_sin_dv || '-' || dv) STORED,
    nombre TEXT,
    apellido TEXT,
    razon_social TEXT NOT NULL,
    codigo_dnit VARCHAR(50),
    estado VARCHAR(50),
    fuente_archivo VARCHAR(120),
    fecha_importacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_dnit_ruc UNIQUE (ruc_sin_dv, dv)
);

CREATE TABLE IF NOT EXISTS dnit_ruc_contribuyentes_staging (
    id BIGSERIAL PRIMARY KEY,
    ruc_sin_dv VARCHAR(20) NOT NULL,
    dv VARCHAR(2) NOT NULL,
    nombre TEXT,
    apellido TEXT,
    razon_social TEXT NOT NULL,
    codigo_dnit VARCHAR(50),
    estado VARCHAR(50),
    fuente_archivo VARCHAR(120),
    fecha_importacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dnit_ruc ON dnit_ruc_contribuyentes (ruc);
CREATE INDEX IF NOT EXISTS idx_dnit_ruc_sin_dv ON dnit_ruc_contribuyentes (ruc_sin_dv);
CREATE INDEX IF NOT EXISTS idx_dnit_estado ON dnit_ruc_contribuyentes (estado);
CREATE INDEX IF NOT EXISTS idx_dnit_razon_social_tsv ON dnit_ruc_contribuyentes USING gin (to_tsvector('simple', razon_social));
