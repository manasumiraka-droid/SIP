import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
export type AuthConfig = {
  AUTH_MODE?: "cloudflare_access" | "preview_key";
  ACCESS_ISSUER?: string;
  ACCESS_AUDIENCE?: string;
  PREVIEW_AUTH_KEY?: string;
  PREVIEW_AUTH_EMAIL?: string;
  ENVIRONMENT?: string;
  APP_ORIGIN?: string;
  LOCAL_DEVELOPMENT_EMAIL?: string;
};
const configSchema = z.object({
  ACCESS_ISSUER: z.url().regex(/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/),
  ACCESS_AUDIENCE: z.string().min(1),
});

async function matchesSecret(candidate: string, expected: string) {
  const encoder = new TextEncoder();
  const [candidateHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(candidateHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}
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
  if (config.ENVIRONMENT === "preview" && config.AUTH_MODE === "preview_key") {
    const expected = z.string().min(32).parse(config.PREVIEW_AUTH_KEY);
    const email = z.email().parse(config.PREVIEW_AUTH_EMAIL).toLowerCase();
    if (!(await matchesSecret(token, expected))) throw new Error("Invalid key");
    return email;
  }
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
