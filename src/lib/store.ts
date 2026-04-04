'use client';

import { useEffect, useState } from 'react';
import type { MatchEntry, SeasonState, SideEntry } from './types';

const STORAGE_KEY = 'ipl-fantasy-2026';

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

export function loadState(): SeasonState {
  if (typeof window === 'undefined') return { matches: {}, ladsAllInUsed: 0, gilsAllInUsed: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { matches: {}, ladsAllInUsed: 0, gilsAllInUsed: 0 };
    return JSON.parse(raw) as SeasonState;
  } catch {
    return { matches: {}, ladsAllInUsed: 0, gilsAllInUsed: 0 };
  }
}

export function saveState(state: SeasonState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useSeasonState() {
  const [state, setStateRaw] = useState<SeasonState>({ matches: {}, ladsAllInUsed: 0, gilsAllInUsed: 0 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setStateRaw(loadState());
    setLoaded(true);
  }, []);

  function setState(updater: (prev: SeasonState) => SeasonState) {
    setStateRaw(prev => {
      const next = updater(prev);
      saveState(next);
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

  return { state, setState, getMatch, updateMatch, loaded };
}
