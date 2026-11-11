import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createApiClient } from "./cliente";

export type ClienteApi = ReturnType<typeof createApiClient>;

const ApiContext = createContext<ClienteApi | null>(null);

/**
 * Un solo cliente de API por sesion (PAUTAS_FRONTEND_v0.1 P-D2; PLAN_UX_RESTO_APP_v0.1 §10.4). Lo arma App con su
 * token y su setter, asi una renovacion hecha desde cualquier vista (o desde el onboarding) actualiza la sesion.
 */
export function ApiProvider({
  accessToken,
  setAccessToken,
  children
}: {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  children: ReactNode;
}) {
  const api = useMemo(() => createApiClient(accessToken, setAccessToken), [accessToken, setAccessToken]);
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): ClienteApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi se usa dentro de ApiProvider.");
  return api;
}
