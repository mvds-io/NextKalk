export default function SkeletonTopBar() {
  return (
    <div
      style={{
        padding: '1rem',
        backgroundColor: '#f8f9fa',
        borderBottom: '1px solid #dee2e6',
        minHeight: '80px'
      }}
    >
      <div className="container-fluid">
        <div className="row g-2">
          {/* User info skeleton */}
          <div className="col-12 col-md-3">
            <div className="skeleton-box" style={{
              height: '40px',
              backgroundColor: '#e9ecef',
              borderRadius: '4px',
              animation: 'pulse 1.5s ease-in-out infinite'
            }}></div>
          </div>

          {/* Filter buttons skeleton */}
          <div className="col-12 col-md-6">
            <div className="d-flex gap-2 flex-wrap">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="skeleton-box"
                  style={{
                    height: '40px',
                    width: '80px',
                    backgroundColor: '#e9ecef',
                    borderRadius: '4px',
                    animation: 'pulse 1.5s ease-in-out infinite',
                    animationDelay: `${i * 0.1}s`
                  }}
                ></div>
              ))}
            </div>
          </div>

          {/* Actions skeleton */}
          <div className="col-12 col-md-3">
            <div className="skeleton-box" style={{
              height: '40px',
              backgroundColor: '#e9ecef',
              borderRadius: '4px',
              animation: 'pulse 1.5s ease-in-out infinite'
            }}></div>
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
