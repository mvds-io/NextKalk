import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User } from '@/types';
import { supabase, completeLogout } from '@/lib/supabase';

interface AuthContainerProps {
  user: User | null;
  onUserUpdate: (user: User | null) => void;
}

export default function AuthContainer({ user, onUserUpdate }: AuthContainerProps) {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // REMOVED: Duplicate auth state listener
  // AuthGuard already handles onAuthStateChange events
  // Having two listeners was causing duplicate database queries and connection accumulation

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await completeLogout();
  };

  if (user) {
    return (
      <div className="auth-container">
        <div className="user-info">
          <div className="user-avatar">
            <i className="fas fa-user"></i>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
              {user.display_name || user.email}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#6c757d' }}>
              {user.role}
            </div>
          </div>
          <button 
            className="btn btn-sm btn-outline-secondary logout-btn"
            onClick={handleLogout}
            style={{ fontSize: '0.7rem' }}
          >
            <i className="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="auth-container">
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowLoginModal(true)}
          style={{ fontSize: '0.8rem' }}
        >
          <i className="fas fa-sign-in-alt me-1"></i>
          Logg inn
        </button>
      </div>

      <AnimatePresence>
        {showLoginModal && (
          <motion.div
            className="modal show"
            style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="modal-dialog modal-sm"
              initial={{ scale: 0.9, opacity: 0, y: -20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: -20 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Logg inn</h5>
                <button 
                  type="button" 
                  className="btn-close"
                  onClick={() => setShowLoginModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleLogin}>
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        className="alert alert-danger"
                        style={{ fontSize: '0.8rem' }}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                      >
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  <div className="mb-3">
                    <label htmlFor="email" className="form-label" style={{ fontSize: '0.8rem' }}>
                      E-post
                    </label>
                    <input
                      type="email"
                      className="form-control form-control-sm"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="password" className="form-label" style={{ fontSize: '0.8rem' }}>
                      Passord
                    </label>
                    <input
                      type="password"
                      className="form-control form-control-sm"
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="d-grid gap-2">
                    <button 
                      type="submit" 
                      className="btn btn-primary btn-sm"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                          Logger inn...
                        </>
                      ) : (
                        'Logg inn'
                      )}
                    </button>
                    
                    <button 
                      type="button" 
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => setShowLoginModal(false)}
                    >
                      Avbryt
                    </button>
                  </div>
                </form>
              </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
} 