import { generateRandomString } from "../utils/crypto.js";
import type { TokenPayload } from "../utils/crypto.js";

// ---- Auth codes (in-memory, 10 min TTL, one-time use) ----

interface AuthCodeEntry {
  payload: TokenPayload;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: number;
}

const authCodes = new Map<string, AuthCodeEntry>();

export function createAuthCode(params: AuthCodeEntry): string {
  const code = generateRandomString(32);
  authCodes.set(code, params);
  return code;
}

export function consumeAuthCode(code: string): AuthCodeEntry | null {
  const entry = authCodes.get(code);
  authCodes.delete(code); // always delete — prevent replay even on expired codes
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry;
}

// ---- Dynamic Client Registration (in-memory, survives for server lifetime) ----

export interface RegisteredClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: string;
}

const clients = new Map<string, RegisteredClient>();

export function registerClient(params: Omit<RegisteredClient, "clientId">): RegisteredClient {
  const client: RegisteredClient = { clientId: generateRandomString(16), ...params };
  clients.set(client.clientId, client);
  return client;
}

export function getClient(clientId: string): RegisteredClient | null {
  return clients.get(clientId) ?? null;
}

// Purge expired auth codes every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [code, entry] of authCodes) {
      if (entry.expiresAt < now) authCodes.delete(code);
    }
  },
  5 * 60 * 1000,
).unref();
