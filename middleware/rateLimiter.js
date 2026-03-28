import rateLimit from 'express-rate-limit';
import { logRateLimitHit } from '../services/logger.js';

// Store for tracking per-user limits (in production, use Redis)
const userLimitStore = new Map();

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of userLimitStore.entries()) {
    if (now - data.lastReset > 3600000) { // 1 hour
      userLimitStore.delete(key);
    }
  }
}, 600000);

// Custom key generator based on user ID
const getUserKey = (req) => {
  return req.user?.id ? `user_${req.user.id}` : `ip_${req.ip}`;
};

// Custom store for per-user rate limiting
class UserRateLimitStore {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const data = this.store.get(key);
    if (!data) return { totalHits: 0, resetTime: Date.now() + 3600000 };
    return data;
  }

  set(key, value) {
    this.store.set(key, value);
  }

  reset(key) {
    this.store.delete(key);
  }

  increment(key) {
    const data = this.get(key);
    const now = Date.now();

    if (now > data.resetTime) {
      this.set(key, { totalHits: 1, resetTime: now + 3600000 });
      return 1;
    }

    const newCount = (data.totalHits || 0) + 1;
    this.set(key, { ...data, totalHits: newCount });
    return newCount;
  }
}

const store = new UserRateLimitStore();

// Rate limiters for different endpoints
export const createRateLimiter = (windowMs = 3600000, max = 100) => {
  return (req, res, next) => {
    const key = getUserKey(req);
    const count = store.increment(key);

    if (count > max) {
      logRateLimitHit(req.user?.id || 'anonymous', req.path, max);
      return res.status(429).json({
        status: 'error',
        message: 'Too many requests. Please try again later.',
        retryAfter: 3600,
      });
    }

    res.set('X-RateLimit-Limit', max);
    res.set('X-RateLimit-Remaining', Math.max(0, max - count));
    res.set('X-RateLimit-Reset', new Date(store.get(key).resetTime).toISOString());

    next();
  };
};

// Per-endpoint rate limiters
export const analyzeLimiter = createRateLimiter(3600000, 100); // 100 per hour
export const generateLimiter = createRateLimiter(3600000, 100); // 100 per hour
export const optimizeLimiter = createRateLimiter(3600000, 200); // 200 per hour
export const atsLimiter = createRateLimiter(3600000, 150); // 150 per hour
export const compilePdfLimiter = createRateLimiter(3600000, 300); // 300 per hour

export { store as rateLimitStore };
