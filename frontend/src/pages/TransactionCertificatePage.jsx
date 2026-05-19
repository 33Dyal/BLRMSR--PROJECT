import { useState } from "react";

/* ── Status helpers ─────────────────────────────────────────── */
// 0=Pending, 1=UnderReview, 2=Approved, 3=Rejected, 4=Completed
function statusLabel(s) {
  const map = { 0:"Pending", 1:"Under Review", 2:"Approved", 3:"Rejected", 4:"Completed" };
  return map[Number(s)] ?? s?.toString() ?? "—";
}
function statusColor(s) {
  const n = Number(s);
  if (n === 4) return "#2ecc89";
  if (n === 2) return "#2196f3";
  if (n === 3) return "#e05c5c";
  if (n === 1) return "#9c27b0";
  return "#c9982a";
}
function statusIcon(s) {
  const map = { 0:"⏳", 1:"🔍", 2:"✅", 3:"❌", 4:"🏁" };
  return map[Number(s)] ?? "•";
}

/* ── Print certificate ──────────────────────────────────────── */
function printCertificate(tx) {
  const win = window.open("", "_blank");
  win.document.write(`
    <html><head><title>Transaction Certificate — ${tx.transferId}</title>
    <style>
      body{font-family:Georgia,serif;padding:48px;max-width:740px;margin:auto;color:#1a2630;}
      h1{text-align:center;font-size:20px;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;}
      .subtitle{text-align:center;font-size:12px;color:#555;margin-bottom:28px;}
      .seal{text-align:center;font-size:44px;margin:12px 0;}
      .border-box{border:3px double #1a4a2e;padding:28px;}
      table{width:100%;border-collapse:collapse;margin-top:18px;}
      td{padding:9px 14px;border-bottom:1px solid #e8e8e8;font-size:12px;}
      td:first-child{font-weight:700;width:200px;color:#444;}
      .footer{margin-top:40px;text-align:center;font-size:10px;color:#777;border-top:1px solid #ccc;padding-top:14px;}
      .hash{font-family:monospace;font-size:9px;word-break:break-all;color:#666;}
      .watermark{color:#1a4a2e;font-size:10px;text-align:center;letter-spacing:3px;text-transform:uppercase;margin:6px 0;}
      .sig-block{margin-top:48px;display:flex;justify-content:space-between;}
      .sig-line{border-top:1px solid #333;width:180px;text-align:center;padding-top:4px;font-size:10px;color:#555;}
    </style></head><body>
    <div class="border-box">
      <div class="seal">🧾</div>
      <h1>Republic of Kenya</h1>
      <div class="watermark">Land Transfer Certificate</div>
      <div class="subtitle">Land Registration Act, Cap 300 — Official Transaction Certificate<br/>Rongai Sub-County, Kajiado County</div>
      <table>
        <tr><td>Transfer ID</td><td><strong>${tx.transferId}</strong></td></tr>
        <tr><td>Parcel ID</td><td>${tx.parcelId}</td></tr>
        <tr><td>Transfer Type</td><td>${tx.transferType}</td></tr>
        <tr><td>Seller Address</td><td class="hash">${tx.seller}</td></tr>
        <tr><td>Seller DID</td><td>${tx.sellerDID||"—"}</td></tr>
        <tr><td>Buyer Address</td><td class="hash">${tx.buyer}</td></tr>
        <tr><td>Buyer DID</td><td>${tx.buyerDID||"—"}</td></tr>
        <tr><td>Agreed Price</td><td>KES ${parseInt(tx.agreedPriceKES?.toString()||"0").toLocaleString()}</td></tr>
        <tr><td>Status</td><td>${statusLabel(tx.status)}</td></tr>
        <tr><td>Submitted</td><td>${new Date(Number(tx.requestTimestamp)*1000).toLocaleString()}</td></tr>
        ${tx.completedAt&&Number(tx.completedAt)>0?`<tr><td>Completed</td><td>${new Date(Number(tx.completedAt)*1000).toLocaleString()}</td></tr>`:""}
        ${tx.rejectionReason?`<tr><td>Rejection Reason</td><td>${tx.rejectionReason}</td></tr>`:""}
        <tr><td>IPFS Document</td><td class="hash">${tx.ipfsDocHash||"—"}</td></tr>
      </table>
      <div class="sig-block">
        <div class="sig-line">Registrar of Lands<br/>Kajiado County</div>
        <div class="sig-line">Seller Signature</div>
        <div class="sig-line">Buyer Signature</div>
      </div>
    </div>
    <div class="footer">This certificate was generated from an immutable blockchain record.<br/>Rongai Blockchain Land Registry Management System · Kajiado County, Kenya © 2026</div>
    </body></html>
  `);
  win.document.close(); win.print();
}

/* ══════════════════════════════════════════════════════════════
   TRANSACTION CERTIFICATE PAGE
   ══════════════════════════════════════════════════════════════ */
export default function TransactionCertificatePage({ wallet, loading, setLoading, landTransfer, setStatus, role }) {
  const [lookupId,      setLookupId]      = useState("");
  const [txData,        setTxData]        = useState(null);
  const [localStatus,   setLocalStatus]   = useState("");
  const [rejectReason,  setRejectReason]  = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);

  function st(msg) { setLocalStatus(msg); setStatus(msg); }

  async function lookupTransfer() {
    try {
      setLoading(true); setTxData(null); setShowRejectBox(false);
      st("Fetching transfer record from blockchain…");
      if (!landTransfer) { st("LandTransfer contract not connected."); return; }
      const data = await landTransfer.getTransfer(lookupId);
      setTxData(data); st("Transfer record found.");
    } catch(err) { setTxData(null); st("Not found: "+(err.reason||err.message)); }
    finally { setLoading(false); }
  }

  async function approveAndComplete() {
    if (!window.confirm(`Approve and complete transfer ${lookupId}?`)) return;
    try {
      setLoading(true); st("Approving and completing transfer…");
      const tx = await landTransfer.approveAndComplete(lookupId);
      await tx.wait(); st(`✅ Transfer ${lookupId} completed. TX: ${tx.hash.slice(0,10)}…`);
      await lookupTransfer();
    } catch(err) { st("Error: "+(err.reason||err.message)); }
    finally { setLoading(false); }
  }

  async function setUnderReview() {
    try {
      setLoading(true); st("Setting to Under Review…");
      const tx = await landTransfer.setUnderReview(lookupId);
      await tx.wait(); st(`Transfer ${lookupId} is now Under Review.`);
      await lookupTransfer();
    } catch(err) { st("Error: "+(err.reason||err.message)); }
    finally { setLoading(false); }
  }

  async function rejectTransfer() {
    if (!rejectReason.trim()) { st("Please enter a rejection reason."); return; }
    if (!window.confirm(`Reject transfer ${lookupId}?`)) return;
    try {
      setLoading(true); st("Rejecting transfer…");
      const tx = await landTransfer.rejectTransfer(lookupId, rejectReason);
      await tx.wait(); st(`Transfer ${lookupId} rejected.`);
      setShowRejectBox(false); setRejectReason(""); await lookupTransfer();
    } catch(err) { st("Error: "+(err.reason||err.message)); }
    finally { setLoading(false); }
  }

  const isPending   = txData && (Number(txData.status)===0||Number(txData.status)===1);
  const isApproved  = txData && Number(txData.status)===2;
  const isCompleted = txData && Number(txData.status)===4;
  const isRejected  = txData && Number(txData.status)===3;

  return (
    <div className="form-section">
      <div className="page-header">
        <h2>🧾 {role==="officer" ? "Approve Transfers & Certificates" : "Transaction Certificates"}</h2>
        <p className="subtitle">
          {role==="officer"
            ? "Look up transfer requests, approve or reject them, and print official certificates"
            : "Look up land transfer records and print official transaction certificates"}
        </p>
      </div>

      <h3 className="section-heading">Look Up Transfer Record</h3>
      <div className="search-row">
        <input value={lookupId} onChange={e=>setLookupId(e.target.value)} placeholder="e.g. TXN-RNG-2026-00001"/>
        <button className="action-btn" onClick={lookupTransfer} disabled={loading||!wallet||!lookupId}>
          {loading?"Searching…":"Search"}
        </button>
      </div>

      {localStatus && <p style={{fontSize:"13px",color:"#7a8a9a",margin:"10px 0 0"}}>{localStatus}</p>}

      {txData && (
        <div className="result-card" style={{marginTop:"20px"}}>
          <div style={{textAlign:"center",padding:"16px 0 12px",borderBottom:"1px solid rgba(255,255,255,0.07)",marginBottom:"16px"}}>
            <div style={{fontSize:"32px",marginBottom:"6px"}}>🧾</div>
            <div style={{fontWeight:700,fontSize:"16px",color:"var(--accent)"}}>Land Transfer Certificate</div>
            <div style={{fontSize:"12px",color:"#7a8a9a",marginTop:"2px"}}>Republic of Kenya · Land Registration Act, Cap 300</div>
          </div>

          {/* Status banner */}
          <div style={{
            display:"flex",alignItems:"center",gap:"10px",
            padding:"10px 16px",borderRadius:"8px",marginBottom:"16px",
            background:isCompleted?"rgba(46,204,137,0.08)":isRejected?"rgba(224,92,92,0.08)":isApproved?"rgba(33,150,243,0.08)":"rgba(201,152,42,0.08)",
            border:`1px solid ${statusColor(txData.status)}40`,
          }}>
            <span style={{fontSize:"20px"}}>{statusIcon(txData.status)}</span>
            <div>
              <div style={{color:statusColor(txData.status),fontWeight:700,fontSize:"14px"}}>{statusLabel(txData.status)}</div>
              <div style={{fontSize:"11px",color:"#7a8a9a"}}>
                {isCompleted&&"Ownership has been transferred on-chain"}
                {isRejected&&`Reason: ${txData.rejectionReason||"—"}`}
                {isApproved&&"Approved — awaiting completion"}
                {isPending&&"Awaiting Registry Officer review"}
              </div>
            </div>
          </div>

          <table><tbody>
            <tr><td>Transfer ID</td><td style={{fontWeight:700,color:"var(--accent)"}}>{txData.transferId}</td></tr>
            <tr><td>Parcel ID</td><td>{txData.parcelId}</td></tr>
            <tr><td>Transfer Type</td><td>{txData.transferType}</td></tr>
            <tr><td>Seller</td><td><span className="mono" style={{fontSize:"12px"}}>{txData.seller}</span></td></tr>
            <tr><td>Seller DID</td><td style={{fontSize:"12px"}}>{txData.sellerDID||"—"}</td></tr>
            <tr><td>Buyer</td><td><span className="mono" style={{fontSize:"12px"}}>{txData.buyer}</span></td></tr>
            <tr><td>Buyer DID</td><td style={{fontSize:"12px"}}>{txData.buyerDID||"—"}</td></tr>
            <tr><td>Agreed Price</td><td>KES {parseInt(txData.agreedPriceKES?.toString()||"0").toLocaleString()}</td></tr>
            <tr><td>Submitted</td><td>{new Date(Number(txData.requestTimestamp)*1000).toLocaleString()}</td></tr>
            {txData.completedAt&&Number(txData.completedAt)>0&&(
              <tr><td>Completed</td><td>{new Date(Number(txData.completedAt)*1000).toLocaleString()}</td></tr>
            )}
            {txData.ipfsDocHash&&(
              <tr><td>IPFS Doc</td><td><span className="mono" style={{fontSize:"10px",wordBreak:"break-all"}}>{txData.ipfsDocHash}</span></td></tr>
            )}
          </tbody></table>

          <div style={{display:"flex",gap:"10px",marginTop:"18px",flexWrap:"wrap"}}>
            <button className="action-btn" onClick={()=>printCertificate(txData)} style={{flex:1,minWidth:"140px"}}>
              🖨️ Print Certificate
            </button>
            {role==="officer"&&isPending&&(
              <>
                <button onClick={approveAndComplete} disabled={loading} style={{
                  flex:1,minWidth:"140px",padding:"10px 18px",borderRadius:"var(--radius)",
                  background:"linear-gradient(135deg,#0b3a20,#1a5c35)",border:"1.5px solid rgba(46,204,137,0.35)",
                  color:"#2ecc89",fontWeight:700,cursor:"pointer",fontSize:"13px",boxShadow:"0 3px 12px rgba(46,204,137,0.2)",
                }}>✅ Approve & Complete</button>
                <button onClick={setUnderReview} disabled={loading} style={{
                  flex:1,minWidth:"140px",padding:"10px 18px",borderRadius:"var(--radius)",
                  background:"rgba(156,39,176,0.12)",border:"1.5px solid rgba(156,39,176,0.3)",
                  color:"#9c27b0",fontWeight:700,cursor:"pointer",fontSize:"13px",
                }}>🔍 Set Under Review</button>
                <button onClick={()=>setShowRejectBox(!showRejectBox)} disabled={loading} style={{
                  flex:1,minWidth:"140px",padding:"10px 18px",borderRadius:"var(--radius)",
                  background:"rgba(224,92,92,0.12)",border:"1.5px solid rgba(224,92,92,0.3)",
                  color:"#e05c5c",fontWeight:700,cursor:"pointer",fontSize:"13px",
                }}>❌ Reject</button>
              </>
            )}
            {role==="officer"&&isApproved&&(
              <button onClick={async()=>{
                try{setLoading(true);st("Completing transfer…");const tx=await landTransfer.completeTransfer(lookupId);await tx.wait();st(`Completed.`);await lookupTransfer();}
                catch(err){st("Error: "+(err.reason||err.message));}finally{setLoading(false);}
              }} disabled={loading} style={{
                flex:1,minWidth:"140px",padding:"10px 18px",borderRadius:"var(--radius)",
                background:"linear-gradient(135deg,#0b3a20,#1a5c35)",border:"1.5px solid rgba(46,204,137,0.35)",
                color:"#2ecc89",fontWeight:700,cursor:"pointer",fontSize:"13px",
              }}>🏁 Complete Transfer</button>
            )}
          </div>

          {showRejectBox&&role==="officer"&&(
            <div style={{marginTop:"14px"}}>
              <label style={{fontSize:"13px",color:"var(--text-light)",display:"block",marginBottom:"6px"}}>Rejection Reason (required)</label>
              <div style={{display:"flex",gap:"8px"}}>
                <input value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="e.g. Incomplete documentation…" style={{flex:1}}/>
                <button onClick={rejectTransfer} disabled={loading||!rejectReason.trim()} style={{
                  padding:"10px 16px",borderRadius:"var(--radius)",
                  background:"rgba(224,92,92,0.15)",border:"1.5px solid rgba(224,92,92,0.4)",
                  color:"#e05c5c",fontWeight:700,cursor:"pointer",fontSize:"13px",
                }}>Confirm Reject</button>
              </div>
            </div>
          )}
          {role!=="officer"&&isPending&&(
            <p style={{fontSize:"12px",color:"#7a8a9a",marginTop:"12px"}}>ℹ️ This transfer is pending review by a Registry Officer.</p>
          )}
        </div>
      )}

      {!landTransfer&&wallet&&(
        <div className="result-card" style={{marginTop:"20px",borderColor:"rgba(240,192,80,0.3)"}}>
          <p style={{color:"#f0c050",margin:0,fontSize:"13px"}}>⚠️ LandTransfer contract not connected.</p>
        </div>
      )}

      {/* Status Guide */}
      <div style={{marginTop:"2rem"}}>
        <h3 className="section-heading">Transfer Status Guide</h3>
        <div className="result-card" style={{padding:"16px 20px"}}>
          <table><thead><tr>
            <th style={{textAlign:"left",padding:"6px 14px",color:"#7a8a9a",fontWeight:600,fontSize:"12px"}}>Status</th>
            <th style={{textAlign:"left",padding:"6px 14px",color:"#7a8a9a",fontWeight:600,fontSize:"12px"}}>Meaning</th>
            <th style={{textAlign:"left",padding:"6px 14px",color:"#7a8a9a",fontWeight:600,fontSize:"12px"}}>Next Action</th>
          </tr></thead><tbody>
            {[
              {s:"⏳ Pending",c:"#c9982a",m:"Submitted, awaiting review",n:"Officer reviews documents"},
              {s:"🔍 Under Review",c:"#9c27b0",m:"Officer is actively reviewing",n:"Officer approves or rejects"},
              {s:"✅ Approved",c:"#2196f3",m:"Approved, awaiting finalisation",n:"Officer completes transfer"},
              {s:"🏁 Completed",c:"#2ecc89",m:"Ownership transferred on-chain",n:"Print certificate, generate Title Deed"},
              {s:"❌ Rejected",c:"#e05c5c",m:"Transfer was rejected",n:"Review reason, submit new transfer"},
            ].map(r=>(
              <tr key={r.s}>
                <td style={{padding:"8px 14px",color:r.c,fontWeight:700}}>{r.s}</td>
                <td style={{padding:"8px 14px",fontSize:"13px"}}>{r.m}</td>
                <td style={{padding:"8px 14px",fontSize:"13px",color:"#7a8a9a"}}>{r.n}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}