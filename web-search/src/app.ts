import express from "express";
import { statelessHandler } from "express-mcp-handler";
import { CONFIG } from "./config.js";
import { createServer, getAvbyBrands } from "./server.js";
import { cleanExpiredFetchCache } from "./fetch-cache.js";

const CACHE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 минут

export async function runServer(): Promise<void> {
  const rawPort = process.env.PORT ?? "3000";
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.status(200).json({
      name: CONFIG.server.name,
      version: CONFIG.server.version,
      transport: "streamable-http",
      endpoint: "/mcp",
    });
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: CONFIG.server.name,
      version: CONFIG.server.version,
    });
  });

  app.get("/mcp", (_req, res) => {
    res.status(405).set("Allow", "POST").json({
      error: "Method Not Allowed",
      message: "This server only supports POST requests (stateless mode).",
    });
  });

  app.post(
    "/mcp",
    statelessHandler(createServer, {
      onError: (error: Error) => {
        console.error("[ERROR] MCP request failed:", error);
      },
    })
  );

  app.listen(port, async () => {
    console.error(
      `[INFO] web-search-service started on http://localhost:${port}`
    );
    console.error(`[INFO] MCP endpoint: POST http://localhost:${port}/mcp`);

    const runCleanup = async () => {
      const deleted = await cleanExpiredFetchCache();
      if (deleted > 0) {
        console.error(`[INFO] fetch cache cleanup: removed ${deleted} expired file(s)`);
      }
    };

    await runCleanup();
    setInterval(runCleanup, CACHE_CLEANUP_INTERVAL_MS);

    getAvbyBrands()
      .then((brands) => console.error(`[INFO] av.by brands cache warmed: ${brands.length} brands`))
      .catch((err) => console.error(`[WARN] av.by brands cache warmup failed:`, err));
  });
}
