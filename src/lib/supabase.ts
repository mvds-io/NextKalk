import { createClient } from '@supabase/supabase-js';
import { appConfig } from './config';

export const supabase = createClient(
  appConfig.supabaseUrl,
  appConfig.supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

// Helper function for complete logout
export const completeLogout = async () => {
  try {
    // Sign out from Supabase
    await supabase.auth.signOut({ scope: 'local' });
    
    // Clear all possible storage
    localStorage.clear();
    sessionStorage.clear();
    
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

export default supabase; 