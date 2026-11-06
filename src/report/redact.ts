const UNREADABLE = "(unreadable URL redacted)";

// Fails closed, because the parser does not always read credentials as credentials.
// "user:pw@host/v1" with its scheme forgotten has no host, and a "/", "\", "?", or
// "#" inside the userinfo ends the authority early, which leaves an "@" after the host.
export function redactUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return UNREADABLE;
  }
  if (!u.host || `${u.pathname}${u.search}${u.hash}`.includes("@")) return UNREADABLE;

  const removed: string[] = [];
  if (u.username || u.password) removed.push("credentials");
  if (u.search) removed.push("query");
  if (u.hash) removed.push("fragment");
  u.username = "";
  u.password = "";
  u.search = "";
  u.hash = "";
  return removed.length ? `${u.toString()} (${removed.join(", ")} redacted)` : u.toString();
}
