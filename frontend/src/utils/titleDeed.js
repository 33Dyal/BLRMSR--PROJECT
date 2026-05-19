// src/utils/titleDeed.js
// Generates Title Deed and Transfer Certificate PDFs in the browser using jsPDF.
// Also computes a keccak256 hash of the PDF bytes for on-chain storage.

import { jsPDF } from "jspdf";
import { ethers } from "ethers";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(timestamp) {
  const d = timestamp ? new Date(Number(timestamp) * 1000) : new Date();
  return d.toLocaleDateString("en-KE", {
    day: "2-digit", month: "long", year: "numeric"
  });
}

function formatAddress(addr) {
  if (!addr) return "N/A";
  return addr.slice(0, 10) + "..." + addr.slice(-8);
}

function drawHeader(doc, type) {
  // Top border bar
  doc.setFillColor(10, 60, 40);
  doc.rect(0, 0, 210, 18, "F");

  // Title text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("REPUBLIC OF KENYA", 105, 7, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Ministry of Lands, Public Works, Housing & Urban Development", 105, 12, { align: "center" });
  doc.text("Kajiado County — Rongai Sub-County Land Registry", 105, 16.5, { align: "center" });

  // Coat of arms placeholder (circle with text)
  doc.setFillColor(240, 240, 220);
  doc.setDrawColor(10, 60, 40);
  doc.setLineWidth(0.8);
  doc.circle(105, 34, 12, "FD");
  doc.setTextColor(10, 60, 40);
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.text("KENYA", 105, 33, { align: "center" });
  doc.text("HARAMBEE", 105, 37, { align: "center" });

  // Document type heading
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(10, 60, 40);
  doc.text(type === "deed" ? "TITLE DEED" : "LAND TRANSFER CERTIFICATE", 105, 56, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(
    type === "deed"
      ? "Issued under the Land Registration Act, Cap 300 (Kenya)"
      : "Issued under the Land Registration Act & Stamp Duty Act (Kenya)",
    105, 62, { align: "center" }
  );

  // Divider
  doc.setDrawColor(10, 60, 40);
  doc.setLineWidth(0.5);
  doc.line(15, 66, 195, 66);
}

function drawSection(doc, title, y) {
  doc.setFillColor(230, 245, 237);
  doc.rect(14, y, 182, 7, "F");
  doc.setTextColor(10, 60, 40);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(title, 17, y + 5);
  return y + 10;
}

function drawRow(doc, label, value, y, shade) {
  if (shade) {
    doc.setFillColor(248, 250, 248);
    doc.rect(14, y - 1, 182, 7, "F");
  }
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(label, 17, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 20, 20);
  doc.text(String(value ?? "N/A"), 80, y + 4);
  return y + 8;
}

function drawFooter(doc, deedId, txHash) {
  const pageH = doc.internal.pageSize.height;

  // QR placeholder box
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.rect(15, pageH - 52, 28, 28);
  doc.setFontSize(6);
  doc.setTextColor(120, 120, 120);
  doc.text("Scan to verify", 29, pageH - 22, { align: "center" });
  doc.text("on Etherscan", 29, pageH - 18, { align: "center" });

  // Footer text
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(`Deed ID: ${deedId}`, 50, pageH - 48);
  doc.text(`Blockchain TX: ${txHash ? txHash.slice(0, 42) + "..." : "Pending on-chain confirmation"}`, 50, pageH - 42);
  doc.text(`Generated: ${new Date().toLocaleString("en-KE")}`, 50, pageH - 36);
  doc.text("This document is cryptographically secured on the Ethereum blockchain.", 50, pageH - 28);
  doc.text("Verify authenticity at: https://sepolia.etherscan.io", 50, pageH - 22);

  // Bottom bar
  doc.setFillColor(10, 60, 40);
  doc.rect(0, pageH - 12, 210, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text(
    "Rongai Blockchain Land Registry Management System — Kajiado County, Kenya © 2026",
    105, pageH - 5, { align: "center" }
  );
}

// ── Generate Title Deed PDF ────────────────────────────────────────────────

/**
 * Generates a Title Deed PDF for a newly registered parcel.
 *
 * @param {object} parcel   - parcel data from LandRegistry.getParcel()
 * @param {string} txHash   - blockchain transaction hash of the registration
 * @returns {{ pdfBytes: Uint8Array, pdfDataUri: string, hash: string, deedId: string }}
 */
export async function generateTitleDeed(parcel, txHash) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const deedId = `DEED-${parcel.parcelId}-${Date.now()}`;

  drawHeader(doc, "deed");

  let y = 72;

  // ── Parcel Details ──
  y = drawSection(doc, "PARCEL DETAILS", y);
  y = drawRow(doc, "Parcel ID",          parcel.parcelId,                      y, false);
  y = drawRow(doc, "Title Deed Number",  parcel.titleDeedNumber,               y, true);
  y = drawRow(doc, "LR Number",          parcel.lrNumber,                      y, false);
  y = drawRow(doc, "Land Use",           parcel.landUse,                       y, true);
  y = drawRow(doc, "Area",               `${parcel.areaSquareMeters?.toString()} sq. metres`, y, false);
  y = drawRow(doc, "Assessed Value",     `KES ${Number(parcel.landValueKES ?? 0).toLocaleString()}`, y, true);
  y = drawRow(doc, "Registration Date",  formatDate(parcel.registeredAt),      y, false);
  y += 4;

  // ── Owner Details ──
  y = drawSection(doc, "REGISTERED OWNER", y);
  y = drawRow(doc, "Owner Address",      parcel.currentOwner,                  y, false);
  y = drawRow(doc, "Owner DID",          parcel.ownerDID,                      y, true);
  y = drawRow(doc, "Status",             parcel.isActive ? "Active" : "Inactive", y, false);
  y += 4;

  // ── Blockchain Proof ──
  y = drawSection(doc, "BLOCKCHAIN PROOF", y);
  y = drawRow(doc, "Network",            "Ethereum Sepolia Testnet",            y, false);
  y = drawRow(doc, "Transaction Hash",   txHash ? formatAddress(txHash) : "Pending", y, true);
  y = drawRow(doc, "Deed ID",            deedId,                               y, false);
  y = drawRow(doc, "Issued At",          formatDate(null),                     y, true);
  y += 8;

  // ── Signature block ──
  doc.setDrawColor(10, 60, 40);
  doc.setLineWidth(0.3);
  doc.line(20, y + 20, 80, y + 20);
  doc.line(120, y + 20, 185, y + 20);
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text("Registrar of Lands", 50, y + 25, { align: "center" });
  doc.text("Date & Official Stamp", 152, y + 25, { align: "center" });

  drawFooter(doc, deedId, txHash);

  const pdfBytes   = doc.output("arraybuffer");
  const uint8      = new Uint8Array(pdfBytes);
  const hash       = ethers.keccak256(uint8);
  const pdfDataUri = doc.output("datauristring");

  return { pdfBytes: uint8, pdfDataUri, hash, deedId };
}

// ── Generate Transfer Certificate PDF ─────────────────────────────────────

/**
 * Generates a Transfer Certificate PDF after a completed land transfer.
 *
 * @param {object} transfer  - transfer data from LandTransferContract.getTransfer()
 * @param {object} parcel    - parcel data from LandRegistry.getParcel()
 * @param {string} txHash    - blockchain transaction hash
 * @returns {{ pdfBytes: Uint8Array, pdfDataUri: string, hash: string, deedId: string }}
 */
export async function generateTransferCertificate(transfer, parcel, txHash) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const deedId = `CERT-${transfer.transferId}-${Date.now()}`;

  drawHeader(doc, "cert");

  let y = 72;

  // ── Transfer Details ──
  y = drawSection(doc, "TRANSFER DETAILS", y);
  y = drawRow(doc, "Transfer ID",        transfer.transferId,                  y, false);
  y = drawRow(doc, "Transfer Type",      transfer.transferType,                y, true);
  y = drawRow(doc, "Agreed Price",       `KES ${Number(transfer.agreedPriceKES ?? 0).toLocaleString()}`, y, false);
  y = drawRow(doc, "Transfer Date",      formatDate(transfer.completedAt),     y, true);
  y += 4;

  // ── Parcel Details ──
  y = drawSection(doc, "PARCEL DETAILS", y);
  y = drawRow(doc, "Parcel ID",          parcel?.parcelId ?? transfer.parcelId, y, false);
  y = drawRow(doc, "Title Deed Number",  parcel?.titleDeedNumber ?? "N/A",     y, true);
  y = drawRow(doc, "LR Number",          parcel?.lrNumber ?? "N/A",            y, false);
  y = drawRow(doc, "Area",               parcel ? `${parcel.areaSquareMeters?.toString()} sq. metres` : "N/A", y, true);
  y += 4;

  // ── Seller Details ──
  y = drawSection(doc, "TRANSFEROR (SELLER)", y);
  y = drawRow(doc, "Seller Address",     transfer.seller,                      y, false);
  y = drawRow(doc, "Seller DID",         transfer.sellerDID,                   y, true);
  y += 4;

  // ── Buyer Details ──
  y = drawSection(doc, "TRANSFEREE (BUYER)", y);
  y = drawRow(doc, "Buyer Address",      transfer.buyer,                       y, false);
  y = drawRow(doc, "Buyer DID",          transfer.buyerDID,                    y, true);
  y += 4;

  // ── Blockchain Proof ──
  y = drawSection(doc, "BLOCKCHAIN PROOF", y);
  y = drawRow(doc, "Network",            "Ethereum Sepolia Testnet",            y, false);
  y = drawRow(doc, "Transaction Hash",   txHash ? formatAddress(txHash) : "Pending", y, true);
  y = drawRow(doc, "Certificate ID",     deedId,                               y, false);
  y = drawRow(doc, "Issued At",          formatDate(null),                     y, true);
  y += 8;

  // ── Signature block ──
  doc.setDrawColor(10, 60, 40);
  doc.setLineWidth(0.3);
  doc.line(20, y + 20, 80, y + 20);
  doc.line(120, y + 20, 185, y + 20);
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text("Registrar of Lands", 50, y + 25, { align: "center" });
  doc.text("Date & Official Stamp", 152, y + 25, { align: "center" });

  drawFooter(doc, deedId, txHash);

  const pdfBytes   = doc.output("arraybuffer");
  const uint8      = new Uint8Array(pdfBytes);
  const hash       = ethers.keccak256(uint8);
  const pdfDataUri = doc.output("datauristring");

  return { pdfBytes: uint8, pdfDataUri, hash, deedId };
}
