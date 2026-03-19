/**
 * API Error Handler & Types
 * Centralized error handling for all API calls
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Parse API error response and create ApiError
 */
export async function parseApiError(response: Response): Promise<ApiError> {
  const status = response.status;
  
  try {
    const data = await response.json();
    
    // Handle different error response formats
    const message = data.message || data.error || data.msg || "Unknown error";
    const code = data.code || data.errorCode || undefined;
    const details = data.details || data.errors || undefined;
    
    return new ApiError(status, message, code, details);
  } catch {
    // If response is not JSON, use status text
    return new ApiError(status, response.statusText || "Unknown error");
  }
}

/**
 * Wrap API fetch calls with error handling
 * @example
 * const data = await apiCall(() => fetch(url), "Failed to fetch data");
 */
export async function apiCall<T>(
  fetchFn: () => Promise<Response>,
  errorPrefix: string = "API Error"
): Promise<T> {
  try {
    const response = await fetchFn();
    
    if (!response.ok) {
      const error = await parseApiError(response);
      throw new ApiError(
        error.status,
        `${errorPrefix}: ${error.message}`,
        error.code,
        error.details
      );
    }
    
    return await response.json();
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    
    if (err instanceof Error) {
      throw new ApiError(
        0,
        `${errorPrefix}: ${err.message}`,
        "NETWORK_ERROR"
      );
    }
    
    throw new ApiError(0, `${errorPrefix}: Unknown error`, "UNKNOWN_ERROR");
  }
}

/**
 * Format error message for user display
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return "An unexpected error occurred";
}

/**
 * Check if error is a specific API status
 */
export function isApiError(
  error: unknown,
  status?: number | number[]
): error is ApiError {
  if (!(error instanceof ApiError)) return false;
  
  if (status === undefined) return true;
  
  const statuses = Array.isArray(status) ? status : [status];
  return statuses.includes(error.status);
}

/**
 * Determine if error is retriable
 */
export function isRetriableError(error: unknown): boolean {
  if (!isApiError(error)) return true; // Network errors are retriable
  
  // Retriable status codes
  const retriableCodes = [408, 429, 500, 502, 503, 504];
  return retriableCodes.includes(error.status);
}

/**
 * Retry API call with exponential backoff
 */
export async function retryApiCall<T>(
  fetchFn: () => Promise<Response>,
  errorPrefix: string = "API Error",
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall<T>(fetchFn, errorPrefix);
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      const shouldRetry = !isLastAttempt && isRetriableError(error);
      
      if (!shouldRetry) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  
  throw new ApiError(0, `${errorPrefix}: Max retries exceeded`);
}

/**
 * Validate response has required fields
 */
export function validateResponse<T>(
  data: unknown,
  requiredFields: (keyof T)[]
): data is T {
  if (typeof data !== "object" || data === null) return false;
  
  for (const field of requiredFields) {
    if (!(field in data)) return false;
  }
  
  return true;
}

/**
 * Specific error messages for common scenarios
 */
export const ERROR_MESSAGES = {
  NETWORK_ERROR: "Network connection failed. Please check your internet connection.",
  UNAUTHORIZED: "Your session has expired. Please log in again.",
  FORBIDDEN: "You don't have permission to access this resource.",
  NOT_FOUND: "The requested resource was not found.",
  VALIDATION_ERROR: "Please check your input and try again.",
  SERVER_ERROR: "Server error occurred. Please try again later.",
  TIMEOUT: "Request took too long. Please try again.",
  UNKNOWN: "An unexpected error occurred. Please try again.",
} as const;

/**
 * Get user-friendly error message
 */
export function getUserErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    switch (error.status) {
      case 401:
      case 403:
        return ERROR_MESSAGES.UNAUTHORIZED;
      case 403:
        return ERROR_MESSAGES.FORBIDDEN;
      case 404:
        return ERROR_MESSAGES.NOT_FOUND;
      case 422:
      case 400:
        return ERROR_MESSAGES.VALIDATION_ERROR;
      case 500:
      case 502:
      case 503:
      case 504:
        return ERROR_MESSAGES.SERVER_ERROR;
      case 408:
      case 504:
        return ERROR_MESSAGES.TIMEOUT;
      default:
        return error.message || ERROR_MESSAGES.UNKNOWN;
    }
  }
  
  if (error instanceof Error && error.message.includes("network")) {
    return ERROR_MESSAGES.NETWORK_ERROR;
  }
  
  return ERROR_MESSAGES.UNKNOWN;
}
