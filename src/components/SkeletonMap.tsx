export default function SkeletonMap() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#e9ecef',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div style={{ textAlign: 'center', color: '#6c757d' }}>
        <i className="fas fa-map fa-3x mb-3" style={{ opacity: 0.3 }}></i>
        <div className="skeleton-pulse" style={{
          width: '200px',
          height: '20px',
          backgroundColor: '#dee2e6',
          borderRadius: '4px',
          margin: '0 auto',
          animation: 'pulse 1.5s ease-in-out infinite'
        }}></div>
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
