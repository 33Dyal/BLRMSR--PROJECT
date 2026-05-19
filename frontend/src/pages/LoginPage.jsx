import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

const ROLES = [
  {
    id:     "landholder",
    icon:   "🏡",
    title:  "Landholder",
    desc:   "Register parcels, initiate transfers, view your title deeds",
    color:  "#2ecc89",
    border: "rgba(46, 204, 137, 0.5)",
    bg:     "rgba(46, 204, 137, 0.08)",
    check:  null, // No on-chain check
  },
  {
    id:     "officer",
    icon:   "🏛️",
    title:  "Registry Officer",
    desc:   "Approve records, verify identities, manage stamp duty",
    color:  "#2196f3",
    border: "rgba(33, 150, 243, 0.5)",
    bg:     "rgba(33, 150, 243, 0.08)",
    check:  "⛓ On-chain verification required", // Shows officer verification notice
  },
  {
    id:     "public",
    icon:   "🔍",
    title:  "Public Search",
    desc:   "Search and view land registry records (read-only)",
    color:  "#f0c050",
    border: "rgba(240, 192, 80, 0.5)",
    bg:     "rgba(240, 192, 80, 0.05)",
    check:  null,
  },
];

export default function LoginPage() {
  const { connectAndAuthenticate, authLoading, authError, verifyingRole } = useAuth();
  const [selectedRole, setSelectedRole] = useState(null);

  async function handleContinue() {
    if (!selectedRole) return;
    await connectAndAuthenticate(selectedRole);
  }

  const selectedMeta = ROLES.find(r => r.id === selectedRole);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0b1f0f 0%, #1a3a2a 50%, #0b1f3a 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      fontFamily: "var(--sans, 'DM Sans', sans-serif)",
    }}>
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: "24px",
        padding: "44px 40px",
        width: "100%",
        maxWidth: "520px",
        backdropFilter: "blur(12px)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.40)",
      }}>

        {/* ── Logo & Title ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "32px" }}>
          <div style={{
            width: "52px", height: "52px", borderRadius: "14px",
            background: "linear-gradient(135deg, #f5b731 0%, #e8a010 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "26px", flexShrink: 0,
            boxShadow: "0 4px 16px rgba(232,160,16,0.40)",
          }}>🏠</div>
          <div>
            <div style={{ fontFamily: "var(--serif, Georgia, serif)", fontSize: "22px", fontWeight: 400, color: "#ffffff", lineHeight: 1.1 }}>
              <span style={{ color: "#2ecc89" }}>Rongai </span>Land Registry
            </div>
            <div style={{ fontSize: "10px", color: "rgba(168,196,176,0.65)", letterSpacing: "1.5px", textTransform: "uppercase", marginTop: "3px" }}>
              Kajiado County · Blockchain Land Management System
            </div>
          </div>
        </div>

        {/* ── Role Selection ── */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#ffffff", marginBottom: "6px" }}>
            Who are you?
          </div>
          <div style={{ fontSize: "13px", color: "rgba(168,196,176,0.75)", marginBottom: "18px" }}>
            Select your role to get the right access level
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {ROLES.map(role => {
              const isSelected = selectedRole === role.id;
              return (
                <button
                  key={role.id}
                  onClick={() => setSelectedRole(role.id)}
                  style={{
                    background:   isSelected ? role.bg    : "rgba(255,255,255,0.03)",
                    border:       isSelected ? `2px solid ${role.border}` : "2px solid rgba(255,255,255,0.08)",
                    borderRadius: "14px",
                    padding:      "16px 18px",
                    cursor:       "pointer",
                    textAlign:    "left",
                    transition:   "all 0.18s",
                    width:        "100%",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <span style={{ fontSize: "26px" }}>{role.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: "15px", fontWeight: 700,
                        color: isSelected ? role.color : "#e8f5ec",
                        marginBottom: "3px",
                      }}>
                        {role.title}
                      </div>
                      <div style={{ fontSize: "12px", color: "rgba(168,196,176,0.70)", lineHeight: 1.4 }}>
                        {role.desc}
                      </div>
                      {/* On-chain check notice for officer */}
                      {role.check && isSelected && (
                        <div style={{
                          marginTop: "8px", fontSize: "11px", fontWeight: 600,
                          color: "#2196f3", display: "flex", alignItems: "center", gap: "5px",
                        }}>
                          <span>⛓</span>
                          <span>{role.check} — your wallet will be verified against the blockchain</span>
                        </div>
                      )}
                    </div>
                    {/* Selection indicator */}
                    <div style={{
                      width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0,
                      border: isSelected ? `2px solid ${role.color}` : "2px solid rgba(255,255,255,0.20)",
                      background: isSelected ? role.color : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isSelected && <span style={{ color: "#fff", fontSize: "10px", fontWeight: 900 }}>✓</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── On-chain verification status ── */}
        {verifyingRole && (
          <div style={{
            background: "rgba(33,150,243,0.12)",
            border: "1.5px solid rgba(33,150,243,0.30)",
            borderRadius: "10px", padding: "12px 16px",
            marginBottom: "16px", fontSize: "13px",
            color: "#90caf9", display: "flex", alignItems: "center", gap: "10px",
          }}>
            <span style={{ fontSize: "18px", animation: "spin 1s linear infinite" }}>⛓</span>
            <div>
              <strong>Verifying officer status on blockchain…</strong>
              <div style={{ fontSize: "11px", opacity: 0.75, marginTop: "2px" }}>
                Checking your wallet against the smart contract officer registry. Please wait.
              </div>
            </div>
          </div>
        )}

        {/* ── Error display ── */}
        {authError && (
          <div style={{
            background: "rgba(224,92,92,0.12)",
            border: "1.5px solid rgba(224,92,92,0.35)",
            borderRadius: "10px", padding: "14px 16px",
            marginBottom: "16px", fontSize: "13px",
            color: "#ff8a80", lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, marginBottom: "4px" }}>Access Denied</div>
            <div>{authError}</div>
            {authError.includes("not registered as a Registry Officer") && (
              <div style={{
                marginTop: "10px", padding: "10px 12px",
                background: "rgba(255,255,255,0.05)", borderRadius: "8px",
                fontSize: "12px", color: "rgba(255,200,200,0.8)",
              }}>
                <strong>How to get officer access:</strong>
                <ol style={{ margin: "6px 0 0 16px", padding: 0, lineHeight: 1.8 }}>
                  <li>Contact the system administrator (contract deployer)</li>
                  <li>Ask them to run: <code style={{ background: "rgba(255,255,255,0.10)", padding: "1px 6px", borderRadius: "3px", fontSize: "11px" }}>
                    TitleDeed.addOfficer("your-wallet-address")
                  </code></li>
                  <li>Then try logging in again</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* ── Continue Button ── */}
        <button
          onClick={handleContinue}
          disabled={!selectedRole || authLoading || verifyingRole}
          style={{
            width: "100%", padding: "14px",
            background: selectedRole && !authLoading && !verifyingRole
              ? "linear-gradient(135deg, #1a5c35 0%, #2ecc89 100%)"
              : "rgba(255,255,255,0.08)",
            border: "none", borderRadius: "12px",
            color: selectedRole && !authLoading && !verifyingRole ? "#ffffff" : "rgba(255,255,255,0.35)",
            fontSize: "15px", fontWeight: 700,
            cursor: selectedRole && !authLoading && !verifyingRole ? "pointer" : "not-allowed",
            transition: "all 0.2s",
            boxShadow: selectedRole && !authLoading && !verifyingRole
              ? "0 4px 20px rgba(46,204,137,0.35)"
              : "none",
            letterSpacing: "0.3px",
          }}
        >
          {verifyingRole
            ? "⛓ Verifying on blockchain…"
            : authLoading
            ? "Connecting to MetaMask…"
            : selectedRole
            ? `Continue as ${selectedMeta?.title} →`
            : "Select a role to continue"}
        </button>

        {/* ── MetaMask notice ── */}
        {selectedRole && selectedRole !== "public" && (
          <div style={{
            marginTop: "14px", fontSize: "11px",
            color: "rgba(168,196,176,0.55)", textAlign: "center",
          }}>
            🦊 MetaMask will open to confirm your wallet connection
            {selectedRole === "officer" && (
              <span> and verify your officer status on-chain</span>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{
          marginTop: "28px", paddingTop: "18px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          display: "flex", justifyContent: "center", gap: "12px",
          flexWrap: "wrap",
        }}>
          {["⛓ Hardhat Local Network", "🏛 Kajiado County", "© 2026"].map(tag => (
            <span key={tag} style={{
              fontSize: "10px", color: "rgba(168,196,176,0.40)",
              background: "rgba(255,255,255,0.04)", borderRadius: "20px",
              padding: "3px 10px", letterSpacing: "0.3px",
            }}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Spin animation for loading icon */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}