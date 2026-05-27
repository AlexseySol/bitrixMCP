import type { RequestHandler } from "express";

interface RateWindow {
  count: number;
  resetAt: number;
}

function createRateLimiter(maxRequests: number, windowMs: number): RequestHandler {
  const windows = new Map<string, RateWindow>();

  // Cleanup old entries every minute
  setInterval(() => {
    const now = Date.now();
    for (const [key, win] of windows) {
      if (win.resetAt < now) windows.delete(key);
    }
  }, 60_000).unref();

  return (req, res, next) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress
      ?? "unknown";

    const now = Date.now();
    let win = windows.get(ip);

    if (!win || win.resetAt < now) {
      win = { count: 0, resetAt: now + windowMs };
      windows.set(ip, win);
    }

    win.count++;

    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - win.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(win.resetAt / 1000));

    if (win.count > maxRequests) {
      res.status(429).json({ error: "Too many requests. Please try again later." });
      return;
    }
    next();
  };
}

// 10 requests per 10 minutes for authorize endpoint
export const authorizeRateLimit = createRateLimiter(10, 10 * 60 * 1000);

// 30 requests per minute for token endpoint
export const tokenRateLimit = createRateLimiter(30, 60 * 1000);

// 120 requests per minute for MCP endpoint (per IP — token-level limiting is harder without DB)
export const mcpRateLimit = createRateLimiter(120, 60 * 1000);
