import { Request, Response, NextFunction } from "express";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  message?: string;
}

const stores: Array<Map<string, RateLimitBucket>> = [];

/**
 * Clears all in-memory rate limit buckets (intended for unit tests).
 */
export const clearRateLimitBuckets = (): void => {
  for (const store of stores) {
    store.clear();
  }
};

/**
 * Lightweight fixed-window IP rate limiter for public authentication endpoints.
 * Uses req.ip (honoring Express trust proxy) and returns standard RateLimit headers.
 */
export const createRateLimiter = ({
  windowMs,
  maxRequests,
  keyPrefix,
  message = "Too many requests from this IP. Please try again later.",
}: RateLimitOptions) => {
  const bucketStore = new Map<string, RateLimitBucket>();
  stores.push(bucketStore);

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();

    // Opportunistically prune expired buckets if map grows large
    if (bucketStore.size > 5000) {
      for (const [key, entry] of bucketStore.entries()) {
        if (entry.resetAt <= now) {
          bucketStore.delete(key);
        }
      }
    }

    const clientIp =
      req.ip || req.socket?.remoteAddress || "unknown";
    const key = `${keyPrefix}:${clientIp}`;
    const existing = bucketStore.get(key);

    if (!existing || existing.resetAt <= now) {
      const fresh: RateLimitBucket = {
        count: 1,
        resetAt: now + windowMs,
      };
      bucketStore.set(key, fresh);
      res.setHeader("RateLimit-Limit", String(maxRequests));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, maxRequests - 1)));
      res.setHeader("RateLimit-Reset", String(Math.ceil(windowMs / 1000)));
      next();
      return;
    }

    existing.count += 1;
    const remaining = Math.max(0, maxRequests - existing.count);
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

    res.setHeader("RateLimit-Limit", String(maxRequests));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(retryAfterSec));

    if (existing.count > maxRequests) {
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        success: false,
        error: message,
      });
      return;
    }

    next();
  };
};

