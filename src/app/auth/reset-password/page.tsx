'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, getSessionDirectly } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      // Supabase's detectSessionInUrl exchanges the recovery code automatically.
      // Poll briefly for the session to appear in localStorage.
      for (let i = 0; i < 24; i++) {
        const { session } = getSessionDirectly();
        if (session) {
          if (!cancelled) setPhase('ready');
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!cancelled) setPhase('invalid');
    };
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Passordet må være minst 8 tegn.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passordene er ikke like.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess(true);
      setTimeout(() => router.push('/'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke oppdatere passord');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8f9fa',
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'white',
          borderRadius: 8,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          padding: '1.5rem',
        }}
      >
        <h5 style={{ marginBottom: '1rem' }}>Sett nytt passord</h5>

        {phase === 'checking' && (
          <div className="text-muted" style={{ fontSize: '0.85rem' }}>
            <span className="spinner-border spinner-border-sm me-2" role="status" />
            Verifiserer lenken…
          </div>
        )}

        {phase === 'invalid' && (
          <>
            <div className="alert alert-danger" style={{ fontSize: '0.85rem' }}>
              Lenken er ugyldig eller utløpt. Be om en ny tilbakestillingsepost.
            </div>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm w-100"
              onClick={() => router.push('/')}
            >
              Til forsiden
            </button>
          </>
        )}

        {phase === 'ready' && !success && (
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="alert alert-danger" style={{ fontSize: '0.85rem' }}>
                {error}
              </div>
            )}
            <div className="mb-3">
              <label htmlFor="newPassword" className="form-label" style={{ fontSize: '0.85rem' }}>
                Nytt passord
              </label>
              <input
                type="password"
                id="newPassword"
                className="form-control form-control-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="mb-3">
              <label htmlFor="confirmPassword" className="form-label" style={{ fontSize: '0.85rem' }}>
                Bekreft passord
              </label>
              <input
                type="password"
                id="confirmPassword"
                className="form-control form-control-sm"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-sm w-100"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                  Oppdaterer…
                </>
              ) : (
                'Lagre nytt passord'
              )}
            </button>
          </form>
        )}

        {success && (
          <div className="alert alert-success mb-0" style={{ fontSize: '0.85rem' }}>
            Passordet er oppdatert. Sender deg til forsiden…
          </div>
        )}
      </div>
    </div>
  );
}
