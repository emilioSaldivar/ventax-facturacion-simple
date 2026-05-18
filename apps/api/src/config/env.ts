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
  PUBLIC_APP_BASE_URL: z.string().url().default("https://factura.ventax.app")
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
