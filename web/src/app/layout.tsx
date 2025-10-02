import type { Metadata } from 'next';
import './global.css';
import ThemeToggle from '../components/ThemeToggle';
import HeaderAuthControl from '../components/HeaderAuthControl';
import NavLinks from '../components/NavLinks';

// Client-only watcher (optional now that SWR is in place)
import dynamic from 'next/dynamic';
const AuthWatcher = dynamic(() => import('../components/AuthWatcher'), { ssr: false });
const SessionKeepAlive = dynamic(() => import('../components/SessionKeepAlive'), { ssr: false });

// ⬇️ add SWR provider
import { SWRConfig } from 'swr';

const appName =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() ||
  process.env.APP_NAME?.trim() ||
  'Whiskey DB';

export const metadata: Metadata = {
  title: appName,
  description: `${appName} — Self-hosted whiskey collection`,
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Optional: still fine to keep for belt-and-suspenders */}
        <AuthWatcher />

        {/* SWR provider makes /auth/me shared & reactive across the app */}
        <SWRConfig
          value={{
            // no global fetcher; useMe has its own fetcher with credentials
            revalidateOnFocus: true,
            revalidateOnReconnect: true,
            shouldRetryOnError: false,
          }}
        >
          <SessionKeepAlive />
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
        </SWRConfig>
      </body>
    </html>
  );
}
