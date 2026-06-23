import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../../shared/errors/http-error";
import { authRepository } from "./auth.repository";
import { verifyAccessToken } from "./token.service";
import type { AuthRepository, AuthenticatedUser } from "./auth.types";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Rutas accesibles con JWT de scope onboarding_only
const ONBOARDING_WHITELIST = ["/onboarding/", "/auth/logout"];

export const requireAuth = createRequireAuth(authRepository);

export function createRequireAuth(repository: Pick<AuthRepository, "findActiveUserById">) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.get("authorization");
      const token = parseBearerToken(header);
      if (!token) {
        throw new HttpError(401, "AUTH_REQUIRED", "Token de acceso requerido.");
      }

      const payload = verifyAccessToken(token);

      if (payload.scope === "onboarding_only") {
        const isAllowed = ONBOARDING_WHITELIST.some((prefix) => req.path.startsWith(prefix));
        if (!isAllowed) {
          throw new HttpError(
            403,
            "ONBOARDING_REQUIRED",
            "Debes completar el proceso de activacion antes de usar la plataforma."
          );
        }
      }

      const user = await repository.findActiveUserById(payload.sub);
      if (!user) {
        throw new HttpError(401, "AUTH_REQUIRED", "Usuario no autenticado o inactivo.");
      }

      req.user = user;
      next();
    } catch (error) {
      if (error instanceof HttpError) {
        next(error);
        return;
      }
      next(new HttpError(401, "AUTH_REQUIRED", "Token de acceso invalido."));
    }
  };
}

function parseBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) {
    return null;
  }

  return token;
}
