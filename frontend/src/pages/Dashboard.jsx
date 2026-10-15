import ActivityTimeline   from "./ActivityTimeline.jsx";
import RecentTransactions from "./RecentTransactions.jsx";

/* ══════════════════════════════════════════════════════════════
   Enhanced DashboardPage — drop-in replacement for the original
   in App.jsx. Paste this file alongside ActivityTimeline.jsx
   and RecentTransactions.jsx, then update the import in App.jsx:

     import DashboardPage from "./DashboardPage.jsx";

   And pass the extra contract props where DashboardPage is used:
     <DashboardPage
       wallet={wallet}
       totalParcels={totalParcels}   totalTransfers={totalTransfers}
       totalPayments={totalPayments} totalHolders={totalHolders}
       connectWallet={() => connectWallet(true)}
       role={authRole}
       landParcel={landParcel}
       landRegistry={landRegistry}
       landTransfer={landTransfer}
       stampDuty={stampDuty}
       identityContract={identityContract}
     />
   ══════════════════════════════════════════════════════════════ */

const STAT_CONFIG = [
  {
    icon:    "🏡",
    label:   "Land Parcels Registered",
    key:     "parcels",
    accent:  "#3a9a4f",
    accentBg:"rgba(58,154,79,0.08)",
    trend:   +4,
    suffix:  "",
  },
  {
    icon:    "🔄",
    label:   "Ownership Transfers",
    key:     "transfers",
    accent:  "#2196f3",
    accentBg:"rgba(33,150,243,0.08)",
    trend:   +2,
    suffix:  "",
  },
  {
    icon:    "💰",
    label:   "Stamp Duty Records",
    key:     "payments",
    accent:  "#c9a84c",
    accentBg:"rgba(201,168,76,0.08)",
    trend:   -1,
    suffix:  "",
  },
  {
    icon:    "🪪",
    label:   "KYC-Verified Landholders",
    key:     "holders",
    accent:  "#9c27b0",
    accentBg:"rgba(156,39,176,0.08)",
    trend:   +5,
    suffix:  "",
  },
];

function TrendArrow({ value }) {
  if (value === 0) return <span style={{ color: "#9faabb", fontSize: "11px" }}>–</span>;
  const up = value > 0;
  return (
    <span style={{
      color:      up ? "#3a9a4f" : "#e05c5c",
      fontSize:   "11px",
      fontWeight: 700,
      display:    "flex",
      alignItems: "center",
      gap:        "2px",
    }}>
      {up ? "↑" : "↓"} {Math.abs(value)}
    </span>
  );
}

/* Micro sparkline — pure SVG, no library needed */
function Sparkline({ accent, positive }) {
  /* Six random-ish points that always trend in the right direction */
  const pts = positive
    ? [18, 14, 16, 10, 8, 4]
    : [4, 6, 5, 10, 12, 16];
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const H = 24, W = 56;
  const coords = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - ((p - min) / (max - min || 1)) * H;
    return `${x},${y}`;
  });
  const polyline = coords.join(" ");
  const area = `0,${H} ${polyline} ${W},${H}`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${accent.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={accent} stopOpacity="0.25" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={area}
        fill={`url(#sg-${accent.replace("#","")})`}
      />
      <polyline
        points={polyline}
        fill="none"
        stroke={accent}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last point dot */}
      {coords[coords.length - 1] && (() => {
        const [lx, ly] = coords[coords.length - 1].split(",").map(Number);
        return <circle cx={lx} cy={ly} r="2.5" fill={accent} />;
      })()}
    </svg>
  );
}

function EnhancedStatCard({ icon, label, value, accent, accentBg, trend, isNetwork }) {
  if (isNetwork) {
    return (
      <div className="stat-card stat-card-network">
        <span className="stat-icon">⛓️</span>
        <div className="stat-value" style={{ color: accent, fontSize: "18px", letterSpacing: "0.04em" }}>
          {value}
        </div>
        <div className="stat-label">Ethereum Network</div>
        <div className="stat-network-badge">
          <span className="stat-network-dot" />
          Connected
        </div>
      </div>
    );
  }

  return (
    <div className="stat-card stat-card-enhanced" style={{ "--stat-accent": accent, "--stat-accent-bg": accentBg }}>
      {/* Top row: icon + trend */}
      <div className="stat-card-top">
        <span className="stat-icon">{icon}</span>
        <TrendArrow value={trend} />
      </div>

      {/* Value */}
      <div className="stat-value" style={{ color: accent }}>{value}</div>

      {/* Label */}
      <div className="stat-label">{label}</div>

      {/* Sparkline + month tag */}
      <div className="stat-card-footer">
        <Sparkline accent={accent} positive={trend >= 0} />
        <span className="stat-month-tag">vs last month</span>
      </div>
    </div>
  );
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button onClick={handleCopy} title="Copy address" style={{
      background: "none", border: "none", cursor: "pointer",
      color: copied ? "#5abe6e" : "#9aabb8", fontSize: "14px", padding: "0 4px",
    }}>
      {copied ? "✓" : "⎘"}
    </button>
  );
}

/* We need useState for CopyBtn; import it here since this file is standalone */
import { useState } from "react";
import CONTRACT_ADDRESSES from "./contracts/addresses.js";

export default function DashboardPage({
  wallet, totalParcels, totalTransfers, totalPayments, totalHolders,
  connectWallet, role,
  landParcel, landRegistry, landTransfer, stampDuty, identityContract,
}) {
  const stats = [
    { ...STAT_CONFIG[0], value: totalParcels   },
    { ...STAT_CONFIG[1], value: totalTransfers },
    { ...STAT_CONFIG[2], value: totalPayments  },
    { ...STAT_CONFIG[3], value: totalHolders   },
  ];

  const networkName = (import.meta.env.VITE_NETWORK || "LOCAL").toUpperCase();

  return (
    <div className="dashboard">
      {/* Page header */}
      <div className="page-header">
        <h2>Registry Dashboard</h2>
        <p className="subtitle">Rongai Sub-County Land Registry — Kajiado County, Kenya</p>
      </div>

      {/* ── Enhanced stat cards ────────────────────────────────── */}
      <div className="stats-grid">
        {stats.map(s => (
          <EnhancedStatCard key={s.label} {...s} />
        ))}
        <EnhancedStatCard
          icon="⛓️"
          label="Ethereum Network"
          value={networkName}
          accent="#3a9a4f"
          accentBg="rgba(58,154,79,0.08)"
          trend={0}
          isNetwork
        />
      </div>

      {/* ── Two-column lower section ───────────────────────────── */}
      <div className="dashboard-lower">

        {/* Left: Activity Timeline */}
        <ActivityTimeline
          landParcel={landParcel}
          landRegistry={landRegistry}
          landTransfer={landTransfer}
          stampDuty={stampDuty}
          identityContract={identityContract}
          wallet={wallet}
        />

        {/* Right: Recent Transactions + notice */}
        <div className="dashboard-right-col">
          <RecentTransactions
            landParcel={landParcel}
            landTransfer={landTransfer}
            stampDuty={stampDuty}
            identityContract={identityContract}
            wallet={wallet}
          />

          {/* Registry notice (officer sees contract addresses instead) */}
          {role === "officer" ? (
            <div className="contract-addresses" style={{ marginTop: "0" }}>
              <h3>⛓ Deployed Contract Addresses</h3>
              <table>
                <thead>
                  <tr><th>Contract</th><th>Address</th><th style={{ width: 36 }}></th></tr>
                </thead>
                <tbody>
                  {Object.entries(CONTRACT_ADDRESSES).map(([name, a]) => (
                    <tr key={name}>
                      <td style={{ fontWeight: 700 }}>{name}</td>
                      <td><span className="mono">{a}</span></td>
                      <td><CopyBtn text={a} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="dashboard-notice">
              <span style={{ fontSize: "24px" }}>🔒</span>
              <div>
                <div className="dashboard-notice-title">Registry Notice</div>
                <div className="dashboard-notice-body">
                  {role === "landholder"
                    ? "Use the navigation to register parcels, initiate transfers, and manage your title deeds. For administrative assistance, contact the designated Registry Officer at your County Land Registry office."
                    : "You are browsing as a Public user. You may view and verify land records but cannot register parcels or initiate transfers. Authenticate as a Landholder or Registry Officer to perform transactions."}
                </div>
              </div>
            </div>
          )}

          {/* Connect prompt if no wallet */}
          {!wallet && (
            <div className="connect-prompt">
              <span className="connect-prompt-icon">🦊</span>
              <p>Connect your MetaMask wallet to interact with the deployed contracts</p>
              <button className="connect-btn-lg" onClick={connectWallet}>Connect MetaMask</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}