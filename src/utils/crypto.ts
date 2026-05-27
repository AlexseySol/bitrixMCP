import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { config } from "../config.js";

// Derive a fixed 32-byte key from the ENCRYPTION_KEY env var
function deriveKey(): Buffer {
  return scryptSync(config.ENCRYPTION_KEY, "bitrix-mcp-salt-v1", 32);
}

const KEY = deriveKey();

export interface TokenPayload {
  webhook: string;
  bitrixUserId: number;
  bitrixDomain: string;
  bitrixUserName: string;
}

// Encrypt webhook URL + user info into a compact token string
export function encryptToken(payload: TokenPayload): string {
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const json = JSON.stringify({
    w: payload.webhook,
    u: payload.bitrixUserId,
    d: payload.bitrixDomain,
    n: payload.bitrixUserName,
  });
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Layout: [IV 12B][AuthTag 16B][Ciphertext]
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

// Decrypt token and return payload, throws on invalid token
export function decryptToken(token: string): TokenPayload {
  const buf = Buffer.from(token, "base64url");
  if (buf.length < 29) throw new Error("Invalid token");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  const data = JSON.parse(decrypted) as { w: string; u: number; d: string; n: string };
  return {
    webhook: data.w,
    bitrixUserId: data.u,
    bitrixDomain: data.d,
    bitrixUserName: data.n,
  };
}

export function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function generateRandomString(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const expected = createHash("sha256").update(codeVerifier).digest("base64url");
  // Constant-time compare
  if (expected.length !== codeChallenge.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ (codeChallenge.charCodeAt(i) ?? 0);
  }
  return diff === 0;
}
