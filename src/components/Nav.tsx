'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/fixtures', label: 'Fixtures' },
  { href: '/players', label: 'Players' },
  { href: '/rules', label: 'Rules' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-50 shadow-md" style={{ background: 'var(--ipl-navy)' }}>
      <div className="max-w-5xl mx-auto px-4 flex items-center gap-1 h-14">
        <Link href="/" className="font-bold text-lg mr-8 text-white shrink-0 flex items-center gap-2">
          <span className="text-2xl">🏏</span>
          <span className="text-white font-extrabold tracking-wide">IPL <span style={{ color: '#f7a500' }}>Fantasy</span></span>
        </Link>
        <div className="flex items-center gap-0.5">
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
        <div className="ml-auto">
          <span className="text-xs text-blue-300 font-medium">TATA IPL 2026</span>
        </div>
      </div>
    </nav>
  );
}
