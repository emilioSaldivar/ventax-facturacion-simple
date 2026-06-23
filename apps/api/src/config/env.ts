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
  FE_API_BASE_URL: z.string().url().default("https://fe-api.ventax.app/fcws"),
  FE_API_KEY: z.string().optional(),
  FE_API_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  FE_API_ENV: z.enum(["test", "prod"]).default("test"),
  FE_GATEWAY_MODE: z.enum(["mock", "real"]).default("mock"),
  FE_SEND_EMISSION_PROFILE_CODE: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  FE_SERVICE_NUMBERING: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  FE_OUTBOX_WORKER_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  FE_OUTBOX_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  PUBLIC_APP_BASE_URL: z.string().url().default("https://factura.ventax.app"),
  APP_VERSION: z.string().default("dev"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default("facturacion@ventax.app"),
  EMAIL_FROM_NAME: z.string().default("Ventax Facturación Simple"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_REPLY_TO: z.string().email().optional()
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
