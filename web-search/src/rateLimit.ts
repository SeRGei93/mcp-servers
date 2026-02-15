import type { RequestCount } from "./types.js";
import { CONFIG } from "./config.js";

let requestCount: RequestCount = {
  second: 0,
  month: 0,
  lastReset: Date.now(),
};

export function checkRateLimit(weight: number = 1): void {
  const now = Date.now();

  if (now - requestCount.lastReset > 1000) {
    requestCount.second = 0;
    requestCount.lastReset = now;
  }

  if (
    requestCount.second + weight > CONFIG.rateLimit.perSecond ||
    requestCount.month + weight > CONFIG.rateLimit.perMonth
  ) {
    throw new Error("Rate limit exceeded");
  }

  requestCount.second += weight;
  requestCount.month += weight;
}
