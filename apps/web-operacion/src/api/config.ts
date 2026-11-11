export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

export const BUILD_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "dev";
