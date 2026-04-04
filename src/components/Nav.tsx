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
    <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 flex items-center gap-1 h-14">
        <Link href="/" className="font-bold text-lg mr-6 text-yellow-400 shrink-0">
          🏏 IPL Fantasy
        </Link>
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              path === l.href
                ? 'bg-yellow-400 text-gray-900'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
