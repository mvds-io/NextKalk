export default function SkeletonSidePanel() {
  return (
    <div
      style={{
        padding: '1rem',
        backgroundColor: '#ffffff',
        borderLeft: '1px solid #dee2e6',
        height: '100%',
        overflow: 'hidden'
      }}
    >
      {/* Header skeleton */}
      <div className="skeleton-box mb-3" style={{
        height: '30px',
        width: '60%',
        backgroundColor: '#e9ecef',
        borderRadius: '4px',
        animation: 'pulse 1.5s ease-in-out infinite'
      }}></div>

      {/* List items skeleton */}
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div
          key={i}
          className="skeleton-box mb-2"
          style={{
            height: '50px',
            backgroundColor: '#e9ecef',
            borderRadius: '4px',
            animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 0.1}s`
          }}
        ></div>
      ))}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
