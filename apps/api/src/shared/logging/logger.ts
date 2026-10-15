import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "*.password",
      "*.passwordHash",
      "*.accessToken",
      "*.refreshToken",
      "*.FE_API_KEY",
      "*.apiKey",
      "*.api_key",
      "*.fe_consumer_api_key"
    ],
    censor: "[redacted]"
  }
});

