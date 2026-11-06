const UNREADABLE = "(unreadable URL redacted)";

// Fails closed, because the parser does not always read credentials as credentials.
// "user:pw@host/v1" with its scheme forgotten has no host, and a "/", "\", "?", or
// "#" inside the userinfo ends the authority early. The "@" check reads the raw text
// because parsing collapses dot segments, which can erase the "@" from the path.
export function redactUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return UNREADABLE;
  }
  const hasCredentials = Boolean(u.username || u.password);
  const atSigns = url.split("@").length - 1;
  if (!u.host || atSigns > (hasCredentials ? 1 : 0)) return UNREADABLE;

  const removed: string[] = [];
  if (hasCredentials) removed.push("credentials");
  if (u.search) removed.push("query");
  if (u.hash) removed.push("fragment");
  u.username = "";
  u.password = "";
  u.search = "";
  u.hash = "";
  return removed.length ? `${u.toString()} (${removed.join(", ")} redacted)` : u.toString();
}
