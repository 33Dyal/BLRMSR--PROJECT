import { useState } from "react";
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

/* ── Field border style based on validation ─────────────────── */
function fieldStyle(value, validatorFn, ...args) {
  if (!value) return {};
  const { valid } = validatorFn(value, ...args);
  return { borderColor: valid ? "#2ecc89" : "#e05c5c" };
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

/* ── Stat accent colours ─────────────────────────────────────── */
const STAT_COLORS = ["#2196f3", "#2ecc89", "#c9982a", "#2ecc89", "#9c27b0"];

/* ── Role badge labels ───────────────────────────────────────── */
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
      `Invalid address "${s}" — need 0x + 40 hex chars, got ${hexLen} hex chars. ` +
      `Copy the address directly from MetaMask.`
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

/* ── Logo SVG ────────────────────────────────────────────────── */
function Logo() {
  return (
    <div className="logo">
      <svg className="logo-icon" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 5 L32 16 L32 31 L4 31 L4 16 Z" fill="rgba(0,0,0,0.25)"/>
        <path d="M18 4 L34 17 L30 17 L18 8 L6 17 L2 17 Z" fill="rgba(0,0,0,0.30)"/>
        <rect x="14" y="21" width="8" height="10" rx="1" fill="rgba(0,0,0,0.35)"/>
        <rect x="6"  y="18" width="6" height="5" rx="1" fill="rgba(255,255,255,0.55)"/>
        <rect x="24" y="18" width="6" height="5" rx="1" fill="rgba(255,255,255,0.55)"/>
        <circle cx="4"  cy="33" r="1.4" fill="rgba(0,0,0,0.30)"/>
        <circle cx="12" cy="33" r="1.4" fill="rgba(0,0,0,0.30)"/>
        <circle cx="20" cy="33" r="1.4" fill="rgba(0,0,0,0.30)"/>
        <circle cx="28" cy="33" r="1.4" fill="rgba(0,0,0,0.30)"/>
        <circle cx="32" cy="33" r="1.4" fill="rgba(0,0,0,0.30)"/>
      </svg>
    </div>
  );
}

/* ── Copy button for addresses ───────────────────────────────── */
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
      color: copied ? "#2ecc89" : "#9aabb8", fontSize: "14px", padding: "0 4px",
    }}>
      {copied ? "✓" : "⎘"}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════
   PAGE COMPONENTS
   ════════════════════════════════════════════════════════════════ */

/* ── Dashboard Page ──────────────────────────────────────────── */
function DashboardPage({
  wallet, totalParcels, totalTransfers, totalPayments, totalHolders, connectWallet, role,
}) {
  return (
    <div className="dashboard">
      <div className="page-header">
        <h2>System Overview</h2>
        <p className="subtitle">Rongai Sub-County Land Registry — Kajiado County, Kenya</p>
      </div>

      <div className="stats-grid">
        {[
          { icon: "🏡", value: totalParcels,   label: "Registered Parcels" },
          { icon: "🔄", value: totalTransfers, label: "Land Transfers"      },
          { icon: "💰", value: totalPayments,  label: "Stamp Duty Payments" },
          { icon: "🪪", value: totalHolders,   label: "Verified Holders"    },
          { icon: "⛓️", value: "LOCAL",        label: "Network"             },
        ].map(({ icon, value, label }, i) => (
          <div className="stat-card" key={label}>
            <span className="stat-icon">{icon}</span>
            <div className="stat-value" style={{ color: STAT_COLORS[i] }}>{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Contract addresses — Officers only */}
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
                  <td style={{ fontWeight: 600 }}>{name}</td>
                  <td><span className="mono">{a}</span></td>
                  <td><CopyBtn text={a} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info notice for landholder and public */}
      {role !== "officer" && (
        <div style={{
          background: "rgba(46,204,137,0.07)",
          border: "1.5px solid rgba(46,204,137,0.20)",
          borderRadius: "var(--radius-lg)",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          marginBottom: "8px",
        }}>
          <span style={{ fontSize: "28px" }}>🔒</span>
          <div>
            <div style={{ fontWeight: 700, color: "var(--navy)", fontSize: "15px", marginBottom: "4px" }}>
              System Information
            </div>
            <div style={{ fontSize: "13px", color: "#7a8a9a", lineHeight: 1.6 }}>
              {role === "landholder"
                ? "Use the navigation to register parcels, initiate transfers, and manage your title deeds. Contact a Registry Officer for any administrative queries."
                : "You are browsing as Public. You can view and verify land records but cannot register parcels or initiate transfers. Log in as a Landholder or Registry Officer to perform transactions."}
            </div>
          </div>
        </div>
      )}

      {!wallet && (
        <div className="connect-prompt">
          <span className="connect-prompt-icon">🦊</span>
          <p>Connect your MetaMask wallet to interact with the deployed contracts</p>
          <button className="connect-btn-lg" onClick={connectWallet}>
            Connect MetaMask
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Register Parcel Page ────────────────────────────────────── */
function RegisterParcelPage({ wallet, loading, regForm, setRegForm, registerParcel }) {
  const errors = {
    to:          validateAddress(regForm.to, "Owner Address"),
    parcelNumber:validateParcelId(regForm.parcelNumber),
    location:    validateLocation(regForm.location),
    area:        validateArea(regForm.area),
  };
  const canSubmit = !loading && wallet &&
    Object.values(errors).every(e => e.valid);

  return (
    <div className="form-section">
      <div className="page-header">
        <h2>Register Land Parcel</h2>
        <p className="subtitle">Mint a new land parcel NFT and record it in the registry ledger</p>
      </div>
      <div className="form-grid">
        <label>Owner Address
          <input
            value={regForm.to}
            onChange={e => setRegForm({ ...regForm, to: e.target.value })}
            placeholder="0x… (42 chars)"
            style={fieldStyle(regForm.to, validateAddress, "Owner Address")}
          />
          <FieldError message={regForm.to ? errors.to.message : ""} />
        </label>
        <label>Parcel Number
          <input
            value={regForm.parcelNumber}
            onChange={e => setRegForm({ ...regForm, parcelNumber: e.target.value.toUpperCase() })}
            placeholder="RONGAI/001/2026"
            style={fieldStyle(regForm.parcelNumber, validateParcelId)}
          />
          <FieldError message={regForm.parcelNumber ? errors.parcelNumber.message : ""} />
          {regForm.parcelNumber && errors.parcelNumber.valid && (
            <span style={{ color: "#2ecc89", fontSize: "11px", marginTop: "3px", display: "block" }}>✓ Valid format</span>
          )}
        </label>
        <label>Location Description
          <input
            value={regForm.location}
            onChange={e => setRegForm({ ...regForm, location: e.target.value })}
            placeholder="Rongai Ward, Plot 001, Kajiado North"
            style={fieldStyle(regForm.location, validateLocation)}
          />
          <FieldError message={regForm.location ? errors.location.message : ""} />
        </label>
        <label>Area (sq. metres)
          <input
            type="number"
            value={regForm.area}
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
          label="Land Parcel Document (Survey map, Title application)"
          accept=".pdf,.jpg,.jpeg,.png"
        />
      </div>
      <button
        className="action-btn"
        onClick={registerParcel}
        disabled={!canSubmit}
      >
        {loading ? "Processing…" : "Register Parcel on Blockchain"}
      </button>
    </div>
  );
}

/* ── Land Registry Page ──────────────────────────────────────── */
function LandRegistryPage({ wallet, loading, lookupId, setLookupId, lookupParcel, parcelData }) {
  return (
    <div className="form-section">
      <div className="page-header">
        <h2>Land Registry Lookup</h2>
        <p className="subtitle">Query parcel ownership records from the blockchain ledger</p>
      </div>
      <div className="search-row">
        <input
          value={lookupId}
          onChange={e => setLookupId(e.target.value)}
          placeholder="Enter Parcel ID — e.g. RONGAI/001/2026"
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
              <tr><td>Parcel ID</td>    <td>{parcelData.parcelId}</td></tr>
              <tr><td>Title Deed</td>   <td>{parcelData.titleDeedNumber}</td></tr>
              <tr><td>LR Number</td>    <td>{parcelData.lrNumber}</td></tr>
              <tr><td>Current Owner</td><td><span className="mono">{parcelData.currentOwner}</span></td></tr>
              <tr><td>Owner DID</td>    <td>{parcelData.ownerDID}</td></tr>
              <tr><td>Land Use</td>     <td>{parcelData.landUse}</td></tr>
              <tr><td>Area</td>         <td>{parcelData.areaSquareMeters?.toString()} sq.m</td></tr>
              <tr><td>Value (KES)</td>  <td>{parcelData.landValueKES?.toString()}</td></tr>
              <tr>
                <td>Status</td>
                <td style={{ color: parcelData.isActive ? "#2ecc89" : "#e05c5c", fontWeight: 600 }}>
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

/* ── Transfer Land Page ──────────────────────────────────────── */
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
    } catch {
      setOwnershipStatus("not-registered");
    }
  }

  function handleParcelIdChange(val) {
    setTxForm({ ...txForm, parcelId: val });
    setOwnershipStatus(null);
  }

  const ownershipBadge = {
    checking:         { color: "#2196f3", bg: "rgba(33,150,243,0.08)",  border: "rgba(33,150,243,0.25)", icon: "⏳", text: "Checking ownership on blockchain…" },
    verified:         { color: "#1a5c35", bg: "rgba(46,204,137,0.08)",  border: "rgba(46,204,137,0.30)", icon: "✅", text: "Ownership verified — you are the registered owner of this parcel." },
    failed:           { color: "#c0392b", bg: "rgba(224,92,92,0.08)",   border: "rgba(224,92,92,0.30)",  icon: "❌", text: "Ownership verification failed — your wallet is not the registered owner of this parcel." },
    "not-registered": { color: "#7a5800", bg: "rgba(201,152,42,0.08)",  border: "rgba(201,152,42,0.30)", icon: "⚠️", text: "Parcel not found in Land Registry. Register the parcel first before initiating a transfer." },
  }[ownershipStatus];

  const canSubmit = loading || !wallet || !isValidAddress(txForm.buyer) ||
                    !txForm.parcelId || !txForm.transferId || ownershipStatus !== "verified";

  return (
    <div className="form-section">
      <div className="page-header">
        <h2>Initiate Land Transfer</h2>
        <p className="subtitle">Submit a land ownership transfer request to the blockchain</p>
      </div>

      <div style={{
        background: "rgba(46,204,137,0.07)", border: "1.5px solid rgba(46,204,137,0.20)",
        borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: "20px",
        fontSize: "14px", color: "#1a5c35", lineHeight: 1.6,
      }}>
        <strong>ℹ️ Ownership verification:</strong> Your wallet is automatically set as the Seller.
        Enter your Parcel ID and click <strong>Verify Ownership</strong> — the blockchain will confirm
        you are the registered owner before allowing the transfer.
      </div>

      <div className="form-grid">
        <label>Transfer ID
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={txForm.transferId}
              onChange={e => setTxForm({ ...txForm, transferId: e.target.value })}
              placeholder="TXN-RNG-2026-00001"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={() => setTxForm({ ...txForm, transferId: autoGenId() })}
              style={{
                background: "rgba(26,92,53,0.10)", border: "1.5px solid rgba(26,92,53,0.25)",
                borderRadius: "var(--radius-sm)", color: "#1a5c35", padding: "0 12px",
                cursor: "pointer", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap",
              }}
            >Auto ✦</button>
          </div>
          <FieldError message={txForm.transferId ? validateTransferId(txForm.transferId).message : ""} />
        </label>

        <label>Parcel ID
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={txForm.parcelId}
              onChange={e => handleParcelIdChange(e.target.value.toUpperCase())}
              placeholder="RONGAI/001/2026"
              style={{ flex: 1, ...fieldStyle(txForm.parcelId, validateParcelId) }}
            />
            <button
              type="button"
              onClick={verifyParcelOwnership}
              disabled={!txForm.parcelId || !wallet || ownershipStatus === "checking"}
              style={{
                background: ownershipStatus === "verified" ? "rgba(46,204,137,0.15)" : "rgba(26,92,53,0.10)",
                border: "1.5px solid rgba(26,92,53,0.25)",
                borderRadius: "var(--radius-sm)", color: "#1a5c35", padding: "0 12px",
                cursor: "pointer", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap",
              }}
            >
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
            display: "flex", alignItems: "center", gap: "8px", fontWeight: 500,
          }}>
            <span>{ownershipBadge.icon}</span>
            <span>{ownershipBadge.text}</span>
          </div>
        )}

        <label>Seller Address (Your Wallet)
          <input
            value={sellerAddress} readOnly
            style={{ background: "#f0f7f4", borderColor: "#2ecc89", color: "#1a5c35", cursor: "not-allowed" }}
          />
          <span style={{ fontSize: "11px", color: "#2ecc89", marginTop: "3px", display: "block" }}>
            ✓ Auto-filled from connected MetaMask wallet
          </span>
        </label>

        <label>Buyer Address
          <input
            value={txForm.buyer}
            onChange={e => setTxForm({ ...txForm, buyer: e.target.value })}
            placeholder="0x… (42 chars)"
            style={addrStyle(txForm.buyer)}
          />
          <AddrHint value={txForm.buyer} />
        </label>

        <label>Seller DID
          <input
            value={sellerDID} readOnly
            style={{ background: "#f0f7f4", borderColor: "#2ecc89", color: "#1a5c35", cursor: "not-allowed" }}
          />
        </label>

        <label>Buyer DID
          <input
            value={txForm.buyerDID}
            onChange={e => setTxForm({ ...txForm, buyerDID: e.target.value })}
            placeholder="did:rongai:0x…"
          />
        </label>

        <label>Agreed Price (KES)
          <input
            type="number"
            value={txForm.price}
            onChange={e => setTxForm({ ...txForm, price: e.target.value })}
            placeholder="4800000"
            style={fieldStyle(txForm.price, validatePrice)}
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
          label="Transfer Supporting Document (Sale agreement, Court order, etc.)"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        />
      </div>

      {ownershipStatus !== "verified" && (
        <p style={{ fontSize: "13px", color: "#9aabb8", marginTop: "4px", marginBottom: "4px" }}>
          ⛓ Verify parcel ownership above before submitting the transfer.
        </p>
      )}

      <button
        className="action-btn"
        onClick={() => initiateTransfer(sellerAddress, sellerDID)}
        disabled={canSubmit}
      >
        {loading ? "Processing…" : "⛓ Initiate Transfer on Blockchain"}
      </button>
    </div>
  );
}

/* ── Stamp Duty Page ─────────────────────────────────────────── */
const STATUS_META = {
  0: { label: "Pending",    color: "#c9982a", bg: "rgba(201,152,42,0.08)",  border: "rgba(201,152,42,0.30)"  },
  1: { label: "Processing", color: "#2196f3", bg: "rgba(33,150,243,0.08)",  border: "rgba(33,150,243,0.25)"  },
  2: { label: "Confirmed",  color: "#1a5c35", bg: "rgba(46,204,137,0.08)",  border: "rgba(46,204,137,0.30)"  },
  3: { label: "Failed",     color: "#c0392b", bg: "rgba(224,92,92,0.08)",   border: "rgba(224,92,92,0.30)"   },
  4: { label: "Refunded",   color: "#7a8a9a", bg: "rgba(154,171,184,0.08)", border: "rgba(154,171,184,0.25)" },
};

function StampDutyPage({
  wallet, role, loading, setLoading,
  dutyValue, setDutyValue, dutyUrban, setDutyUrban, calcDuty, dutyResult,
  stampDuty,
}) {
  /* ── Local state for new sections ── */
  const [payForm, setPayForm] = useState({
    paymentId: "", transferId: "", parcelId: "",
    payerAddress: "", paymentMethod: "M-Pesa", paymentRef: "",
  });
  const [confirmForm, setConfirmForm] = useState({
    paymentId: "", kraCode: "", paymentRef: "",
  });
  const [lookupId,     setLookupId]     = useState("");
  const [payRecord,    setPayRecord]     = useState(null);
  const [dutyStatus,   setDutyStatus]   = useState("");

  /* Auto-generate payment ID — embeds Transfer ID when available */
  function autoPayId() {
    const rand = Math.floor(Math.random() * 9000 + 1000);
    if (payForm.transferId && payForm.transferId.trim()) {
      // e.g. TXN-RNG-2026-123456  ->  SDP-RNG-2026-123456-4521
      const txnClean = payForm.transferId.trim().replace(/^TXN-/, "");
      return "SDP-" + txnClean + "-" + rand;
    }
    // Fallback when Transfer ID not yet filled
    const ts = Date.now().toString().slice(-6);
    return "SDP-RNG-" + new Date().getFullYear() + "-" + ts + "-" + rand;
  }

  /* ── Create payment record on-chain ── */
  async function createPayment() {
    try {
      setLoading(true);
      setDutyStatus("Creating payment record on blockchain…");
      const payer = payForm.payerAddress || wallet;
      const tx = await stampDuty.createPayment(
        payForm.paymentId,
        payForm.transferId,
        payForm.parcelId,
        payer,
        parseInt(dutyValue),
        dutyUrban,
        payForm.paymentMethod,
      );
      await tx.wait();
      setDutyStatus(`✅ Payment record ${payForm.paymentId} created on-chain.`);
      setPayForm({ paymentId: "", transferId: "", parcelId: "", payerAddress: "", paymentMethod: "M-Pesa", paymentRef: "" });
    } catch (err) {
      const msg = err.reason || err.message || "";
      if (msg.includes("already exists"))       setDutyStatus("❌ Payment ID already exists. Use a different ID.");
      else if (msg.includes("user rejected"))   setDutyStatus("❌ Transaction cancelled in MetaMask.");
      else if (msg.includes("already exists for this transfer")) setDutyStatus("❌ A payment record already exists for this Transfer ID.");
      else setDutyStatus("❌ Error: " + msg);
    } finally { setLoading(false); }
  }

  /* ── Confirm payment on-chain (Officer only) ── */
  async function confirmPayment() {
    try {
      setLoading(true);
      setDutyStatus("Confirming payment on blockchain…");
      const tx = await stampDuty.confirmPayment(
        confirmForm.paymentId,
        confirmForm.kraCode,
        confirmForm.paymentRef,
      );
      await tx.wait();
      setDutyStatus(`✅ Payment ${confirmForm.paymentId} confirmed. KRA Code: ${confirmForm.kraCode}`);
      setConfirmForm({ paymentId: "", kraCode: "", paymentRef: "" });
    } catch (err) {
      const msg = err.reason || err.message || "";
      if (msg.includes("Payment not found"))    setDutyStatus("❌ Payment ID not found on blockchain.");
      else if (msg.includes("user rejected"))   setDutyStatus("❌ Transaction cancelled in MetaMask.");
      else setDutyStatus("❌ Error: " + msg);
    } finally { setLoading(false); }
  }

  /* ── Lookup payment by Transfer ID ── */
  async function lookupPayment() {
    try {
      setLoading(true); setPayRecord(null);
      setDutyStatus("Fetching payment record…");
      const rec = await stampDuty.getPaymentByTransfer(lookupId);
      setPayRecord(rec);
      setDutyStatus("Payment record found.");
    } catch (err) {
      const msg = err.reason || err.message || "";
      if (msg.includes("No payment found"))   setDutyStatus("⚠ No payment record found for this Transfer ID.");
      else setDutyStatus("❌ Error: " + msg);
    } finally { setLoading(false); }
  }

  const statusMeta = payRecord ? STATUS_META[Number(payRecord.status)] : null;

  return (
    <div className="form-section">
      <div className="page-header">
        <h2>Stamp Duty</h2>
        <p className="subtitle">Calculate, record and confirm stamp duty payments per the Kenya Land Registration Act, Cap 300</p>
      </div>

      {/* ── Section 1: Calculator ── */}
      <h3 className="section-heading">Step 1 — Calculate Stamp Duty</h3>
      <div className="duty-calculator">
        <label>Transaction Value (KES)
          <input
            type="number"
            value={dutyValue}
            onChange={e => setDutyValue(e.target.value)}
            placeholder="4,800,000"
            style={fieldStyle(dutyValue, validateKES)}
          />
          <FieldError message={dutyValue ? validateKES(dutyValue).message : ""} />
        </label>
        <label>Land Type
          <div className="radio-group">
            <label className="radio-label">
              <input type="radio" checked={dutyUrban} onChange={() => setDutyUrban(true)} />
              Urban (2%)
            </label>
            <label className="radio-label">
              <input type="radio" checked={!dutyUrban} onChange={() => setDutyUrban(false)} />
              Rural (4%)
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

      {/* ── Section 2: Record Payment ── */}
      <h3 className="section-heading">Step 2 — Record Payment on Blockchain</h3>
      <div className="privacy-notice" style={{ marginBottom: "16px" }}>
        After calculating stamp duty, create an immutable payment record on-chain linked to the
        transfer ID. Include your M-Pesa or bank reference so there is an auditable link between
        the blockchain record and the off-chain KRA iTax payment.
      </div>
      <div className="form-grid">
        <label>Payment ID
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={payForm.paymentId}
              onChange={e => setPayForm({ ...payForm, paymentId: e.target.value })}
              placeholder="SDP-RNG-2026-00001"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={() => setPayForm({ ...payForm, paymentId: autoPayId() })}
              style={{
                background: "rgba(26,92,53,0.10)", border: "1.5px solid rgba(26,92,53,0.25)",
                borderRadius: "var(--radius-sm)", color: "#1a5c35", padding: "0 12px",
                cursor: "pointer", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap",
              }}
            >Auto ✦</button>
          </div>
          <FieldError message={payForm.paymentId ? validatePaymentId(payForm.paymentId).message : ""} />
          <span style={{ fontSize: "11px", color: "#9aabb8", marginTop: "3px", display: "block" }}>
            {payForm.transferId ? "✓ Will embed Transfer ID in Payment ID" : "Fill Transfer ID first for a linked Payment ID"}
          </span>
        </label>
        <label>Transfer ID (linked transfer)
          <input
            value={payForm.transferId}
            onChange={e => setPayForm({ ...payForm, transferId: e.target.value })}
            placeholder="TXN-RNG-2026-00001"
            style={fieldStyle(payForm.transferId, validateTransferId)}
          />
          <FieldError message={payForm.transferId ? validateTransferId(payForm.transferId).message : ""} />
        </label>
        <label>Parcel ID
          <input
            value={payForm.parcelId}
            onChange={e => setPayForm({ ...payForm, parcelId: e.target.value.toUpperCase() })}
            placeholder="RONGAI/001/2026"
            style={fieldStyle(payForm.parcelId, validateParcelId)}
          />
          <FieldError message={payForm.parcelId ? validateParcelId(payForm.parcelId).message : ""} />
        </label>
        <label>Payer Address (Buyer wallet)
          <input
            value={payForm.payerAddress}
            onChange={e => setPayForm({ ...payForm, payerAddress: e.target.value })}
            placeholder={wallet || "0x… (leave blank to use connected wallet)"}
            style={addrStyle(payForm.payerAddress)}
          />
          <AddrHint value={payForm.payerAddress} />
        </label>
        <label>Payment Method
          <select
            value={payForm.paymentMethod}
            onChange={e => setPayForm({ ...payForm, paymentMethod: e.target.value })}
          >
            <option>M-Pesa</option>
            <option>Bank Transfer</option>
            <option>Escrow</option>
            <option>Cash</option>
          </select>
        </label>
        <label>
          {payForm.paymentMethod === "M-Pesa"       ? "M-Pesa Transaction Code"    :
           payForm.paymentMethod === "Bank Transfer" ? "Bank Transaction Reference" :
           payForm.paymentMethod === "Escrow"        ? "Escrow Reference Number"    :
           "Payment Reference (optional)"}
          <input
            value={payForm.paymentRef}
            onChange={e => setPayForm({ ...payForm, paymentRef: e.target.value })}
            placeholder={
              payForm.paymentMethod === "M-Pesa"       ? "e.g. QAB7YX3KP2"          :
              payForm.paymentMethod === "Bank Transfer" ? "e.g. TRF/2026/00123456"   :
              payForm.paymentMethod === "Escrow"        ? "e.g. ESC-2026-00001"      :
              "Optional reference number"
            }
          />
          <span style={{ fontSize: "11px", color: "#9aabb8", marginTop: "3px", display: "block" }}>
            {payForm.paymentMethod === "M-Pesa"
              ? "The M-Pesa confirmation SMS code received after payment to KRA iTax"
              : "The reference number from your payment receipt — stored on-chain for audit trail"}
          </span>
        </label>
      </div>
      <button
        className="action-btn"
        onClick={createPayment}
        disabled={loading || !wallet || !dutyValue || !payForm.paymentId || !payForm.transferId || !payForm.parcelId}
      >
        {loading ? "Processing…" : "⛓ Record Payment on Blockchain"}
      </button>

      {/* ── Section 3: Confirm Payment (Officer only) ── */}
      {role === "officer" && (
        <>
          <h3 className="section-heading" style={{ marginTop: "2rem" }}>
            Step 3 — Confirm KRA Payment (Officers Only)
          </h3>
          <p style={{ fontSize: "13px", color: "#7a8a9a", marginBottom: "14px" }}>
            After the buyer pays stamp duty to KRA via iTax, enter the KRA confirmation code
            to finalise the payment record on-chain.
          </p>
          <div className="form-grid">
            <label>Payment ID
              <input
                value={confirmForm.paymentId}
                onChange={e => setConfirmForm({ ...confirmForm, paymentId: e.target.value })}
                placeholder="SDP-RNG-2026-00001"
              />
            </label>
            <label>KRA iTax Confirmation Code
              <input
                value={confirmForm.kraCode}
                onChange={e => setConfirmForm({ ...confirmForm, kraCode: e.target.value })}
                placeholder="KRA-ITAX-2026-XXXXXXXX"
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>Payment Reference (M-Pesa / Bank)
              <input
                value={confirmForm.paymentRef}
                onChange={e => setConfirmForm({ ...confirmForm, paymentRef: e.target.value })}
                placeholder="MPESA ref or bank transaction number"
              />
            </label>
          </div>
          <button
            className="action-btn"
            onClick={confirmPayment}
            disabled={loading || !wallet || !confirmForm.paymentId || !confirmForm.kraCode}
            style={{ background: "linear-gradient(135deg, #0b3a20, #1a5c35)" }}
          >
            {loading ? "Confirming…" : "✓ Confirm Payment on Blockchain"}
          </button>
        </>
      )}

      {/* ── Section 4: Lookup ── */}
      <h3 className="section-heading" style={{ marginTop: "2rem" }}>
        Look Up Payment by Transfer ID
      </h3>
      <div className="search-row">
        <input
          value={lookupId}
          onChange={e => setLookupId(e.target.value)}
          placeholder="Enter Transfer ID — e.g. TXN-RNG-2026-00001"
        />
        <button className="action-btn" onClick={lookupPayment} disabled={loading || !wallet || !lookupId}>
          {loading ? "…" : "Look Up"}
        </button>
      </div>

      {/* Status message */}
      {dutyStatus && (
        <div style={{
          background: dutyStatus.startsWith("✅") ? "rgba(46,204,137,0.07)" : dutyStatus.startsWith("❌") ? "rgba(224,92,92,0.07)" : "rgba(33,150,243,0.07)",
          border: `1px solid ${dutyStatus.startsWith("✅") ? "rgba(46,204,137,0.25)" : dutyStatus.startsWith("❌") ? "rgba(224,92,92,0.25)" : "rgba(33,150,243,0.20)"}`,
          borderRadius: "var(--radius)", padding: "10px 14px",
          fontSize: "13px", color: dutyStatus.startsWith("✅") ? "#1a5c35" : dutyStatus.startsWith("❌") ? "#c0392b" : "#1a5070",
          marginTop: "14px",
        }}>
          {dutyStatus}
        </div>
      )}

      {/* Payment record result */}
      {payRecord && statusMeta && (
        <div className="result-card" style={{ marginTop: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <h3 style={{ margin: 0 }}>Payment Record</h3>
            <span style={{
              background: statusMeta.bg, border: `1px solid ${statusMeta.border}`,
              color: statusMeta.color, borderRadius: "20px",
              padding: "3px 14px", fontSize: "12px", fontWeight: 700,
            }}>
              {statusMeta.label}
            </span>
          </div>
          <table>
            <tbody>
              <tr><td>Payment ID</td>        <td style={{ fontFamily: "var(--mono)", fontSize: "12px" }}>{payRecord.paymentId}</td></tr>
              <tr><td>Transfer ID</td>       <td>{payRecord.transferId}</td></tr>
              <tr><td>Parcel ID</td>         <td>{payRecord.parcelId}</td></tr>
              <tr><td>Payer</td>             <td><span className="mono">{payRecord.payer}</span></td></tr>
              <tr><td>Transaction Value</td> <td>KES {Number(payRecord.transactionValueKES).toLocaleString()}</td></tr>
              <tr><td>Stamp Duty Rate</td>   <td>{payRecord.stampDutyRatePercent?.toString()}%</td></tr>
              <tr><td>Stamp Duty</td>        <td>KES {Number(payRecord.stampDutyAmountKES).toLocaleString()}</td></tr>
              <tr><td>Registration Fee</td>  <td>KES {Number(payRecord.registrationFeeKES).toLocaleString()}</td></tr>
              <tr className="total-row">
                <td><strong>Total Fees</strong></td>
                <td><strong>KES {Number(payRecord.totalFeesKES).toLocaleString()}</strong></td>
              </tr>
              <tr><td>Payment Method</td>    <td>{payRecord.paymentMethod}</td></tr>
              {payRecord.paymentReference && (
                <tr><td>Payment Reference</td><td style={{ fontFamily: "var(--mono)", fontSize: "12px" }}>{payRecord.paymentReference}</td></tr>
              )}
              {payRecord.kraConfirmationCode && (
                <tr><td>KRA Confirmation</td><td style={{ fontFamily: "var(--mono)", fontSize: "12px", color: "#1a5c35", fontWeight: 600 }}>{payRecord.kraConfirmationCode}</td></tr>
              )}
              <tr><td>Created</td>           <td>{new Date(Number(payRecord.createdAt) * 1000).toLocaleString()}</td></tr>
              {Number(payRecord.confirmedAt) > 0 && (
                <tr><td>Confirmed</td>       <td>{new Date(Number(payRecord.confirmedAt) * 1000).toLocaleString()}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Identity Page ───────────────────────────────────────────── */
function IdentityPage({
  wallet, loading,
  idForm, setIdForm, registerIdentity, idStatus,
  idLookup, setIdLookup, lookupIdentity, verifyIdentity, idResult,
}) {
  const idErrors = {
    wallet:    validateAddress(idForm.wallet, "Wallet Address"),
    fullName:  validateFullName(idForm.fullName),
    nationalId:validateNationalId(idForm.nationalId),
  };
  const canRegister = !loading && wallet &&
    Object.values(idErrors).every(e => e.valid);

  return (
    <div className="form-section">
      <div className="page-header">
        <h2>Landholder Identity Verification</h2>
        <p className="subtitle">
          Register and verify landholder identities on-chain. Raw ID numbers never leave
          your browser — only a secure keccak256 hash is stored on the blockchain.
        </p>
      </div>

      <h3 className="section-heading">Register New Identity</h3>
      <div className="privacy-notice">
        Your National ID number and full name are hashed locally using keccak256 before being sent
        to the blockchain. Raw values are never transmitted or stored outside your device.
      </div>

      <div className="form-grid">
        <label>Landholder Wallet Address
          <input
            value={idForm.wallet}
            onChange={e => setIdForm({ ...idForm, wallet: e.target.value })}
            placeholder="0x… (42 chars)"
            style={fieldStyle(idForm.wallet, validateAddress, "Wallet Address")}
          />
          <FieldError message={idForm.wallet ? idErrors.wallet.message : ""} />
        </label>
        <label>Full Name (exactly as on ID)
          <input
            value={idForm.fullName}
            onChange={e => setIdForm({ ...idForm, fullName: e.target.value })}
            placeholder="John Kamau Mwangi"
            style={fieldStyle(idForm.fullName, validateFullName)}
          />
          <FieldError message={idForm.fullName ? idErrors.fullName.message : ""} />
        </label>
        <label>National ID / Passport Number
          <input
            value={idForm.nationalId}
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

      <button
        className="action-btn"
        onClick={registerIdentity}
        disabled={!canRegister}
      >
        {loading ? "Processing…" : "Register Identity on Blockchain"}
      </button>

      {idStatus && (
        <div className="result-card" style={{ marginTop: "14px" }}>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--text-light)" }}>{idStatus}</p>
        </div>
      )}

      <h3 className="section-heading" style={{ marginTop: "2rem" }}>Look Up / Verify Identity</h3>
      <p style={{ fontSize: "13px", color: "#7a8a9a", marginBottom: "14px" }}>
        Enter a wallet address to check identity status. As the contract owner you can verify pending identities.
      </p>

      <div className="search-row">
        <div style={{ flex: 1 }}>
          <input
            value={idLookup}
            onChange={e => setIdLookup(e.target.value)}
            placeholder="Wallet address 0x… (42 chars)"
            style={{ width: "100%", ...addrStyle(idLookup) }}
          />
          <AddrHint value={idLookup} />
        </div>
        <button className="action-btn" onClick={lookupIdentity} disabled={loading || !wallet || !isValidAddress(idLookup)}>
          {loading ? "…" : "Look Up"}
        </button>
        <button
          className="action-btn"
          onClick={verifyIdentity}
          disabled={loading || !wallet || !isValidAddress(idLookup)}
          style={{ marginLeft: "8px", background: "linear-gradient(135deg, #0b3a20, #1a5c35)", boxShadow: "0 3px 12px rgba(46,204,137,0.25)" }}
        >
          {loading ? "…" : "✓ Verify"}
        </button>
      </div>

      {idResult && (
        <div className="result-card" style={{ marginTop: "18px" }}>
          <h3>Identity Record</h3>
          <table>
            <tbody>
              <tr><td>Wallet</td><td><span className="mono">{idResult.wallet}</span></td></tr>
              <tr><td>DID</td><td>{idResult.did}</td></tr>
              <tr><td>ID Type</td><td>{idResult.idType}</td></tr>
              <tr>
                <td>Status</td>
                <td style={{ color: idResult.isVerified ? "#2ecc89" : "#f0c050", fontWeight: 600 }}>
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

/* ════════════════════════════════════════════════════════════════
   ROOT APP COMPONENT
   ════════════════════════════════════════════════════════════════ */
export default function App() {
  let authRole = null, authWallet = null, logout = null;
  try { const a = useAuth(); authRole = a.role; authWallet = a.wallet; logout = a.logout; } catch {}

  const TABS = ALL_TABS.filter(t => !authRole || t.roles.includes(authRole));

  const [activeTab,  setActiveTab]  = useState("Dashboard");
  const [wallet,     setWallet]     = useState(authWallet || null);
  const [status,     setStatus]     = useState("");
  const [loading,    setLoading]    = useState(false);

  /* Contracts */
  const [landParcel,        setLandParcel]        = useState(null);
  const [landRegistry,      setLandRegistry]      = useState(null);
  const [landTransfer,      setLandTransfer]      = useState(null);
  const [stampDuty,         setStampDuty]         = useState(null);
  const [identityContract,  setIdentityContract]  = useState(null);
  const [titleDeedContract, setTitleDeedContract] = useState(null);

  /* Dashboard stats */
  const [totalParcels,   setTotalParcels]   = useState("0");
  const [totalTransfers, setTotalTransfers] = useState("0");
  const [totalPayments,  setTotalPayments]  = useState("0");
  const [totalHolders,   setTotalHolders]   = useState("0");

  /* Register Parcel */
  const [regForm, setRegForm] = useState({ to: "", parcelNumber: "", location: "", area: "", ipfsHash: "" });

  /* Land Registry */
  const [lookupId,   setLookupId]   = useState("");
  const [parcelData, setParcelData] = useState(null);

  /* Transfer */
  const [txForm, setTxForm] = useState({
    transferId: "", parcelId: "", seller: "", buyer: "",
    sellerDID: "", buyerDID: "", price: "", transferType: "Sale", ipfsHash: "",
  });

  /* Stamp Duty */
  const [dutyValue,  setDutyValue]  = useState("");
  const [dutyUrban,  setDutyUrban]  = useState(true);
  const [dutyResult, setDutyResult] = useState(null);

  /* Identity */
  const [idForm,   setIdForm]   = useState({ wallet: "", nationalId: "", fullName: "", idType: "National ID" });
  const [idLookup, setIdLookup] = useState("");
  const [idResult, setIdResult] = useState(null);
  const [idStatus, setIdStatus] = useState("");

  /* ── Connect Wallet ─────────────────────────────────────── */
  async function connectWallet() {
    try {
      if (!window.ethereum) { setStatus("MetaMask not found — please install MetaMask."); return; }
      setLoading(true);
      const _provider = new ethers.BrowserProvider(window.ethereum);
      const _signer   = await _provider.getSigner();
      const _address  = await _signer.getAddress();

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
    } catch (err) { setStatus("Error: " + err.message); }
    finally { setLoading(false); }
  }

  /* ── Register Parcel ────────────────────────────────────── */
  async function registerParcel() {
    try {
      setLoading(true);
      const ownerAddress = addr(regForm.to);
      setStatus("Step 1/2 — Minting parcel NFT…");
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
      setStatus("Parcel " + regForm.parcelNumber + " registered! TX: " + tx1.hash.slice(0, 10) + "…");
      setRegForm({ to: "", parcelNumber: "", location: "", area: "", ipfsHash: "" });
    } catch (err) {
      const msg = err.reason || err.message || "";
      if (msg.includes("already registered"))                            setStatus("❌ This parcel number is already registered.");
      else if (msg.includes("user rejected"))                            setStatus("❌ Transaction cancelled in MetaMask.");
      else if (msg.includes("Only officer") || msg.includes("onlyOfficer")) setStatus("❌ Only Registry Officers can register parcels.");
      else setStatus("❌ Error: " + msg);
    }
    finally { setLoading(false); }
  }

  /* ── Lookup Parcel ──────────────────────────────────────── */
  async function lookupParcel() {
    try {
      setLoading(true); setStatus("Fetching parcel from registry…");
      const data = await landRegistry.getParcel(lookupId);
      setParcelData(data); setStatus("Parcel found.");
    } catch (err) { setParcelData(null); setStatus("Not found: " + err.message); }
    finally { setLoading(false); }
  }

  /* ── Initiate Transfer ──────────────────────────────────── */
  async function initiateTransfer(sellerAddr, sellerDIDVal) {
    try {
      setLoading(true);
      const sellerAddress = addr(sellerAddr || wallet);
      const buyerAddress  = addr(txForm.buyer);
      const sellerDIDUsed = sellerDIDVal || `did:rongai:${sellerAddress}`;
      const buyerDIDUsed  = txForm.buyerDID || `did:rongai:${buyerAddress}`;
      setStatus("Initiating land transfer…");
      const tx = await landTransfer.initiateTransfer(
        txForm.transferId, txForm.parcelId, sellerAddress, buyerAddress,
        sellerDIDUsed, buyerDIDUsed, parseInt(txForm.price || "0"),
        txForm.transferType, txForm.ipfsHash || "",
      );
      await tx.wait();
      try { setTotalTransfers((await landTransfer.totalTransfers()).toString()); } catch {}
      setStatus("✅ Transfer " + txForm.transferId + " initiated! TX: " + tx.hash.slice(0, 10) + "…");
      setTxForm({ transferId: "", parcelId: "", buyer: "", buyerDID: "", price: "", transferType: "Sale", ipfsHash: "" });
    } catch (err) {
      const msg = err.reason || err.message || "";
      if (msg.includes("Only the seller"))    setStatus("❌ Your wallet must match the seller address.");
      else if (msg.includes("already exists")) setStatus("❌ Transfer ID already exists. Use a different ID.");
      else if (msg.includes("user rejected"))  setStatus("❌ Transaction cancelled in MetaMask.");
      else setStatus("❌ Error: " + msg);
    }
    finally { setLoading(false); }
  }

  /* ── Stamp Duty ─────────────────────────────────────────── */
  async function calcDuty() {
    try {
      setLoading(true);
      const [duty, regFee, total] = await stampDuty.calculateDuty(parseInt(dutyValue), dutyUrban);
      setDutyResult({ duty: duty.toString(), regFee: regFee.toString(), total: total.toString(), rate: dutyUrban ? "2%" : "4%" });
      setStatus("Stamp duty calculated.");
    } catch (err) { setStatus("Error: " + err.message); }
    finally { setLoading(false); }
  }

  /* ── Register Identity ──────────────────────────────────── */
  async function registerIdentity() {
    try {
      setLoading(true); setIdStatus("Computing identity hash in browser…");
      const hash          = computeIdentityHash(idForm.nationalId, idForm.fullName, idForm.wallet);
      const did           = generateDID(idForm.wallet);
      const holderAddress = addr(idForm.wallet);
      setIdStatus("Sending to blockchain (raw ID never leaves your browser)…");
      const tx = await identityContract.registerIdentity(holderAddress, did, hash, idForm.idType);
      await tx.wait();
      setTotalHolders((await identityContract.totalHolders()).toString());
      setIdStatus("Identity registered. DID: " + did);
      setIdForm({ wallet: "", nationalId: "", fullName: "", idType: "National ID" });
    } catch (err) { setIdStatus("Error: " + (err.reason || err.message)); }
    finally { setLoading(false); }
  }

  /* ── Lookup / Verify Identity ───────────────────────────── */
  async function lookupIdentity() {
    try {
      setLoading(true); setIdResult(null); setIdStatus("Fetching identity record…");
      const data = await identityContract.getIdentity(addr(idLookup));
      setIdResult(data); setIdStatus("Identity record found.");
    } catch (err) { setIdResult(null); setIdStatus("Not found: " + (err.reason || err.message)); }
    finally { setLoading(false); }
  }

  async function verifyIdentity() {
    try {
      setLoading(true); setIdStatus("Verifying identity on-chain…");
      const tx = await identityContract.verifyIdentity(addr(idLookup));
      await tx.wait(); setIdStatus("Identity verified successfully."); await lookupIdentity();
    } catch (err) { setIdStatus("Error: " + (err.reason || err.message)); }
    finally { setLoading(false); }
  }

  /* ── Render ─────────────────────────────────────────────── */
  const roleMeta = ROLE_META[authRole] || null;

  let sessionWarning = false, timeRemaining = null, extendSession = null;
  try {
    const a = useAuth();
    sessionWarning = a.sessionWarning;
    timeRemaining  = a.timeRemaining;
    extendSession  = a.extendSession;
  } catch {}

  const minutes  = timeRemaining !== null ? Math.floor(timeRemaining / 60) : 0;
  const seconds  = timeRemaining !== null ? timeRemaining % 60 : 0;
  const countdown = `${minutes}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="app">

      {/* ── Session Timeout Warning Banner ── */}
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

      {/* ── Top Header ── */}
      <header className="header">
        <div className="header-left">
          <Logo />
          <div className="header-title-block">
            <h1>
              <span className="title-green">Rongai </span>
              <span className="title-dark">Land Registry</span>
            </h1>
            <p>Kajiado County · Blockchain Land Management System</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {roleMeta && (
            <span className={`role-badge ${authRole}`}>{roleMeta.emoji} {roleMeta.label}</span>
          )}
          <button className="connect-btn" onClick={connectWallet} disabled={loading}>
            {wallet ? (
              <><span className="connect-dot">●</span> {wallet.slice(0, 6)}…{wallet.slice(-4)}</>
            ) : (
              <><span className="metamask-icon">🦊</span> Connect MetaMask</>
            )}
          </button>
          {logout && (
            <button onClick={logout} style={{
              background: "rgba(224,92,92,0.10)", border: "1.5px solid rgba(224,92,92,0.30)",
              color: "#c0392b", padding: "9px 16px", borderRadius: "var(--radius)",
              cursor: "pointer", fontFamily: "var(--sans)", fontSize: "13px", fontWeight: 600,
            }}>🚪 Logout</button>
          )}
        </div>
      </header>

      {/* ── Horizontal Tab Bar ── */}
      <nav className="top-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`top-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Status Bar ── */}
      {status && <div className="status-bar">{status}</div>}

      {/* ── Layout: Sidebar + Main ── */}
      <div className="layout">

        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="sidebar-logo-mark">🏛️</div>
            <div className="sidebar-logo-text">
              Rongai Land
              <small>Kajiado County</small>
            </div>
          </div>

          {roleMeta && (
            <div style={{ padding: "8px 14px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <span className={`role-badge ${authRole}`} style={{ fontSize: "11px" }}>
                {roleMeta.emoji} {roleMeta.label}
              </span>
            </div>
          )}

          <div className="sidebar-section-label">Navigation</div>

          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="nav-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}

          {logout && (
            <button
              onClick={logout}
              className="nav-item"
              style={{ marginTop: "auto", color: "rgba(224,92,92,0.8)", borderLeftColor: "transparent" }}
            >
              <span className="nav-icon">🚪</span>
              <span>Logout</span>
            </button>
          )}
        </aside>

        {/* ── Main Content ── */}
        <main className="main">
          <div className="content">

            {activeTab === "Dashboard" && (
              <DashboardPage
                wallet={wallet} totalParcels={totalParcels} totalTransfers={totalTransfers}
                totalPayments={totalPayments} totalHolders={totalHolders}
                connectWallet={connectWallet} role={authRole}
              />
            )}

            {activeTab === "Register Parcel" && (
              <RegisterParcelPage
                wallet={wallet} loading={loading}
                regForm={regForm} setRegForm={setRegForm}
                registerParcel={registerParcel}
              />
            )}

            {activeTab === "Land Registry" && (
              <LandRegistryPage
                wallet={wallet} loading={loading}
                lookupId={lookupId} setLookupId={setLookupId}
                lookupParcel={lookupParcel} parcelData={parcelData}
              />
            )}

            {/* ── My Parcels — Priority 6 ── */}
            {activeTab === "My Parcels" && (
              <MyParcelsPage
                wallet={wallet}
                landRegistry={landRegistry}
                titleDeed={titleDeedContract}
                role={authRole}
              />
            )}

            {activeTab === "Transfer Land" && (
              <TransferLandPage
                wallet={wallet} loading={loading}
                txForm={txForm} setTxForm={setTxForm}
                initiateTransfer={initiateTransfer}
                landRegistry={landRegistry}
              />
            )}

            {activeTab === "Stamp Duty" && (
              <StampDutyPage
                wallet={wallet} role={authRole}
                loading={loading} setLoading={setLoading}
                dutyValue={dutyValue} setDutyValue={setDutyValue}
                dutyUrban={dutyUrban} setDutyUrban={setDutyUrban}
                calcDuty={calcDuty} dutyResult={dutyResult}
                stampDuty={stampDuty}
              />
            )}

            {activeTab === "Identity" && (
              <IdentityPage
                wallet={wallet} loading={loading}
                idForm={idForm} setIdForm={setIdForm}
                registerIdentity={registerIdentity} idStatus={idStatus}
                idLookup={idLookup} setIdLookup={setIdLookup}
                lookupIdentity={lookupIdentity} verifyIdentity={verifyIdentity}
                idResult={idResult}
              />
            )}

            {activeTab === "Title Deed" && (
              <TitleDeedPage
                wallet={wallet} loading={loading} setLoading={setLoading}
                titleDeed={titleDeedContract} setStatus={setStatus}
                role={authRole}
              />
            )}

            {activeTab === "Tx Certificate" && (
              <TransactionCertificatePage
                wallet={wallet} loading={loading} setLoading={setLoading}
                landTransfer={landTransfer} setStatus={setStatus}
                role={authRole}
              />
            )}

          </div>

          {/* ── Footer ── */}
          <footer className="footer">
            <p>Rongai Blockchain Land Registry Management System — Kajiado County, Kenya © 2026</p>
            <p>Governing Law: Land Registration Act, Cap 300 (Kenya)</p>
          </footer>
        </main>
      </div>
    </div>
  );
}