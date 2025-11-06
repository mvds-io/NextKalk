import { supabase, completeLogout } from './supabase';

/**
 * Get authenticated fetch headers for API calls
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    // Clear stale session and force re-login
    console.warn('🔴 No valid session found in getAuthHeaders, clearing storage');
    await completeLogout();
    throw new Error('Session expired - please log in again');
  }

  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Make an authenticated API request
 */
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      }
    });

    // If authentication fails, sign out the user
    if (response.status === 401) {
      await supabase.auth.signOut();
      throw new Error('Authentication failed');
    }

    return response;
  } catch (error) {
    console.error('Authenticated fetch error:', error);
    throw error;
  }
}

/**
 * Check if user is authenticated (with server-side validation)
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return false;
    }

    // Validate the session by attempting a refresh
    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();

    if (refreshError || !refreshedSession) {
      // Session is stale, clear it
      await completeLogout();
      return false;
    }

    return !!refreshedSession.user;
  } catch (error) {
    console.error('Error checking authentication:', error);
    return false;
  }
}

/**
 * Get current user from database
 */
export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.user?.email) {
    return null;
  }

  const { data: userData } = await supabase
    .from('users')
    .select('*')
    .eq('email', session.user.email)
    .single();

  return userData;
}