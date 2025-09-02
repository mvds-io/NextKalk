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
import { supabase, completeLogout, getConnectionStatus } from '@/lib/supabase';

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

  const checkAuthentication = useCallback(async (isRetry = false) => {
    let abortController: AbortController | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    
    try {
      // Check connection health first
      const connectionStatus = getConnectionStatus();
      if (!connectionStatus.isHealthy && connectionStatus.consecutiveFailures > 2) {
        setConnectionIssue(true);
        setIsLoading(false);
        return;
      }

      abortController = new AbortController();
      
      // Set up abort timeout for hanging requests
      timeoutId = setTimeout(() => {
        if (abortController) {
          abortController.abort();
        }
        console.warn('Authentication check timed out');
        
        // Only show timeout if this isn't a retry and we've been loading for a while
        if (!isRetry && retryCount < 2) {
          setAuthTimeout(true);
          // Try to retry authentication
          setRetryCount(prev => prev + 1);
          setTimeout(() => checkAuthentication(true), 2000);
        } else {
          setIsLoading(false);
          setConnectionIssue(true);
        }
      }, isRetry ? 10000 : 15000);

      const { data: { session }, error } = await supabase.auth.getSession();
      
      // Clear timeout since we got a response
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      if (error) {
        throw error;
      }
      
      // Reset connection issue state on successful response
      setConnectionIssue(false);
      setAuthTimeout(false);
      setRetryCount(0);
      
      if (session?.user?.email) {
        await loadUserData(session.user.email);
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      // Clear timeout on error
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Check if error was due to abort
      if (error.name === 'AbortError') {
        return; // Don't process aborted requests
      }
      
      console.error('Error checking authentication:', error);
      
      // Handle different types of errors
      if (error.message?.includes('network') || error.message?.includes('fetch')) {
        setConnectionIssue(true);
      }
      
      setIsLoading(false);
    }
  }, [loadUserData, retryCount]);

  const handleManualRetry = useCallback(() => {
    setIsLoading(true);
    setConnectionIssue(false);
    setAuthTimeout(false);
    setRetryCount(0);
    checkAuthentication();
  }, [checkAuthentication]);

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

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [checkAuthentication, loadUserData]);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) throw error;
      
      setEmail('');
      setPassword('');
    } catch (error: unknown) {
      console.error('Login error:', error);
      setLoginError(error instanceof Error ? error.message : 'Innlogging feilet. Sjekk e-post og passord.');
    } finally {
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
          
          {connectionIssue && (
            <div className="mt-3">
              <div className="alert alert-danger d-inline-block" style={{ fontSize: '0.9rem' }}>
                <i className="fas fa-exclamation-triangle me-2"></i>
                Tilkoblingsproblemer. Sjekk internettforbindelsen.
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
          
          {authTimeout && !connectionIssue && (
            <div className="mt-3">
              <div className="alert alert-warning d-inline-block" style={{ fontSize: '0.9rem' }}>
                <i className="fas fa-clock me-2"></i>
                Tilkobling tar lengre tid enn forventet...
              </div>
              <div className="mt-2">
                <button 
                  className="btn btn-outline-primary btn-sm"
                  onClick={handleManualRetry}
                >
                  <i className="fas fa-redo me-2"></i>
                  Prøv igjen
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