import { useState, useEffect, useCallback } from "react";

/* ══════════════════════════════════════════════════════════════
   ActivityTimeline — Rongai Land Registry
   Props:
     landParcel        — ethers contract instance
     landRegistry      — ethers contract instance
     landTransfer      — ethers contract instance
     stampDuty         — ethers contract instance
     identityContract  — ethers contract instance
     wallet            — connected wallet address string
   ══════════════════════════════════════════════════════════════ */

const EVENT_TYPES = {
  all:          { label: "All",          icon: "⊞" },
  registration: { label: "Registration", icon: "🏡" },
  transfer:     { label: "Transfer",     icon: "🔄" },
  kyc:          { label: "KYC",          icon: "🪪" },
  stamp:        { label: "Stamp Duty",   icon: "💰" },
  deed:         { label: "Title Deed",   icon: "📜" },
};

const TYPE_META = {
  registration: {
    badge: "badge-green",
    iconBg: "#EAF3DE",
    iconColor: "#3B6D11",
    dot: "#1D9E75",
    icon: "🏡",
  },
  transfer: {
    badge: "badge-blue",
    iconBg: "#E6F1FB",
    iconColor: "#185FA5",
    dot: "#378ADD",
    icon: "🔄",
  },
  kyc: {
    badge: "badge-teal",
    iconBg: "#E1F5EE",
    iconColor: "#0F6E56",
    dot: "#1D9E75",
    icon: "🪪",
  },
  "kyc-failed": {
    badge: "badge-red",
    iconBg: "#FCEBEB",
    iconColor: "#A32D2D",
    dot: "#E24B4A",
    icon: "🪪",
  },
  stamp: {
    badge: "badge-amber",
    iconBg: "#FAEEDA",
    iconColor: "#854F0B",
    dot: "#BA7517",
    icon: "💰",
  },
  deed: {
    badge: "badge-purple",
    iconBg: "#EEEDFE",
    iconColor: "#3C3489",
    dot: "#7F77DD",
    icon: "📜",
  },
};

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000)       return "Just now";
  if (diff < 3600000)     return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000)    return Math.floor(diff / 3600000) + "h ago";
  if (diff < 172800000)   return "Yesterday, " + d.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short" }) +
    ", " + d.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
}

function shortHash(hash) {
  if (!hash || hash.length < 12) return hash;
  return hash.slice(0, 6) + "…" + hash.slice(-4);
}

/* Seed data used when contracts aren't yet returning events */
function buildSeedEvents() {
  const now = Date.now();
  return [
    {
      id: "seed-1", type: "registration",
      badgeLabel: "Registered",
      event: "Parcel LR/RON/2025/041 registered",
      detail: "Owner: James Mutua Kamau · 12.5 acres, Rongai North",
      time: now - 1000 * 60 * 18,
      hash: "0x4a3fc91b",
    },
    {
      id: "seed-2", type: "kyc",
      badgeLabel: "KYC approved",
      event: "KYC verification approved",
      detail: "Landholder: Grace Wanjiku Njoroge · National ID verified",
      time: now - 1000 * 60 * 73,
      hash: "0x7c1db83a",
    },
    {
      id: "seed-3", type: "transfer",
      badgeLabel: "Transfer",
      event: "Ownership transfer initiated — LR/RON/2024/017",
      detail: "From: Peter Odhiambo → To: Mary Akinyi Otieno",
      time: now - 1000 * 60 * 165,
      hash: "0x2e9bf04c",
    },
    {
      id: "seed-4", type: "stamp",
      badgeLabel: "Stamp duty",
      event: "Stamp duty payment confirmed",
      detail: "Amount: KES 42,000 · Ref: SD/2025/0088 · Plot LR/RON/2024/017",
      time: now - 1000 * 60 * 60 * 30,
      hash: "0x9d5ea12f",
    },
    {
      id: "seed-5", type: "deed",
      badgeLabel: "Title deed",
      event: "Title deed issued — LR/RON/2025/038",
      detail: "Holder: Samuel Kipchoge Rotich · 6.2 acres, Rongai Central",
      time: now - 1000 * 60 * 60 * 32,
      hash: "0x3b7ae56d",
    },
    {
      id: "seed-6", type: "kyc",
      badgeLabel: "KYC approved",
      event: "KYC verification approved",
      detail: "Landholder: David Mwangi Karanja · Passport verified",
      time: now - 1000 * 60 * 60 * 35,
      hash: "0x6f2cd90b",
    },
    {
      id: "seed-7", type: "registration",
      badgeLabel: "Registered",
      event: "Parcel LR/RON/2025/040 registered",
      detail: "Owner: Faith Chebet Korir · 3.8 acres, Rongai East",
      time: now - 1000 * 60 * 60 * 55,
      hash: "0x8a1ec47f",
    },
    {
      id: "seed-8", type: "transfer",
      badgeLabel: "Transfer complete",
      event: "Ownership transfer completed — LR/RON/2024/009",
      detail: "New owner: Esther Nyambura Maina · Recorded on Sepolia",
      time: now - 1000 * 60 * 60 * 58,
      hash: "0x1d4fb72e",
    },
  ];
}

/* Parse on-chain events from contract logs into unified shape */
async function fetchOnChainEvents(landParcel, landRegistry, landTransfer, stampDuty, identityContract) {
  const results = [];

  try {
    if (landParcel) {
      const filter = landParcel.filters.ParcelRegistered?.();
      if (filter) {
        const logs = await landParcel.queryFilter(filter, -2000);
        logs.forEach(log => {
          results.push({
            id: log.transactionHash + "-reg",
            type: "registration",
            badgeLabel: "Registered",
            event: `Parcel ${log.args?.parcelId || log.args?.[1] || "—"} registered`,
            detail: `Owner: ${shortAddr(log.args?.owner || log.args?.[0])}`,
            time: null,
            hash: log.transactionHash,
            blockNumber: log.blockNumber,
          });
        });
      }
    }
  } catch { /* contract may not have this event */ }

  try {
    if (landTransfer) {
      const filter = landTransfer.filters.TransferInitiated?.();
      if (filter) {
        const logs = await landTransfer.queryFilter(filter, -2000);
        logs.forEach(log => {
          results.push({
            id: log.transactionHash + "-tx",
            type: "transfer",
            badgeLabel: "Transfer",
            event: `Transfer initiated — ${log.args?.parcelId || log.args?.[2] || "—"}`,
            detail: `From: ${shortAddr(log.args?.seller || log.args?.[3])} → To: ${shortAddr(log.args?.buyer || log.args?.[4])}`,
            time: null,
            hash: log.transactionHash,
            blockNumber: log.blockNumber,
          });
        });
      }
    }
  } catch { /* */ }

  try {
    if (identityContract) {
      const filter = identityContract.filters.IdentityRegistered?.();
      if (filter) {
        const logs = await identityContract.queryFilter(filter, -2000);
        logs.forEach(log => {
          results.push({
            id: log.transactionHash + "-kyc",
            type: "kyc",
            badgeLabel: "KYC registered",
            event: "Identity registration submitted",
            detail: `Wallet: ${shortAddr(log.args?.holder || log.args?.[0])}`,
            time: null,
            hash: log.transactionHash,
            blockNumber: log.blockNumber,
          });
        });
      }
    }
  } catch { /* */ }

  try {
    if (stampDuty) {
      const filter = stampDuty.filters.PaymentCreated?.();
      if (filter) {
        const logs = await stampDuty.queryFilter(filter, -2000);
        logs.forEach(log => {
          results.push({
            id: log.transactionHash + "-sd",
            type: "stamp",
            badgeLabel: "Stamp duty",
            event: `Stamp duty payment — ${log.args?.paymentId || log.args?.[0] || "—"}`,
            detail: `Transfer ref: ${log.args?.transferId || log.args?.[1] || "—"}`,
            time: null,
            hash: log.transactionHash,
            blockNumber: log.blockNumber,
          });
        });
      }
    }
  } catch { /* */ }

  return results;
}

function shortAddr(a) {
  if (!a) return "—";
  return a.slice(0, 6) + "…" + a.slice(-4);
}

export default function ActivityTimeline({
  landParcel, landRegistry, landTransfer, stampDuty, identityContract, wallet,
}) {
  const [events,       setEvents]       = useState([]);
  const [filter,       setFilter]       = useState("all");
  const [visibleCount, setVisibleCount] = useState(6);
  const [loading,      setLoading]      = useState(false);
  const [live,         setLive]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const onChain = await fetchOnChainEvents(
        landParcel, landRegistry, landTransfer, stampDuty, identityContract
      );
      if (onChain.length > 0) {
        const withTime = onChain.map(e => ({ ...e, time: e.time || Date.now() }));
        withTime.sort((a, b) => (b.blockNumber || 0) - (a.blockNumber || 0));
        setEvents(withTime);
        setLive(true);
      } else {
        setEvents(buildSeedEvents());
        setLive(false);
      }
    } catch {
      setEvents(buildSeedEvents());
      setLive(false);
    }
    setLoading(false);
  }, [landParcel, landRegistry, landTransfer, stampDuty, identityContract]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all"
    ? events
    : events.filter(e => {
        if (filter === "kyc") return e.type === "kyc" || e.type === "kyc-failed";
        return e.type === filter;
      });
  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="tl-section">
      {/* Header */}
      <div className="tl-header-row">
        <div className="tl-title-group">
          <span className="tl-section-icon">📋</span>
          <div>
            <h3 className="tl-section-title">Activity Timeline</h3>
            <p className="tl-section-sub">
              {live ? "Live on-chain events" : "Recent registry activity"}
              {live && <span className="live-dot" title="Live data from blockchain" />}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="tl-count-tag">{filtered.length} event{filtered.length !== 1 ? "s" : ""}</span>
          <button
            className="tl-refresh-btn"
            onClick={load}
            disabled={loading}
            title="Refresh events"
          >
            {loading ? "⏳" : "↻"}
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="tl-filters">
        {Object.entries(EVENT_TYPES).map(([key, meta]) => (
          <button
            key={key}
            className={`tl-pill ${filter === key ? "active" : ""}`}
            onClick={() => { setFilter(key); setVisibleCount(6); }}
          >
            <span className="tl-pill-icon">{meta.icon}</span>
            {meta.label}
          </button>
        ))}
      </div>

      {/* Timeline list */}
      <div className="tl-list">
        {visible.length === 0 ? (
          <div className="tl-empty">
            <span style={{ fontSize: "28px", display: "block", marginBottom: "8px" }}>📭</span>
            No events in this category
          </div>
        ) : (
          visible.map((ev, idx) => {
            const meta = TYPE_META[ev.type] || TYPE_META.registration;
            const isLast = idx === visible.length - 1;
            return (
              <div className="tl-item" key={ev.id}>
                {/* Icon + connector */}
                <div className="tl-left">
                  <div className="tl-icon-wrap" style={{ background: meta.iconBg, color: meta.iconColor }}>
                    {meta.icon}
                  </div>
                  {!isLast && <div className="tl-connector" />}
                </div>

                {/* Content */}
                <div className="tl-body">
                  <p className="tl-event-title">{ev.event}</p>
                  <p className="tl-event-detail">{ev.detail}</p>
                  <div className="tl-meta-row">
                    <span className="tl-time">🕐 {formatTime(ev.time)}</span>
                    <span className={`tl-badge ${ev.type === "kyc-failed" ? "badge-red" : meta.badge?.replace("badge-", "tl-badge-") || ""}`}
                      style={{
                        background: meta.iconBg,
                        color: meta.iconColor,
                        border: `1px solid ${meta.iconBg}`,
                        fontSize: "10px",
                        padding: "2px 8px",
                        borderRadius: "20px",
                        fontWeight: 700,
                      }}
                    >
                      {ev.badgeLabel}
                    </span>
                    {ev.hash && (
                      <span className="tl-hash">
                        ⛓ {shortHash(ev.hash)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Load more */}
      {visible.length < filtered.length && (
        <button className="tl-load-more" onClick={() => setVisibleCount(v => v + 5)}>
          Load {Math.min(5, filtered.length - visibleCount)} earlier events ↓
        </button>
      )}
    </div>
  );
}