import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
export type AuthConfig = {
  ACCESS_ISSUER: string;
  ACCESS_AUDIENCE: string;
  ENVIRONMENT?: string;
  APP_ORIGIN?: string;
  LOCAL_DEVELOPMENT_EMAIL?: string;
};
const configSchema = z.object({
  ACCESS_ISSUER: z.url().regex(/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/),
  ACCESS_AUDIENCE: z.string().min(1),
});
export async function verifyAccess(
  token: string,
  config: AuthConfig,
): Promise<string> {
  const parsed = configSchema.parse(config);
  const keys = createRemoteJWKSet(
    new URL(`${parsed.ACCESS_ISSUER}/cdn-cgi/access/certs`),
  );
  return verifyAccessClaims(token, parsed, keys);
}

export async function verifyConfiguredAccess(
  token: string,
  config: AuthConfig,
): Promise<string> {
  if (
    config.ENVIRONMENT === "local" &&
    config.APP_ORIGIN === "http://localhost:5173" &&
    token === "local-development" &&
    config.LOCAL_DEVELOPMENT_EMAIL
  )
    return z.email().parse(config.LOCAL_DEVELOPMENT_EMAIL).toLowerCase();
  return verifyAccess(token, config);
}

export async function verifyAccessClaims(
  token: string,
  config: AuthConfig,
  keys: JWTVerifyGetKey,
): Promise<string> {
  const parsed = configSchema.parse(config);
  const { payload } = await jwtVerify(token, keys, {
    issuer: parsed.ACCESS_ISSUER,
    audience: parsed.ACCESS_AUDIENCE,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "iat", "sub", "email"],
  });
  return z.email().parse(payload.email).toLowerCase();
}
