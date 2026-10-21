// Fixed-window limit per signed-in user, kept in this process's memory.
// With several server instances each one counts separately; that is enough
// to stop scripted guessing or scraping from a single session.
export const rateLimitPerUser = ({ windowMs, max, message = "Too many requests. Try again later." }) => {
  const hits = new Map();

  return (req, res, next) => {
    const key = String(req.user?.id ?? req.user?._id ?? req.ip);
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now - entry.start >= windowMs) {
      hits.set(key, { start: now, count: 1 });
      // Forget idle users so the map cannot grow without bound.
      if (hits.size > 10_000) {
        for (const [storedKey, value] of hits) {
          if (now - value.start >= windowMs) hits.delete(storedKey);
        }
      }
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.start + windowMs - now) / 1000)));
      return res.status(429).json({ error: message, code: "RATE_LIMITED", requestId: req.requestId });
    }
    next();
  };
};
