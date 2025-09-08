export const metadata = {
  title: 'Whiskey DB',
  description: 'Self-hosted whiskey collection'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{padding: 24, fontFamily: 'system-ui, sans-serif'}}>
        {children}
      </body>
    </html>
  );
}
