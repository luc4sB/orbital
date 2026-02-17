let cache: Record<string, string> | null = null;

export async function getCountryToContinentMap(): Promise<Record<string, string>> {
  if (cache) return cache;

  const res = await fetch("/data/country_continent.json", { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to load country_continent.json (${res.status})`);

  const rows = (await res.json()) as Array<{ country: string; continent: string }>;

  const map: Record<string, string> = {};
  for (const r of rows) {
    const c = (r.country ?? "").trim();
    const cont = (r.continent ?? "").trim();
    if (c && cont) map[c] = cont;
  }

  cache = map;
  return map;
}
