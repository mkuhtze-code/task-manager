export const metadata = {
  title: 'Task Manager',
  description: 'Daily task and workload manager',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#4a90d9',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
