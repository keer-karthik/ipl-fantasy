import iplPlayerIds from '../../data/player_images.json';

const _ids = iplPlayerIds as Record<string, string>;
const _norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

export function iplImageUrl(name: string): string | undefined {
  const n = _norm(name);
  for (const [k, id] of Object.entries(_ids)) {
    if (_norm(k) === n) return `/api/player-image/${id}`;
  }
  // Fuzzy: last-name-only match (≥4 chars to avoid false positives)
  const lastName = name.trim().split(' ').pop()?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
  if (lastName.length >= 4) {
    for (const [k, id] of Object.entries(_ids)) {
      if (_norm(k.trim().split(' ').pop() ?? '') === lastName) {
        return `/api/player-image/${id}`;
      }
    }
  }
  return undefined;
}
