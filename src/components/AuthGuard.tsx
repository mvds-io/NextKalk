/**
 * AuthGuard Component
 * 
 * This component enforces authentication for the entire application.
 * It prevents any access to the app content until the user is properly logged in
 * and verified in the database.
 * 
 * Security features:
 * - Blocks all content until authenticated
 * - Verifies user exists in the users table
 * - Provides centralized authentication state management
 * - Shows professional login screen
 * - Handles authentication errors gracefully
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { User } from '@/types';
import { supabase, completeLogout, cleanStaleSession, getConnectionStatus, validateSession, getSessionStatus, updateSessionHealth } from '@/lib/supabase';

interface AuthGuardProps {
  children: (user: User, onLogout: () => void) => React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [authTimeout, setAuthTimeout] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [timeoutCountdown, setTimeoutCountdown] = useState(5);

  const loadUserData = useCallback(async (email: string) => {
    try {
      
      // Check current auth state
      await supabase.auth.getSession();
      
      // First, let's see all users in the database to debug
      await supabase
        .from('users')
        .select('*');
      
      
      // Try direct query first to bypass retry logic
      const result = await supabase
        .from('users')
        .select('*')
        .eq('email', email);


      if (result.error) {
        console.error('Database error:', result.error);
        setUser(null);
        setLoginError('Database error. Prøv å laste siden på nytt.');
        setIsLoading(false);
        return;
      }

      const usersData = result.data;

      if (!usersData || usersData.length === 0) {
        
        // Try to create the user
        const createResult = await supabase
          .from('users')
          .insert([
            {
              email: email,
              role: 'viewer',
              can_edit_priority: false,
              can_edit_markers: false,
              display_name: email.split('@')[0]
            }
          ])
          .select()
          .single();

        if (createResult.error) {
          console.error('Error creating user:', createResult.error);
          setUser(null);
          setLoginError('Kunne ikke opprette bruker. Kontakt administrator.');
          setIsLoading(false);
          return;
        }

        // Use created user data
        const userData = createResult.data;
        const user: User = {
          id: userData.id,
          email: userData.email,
          role: userData.role || 'viewer',
          can_edit_priority: userData.can_edit_priority || false,
          can_edit_markers: userData.can_edit_markers || false,
          display_name: userData.display_name || email.split('@')[0]
        };
        setUser(user);
        setIsLoading(false);
      } else {
        // Use existing user data
        const userData = usersData[0];
        const user: User = {
          id: userData.id,
          email: userData.email,
          role: userData.role || 'viewer',
          can_edit_priority: userData.can_edit_priority || false,
          can_edit_markers: userData.can_edit_markers || false,
          display_name: userData.display_name || email.split('@')[0]
        };
        setUser(user);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      setUser(null);
      setLoginError('Kunne ikke laste brukerdata. Prøv å laste siden på nytt.');
      setIsLoading(false);
    }
  }, []);

  const checkAuthentication = useCallback(async () => {
    let timeoutId: NodeJS.Timeout | null = null;
    let countdownIntervalId: NodeJS.Timeout | null = null;

    try {
      // CRITICAL: Clean and validate any stale sessions from cache first
      // This now validates server-side and clears stale sessions automatically
      const sessionIsValid = await cleanStaleSession();

      if (!sessionIsValid) {
        console.log('No valid session found after cleaning stale sessions');
        setIsLoading(false);
        return;
      }

      // Reset countdown
      setTimeoutCountdown(5);

      // Check session health first
      const sessionStatus = getSessionStatus();
      if (sessionStatus.needsReauth) {
        console.log('Session needs re-authentication');
        setSessionExpired(true);
        setIsLoading(false);
        return;
      }

      // Check connection health
      const connectionStatus = getConnectionStatus();
      if (!connectionStatus.isHealthy && connectionStatus.consecutiveFailures > 2) {
        setConnectionIssue(true);
        setIsLoading(false);
        return;
      }

      // Countdown timer for timeout indicator
      let countdown = 5;
      countdownIntervalId = setInterval(() => {
        countdown--;
        setTimeoutCountdown(countdown);
        if (countdown <= 0 && countdownIntervalId) {
          clearInterval(countdownIntervalId);
        }
      }, 1000);

      // Reduced timeout - fail after 5 seconds with specific error
      timeoutId = setTimeout(() => {
        console.warn('Authentication check timed out after 5s');
        setAuthTimeout(true);
        setIsLoading(false);
        if (countdownIntervalId) clearInterval(countdownIntervalId);
      }, 5000);

      // Get session - it's already been validated by cleanStaleSession
      const { data: { session }, error } = await supabase.auth.getSession();

      // Clear timeout and countdown since we got a response
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (countdownIntervalId) {
        clearInterval(countdownIntervalId);
        countdownIntervalId = null;
      }

      if (error) {
        console.error('Session error:', error);
        if (error.message?.includes('expired') || error.message?.includes('JWT')) {
          setSessionExpired(true);
        } else {
          setConnectionIssue(true);
        }
        setIsLoading(false);
        return;
      }

      if (!session?.user?.email) {
        console.log('No session found');
        setIsLoading(false);
        return;
      }

      // Reset all error states on successful authentication
      setConnectionIssue(false);
      setAuthTimeout(false);
      setSessionExpired(false);
      setRetryCount(0);

      await loadUserData(session.user.email);

    } catch (error) {
      // Clear timeout and countdown on error
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (countdownIntervalId) {
        clearInterval(countdownIntervalId);
      }

      console.error('Error checking authentication:', error);

      // Handle specific error types
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('expired') || errorMessage.includes('log in again')) {
        setSessionExpired(true);
      } else {
        setConnectionIssue(true);
      }

      setIsLoading(false);
    }
  }, [loadUserData]);

  const handleManualRetry = useCallback(() => {
    setIsLoading(true);
    setConnectionIssue(false);
    setAuthTimeout(false);
    setSessionExpired(false);
    setRetryCount(0);
    checkAuthentication();
  }, [checkAuthentication]);

  const handleSessionExpiredLogout = useCallback(async () => {
    setSessionExpired(false);
    await completeLogout();
  }, []);

  useEffect(() => {
    let mounted = true;

    checkAuthentication();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' && session?.user) {
        await loadUserData(session.user.email!);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    // Listen for storage changes (e.g., session expires in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.includes('supabase.auth.token')) {
        console.log('Session storage changed, rechecking authentication...');
        // Session changed - recheck authentication
        checkAuthentication();
      }
    };

    // Listen for visibility changes (user returns to tab after idle)
    // CRITICAL: This fixes the 15-minute timeout issue
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && user) {
        console.log('🔵 Tab became visible, validating session...');
        // User returned to tab - validate session immediately
        const isValid = await validateSession();
        if (!isValid) {
          console.warn('🔴 Session invalid after returning to tab');
          setSessionExpired(true);
          setIsLoading(false);
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorageChange);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [checkAuthentication, loadUserData, user]);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) throw error;

      if (data.session) {
        // Wait a moment for the session to be fully established
        await new Promise(resolve => setTimeout(resolve, 500));

        // Manually trigger user data load
        await loadUserData(data.session.user.email!);
      }

      setEmail('');
      setPassword('');
    } catch (error: unknown) {
      console.error('Login error:', error);
      setLoginError(error instanceof Error ? error.message : 'Innlogging feilet. Sjekk e-post og passord.');
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    setUser(null);
    await completeLogout();
  };

  // Show loading screen while checking authentication
  if (isLoading) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ height: '100vh', backgroundColor: '#f8f9fa' }}>
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" style={{ width: '3rem', height: '3rem' }}>
            <span className="visually-hidden">Laster...</span>
          </div>
          <h5 className="text-muted">Sjekker innlogging...</h5>

          {/* Show countdown if loading takes time */}
          {!sessionExpired && !connectionIssue && !authTimeout && timeoutCountdown <= 3 && (
            <div className="mt-2">
              <small className="text-warning">
                <i className="fas fa-clock me-1"></i>
                Timeout om {timeoutCountdown}s...
              </small>
            </div>
          )}
          
          {sessionExpired && (
            <div className="mt-3">
              <div className="alert alert-warning d-inline-block" style={{ fontSize: '0.9rem' }}>
                <i className="fas fa-clock me-2"></i>
                Sesjonen har utløpt. Du må logge inn på nytt.
              </div>
              <div className="mt-2">
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={handleSessionExpiredLogout}
                >
                  <i className="fas fa-sign-in-alt me-2"></i>
                  Logg inn på nytt
                </button>
              </div>
            </div>
          )}

          {connectionIssue && !sessionExpired && (
            <div className="mt-3">
              <div className="alert alert-danger d-inline-block" style={{ fontSize: '0.9rem' }}>
                <i className="fas fa-exclamation-triangle me-2"></i>
                Tilkoblingsproblemer med databasen. Dette kan skyldes for mange samtidige tilkoblinger.
                <br />
                <small className="mt-1 d-block">Prøv igjen om noen sekunder.</small>
              </div>
              <div className="mt-2">
                <button
                  className="btn btn-primary btn-sm me-2"
                  onClick={handleManualRetry}
                >
                  <i className="fas fa-redo me-2"></i>
                  Prøv igjen
                </button>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => window.location.reload()}
                >
                  <i className="fas fa-refresh me-2"></i>
                  Last siden på nytt
                </button>
              </div>
            </div>
          )}
          
          {authTimeout && !connectionIssue && !sessionExpired && (
            <div className="mt-3">
              <div className="alert alert-warning d-inline-block" style={{ fontSize: '0.9rem' }}>
                <i className="fas fa-clock me-2"></i>
                Autentisering tok for lang tid (&gt;5s). Dette kan være et midlertidig nettverksproblem.
              </div>
              <div className="mt-2">
                <button
                  className="btn btn-primary btn-sm me-2"
                  onClick={handleManualRetry}
                >
                  <i className="fas fa-redo me-2"></i>
                  Prøv igjen
                </button>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => window.location.reload()}
                >
                  <i className="fas fa-refresh me-2"></i>
                  Last siden på nytt
                </button>
              </div>
            </div>
          )}
          
          {retryCount > 0 && !connectionIssue && (
            <div className="mt-2">
              <small className="text-muted">
                Prøver igjen ({retryCount}/2)...
              </small>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!user) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ height: '100vh', backgroundColor: '#f8f9fa' }}>
        <div className="card shadow" style={{ width: '100%', maxWidth: '400px', margin: '20px' }}>
          <div className="card-body">
            <div className="text-center mb-4">
              <i className="fas fa-lock fa-3x text-primary mb-3"></i>
              <h3 className="card-title">Kalk Planner 2025</h3>
              <p className="text-muted">Du må logge inn for å få tilgang til applikasjonen</p>
            </div>

            {loginError && (
              <div className="alert alert-danger" role="alert">
                <i className="fas fa-exclamation-triangle me-2"></i>
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div className="mb-3">
                <label htmlFor="email" className="form-label">
                  <i className="fas fa-envelope me-2"></i>E-post adresse
                </label>
                <input
                  type="email"
                  className="form-control"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="din@epost.no"
                  required
                  disabled={isLoggingIn}
                />
              </div>
              
              <div className="mb-4">
                <label htmlFor="password" className="form-label">
                  <i className="fas fa-key me-2"></i>Passord
                </label>
                <input
                  type="password"
                  className="form-control"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ditt passord"
                  required
                  disabled={isLoggingIn}
                />
              </div>
              
              <div className="d-grid">
                <button 
                  type="submit" 
                  className="btn btn-primary btn-lg"
                  disabled={isLoggingIn}
                >
                  {isLoggingIn ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Logger inn...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-sign-in-alt me-2"></i>
                      Logg inn
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="text-center mt-4">
              <small className="text-muted">
                <i className="fas fa-shield-alt me-1"></i>
                Sikker innlogging påkrevd
              </small>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // User is authenticated, render the app with user context
  return (
    <div>
      {children(user, handleLogout)}
    </div>
  );
}