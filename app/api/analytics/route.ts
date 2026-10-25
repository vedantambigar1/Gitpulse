import { verifyRecordName, verifyRecordValue } from "@/lib/domains";
import { authLicense } from "@/lib/license";
import { getStats } from "@/lib/store";

/** Pro: view and visitor stats for every username on the license. Auth via the private `Authorization: Bearer gpm_...` credential. */
export async function GET(req: Request) {
  const license = authLicense(req);
  if (!license) return Response.json({ error: "A valid private dashboard key for an active Pro license is required" }, { status: 401 });

  const days = Math.min(90, Math.max(7, Number(new URL(req.url).searchParams.get("days")) || 30));
  return Response.json(
    {
      license: {
        plan: license.plan,
        status: license.status,
        usernames: license.usernames,
        domains: license.domains.map((d) => ({
          host: d.host,
          username: d.username,
          verified: d.verified === true,
          verifyName: verifyRecordName(d.host),
          verifyValue: verifyRecordValue(license.key, d.host),
        })),
        canManageBilling: Boolean(license.stripeCustomerId),
        createdAt: license.createdAt,
      },
      days,
      stats: license.usernames.map((u) => getStats(u, days)),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
