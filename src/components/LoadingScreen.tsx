import { useState, useEffect } from 'react';
import { loadingSteps } from '@/lib/config';

export default function LoadingScreen() {
  const [progress, setProgress] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + 2;
        const stepIndex = Math.floor((newProgress / 100) * loadingSteps.length);
        setCurrentStepIndex(Math.min(stepIndex, loadingSteps.length - 1));
        return Math.min(newProgress, 100);
      });
    }, 50);

    return () => clearInterval(interval);
  }, []);

  return (
    <div id="loading-screen">
      <div className="loading-container">
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
                backgroundColor: '#0066cc', 
                transition: 'width 0.3s ease' 
              }}
            ></div>
          </div>
          <div className="loading-text">
            <p style={{ marginTop: '1rem', color: '#666', fontSize: '0.9rem' }}>
              {Math.round(progress)}% fullført
            </p>
            <div className="loading-details" style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#999' }}>
              <span>{loadingSteps[currentStepIndex] || 'Laster...'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 