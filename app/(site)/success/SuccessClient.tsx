"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function SuccessClient({ sessionId, demo }: { sessionId: string; demo: boolean }) {
  const [key, setKey] = useState("");
  const [dashboardKey, setDashboardKey] = useState("");
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sessionId) return setFailed(true);
    let tries = 0;
    let stop = false;
    async function poll() {
      try {
        const res = await fetch(`/api/license/session?session_id=${encodeURIComponent(sessionId)}`);
        if (res.ok) {
          const json = await res.json();
          if (!stop) {
            setKey(json.key);
            setDashboardKey(json.managementKey);
            try {
              localStorage.setItem("gp_key", json.key);
              localStorage.setItem("gp_management_key", json.managementKey);
            } catch {
              /* ignore */
            }
          }
          return;
        }
      } catch {
        /* retry */
      }
      if (++tries > 20) return setFailed(true);
      if (!stop) setTimeout(poll, 1500);
    }
    poll();
    return () => {
      stop = true;
    };
  }, [sessionId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  if (failed) {
    return (
      <p className="notice notice-err" role="alert">
        We could not find your license yet. If you were charged, it will appear within a minute. Refresh this page, or contact support with your payment receipt.
      </p>
    );
  }
  if (!key) return <p className="hint" role="status">Confirming your payment...</p>;

  return (
    <div className="stack">
      {demo && <p className="notice">Demo checkout: no payment was taken. Connect Stripe to charge for real.</p>}
      <div className="key-box">
        <code>{key}</code>
        <button className="btn btn-sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <p className="hint">Private dashboard key. Save it securely; never put it in your widget snippet.</p>
      <div className="key-box"><code style={{ overflowWrap: "anywhere" }}>{dashboardKey}</code></div>
      <div className="where" style={{ margin: 0 }}>
        <ul className="where">
          <li>
            <b>Add it to your widget</b>
            <span>Open the <Link href="/studio">studio</Link>, paste the key, and copy your new snippet. Pro themes, your accent color and badge removal switch on.</span>
          </li>
          <li>
            <b>Watch your views</b>
            <span>The <Link href="/dashboard">dashboard</Link> shows views, unique visitors and referrers, and lets you connect a custom domain.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
