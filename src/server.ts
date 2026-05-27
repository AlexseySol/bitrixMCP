import express, { type Request, type Response, type NextFunction } from "express";
import { pinoHttp } from "pino-http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { decryptToken } from "./utils/crypto.js";
import { oauthProtectedResource, oauthAuthorizationServer } from "./oauth/discovery.js";
import { dcrHandler } from "./oauth/dcr.js";
import { authorizeGet, authorizePost } from "./oauth/authorize.js";
import { tokenHandler } from "./oauth/token.js";
import { createMcpServer } from "./mcp/factory.js";
import { authorizeRateLimit, tokenRateLimit, mcpRateLimit } from "./middleware/ratelimit.js";

const app = express();

// ---- Request logging ----
app.use(
  pinoHttp({
    logger,
    // Suppress health check noise
    autoLogging: { ignore: (req) => req.url === "/health" },
    customLogLevel: (_req, res) => (res.statusCode >= 500 ? "error" : "info"),
    redact: ["req.headers.authorization"],
  }),
);

// ---- Body parsers ----
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

// ---- Security headers ----
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
  );
  next();
});

// ---- CORS (exact origin matching — no substring attacks) ----
const CORS_ORIGINS = new Set(["https://claude.ai", config.BASE_URL]);

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;

  if (origin && CORS_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Session-Id");
    res.setHeader("Access-Control-Expose-Headers", "MCP-Session-Id");
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

// ---- Health check ----
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: Math.floor(process.uptime()) });
});

// ---- OAuth discovery ----
app.get("/.well-known/oauth-protected-resource", oauthProtectedResource);
app.get("/.well-known/oauth-authorization-server", oauthAuthorizationServer);

// ---- Dynamic Client Registration (RFC 7591) ----
app.post("/register", dcrHandler);

// ---- Authorization flow ----
app.get("/authorize", authorizeRateLimit, authorizeGet);
app.post("/authorize", authorizeRateLimit, authorizePost);

// ---- Token exchange ----
app.post("/token", tokenRateLimit, tokenHandler);

// ---- MCP endpoint (Streamable HTTP transport) ----
// Only GET (SSE), POST (requests), DELETE (session close) per MCP spec
const mcpHandler = async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      error: "unauthorized",
      error_description: "Bearer token required. Connect this server via Claude.ai first.",
    });
    return;
  }

  const rawToken = authHeader.slice(7);

  let ctx;
  try {
    ctx = decryptToken(rawToken);
  } catch {
    res.status(401).json({
      error: "invalid_token",
      error_description: "Token is invalid or was encrypted with a different key",
    });
    return;
  }

  // Fresh server + transport per request — fully stateless multi-tenant.
  // sessionIdGenerator: undefined means no mcp-session-id header is ever sent.
  // Claude won't try to reuse a session ID, so every POST is handled independently.
  const mcpServer = createMcpServer(ctx);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error({ err, domain: ctx.bitrixDomain }, "MCP request failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error" });
    }
  } finally {
    await mcpServer.close().catch(() => {});
  }
};

app.get("/mcp", mcpRateLimit, mcpHandler);
app.post("/mcp", mcpRateLimit, mcpHandler);
app.delete("/mcp", mcpRateLimit, mcpHandler);

// ---- 404 fallback ----
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "not_found" });
});

// ---- Start ----
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "Bitrix24 MCP Server running");
  logger.info(`Add to Claude.ai → Connectors: ${config.BASE_URL}/mcp`);
});

// Graceful shutdown
const shutdown = () => {
  logger.info("Shutting down...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export default app;
