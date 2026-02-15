import { runServer } from "./app.js";

process.on("uncaughtException", (error) => {
  console.error("[FATAL] Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
  process.exit(1);
});

runServer().catch((error) => {
  console.error("[FATAL] Failed to start server:", error);
  process.exit(1);
});
