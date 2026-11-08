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

-- Sin indices extra (SPEC_INDICES_PADRON_DNIT_v0.1, FS-42): las consultas filtran por (ruc_sin_dv, dv)
-- o por ruc_sin_dv, y las cubre uq_dnit_ruc. La migracion 0039 de la API los quita donde ya existen.
