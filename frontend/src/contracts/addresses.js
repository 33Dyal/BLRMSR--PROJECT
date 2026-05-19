// src/contracts/addresses.js
// ─────────────────────────────────────────────────────────────
// Contract addresses are loaded from environment variables.
// Never hardcode addresses here — edit frontend/.env instead.
//
// Local:   copy .env.example → .env and fill in your addresses
// Sepolia: update .env with testnet addresses after deployment
// ─────────────────────────────────────────────────────────────

const CONTRACT_ADDRESSES = {
  LandParcel:           import.meta.env.VITE_LAND_PARCEL,
  LandRegistry:         import.meta.env.VITE_LAND_REGISTRY,
  LandTransferContract: import.meta.env.VITE_LAND_TRANSFER,
  LandholderIdentity:   import.meta.env.VITE_LANDHOLDER_IDENTITY,
  StampDutyPayment:     import.meta.env.VITE_STAMP_DUTY,
  TitleDeed:            import.meta.env.VITE_TITLE_DEED,
};

// ── Validation: warn in console if any address is missing ─────
const missing = Object.entries(CONTRACT_ADDRESSES)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  console.warn(
    `[BLRMS] ⚠ Missing contract addresses in .env:\n` +
    missing.map(k => `  • VITE_${k.replace(/([A-Z])/g, "_$1").toUpperCase().slice(1)}`).join("\n") +
    `\n  → Copy .env.example to .env and fill in the values.`
  );
}

export default CONTRACT_ADDRESSES;