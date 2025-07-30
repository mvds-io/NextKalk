import React from 'react';

interface SkeletonLoaderProps {
  height?: string;
  width?: string;
  count?: number;
  className?: string;
}

export const SkeletonBox: React.FC<SkeletonLoaderProps> = ({ 
  height = '20px', 
  width = '100%', 
  className = '' 
}) => (
  <div 
    className={`skeleton-box ${className}`}
    style={{
      height,
      width,
      backgroundColor: '#e2e8f0',
      borderRadius: '4px',
      position: 'relative',
      overflow: 'hidden'
    }}
  >
    <div 
      className="skeleton-shimmer"
      style={{
        position: 'absolute',
        top: 0,
        left: '-100%',
        width: '100%',
        height: '100%',
        background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
        animation: 'shimmer 1.5s infinite'
      }}
    />
  </div>
);

export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({ 
  lines = 1, 
  className = '' 
}) => (
  <div className={className}>
    {Array.from({ length: lines }).map((_, i) => (
      <SkeletonBox 
        key={i}
        height="16px" 
        width={i === lines - 1 ? '80%' : '100%'}
        className="mb-2"
      />
    ))}
  </div>
);

export const SkeletonMarkerCard: React.FC = () => (
  <div className="skeleton-marker-card" style={{ padding: '0.75rem', minWidth: '300px' }}>
    <div className="d-flex align-items-center mb-2">
      <SkeletonBox width="24px" height="24px" className="me-2" />
      <SkeletonBox width="60%" height="20px" />
    </div>
    <div className="row g-2 mb-2">
      <div className="col-6">
        <SkeletonBox height="14px" width="40%" className="mb-1" />
        <SkeletonBox height="16px" width="80%" />
      </div>
      <div className="col-6">
        <SkeletonBox height="14px" width="40%" className="mb-1" />
        <SkeletonBox height="16px" width="60%" />
      </div>
    </div>
    <SkeletonBox height="14px" width="30%" className="mb-1" />
    <SkeletonBox height="16px" width="90%" className="mb-2" />
    <div className="d-flex gap-1">
      <SkeletonBox height="32px" width="80px" />
      <SkeletonBox height="32px" width="80px" />
    </div>
  </div>
);

export const SkeletonProgressItem: React.FC = () => (
  <div className="skeleton-progress-item" style={{ padding: '0.5rem', border: '1px solid #dee2e6', borderRadius: '0.375rem', marginBottom: '0.5rem' }}>
    <div className="d-flex justify-content-between align-items-center mb-1">
      <SkeletonBox width="60%" height="16px" />
      <SkeletonBox width="40px" height="20px" />
    </div>
    <SkeletonBox width="80%" height="14px" />
  </div>
);

export const SkeletonCounter: React.FC = () => (
  <div className="skeleton-counter" style={{ padding: '1rem' }}>
    <div className="row">
      <div className="col-md-3">
        <div className="text-center">
          <SkeletonBox width="40px" height="32px" className="mx-auto mb-1" />
          <SkeletonBox width="60px" height="14px" className="mx-auto" />
        </div>
      </div>
      <div className="col-md-3">
        <div className="text-center">
          <SkeletonBox width="40px" height="32px" className="mx-auto mb-1" />
          <SkeletonBox width="60px" height="14px" className="mx-auto" />
        </div>
      </div>
      <div className="col-md-6">
        <SkeletonBox width="150px" height="38px" />
      </div>
    </div>
  </div>
);

export const SkeletonImageGrid: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="skeleton-image-grid">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="mb-2" style={{ border: '1px solid #dee2e6', borderRadius: '0.375rem', padding: '0.5rem' }}>
        <div className="d-flex justify-content-between align-items-center mb-1">
          <SkeletonBox width="70%" height="12px" />
          <SkeletonBox width="60px" height="12px" />
        </div>
        <SkeletonBox width="100%" height="120px" />
      </div>
    ))}
  </div>
);