export const metadata = {
  title: 'Task Manager',
  description: 'Daily task and workload manager',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

