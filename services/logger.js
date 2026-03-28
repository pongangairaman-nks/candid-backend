import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, '../logs');

const isDev = process.env.NODE_ENV !== 'production';

// Custom format for logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create logger instance
export const logger = winston.createLogger({
  level: isDev ? 'debug' : 'info',
  format: logFormat,
  defaultMeta: { service: 'resume-automation' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta)?.length || 0 > 0 ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      ),
    }),
    // File transport with daily rotation
    new DailyRotateFile({
      filename: path.join(logsDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxDays: '14d',
      format: logFormat,
    }),
    // Error file transport
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxDays: '14d',
      format: logFormat,
    }),
  ],
});

// Mask sensitive data in logs
const maskSensitiveData = (data) => {
  if (!data) return data;

  const sensitiveFields = ['apiKey', 'password', 'token', 'secret', 'key'];
  const masked = { ...data };

  sensitiveFields.forEach((field) => {
    if (masked?.[field]) {
      masked[field] = '***MASKED***';
    }
  });

  return masked;
};

// Structured logging for LLM operations
export const logLLMOperation = (operationData) => {
  const {
    user_id,
    phase,
    provider,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    latencyMs,
    endpoint,
    status,
    error,
  } = operationData;

  logger.info('LLM_OPERATION', {
    user_id,
    phase,
    provider,
    model,
    tokens: { input: inputTokens, output: outputTokens, total: totalTokens },
    latencyMs,
    endpoint,
    status,
    timestamp: new Date().toISOString(),
    ...(error && { error: error.message }),
  });
};

// Structured logging for API requests
export const logAPIRequest = (req, res, responseTime) => {
  logger.info('API_REQUEST', {
    method: req.method,
    path: req.path,
    user_id: req.user?.id || 'anonymous',
    statusCode: res.statusCode,
    responseTimeMs: responseTime,
    timestamp: new Date().toISOString(),
  });
};

// Structured logging for errors
export const logError = (errorData) => {
  const { user_id, endpoint, error, context } = errorData;

  logger.error('API_ERROR', {
    user_id,
    endpoint,
    error: error.message,
    stack: error.stack,
    context: maskSensitiveData(context),
    timestamp: new Date().toISOString(),
  });
};

// Structured logging for rate limit hits
export const logRateLimitHit = (user_id, endpoint, limit) => {
  logger.warn('RATE_LIMIT_HIT', {
    user_id,
    endpoint,
    limit,
    timestamp: new Date().toISOString(),
  });
};

// Structured logging for feature flag toggles
export const logFeatureFlagToggle = (user_id, flagName, newValue, oldValue) => {
  logger.info('FEATURE_FLAG_TOGGLE', {
    user_id,
    flagName,
    newValue,
    oldValue,
    timestamp: new Date().toISOString(),
  });
};

export default logger;
