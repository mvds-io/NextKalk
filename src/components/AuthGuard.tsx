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

import { useState, useEffect } from 'react';
import { User } from '@/types';
import { supabase } from '@/lib/supabase';

interface AuthGuardProps {
  children: (user: User, onLogout: () => void) => React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    checkAuthentication();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await loadUserData(session.user.email!);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAuthentication = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user?.email) {
        await loadUserData(session.user.email);
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error checking authentication:', error);
      setIsLoading(false);
    }
  };

  const loadUserData = async (email: string) => {
    try {
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (error || !userData) {
        console.error('User not found in database:', error);
        await supabase.auth.signOut();
        setLoginError('Brukeren din er ikke registrert i systemet. Kontakt administrator.');
        setIsLoading(false);
        return;
      }

      setUser(userData);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading user data:', error);
      await supabase.auth.signOut();
      setLoginError('Kunne ikke laste brukerdata. Kontakt administrator.');
      setIsLoading(false);
    }
  };

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
      
      setShowLoginModal(false);
      setEmail('');
      setPassword('');
    } catch (error: any) {
      console.error('Login error:', error);
      setLoginError(error.message || 'Innlogging feilet. Sjekk e-post og passord.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
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