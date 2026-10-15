import { useState, useEffect, useCallback } from "react";

/* ══════════════════════════════════════════════════════════════
   RecentTransactions — Rongai Land Registry
   Shows live Sepolia blockchain transactions from all contracts
   Props:
     landParcel        — ethers contract instance
     landTransfer      — ethers contract instance
     stampDuty         — ethers contract instance
     identityContract  — ethers contract instance
     wallet            — connected wallet address string
   ══════════════════════════════════════════════════════════════ */

const TX_TYPE_META = {
  registration: { label: "Registered",   bg: "#EAF3DE", color: "#3B6D11", dot: "#1D9E75" },
  transfer:     { label: "Transfer",     bg: "#E6F1FB", color: "#0C447C", dot: "#378ADD" },
  "stamp-duty": { label: "Stamp Duty",   bg: "#FAEEDA", color: "#633806", dot: "#EF9F27" },
  identity:     { label: "KYC",          bg: "#E1F5EE", color: "#085041", dot: "#5DCAA5" },
  deed:         { label: "Title Deed",   bg: "#EEEDFE", color: "#3C3489", dot: "#7F77DD" },
  unknown:      { label: "On-chain",     bg: "#F1EFE8", color: "#5F5E5A", dot: "#888780" },
};

function shortHash(h) {
  if (!h) return "—";
  return h.slice(0, 6) + "…" + h.slice(-4);
}

function sepoliaLink(hash) {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

function timeSince(ts) {
  const diff = Date.now() - ts;
  if (diff < 15000)     return "Just now";
  if (diff < 60000)     return Math.floor(diff / 1000) + "s ago";
  if (diff < 3600000)   return Math.floor(diff / 60000) + "m ago";
  return Math.floor(diff / 3600000) + "h ago";
}

function buildSeedTxns() {
  const now = Date.now();
  return [
    { id: "s1", type: "registration", hash: "0x4a3fc91b2de7f0a1b829cc3d5e6f4a8b9c0d1e2f", blockNum: 7842341, time: now - 18000, from: "0xA1b2…C3d4" },
    { id: "s2", type: "transfer",     hash: "0x7d2ea04c1bf8e3c2d9f0a5b6c7e8f9a0b1c2d3e4", blockNum: 7842298, time: now - 73000, from: "0xE5f6…G7h8" },
    { id: "s3", type: "stamp-duty",   hash: "0x9f5eb83d2ca7f1b0e9d8c7b6a5f4e3d2c1b0a9f8", blockNum: 7842201, time: now - 108000, from: "0xI9j0…K1l2" },
    { id: "s4", type: "identity",     hash: "0x1b9af77d3de4e5f6a7b8c9d0e1f2a3b4c5d6e7f8", blockNum: 7842155, time: now - 126000, from: "0xM3n4…O5p6" },
    { id: "s5", type: "registration", hash: "0x3c8da02e4cf5f6a7b8c9d0e1f2a3b4c5d6e7f8a9", blockNum: 7842088, time: now - 198000, from: "0xQ7r8…S9t0" },
    { id: "s6", type: "deed",         hash: "0x5e2fb91c6df7g8a9b0c1d2e3f4a5b6c7d8e9f0a1", blockNum: 7841999, time: now - 252000, from: "0xU1v2…W3x4" },
  ];
}

async function fetchRecentTxns(landParcel, landTransfer, stampDuty, identityContract) {
  const results = [];

  const tryFetch = async (contract, filterName, type) => {
    try {
      if (!contract || !contract.filters[filterName]) return;
      const logs = await contract.queryFilter(contract.filters[filterName](), -500);
      logs.forEach(log => {
        results.push({
          id: log.transactionHash + "-" + type,
          type,
          hash: log.transactionHash,
          blockNum: log.blockNumber,
          time: Date.now(),
          from: log.args?.[0]
            ? log.args[0].slice(0, 6) + "…" + log.args[0].slice(-4)
            : "—",
        });
      });
    } catch { /* silent */ }
  };

  await tryFetch(landParcel,       "ParcelRegistered",   "registration");
  await tryFetch(landTransfer,     "TransferInitiated",  "transfer");
  await tryFetch(stampDuty,        "PaymentCreated",     "stamp-duty");
  await tryFetch(identityContract, "IdentityRegistered", "identity");

  return results.sort((a, b) => (b.blockNum || 0) - (a.blockNum || 0));
}

export default function RecentTransactions({ landParcel, landTransfer, stampDuty, identityContract, wallet }) {
  const [txns,    setTxns]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [live,    setLive]    = useState(false);
  const [, tick]              = useState(0); // force re-render for time updates

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const onChain = await fetchRecentTxns(landParcel, landTransfer, stampDuty, identityContract);
      if (onChain.length > 0) { setTxns(onChain); setLive(true); }
      else                    { setTxns(buildSeedTxns()); setLive(false); }
    } catch {
      setTxns(buildSeedTxns()); setLive(false);
    }
    setLoading(false);
  }, [landParcel, landTransfer, stampDuty, identityContract]);

  useEffect(() => { load(); }, [load]);

  /* Tick every 30s to update "Xs ago" labels */
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="tx-section">
      {/* Header */}
      <div className="tx-header-row">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "18px" }}>⛓️</span>
          <div>
            <h3 className="tx-title">Recent on-chain transactions</h3>
            <p className="tx-sub">
              {live ? "Sepolia testnet · live" : "Sepolia testnet · sample data"}
              {live && <span className="live-dot" />}
            </p>
          </div>
        </div>
        <button className="tl-refresh-btn" onClick={load} disabled={loading} title="Refresh">
          {loading ? "⏳" : "↻"}
        </button>
      </div>

      {/* Tx list */}
      <div className="tx-list">
        {txns.slice(0, 6).map(tx => {
          const meta = TX_TYPE_META[tx.type] || TX_TYPE_META.unknown;
          return (
            <div className="tx-row" key={tx.id}>
              <div className="tx-dot" style={{ background: meta.dot }} />
              <div className="tx-info">
                <span className="tx-hash-link">
                  <a href={sepoliaLink(tx.hash)} target="_blank" rel="noreferrer">
                    {shortHash(tx.hash)}
                  </a>
                </span>
                <span className="tx-from">{tx.from}</span>
              </div>
              <div className="tx-right">
                <span className="tx-badge" style={{ background: meta.bg, color: meta.color }}>
                  {meta.label}
                </span>
                <span className="tx-time">{timeSince(tx.time)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer link */}
      <a
        className="tx-explorer-link"
        href="https://sepolia.etherscan.io"
        target="_blank"
        rel="noreferrer"
      >
        View all on Etherscan ↗
      </a>
    </div>
  );
}