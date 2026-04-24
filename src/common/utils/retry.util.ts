import { Logger } from '@nestjs/common';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: any) => boolean;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: (error) => {
    // Retry on network errors, 5xx errors, or specific status codes
    if (!error) return false;
    
    // Network errors (no response)
    if (error.name === 'TypeError' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return true;
    }
    
    // HTTP status codes
    const status = error.status || error.statusCode;
    if (status && status >= 500) return true; // Server errors
    if (status === 408 || status === 429) return true; // Timeout, Too Many Requests
    
    return false;
  },
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  options: RetryOptions = {},
  logger?: Logger,
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      if (attempt > 0 && logger) {
        logger.log(`[RETRY] ${context} - Attempt ${attempt}/${opts.maxRetries} after ${delay}ms delay`);
      }
      
      const result = await fn();
      
      if (attempt > 0 && logger) {
        logger.log(`[RETRY] ${context} - Success on attempt ${attempt}/${opts.maxRetries}`);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      if (!opts.retryableErrors(error)) {
        if (logger) {
          logger.warn(`[RETRY] ${context} - Non-retryable error: ${error.message}`);
        }
        throw error;
      }
      
      // If this was the last attempt, throw
      if (attempt === opts.maxRetries) {
        if (logger) {
          logger.error(`[RETRY] ${context} - Failed after ${opts.maxRetries + 1} attempts: ${error.message}`);
        }
        throw error;
      }
      
      // Wait before retry
      await sleep(delay);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }
  
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
