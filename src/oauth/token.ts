import type { RequestHandler } from "express";
import { consumeAuthCode } from "../store/memory.js";
import { encryptToken, verifyPkce } from "../utils/crypto.js";
import { logger } from "../utils/logger.js";

// POST /token — exchange authorization code for an access token.
// The access token IS the AES-256-GCM encrypted webhook payload (stateless).
export const tokenHandler: RequestHandler = (req, res) => {
  const { grant_type, code, redirect_uri, client_id, code_verifier } =
    req.body as Record<string, string | undefined>;

  if (grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }

  if (!code || !code_verifier || !redirect_uri || !client_id) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "Missing required parameters: code, code_verifier, redirect_uri, client_id",
    });
    return;
  }

  const entry = consumeAuthCode(code);
  if (!entry) {
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Authorization code is expired, already used, or invalid",
    });
    return;
  }

  if (entry.clientId !== client_id) {
    res.status(400).json({ error: "invalid_grant", error_description: "client_id mismatch" });
    return;
  }

  if (entry.redirectUri !== redirect_uri) {
    res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
    return;
  }

  if (!verifyPkce(code_verifier, entry.codeChallenge)) {
    res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
    return;
  }

  // Encrypt the webhook payload directly into the access token — no database needed
  const accessToken = encryptToken(entry.payload);

  logger.info(
    { domain: entry.payload.bitrixDomain, userId: entry.payload.bitrixUserId },
    "OAuth: access token issued",
  );

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    scope: "bitrix24",
  });
};
