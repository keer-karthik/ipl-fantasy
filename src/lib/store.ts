'use client';

import { useEffect, useState } from 'react';
import { useSession } from './session';
import type { MatchEntry, SeasonState, SideEntry } from './types';

function emptySide(): SideEntry {
  return {
    picks: [],
    stats: [],
    results: [],
    predictedWinner: null,
    allInUsed: false,
    total: 0,
  };
}

export function emptyMatch(matchId: number): MatchEntry {
  return {
    matchId,
    isPicksLocked: false,
    isComplete: false,
    lads: emptySide(),
    gils: emptySide(),
    winner: null,
    actualWinner: null,
  };
}

function emptyState(): SeasonState {
  return { matches: {}, ladsAllInUsed: 0, gilsAllInUsed: 0 };
}

export function useSeasonState() {
  const [state, setStateRaw] = useState<SeasonState>(emptyState());
  const [loaded, setLoaded] = useState(false);
  const { side, setSide } = useSession();

  useEffect(() => {
    fetch('/api/state')
      .then(r => {
        if (r.status === 401) {
          window.location.href = '/login';
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        setStateRaw(data.state ?? emptyState());
        setSide(data.side ?? null);
        setLoaded(true);
      })
      .catch(() => {
        // Network error — stay on loading state
      });
  }, []);

  function setState(updater: (prev: SeasonState) => SeasonState) {
    setStateRaw(prev => {
      const next = updater(prev);
      // Optimistic update locally; persist in background
      fetch('/api/state', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: next }),
      }).then(r => {
        if (r.status === 401) window.location.href = '/login';
        if (!r.ok) r.json().then(b => console.error('[state] PATCH failed:', r.status, b)).catch(() => {});
      }).catch(err => {
        console.error('[state] PATCH network error:', err);
      });
      return next;
    });
  }

  function getMatch(matchId: number): MatchEntry {
    return state.matches[matchId] ?? emptyMatch(matchId);
  }

  function updateMatch(matchId: number, updater: (m: MatchEntry) => MatchEntry) {
    setState(prev => ({
      ...prev,
      matches: {
        ...prev.matches,
        [matchId]: updater(prev.matches[matchId] ?? emptyMatch(matchId)),
      },
    }));
  }

  return { state, setState, getMatch, updateMatch, loaded, side };
}
