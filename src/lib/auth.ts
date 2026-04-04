// server-only — never import from client components

export function sideForEmail(email: string): 'lads' | 'gils' | null {
  const e = email.toLowerCase().trim();
  if (e === process.env.LADS_EMAIL?.toLowerCase()) return 'lads';
  if (e === process.env.GILS_EMAIL?.toLowerCase()) return 'gils';
  return null;
}
