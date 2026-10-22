const SECRET_KEYS = new Set(["credential", "access_token", "refresh_token", "device_code", "id_token"]);

/**
 * A copy of `value` that is safe to show on screen. Payment credentials and tokens are replaced,
 * and JSON embedded in strings (MCP tool results are JSON inside JSON) is opened so it can be redacted and read.
 */
export function redact(value: unknown): unknown {
  if (typeof value === "string") return redactEmbedded(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.has(k) ? "[redacted]" : redact(v)]));
  }
  return value;
}

function redactEmbedded(text: string): unknown {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return text;
  try {
    return redact(JSON.parse(text));
  } catch {
    return text;
  }
}
