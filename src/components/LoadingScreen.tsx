import { useState, useEffect } from 'react';
import { getConnectionStatus } from '@/lib/supabase';

interface LoadingScreenProps {
  progress?: number;
  currentStep?: string;
  stepStartTime?: number;
}

export default function LoadingScreen({
  progress = 0,
  currentStep = 'Laster...',
  stepStartTime = Date.now()
}: LoadingScreenProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  const [connectionHealth, setConnectionHealth] = useState({ isHealthy: true, consecutiveFailures: 0 });

  useEffect(() => {
    // Update elapsed time every second
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - stepStartTime) / 1000);
      setElapsedTime(elapsed);

      // Show warning if step takes more than 3 seconds
      if (elapsed > 3) {
        setShowSlowWarning(true);
      }
    }, 1000);

    // Check connection health
    const healthInterval = setInterval(() => {
      const status = getConnectionStatus();
      setConnectionHealth(status);
    }, 2000);

    return () => {
      clearInterval(interval);
      clearInterval(healthInterval);
    };
  }, [stepStartTime]);

  // Reset warning when step changes
  useEffect(() => {
    setShowSlowWarning(false);
    setElapsedTime(0);
  }, [currentStep]);

  return (
    <div id="loading-screen" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10000,
      margin: 0,
      padding: 0
    }}>
      <div className="loading-container" style={{
        textAlign: 'center',
        maxWidth: '400px',
        width: '90%',
        padding: '2rem',
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)',
        position: 'relative',
        margin: 'auto'
      }}>
        <div className="app-logo">
          <i className="fas fa-helicopter" style={{ fontSize: '3rem', color: '#0066cc', marginBottom: '1rem' }}></i>
          <h2 style={{ color: '#333', marginBottom: '2rem' }}>Kalk Planner 2025</h2>
        </div>
        <div className="progress-container">
          <div className="progress" style={{ height: '8px', borderRadius: '4px', backgroundColor: '#e9ecef' }}>
            <div
              className="progress-bar progress-bar-striped progress-bar-animated"
              role="progressbar"
              style={{
                width: `${progress}%`,
                backgroundColor: showSlowWarning ? '#ffc107' : '#0066cc',
                transition: 'width 0.3s ease'
              }}
            ></div>
          </div>
          <div className="loading-text">
            <p style={{ marginTop: '1rem', color: '#666', fontSize: '0.9rem' }}>
              {Math.round(progress)}% fullført
            </p>
            <div className="loading-details" style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#999' }}>
              <span>
                <i className="fas fa-circle-notch fa-spin me-2"></i>
                {currentStep}
              </span>
              {elapsedTime > 0 && (
                <span className="ms-2 text-muted">({elapsedTime}s)</span>
              )}
            </div>

            {/* Slow loading warning */}
            {showSlowWarning && (
              <div className="alert alert-warning mt-3 mb-0" style={{ fontSize: '0.75rem', padding: '0.5rem' }}>
                <i className="fas fa-exclamation-triangle me-2"></i>
                Dette steget tar lengre tid enn forventet. Sjekk internettforbindelsen.
              </div>
            )}

            {/* Network status indicator */}
            {!connectionHealth.isHealthy && (
              <div className="alert alert-danger mt-2 mb-0" style={{ fontSize: '0.75rem', padding: '0.5rem' }}>
                <i className="fas fa-wifi me-2"></i>
                Nettverksproblemer oppdaget ({connectionHealth.consecutiveFailures} feil på rad)
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 