import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

/* ─── Role definitions ──────────────────────────────────────────────────── */
const ROLES = [
  {
    id:    "landholder",
    icon:  "🏡",
    title: "Landholder",
    desc:  "Manage your land parcels, initiate ownership transfers and access your blockchain title deeds",
    check: null,
  },
  {
    id:    "officer",
    icon:  "🏛️",
    title: "Registry Officer",
    desc:  "Authorized personnel only — approve transfers, verify KYC identities and confirm KRA stamp duty payments",
    check: "⛓ On-chain verification required",
  },
  {
    id:    "public",
    icon:  "🔍",
    title: "Public Search",
    desc:  "Verify land ownership and parcel records publicly on the blockchain — no wallet required",
    check: null,
  },
];

const BG_PHOTO   = "https://awkadvocates.co.ke/wp-content/uploads/2026/02/subdivision-2948764_1280.jpg";
const SIDE_PHOTO = "https://awkadvocates.co.ke/wp-content/uploads/2026/02/subdivision-2948764_1280.jpg";

/* ─── Typography tokens ─────────────────────────────────────────────────── */
const T = {
  display: "'Sora', 'Segoe UI', sans-serif",
  body:    "'IBM Plex Sans', 'Segoe UI', sans-serif",
  mono:    "'IBM Plex Mono', 'Courier New', monospace",
  xs:   "10px", sm: "11px", base: "13px", md: "14px",
  lg:   "16px", xl: "20px", h2:  "22px",  h1: "24px",
  regular: 400, medium: 500, semibold: 600, bold: 700, black: 800,
  tight: "-0.3px", normal: "0px", wide: "0.5px",
  snug: 1.25, loose: 1.65,
};

/* ══════════════════════════════════════════════════════════════════════════
   LOGIN PAGE — Two-gesture flow
   ─────────────────────────────────────────────────────────────────────────

   WHY TWO GESTURES:
   eth_requestAccounts resolves and returns an address before the user
   actually clicks "Connect" inside MetaMask — the popup is still
   animating. If signMessage fires in the same JS call stack, MetaMask
   has not yet committed the session and silently drops the sign prompt.

   The fix: split into two separate click handlers so each is a fresh
   trusted user gesture with its own event dispatch cycle.

   FLOW:
     Step 1 — "Connect with MetaMask" button (handleConnect)
       • Calls requestAccounts() → eth_requestAccounts → MM account picker
       • Resolves address → stored as pendingAddress in AuthContext
       • Shows "Confirm & Sign" panel immediately

     Step 2 — "Sign & Verify" button (handleSign)
       • Calls signAndAuthenticate(role, pendingAddress)
       • signMessage fires → MM sign prompt (separate gesture ✓)
       • On-chain role check runs
       • isAuthenticated flips → App.jsx swaps to Dashboard

     "Change Wallet" — same as before, uses wallet_requestPermissions
       to force MM account picker, then replaces pendingAddress and
       returns to the confirm panel ready for a fresh sign.

   RESPONSIVE LAYOUT:
     The card uses the classes .auth-wrapper, .auth-card, .auth-form,
     .auth-image and .auth-actions. At ≤ 768px the card stacks
     vertically (photo banner on top, form below) via the media query
     in the <style> block. !important is required there because the
     base layout values are set inline.

   ══════════════════════════════════════════════════════════════════════════ */
export default function LoginPage() {
  const {
    requestAccounts,
    signAndAuthenticate,
    requestAndChangeWallet,
    clearPendingAddress,
    pendingAddress,
    authLoading,
    authError,
    verifyingRole,
  } = useAuth();

  const [selectedRole, setSelectedRole] = useState(null);
  const [localError,   setLocalError]   = useState(null);

  const selectedMeta  = ROLES.find(r => r.id === selectedRole);
  const displayError  = authError || localError;
  const isBusy        = authLoading || verifyingRole;

  /*
   * isPending32002 — true while we are polling for the user to approve
   * an already-open MetaMask popup. During this state we show a special
   * "waiting for MetaMask" banner instead of the generic error panel,
   * and we keep the CTA disabled so they don't fire another request.
   */
  const isPending32002 = !!(authError && authError.includes("already has a connection request open"));

  /*
   * showConfirm — true when we have a resolved address and are waiting
   * for the user to click "Sign & Verify". Not shown for "public" role
   * since that needs no wallet at all.
   */
  const showConfirm = !!pendingAddress && !!selectedRole && selectedRole !== "public" && !isBusy;

  /* ── Step 1: open MetaMask account picker ─────────────────── */
  /* ── Step 1: resolve wallet address ──────────────────────────
     requestAccounts() now tries eth_accounts first (no popup for
     already-connected wallets) before escalating to the full
     account picker. The confirm panel appears as soon as an
     address is in pendingAddress.                               */
  async function handleConnect() {
    if (!selectedRole || isBusy) return;
    setLocalError(null);

    if (selectedRole === "public") {
      await signAndAuthenticate("public", null);
      return;
    }

    await requestAccounts();
  }

  /* ── Step 2: sign message + on-chain check ────────────────── */
  async function handleSign() {
    if (!pendingAddress || !selectedRole || isBusy) return;
    setLocalError(null);
    await signAndAuthenticate(selectedRole, pendingAddress);
  }

  /* ── Change wallet: force MetaMask account picker ─────────── */
  async function handleChangeWallet() {
    if (isBusy) return;
    setLocalError(null);
    await requestAndChangeWallet();
  }

  /* ── Back: cancel confirm panel, clear pending address ─────── */
  function handleBack() {
    clearPendingAddress();
    setLocalError(null);
  }

  /* ── CTA label for step-1 button ─────────────────────────── */
  function ctaLabel() {
    if (authLoading) return "Connecting to MetaMask…";
    if (selectedRole === "public") return "Browse as Public →";
    if (selectedRole) return `Connect with MetaMask as ${selectedMeta?.title} →`;
    return "Select a role to continue";
  }

  /* ── Sign button label ───────────────────────────────────── */
  function signLabel() {
    if (verifyingRole) {
      if (selectedRole === "officer")    return "⛓ Verifying officer status…";
      if (selectedRole === "landholder") return "⛓ Checking KYC registration…";
      return "⛓ Verifying on blockchain…";
    }
    return "Sign & Verify Access →";
  }

  const ctaActive  = !!selectedRole && !isBusy && !pendingAddress && !isPending32002;
  const signActive = !!pendingAddress && !isBusy;

  return (
    <div className="auth-wrapper" style={{
      minHeight: "100vh",
      backgroundImage: `url("${BG_PHOTO}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      fontFamily: T.body,
      position: "relative",
    }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700&family=Sora:wght@400;600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        .role-btn {
          transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
        }
        .role-btn:hover:not(.selected):not(:disabled) {
          border-color: rgba(0,188,212,0.30) !important;
          background: rgba(0,188,212,0.03) !important;
          box-shadow: 0 2px 10px rgba(0,188,212,0.08);
        }
        .cta-btn { transition: all 0.2s ease; }
        .cta-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(0,188,212,0.45) !important;
        }
        .cta-btn:active:not(:disabled) { transform: translateY(0); }

        .sign-btn { transition: all 0.2s ease; }
        .sign-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(46,204,137,0.40) !important;
        }
        .sign-btn:active:not(:disabled) { transform: translateY(0); }

        .change-btn { transition: all 0.15s ease; }
        .change-btn:hover:not(:disabled) {
          background: #edf2f7 !important;
          border-color: #c8d8e4 !important;
        }

        .confirm-panel {
          animation: fadeSlideIn 0.22s ease both;
        }

        /* ── Responsive: stack the card on tablets / phones ── */
        @media (max-width: 768px) {
          .auth-wrapper {
            padding: 12px !important;
            align-items: flex-start !important;
          }
          .auth-card {
            flex-direction: column !important;
            min-height: auto !important;
            max-width: 100% !important;
          }
          .auth-form {
            flex: none !important;
            width: 100% !important;
            padding: 28px 20px !important;
          }
          .auth-image {
            width: 100% !important;
            height: 200px !important;
            min-height: 200px !important;
            order: -1;
            border-radius: 0 !important;
          }
          .auth-actions {
            flex-wrap: wrap !important;
          }
          .auth-actions .sign-btn {
            flex: 1 1 100% !important;
            order: -1;
          }
        }
      `}</style>

      {/* Backdrop overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(0,0,0,0.22)",
        backdropFilter: "blur(1.5px)",
      }} />

      {/* ══════════════════════════════════════════════════
          MAIN CARD
      ══════════════════════════════════════════════════ */}
      <div className="auth-card" style={{
        position: "relative", zIndex: 1,
        background: "#ffffff",
        borderRadius: "20px",
        width: "100%", maxWidth: "880px",
        display: "flex",
        boxShadow: "0 40px 100px rgba(0,0,0,0.38)",
        overflow: "hidden",
        minHeight: "540px",
        animation: "fadeSlideUp 0.28s ease both",
      }}>

        {/* ── LEFT: Form Panel ── */}
        <div className="auth-form" style={{
          flex: "1 1 0", padding: "48px 44px",
          display: "flex", flexDirection: "column", justifyContent: "center",
          minWidth: 0,
        }}>

          {/* Brand lockup */}
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <div style={{
              fontFamily: T.body, fontSize: "8.5px", fontWeight: T.medium,
              color: "#4ecdc4", letterSpacing: "3.5px", textTransform: "uppercase",
              marginBottom: "6px", display: "flex", alignItems: "center",
              justifyContent: "center", gap: "8px",
            }}>
              <span style={{ opacity: 0.6 }}>· ·</span>
              <span>Kajiado County Land Registry</span>
              <span style={{ opacity: 0.6 }}>· ·</span>
            </div>
            <div style={{
              fontFamily: "'Playfair Display', 'Georgia', serif",
              fontSize: "42px", fontWeight: 700, fontStyle: "italic",
              color: "#0f1923", letterSpacing: "-0.5px", lineHeight: 1.1, marginBottom: "2px",
            }}>Rongai</div>
            <div style={{
              fontFamily: T.body, fontSize: "11px", fontWeight: T.medium,
              color: "rgba(15,25,35,0.45)", letterSpacing: "6px",
              textTransform: "uppercase", marginBottom: "14px",
            }}>LAND&nbsp;&nbsp;REGISTRY</div>
            <div style={{ height: "1px", background: "rgba(15,25,35,0.10)", marginBottom: "12px" }} />
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "7px",
              background: "rgba(98,126,234,0.12)",
              border: "1px solid rgba(98,126,234,0.25)",
              borderRadius: "20px", padding: "4px 12px",
            }}>
              <svg width="13" height="13" viewBox="0 0 256 417" xmlns="http://www.w3.org/2000/svg">
                <polygon fill="#343434" points="127.9,0 125.2,9 125.2,285.2 127.9,287.9 255.8,212.4"/>
                <polygon fill="#8C8C8C" points="127.9,0 0,212.4 127.9,287.9 127.9,154.1"/>
                <polygon fill="#3C3C3B" points="127.9,311.5 126.3,313.5 126.3,412.5 127.9,417.3 255.9,236.5"/>
                <polygon fill="#8C8C8C" points="127.9,417.3 127.9,311.5 0,236.5"/>
                <polygon fill="#141414" points="127.9,287.9 255.8,212.4 127.9,154.1"/>
                <polygon fill="#393939" points="0,212.4 127.9,287.9 127.9,154.1"/>
              </svg>
              <span style={{
                fontFamily: T.body, fontSize: "9px", fontWeight: T.semibold,
                color: "#7b8fd4", letterSpacing: "1.8px", textTransform: "uppercase",
              }}>Powered by Ethereum</span>
            </div>
          </div>

          {/* ════════════════════════════════════════════════
              CONFIRM PANEL — shown after address is resolved
              Replaces the role list + step-1 CTA while the
              user completes step 2 (sign).
          ════════════════════════════════════════════════ */}
          {showConfirm ? (
            <div className="confirm-panel">
              {/* Step indicator */}
              <div style={{
                display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px",
              }}>
                {/* Step 1 — done */}
                <div style={{
                  width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
                  background: "#2ecc89", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ color: "#fff", fontSize: "13px", fontWeight: T.bold }}>✓</span>
                </div>
                <div style={{
                  flex: 1, height: "2px",
                  background: "linear-gradient(90deg, #2ecc89 0%, rgba(0,188,212,0.30) 100%)",
                  borderRadius: "2px",
                }} />
                {/* Step 2 — active */}
                <div style={{
                  width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
                  background: "rgba(0,188,212,0.12)",
                  border: "2px solid #00bcd4",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ color: "#00bcd4", fontSize: "11px", fontWeight: T.bold }}>2</span>
                </div>
                <div style={{
                  fontFamily: T.body, fontSize: T.xs, color: "#8fa3b1", letterSpacing: "0.3px",
                  marginLeft: "4px", whiteSpace: "nowrap",
                }}>Sign to verify</div>
              </div>

              {/* Wallet confirmation card */}
              <div style={{
                background: "rgba(46,204,137,0.06)",
                border: "1.5px solid rgba(46,204,137,0.30)",
                borderRadius: "14px", padding: "16px 18px", marginBottom: "18px",
              }}>
                <div style={{
                  fontFamily: T.body, fontSize: T.xs, fontWeight: T.medium,
                  color: "#1a5c35", letterSpacing: "1.5px", textTransform: "uppercase",
                  marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px",
                }}>
                  <span>🦊</span> Wallet Connected
                </div>
                <div style={{
                  fontFamily: T.mono, fontSize: "12px", color: "#0f1923",
                  letterSpacing: "0.3px", wordBreak: "break-all",
                  lineHeight: 1.5,
                }}>
                  {pendingAddress}
                </div>
                <div style={{
                  marginTop: "8px", paddingTop: "8px",
                  borderTop: "1px solid rgba(46,204,137,0.20)",
                  display: "flex", alignItems: "center", gap: "6px",
                }}>
                  <span style={{ fontSize: "14px" }}>{selectedMeta?.icon}</span>
                  <span style={{
                    fontFamily: T.body, fontSize: T.sm, fontWeight: T.semibold,
                    color: "#1a5c35",
                  }}>{selectedMeta?.title}</span>
                  {selectedRole === "officer" && (
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", color: "#00acc1",
                      background: "rgba(0,188,212,0.10)", borderRadius: "6px",
                      padding: "2px 8px", marginLeft: "4px",
                    }}>⛓ On-chain check</span>
                  )}
                </div>
              </div>

              {/* What happens next */}
              <div style={{
                fontFamily: T.body, fontSize: T.xs, color: "#8fa3b1",
                lineHeight: 1.7, marginBottom: "18px",
              }}>
                MetaMask will open a <strong style={{ color: "#4a6070" }}>signing prompt</strong> — this is a free,
                gas-less signature that proves you own this wallet. No transaction will be sent.
                {selectedRole === "officer" && (
                  <span> Your officer status will then be verified on-chain.</span>
                )}
                {selectedRole === "landholder" && (
                  <span> Your KYC registration will then be confirmed on-chain.</span>
                )}
              </div>

              {/* On-chain verifying indicator (shown during step 2) */}
              {verifyingRole && (
                <div style={{
                  background: "rgba(0,188,212,0.07)",
                  border: "1.5px solid rgba(0,188,212,0.28)",
                  borderRadius: "10px", padding: "12px 15px", marginBottom: "14px",
                  display: "flex", alignItems: "flex-start", gap: "10px",
                }}>
                  <span style={{
                    fontSize: "16px", marginTop: "1px", flexShrink: 0,
                    display: "inline-block", animation: "spin 1.5s linear infinite",
                  }}>⛓</span>
                  <div>
                    <div style={{
                      fontFamily: T.display, fontSize: T.base, fontWeight: T.semibold,
                      color: "#007c8a", letterSpacing: T.tight, marginBottom: "3px",
                    }}>
                      {selectedRole === "officer"
                        ? "Verifying officer status on blockchain…"
                        : "Checking KYC registration on blockchain…"}
                    </div>
                    <div style={{
                      fontFamily: T.mono, fontSize: T.xs,
                      color: "#0097a7", opacity: 0.85, lineHeight: 1.5,
                    }}>
                      {selectedRole === "officer"
                        ? "Checking your wallet against the smart contract officer registry."
                        : "Confirming your wallet is a KYC-registered Landholder in the registry."}
                    </div>
                  </div>
                </div>
              )}

              {/* Error panel */}
              {displayError && <ErrorPanel error={displayError} role={selectedRole} />}

              {/* Action row: Back | Change Wallet | Sign */}
              <div className="auth-actions" style={{ display: "flex", gap: "8px" }}>
                <button
                  className="change-btn"
                  onClick={handleBack}
                  disabled={isBusy}
                  title="Go back and select a different role"
                  style={{
                    flex: "0 0 auto", padding: "13px 14px",
                    background: "#f4f8fb",
                    border: "1.5px solid #e4ecf1",
                    borderRadius: "32px",
                    color: isBusy ? "#c8d8e4" : "#4a6070",
                    fontFamily: T.display, fontSize: T.sm, fontWeight: T.semibold,
                    cursor: isBusy ? "not-allowed" : "pointer",
                    letterSpacing: "0.1px",
                  }}
                >
                  ← Back
                </button>

                <button
                  className="change-btn"
                  onClick={handleChangeWallet}
                  disabled={isBusy}
                  title="Open MetaMask account picker to switch wallet"
                  style={{
                    flex: "0 0 auto", padding: "13px 14px",
                    background: "#f4f8fb",
                    border: "1.5px solid #e4ecf1",
                    borderRadius: "32px",
                    color: isBusy ? "#c8d8e4" : "#4a6070",
                    fontFamily: T.display, fontSize: T.sm, fontWeight: T.semibold,
                    cursor: isBusy ? "not-allowed" : "pointer",
                    letterSpacing: "0.1px", whiteSpace: "nowrap",
                  }}
                >
                  🔄 Change
                </button>

                <button
                  className="sign-btn"
                  onClick={handleSign}
                  disabled={!signActive}
                  style={{
                    flex: 1, padding: "13px 20px",
                    background: signActive
                      ? "linear-gradient(135deg, #1a5c35 0%, #2ecc89 100%)"
                      : "#edf2f7",
                    border: "none", borderRadius: "32px",
                    color: signActive ? "#ffffff" : "#b0bec5",
                    fontFamily: T.display, fontSize: T.md, fontWeight: T.bold,
                    letterSpacing: signActive ? "0.2px" : T.normal,
                    cursor: signActive ? "pointer" : "not-allowed",
                    boxShadow: signActive ? "0 6px 22px rgba(46,204,137,0.38)" : "none",
                  }}
                >
                  {isBusy ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: "14px" }}>⛓</span>
                      {signLabel()}
                    </span>
                  ) : signLabel()}
                </button>
              </div>

              <div style={{
                fontFamily: T.body, fontSize: T.xs, color: "#a0b2be",
                textAlign: "center", letterSpacing: "0.15px",
                lineHeight: T.loose, marginTop: "10px",
              }}>
                🦊 MetaMask will open a signing prompt — no gas fees, no transaction
              </div>
            </div>

          ) : (
            /* ════════════════════════════════════════════════
               STEP 1 PANEL — Role selection + Connect button
            ════════════════════════════════════════════════ */
            <>
              {/* Section heading */}
              <div style={{
                fontFamily: T.display, fontSize: T.h2, fontWeight: T.bold,
                color: "#0f1923", letterSpacing: T.tight, lineHeight: T.snug, marginBottom: "6px",
              }}>Select Access Level</div>
              <div style={{
                fontFamily: T.body, fontSize: T.base, color: "#8fa3b1",
                letterSpacing: T.normal, lineHeight: T.loose, marginBottom: "22px",
              }}>
                Choose your role and connect your MetaMask wallet to access the registry
              </div>

              {/* Role cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
                {ROLES.map(r => {
                  const isSelected = selectedRole === r.id;
                  return (
                    <button
                      key={r.id}
                      className={`role-btn${isSelected ? " selected" : ""}`}
                      onClick={() => {
                        setSelectedRole(r.id);
                        setLocalError(null);
                      }}
                      disabled={isBusy}
                      style={{
                        background:   isSelected ? "rgba(0,188,212,0.06)" : "#f8fafb",
                        border:       isSelected ? "1.5px solid rgba(0,188,212,0.55)" : "1.5px solid #e4ecf1",
                        borderRadius: "12px", padding: "14px 16px",
                        cursor: isBusy ? "not-allowed" : "pointer",
                        textAlign: "left", width: "100%", fontFamily: T.body,
                        opacity: isBusy ? 0.7 : 1,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "13px" }}>
                        <span style={{ fontSize: "20px", lineHeight: 1 }}>{r.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontFamily: T.display, fontSize: T.md, fontWeight: T.semibold,
                            color: isSelected ? "#00bcd4" : "#0f1923",
                            letterSpacing: T.tight, lineHeight: T.snug, marginBottom: "3px",
                          }}>{r.title}</div>
                          <div style={{
                            fontFamily: T.body, fontSize: T.sm, color: "#8fa3b1",
                            letterSpacing: "0.1px", lineHeight: 1.55,
                          }}>{r.desc}</div>
                          {r.check && isSelected && (
                            <div style={{
                              marginTop: "7px", fontFamily: T.mono, fontSize: "9.5px",
                              fontWeight: T.medium, color: "#00acc1", letterSpacing: "0.2px",
                              lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: "5px",
                            }}>
                              <span style={{ marginTop: "1px" }}>⛓</span>
                              <span>Your wallet address will be verified against the officer registry smart contract</span>
                            </div>
                          )}
                        </div>
                        {/* Radio dot */}
                        <div style={{
                          width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0,
                          border: isSelected ? "2px solid #00bcd4" : "2px solid #c8d8e4",
                          background: isSelected ? "#00bcd4" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.15s",
                        }}>
                          {isSelected && (
                            <span style={{
                              color: "#fff", fontSize: "9px",
                              fontWeight: T.black, fontFamily: T.body, lineHeight: 1,
                            }}>✓</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* -32002 pending banner — shown while polling for MM approval */}
              {isPending32002 && (
                <div style={{
                  background: "rgba(255,152,0,0.07)",
                  border: "1.5px solid rgba(255,152,0,0.35)",
                  borderRadius: "10px", padding: "13px 15px", marginBottom: "14px",
                  display: "flex", alignItems: "flex-start", gap: "10px",
                }}>
                  <span style={{
                    fontSize: "20px", flexShrink: 0, marginTop: "1px",
                    display: "inline-block", animation: "spin 2s linear infinite",
                  }}>🦊</span>
                  <div>
                    <div style={{
                      fontFamily: T.display, fontSize: T.base, fontWeight: T.bold,
                      color: "#7a4800", letterSpacing: T.tight, marginBottom: "4px",
                    }}>MetaMask popup is already open</div>
                    <div style={{
                      fontFamily: T.body, fontSize: T.sm, color: "#8a5500",
                      lineHeight: T.loose,
                    }}>
                      Click the <strong>🦊 MetaMask icon</strong> in your browser toolbar
                      to bring the popup to the front, then <strong>approve</strong> the
                      connection request. This page will continue automatically.
                    </div>
                  </div>
                </div>
              )}

              {/* Generic error panel (non-32002 step-1 errors) */}
              {displayError && !isPending32002 && (
                <ErrorPanel error={displayError} role={selectedRole} />
              )}

              {/* Step 1 CTA */}
              <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                <button
                  className="cta-btn"
                  onClick={handleConnect}
                  disabled={!ctaActive || isPending32002}
                  style={{
                    flex: 1, padding: "14px 20px",
                    background: (ctaActive && !isPending32002)
                      ? "linear-gradient(135deg, #00bcd4 0%, #0097a7 100%)"
                      : "#edf2f7",
                    border: "none", borderRadius: "32px",
                    color: (ctaActive && !isPending32002) ? "#ffffff" : "#b0bec5",
                    fontFamily: T.display, fontSize: T.md, fontWeight: T.bold,
                    letterSpacing: (ctaActive && !isPending32002) ? "0.2px" : T.normal,
                    cursor: (ctaActive && !isPending32002) ? "pointer" : "not-allowed",
                    boxShadow: (ctaActive && !isPending32002) ? "0 6px 22px rgba(0,188,212,0.38)" : "none",
                  }}
                >
                  {authLoading ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: "14px" }}>🦊</span>
                      Connecting to MetaMask…
                    </span>
                  ) : isPending32002 ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ display: "inline-block", animation: "spin 2s linear infinite", fontSize: "14px" }}>⏳</span>
                      Waiting for MetaMask approval…
                    </span>
                  ) : ctaLabel()}
                </button>
              </div>

              {selectedRole && selectedRole !== "public" && !isBusy && !isPending32002 && (
                <div style={{
                  fontFamily: T.body, fontSize: T.xs, color: "#a0b2be",
                  textAlign: "center", letterSpacing: "0.15px",
                  lineHeight: T.loose, marginBottom: "4px",
                }}>
                  🦊 If MetaMask is already connected it will proceed instantly — otherwise the account picker will open
                </div>
              )}
            </>
          )}

          {/* Footer tags — always visible */}
          <div style={{
            marginTop: "22px", paddingTop: "16px",
            borderTop: "1px solid #edf2f7",
            display: "flex", justifyContent: "center", gap: "8px", flexWrap: "wrap",
          }}>
            {["⛓ Ethereum Sepolia Testnet", "🏛 Kajiado County Government", "© 2026 BLRMS"].map(tag => (
              <span key={tag} style={{
                fontFamily: T.body, fontSize: "9.5px", fontWeight: T.medium,
                color: "#b0bec5", letterSpacing: T.wide,
                background: "#f4f8fb", borderRadius: "20px", padding: "3px 11px",
              }}>{tag}</span>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Photo Panel ── */}
        <div className="auth-image" style={{
          width: "340px", flexShrink: 0,
          backgroundImage: `url("${SIDE_PHOTO}")`,
          backgroundSize: "cover", backgroundPosition: "center",
          borderRadius: "0 20px 20px 0",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(180deg, rgba(0,188,212,0.12) 0%, rgba(0,0,0,0.22) 100%)",
          }} />
          <div style={{
            position: "absolute", bottom: "20px", left: "16px", right: "16px",
            background: "rgba(255,255,255,0.13)", backdropFilter: "blur(10px)",
            borderRadius: "10px", padding: "12px 15px",
          }}>
            <div style={{
              fontFamily: T.display, fontSize: T.md, fontWeight: T.bold,
              color: "#ffffff", letterSpacing: T.tight, lineHeight: T.snug, marginBottom: "5px",
            }}>Rongai Sub-County Land Registry</div>
            <div style={{
              fontFamily: T.body, fontSize: T.xs,
              color: "rgba(255,255,255,0.82)", letterSpacing: "0.15px", lineHeight: 1.6,
            }}>
              Every parcel. Every transfer. Every title deed — permanently recorded on the Ethereum blockchain.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ── Shared error panel component ──────────────────────────────── */
function ErrorPanel({ error, role }) {
  const T = {
    display: "'Sora', 'Segoe UI', sans-serif",
    body:    "'IBM Plex Sans', 'Segoe UI', sans-serif",
    mono:    "'IBM Plex Mono', 'Courier New', monospace",
    xs: "10px", sm: "11px", base: "13px", md: "14px",
    tight: "-0.3px", normal: "0px",
    semibold: 600, bold: 700,
    loose: 1.65,
  };

  return (
    <div style={{
      background: "rgba(224,92,92,0.06)",
      border: "1.5px solid rgba(224,92,92,0.28)",
      borderRadius: "10px", padding: "13px 15px", marginBottom: "14px",
    }}>
      <div style={{
        fontFamily: T.display, fontSize: T.base, fontWeight: T.bold,
        color: "#b52b2b", letterSpacing: T.tight, marginBottom: "4px",
      }}>
        {error.includes("pending KYC") ? "⏳ Pending Verification" : "Access Denied"}
      </div>
      <div style={{
        fontFamily: T.body, fontSize: T.sm, color: "#c0392b",
        lineHeight: T.loose, whiteSpace: "pre-line",
      }}>{error}</div>

      {error.includes("not registered as a Registry Officer") && (
        <div style={{
          marginTop: "10px", padding: "10px 12px",
          background: "rgba(255,255,255,0.65)", borderRadius: "8px",
        }}>
          <div style={{
            fontFamily: T.display, fontSize: T.sm, fontWeight: T.semibold,
            color: "#7a1a1a", marginBottom: "6px",
          }}>How to get officer access:</div>
          <ol style={{ margin: "0 0 0 16px", padding: 0, lineHeight: 1.9 }}>
            {[
              "Contact the system administrator (contract deployer)",
              <span key="code">Ask them to run:{" "}
                <code style={{
                  fontFamily: T.mono, fontSize: "9.5px", fontWeight: 500,
                  background: "rgba(0,0,0,0.07)", padding: "1px 6px",
                  borderRadius: "4px", color: "#4a0000",
                }}>LandholderIdentity.addOfficer("your-wallet")</code>
              </span>,
              "Then try logging in again",
            ].map((item, i) => (
              <li key={i} style={{
                fontFamily: T.body, fontSize: T.xs, color: "#7a1a1a", lineHeight: 1.9,
              }}>{item}</li>
            ))}
          </ol>
        </div>
      )}

      {error.includes("not registered as a Landholder") && (
        <div style={{
          marginTop: "10px", padding: "10px 12px",
          background: "rgba(255,255,255,0.65)", borderRadius: "8px",
        }}>
          <div style={{
            fontFamily: T.display, fontSize: T.sm, fontWeight: T.semibold,
            color: "#7a1a1a", marginBottom: "6px",
          }}>How to register as a Landholder:</div>
          <ol style={{ margin: "0 0 0 16px", padding: 0 }}>
            {[
              "Visit your nearest Kajiado County Land Registry office",
              "Provide your wallet address and National ID to the Registry Officer",
              "The officer will register your KYC identity on-chain",
              "Return here and log in once your registration is confirmed",
            ].map((step, i) => (
              <li key={i} style={{
                fontFamily: T.body, fontSize: T.xs, color: "#7a1a1a", lineHeight: 1.9,
              }}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {error.includes("pending KYC") && (
        <div style={{
          marginTop: "10px", padding: "10px 12px",
          background: "rgba(255,255,255,0.65)", borderRadius: "8px",
          fontFamily: T.body, fontSize: T.xs, color: "#7a5800", lineHeight: 1.9,
        }}>
          Your registration is in the system. Contact your Registry Officer
          at the Kajiado County Land Registry office to have your identity confirmed.
        </div>
      )}
    </div>
  );
}