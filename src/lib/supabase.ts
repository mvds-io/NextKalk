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

// Detect browser type and OS for specific handling
const getBrowserType = (): 'edge' | 'chrome' | 'chrome-mac' | 'safari' | 'other' => {
  if (typeof window === 'undefined') return 'other';
  const ua = navigator.userAgent.toLowerCase();

  // Edge needs special handling due to slower storage I/O
  if (ua.includes('edg/') || ua.includes('edge/')) return 'edge';

  // Chrome/Chromium - detect macOS specifically
  if ((ua.includes('chrome') || ua.includes('chromium')) && !ua.includes('firefox')) {
    // Check if running on macOS
    if (ua.includes('mac os x') || ua.includes('macintosh')) {
      return 'chrome-mac';
    }
    return 'chrome';
  }

  // Safari
  if (ua.includes('safari') && !ua.includes('chrome')) return 'safari';

  return 'other';
};

const isChromiumBrowser = (): boolean => {
  const browserType = getBrowserType();
  return browserType === 'edge' || browserType === 'chrome' || browserType === 'chrome-mac';
};

// Check if browser needs aggressive cache clearing (Edge and Chrome on Mac)
const needsAggressiveCacheClearing = (): boolean => {
  const browserType = getBrowserType();
  return browserType === 'edge' || browserType === 'chrome-mac';
};

// Connection pool management
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 12; // Increased from 6 to reduce queueing lag

const manageConnectionPool = async (requestFn: () => Promise<Response>): Promise<Response> => {
  // Don't queue - just limit concurrent requests and execute immediately
  // This prevents the queue from getting stuck in Chromium's module cache
  while (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  activeRequests++;

  try {
    const response = await requestFn();
    return response;
  } finally {
    activeRequests--;
  }
};

// Smart storage adapter that detects browser at runtime (not module load time)
// Critical for SSR: module loads on server where window is undefined
// Solution: Use localStorage for ALL browsers to avoid IndexedDB issues entirely
const createStorageAdapter = () => {
  return {
    getItem: (key: string) => {
      if (typeof window === 'undefined') return null;
      return localStorage.getItem(key);
    },
    setItem: (key: string, value: string) => {
      if (typeof window === 'undefined') return;
      localStorage.setItem(key, value);
    },
    removeItem: (key: string) => {
      if (typeof window === 'undefined') return;
      localStorage.removeItem(key);
    },
  };
};

export const supabase = createClient(
  appConfig.supabaseUrl,
  appConfig.supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Use custom storage adapter that detects browser at runtime
      storage: createStorageAdapter()
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        'X-Client-Info': 'nextkalk-web-app'
      },
      fetch: (url, options = {}) => {
        // Bypass connection pool for auth requests to prevent Chromium reload hang
        const isAuthRequest = typeof url === 'string' && (url.includes('/auth/') || url.includes('token?'));

        const fetchFn = async () => {
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
        };

        // Auth requests bypass the connection pool
        if (isAuthRequest) {
          return fetchFn();
        }

        return manageConnectionPool(fetchFn);
      }
    },
    realtime: {
      params: {
        eventsPerSecond: 2 // Reduced from 10 to prevent connection spam
      }
    }
  }
);

// Proactive IndexedDB cleanup for Edge and Chrome-on-Mac compatibility
export const clearSupabaseIndexedDB = async (): Promise<void> => {
  if (typeof window === 'undefined') return;

  try {
    // Method 1: Try using indexedDB.databases() if available
    if (indexedDB.databases) {
      const databases = await indexedDB.databases();
      const deletePromises: Promise<void>[] = [];

      for (const db of databases) {
        if (db.name?.includes('supabase')) {
          console.log('🔵 Deleting IndexedDB:', db.name);
          const deletePromise = new Promise<void>((resolve, reject) => {
            const request = indexedDB.deleteDatabase(db.name!);
            request.onsuccess = () => {
              console.log('✅ Deleted IndexedDB:', db.name);
              resolve();
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => {
              console.warn('⚠️ IndexedDB deletion blocked:', db.name);
              // Resolve anyway after a short delay
              setTimeout(() => resolve(), 100);
            };
          });
          deletePromises.push(deletePromise);
        }
      }

      await Promise.all(deletePromises);
    } else {
      // Method 2: Fallback - try common Supabase IndexedDB names
      const commonNames = ['supabase-auth-token', 'supabase-postgres-changes'];
      for (const name of commonNames) {
        await new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve(); // Ignore errors
          request.onblocked = () => setTimeout(() => resolve(), 100);
        });
      }
    }

    // Small delay to ensure Chrome releases locks
    await new Promise(resolve => setTimeout(resolve, 50));
  } catch (error) {
    console.warn('Could not clear IndexedDB:', error);
  }
};

// Helper function to check and clean stale sessions
export const cleanStaleSession = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  try {
    // Since we're using localStorage-only storage for ALL browsers,
    // IndexedDB issues are completely avoided. Simple and reliable.
    const { data: { session }, error } = await supabase.auth.getSession();

    // Handle session errors - clear cache and return false
    if (error) {
      console.warn('🔴 Session validation error, clearing storage:', error.message);

      // Clear localStorage Supabase keys
      const keys = Object.keys(localStorage);
      keys.filter(key => key.includes('supabase')).forEach(key => localStorage.removeItem(key));

      // Selectively clear sessionStorage
      const sessionKeys = Object.keys(sessionStorage);
      sessionKeys.filter(key => key.includes('supabase')).forEach(key => sessionStorage.removeItem(key));

      updateSessionHealth(false, true);
      return false;
    }

    // No session found - clear cache
    if (!session) {
      console.log('🔵 No session found, clearing stale cache');

      const keys = Object.keys(localStorage);
      keys.filter(key => key.includes('supabase')).forEach(key => localStorage.removeItem(key));

      const sessionKeys = Object.keys(sessionStorage);
      sessionKeys.filter(key => key.includes('supabase')).forEach(key => sessionStorage.removeItem(key));

      return false;
    }

    // Check if session is expired
    const expiresAt = session.expires_at ? new Date(session.expires_at * 1000) : null;
    const now = new Date();

    if (expiresAt && now > expiresAt) {
      console.warn('🔴 Session expired, clearing storage');

      const keys = Object.keys(localStorage);
      keys.filter(key => key.includes('supabase')).forEach(key => localStorage.removeItem(key));

      const sessionKeys = Object.keys(sessionStorage);
      sessionKeys.filter(key => key.includes('supabase')).forEach(key => sessionStorage.removeItem(key));

      updateSessionHealth(false, true);
      return false;
    }

    // Session is valid - no cache clearing needed
    updateSessionHealth(true);
    return true;
  } catch (error) {
    console.error('Error cleaning stale session:', error);

    // On any error, clear Supabase storage
    const keys = Object.keys(localStorage);
    keys.filter(key => key.includes('supabase')).forEach(key => localStorage.removeItem(key));

    const sessionKeys = Object.keys(sessionStorage);
    sessionKeys.filter(key => key.includes('supabase')).forEach(key => sessionStorage.removeItem(key));

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

    // Clear IndexedDB for Edge browser compatibility (non-blocking to prevent Chromium hang)
    clearSupabaseIndexedDB().catch(err => console.warn('Background IndexedDB clear on logout failed:', err));

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