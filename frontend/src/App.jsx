import { useState, useEffect } from "react";
import { ethers } from "ethers";
import CONTRACT_ADDRESSES from "./contracts/addresses.js";
import LandParcelABI         from "./contracts/abis/LandParcel.json";
import LandRegistryABI       from "./contracts/abis/LandRegistry.json";
import LandTransferABI       from "./contracts/abis/LandTransferContract.json";
import StampDutyABI          from "./contracts/abis/StampDutyPayment.json";
import LandholderIdentityABI from "./contracts/abis/LandholderIdentity.json";
import TitleDeedABI          from "./contracts/abis/TitleDeed.json";
import { computeIdentityHash, generateDID } from "./utils/identityHash.js";
import TitleDeedPage              from "./pages/TitleDeedPage.jsx";
import TransactionCertificatePage from "./pages/TransactionCertificatePage.jsx";
import MyParcelsPage              from "./pages/MyParcelsPage.jsx";
import IPFSUploader               from "./components/IPFSUploader.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import "./App.css";
import {
  validateAddress, validateParcelId, validateTransferId,
  validatePaymentId, validateArea, validateKES,
  validateFullName, validateNationalId, validateLocation,
  validatePrice, validateAll,
} from "./utils/validation.js";

/* ══════════════════════════════════════════════════════════════
   SHARED ERROR TRANSLATOR
   ══════════════════════════════════════════════════════════════ */
function parseContractError(err) {
  const code    = err?.code;
  const message = (err?.message || err?.reason || "").toLowerCase();

  if (code === 4001 || message.includes("user rejected") || message.includes("user denied") ||
      message.includes("ethers-user-denied") || message.includes("action_rejected")) {
    return "Transaction cancelled. Open MetaMask and approve the request when prompted.";
  }
  if (code === 4100) return "MetaMask is locked or disconnected. Unlock MetaMask and try again.";
  if (code === -32002) return "A MetaMask request is already pending. Open MetaMask and complete or dismiss it first.";
  if (code === -32603 || message.includes("internal json-rpc error")) return "MetaMask encountered an internal error. Refresh the page and try again.";
  if (message.includes("network") || message.includes("could not detect network")) return "Cannot reach the Ethereum network. Check your internet connection and MetaMask network settings.";
  if (message.includes("timeout") || message.includes("timed out")) return "The network request timed out. Check your connection and try again.";
  if (message.includes("disconnected")) return "Lost connection to the blockchain. Refresh the page and reconnect your wallet.";
  if (message.includes("insufficient funds")) return "Not enough ETH to cover gas fees. Add Sepolia ETH from a faucet and retry.";
  if (message.includes("gas")) return "Transaction ran out of gas. MetaMask will estimate the correct amount — please try again.";
  if (message.includes("nonce") || message.includes("underpriced")) return "Transaction conflict. Reset your MetaMask account nonce or wait a moment and retry.";
  if (message.includes("revert") || message.includes("execution reverted")) {
    const match = err?.message?.match(/reverted with reason string '(.+?)'/i)
               || err?.message?.match(/reason="(.+?)"/i)
               || err?.message?.match(/"message":"(.+?)"/i);
    if (match) return `Contract rejected the transaction: ${match[1]}`;
    return "The smart contract rejected this transaction. Check your inputs and permissions.";
  }
  if (message.includes("already registered"))              return "This record is already registered on the blockchain.";
  if (message.includes("already exists"))                  return "A record with this ID already exists. Use a different reference number.";
  if (message.includes("not found") || message.includes("no record")) return "Record not found in the registry.";
  if (message.includes("only officer") || message.includes("onlyofficer")) return "Only authorised Registry Officers can perform this action.";
  if (message.includes("only the seller"))                 return "Your wallet must match the registered seller address to initiate this transfer.";
  if (message.includes("not registered"))                  return "This wallet is not registered on the registry.";

  const clean = (err?.reason || err?.message || "Unexpected error")
    .replace(/\s*\(action=.*\)/gs, "")
    .replace(/\s*\(code=.*\)/gs,   "")
    .replace(/\n[\s\S]*/g,         "")
    .trim();
  return clean || "An unexpected error occurred. Please try again.";
}

/* ── Field error hint ────────────────────────────────────────── */
function FieldError({ message }) {
  if (!message) return null;
  return (
    <span style={{
      color: "#e05c5c", fontSize: "11px", marginTop: "3px",
      display: "block", fontFamily: "var(--mono)",
    }}>⚠ {message}</span>
  );
}

function fieldStyle(value, validatorFn, ...args) {
  if (!value) return {};
  const { valid } = validatorFn(value, ...args);
  return { borderColor: valid ? "#5abe6e" : "#e05c5c" };
}

/* ── Role-based tab access ───────────────────────────────────── */
const ALL_TABS = [
  { id: "Dashboard",       label: "Dashboard",       icon: "🏠", roles: ["officer", "landholder", "public"] },
  { id: "Register Parcel", label: "Register Parcel", icon: "📋", roles: ["officer", "landholder"] },
  { id: "Land Registry",   label: "Land Registry",   icon: "🗂️", roles: ["officer", "landholder", "public"] },
  { id: "My Parcels",      label: "My Parcels",      icon: "🏡", roles: ["landholder"] },
  { id: "Transfer Land",   label: "Transfer Land",   icon: "🔄", roles: ["officer", "landholder"] },
  { id: "Stamp Duty",      label: "Stamp Duty",      icon: "💰", roles: ["officer", "landholder"] },
  { id: "Identity",        label: "Identity",        icon: "🪪", roles: ["officer", "landholder"] },
  { id: "Title Deed",      label: "Title Deed",      icon: "📜", roles: ["officer", "landholder", "public"] },
  { id: "Tx Certificate",  label: "Tx Certificate",  icon: "🧾", roles: ["officer", "landholder", "public"] },
];

const ROLE_META = {
  officer:    { label: "Registry Officer", emoji: "🏛️" },
  landholder: { label: "Landholder",       emoji: "🏡" },
  public:     { label: "Public",           emoji: "👁️" },
};

/* ── Address helpers ─────────────────────────────────────────── */
function isValidAddress(raw) {
  return /^0x[0-9a-fA-F]{40}$/.test((raw || "").trim());
}
function addr(raw) {
  const s = (raw || "").trim();
  if (!isValidAddress(s)) {
    const hexLen = s.startsWith("0x") ? s.slice(2).length : "?";
    throw new Error(
      `Invalid address "${s}" — expected 0x + 40 hex characters, got ${hexLen}. Copy the address directly from MetaMask.`
    );
  }
  return ethers.getAddress(s);
}

function AddrHint({ value }) {
  if (!value || isValidAddress(value)) return null;
  const hexLen = value.startsWith("0x") ? value.slice(2).length : value.length;
  return (
    <span style={{
      color: "#e05c5c", fontSize: "11px", marginTop: "3px",
      display: "block", fontFamily: "var(--mono)",
    }}>
      ⚠ {hexLen}/40 hex chars — copy directly from MetaMask
    </span>
  );
}

function addrStyle(value) {
  return value && !isValidAddress(value) ? { borderColor: "#e05c5c" } : {};
}

/* ── Copy button ─────────────────────────────────────────────── */
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

/* ── Logo ────────────────────────────────────────────────────── */
function SidebarLogo() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "24px 16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)",
      gap: "0", width: "100%",
    }}>
      <div style={{
        fontSize: "8.5px", fontWeight: 700, letterSpacing: "0.20em",
        textTransform: "uppercase", color: "rgba(90,190,110,0.60)",
        marginBottom: "8px", textAlign: "center", lineHeight: 1,
        borderTop: "1px solid rgba(90,190,110,0.25)",
        borderBottom: "1px solid rgba(90,190,110,0.25)",
        padding: "4px 6px",
      }}>
        Kajiado County Land Registry
      </div>
      <div style={{
        fontFamily: "'Playfair Display', 'Georgia', serif",
        fontStyle: "italic", fontSize: "32px", fontWeight: 700,
        color: "#ffffff", lineHeight: 1.05, letterSpacing: "-0.01em",
      }}>
        Rongai
      </div>
      <div style={{
        fontSize: "9px", fontWeight: 600, letterSpacing: "0.30em",
        textTransform: "uppercase", color: "rgba(255,255,255,0.45)",
        marginTop: "3px", marginBottom: "14px",
      }}>
        Land Registry
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: "5px",
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "20px", padding: "4px 12px", fontSize: "10px",
        fontWeight: 600, color: "rgba(255,255,255,0.50)", letterSpacing: "0.08em",
      }}>
        <span style={{ fontSize: "11px" }}>⧫</span>
        Powered by Ethereum
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ENHANCED STAT CARDS — sparkline + trend arrows
   ══════════════════════════════════════════════════════════════ */
const STAT_CONFIG = [
  { icon: "🏡", label: "Land Parcels Registered", key: "parcels",   accent: "#3a9a4f", trend: +4 },
  { icon: "🔄", label: "Ownership Transfers",      key: "transfers", accent: "#2196f3", trend: +2 },
  { icon: "💰", label: "Stamp Duty Records",       key: "payments",  accent: "#c9a84c", trend: -1 },
  { icon: "🪪", label: "KYC-Verified Landholders", key: "holders",   accent: "#9c27b0", trend: +5 },
];

function Sparkline({ accent, positive }) {
  const pts = positive ? [18, 14, 16, 10, 8, 4] : [4, 6, 5, 10, 12, 16];
  const max = Math.max(...pts), min = Math.min(...pts);
  const H = 24, W = 56;
  const coords = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - ((p - min) / (max - min || 1)) * H;
    return [x, y];
  });
  const polyline = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,${H} ${polyline} ${W},${H}`;
  const [lx, ly] = coords[coords.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      <polygon points={area} fill={accent} fillOpacity="0.15" />
      <polyline points={polyline} fill="none" stroke={accent} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill={accent} />
    </svg>
  );
}

function TrendArrow({ value }) {
  if (value === 0) return <span style={{ color: "#9faabb", fontSize: "11px" }}>–</span>;
  const up = value > 0;
  return (
    <span style={{ color: up ? "#3a9a4f" : "#e05c5c", fontSize: "11px", fontWeight: 700 }}>
      {up ? "↑" : "↓"} {Math.abs(value)}
    </span>
  );
}

function EnhancedStatCard({ icon, label, value, accent, trend, isNetwork, networkName }) {
  if (isNetwork) {
    return (
      <div className="stat-card stat-card-network">
        <span className="stat-icon">⛓️</span>
        <div className="stat-value" style={{ color: accent, fontSize: "18px", letterSpacing: "0.04em" }}>
          {networkName}
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
    <div className="stat-card stat-card-enhanced">
      <div className="stat-card-top">
        <span className="stat-icon" style={{ marginBottom: 0, fontSize: "22px" }}>{icon}</span>
        <TrendArrow value={trend} />
      </div>
      <div className="stat-value" style={{ color: accent }}>{value}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-card-footer">
        <Sparkline accent={accent} positive={trend >= 0} />
        <span className="stat-month-tag">vs last month</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   DASHBOARD PAGE
   (Activity Timeline and Recent On-Chain Transactions removed)
   ══════════════════════════════════════════════════════════════ */
function DashboardPage({
  wallet, totalParcels, totalTransfers, totalPayments, totalHolders,
  connectWallet, role,
}) {
  const networkName = (import.meta.env.VITE_NETWORK || "LOCAL").toUpperCase();
  const stats = [
    { ...STAT_CONFIG[0], value: totalParcels   },
    { ...STAT_CONFIG[1], value: totalTransfers },
    { ...STAT_CONFIG[2], value: totalPayments  },
    { ...STAT_CONFIG[3], value: totalHolders   },
  ];

  return (
    <div className="dashboard">
      <div className="page-header">
        <h2>Registry Dashboard</h2>
        <p className="subtitle">Rongai Sub-County Land Registry — Kajiado County, Kenya</p>
      </div>

      {/* Enhanced stat cards */}
      <div className="stats-grid">
        {stats.map(s => (
          <EnhancedStatCard key={s.label} {...s} />
        ))}
        <EnhancedStatCard isNetwork networkName={networkName} accent="#3a9a4f" trend={0} />
      </div>

      {/* Lower section */}
      <div className="dashboard-lower">
        <div className="dashboard-right-col">

          {/* Officer: contract addresses table */}
          {role === "officer" && (
            <div className="contract-addresses">
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
          )}

          {/* Landholder / public: registry notice */}
          {role !== "officer" && (
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

          {/* Connect MetaMask prompt */}
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

/* ══════════════════════════════════════════════════════════════
   REGISTER PARCEL PAGE
   ══════════════════════════════════════════════════════════════ */
function RegisterParcelPage({ wallet, loading, regForm, setRegForm, registerParcel }) {
  const errors = {
    to:           validateAddress(regForm.to, "Owner Address"),
    parcelNumber: validateParcelId(regForm.parcelNumber),
    location:     validateLocation(regForm.location),
    area:         validateArea(regForm.area),
  };
  const canSubmit = !loading && wallet && Object.values(errors).every(e => e.valid);

  return (
    <div className="form-section">
      <div className="page-header">
        <h2>Land Parcel Registration</h2>
        <p className="subtitle">Submit a new parcel for blockchain registration and entry into the official land registry ledger</p>
      </div>
      <div className="form-grid">
        <label>Registered Owner Wallet Address
          <input value={regForm.to}
            onChange={e => setRegForm({ ...regForm, to: e.target.value })}
            placeholder="0x… (42 chars)"
            style={fieldStyle(regForm.to, validateAddress, "Owner Address")}
          />
          <FieldError message={regForm.to ? errors.to.message : ""} />
        </label>
        <label>Parcel Reference Number
          <input value={regForm.parcelNumber}
            onChange={e => setRegForm({ ...regForm, parcelNumber: e.target.value.toUpperCase() })}
            placeholder="RONGAI/001/2026"
            style={fieldStyle(regForm.parcelNumber, validateParcelId)}
          />
          <FieldError message={regForm.parcelNumber ? errors.parcelNumber.message : ""} />
          {regForm.parcelNumber && errors.parcelNumber.valid && (
            <span style={{ color: "#5abe6e", fontSize: "11px", marginTop: "3px", display: "block" }}>✓ Valid format</span>
          )}
        </label>
        <label>Parcel Location & Description
          <input value={regForm.location}
            onChange={e => setRegForm({ ...regForm, location: e.target.value })}
            placeholder="Rongai Ward, Plot 001, Kajiado North"
            style={fieldStyle(regForm.location, validateLocation)}
          />
          <FieldError message={regForm.location ? errors.location.message : ""} />
        </label>
        <label>Land Area (sq. metres)
          <input type="number" value={regForm.area}
            onChange={e => setRegForm({ ...regForm, area: e.target.value })}
            placeholder="500"
            style={fieldStyle(regForm.area, validateArea)}
          />
          <FieldError message={regForm.area ? errors.area.message : ""} />
        </label>
      </div>
      <div style={{ marginBottom: "16px" }}>
        <IPFSUploader
          value={regForm.ipfsHash}
          onChange={(hash) => setRegForm({ ...regForm, ipfsHash: hash })}
          label="Supporting Documents (Survey Map / Title Application Form)"
          accept=".pdf,.jpg,.jpeg,.png"
        />
      </div>
      <button className="action-btn" onClick={registerParcel} disabled={!canSubmit}>
        {loading ? "Processing…" : "Submit Parcel Registration"}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   LAND REGISTRY PAGE
   ══════════════════════════════════════════════════════════════ */
function LandRegistryPage({ wallet, loading, lookupId, setLookupId, lookupParcel, parcelData }) {
  return (
    <div className="form-section">
      <div className="page-header">
        <h2>Land Registry Search</h2>
        <p className="subtitle">Search official land ownership and parcel records on the Kajiado County Registry</p>
      </div>
      <div className="search-row">
        <input value={lookupId}
          onChange={e => setLookupId(e.target.value)}
          placeholder="Enter Parcel Reference Number — e.g. RONGAI/001/2026"
        />
        <button className="action-btn" onClick={lookupParcel} disabled={loading || !wallet}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>
      {parcelData && (
        <div className="result-card">
          <h3>Parcel Record</h3>
          <table>
            <tbody>
              <tr><td>Parcel Reference</td> <td>{parcelData.parcelId}</td></tr>
              <tr><td>Title Deed</td>        <td>{parcelData.titleDeedNumber}</td></tr>
              <tr><td>LR Number</td>         <td>{parcelData.lrNumber}</td></tr>
              <tr><td>Current Owner</td>     <td><span className="mono">{parcelData.currentOwner}</span></td></tr>
              <tr><td>Owner DID</td>         <td>{parcelData.ownerDID}</td></tr>
              <tr><td>Land Use</td>          <td>{parcelData.landUse}</td></tr>
              <tr><td>Land Area</td>         <td>{parcelData.areaSquareMeters?.toString()} sq.m</td></tr>
              <tr><td>Value (KES)</td>       <td>{parcelData.landValueKES?.toString()}</td></tr>
              <tr>
                <td>Status</td>
                <td style={{ color: parcelData.isActive ? "#5abe6e" : "#e05c5c", fontWeight: 700 }}>
                  {parcelData.isActive ? "✅ Active" : "⛔ Inactive"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   TRANSFER LAND PAGE
   ══════════════════════════════════════════════════════════════ */
function TransferLandPage({ wallet, loading, txForm, setTxForm, initiateTransfer, landRegistry }) {
  const [ownershipStatus, setOwnershipStatus] = useState(null);
  const sellerAddress = wallet || "";
  const sellerDID     = wallet ? `did:rongai:${wallet}` : "";

  function autoGenId() {
    const ts   = Date.now().toString().slice(-6);
    const rand = Math.floor(Math.random() * 9000 + 1000);
    return `TXN-RNG-${new Date().getFullYear()}-${ts}-${rand}`;
  }

  async function verifyParcelOwnership() {
    if (!txForm.parcelId || !wallet || !landRegistry) return;
    try {
      setOwnershipStatus("checking");
      const isRegistered = await landRegistry.isParcelRegistered(txForm.parcelId);
      if (!isRegistered) { setOwnershipStatus("not-registered"); return; }
      const entry = await landRegistry.getParcel(txForm.parcelId);
      setOwnershipStatus(
        entry.currentOwner.toLowerCase() === wallet.toLowerCase() ? "verified" : "failed"
      );
    } catch { setOwnershipStatus("not-registered"); }
  }

  
  function handleParcelIdChange(val) {
    setTxForm({ ...txForm, parcelId: val });
    setOwnershipStatus(null);
  }

  const ownershipBadge = {
    checking:         { color: "#2196f3", bg: "rgba(33,150,243,0.08)",  border: "rgba(33,150,243,0.25)", icon: "⏳", text: "Checking ownership on blockchain…" },
    verified:         { color: "#1f6b30", bg: "rgba(90,190,110,0.08)",  border: "rgba(90,190,110,0.30)", icon: "✅", text: "Ownership verified — you are the registered owner of this parcel." },
    failed:           { color: "#c0392b", bg: "rgba(224,92,92,0.08)",   border: "rgba(224,92,92,0.30)",  icon: "❌", text: "Ownership check failed — your wallet is not the registered owner of this parcel." },
    "not-registered": { color: "#7a5800", bg: "rgba(201,168,76,0.08)",  border: "rgba(201,168,76,0.30)", icon: "⚠️", text: "Parcel not found in the Land Registry. Register the parcel first before initiating a transfer." },
  }[ownershipStatus];

  const canSubmit = loading || !wallet || !isValidAddress(txForm.buyer) ||
                    !txForm.parcelId || !txForm.transferId || ownershipStatus !== "verified";

  return (
    <div className="form-section">
      <div className="page-header">
        <h2>Land Ownership Transfer — Application Form</h2>
        <p className="subtitle">Submit a formal ownership transfer request for recording on the Kajiado County Land Registry</p>
      </div>
      <div style={{
        background: "rgba(90,190,110,0.06)", border: "1.5px solid rgba(90,190,110,0.20)",
        borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: "20px",
        fontSize: "14px", color: "#1f6b30", lineHeight: 1.6,
      }}>
        <strong>ℹ️ Seller Verification:</strong> Your authenticated wallet is pre-filled as the Seller.
        Enter the Parcel Reference Number and click <strong>Verify Ownership</strong> to confirm you are the registered owner.
      </div>
      <div className="form-grid">
        <label>Transfer Reference ID
          <div style={{ display: "flex", gap: "8px" }}>
            <input value={txForm.transferId}
              onChange={e => setTxForm({ ...txForm, transferId: e.target.value })}
              placeholder="TXN-RNG-2026-00001" style={{ flex: 1 }}
            />
            <button type="button" onClick={() => setTxForm({ ...txForm, transferId: autoGenId() })}
              style={{
                background: "rgba(31,107,48,0.10)", border: "1.5px solid rgba(31,107,48,0.25)",
                borderRadius: "var(--radius-sm)", color: "#1f6b30", padding: "0 12px",
                cursor: "pointer", fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap",
              }}>Auto ✦</button>
          </div>
          <FieldError message={txForm.transferId ? validateTransferId(txForm.transferId).message : ""} />
        </label>
        <label>Parcel Reference Number
          <div style={{ display: "flex", gap: "8px" }}>
            <input value={txForm.parcelId}
              onChange={e => handleParcelIdChange(e.target.value.toUpperCase())}
              placeholder="RONGAI/001/2026"
              style={{ flex: 1, ...fieldStyle(txForm.parcelId, validateParcelId) }}
            />
            <button type="button" onClick={verifyParcelOwnership}
              disabled={!txForm.parcelId || !wallet || ownershipStatus === "checking"}
              style={{
                background: ownershipStatus === "verified" ? "rgba(90,190,110,0.15)" : "rgba(31,107,48,0.10)",
                border: "1.5px solid rgba(31,107,48,0.25)",
                borderRadius: "var(--radius-sm)", color: "#1f6b30", padding: "0 12px",
                cursor: "pointer", fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap",
              }}>
              {ownershipStatus === "checking" ? "…" : ownershipStatus === "verified" ? "✓ Verified" : "Verify ⛓"}
            </button>
          </div>
        </label>
        {ownershipBadge && (
          <div style={{
            gridColumn: "1 / -1",
            background: ownershipBadge.bg, border: `1.5px solid ${ownershipBadge.border}`,
            borderRadius: "var(--radius-sm)", padding: "10px 14px",
            fontSize: "13px", color: ownershipBadge.color,
            display: "flex", alignItems: "center", gap: "8px", fontWeight: 600,
          }}>
            <span>{ownershipBadge.icon}</span><span>{ownershipBadge.text}</span>
          </div>
        )}
        <label>Seller Wallet Address (Auto-filled)
          <input value={sellerAddress} readOnly
            style={{ background: "#f0f8f2", borderColor: "#5abe6e", color: "#1f6b30", cursor: "not-allowed" }}
          />
          <span style={{ fontSize: "11px", color: "#5abe6e", marginTop: "3px", display: "block" }}>
            ✓ Auto-filled from authenticated MetaMask session
          </span>
        </label>
        <label>Buyer Address
          <input value={txForm.buyer}
            onChange={e => setTxForm({ ...txForm, buyer: e.target.value })}
            placeholder="0x… (42 chars)" style={addrStyle(txForm.buyer)}
          />
          <AddrHint value={txForm.buyer} />
        </label>
        <label>Seller Decentralised Identifier (DID)
          <input value={sellerDID} readOnly
            style={{ background: "#f0f8f2", borderColor: "#5abe6e", color: "#1f6b30", cursor: "not-allowed" }}
          />
        </label>
        <label>Buyer Decentralised Identifier (DID)
          <input value={txForm.buyerDID}
            onChange={e => setTxForm({ ...txForm, buyerDID: e.target.value })}
            placeholder="did:rongai:0x…"
          />
        </label>
        <label>Agreed Price (KES)
          <input type="number" value={txForm.price}
            onChange={e => setTxForm({ ...txForm, price: e.target.value })}
            placeholder="4800000" style={fieldStyle(txForm.price, validatePrice)}
          />
          <FieldError message={txForm.price ? validatePrice(txForm.price).message : ""} />
        </label>
        <label>Transfer Type
          <select value={txForm.transferType} onChange={e => setTxForm({ ...txForm, transferType: e.target.value })}>
            <option>Sale</option>
            <option>Gift</option>
            <option>Inheritance</option>
            <option>Court Order</option>
            <option>Compulsory Acquisition</option>
          </select>
        </label>
      </div>
      <div style={{ marginBottom: "16px" }}>
        <IPFSUploader
          value={txForm.ipfsHash}
          onChange={(hash) => setTxForm({ ...txForm, ipfsHash: hash })}
          label="Transfer Evidence Document (Sale Agreement, Court Order or Consent Letter)"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        />
      </div>
      {ownershipStatus !== "verified" && (
        <p style={{ fontSize: "13px", color: "#9faabb", marginTop: "4px", marginBottom: "4px" }}>
          ⛓ Verify parcel ownership above before submitting the transfer application.
        </p>
      )}
      <button className="action-btn"
        onClick={() => initiateTransfer(sellerAddress, sellerDID)}
        disabled={canSubmit}>
        {loading ? "Processing…" : "⛓ Submit Transfer Application"}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   STAMP DUTY PAGE
   ══════════════════════════════════════════════════════════════ */
const STATUS_META = {
  0: { label: "Pending",    color: "#c9a84c", bg: "rgba(201,168,76,0.08)",  border: "rgba(201,168,76,0.30)"  },
  1: { label: "Processing", color: "#2196f3", bg: "rgba(33,150,243,0.08)",  border: "rgba(33,150,243,0.25)"  },
  2: { label: "Confirmed",  color: "#1f6b30", bg: "rgba(90,190,110,0.08)",  border: "rgba(90,190,110,0.30)"  },
  3: { label: "Failed",     color: "#c0392b", bg: "rgba(224,92,92,0.08)",   border: "rgba(224,92,92,0.30)"   },
  4: { label: "Refunded",   color: "#6b7a90", bg: "rgba(154,171,184,0.08)", border: "rgba(154,171,184,0.25)" },
};

function StampDutyPage({
  wallet, role, loading, setLoading,
  dutyValue, setDutyValue, dutyUrban, setDutyUrban, calcDuty, dutyResult,
  stampDuty,
}) {
  const [payForm,      setPayForm]      = useState({ paymentId: "", transferId: "", parcelId: "", payerAddress: "", paymentMethod: "M-Pesa", paymentRef: "" });
  const [confirmForm,  setConfirmForm]  = useState({ paymentId: "", kraCode: "", paymentRef: "" });
  const [lookupId,     setLookupId]     = useState("");
  const [payRecord,    setPayRecord]    = useState(null);
  const [dutyStatus,   setDutyStatus]   = useState("");

  function autoPayId() {
    const rand = Math.floor(Math.random() * 9000 + 1000);
    if (payForm.transferId?.trim()) {
      const txnClean = payForm.transferId.trim().replace(/^TXN-/, "");
      return "SDP-" + txnClean + "-" + rand;
    }
    const ts = Date.now().toString().slice(-6);
    return "SDP-RNG-" + new Date().getFullYear() + "-" + ts + "-" + rand;
  }

  async function createPayment() {
    try {
      setLoading(true); setDutyStatus("Creating payment record on blockchain…");
      const payer = payForm.payerAddress || wallet;
      const tx = await stampDuty.createPayment(
        payForm.paymentId, payForm.transferId, payForm.parcelId,
        payer, parseInt(dutyValue), dutyUrban, payForm.paymentMethod,
      );
      await tx.wait();
      setDutyStatus(`✅ Payment record ${payForm.paymentId} created successfully on-chain.`);
      setPayForm({ paymentId: "", transferId: "", parcelId: "", payerAddress: "", paymentMethod: "M-Pesa", paymentRef: "" });
    } catch (err) { setDutyStatus("❌ " + parseContractError(err)); }
    finally { setLoading(false); }
  }

  async function confirmPayment() {
    try {
      setLoading(true); setDutyStatus("Confirming payment on blockchain…");
      const tx = await stampDuty.confirmPayment(confirmForm.paymentId, confirmForm.kraCode, confirmForm.paymentRef);
      await tx.wait();
      setDutyStatus(`✅ Payment ${confirmForm.paymentId} confirmed. KRA Code: ${confirmForm.kraCode}`);
      setConfirmForm({ paymentId: "", kraCode: "", paymentRef: "" });
    } catch (err) { setDutyStatus("❌ " + parseContractError(err)); }
    finally { setLoading(false); }
  }

  async function lookupPayment() {
    try {
      setLoading(true); setPayRecord(null); setDutyStatus("Fetching payment record…");
      const rec = await stampDuty.getPaymentByTransfer(lookupId);
      setPayRecord(rec); setDutyStatus("Payment record found.");
    } catch (err) {
      const msg = (err?.reason || err?.message || "").toLowerCase();
      if (msg.includes("no payment found") || msg.includes("not found")) {
        setDutyStatus("⚠ No payment record found for this Transfer ID.");
      } else { setDutyStatus("❌ " + parseContractError(err)); }
    } finally { setLoading(false); }
  }

  const statusMeta = payRecord ? STATUS_META[Number(payRecord.status)] : null;

  return (
    <div className="form-section">
      <div className="page-header">
        <h2>Stamp Duty Assessment & Payment Recording</h2>
        <p className="subtitle">Calculate, record and confirm stamp duty payments per the Kenya Land Registration Act, Cap 300</p>
      </div>

      <h3 className="section-heading">Step 1: Stamp Duty Assessment</h3>
      <div className="duty-calculator">
        <label>Transaction Value (KES)
          <input type="number" value={dutyValue}
            onChange={e => setDutyValue(e.target.value)} placeholder="4,800,000"
            style={fieldStyle(dutyValue, validateKES)}
          />
          <FieldError message={dutyValue ? validateKES(dutyValue).message : ""} />
        </label>
        <label>Land Type
          <div className="radio-group">
            <label className="radio-label">
              <input type="radio" checked={dutyUrban} onChange={() => setDutyUrban(true)} /> Urban (2%)
            </label>
            <label className="radio-label">
              <input type="radio" checked={!dutyUrban} onChange={() => setDutyUrban(false)} /> Rural (4%)
            </label>
          </div>
        </label>
        <button className="action-btn" onClick={calcDuty} disabled={loading || !wallet || !dutyValue}>
          {loading ? "Calculating…" : "Calculate Stamp Duty"}
        </button>
      </div>

      {dutyResult && (
        <div className="result-card duty-result" style={{ marginBottom: "28px" }}>
          <h3>Stamp Duty Breakdown</h3>
          <table>
            <tbody>
              <tr><td>Transaction Value</td><td>KES {parseInt(dutyValue).toLocaleString()}</td></tr>
              <tr><td>Stamp Duty Rate</td>  <td>{dutyResult.rate}</td></tr>
              <tr><td>Stamp Duty Amount</td><td>KES {parseInt(dutyResult.duty).toLocaleString()}</td></tr>
              <tr><td>Registration Fee</td> <td>KES {parseInt(dutyResult.regFee).toLocaleString()}</td></tr>
              <tr className="total-row">
                <td><strong>Total Payable</strong></td>
                <td><strong>KES {parseInt(dutyResult.total).toLocaleString()}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <h3 className="section-heading">Step 2: Record KRA Payment on Registry</h3>
      <div className="privacy-notice" style={{ marginBottom: "16px" }}>
        After calculating stamp duty, create an immutable payment record on-chain linked to the
        Transfer Reference ID. Include your M-Pesa or bank reference to establish an auditable
        link between the blockchain record and the off-chain KRA iTax payment.
      </div>
      <div className="form-grid">
        <label>Payment ID
          <div style={{ display: "flex", gap: "8px" }}>
            <input value={payForm.paymentId}
              onChange={e => setPayForm({ ...payForm, paymentId: e.target.value })}
              placeholder="SDP-RNG-2026-00001" style={{ flex: 1 }}
            />
            <button type="button" onClick={() => setPayForm({ ...payForm, paymentId: autoPayId() })}
              style={{
                background: "rgba(31,107,48,0.10)", border: "1.5px solid rgba(31,107,48,0.25)",
                borderRadius: "var(--radius-sm)", color: "#1f6b30", padding: "0 12px",
                cursor: "pointer", fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap",
              }}>Auto ✦</button>
          </div>
          <FieldError message={payForm.paymentId ? validatePaymentId(payForm.paymentId).message : ""} />
        </label>
        <label>Transfer Reference ID (Linked Transfer)
          <input value={payForm.transferId}
            onChange={e => setPayForm({ ...payForm, transferId: e.target.value })}
            placeholder="TXN-RNG-2026-00001"
            style={fieldStyle(payForm.transferId, validateTransferId)}
          />
          <FieldError message={payForm.transferId ? validateTransferId(payForm.transferId).message : ""} />
        </label>
        <label>Parcel Reference Number
          <input value={payForm.parcelId}
            onChange={e => setPayForm({ ...payForm, parcelId: e.target.value.toUpperCase() })}
            placeholder="RONGAI/001/2026"
            style={fieldStyle(payForm.parcelId, validateParcelId)}
          />
          <FieldError message={payForm.parcelId ? validateParcelId(payForm.parcelId).message : ""} />
        </label>
        <label>Payer Address (Buyer Wallet)
          <input value={payForm.payerAddress}
            onChange={e => setPayForm({ ...payForm, payerAddress: e.target.value })}
            placeholder={wallet || "0x… (leave blank to use connected wallet)"}
            style={addrStyle(payForm.payerAddress)}
          />
          <AddrHint value={payForm.payerAddress} />
        </label>
        <label>Payment Method
          <select value={payForm.paymentMethod} onChange={e => setPayForm({ ...payForm, paymentMethod: e.target.value })}>
            <option>M-Pesa</option>
            <option>Bank Transfer</option>
            <option>Escrow</option>
            <option>Cash</option>
          </select>
        </label>
        <label>
          {payForm.paymentMethod === "M-Pesa"       ? "M-Pesa Transaction Reference (iTax Code)"  :
           payForm.paymentMethod === "Bank Transfer" ? "Bank Transaction Reference"                :
           payForm.paymentMethod === "Escrow"        ? "Escrow Reference Number"                   :
           "Payment Reference (optional)"}
          <input value={payForm.paymentRef}
            onChange={e => setPayForm({ ...payForm, paymentRef: e.target.value })}
            placeholder={
              payForm.paymentMethod === "M-Pesa"       ? "e.g. QAB7YX3KP2"        :
              payForm.paymentMethod === "Bank Transfer" ? "e.g. TRF/2026/00123456" :
              payForm.paymentMethod === "Escrow"        ? "e.g. ESC-2026-00001"    :
              "Optional reference number"
            }
          />
        </label>
      </div>
      <button className="action-btn" onClick={createPayment}
        disabled={loading || !wallet || !dutyValue || !payForm.paymentId || !payForm.transferId || !payForm.parcelId}>
        {loading ? "Processing…" : "Submit Payment Record"}
      </button>

      {role === "officer" && (
        <>
          <h3 className="section-heading" style={{ marginTop: "2rem" }}>
            Step 3: Confirm KRA Payment (Authorised Officers Only)
          </h3>
          <p style={{ fontSize: "13px", color: "#6b7a90", marginBottom: "14px" }}>
            After the buyer pays stamp duty to KRA via iTax, enter the KRA confirmation code to finalise the payment record on the registry.
          </p>
          <div className="form-grid">
            <label>Payment ID
              <input value={confirmForm.paymentId}
                onChange={e => setConfirmForm({ ...confirmForm, paymentId: e.target.value })}
                placeholder="SDP-RNG-2026-00001" />
            </label>
            <label>KRA iTax Confirmation Code
              <input value={confirmForm.kraCode}
                onChange={e => setConfirmForm({ ...confirmForm, kraCode: e.target.value })}
                placeholder="KRA-ITAX-2026-XXXXXXXX" />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>Payment Reference (M-Pesa / Bank)
              <input value={confirmForm.paymentRef}
                onChange={e => setConfirmForm({ ...confirmForm, paymentRef: e.target.value })}
                placeholder="M-Pesa reference or bank transaction number" />
            </label>
          </div>
          <button className="action-btn" onClick={confirmPayment}
            disabled={loading || !wallet || !confirmForm.paymentId || !confirmForm.kraCode}
            style={{ background: "var(--green-deeper)" }}>
            {loading ? "Confirming…" : "✓ Confirm Payment on Registry"}
          </button>
        </>
      )}

      <h3 className="section-heading" style={{ marginTop: "2rem" }}>
        Look Up Payment by Transfer Reference ID
      </h3>
      <div className="search-row">
        <input value={lookupId} onChange={e => setLookupId(e.target.value)}
          placeholder="Enter Transfer Reference ID — e.g. TXN-RNG-2026-00001" />
        <button className="action-btn" onClick={lookupPayment} disabled={loading || !wallet || !lookupId}>
          {loading ? "…" : "Search"}
        </button>
      </div>

      {dutyStatus && (
        <div style={{
          background: dutyStatus.startsWith("✅") ? "rgba(90,190,110,0.07)" : dutyStatus.startsWith("❌") ? "rgba(224,92,92,0.07)" : "rgba(33,150,243,0.07)",
          border: `1px solid ${dutyStatus.startsWith("✅") ? "rgba(90,190,110,0.25)" : dutyStatus.startsWith("❌") ? "rgba(224,92,92,0.25)" : "rgba(33,150,243,0.20)"}`,
          borderRadius: "var(--radius)", padding: "10px 14px",
          fontSize: "13px", color: dutyStatus.startsWith("✅") ? "#1f6b30" : dutyStatus.startsWith("❌") ? "#c0392b" : "#1a5070",
          marginTop: "14px",
        }}>
          {dutyStatus}
        </div>
      )}

      {payRecord && statusMeta && (
        <div className="result-card" style={{ marginTop: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <h3 style={{ margin: 0 }}>Payment Record</h3>
            <span style={{
              background: statusMeta.bg, border: `1px solid ${statusMeta.border}`,
              color: statusMeta.color, borderRadius: "20px",
              padding: "3px 14px", fontSize: "12px", fontWeight: 700,
            }}>{statusMeta.label}</span>
          </div>
          <table>
            <tbody>
              <tr><td>Payment ID</td>         <td style={{ fontFamily: "var(--mono)", fontSize: "12px" }}>{payRecord.paymentId}</td></tr>
              <tr><td>Transfer Reference</td> <td>{payRecord.transferId}</td></tr>
              <tr><td>Parcel Reference</td>   <td>{payRecord.parcelId}</td></tr>
              <tr><td>Payer</td>              <td><span className="mono">{payRecord.payer}</span></td></tr>
              <tr><td>Transaction Value</td>  <td>KES {Number(payRecord.transactionValueKES).toLocaleString()}</td></tr>
              <tr><td>Stamp Duty Rate</td>    <td>{payRecord.stampDutyRatePercent?.toString()}%</td></tr>
              <tr><td>Stamp Duty</td>         <td>KES {Number(payRecord.stampDutyAmountKES).toLocaleString()}</td></tr>
              <tr><td>Registration Fee</td>   <td>KES {Number(payRecord.registrationFeeKES).toLocaleString()}</td></tr>
              <tr className="total-row">
                <td><strong>Total Fees</strong></td>
                <td><strong>KES {Number(payRecord.totalFeesKES).toLocaleString()}</strong></td>
              </tr>
              <tr><td>Payment Method</td>     <td>{payRecord.paymentMethod}</td></tr>
              {payRecord.paymentReference && (
                <tr><td>Payment Reference</td><td style={{ fontFamily: "var(--mono)", fontSize: "12px" }}>{payRecord.paymentReference}</td></tr>
              )}
              {payRecord.kraConfirmationCode && (
                <tr><td>KRA Confirmation</td><td style={{ fontFamily: "var(--mono)", fontSize: "12px", color: "#1f6b30", fontWeight: 700 }}>{payRecord.kraConfirmationCode}</td></tr>
              )}
              <tr><td>Created</td>            <td>{new Date(Number(payRecord.createdAt) * 1000).toLocaleString()}</td></tr>
              {Number(payRecord.confirmedAt) > 0 && (
                <tr><td>Confirmed</td>        <td>{new Date(Number(payRecord.confirmedAt) * 1000).toLocaleString()}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   IDENTITY PAGE
   ══════════════════════════════════════════════════════════════ */
function IdentityPage({
  wallet, loading,
  idForm, setIdForm, registerIdentity, idStatus,
  idLookup, setIdLookup, lookupIdentity, verifyIdentity, idResult,
}) {
  const idErrors = {
    wallet:     validateAddress(idForm.wallet, "Wallet Address"),
    fullName:   validateFullName(idForm.fullName),
    nationalId: validateNationalId(idForm.nationalId),
  };
  const canRegister = !loading && wallet && Object.values(idErrors).every(e => e.valid);

  return (
    <div className="form-section">
      <div className="page-header">
        <h2>KYC Identity Registration & Verification</h2>
        <p className="subtitle">
          Register and verify landholder identities on the blockchain registry. Your National ID number
          is hashed locally using keccak256 — raw values are never transmitted or stored off-device.
        </p>
      </div>

      <h3 className="section-heading">Register Landholder Identity</h3>
      <div className="privacy-notice">
        Your National ID and full name are encrypted locally using keccak256 hashing. Only the hash
        is recorded on-chain — your personal data never leaves your device.
      </div>
      <div className="form-grid">
        <label>Landholder Wallet Address
          <input value={idForm.wallet}
            onChange={e => setIdForm({ ...idForm, wallet: e.target.value })}
            placeholder="0x… (42 chars)"
            style={fieldStyle(idForm.wallet, validateAddress, "Wallet Address")}
          />
          <FieldError message={idForm.wallet ? idErrors.wallet.message : ""} />
        </label>
        <label>Full Legal Name (as appearing on National ID)
          <input value={idForm.fullName}
            onChange={e => setIdForm({ ...idForm, fullName: e.target.value })}
            placeholder="John Kamau Mwangi"
            style={fieldStyle(idForm.fullName, validateFullName)}
          />
          <FieldError message={idForm.fullName ? idErrors.fullName.message : ""} />
        </label>
        <label>National ID / Passport Number (Primary Identifier)
          <input value={idForm.nationalId}
            onChange={e => setIdForm({ ...idForm, nationalId: e.target.value })}
            placeholder="12345678"
            style={fieldStyle(idForm.nationalId, validateNationalId)}
          />
          <FieldError message={idForm.nationalId ? idErrors.nationalId.message : ""} />
        </label>
        <label>ID Document Type
          <select value={idForm.idType} onChange={e => setIdForm({ ...idForm, idType: e.target.value })}>
            <option>National ID</option>
            <option>Passport</option>
            <option>Alien Card</option>
          </select>
        </label>
      </div>
      <button className="action-btn" onClick={registerIdentity} disabled={!canRegister}>
        {loading ? "Processing…" : "Submit Identity Registration"}
      </button>
      {idStatus && (
        <div className="result-card" style={{ marginTop: "14px" }}>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--text-light)" }}>{idStatus}</p>
        </div>
      )}

      <h3 className="section-heading" style={{ marginTop: "2rem" }}>Identity Verification Lookup</h3>
      <p style={{ fontSize: "13px", color: "#6b7a90", marginBottom: "14px" }}>
        Enter a wallet address to check identity status. Authorised Registry Officers may approve pending KYC records.
      </p>
      <div className="search-row">
        <div style={{ flex: 1 }}>
          <input value={idLookup} onChange={e => setIdLookup(e.target.value)}
            placeholder="Wallet address 0x… (42 chars)"
            style={{ width: "100%", ...addrStyle(idLookup) }}
          />
          <AddrHint value={idLookup} />
        </div>
        <button className="action-btn" onClick={lookupIdentity} disabled={loading || !wallet || !isValidAddress(idLookup)}>
          {loading ? "…" : "Look Up"}
        </button>
        <button className="action-btn" onClick={verifyIdentity}
          disabled={loading || !wallet || !isValidAddress(idLookup)}
          style={{ marginLeft: "8px", background: "var(--green-deeper)" }}>
          {loading ? "…" : "✓ Verify"}
        </button>
      </div>
      {idResult && (
        <div className="result-card" style={{ marginTop: "18px" }}>
          <h3>Identity Record</h3>
          <table>
            <tbody>
              <tr><td>Wallet</td>    <td><span className="mono">{idResult.wallet}</span></td></tr>
              <tr><td>DID</td>       <td>{idResult.did}</td></tr>
              <tr><td>ID Type</td>   <td>{idResult.idType}</td></tr>
              <tr>
                <td>Status</td>
                <td style={{ color: idResult.isVerified ? "#5abe6e" : "#e8a83a", fontWeight: 700 }}>
                  {idResult.isVerified ? "✓ Verified" : "⏳ Pending Verification"}
                </td>
              </tr>
              <tr><td>Registered</td><td>{new Date(Number(idResult.registeredAt) * 1000).toLocaleString()}</td></tr>
              {idResult.isVerified && (
                <tr><td>Verified At</td><td>{new Date(Number(idResult.verifiedAt) * 1000).toLocaleString()}</td></tr>
              )}
              <tr>
                <td>Identity Hash</td>
                <td><span className="mono" style={{ fontSize: "10px", wordBreak: "break-all" }}>{idResult.identityHash}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ROOT APP COMPONENT
   ══════════════════════════════════════════════════════════════ */
export default function App() {
  const {
    role:           authRole,
    wallet:         authWallet,
    logout,
    sessionWarning,
    timeRemaining,
    extendSession,
  } = useAuth();

  const TABS = ALL_TABS.filter(t => !authRole || t.roles.includes(authRole));

  const [activeTab,  setActiveTab]  = useState("Dashboard");
  const [wallet,     setWallet]     = useState(null);
  const [status,     setStatus]     = useState("");
  const [loading,    setLoading]    = useState(false);

  const [landParcel,        setLandParcel]        = useState(null);
  const [landRegistry,      setLandRegistry]      = useState(null);
  const [landTransfer,      setLandTransfer]      = useState(null);
  const [stampDuty,         setStampDuty]         = useState(null);
  const [identityContract,  setIdentityContract]  = useState(null);
  const [titleDeedContract, setTitleDeedContract] = useState(null);

  const [totalParcels,   setTotalParcels]   = useState("0");
  const [totalTransfers, setTotalTransfers] = useState("0");
  const [totalPayments,  setTotalPayments]  = useState("0");
  const [totalHolders,   setTotalHolders]   = useState("0");

  const [regForm,    setRegForm]    = useState({ to: "", parcelNumber: "", location: "", area: "", ipfsHash: "" });
  const [lookupId,   setLookupId]   = useState("");
  const [parcelData, setParcelData] = useState(null);
  const [txForm,     setTxForm]     = useState({ transferId: "", parcelId: "", seller: "", buyer: "", sellerDID: "", buyerDID: "", price: "", transferType: "Sale", ipfsHash: "" });
  const [dutyValue,  setDutyValue]  = useState("");
  const [dutyUrban,  setDutyUrban]  = useState(true);
  const [dutyResult, setDutyResult] = useState(null);
  const [idForm,     setIdForm]     = useState({ wallet: "", nationalId: "", fullName: "", idType: "National ID" });
  const [idLookup,   setIdLookup]   = useState("");
  const [idResult,   setIdResult]   = useState(null);
  const [idStatus,   setIdStatus]   = useState("");

  useEffect(() => { connectWallet(); }, []); // eslint-disable-line

  async function connectWallet(forcePrompt = false) {
    try {
      if (!window.ethereum) { setStatus("MetaMask is not installed. Please install the MetaMask browser extension."); return; }
      setLoading(true);
      let _address;
      if (forcePrompt) {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        if (!accounts?.length) { setStatus("No accounts found. Please unlock MetaMask."); return; }
        _address = accounts[0];
      } else {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (!accounts?.length) { setStatus("Wallet not connected. Click Connect MetaMask."); return; }
        _address = accounts[0];
      }
      const _provider = new ethers.BrowserProvider(window.ethereum);
      const _signer   = await _provider.getSigner(_address);

      const _lp = new ethers.Contract(CONTRACT_ADDRESSES.LandParcel,          LandParcelABI.abi,         _signer);
      const _lr = new ethers.Contract(CONTRACT_ADDRESSES.LandRegistry,        LandRegistryABI.abi,       _signer);
      const _lt = new ethers.Contract(CONTRACT_ADDRESSES.LandTransferContract, LandTransferABI.abi,       _signer);
      const _sd = new ethers.Contract(CONTRACT_ADDRESSES.StampDutyPayment,     StampDutyABI.abi,          _signer);
      const _id = new ethers.Contract(CONTRACT_ADDRESSES.LandholderIdentity,   LandholderIdentityABI.abi, _signer);
      let _td = null;
      try { _td = new ethers.Contract(CONTRACT_ADDRESSES.TitleDeed, TitleDeedABI.abi, _signer); } catch { _td = null; }

      setWallet(_address);
      setLandParcel(_lp); setLandRegistry(_lr); setLandTransfer(_lt);
      setStampDuty(_sd);  setIdentityContract(_id); setTitleDeedContract(_td);
      setStatus("Connected: " + _address.slice(0, 6) + "…" + _address.slice(-4));

      try { setTotalParcels((await _lp.totalParcels()).toString());     } catch { setTotalParcels("0");   }
      try { setTotalTransfers((await _lt.totalTransfers()).toString()); } catch { setTotalTransfers("0"); }
      try { setTotalPayments((await _sd.totalPayments()).toString());   } catch { setTotalPayments("0");  }
      try { setTotalHolders((await _id.totalHolders()).toString());     } catch { setTotalHolders("0");   }
    } catch (err) { setStatus(parseContractError(err)); }
    finally { setLoading(false); }
  }

  async function registerParcel() {
    try {
      setLoading(true);
      const ownerAddress = addr(regForm.to);
      setStatus("Step 1/2 — Registering parcel on blockchain…");
      const tx1 = await landParcel.registerParcel(
        ownerAddress, regForm.parcelNumber, regForm.location, parseInt(regForm.area), regForm.ipfsHash,
      );
      await tx1.wait();
      setStatus("Step 2/2 — Recording in registry ledger…");
      const tx2 = await landRegistry.addParcel(
        regForm.parcelNumber, "KAJIADO/RONGAI/" + regForm.parcelNumber,
        "LR.No." + regForm.parcelNumber, ownerAddress,
        "did:rongai:" + ownerAddress, "Residential", parseInt(regForm.area), 0,
      );
      await tx2.wait();
      setTotalParcels((await landParcel.totalParcels()).toString());
      setStatus("✅ Parcel " + regForm.parcelNumber + " registered successfully. TX: " + tx1.hash.slice(0, 10) + "…");
      setRegForm({ to: "", parcelNumber: "", location: "", area: "", ipfsHash: "" });
    } catch (err) { setStatus("❌ " + parseContractError(err)); }
    finally { setLoading(false); }
  }

  async function lookupParcel() {
    try {
      setLoading(true); setStatus("Fetching parcel record from registry…");
      const data = await landRegistry.getParcel(lookupId);
      setParcelData(data); setStatus("Parcel record found.");
    } catch (err) {
      setParcelData(null);
      const msg = (err?.reason || err?.message || "").toLowerCase();
      if (msg.includes("not found") || msg.includes("not registered") || msg.includes("revert")) {
        setStatus("No parcel found with that reference number. Check the ID and try again.");
      } else { setStatus("❌ " + parseContractError(err)); }
    } finally { setLoading(false); }
  }

  async function initiateTransfer(sellerAddr, sellerDIDVal) {
    try {
      setLoading(true);
      const sellerAddress = addr(sellerAddr || wallet);
      const buyerAddress  = addr(txForm.buyer);
      const sellerDIDUsed = sellerDIDVal || `did:rongai:${sellerAddress}`;
      const buyerDIDUsed  = txForm.buyerDID || `did:rongai:${buyerAddress}`;
      setStatus("Submitting land transfer application…");
      const tx = await landTransfer.initiateTransfer(
        txForm.transferId, txForm.parcelId, sellerAddress, buyerAddress,
        sellerDIDUsed, buyerDIDUsed, parseInt(txForm.price || "0"),
        txForm.transferType, txForm.ipfsHash || "",
      );
      await tx.wait();
      try { setTotalTransfers((await landTransfer.totalTransfers()).toString()); } catch {}
      setStatus("✅ Transfer application " + txForm.transferId + " submitted. TX: " + tx.hash.slice(0, 10) + "…");
      setTxForm({ transferId: "", parcelId: "", buyer: "", buyerDID: "", price: "", transferType: "Sale", ipfsHash: "" });
    } catch (err) { setStatus("❌ " + parseContractError(err)); }
    finally { setLoading(false); }
  }

  async function calcDuty() {
    try {
      setLoading(true);
      const [duty, regFee, total] = await stampDuty.calculateDuty(parseInt(dutyValue), dutyUrban);
      setDutyResult({ duty: duty.toString(), regFee: regFee.toString(), total: total.toString(), rate: dutyUrban ? "2%" : "4%" });
      setStatus("Stamp duty assessment complete.");
    } catch (err) { setStatus("❌ " + parseContractError(err)); }
    finally { setLoading(false); }
  }

  async function registerIdentity() {
    try {
      setLoading(true); setIdStatus("Computing identity hash locally in browser…");
      const hash          = computeIdentityHash(idForm.nationalId, idForm.fullName, idForm.wallet);
      const did           = generateDID(idForm.wallet);
      const holderAddress = addr(idForm.wallet);
      setIdStatus("Submitting to blockchain — raw ID never leaves your device…");
      const tx = await identityContract.registerIdentity(holderAddress, did, hash, idForm.idType);
      await tx.wait();
      setTotalHolders((await identityContract.totalHolders()).toString());
      setIdStatus("✅ Identity registered successfully. DID: " + did);
      setIdForm({ wallet: "", nationalId: "", fullName: "", idType: "National ID" });
    } catch (err) { setIdStatus("❌ " + parseContractError(err)); }
    finally { setLoading(false); }
  }

  async function lookupIdentity() {
    try {
      setLoading(true); setIdResult(null); setIdStatus("Fetching identity record from registry…");
      const data = await identityContract.getIdentity(addr(idLookup));
      setIdResult(data); setIdStatus("Identity record found.");
    } catch (err) {
      setIdResult(null);
      const msg = (err?.reason || err?.message || "").toLowerCase();
      if (msg.includes("not found") || msg.includes("not registered") || msg.includes("revert")) {
        setIdStatus("No identity record found for this wallet address.");
      } else { setIdStatus("❌ " + parseContractError(err)); }
    } finally { setLoading(false); }
  }

  async function verifyIdentity() {
    try {
      setLoading(true); setIdStatus("Verifying identity on registry…");
      const tx = await identityContract.verifyIdentity(addr(idLookup));
      await tx.wait(); setIdStatus("✅ Identity verified successfully.");
      await lookupIdentity();
    } catch (err) { setIdStatus("❌ " + parseContractError(err)); }
    finally { setLoading(false); }
  }

  const roleMeta  = ROLE_META[authRole] || null;
  const minutes   = timeRemaining !== null ? Math.floor(timeRemaining / 60) : 0;
  const seconds   = timeRemaining !== null ? timeRemaining % 60 : 0;
  const countdown = `${minutes}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="app">

      {/* Session Warning Banner */}
      {sessionWarning && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
          background: "linear-gradient(135deg, #7a1a1a 0%, #c0392b 100%)",
          color: "#ffffff", padding: "14px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: "16px", boxShadow: "0 4px 20px rgba(192,57,43,0.50)", flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "22px" }}>⏱️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "15px" }}>Session expiring in {countdown}</div>
              <div style={{ fontSize: "13px", opacity: 0.85, marginTop: "2px" }}>
                You will be automatically logged out due to inactivity. Any unsaved work will be lost.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexShrink: 0 }}>
            <button onClick={extendSession} style={{
              background: "#ffffff", color: "#c0392b", border: "none",
              padding: "8px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: 700, fontSize: "14px",
            }}>✅ Stay Logged In</button>
            <button onClick={logout} style={{
              background: "rgba(255,255,255,0.15)", color: "#ffffff",
              border: "1.5px solid rgba(255,255,255,0.40)",
              padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px",
            }}>🚪 Logout Now</button>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="sidebar">
        <SidebarLogo />

        {roleMeta && (
          <div style={{ padding: "10px 16px 6px" }}>
            <span className={`role-badge ${authRole}`} style={{ fontSize: "11px" }}>
              {roleMeta.emoji} {roleMeta.label}
            </span>
          </div>
        )}

        <div className="sidebar-section-label">Navigation</div>

        {TABS.map(tab => (
          <button key={tab.id}
            className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}>
            <span className="nav-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}

        <hr className="nav-divider" />

        {/* Aerial Land SVG illustration */}
        <div style={{
          margin: "4px 12px 10px", borderRadius: "10px", overflow: "hidden",
          border: "1px solid rgba(90,190,110,0.15)", flexShrink: 0,
        }}>
          <svg viewBox="0 0 206 130" xmlns="http://www.w3.org/2000/svg"
            style={{ display: "block", width: "100%", height: "auto" }}>
            <defs>
              <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#0d1f12" />
                <stop offset="100%" stopColor="#1a3020" />
              </linearGradient>
              <linearGradient id="field1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#2a5c35" />
                <stop offset="100%" stopColor="#1a3d22" />
              </linearGradient>
              <linearGradient id="field2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#3a7a45" />
                <stop offset="100%" stopColor="#2a5c35" />
              </linearGradient>
              <linearGradient id="field3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#1f4a28" />
                <stop offset="100%" stopColor="#142e18" />
              </linearGradient>
              <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#5abe6e" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#5abe6e" stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect width="206" height="130" fill="url(#sky)" />
            <ellipse cx="103" cy="52" rx="90" ry="18" fill="url(#glow)" />
            <polygon points="30,50 176,50 190,58 16,58" fill="#1a3d22" opacity="0.9"/>
            <polygon points="20,58 186,58 196,66 10,66" fill="#22502a" opacity="0.9"/>
            <polygon points="97,50 109,50 140,130 66,130" fill="#1e2219" />
            <rect x="101" y="56" width="4"  height="7"  rx="1" fill="rgba(255,255,255,0.12)" />
            <rect x="101" y="69" width="4"  height="9"  rx="1" fill="rgba(255,255,255,0.10)" />
            <rect x="100" y="84" width="6"  height="11" rx="1" fill="rgba(255,255,255,0.08)" />
            <rect x="98"  y="101" width="10" height="13" rx="1" fill="rgba(255,255,255,0.06)" />
            <polygon points="10,66 96,66 97,50 16,58"  fill="url(#field1)" />
            <polygon points="10,66 66,130 40,130 10,90" fill="#2a5c35" opacity="0.8" />
            <line x1="52" y1="66" x2="38" y2="130" stroke="rgba(90,190,110,0.25)" strokeWidth="0.8"/>
            <line x1="30" y1="66" x2="10" y2="100" stroke="rgba(90,190,110,0.20)" strokeWidth="0.7"/>
            <line x1="10" y1="82" x2="66" y2="82"  stroke="rgba(90,190,110,0.18)" strokeWidth="0.7"/>
            <line x1="10" y1="100" x2="66" y2="100" stroke="rgba(90,190,110,0.14)" strokeWidth="0.6"/>
            <polygon points="110,50 190,58 196,66 109,66" fill="url(#field2)" />
            <polygon points="109,66 140,130 196,130 196,66" fill="url(#field1)" />
            <polygon points="109,66 140,130 160,130 196,100 196,66" fill="#2d6638" opacity="0.85"/>
            <line x1="154" y1="66" x2="168" y2="130" stroke="rgba(90,190,110,0.25)" strokeWidth="0.8"/>
            <line x1="175" y1="66" x2="196" y2="100" stroke="rgba(90,190,110,0.20)" strokeWidth="0.7"/>
            <line x1="140" y1="82"  x2="196" y2="82"  stroke="rgba(90,190,110,0.18)" strokeWidth="0.7"/>
            <line x1="140" y1="100" x2="196" y2="100" stroke="rgba(90,190,110,0.14)" strokeWidth="0.6"/>
            {[[22,70],[38,72],[55,70],[18,86],[34,88],[50,86],[22,104]].map(([x,y],i) => (
              <circle key={i} cx={x} cy={y} r="3.5" fill="#1f5028" stroke="rgba(90,190,110,0.35)" strokeWidth="0.6"/>
            ))}
            {[[150,70],[165,72],[180,70],[148,88],[163,88],[178,88],[155,104]].map(([x,y],i) => (
              <circle key={`r${i}`} cx={x} cy={y} r="3.5" fill="#1f5028" stroke="rgba(90,190,110,0.35)" strokeWidth="0.6"/>
            ))}
            <circle cx="84" cy="78" r="5" fill="#5abe6e" opacity="0.9"/>
            <circle cx="84" cy="78" r="2.5" fill="#0d1f12"/>
            <line x1="84" y1="83" x2="84" y2="90" stroke="#5abe6e" strokeWidth="1.2" opacity="0.8"/>
            <circle cx="130" cy="84" r="4" fill="#c9a84c" opacity="0.85"/>
            <circle cx="130" cy="84" r="2" fill="#0d1f12"/>
            <line x1="130" y1="88" x2="130" y2="94" stroke="#c9a84c" strokeWidth="1" opacity="0.75"/>
            {[28,44,60,72,84,96,112,124,136,148,162,178].map((x,i) => (
              <rect key={`ht${i}`} x={x} y={44-(i%3)*2} width="5" height={6+(i%2)*3}
                rx="2" fill="#1a3d22" opacity="0.85"/>
            ))}
            <rect x="0" y="118" width="206" height="12" fill="rgba(13,31,18,0.85)"/>
            <text x="103" y="127" textAnchor="middle" fontSize="6" fontWeight="600"
              fill="rgba(90,190,110,0.70)" fontFamily="sans-serif" letterSpacing="1.5">
              KAJIADO COUNTY · LAND REGISTRY
            </text>
          </svg>
        </div>

        {logout && (
          <button onClick={logout} className="nav-item logout-nav">
            <span className="nav-icon">🚪</span>
            <span>Logout</span>
          </button>
        )}
      </aside>

      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="header-title-block">
            <h1>
              <span className="title-green">Rongai </span>
              <span className="title-dark">Land Registry</span>
            </h1>
            <p>Kajiado County Government · Land Registry Management System</p>
          </div>
        </div>
        <div className="header-right">
          {roleMeta && (
            <span className={`role-badge ${authRole}`}>{roleMeta.emoji} {roleMeta.label} Session</span>
          )}
        </div>
      </header>

      <nav className="top-tabs" aria-hidden="true" />

      <div className="layout">
        <main className="main">
          <div className="content">
            {activeTab === "Dashboard" && (
              <DashboardPage
                wallet={wallet}
                totalParcels={totalParcels}   totalTransfers={totalTransfers}
                totalPayments={totalPayments} totalHolders={totalHolders}
                connectWallet={() => connectWallet(true)}
                role={authRole}
              />
            )}
            {activeTab === "Register Parcel" && (
              <RegisterParcelPage wallet={wallet} loading={loading}
                regForm={regForm} setRegForm={setRegForm} registerParcel={registerParcel} />
            )}
            {activeTab === "Land Registry" && (
              <LandRegistryPage wallet={wallet} loading={loading}
                lookupId={lookupId} setLookupId={setLookupId}
                lookupParcel={lookupParcel} parcelData={parcelData} />
            )}
            {activeTab === "My Parcels" && (
              <MyParcelsPage wallet={wallet} landRegistry={landRegistry}
                titleDeed={titleDeedContract} role={authRole} />
            )}
            {activeTab === "Transfer Land" && (
              <TransferLandPage wallet={wallet} loading={loading}
                txForm={txForm} setTxForm={setTxForm}
                initiateTransfer={initiateTransfer} landRegistry={landRegistry} />
            )}
            {activeTab === "Stamp Duty" && (
              <StampDutyPage wallet={wallet} role={authRole}
                loading={loading} setLoading={setLoading}
                dutyValue={dutyValue} setDutyValue={setDutyValue}
                dutyUrban={dutyUrban} setDutyUrban={setDutyUrban}
                calcDuty={calcDuty} dutyResult={dutyResult} stampDuty={stampDuty} />
            )}
            {activeTab === "Identity" && (
              <IdentityPage wallet={wallet} loading={loading}
                idForm={idForm} setIdForm={setIdForm}
                registerIdentity={registerIdentity} idStatus={idStatus}
                idLookup={idLookup} setIdLookup={setIdLookup}
                lookupIdentity={lookupIdentity} verifyIdentity={verifyIdentity} idResult={idResult} />
            )}
            {activeTab === "Title Deed" && (
              <TitleDeedPage wallet={wallet} loading={loading} setLoading={setLoading}
                titleDeed={titleDeedContract} setStatus={setStatus} role={authRole} />
            )}
            {activeTab === "Tx Certificate" && (
              <TransactionCertificatePage wallet={wallet} loading={loading} setLoading={setLoading}
                landTransfer={landTransfer} setStatus={setStatus} role={authRole} />
            )}
          </div>

          <footer className="footer">
            <p>Rongai Land Registry Management System — Kajiado County Government, Kenya © 2026</p>
            <p>Governing Law: Land Registration Act, Cap 300 (Kenya)</p>
          </footer>
        </main>
      </div>
    </div>
  );
}