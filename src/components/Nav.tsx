'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useSession } from '@/lib/session';

const links = [
  { href: '/', label: 'Dashboard', icon: '🏠' },
  { href: '/fixtures', label: 'Fixtures', icon: '📅' },
  { href: '/players', label: 'Players', icon: '👤' },
  { href: '/rules', label: 'Rules', icon: '📋' },
];

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function Nav() {
  const path = usePathname();
  const { side } = useSession();
  const now = useClock();

  return (
    <>
      {/* ── Top bar ── */}
      <nav className="sticky top-0 z-50 shadow-md" style={{ background: 'var(--ipl-navy)' }}>
        <div className="max-w-5xl mx-auto px-4 flex items-center gap-1 h-14">
          <Link href="/" className="font-bold text-lg mr-4 sm:mr-8 text-white shrink-0 flex items-center gap-2">
            <span className="text-2xl">🏏</span>
            <span className="text-white font-extrabold tracking-wide">IPL <span style={{ color: '#f7a500' }}>Fantasy</span></span>
          </Link>

          {/* Desktop nav links — hidden on mobile */}
          <div className="hidden sm:flex items-center gap-0.5">
            {links.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-4 py-1.5 text-sm font-semibold transition-all rounded ${
                  path === l.href
                    ? 'text-white border-b-2 border-orange-400'
                    : 'text-blue-200 hover:text-white'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3 sm:gap-4">
            {now && (
              <div className="hidden sm:flex flex-col items-end text-[10px] leading-tight text-gray-400 font-mono">
                <span>{now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })} <span className="text-gray-600">IST</span></span>
                <span>{now.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: false })} <span className="text-gray-600">PT</span></span>
              </div>
            )}
            {/* Mobile: IST time only */}
            {now && (
              <div className="flex sm:hidden text-[10px] text-gray-400 font-mono">
                {now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })} <span className="text-gray-600 ml-0.5">IST</span>
              </div>
            )}
            {side && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                side === 'lads'
                  ? 'bg-blue-500/30 text-blue-200'
                  : 'bg-pink-500/30 text-pink-200'
              }`}>
                {side === 'lads' ? 'Lads' : 'Gils'}
              </span>
            )}
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="text-xs text-blue-300 hover:text-white transition-colors font-medium"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom tab bar — hidden on sm+ ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden border-t border-gray-200 bg-white flex">
        {links.map(l => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-semibold transition-colors ${
                active ? 'text-blue-700' : 'text-gray-400'
              }`}
            >
              <span className="text-lg leading-none">{l.icon}</span>
              <span>{l.label}</span>
              {active && <span className="absolute bottom-0 w-6 h-0.5 bg-blue-600 rounded-t" />}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
