'use client';
import { useState, useEffect, useCallback } from 'react';

export interface LiveData {
  matchId: string;
  espnId: string;
  status: { state: string; description: string; isLive: boolean; isComplete: boolean };
  teams: Array<{ homeAway: string; name: string; abbr: string; score: string }>;
  innings: Record<string, {
    batting: Array<Record<string, string>>;
    bowling: Array<Record<string, string>>;
    total: string;
    runs: string;
  }>;
  playingEleven: string[];
  commentaries: Array<{ text: string; over: string; sequence?: number }>;
  headline: string;
  actualWinner: string | null;
  playerImageMap?: Record<string, string>;
}

export function useLiveScore(matchId: number, enabled = true) {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetch_ = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/live/${matchId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [matchId, enabled]);

  useEffect(() => {
    fetch_();
    const iv = setInterval(fetch_, 15000); // poll every 15s
    return () => clearInterval(iv);
  }, [fetch_]);

  return { data, loading, error, lastUpdated, refresh: fetch_ };
}
