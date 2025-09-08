import './global.css';
import Link from 'next/link';
import ThemeToggle from '../components/ThemeToggle';

export const metadata = {
  title: 'Whiskey DB',
  description: 'Self-hosted whiskey collection'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/">Home</Link>
          <Link href="/bottles">Bottles</Link>
          <Link href="/retailers">Retailers</Link>
          <ThemeToggle />
        </nav>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
