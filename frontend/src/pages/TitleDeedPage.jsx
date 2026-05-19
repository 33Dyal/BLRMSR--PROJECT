import { useState } from "react";
import { ethers } from "ethers";

/* ── Load script helper ─────────────────────────────────────── */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

/* ── Generate QR code as base64 data URL using qrcode-generator ─ */
async function generateQRDataURL(text) {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js");

  return new Promise((resolve) => {
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(text);
      qr.make();

      // qrcode-generator produces an SVG or table — convert via canvas
      const moduleCount = qr.getModuleCount();
      const cellSize    = 4;
      const size        = moduleCount * cellSize;

      const canvas  = document.createElement("canvas");
      canvas.width  = size;
      canvas.height = size;
      const ctx     = canvas.getContext("2d");

      // White background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);

      // Dark modules
      ctx.fillStyle = "#1a4a2e";
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qr.isDark(row, col)) {
            ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
          }
        }
      }

      resolve(canvas.toDataURL("image/png"));
    } catch (err) {
      console.warn("QR generation failed:", err);
      resolve("");
    }
  });
}

/* ── PDF Generator using jsPDF (loaded dynamically) ─────────── */
async function generateDeedPDF(deed, documentHash) {
  // Load jsPDF
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  if (!window.jspdf) throw new Error("jsPDF failed to load.");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const deedTypeLabel = DEED_TYPES[Number(deed.deedType)] || "Title Deed";
  const issuedDate    = new Date(Number(deed.issuedAt) * 1000).toLocaleString();
  const pageW         = doc.internal.pageSize.getWidth();
  const margin        = 20;
  const contentW      = pageW - margin * 2;

  // ── Border ──
  doc.setDrawColor(26, 74, 46);
  doc.setLineWidth(1.2);
  doc.rect(10, 10, pageW - 20, doc.internal.pageSize.getHeight() - 20);
  doc.setLineWidth(0.4);
  doc.rect(12, 12, pageW - 24, doc.internal.pageSize.getHeight() - 24);

  // ── Header ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(26, 74, 46);
  doc.text("REPUBLIC OF KENYA", pageW / 2, 24, { align: "center" });

  doc.setFontSize(15);
  doc.setTextColor(15, 40, 20);
  doc.text(deedTypeLabel.toUpperCase(), pageW / 2, 33, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text("Land Registration Act, Cap 300 — Rongai Sub-County, Kajiado County", pageW / 2, 40, { align: "center" });

  // ── Divider ──
  doc.setDrawColor(26, 74, 46);
  doc.setLineWidth(0.5);
  doc.line(margin, 44, pageW - margin, 44);

  // ── Fields ──
  const fields = [
    ["Deed ID",         deed.deedId],
    ["Deed Type",       deedTypeLabel],
    ["Parcel ID",       deed.parcelId],
    ["Owner Address",   deed.owner],
    ["Date of Issue",   issuedDate],
    ["Issued By",       deed.issuedBy],
  ];
  if (deed.linkedTxId) fields.push(["Linked Transfer", deed.linkedTxId]);

  let y = 54;
  fields.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(label + ":", margin, y);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 20, 20);
    // Wrap long values
    const lines = doc.splitTextToSize(value || "—", contentW - 50);
    doc.text(lines, margin + 50, y);
    y += (lines.length * 5) + 3;
  });

  // ── Document Hash ──
  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(26, 74, 46);
  doc.text("BLOCKCHAIN VERIFICATION HASH", margin, y);
  y += 5;

  doc.setFont("courier", "normal");
  doc.setFontSize(7);
  doc.setTextColor(60, 60, 60);
  const hashLines = doc.splitTextToSize(documentHash || deed.documentHash || "—", contentW - 45);
  doc.text(hashLines, margin, y);
  y += hashLines.length * 4 + 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text("Verify this deed at: Rongai Land Registry Office or via the blockchain system", margin, y);

  // ── Signature lines ──
  y += 20;
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.4);

  const sig1X = margin;
  const sig2X = margin + (contentW / 2) - 5;
  const sigW  = (contentW / 2) - 15;

  doc.line(sig1X, y, sig1X + sigW, y);
  doc.line(sig2X, y, sig2X + sigW, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  doc.text("Registrar of Lands, Kajiado County", sig1X, y + 4);
  doc.text("Landholder Signature", sig2X, y + 4);

  // ── QR Code — bottom right, below signature lines ──
  const pageH  = doc.internal.pageSize.getHeight();
  const qrSize = 38; // mm
  const qrX    = pageW - margin - qrSize;     // right-aligned
  const qrY    = pageH - margin - qrSize - 14; // above footer

  const qrPayload = [
    "RONGAI-LAND-REGISTRY",
    "DEED:" + deed.deedId,
    "PARCEL:" + deed.parcelId,
    "HASH:" + (documentHash || deed.documentHash || "").slice(0, 20) + "...",
  ].join("|");

  try {
    const qrDataUrl = await generateQRDataURL(qrPayload);
    if (qrDataUrl) {
      // Outer border box
      doc.setDrawColor(26, 74, 46);
      doc.setLineWidth(0.5);
      doc.rect(qrX - 3, qrY - 6, qrSize + 6, qrSize + 14);

      // QR image
      doc.addImage(qrDataUrl, "PNG", qrX, qrY - 4, qrSize, qrSize);

      // Label below QR
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(26, 74, 46);
      doc.text("SCAN TO VERIFY", qrX + qrSize / 2, qrY + qrSize, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(100, 100, 100);
      doc.text("Blockchain verified deed", qrX + qrSize / 2, qrY + qrSize + 4, { align: "center" });
    }
  } catch {
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("[QR unavailable]", qrX, qrY + 10);
  }

  // ── Footer ──
  doc.setDrawColor(26, 74, 46);
  doc.setLineWidth(0.3);
  doc.line(margin, pageH - 19, pageW - margin, pageH - 19);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "This document was generated from an immutable blockchain record. " +
    "Rongai Blockchain Land Registry Management System © 2026",
    pageW / 2, pageH - 14, { align: "center" }
  );

  // ── Save ──
  doc.save(`TitleDeed_${deed.deedId}.pdf`);
}

/* ── Deed type labels ───────────────────────────────────────── */
// DeedType enum: 0 = TitleDeed, 1 = TransferCertificate
const DEED_TYPES = ["Title Deed", "Transfer Certificate"];

/* ── Address helpers ────────────────────────────────────────── */
function isValidAddress(raw) {
  return /^0x[0-9a-fA-F]{40}$/.test((raw || "").trim());
}
function AddrHint({ value }) {
  if (!value || isValidAddress(value)) return null;
  const hexLen = value.startsWith("0x") ? value.slice(2).length : value.length;
  return (
    <span style={{ color:"#e05c5c", fontSize:"11px", marginTop:"3px", display:"block", fontFamily:"monospace" }}>
      ⚠ {hexLen}/40 hex chars — copy directly from MetaMask
    </span>
  );
}
function addrStyle(v) { return v && !isValidAddress(v) ? { borderColor:"#e05c5c" } : {}; }

/* ── Compute document hash in browser ───────────────────────── */
function computeDeedHash(deedId, parcelId, ownerAddress, timestamp) {
  const raw = `${deedId}:${parcelId}:${ownerAddress}:${timestamp}`;
  return ethers.keccak256(ethers.toUtf8Bytes(raw));
}

/* ── Print deed ─────────────────────────────────────────────── */
function printDeed(deed) {
  const deedTypeLabel = DEED_TYPES[Number(deed.deedType)] || "Title Deed";
  const win = window.open("", "_blank");
  win.document.write(`
    <html><head><title>${deedTypeLabel} — ${deed.deedId}</title>
    <style>
      body{font-family:Georgia,serif;padding:48px;max-width:740px;margin:auto;color:#1a2630;}
      h1{text-align:center;font-size:22px;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;}
      .subtitle{text-align:center;font-size:13px;color:#555;margin-bottom:32px;}
      .seal{text-align:center;font-size:48px;margin:16px 0;}
      .border-box{border:3px double #1a4a2e;padding:32px;margin-bottom:24px;}
      table{width:100%;border-collapse:collapse;margin-top:24px;}
      td{padding:10px 14px;border-bottom:1px solid #e0e0e0;font-size:13px;}
      td:first-child{font-weight:700;width:200px;color:#444;}
      .footer{margin-top:48px;text-align:center;font-size:11px;color:#777;border-top:1px solid #ccc;padding-top:16px;}
      .hash{font-family:monospace;font-size:10px;word-break:break-all;color:#777;}
      .watermark{color:#1a4a2e;font-size:11px;text-align:center;letter-spacing:3px;text-transform:uppercase;margin:8px 0;}
      .sig-block{margin-top:48px;display:flex;justify-content:space-between;}
      .sig-line{border-top:1px solid #333;width:180px;text-align:center;padding-top:4px;font-size:10px;color:#555;}
    </style></head><body>
    <div class="border-box">
      <div class="seal">🏛️</div>
      <h1>Republic of Kenya</h1>
      <div class="watermark">Official Land Title Document</div>
      <div class="subtitle">Land Registration Act, Cap 300 — ${deedTypeLabel}<br/>Rongai Sub-County, Kajiado County</div>
      <table>
        <tr><td>Deed ID</td><td><strong>${deed.deedId}</strong></td></tr>
        <tr><td>Deed Type</td><td>${deedTypeLabel}</td></tr>
        <tr><td>Parcel ID</td><td>${deed.parcelId}</td></tr>
        ${deed.linkedTxId ? `<tr><td>Linked Transfer</td><td>${deed.linkedTxId}</td></tr>` : ""}
        <tr><td>Owner Address</td><td class="hash">${deed.owner}</td></tr>
        <tr><td>Issued At</td><td>${new Date(Number(deed.issuedAt)*1000).toLocaleString()}</td></tr>
        <tr><td>Issued By</td><td class="hash">${deed.issuedBy}</td></tr>
        <tr><td>Document Hash</td><td class="hash">${deed.documentHash}</td></tr>
      </table>
      <div class="sig-block">
        <div class="sig-line">Registrar of Lands<br/>Kajiado County</div>
        <div class="sig-line">Landholder Signature</div>
      </div>
    </div>
    <div class="footer">
      This is an immutable blockchain-issued title deed recorded on the Rongai Sub-County Land Registry.<br/>
      Verify authenticity at the Land Registry Office, Kajiado County.<br/>
      Rongai Blockchain Land Registry Management System © 2026
    </div>
    </body></html>
  `);
  win.document.close();
  win.print();
}

/* ══════════════════════════════════════════════════════════════
   TITLE DEED PAGE
   ══════════════════════════════════════════════════════════════ */
export default function TitleDeedPage({ wallet, loading, setLoading, titleDeed, setStatus, role }) {

  /* ── Issue form (officer only) ── */
  const [issueForm, setIssueForm] = useState({
    deedId: "", parcelId: "", linkedTxId: "", owner: "", deedType: "0",
  });
  const [issueResult,  setIssueResult]  = useState(null);

  /* ── Lookup form (all roles) ── */
  const [lookupDeedId, setLookupDeedId] = useState("");
  const [deedData,     setDeedData]     = useState(null);

  /* ── Owner deeds (landholder) ── */
  const [ownerDeeds,   setOwnerDeeds]   = useState([]);
  const [loadingOwner, setLoadingOwner] = useState(false);

  const [localStatus, setLocalStatus] = useState("");

  function st(msg) { setLocalStatus(msg); setStatus(msg); }

  /* ── Issue Deed (officer) ── */
  async function issueDeed() {
    try {
      setLoading(true);
      st("Computing document hash in browser…");

      if (!titleDeed) { st("TitleDeed contract not connected — check addresses.js"); return; }
      if (!isValidAddress(issueForm.owner)) { st("Invalid owner address."); return; }

      const timestamp    = Math.floor(Date.now() / 1000).toString();
      const documentHash = computeDeedHash(issueForm.deedId, issueForm.parcelId, issueForm.owner, timestamp);

      st("Issuing deed on blockchain…");
      const tx = await titleDeed.issueDeed(
        issueForm.deedId,
        issueForm.parcelId,
        issueForm.linkedTxId || "",
        issueForm.owner,
        documentHash,
        parseInt(issueForm.deedType), // 0 = TitleDeed, 1 = TransferCertificate
      );
      await tx.wait();
      st(`✅ Deed ${issueForm.deedId} issued on-chain. TX: ${tx.hash.slice(0,10)}…`);
      setIssueResult({
        deedId:       issueForm.deedId,
        parcelId:     issueForm.parcelId,
        linkedTxId:   issueForm.linkedTxId || "",
        owner:        issueForm.owner,
        deedType:     issueForm.deedType,
        issuedAt:     Math.floor(Date.now() / 1000).toString(),
        issuedBy:     wallet,
        txHash:       tx.hash,
        documentHash,
      });
      setIssueForm({ deedId:"", parcelId:"", linkedTxId:"", owner:"", deedType:"0" });
    } catch (err) {
      st("Error: " + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
  }

  /* ── Lookup Deed (all roles) ── */
  async function lookupDeed() {
    try {
      setLoading(true); setDeedData(null);
      st("Fetching deed from blockchain…");
      if (!titleDeed) { st("TitleDeed contract not connected."); return; }
      const data = await titleDeed.getDeed(lookupDeedId);
      setDeedData(data);
      st("Deed found.");
    } catch (err) {
      setDeedData(null);
      st("Not found: " + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
  }

  /* ── Load My Deeds (landholder) ── */
  async function loadMyDeeds() {
    try {
      setLoadingOwner(true); setOwnerDeeds([]);
      st("Loading your title deeds…");
      if (!titleDeed || !wallet) { st("Wallet not connected."); return; }
      const deedIds = await titleDeed.getDeedsByOwner(wallet);
      if (deedIds.length === 0) { st("No deeds found for your wallet."); return; }
      const deeds = [];
      for (const id of deedIds) {
        try {
          const d = await titleDeed.getDeed(id);
          deeds.push(d);
        } catch {}
      }
      setOwnerDeeds(deeds);
      st(`Found ${deeds.length} deed(s) for your wallet.`);
    } catch (err) {
      st("Error: " + (err.reason || err.message));
    } finally {
      setLoadingOwner(false);
    }
  }

  /* ── Render ── */
  return (
    <div className="form-section">
      <div className="page-header">
        <h2>📜 {role === "officer" ? "Generate Title Deeds" : "My Title Deeds"}</h2>
        <p className="subtitle">
          {role === "officer"
            ? "Issue immutable blockchain title deeds and transfer certificates for verified parcels"
            : "View and print your blockchain-issued title deeds"}
        </p>
      </div>

      {/* ─── ISSUE DEED (officer only) ─── */}
      {role === "officer" && (
        <>
          <h3 className="section-heading">Issue New Title Deed</h3>
          <p style={{ fontSize:"13px", color:"#7a8a9a", marginBottom:"16px" }}>
            A keccak256 hash of the deed details is computed in your browser and stored on-chain.
            The raw deed is generated as a printable PDF — never stored on the blockchain.
          </p>

          <div className="form-grid">
            <label>Deed ID
              <input
                value={issueForm.deedId}
                onChange={e=>setIssueForm({...issueForm,deedId:e.target.value})}
                placeholder="DEED-RONGAI-2026-001"
              />
            </label>
            <label>Parcel ID
              <input
                value={issueForm.parcelId}
                onChange={e=>setIssueForm({...issueForm,parcelId:e.target.value})}
                placeholder="RONGAI/001/2026"
              />
            </label>
            <label>Owner Wallet Address
              <input
                value={issueForm.owner}
                onChange={e=>setIssueForm({...issueForm,owner:e.target.value})}
                placeholder="0x… (42 chars)"
                style={addrStyle(issueForm.owner)}
              />
              <AddrHint value={issueForm.owner} />
            </label>
            <label>Deed Type
              <select value={issueForm.deedType} onChange={e=>setIssueForm({...issueForm,deedType:e.target.value})}>
                <option value="0">Title Deed</option>
                <option value="1">Transfer Certificate</option>
              </select>
            </label>
            <label style={{ gridColumn:"1 / -1" }}>Linked Transfer ID
              <input
                value={issueForm.linkedTxId}
                onChange={e=>setIssueForm({...issueForm,linkedTxId:e.target.value})}
                placeholder="TXN-RNG-2026-00001 (leave blank for initial deeds)"
              />
            </label>
          </div>

          <button
            className="action-btn"
            onClick={issueDeed}
            disabled={loading||!wallet||!issueForm.deedId||!issueForm.parcelId||!isValidAddress(issueForm.owner)}
          >
            {loading ? "Processing…" : "🖋️ Issue Deed on Blockchain"}
          </button>

          {issueResult && (
            <div className="result-card" style={{ marginTop:"16px", borderColor:"rgba(46,204,137,0.3)", background:"rgba(46,204,137,0.04)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"16px" }}>
                <span style={{ fontSize:"32px" }}>✅</span>
                <div>
                  <div style={{ fontWeight:700, color:"#2ecc89", fontSize:"16px" }}>Deed Issued Successfully</div>
                  <div style={{ fontSize:"12px", color:"#7a8a9a", marginTop:"2px" }}>Permanently recorded on the Rongai blockchain</div>
                </div>
              </div>
              <table><tbody>
                <tr><td>Deed ID</td><td style={{ fontWeight:700, color:"var(--accent)" }}>{issueResult.deedId}</td></tr>
                <tr><td>TX Hash</td><td><span className="mono" style={{ fontSize:"11px", wordBreak:"break-all" }}>{issueResult.txHash}</span></td></tr>
                <tr>
                  <td>Document Hash</td>
                  <td><span className="mono" style={{ fontSize:"10px", wordBreak:"break-all" }}>{issueResult.documentHash}</span></td>
                </tr>
              </tbody></table>

              {/* Generate PDF immediately after issuance */}
              <div style={{ marginTop:"16px", padding:"14px", background:"rgba(33,150,243,0.06)", border:"1px solid rgba(33,150,243,0.2)", borderRadius:"8px" }}>
                <div style={{ fontSize:"13px", color:"#2196f3", fontWeight:600, marginBottom:"6px" }}>
                  📄 Generate Official PDF
                </div>
                <div style={{ fontSize:"12px", color:"#7a8a9a", marginBottom:"12px" }}>
                  Download the official title deed as a PDF. The document contains the blockchain verification hash
                  so it can be verified against the on-chain record at any time.
                </div>
                <button
                  onClick={async () => {
                    try {
                      // Build a deed-like object from issueResult for PDF generation
                      const deedObj = {
                        deedId:       issueResult.deedId,
                        parcelId:     issueResult.parcelId,
                        linkedTxId:   issueResult.linkedTxId || "",
                        owner:        issueResult.owner,
                        issuedAt:     issueResult.issuedAt,
                        issuedBy:     issueResult.issuedBy,
                        deedType:     issueResult.deedType,
                        documentHash: issueResult.documentHash,
                      };
                      await generateDeedPDF(deedObj, issueResult.documentHash);
                    } catch(err) {
                      alert("PDF generation failed: " + err.message);
                    }
                  }}
                  className="action-btn"
                  style={{ width:"100%" }}
                >
                  ⬇️ Download Title Deed PDF
                </button>
              </div>

              <p style={{ fontSize:"12px", color:"#7a8a9a", marginTop:"10px" }}>
                You can also search for <strong>{issueResult.deedId}</strong> below to retrieve and print the deed at any time.
              </p>
            </div>
          )}

          <hr style={{ margin:"2rem 0", borderColor:"rgba(255,255,255,0.07)" }} />
        </>
      )}

      {/* ─── MY DEEDS (landholder only) ─── */}
      {role === "landholder" && (
        <>
          <h3 className="section-heading">My Registered Deeds</h3>
          <p style={{ fontSize:"13px", color:"#7a8a9a", marginBottom:"16px" }}>
            View all title deeds registered to your connected wallet address.
          </p>
          <button
            className="action-btn"
            onClick={loadMyDeeds}
            disabled={loadingOwner||!wallet}
            style={{ marginBottom:"16px" }}
          >
            {loadingOwner ? "Loading…" : "🔍 Load My Deeds"}
          </button>

          {ownerDeeds.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:"12px", marginBottom:"24px" }}>
              {ownerDeeds.map((deed, i) => (
                <div key={i} className="result-card" style={{ borderColor:"rgba(46,204,137,0.2)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
                    <div>
                      <div style={{ fontWeight:700, color:"var(--accent)", fontSize:"14px" }}>{deed.deedId}</div>
                      <div style={{ fontSize:"12px", color:"#7a8a9a", marginTop:"2px" }}>
                        {DEED_TYPES[Number(deed.deedType)]} · Parcel: {deed.parcelId}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:"6px" }}>
                      <button
                        className="action-btn"
                        onClick={() => printDeed(deed)}
                        style={{ padding:"6px 12px", fontSize:"12px" }}
                      >
                        🖨️ Print
                      </button>
                      <button
                        className="action-btn"
                        onClick={async () => {
                          try { await generateDeedPDF(deed, deed.documentHash); }
                          catch(err) { alert("PDF failed: " + err.message); }
                        }}
                        style={{
                          padding:"6px 12px", fontSize:"12px",
                          background:"linear-gradient(135deg,#0d2b6e,#1a4aad)",
                        }}
                      >
                        ⬇️ PDF
                      </button>
                    </div>
                  </div>
                  <table><tbody>
                    <tr><td>Issued At</td><td>{new Date(Number(deed.issuedAt)*1000).toLocaleString()}</td></tr>
                    <tr><td>Issued By</td><td><span className="mono" style={{ fontSize:"11px" }}>{deed.issuedBy}</span></td></tr>
                    {deed.linkedTxId && <tr><td>Transfer ID</td><td>{deed.linkedTxId}</td></tr>}
                  </tbody></table>
                </div>
              ))}
            </div>
          )}

          <hr style={{ margin:"2rem 0", borderColor:"rgba(255,255,255,0.07)" }} />
        </>
      )}

      {/* ─── READ-ONLY notice for public ─── */}
      {role === "public" && (
        <div className="result-card" style={{ marginBottom:"24px", borderColor:"rgba(201,152,42,0.3)" }}>
          <p style={{ color:"#c9982a", margin:0, fontSize:"13px" }}>
            🔒 Deed issuance is restricted to Registry Officers. You can search and verify existing deeds below.
          </p>
        </div>
      )}

      {/* ─── LOOKUP (all roles) ─── */}
      <h3 className="section-heading">Look Up / Verify a Deed</h3>
      <p style={{ fontSize:"13px", color:"#7a8a9a", marginBottom:"16px" }}>
        Search any deed by its Deed ID to view details and print the certificate.
      </p>
      <div className="search-row">
        <input
          value={lookupDeedId}
          onChange={e=>setLookupDeedId(e.target.value)}
          placeholder="e.g. DEED-RONGAI-2026-001"
        />
        <button className="action-btn" onClick={lookupDeed} disabled={loading||!wallet||!lookupDeedId}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {localStatus && (
        <p style={{ fontSize:"13px", color:"#7a8a9a", margin:"10px 0 0" }}>{localStatus}</p>
      )}

      {/* ─── DEED RESULT ─── */}
      {deedData && (
        <div className="result-card" style={{ marginTop:"18px" }}>
          <div style={{
            textAlign:"center", padding:"16px 0 12px",
            borderBottom:"1px solid rgba(255,255,255,0.07)", marginBottom:"16px",
          }}>
            <div style={{ fontSize:"36px", marginBottom:"6px" }}>📜</div>
            <div style={{ fontWeight:700, fontSize:"16px", color:"var(--accent)" }}>
              {DEED_TYPES[Number(deedData.deedType)] || "Title Deed"}
            </div>
            <div style={{ fontSize:"12px", color:"#7a8a9a", marginTop:"2px" }}>
              Republic of Kenya · Land Registration Act, Cap 300
            </div>
          </div>

          <table><tbody>
            <tr><td>Deed ID</td><td style={{ fontWeight:700, color:"var(--accent)" }}>{deedData.deedId}</td></tr>
            <tr><td>Deed Type</td><td>{DEED_TYPES[Number(deedData.deedType)]}</td></tr>
            <tr><td>Parcel ID</td><td>{deedData.parcelId}</td></tr>
            {deedData.linkedTxId && <tr><td>Linked Transfer</td><td>{deedData.linkedTxId}</td></tr>}
            <tr><td>Owner</td><td><span className="mono" style={{ fontSize:"12px" }}>{deedData.owner}</span></td></tr>
            <tr><td>Issued At</td><td>{new Date(Number(deedData.issuedAt)*1000).toLocaleString()}</td></tr>
            <tr><td>Issued By</td><td><span className="mono" style={{ fontSize:"12px" }}>{deedData.issuedBy}</span></td></tr>
            <tr>
              <td>Document Hash</td>
              <td><span className="mono" style={{ fontSize:"10px", wordBreak:"break-all" }}>{deedData.documentHash}</span></td>
            </tr>
          </tbody></table>

          <div style={{ display:"flex", gap:"10px", marginTop:"18px", flexWrap:"wrap" }}>
            <button
              className="action-btn"
              onClick={() => printDeed(deedData)}
              style={{ flex:1, minWidth:"140px" }}
            >
              🖨️ Print Certificate
            </button>
            <button
              className="action-btn"
              onClick={async () => {
                try {
                  await generateDeedPDF(deedData, deedData.documentHash);
                } catch(err) {
                  alert("PDF generation failed: " + err.message);
                }
              }}
              style={{
                flex:1, minWidth:"140px",
                background:"linear-gradient(135deg,#0d2b6e,#1a4aad)",
                boxShadow:"0 3px 12px rgba(33,150,243,0.25)",
              }}
            >
              ⬇️ Download PDF
            </button>
          </div>
        </div>
      )}

      {/* ─── No contract warning ─── */}
      {!titleDeed && wallet && (
        <div className="result-card" style={{ marginTop:"20px", borderColor:"rgba(240,192,80,0.3)" }}>
          <p style={{ color:"#f0c050", margin:0, fontSize:"13px" }}>
            ⚠️ TitleDeed contract not initialised. Check <code>CONTRACT_ADDRESSES.TitleDeed</code> in <code>contracts/addresses.js</code>.
          </p>
        </div>
      )}
    </div>
  );
}