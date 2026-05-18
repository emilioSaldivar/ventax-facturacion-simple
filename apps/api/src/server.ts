import { env } from "./config/env";
import { createApp } from "./app";
import { logger } from "./shared/logging/logger";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, basePath: env.API_BASE_PATH }, "API listening");
});

