// Development logs show requests and responses; passwords, tokens and the
// CSRF header must never reach the console with them.
const SECRET_KEY = /pass(word)?|token|secret|csrf|authorization|cookie/i;
const REDACTED = "[redacted]";

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (typeof FormData !== "undefined" && value instanceof FormData) return "[FormData]";
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
  // Axios headers are a class with a toJSON(); log them as plain data.
  const source = typeof (value as { toJSON?: unknown }).toJSON === "function"
    ? (value as { toJSON: () => object }).toJSON()
    : value;
  return Object.fromEntries(
    Object.entries(source).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? REDACTED : redactSecrets(item, depth + 1),
    ]),
  );
}
