import { supabase } from './supabase';

/**
 * Get authenticated fetch headers for API calls
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('No authentication token available');
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
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session?.user;
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