// src/utils/validation.js
// ─────────────────────────────────────────────────────────────
// Centralised input validation for all forms in BLRMS.
// Every rule returns: { valid: boolean, message: string }
// ─────────────────────────────────────────────────────────────

/* ── Ethereum Address ────────────────────────────────────────── */
export function validateAddress(value, fieldName = "Address") {
  const v = (value || "").trim();
  if (!v) return { valid: false, message: `${fieldName} is required.` };
  if (!v.startsWith("0x")) return { valid: false, message: `${fieldName} must start with 0x.` };
  if (!/^0x[0-9a-fA-F]{40}$/.test(v))
    return { valid: false, message: `${fieldName} must be 0x + 40 hex characters (got ${v.length - 2} hex chars).` };
  return { valid: true, message: "" };
}

/* ── Parcel ID  ───────────────────────────────────────────────
   Accepted formats:
     RONGAI/001/2026
     KAJIADO/RNG/001/2026
   Rule: 2–4 uppercase segments separated by /
         each segment: letters or digits, 1–20 chars
   ────────────────────────────────────────────────────────── */
export function validateParcelId(value) {
  const v = (value || "").trim();
  if (!v) return { valid: false, message: "Parcel ID is required." };
  const segments = v.split("/");
  if (segments.length < 2 || segments.length > 4)
    return { valid: false, message: "Parcel ID must have 2–4 segments separated by / (e.g. RONGAI/001/2026)." };
  for (const seg of segments) {
    if (!/^[A-Z0-9]{1,20}$/.test(seg))
      return { valid: false, message: `Each segment must be uppercase letters/digits only — got "${seg}".` };
  }
  return { valid: true, message: "" };
}

/* ── Transfer ID ─────────────────────────────────────────────
   Accepted: TXN-RNG-2026-123456-4521
   Rule: alphanumeric + hyphens, 8–50 chars
   ────────────────────────────────────────────────────────── */
export function validateTransferId(value) {
  const v = (value || "").trim();
  if (!v) return { valid: false, message: "Transfer ID is required." };
  if (v.length < 8 || v.length > 50)
    return { valid: false, message: "Transfer ID must be between 8 and 50 characters." };
  if (!/^[A-Z0-9\-]+$/i.test(v))
    return { valid: false, message: "Transfer ID may only contain letters, digits, and hyphens." };
  return { valid: true, message: "" };
}

/* ── Payment ID ──────────────────────────────────────────────
   Accepted: SDP-RNG-2026-123456-4521
   Same rules as Transfer ID
   ────────────────────────────────────────────────────────── */
export function validatePaymentId(value) {
  const v = (value || "").trim();
  if (!v) return { valid: false, message: "Payment ID is required." };
  if (v.length < 8 || v.length > 60)
    return { valid: false, message: "Payment ID must be between 8 and 60 characters." };
  if (!/^[A-Z0-9\-]+$/i.test(v))
    return { valid: false, message: "Payment ID may only contain letters, digits, and hyphens." };
  return { valid: true, message: "" };
}

/* ── Area (sq metres) ────────────────────────────────────────── */
export function validateArea(value) {
  const n = Number(value);
  if (!value && value !== 0) return { valid: false, message: "Area is required." };
  if (isNaN(n) || n <= 0)    return { valid: false, message: "Area must be a positive number." };
  if (n > 10_000_000)        return { valid: false, message: "Area seems too large — maximum is 10,000,000 sq.m." };
  if (!Number.isInteger(n))  return { valid: false, message: "Area must be a whole number (no decimals)." };
  return { valid: true, message: "" };
}

/* ── Transaction Value (KES) ─────────────────────────────────── */
export function validateKES(value) {
  const n = Number(value);
  if (!value && value !== 0) return { valid: false, message: "Transaction value is required." };
  if (isNaN(n) || n <= 0)    return { valid: false, message: "Transaction value must be a positive number." };
  if (n < 1000)              return { valid: false, message: "Transaction value must be at least KES 1,000." };
  if (n > 10_000_000_000)    return { valid: false, message: "Transaction value exceeds maximum (KES 10 billion)." };
  return { valid: true, message: "" };
}

/* ── Full Name ───────────────────────────────────────────────── */
export function validateFullName(value) {
  const v = (value || "").trim();
  if (!v)          return { valid: false, message: "Full name is required." };
  if (v.length < 3) return { valid: false, message: "Full name must be at least 3 characters." };
  if (v.length > 100) return { valid: false, message: "Full name must be under 100 characters." };
  if (!/^[a-zA-Z\s'\-\.]+$/.test(v))
    return { valid: false, message: "Full name may only contain letters, spaces, hyphens, apostrophes and dots." };
  if (v.split(/\s+/).length < 2)
    return { valid: false, message: "Please enter your full name (at least first and last name)." };
  return { valid: true, message: "" };
}

/* ── National ID / Passport Number ──────────────────────────── */
export function validateNationalId(value) {
  const v = (value || "").trim();
  if (!v) return { valid: false, message: "ID number is required." };
  if (v.length < 5 || v.length > 20)
    return { valid: false, message: "ID number must be between 5 and 20 characters." };
  if (!/^[A-Z0-9\-]+$/i.test(v))
    return { valid: false, message: "ID number may only contain letters, digits, and hyphens." };
  return { valid: true, message: "" };
}

/* ── Location Description ────────────────────────────────────── */
export function validateLocation(value) {
  const v = (value || "").trim();
  if (!v)           return { valid: false, message: "Location description is required." };
  if (v.length < 5)  return { valid: false, message: "Location must be at least 5 characters." };
  if (v.length > 200) return { valid: false, message: "Location must be under 200 characters." };
  return { valid: true, message: "" };
}

/* ── Agreed Price (KES) — same as KES but field-labelled ─────── */
export function validatePrice(value) {
  const n = Number(value);
  if (!value && value !== 0) return { valid: false, message: "Agreed price is required." };
  if (isNaN(n) || n < 0)     return { valid: false, message: "Price must be zero or a positive number." };
  return { valid: true, message: "" };
}

/* ── Run multiple validations at once ────────────────────────────
   Usage:
     const errors = validateAll([
       [validateParcelId, parcelId],
       [validateArea,     area],
     ]);
     if (errors.length) { show errors; return; }
   ────────────────────────────────────────────────────────────── */
export function validateAll(rules) {
  return rules
    .map(([fn, value, ...args]) => fn(value, ...args))
    .filter(r => !r.valid)
    .map(r => r.message);
}