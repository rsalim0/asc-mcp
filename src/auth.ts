import jwt from "jsonwebtoken";
import { readFileSync } from "node:fs";

export interface AscCredentials {
  keyId: string;
  issuerId: string;
  privateKey: string;
  vendorNumber?: string;
}

export function loadCredentialsFromEnv(): AscCredentials {
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
  const keyPath = process.env.APP_STORE_CONNECT_P8_PATH;
  const inlineKey = process.env.APP_STORE_CONNECT_P8;
  const vendorNumber = process.env.APP_STORE_CONNECT_VENDOR_NUMBER;

  if (!keyId) throw new Error("APP_STORE_CONNECT_KEY_ID is required");
  if (!issuerId) throw new Error("APP_STORE_CONNECT_ISSUER_ID is required");

  let privateKey: string;
  if (inlineKey) {
    privateKey = inlineKey.replace(/\\n/g, "\n");
  } else if (keyPath) {
    privateKey = readFileSync(keyPath, "utf8");
  } else {
    throw new Error(
      "APP_STORE_CONNECT_P8_PATH or APP_STORE_CONNECT_P8 is required",
    );
  }

  return { keyId, issuerId, privateKey, vendorNumber };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export function generateToken(creds: AscCredentials): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }

  const expiresIn = 20 * 60;
  const token = jwt.sign(
    {
      iss: creds.issuerId,
      iat: now,
      exp: now + expiresIn,
      aud: "appstoreconnect-v1",
    },
    creds.privateKey,
    {
      algorithm: "ES256",
      header: { alg: "ES256", kid: creds.keyId, typ: "JWT" },
    },
  );

  cachedToken = { token, expiresAt: now + expiresIn };
  return token;
}
