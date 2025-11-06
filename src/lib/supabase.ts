import { createClient } from '@supabase/supabase-js';
import { appConfig } from './config';

// Connection health monitoring
interface ConnectionHealth {
  isHealthy: boolean;
  lastSuccessfulQuery: Date | null;
  consecutiveFailures: number;
  lastError: string | null;
}

// Session health monitoring
interface SessionHealth {
  isValid: boolean;
  lastValidated: Date | null;
  refreshFailures: number;
  lastRefreshAttempt: Date | null;
  needsReauth: boolean;
}

export const connectionHealth: ConnectionHealth = {
  isHealthy: true,
  lastSuccessfulQuery: null,
  consecutiveFailures: 0,
  lastError: null
};

export const sessionHealth: SessionHealth = {
  isValid: true,
  lastValidated: null,
  refreshFailures: 0,
  lastRefreshAttempt: null,
  needsReauth: false
};

// Health monitoring functions
export const updateConnectionHealth = (success: boolean, error?: string) => {
  if (success) {
    connectionHealth.isHealthy = true;
    connectionHealth.lastSuccessfulQuery = new Date();
    connectionHealth.consecutiveFailures = 0;
    connectionHealth.lastError = null;
  } else {
    connectionHealth.consecutiveFailures++;
    connectionHealth.lastError = error || 'Unknown error';
    
    // Mark as unhealthy after 3 consecutive failures
    if (connectionHealth.consecutiveFailures >= 3) {
      connectionHealth.isHealthy = false;
      console.warn('🔴 Database connection marked as unhealthy after 3 consecutive failures');
    }
  }
};

export const getConnectionStatus = () => {
  const timeSinceLastSuccess = connectionHealth.lastSuccessfulQuery 
    ? Date.now() - connectionHealth.lastSuccessfulQuery.getTime()
    : null;
  
  return {
    ...connectionHealth,
    timeSinceLastSuccessMs: timeSinceLastSuccess,
    shouldReconnect: !connectionHealth.isHealthy && timeSinceLastSuccess && timeSinceLastSuccess > 60000 // 1 minute
  };
};

// Session health monitoring functions
export const updateSessionHealth = (isValid: boolean, refreshFailed: boolean = false) => {
  sessionHealth.isValid = isValid;
  sessionHealth.lastValidated = new Date();
  
  if (refreshFailed) {
    sessionHealth.refreshFailures++;
    sessionHealth.lastRefreshAttempt = new Date();
    
    // Mark as needing reauth after 2 consecutive refresh failures
    if (sessionHealth.refreshFailures >= 2) {
      sessionHealth.needsReauth = true;
      sessionHealth.isValid = false;
    }
  } else if (isValid) {
    // Reset failures on successful validation
    sessionHealth.refreshFailures = 0;
    sessionHealth.needsReauth = false;
  }
};

export const getSessionStatus = () => {
  const timeSinceLastValidation = sessionHealth.lastValidated 
    ? Date.now() - sessionHealth.lastValidated.getTime()
    : null;
  
  const timeSinceLastRefresh = sessionHealth.lastRefreshAttempt
    ? Date.now() - sessionHealth.lastRefreshAttempt.getTime()
    : null;
  
  return {
    ...sessionHealth,
    timeSinceLastValidationMs: timeSinceLastValidation,
    timeSinceLastRefreshMs: timeSinceLastRefresh,
    shouldRevalidate: !sessionHealth.isValid || (timeSinceLastValidation && timeSinceLastValidation > 300000) // 5 minutes
  };
};

// Validate current session
export const validateSession = async (): Promise<boolean> => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.warn('Session validation error:', error);
      updateSessionHealth(false, true);
      return false;
    }
    
    if (!session) {
      updateSessionHealth(false);
      return false;
    }
    
    // Check if token is close to expiry (within 5 minutes)
    const expiresAt = new Date((session.expires_at || 0) * 1000);
    const now = new Date();
    const timeToExpiry = expiresAt.getTime() - now.getTime();
    
    if (timeToExpiry < 300000) { // Less than 5 minutes
      console.log('Session expires soon, attempting refresh...');
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        console.error('Session refresh failed:', refreshError);
        updateSessionHealth(false, true);
        return false;
      }
      
      updateSessionHealth(true);
      return !!refreshedSession;
    }
    
    updateSessionHealth(true);
    return true;
  } catch (error) {
    console.error('Session validation failed:', error);
    updateSessionHealth(false, true);
    return false;
  }
};

// Connection pool management
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 6; // Limit concurrent requests to prevent pool exhaustion
const requestQueue: Array<() => void> = [];

const manageConnectionPool = async (requestFn: () => Promise<Response>): Promise<Response> => {
  // If we're at max capacity, queue the request
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise<void>((resolve) => {
      requestQueue.push(resolve);
    });
  }

  activeRequests++;

  try {
    const response = await requestFn();
    return response;
  } finally {
    activeRequests--;

    // Process next queued request
    const nextRequest = requestQueue.shift();
    if (nextRequest) {
      nextRequest();
    }
  }
};

export const supabase = createClient(
  appConfig.supabaseUrl,
  appConfig.supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        'X-Client-Info': 'nextkalk-web-app'
      },
      fetch: (url, options = {}) => {
        return manageConnectionPool(async () => {
          // Reduce timeout to 15 seconds to fail faster and free up connections
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout (reduced from 30)

          try {
            const response = await fetch(url, {
              ...options,
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Track successful connections
            if (response.ok) {
              updateConnectionHealth(true);
            } else if (response.status >= 500) {
              updateConnectionHealth(false, `Server error: ${response.status}`);
            }

            return response;
          } catch (error) {
            clearTimeout(timeoutId);

            // Track connection failures
            if (error instanceof Error && error.name === 'AbortError') {
              updateConnectionHealth(false, 'Request timeout');
              throw new Error('Request timed out after 15 seconds');
            }

            updateConnectionHealth(false, error instanceof Error ? error.message : 'Unknown error');
            throw error;
          }
        });
      }
    },
    realtime: {
      params: {
        eventsPerSecond: 2 // Reduced from 10 to prevent connection spam
      }
    }
  }
);

// Proactive IndexedDB cleanup for Edge browser compatibility
// This runs on every page load to prevent stale session issues in Edge
export const clearSupabaseIndexedDB = async (): Promise<void> => {
  if (typeof window === 'undefined' || !indexedDB.databases) return;

  try {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name?.includes('supabase')) {
        indexedDB.deleteDatabase(db.name);
        console.log('🔵 Proactively cleared IndexedDB:', db.name);
      }
    }
  } catch (error) {
    console.warn('Could not proactively clear IndexedDB:', error);
  }
};

// Helper function to check and clean stale sessions
export const cleanStaleSession = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  try {
    // CRITICAL FOR EDGE: Clear IndexedDB proactively on every session check
    // Edge aggressively caches IndexedDB even with no-cache headers
    await clearSupabaseIndexedDB();

    // First, check timestamp-based expiry in localStorage
    const keys = Object.keys(localStorage);
    const supabaseKeys = keys.filter(key => key.includes('supabase.auth.token'));

    supabaseKeys.forEach(key => {
      try {
        const item = localStorage.getItem(key);
        if (!item) return;

        const parsed = JSON.parse(item);
        if (parsed && typeof parsed === 'object' && parsed.expires_at) {
          const expiresAt = new Date(parsed.expires_at * 1000);
          const now = new Date();
          if (now > expiresAt) {
            console.warn('🔴 Removing expired session from cache (timestamp)');
            localStorage.removeItem(key);
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    // Now validate the session server-side
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.warn('🔴 Session validation error, clearing storage:', error.message);
      localStorage.clear();
      sessionStorage.clear();
      updateSessionHealth(false, true);
      return false;
    }

    if (session) {
      // Try to refresh the session to ensure it's actually valid on the server
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError) {
        console.warn('🔴 Session refresh failed, clearing stale session:', refreshError.message);
        localStorage.clear();
        sessionStorage.clear();
        updateSessionHealth(false, true);
        return false;
      }

      if (!refreshedSession) {
        console.warn('🔴 No refreshed session returned, clearing storage');
        localStorage.clear();
        sessionStorage.clear();
        updateSessionHealth(false, true);
        return false;
      }

      // Session is valid
      updateSessionHealth(true);
      return true;
    }

    // No session found
    return false;
  } catch (error) {
    console.error('Error cleaning stale session:', error);
    // On any error, clear all storage to be safe (including IndexedDB for Edge browser)
    localStorage.clear();
    sessionStorage.clear();

    // Clear IndexedDB for Edge browser compatibility
    try {
      const databases = await indexedDB.databases();
      for (const db of databases) {
        if (db.name?.includes('supabase')) {
          indexedDB.deleteDatabase(db.name);
          console.log('🔴 Cleared IndexedDB:', db.name);
        }
      }
    } catch (idbError) {
      console.warn('Could not clear IndexedDB:', idbError);
    }

    updateSessionHealth(false, true);
    return false;
  }
};

// Helper function for complete logout
export const completeLogout = async () => {
  try {
    // Sign out from Supabase
    await supabase.auth.signOut({ scope: 'local' });

    // Clear all possible storage
    localStorage.clear();
    sessionStorage.clear();

    // Clear IndexedDB for Edge browser compatibility
    try {
      const databases = await indexedDB.databases();
      for (const db of databases) {
        if (db.name?.includes('supabase')) {
          indexedDB.deleteDatabase(db.name);
          console.log('🔴 Cleared IndexedDB on logout:', db.name);
        }
      }
    } catch (idbError) {
      console.warn('Could not clear IndexedDB on logout:', idbError);
    }

    // Clear any cookies
    document.cookie.split(";").forEach((c) => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });

    // Force reload
    window.location.href = window.location.pathname;
  } catch (error) {
    console.error('Complete logout error:', error);
    // Force reload even if everything fails
    window.location.href = window.location.pathname;
  }
};

// Retry wrapper with exponential backoff and session awareness
export const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  operationName: string = 'database operation'
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Validate session before each attempt (except first)
      if (attempt > 0) {
        const isSessionValid = await validateSession();
        if (!isSessionValid) {
          const sessionStatus = getSessionStatus();
          if (sessionStatus.needsReauth) {
            throw new Error('Session expired. Please log in again.');
          }
        }
      }
      
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on authentication/session errors or client errors (4xx)
      if (lastError.message.includes('JWT') || 
          lastError.message.includes('unauthorized') ||
          lastError.message.includes('expired') ||
          lastError.message.includes('log in again') ||
          lastError.message.includes('not found')) {
        throw lastError;
      }
      
      if (attempt === maxRetries) {
        console.error(`❌ ${operationName} failed after ${maxRetries + 1} attempts:`, lastError.message);
        throw new Error(`${operationName} failed: ${lastError.message}`);
      }
      
      const delay = initialDelay * Math.pow(2, attempt);
      console.warn(`⚠️ ${operationName} attempt ${attempt + 1} failed, retrying in ${delay}ms...`, lastError.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
};

// Enhanced query wrapper with health monitoring
export const queryWithRetry = async <T>(queryFn: () => Promise<T>, operationName: string = 'query'): Promise<T> => {
  return retryWithBackoff(async () => {
    try {
      const result = await queryFn();
      if (result.error) {
        updateConnectionHealth(false, result.error.message);
        throw new Error(`${operationName}: ${result.error.message}`);
      }
      updateConnectionHealth(true);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateConnectionHealth(false, errorMessage);
      throw error;
    }
  }, 3, 1000, operationName);
};

export default supabase; 