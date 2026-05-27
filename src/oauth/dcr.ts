import type { RequestHandler } from "express";
import { registerClient } from "../store/memory.js";

const ALLOWED_SCHEMES = ["https:", "http:"] as const;

function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    // Block javascript: data: and other dangerous schemes
    if (!(ALLOWED_SCHEMES as readonly string[]).includes(parsed.protocol)) return false;
    // Block URIs with credentials embedded
    if (parsed.username || parsed.password) return false;
    return true;
  } catch {
    return false;
  }
}

// Dynamic Client Registration — RFC 7591
// Claude.ai calls this automatically before starting the OAuth flow.
export const dcrHandler: RequestHandler = (req, res) => {
  const body = req.body as {
    client_name?: string;
    redirect_uris?: unknown;
    grant_types?: string[];
    response_types?: string[];
    token_endpoint_auth_method?: string;
  };

  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
    res.status(400).json({
      error: "invalid_client_metadata",
      error_description: "redirect_uris must be a non-empty array",
    });
    return;
  }

  const redirectUris = body.redirect_uris as string[];

  for (const uri of redirectUris) {
    if (typeof uri !== "string" || !isValidRedirectUri(uri)) {
      res.status(400).json({
        error: "invalid_redirect_uri",
        error_description: `Invalid redirect URI: ${uri}`,
      });
      return;
    }
  }

  const client = registerClient({
    clientName: typeof body.client_name === "string" ? body.client_name : "Unknown Client",
    redirectUris,
    grantTypes: Array.isArray(body.grant_types) ? body.grant_types : ["authorization_code"],
    responseTypes: Array.isArray(body.response_types) ? body.response_types : ["code"],
    tokenEndpointAuthMethod:
      typeof body.token_endpoint_auth_method === "string"
        ? body.token_endpoint_auth_method
        : "none",
  });

  res.status(201).json({
    client_id: client.clientId,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    grant_types: client.grantTypes,
    response_types: client.responseTypes,
    token_endpoint_auth_method: client.tokenEndpointAuthMethod,
    client_secret_expires_at: 0,
  });
};
