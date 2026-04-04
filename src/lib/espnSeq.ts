/**
 * ESPN cricket commentary sequence decoder.
 *
 * ESPN encodes each ball as: innings × 100000 + over × 100 + ball
 * e.g. 200708 = innings 2, over 7, ball 8
 *
 * We convert this to a 0–39.6 "over-position" float:
 *   innings 1 → 0–19.6   (over 1 ball 1 = 0.1 … over 20 ball 6 = 19.6)
 *   innings 2 → 20–39.6  (over 1 ball 1 = 20.1 … over 20 ball 6 = 39.6)
 */

export interface DecodedSeq {
  innings: number;
  over: number;
  ball: number;
}

export function decodeSeq(seq: number): DecodedSeq | null {
  if (!seq || seq < 100000) return null;
  const innings = Math.floor(seq / 100000);
  const over    = Math.floor((seq % 100000) / 100);
  const ball    = seq % 100;
  if (innings < 1 || innings > 2 || over < 1 || over > 20 || ball < 1) return null;
  return { innings, over, ball };
}

/** Convert an ESPN sequence integer to a 0–39.6 chart x-position. */
export function seqToOverPos(seq: number): number | null {
  const d = decodeSeq(seq);
  if (!d) return null;
  return (d.innings - 1) * 20 + (d.over - 1) + d.ball / 10;
}
