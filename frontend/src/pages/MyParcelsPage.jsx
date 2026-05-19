import { useState, useEffect, useCallback } from "react";

/* ── helpers ────────────────────────────────────────────────── */
function shortAddr(a) {
  if (!a) return "—";
  return a.slice(0, 6) + "…" + a.slice(-4);
}
function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(Number(ts) * 1000).toLocaleDateString("en-KE", {
    day: "2-digit", month: "short", year: "numeric",
  });
}
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      title="Copy"
      style={{ background: "none", border: "none", cursor: "pointer",
        color: copied ? "#2ecc89" : "#9aabb8", fontSize: "13px", padding: "0 3px" }}
    >
      {copied ? "✓" : "⎘"}
    </button>
  );
}

/* ── Parcel card ────────────────────────────────────────────── */
function ParcelCard({ parcel, deeds }) {
  const [expanded, setExpanded] = useState(false);
  const matchingDeeds = deeds.filter(
    d => d.parcelId?.toLowerCase() === parcel.parcelId?.toLowerCase()
  );

  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid #dde3ea",
      borderRadius: "14px",
      overflow: "hidden",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      transition: "box-shadow 0.18s",
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.10)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"}
    >
      {/* Card header */}
      <div style={{
        background: "linear-gradient(135deg, #0b3a20 0%, #1a5c35 100%)",
        padding: "14px 18px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.50)",
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>
            Parcel ID
          </div>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "#ffffff", fontFamily: "var(--mono, monospace)" }}>
            {parcel.parcelId || "—"}
          </div>
        </div>
        <span style={{
          background: parcel.isActive ? "rgba(46,204,137,0.20)" : "rgba(224,92,92,0.20)",
          border: `1px solid ${parcel.isActive ? "rgba(46,204,137,0.40)" : "rgba(224,92,92,0.40)"}`,
          color: parcel.isActive ? "#2ecc89" : "#e05c5c",
          borderRadius: "20px", padding: "3px 12px",
          fontSize: "11px", fontWeight: 700,
        }}>
          {parcel.isActive ? "✅ Active" : "⛔ Inactive"}
        </span>
      </div>

      {/* Card body */}
      <div style={{ padding: "16px 18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
          {[
            { label: "Title Deed No.", value: parcel.titleDeedNumber || "—" },
            { label: "LR Number",      value: parcel.lrNumber || "—" },
            { label: "Land Use",       value: parcel.landUse || "—" },
            { label: "Area",           value: parcel.areaSquareMeters ? `${parcel.areaSquareMeters.toString()} sq.m` : "—" },
            { label: "Value (KES)",    value: parcel.landValueKES ? `KES ${Number(parcel.landValueKES).toLocaleString()}` : "—" },
            { label: "Registered",     value: fmtDate(parcel.registeredAt) },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#9aabb8",
                textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>
                {label}
              </div>
              <div style={{ fontSize: "13px", color: "#1a2633", fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Owner DID */}
        {parcel.ownerDID && (
          <div style={{ marginTop: "12px", padding: "8px 10px",
            background: "rgba(46,204,137,0.05)", borderRadius: "6px",
            border: "1px solid rgba(46,204,137,0.15)" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#9aabb8",
              textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>
              Owner DID
            </div>
            <div style={{ fontSize: "11px", fontFamily: "var(--mono, monospace)",
              color: "#1a5c35", wordBreak: "break-all" }}>
              {parcel.ownerDID}
            </div>
          </div>
        )}

        {/* Linked deeds toggle */}
        {matchingDeeds.length > 0 && (
          <button
            onClick={() => setExpanded(x => !x)}
            style={{
              marginTop: "12px", width: "100%",
              background: expanded ? "rgba(46,204,137,0.08)" : "rgba(0,0,0,0.03)",
              border: "1px solid rgba(46,204,137,0.20)",
              borderRadius: "8px", padding: "8px 14px",
              color: "#1a5c35", fontSize: "12px", fontWeight: 600,
              cursor: "pointer", textAlign: "left",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}
          >
            <span>📜 {matchingDeeds.length} Title Deed{matchingDeeds.length > 1 ? "s" : ""} linked</span>
            <span>{expanded ? "▲" : "▼"}</span>
          </button>
        )}

        {/* Expanded deeds */}
        {expanded && matchingDeeds.map((deed, i) => (
          <div key={i} style={{
            marginTop: "8px", padding: "12px 14px",
            background: "#f9fbfc", borderRadius: "8px",
            border: "1px solid #dde3ea", fontSize: "12px",
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
              {[
                { label: "Deed ID",   value: deed.deedId },
                { label: "Issued",    value: fmtDate(deed.issuedAt) },
                { label: "Issued By", value: shortAddr(deed.issuedBy) },
                { label: "Valid",     value: deed.isValid ? "✅ Yes" : "⛔ No" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "#9aabb8",
                    textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                  <div style={{ color: "#1a2633", fontWeight: 500 }}>{value || "—"}</div>
                </div>
              ))}
            </div>
            {deed.documentHash && (
              <div style={{ marginTop: "6px" }}>
                <span style={{ fontSize: "9px", fontWeight: 700, color: "#9aabb8",
                  textTransform: "uppercase", letterSpacing: "0.06em" }}>Doc Hash </span>
                <span style={{ fontFamily: "var(--mono, monospace)", fontSize: "10px",
                  color: "#5a6a7a", wordBreak: "break-all" }}>
                  {deed.documentHash}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MY PARCELS PAGE
   ══════════════════════════════════════════════════════════════ */
export default function MyParcelsPage({ wallet, landRegistry, titleDeed, role }) {
  const [parcels,     setParcels]     = useState([]);
  const [deeds,       setDeeds]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [loaded,      setLoaded]      = useState(false);
  const [error,       setError]       = useState("");
  const [activeView,  setActiveView]  = useState("parcels"); // "parcels" | "deeds"
  const [searchTerm,  setSearchTerm]  = useState("");

  const load = useCallback(async () => {
    if (!wallet || !landRegistry) {
      setError("Connect your wallet to view your parcels.");
      return;
    }
    try {
      setLoading(true);
      setError("");

      /* ── Fetch parcel IDs owned by this wallet ── */
      const parcelIds = await landRegistry.getParcelsByOwner(wallet);
      const parcelDetails = await Promise.all(
        parcelIds.map(id => landRegistry.getParcel(id).catch(() => null))
      );
      setParcels(parcelDetails.filter(Boolean));

      /* ── Fetch title deeds owned by this wallet ── */
      if (titleDeed) {
        try {
          const deedIds = await titleDeed.getDeedsByOwner(wallet);
          const deedDetails = await Promise.all(
            deedIds.map(id => titleDeed.getDeed(id).catch(() => null))
          );
          setDeeds(deedDetails.filter(Boolean));
        } catch {
          setDeeds([]);
        }
      }

      setLoaded(true);
    } catch (e) {
      setError("Error loading data: " + (e.reason || e.message));
    } finally {
      setLoading(false);
    }
  }, [wallet, landRegistry, titleDeed]);

  useEffect(() => { load(); }, [load]);

  /* ── Filter by search ── */
  const filteredParcels = parcels.filter(p =>
    !searchTerm ||
    p.parcelId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.landUse?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.lrNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredDeeds = deeds.filter(d =>
    !searchTerm ||
    d.deedId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.parcelId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  /* ── Not connected ── */
  if (!wallet) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "60px 20px", textAlign: "center", gap: "16px" }}>
        <span style={{ fontSize: "48px" }}>🦊</span>
        <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f1e2d" }}>Connect your wallet</div>
        <div style={{ fontSize: "14px", color: "#7a8a9a", maxWidth: "340px" }}>
          Connect MetaMask to view your registered land parcels and title deeds.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Page header ── */}
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ fontFamily: "var(--serif, serif)", fontSize: "22px",
          fontWeight: 700, color: "#0f1e2d", marginBottom: "4px" }}>
          My Land Portfolio
        </h2>
        <p style={{ fontSize: "13px", color: "#7a8a9a" }}>
          All parcels and title deeds registered to wallet{" "}
          <span style={{ fontFamily: "var(--mono, monospace)", color: "#1a5c35" }}>
            {wallet.slice(0, 6)}…{wallet.slice(-4)}
          </span>
          <CopyBtn text={wallet} />
        </p>
      </div>

      {/* ── Summary stat bar ── */}
      {loaded && (
        <div style={{ display: "flex", gap: "14px", marginBottom: "22px", flexWrap: "wrap" }}>
          {[
            { icon: "🏡", value: parcels.length,                        label: "Total Parcels",  color: "#2196f3" },
            { icon: "✅", value: parcels.filter(p => p.isActive).length, label: "Active",         color: "#2ecc89" },
            { icon: "📜", value: deeds.length,                           label: "Title Deeds",    color: "#c9982a" },
            { icon: "⛔", value: parcels.filter(p => !p.isActive).length,label: "Inactive",       color: "#e05c5c" },
          ].map(({ icon, value, label, color }) => (
            <div key={label} style={{
              flex: "1 1 120px",
              background: "#ffffff", border: "1px solid #dde3ea",
              borderRadius: "12px", padding: "14px 16px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              display: "flex", alignItems: "center", gap: "10px",
            }}>
              <span style={{ fontSize: "22px" }}>{icon}</span>
              <div>
                <div style={{ fontSize: "22px", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: "11px", color: "#9aabb8", marginTop: "2px" }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Controls row ── */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "18px", flexWrap: "wrap", alignItems: "center" }}>
        {/* View toggle */}
        <div style={{ display: "flex", background: "#f0f3f6", borderRadius: "8px", padding: "3px", gap: "2px" }}>
          {["parcels", "deeds"].map(v => (
            <button key={v} onClick={() => setActiveView(v)} style={{
              padding: "6px 16px", borderRadius: "6px", border: "none", cursor: "pointer",
              fontSize: "13px", fontWeight: 600, fontFamily: "var(--sans, sans-serif)",
              background: activeView === v ? "#ffffff" : "transparent",
              color: activeView === v ? "#0f1e2d" : "#7a8a9a",
              boxShadow: activeView === v ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
              transition: "all 0.15s",
            }}>
              {v === "parcels" ? `🏡 Parcels (${parcels.length})` : `📜 Deeds (${deeds.length})`}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search by parcel ID, land use, LR number…"
          style={{
            flex: 1, minWidth: "200px",
            padding: "9px 14px", borderRadius: "8px",
            border: "1.5px solid #dde3ea", fontSize: "13px",
            fontFamily: "var(--sans, sans-serif)", color: "#1a2633",
            background: "#f9fbfc", outline: "none",
          }}
          onFocus={e => e.target.style.borderColor = "#2ecc89"}
          onBlur={e => e.target.style.borderColor = "#dde3ea"}
        />

        {/* Refresh */}
        <button onClick={load} disabled={loading} style={{
          background: "linear-gradient(135deg, #0b3a20, #1a5c35)",
          color: "#ffffff", border: "none", borderRadius: "8px",
          padding: "9px 18px", fontSize: "13px", fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
          fontFamily: "var(--sans, sans-serif)",
          boxShadow: "0 3px 10px rgba(46,204,137,0.25)",
        }}>
          {loading ? "⏳ Loading…" : "⟳ Refresh"}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ background: "rgba(224,92,92,0.08)", border: "1.5px solid rgba(224,92,92,0.25)",
          borderRadius: "10px", padding: "14px 18px", color: "#c0392b",
          fontSize: "13px", marginBottom: "16px" }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && !loaded && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ background: "#f0f3f6", borderRadius: "14px", height: "220px",
              animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      )}

      {/* ── Parcels grid ── */}
      {!loading && activeView === "parcels" && (
        <>
          {filteredParcels.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "#9aabb8" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>🏞️</div>
              <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "6px", color: "#5a6a7a" }}>
                {searchTerm ? "No parcels match your search" : "No parcels registered yet"}
              </div>
              <div style={{ fontSize: "13px" }}>
                {searchTerm
                  ? "Try a different search term."
                  : "Register a parcel in the Register Parcel tab to get started."}
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
              {filteredParcels.map((p, i) => (
                <ParcelCard key={i} parcel={p} deeds={deeds} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Deeds list ── */}
      {!loading && activeView === "deeds" && (
        <>
          {filteredDeeds.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "#9aabb8" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>📜</div>
              <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "6px", color: "#5a6a7a" }}>
                {searchTerm ? "No deeds match your search" : "No title deeds issued yet"}
              </div>
              <div style={{ fontSize: "13px" }}>
                {searchTerm
                  ? "Try a different search term."
                  : "Title deeds will appear here once issued by a Registry Officer."}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {filteredDeeds.map((deed, i) => (
                <div key={i} style={{
                  background: "#ffffff", border: "1px solid #dde3ea",
                  borderRadius: "12px", padding: "16px 20px",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px",
                }}>
                  {[
                    { label: "Deed ID",   value: deed.deedId },
                    { label: "Parcel ID", value: deed.parcelId },
                    { label: "Issued",    value: fmtDate(deed.issuedAt) },
                    { label: "Issued By", value: shortAddr(deed.issuedBy) },
                    { label: "Valid",     value: deed.isValid ? "✅ Yes" : "⛔ No" },
                    { label: "Land Use",  value: deed.landUse || "—" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#9aabb8",
                        textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>
                        {label}
                      </div>
                      <div style={{ fontSize: "13px", color: "#1a2633", fontWeight: 500 }}>{value || "—"}</div>
                    </div>
                  ))}
                  {deed.documentHash && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#9aabb8",
                        textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>
                        Document Hash
                      </div>
                      <div style={{ fontFamily: "var(--mono, monospace)", fontSize: "11px",
                        color: "#5a6a7a", wordBreak: "break-all" }}>
                        {deed.documentHash}
                        {deed.ipfsHash && (
                          <a href={`https://gateway.pinata.cloud/ipfs/${deed.ipfsHash}`}
                            target="_blank" rel="noreferrer"
                            style={{ marginLeft: "8px", color: "#2ecc89", fontWeight: 600,
                              fontSize: "11px", textDecoration: "none" }}>
                            View ↗
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}