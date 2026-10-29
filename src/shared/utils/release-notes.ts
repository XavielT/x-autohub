/** Cuántas versiones enseña la modal de novedades como máximo. */
export const WHATS_NEW_MAX = 3;

/** `'2.30.1'` → `[2, 30, 1]`. Cualquier otra forma es `null`. */
export function parseVersion(version: string | null | undefined): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec((version ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Negativo si `a < b`, positivo si `a > b`, 0 si son iguales. Lo que no es semver pesa menos que todo. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** La mayor de dos versiones; la que no existe cede. */
export function maxVersion(a: string | null | undefined, b: string | null | undefined): string | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa) return pb ? (b as string) : null;
  if (!pb) return a as string;
  return compareVersions(a, b) >= 0 ? (a as string) : (b as string);
}

/**
 * Las versiones que la persona todavía no ha visto: mayores que `lastSeen` y no mayores que
 * `current` (una versión publicada que aún no se despliega no se anuncia). Las más recientes
 * primero, con tope de `max`; `hasMore` dice si quedaron otras por fuera.
 */
export function pendingReleases<T extends { version: string }>(
  releases: readonly T[],
  lastSeen: string,
  current: string,
  max = WHATS_NEW_MAX,
): { shown: T[]; hasMore: boolean } {
  const unseen = releases
    .filter((r) => parseVersion(r.version) && compareVersions(r.version, lastSeen) > 0 && compareVersions(r.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
  return { shown: unseen.slice(0, max), hasMore: unseen.length > max };
}
