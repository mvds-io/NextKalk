export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-y-auto block h-auto bg-gray-50/50">
      {children}
    </div>
  );
}
