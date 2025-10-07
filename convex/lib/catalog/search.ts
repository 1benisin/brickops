export function buildSearchKeywords(partNumber: string, name: string): string {
  const tokens = new Set<string>();
  const push = (value?: string | null) => {
    if (!value) return;
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .forEach((token) => tokens.add(token));
  };
  push(partNumber);
  push(name);
  return Array.from(tokens).join(" ");
}
