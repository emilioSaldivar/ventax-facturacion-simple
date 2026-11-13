import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  API_BASE_PATH: z.string().default("/api/v1"),
  APP_ORIGIN: z.string().url().default("http://localhost:5173"),
  BACKOFFICE_ORIGIN: z.string().url().default("http://localhost:5174"),
  DATABASE_URL: z.string().url().default("postgres://facturacion_simple:facturacion_simple@localhost:5432/facturacion_simple"),
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  FE_API_BASE_URL: z.string().url().default("http://facturacion-electronica:8080/v1"),
  FE_API_KEY: z.string().optional(),
  FE_API_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  FE_API_ENV: z.enum(["test", "prod"]).default("test"),
  FE_GATEWAY_MODE: z.enum(["mock", "real"]).default("mock"),
  /** Solo modo mock: status canonico que devuelve GET /documentos/{uuid} (pruebas E2E). */
  FE_MOCK_CANONICAL_STATUS: z.string().trim().min(1).default("APPROVED"),
  FE_SEND_EMISSION_PROFILE_CODE: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  FE_SERVICE_NUMBERING: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  FE_OUTBOX_WORKER_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  FE_OUTBOX_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  FE_VERIFY_WORKER_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  FE_VERIFY_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  FE_VERIFY_BATCH_SIZE: z.coerce.number().int().positive().default(10),
  /** FS-24, RN-24.6: encender solo con RECONCILE_DEFERRED_ENABLED=true en FE. Sin ella, el refresh destraba documentos. */
  VERIFICACION_LOTE_SIN_REFRESH: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  /** Carga masiva de facturas (SPEC_CARGA_MASIVA_FACTURAS_v0.1). Apagada: rutas 404, sin pestana, sin worker. */
  CARGA_MASIVA_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  // SPEC_MONEDA_EXTRANJERA_v0.1, D-1: encender solo con FE segel-rc4.27 o posterior (NC en la moneda de la factura).
  FE_NC_MONEDA_EXTRANJERA: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  // SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 D-3/D-4: encender solo con FE segel-rc4.35 o posterior. Antes, POST
  // /v1/nota-credito descarta `descuento` y `descuentoGlobal` sin error y la nota saldria por el precio bruto.
  FE_NC_DESCUENTOS: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  /** RN-01b: por encima del tope de FE (20 MB) y por debajo del nginx (25 MB), para que el 413 normal lo de FE. */
  CARGA_MAX_BYTES: z.coerce.number().int().positive().default(25165824),
  CARGA_SUBIDAS_SIMULTANEAS: z.coerce.number().int().positive().default(2),
  CARGA_UPLOAD_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  CARGAS_SYNC_WORKER_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  CARGAS_SYNC_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
  VENTAX_NOTIFY_EMAIL: z.string().email().optional(),
  PUBLIC_APP_BASE_URL: z.string().url().default("https://app.factura.segel.com.py"),
  APP_VERSION: z.string().default("dev"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default("no-reply-facturacion@segel.com.py"),
  EMAIL_FROM_NAME: z.string().default("Segel Facturación Simple"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_REPLY_TO: z.string().email().optional()
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
