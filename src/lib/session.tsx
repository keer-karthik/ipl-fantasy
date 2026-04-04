'use client';

import { createContext, useContext, useState } from 'react';

interface SessionContextValue {
  side: 'lads' | 'gils' | null;
  setSide: (side: 'lads' | 'gils' | null) => void;
}

const SessionContext = createContext<SessionContextValue>({
  side: null,
  setSide: () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [side, setSide] = useState<'lads' | 'gils' | null>(null);
  return (
    <SessionContext.Provider value={{ side, setSide }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
