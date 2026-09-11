export function matchesKey(ev: KeyboardEvent, name: string): boolean {
  const key = ev.key;
  if (typeof key !== "string") return false;
  const wanted = name.toLowerCase() === "space" ? " " : name;
  return key.toLowerCase() === wanted.toLowerCase();
}