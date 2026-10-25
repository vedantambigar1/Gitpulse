const g = globalThis as unknown as { __gpRate?: Map<string, { n: number; reset: number }> };
const buckets = (g.__gpRate ??= new Map());

/** Fixed-window limiter, in memory. Good enough for one instance; use Redis if you scale out. */
export function rateLimit(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    if (buckets.size >= 5000) {
      for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
      // Do not evict live buckets: doing so would let flooding reset another IP's budget.
      if (!buckets.has(key) && buckets.size >= 5000) return false;
    }
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  b.n++;
  return b.n <= limit;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}
