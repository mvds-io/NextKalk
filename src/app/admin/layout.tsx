export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{
      minHeight: '100vh',
      overflowY: 'auto',
      display: 'block',
      height: 'auto'
    }}>
      {children}
    </div>
  );
}
