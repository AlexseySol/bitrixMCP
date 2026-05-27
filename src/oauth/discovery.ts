import type { RequestHandler } from "express";
import { config } from "../config.js";

export const oauthProtectedResource: RequestHandler = (_req, res) => {
  res.json({
    resource: config.BASE_URL,
    authorization_servers: [config.BASE_URL],
  });
};

export const oauthAuthorizationServer: RequestHandler = (_req, res) => {
  const base = config.BASE_URL;
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["bitrix24"],
  });
};
