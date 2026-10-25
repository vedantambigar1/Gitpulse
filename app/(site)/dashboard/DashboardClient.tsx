"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SITE } from "@/lib/config";

interface DomainView {
  host: string;
  username: string;
  verified: boolean;
  verifyName: string;
  verifyValue: string;
}

interface DayPoint {
  date: string;
  views: number;
  uniques: number;
}
interface UserStats {
  username: string;
  days: DayPoint[];
  totals: { views: number; uniques: number };
  referrers: { host: string; views: number }[];
}
interface Analytics {
  license: { plan: string; status: string; usernames: string[]; domains: DomainView[]; canManageBilling: boolean; createdAt: string };
  days: number;
  stats: UserStats[];
}

function Bars({ days, label }: { days: DayPoint[]; label: string }) {
  const W = 640;
  const H = 150;
  const base = H - 22;
  const max = Math.max(1, ...days.map((d) => d.views));
  const step = W / days.length;
  const bw = Math.max(3, step * 0.62);
  return (
    <svg className="bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {days.map((d, i) => {
        const x = i * step + (step - bw) / 2;
        const vh = (d.views / max) * (base - 6);
        const uh = (d.uniques / max) * (base - 6);
        return (
          <g key={d.date}>
            <title>{`${d.date}: ${d.views} views, ${d.uniques} visitors`}</title>
            <rect className="v" x={x} y={base - vh} width={bw} height={Math.max(vh, d.views ? 2 : 0)} rx={2} />
            <rect className="u" x={x + bw * 0.22} y={base - uh} width={bw * 0.56} height={Math.max(uh, d.uniques ? 2 : 0)} rx={1.5} />
          </g>
        );
      })}
      <line x1={0} x2={W} y1={base + 0.5} y2={base + 0.5} stroke="#e3e5ec" />
      <text x={0} y={H - 5}>{days[0]?.date.slice(5)}</text>
      <text x={W} y={H - 5} textAnchor="end">{days[days.length - 1]?.date.slice(5)}</text>
      <text x={W} y={10} textAnchor="end">peak {max}</text>
    </svg>
  );
}

export default function DashboardClient() {
  const [key, setKey] = useState("");
  const [input, setInput] = useState("");
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [domain, setDomain] = useState({ host: "", username: "" });
  const [domainMsg, setDomainMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [recoverEmail, setRecoverEmail] = useState("");
  const [recoverMsg, setRecoverMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [billingMsg, setBillingMsg] = useState("");

  const load = useCallback(async (k: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/analytics?days=30", { headers: { Authorization: `Bearer ${k}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load analytics");
      setData(json);
      setKey(k);
      try {
        localStorage.setItem("gp_management_key", k);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Could not load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("gp_management_key");
      if (saved) {
        setInput(saved);
        load(saved);
      }
    } catch {
      /* ignore */
    }
  }, [load]);

  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    setDomainMsg(null);
    const res = await fetch("/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ host: domain.host, username: domain.username || data?.license.usernames[0] }),
    });
    const json = await res.json();
    if (!res.ok) return setDomainMsg({ ok: false, text: json.error ?? "Could not connect the domain" });
    setDomainMsg({ ok: true, text: `${json.host} was added. Create the TXT record shown below, then press Verify.` });
    setDomain({ host: "", username: "" });
    load(key);
  }

  async function verifyDomain(host: string) {
    setDomainMsg(null);
    const res = await fetch("/api/domains/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ host }),
    });
    const json = await res.json();
    if (!res.ok) return setDomainMsg({ ok: false, text: json.error ?? "Could not verify the domain" });
    setDomainMsg({ ok: true, text: `${host} is verified and now serving your widget.` });
    load(key);
  }

  async function openBilling() {
    setBillingMsg("");
    const res = await fetch("/api/billing/portal", { method: "POST", headers: { Authorization: `Bearer ${key}` } });
    const json = await res.json();
    if (!res.ok || !json.url) return setBillingMsg(json.error ?? "Could not open the billing portal");
    window.location.href = json.url;
  }

  async function recover(e: React.FormEvent) {
    e.preventDefault();
    setRecoverMsg(null);
    const res = await fetch("/api/license/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: recoverEmail }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setRecoverMsg({ ok: false, text: json.error ?? "Could not send the email" });
    setRecoverMsg({ ok: true, text: "If that address has a Pro license, we just emailed the key to it. Check your spam folder too." });
  }

  async function removeDomain(host: string) {
    await fetch(`/api/domains?host=${encodeURIComponent(host)}`, { method: "DELETE", headers: { Authorization: `Bearer ${key}` } });
    load(key);
  }

  if (!data) {
    return (
      <div className="panel" style={{ maxWidth: 520, marginBottom: 80 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(input.trim());
          }}
        >
          <div className="field">
            <label htmlFor="dash-key">Private dashboard key</label>
            <input id="dash-key" className="input mono" placeholder="gpm_..." value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" spellCheck={false} />
            <p className="hint">
              You received it after checkout. Keep it private and out of embeds. Existing customers can recover it by email below. No key yet? <Link href="/#pricing">See Pro</Link>.
            </p>
          </div>
          <button className="btn btn-signal" disabled={loading || !input.trim()}>
            {loading ? "Loading" : "Open dashboard"}
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
        <form onSubmit={recover} style={{ marginTop: 28 }}>
          <div className="field">
            <label htmlFor="recover-email">Lost your key?</label>
            <input id="recover-email" type="email" className="input" placeholder="Email you used at checkout" value={recoverEmail} onChange={(e) => setRecoverEmail(e.target.value)} autoComplete="email" />
            <p className="hint">We will email your key to the address you paid with.</p>
          </div>
          <button className="btn btn-quiet btn-sm" disabled={!recoverEmail.trim()}>Email me my key</button>
          {recoverMsg && <p className={recoverMsg.ok ? "hint" : "form-error"} role="status" style={{ marginTop: 10 }}>{recoverMsg.text}</p>}
        </form>
      </div>
    );
  }

  const total = data.stats.reduce((s, u) => s + u.totals.views, 0);

  return (
    <div className="stack" style={{ paddingBottom: 80 }}>
      <div className="panel">
        <div className="kpis">
          <div className="kpi"><b>{total}</b><span>views in the last {data.days} days</span></div>
          <div className="kpi"><b>{data.license.usernames.length}</b><span>of 3 usernames used</span></div>
          <div className="kpi"><b>{data.license.plan === "lifetime" ? "Lifetime" : "Monthly"}</b><span>plan</span></div>
        </div>
        {data.license.usernames.length === 0 && (
          <p className="hint">
            Nothing here yet. Add your key to a widget in the <Link href="/studio">studio</Link>, embed it, and your first view will appear within seconds.
          </p>
        )}
      </div>

      {data.stats.map((s) => (
        <div className="panel" key={s.username}>
          <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>@{s.username}</h2>
          <div className="kpis">
            <div className="kpi"><b>{s.totals.views}</b><span>views</span></div>
            <div className="kpi"><b>{s.totals.uniques}</b><span>unique visitors</span></div>
          </div>
          <Bars days={s.days} label={`Daily views for ${s.username}`} />
          <div className="legend">
            <span><i style={{ background: "#c9ccdb" }} />Views</span>
            <span><i style={{ background: "var(--signal)" }} />Unique visitors</span>
          </div>
          <h3 style={{ margin: "24px 0 6px", fontSize: 16 }}>Where visitors come from</h3>
          {s.referrers.length === 0 ? (
            <p className="hint">No views recorded yet.</p>
          ) : (
            <table className="table">
              <thead><tr><th>Site</th><th>Views</th></tr></thead>
              <tbody>
                {s.referrers.map((r) => (
                  <tr key={r.host}><td>{r.host === "direct" ? "Direct or unknown" : r.host}</td><td>{r.views}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      <div className="panel">
        <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Custom domains</h2>
        <p className="hint" style={{ marginBottom: 16 }}>
          Serve your widget page from your own domain, for example <span className="mono">activity.yourname.dev</span>.
        </p>
        {data.license.domains.length > 0 && (
          <table className="table" style={{ marginBottom: 18 }}>
            <thead><tr><th>Domain</th><th>Username</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.license.domains.map((d) => (
                <tr key={d.host}>
                  <td className="mono">{d.host}</td>
                  <td>@{d.username}</td>
                  <td>{d.verified ? "Verified" : "Needs verification"}</td>
                  <td>
                    {!d.verified && <button className="btn btn-signal btn-sm" onClick={() => verifyDomain(d.host)} style={{ marginRight: 8 }}>Verify</button>}
                    <button className="btn btn-quiet btn-sm" onClick={() => removeDomain(d.host)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data.license.domains.filter((d) => !d.verified).map((d) => (
          <div key={d.host} className="hint" style={{ marginBottom: 16 }}>
            To verify <b className="mono">{d.host}</b>, add this DNS record, wait a few minutes, then press Verify:
            <div className="mono" style={{ marginTop: 6, wordBreak: "break-all" }}>
              Type: TXT<br />
              Name: {d.verifyName}<br />
              Value: {d.verifyValue}
            </div>
          </div>
        ))}
        <form className="inline-form" onSubmit={addDomain}>
          <input className="input" aria-label="Domain" placeholder="activity.yourname.dev" value={domain.host} onChange={(e) => setDomain({ ...domain, host: e.target.value })} />
          <input className="input" aria-label="GitHub username" placeholder={data.license.usernames[0] ?? "github-username"} value={domain.username} onChange={(e) => setDomain({ ...domain, username: e.target.value })} />
          <button className="btn btn-signal" disabled={!domain.host}>Connect domain</button>
        </form>
        {domainMsg && <p className={domainMsg.ok ? "hint" : "form-error"} role="status" style={{ marginTop: 10 }}>{domainMsg.text}</p>}
        <p className="hint" style={{ marginTop: 14 }}>
          You need two DNS records at your DNS provider: the <b>TXT</b> record above, which proves the domain is yours, and a <b>CNAME</b> record from your domain to <span className="mono">{SITE.cnameTarget}</span>, which points visitors here. It usually takes a few minutes to start working.
        </p>
      </div>

      {data.license.canManageBilling && (
        <div className="panel">
          <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Billing</h2>
          <p className="hint" style={{ marginBottom: 12 }}>Cancel your plan, update your card or download invoices.</p>
          <button className="btn btn-quiet btn-sm" onClick={openBilling}>Manage billing</button>
          {billingMsg && <p className="form-error" role="alert" style={{ marginTop: 10 }}>{billingMsg}</p>}
        </div>
      )}

      <div>
        <button className="btn btn-quiet btn-sm" onClick={() => { setData(null); setKey(""); }}>
          Use a different key
        </button>
      </div>
    </div>
  );
}
