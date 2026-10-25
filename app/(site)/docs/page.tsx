import type { Metadata } from "next";
import { SITE } from "@/lib/config";

export const metadata: Metadata = {
  title: "Docs",
  description: "Embed options, Notion setup, JSON API, custom domains and self-hosting.",
};

const OPTIONS: [string, string, string, string][] = [
  ["t", "midnight, paper, terminal. Pro: dracula, nord, solar, sunset, aurora, rose, mono", "midnight", "Pro themes"],
  ["l", "wide or compact", "wide", ""],
  ["s", "Comma list of header, stats, streak, heatmap, languages, repos, activity", "header,stats,streak,heatmap,languages,repos", ""],
  ["r", "Number of projects, 1 to 6", "4", ""],
  ["src", "pinned or stars", "pinned", ""],
  ["a", "Accent color as 6 hex digits, no #", "theme color", "Pro"],
  ["rad", "Corner radius in pixels, 0 to 32", "14", ""],
  ["bg", "transparent", "solid", ""],
  ["nb", "1 hides the GitPulse badge", "badge shown", "Pro"],
  ["k", "Your license key", "none", "Pro"],
];

export default function Docs() {
  return (
    <main className="wrap">
      <article className="docs">
        <header className="page-head" style={{ paddingLeft: 0 }}>
          <h1>Docs</h1>
          <p>Everything you need to add the widget, customize it and run it yourself.</p>
        </header>

        <h2>Quick start</h2>
        <p>Add a placeholder where the widget should appear, then load the script once per page.</p>
        <pre className="code"><code>{`<div data-gitpulse="your-username" data-config="t=dracula&l=wide"></div>
<script async src="${SITE.url}/embed.js"></script>`}</code></pre>
        <p>
          The <code>data-config</code> value is the same set of options listed below. The easiest way to build it is the studio, which gives you a live preview
          and the exact snippet to copy.
        </p>

        <h2>Options</h2>
        <table>
          <thead><tr><th>Param</th><th>Values</th><th>Default</th><th>Plan</th></tr></thead>
          <tbody>
            {OPTIONS.map(([p, v, d, plan]) => (
              <tr key={p}><td><code>{p}</code></td><td>{v}</td><td>{d}</td><td>{plan || "Free"}</td></tr>
            ))}
          </tbody>
        </table>
        <p>Pro options are ignored unless a valid <code>k</code> is present, and the widget falls back to the free look.</p>

        <h2>Notion</h2>
        <p>
          In a Notion page type <code>/embed</code>, paste <code>{SITE.url}/w/your-username?t=dracula</code> and choose Embed link. Drag the bottom edge to
          make it taller if you show more sections.
        </p>

        <h2>GitHub README</h2>
        <p>Scripts cannot run in a README, so use the SVG card. It shows your name, streak, stats, contribution graph and languages.</p>
        <pre className="code"><code>{`[![GitHub activity](${SITE.url}/api/card/your-username.svg?t=paper)](https://github.com/your-username)`}</code></pre>
        <p>The card supports <code>t</code>, <code>a</code>, <code>rad</code>, <code>nb</code> and <code>k</code>.</p>

        <h2>JSON API</h2>
        <pre className="code"><code>{`GET ${SITE.url}/api/github/your-username`}</code></pre>
        <p>
          Returns profile, totals, streaks, the contribution calendar, pinned and top repositories, language shares and recent events. Responses are cached for
          10 minutes at the edge and CORS is open. Limit: 60 requests per minute per IP.
        </p>

        <h2>Analytics (Pro)</h2>
        <p>
          Every widget view is counted with a salted hash that rotates daily. No cookies are set and no personal data is stored. Open the dashboard with your private dashboard key to
          see views, unique visitors and referring sites. The same data is available from the API:
        </p>
        <pre className="code"><code>{`curl ${SITE.url}/api/analytics?days=30 \\
  -H "Authorization: Bearer gpm_your_private_dashboard_key"`}</code></pre>

        <h2>Custom domains (Pro)</h2>
        <p>
          In the dashboard connect a domain such as <code>activity.yourname.dev</code> and create a CNAME record pointing to <code>{SITE.cnameTarget}</code>. Visiting
          that domain shows your widget full page, and you can also use it as the iframe source.
        </p>

        <h2>Run it yourself</h2>
        <ol>
          <li>Copy <code>.env.example</code> to <code>.env.local</code> and add a <code>GITHUB_TOKEN</code> (a token with no scopes is enough).</li>
          <li>Run <code>npm install</code> then <code>npm run dev</code>.</li>
          <li>For payments, create a monthly and a one-time Price in Stripe, add their ids and your keys, and point a webhook at <code>/api/webhook/stripe</code>.</li>
          <li>Set <code>APP_HOSTS</code> to enable custom domain routing.</li>
        </ol>
        <p>
          Without a token the app runs in demo mode with generated data, so you can try every screen before connecting anything.
        </p>
      </article>
    </main>
  );
}
