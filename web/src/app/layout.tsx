import './global.css';
import ThemeToggle from '../components/ThemeToggle';
import HeaderAuthControl from '../components/HeaderAuthControl';
import NavLinks from '../components/NavLinks';

export const metadata = {
  title: 'Whiskey DB',
  description: 'Self-hosted whiskey collection',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <nav className="nav">
          {/* Left: primary navigation (Retailers link hidden for guests inside NavLinks) */}
          <NavLinks />

          {/* Spacer pushes right-side controls to the end */}
          <div style={{ flex: 1 }} />

          {/* Right: theme + auth */}
          <div className="nav-right" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <ThemeToggle />
            <HeaderAuthControl />
          </div>
        </nav>

        <div className="container">{children}</div>
      </body>
    </html>
  );
}
