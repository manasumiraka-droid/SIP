import { createHash } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { expect, it } from "vitest";
import {
  verifyAccessClaims,
  verifyConfiguredAccess,
} from "../apps/worker/src/auth";

it("allows the fixed development assertion only for the explicit localhost environment", async () => {
  const local = {
    ACCESS_ISSUER: "https://local-demo.cloudflareaccess.com",
    ACCESS_AUDIENCE: "local-demo",
    ENVIRONMENT: "local",
    APP_ORIGIN: "http://localhost:5173",
    LOCAL_DEVELOPMENT_EMAIL: "DEMO@example.invalid",
  };
  expect(await verifyConfiguredAccess("local-development", local)).toBe(
    "demo@example.invalid",
  );
  await expect(
    verifyConfiguredAccess("local-development", {
      ...local,
      ENVIRONMENT: "production",
    }),
  ).rejects.toThrow();
});
it("allows a strong preview key only in the preview key mode", async () => {
  const previewKey = "synthetic-preview-key-that-is-long-enough";
  const config = {
    AUTH_MODE: "preview_key" as const,
    ENVIRONMENT: "preview",
    APP_ORIGIN: "https://preview.example.invalid",
    PREVIEW_AUTH_KEY_HASH: createHash("sha256")
      .update(previewKey)
      .digest("hex"),
    PREVIEW_AUTH_EMAIL: "ADMIN@example.invalid",
  };
  expect(await verifyConfiguredAccess(previewKey, config)).toBe(
    "admin@example.invalid",
  );
  await expect(verifyConfiguredAccess("wrong-key", config)).rejects.toThrow();
  await expect(
    verifyConfiguredAccess(previewKey, {
      ...config,
      ENVIRONMENT: "production",
    }),
  ).rejects.toThrow();
});
it("cryptographically validates signature, expiry, issuer and audience", async () => {
  const pair = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const keys = createLocalJWKSet({ keys: [await exportJWK(pair.publicKey)] });
  const config = {
    ACCESS_ISSUER: "https://test.cloudflareaccess.com",
    ACCESS_AUDIENCE: "synthetic-audience",
  };
  const sign = (
    audience = config.ACCESS_AUDIENCE,
    issuer = config.ACCESS_ISSUER,
    expiry = "5m",
    key = pair.privateKey,
  ) =>
    new SignJWT({ email: "USER@example.invalid" })
      .setProtectedHeader({ alg: "RS256" })
      .setSubject("synthetic-user")
      .setIssuedAt()
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime(expiry)
      .sign(key);
  expect(await verifyAccessClaims(await sign(), config, keys)).toBe(
    "user@example.invalid",
  );
  await expect(
    verifyAccessClaims(await sign("other"), config, keys),
  ).rejects.toThrow();
  await expect(
    verifyAccessClaims(
      await sign(config.ACCESS_AUDIENCE, "https://other.cloudflareaccess.com"),
      config,
      keys,
    ),
  ).rejects.toThrow();
  await expect(
    verifyAccessClaims(
      await sign(config.ACCESS_AUDIENCE, config.ACCESS_ISSUER, "-1m"),
      config,
      keys,
    ),
  ).rejects.toThrow();
  await expect(
    verifyAccessClaims(
      await sign(
        config.ACCESS_AUDIENCE,
        config.ACCESS_ISSUER,
        "5m",
        other.privateKey,
      ),
      config,
      keys,
    ),
  ).rejects.toThrow();
});
