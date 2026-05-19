// src/utils/generateTitleDeed.js
// Generates a Title Deed or Transfer Certificate PDF entirely in the browser.
// Returns { pdfBlob, documentHash } — hash is stored on-chain, blob is downloaded.

import { jsPDF } from "jspdf";
import { ethers } from "ethers";

// ── Helpers ───────────────────────────────────────────────────────
function formatDate(timestamp) {
  const d = timestamp ? new Date(Number(timestamp) * 1000) : new Date();
  return d.toLocaleDateString("en-KE", {
    day: "2-digit", month: "long", year: "numeric"
  });
}

function formatKES(amount) {
  if (!amount) return "N/A";
  return "KES " + parseInt(amount).toLocaleString("en-KE");
}

function drawHorizontalLine(doc, y, margin = 20) {
  doc.setDrawColor(180, 160, 100);
  doc.setLineWidth(0.5);
  doc.line(margin, y, 210 - margin, y);
}

function sectionHeader(doc, text, y) {
  doc.setFillColor(20, 60, 40);
  doc.rect(20, y, 170, 8, "F");
  doc.setTextColor(220, 200, 120);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(text.toUpperCase(), 25, y + 5.5);
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "normal");
  return y + 12;
}

function fieldRow(doc, label, value, y, labelX = 22, valueX = 80) {
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text(label + ":", labelX, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 20, 20);
  const lines = doc.splitTextToSize(value || "N/A", 210 - valueX - 20);
  doc.text(lines, valueX, y);
  return y + lines.length * 5 + 2;
}

// ── Hash PDF bytes ────────────────────────────────────────────────
async function hashPDFBytes(pdfBlob) {
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const hashBuffer  = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray   = Array.from(new Uint8Array(hashBuffer));
  const hashHex     = "0x" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  // Return as bytes32 (ethers bytes32 compatible)
  return ethers.zeroPadValue(hashHex.slice(0, 66), 32);
}

// ── Generate Title Deed PDF ───────────────────────────────────────
export async function generateTitleDeed(parcelData, ownerData = {}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  let y = 0;

  // ── Border ──
  doc.setDrawColor(20, 60, 40);
  doc.setLineWidth(3);
  doc.rect(5, 5, 200, 287);
  doc.setLineWidth(0.5);
  doc.rect(7, 7, 196, 283);

  // ── Header background ──
  doc.setFillColor(14, 48, 30);
  doc.rect(5, 5, 200, 45, "F");

  // ── Kenya Coat of Arms placeholder ──
  doc.setFillColor(180, 160, 100);
  doc.circle(pageW / 2, 22, 10, "F");
  doc.setTextColor(14, 48, 30);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("COAT", pageW / 2, 20, { align: "center" });
  doc.text("OF ARMS", pageW / 2, 24, { align: "center" });

  // ── Header text ──
  doc.setTextColor(220, 200, 120);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("REPUBLIC OF KENYA", pageW / 2, 36, { align: "center" });
  doc.setFontSize(10);
  doc.setTextColor(200, 220, 200);
  doc.text("Ministry of Lands, Housing & Urban Development", pageW / 2, 42, { align: "center" });

  y = 55;

  // ── Document title ──
  doc.setTextColor(14, 48, 30);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("TITLE DEED", pageW / 2, y, { align: "center" });
  y += 6;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Land Registration Act, Cap 300 (Kenya)", pageW / 2, y, { align: "center" });
  y += 4;
  doc.text("Rongai Sub-County — Kajiado County", pageW / 2, y, { align: "center" });
  y += 8;

  drawHorizontalLine(doc, y);
  y += 6;

  // ── Deed metadata ──
  const deedId    = `DEED-${parcelData.parcelId || parcelData.parcelNumber}-${Date.now()}`;
  const issueDate = formatDate(parcelData.registeredAt);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 20);
  doc.text(`Deed Reference: ${deedId}`, 22, y);
  doc.text(`Issue Date: ${issueDate}`, pageW - 22, y, { align: "right" });
  y += 10;

  // ── Parcel details ──
  y = sectionHeader(doc, "Land Parcel Details", y);
  y = fieldRow(doc, "Parcel ID",          parcelData.parcelId || parcelData.parcelNumber, y);
  y = fieldRow(doc, "Title Deed No.",     parcelData.titleDeedNumber || deedId,            y);
  y = fieldRow(doc, "LR Number",          parcelData.lrNumber || `LR.No.${parcelData.parcelId || parcelData.parcelNumber}`, y);
  y = fieldRow(doc, "Location",           parcelData.location || "Rongai Ward, Kajiado County, Kenya", y);
  y = fieldRow(doc, "Land Use",           parcelData.landUse  || "Residential",            y);
  y = fieldRow(doc, "Area",               `${parcelData.areaSquareMeters?.toString() || parcelData.area || "N/A"} square metres`, y);
  y = fieldRow(doc, "Assessed Value",     formatKES(parcelData.landValueKES),               y);
  y += 4;

  // ── Owner details ──
  y = sectionHeader(doc, "Registered Owner", y);
  y = fieldRow(doc, "Owner Address",   parcelData.currentOwner || parcelData.to || ownerData.address || "N/A", y);
  y = fieldRow(doc, "Owner DID",       parcelData.ownerDID     || `did:rongai:${parcelData.currentOwner || parcelData.to || ""}`, y);
  y = fieldRow(doc, "ID Type",         ownerData.idType        || "National ID",  y);
  y = fieldRow(doc, "Verified",        parcelData.isActive !== undefined ? (parcelData.isActive ? "Yes" : "No") : "Yes", y);
  y += 4;

  // ── Blockchain details ──
  y = sectionHeader(doc, "Blockchain Record", y);
  y = fieldRow(doc, "Network",         "Ethereum — Sepolia Testnet",              y);
  y = fieldRow(doc, "Smart Contract",  "Rongai Land Registry — LandRegistry.sol", y);
  y = fieldRow(doc, "Registered At",   formatDate(parcelData.registeredAt),        y);
  y = fieldRow(doc, "Last Updated",    formatDate(parcelData.lastUpdatedAt),        y);
  y = fieldRow(doc, "Status",          parcelData.isActive !== false ? "Active — Title Vested" : "Inactive", y);
  y += 4;

  // ── Legal declaration ──
  y = sectionHeader(doc, "Declaration", y);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  const declaration = [
    "This Title Deed is issued under the Land Registration Act, Cap 300 of the Laws of Kenya and confirms",
    "that the person named herein is the registered proprietor of the land described in this deed.",
    "This record is immutably stored on a blockchain ledger and carries the same legal weight as a",
    "conventionally issued title deed under Kenyan land law."
  ];
  declaration.forEach(line => {
    doc.text(line, pageW / 2, y, { align: "center" });
    y += 5;
  });
  y += 4;

  drawHorizontalLine(doc, y);
  y += 8;

  // ── Signatures ──
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);

  const sigY = y;
  doc.text("____________________________", 30,  sigY);
  doc.text("____________________________", 130, sigY);
  y = sigY + 5;
  doc.setFont("helvetica", "bold");
  doc.text("Registrar of Lands",           30,  y);
  doc.text("Authorised Officer",           130, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.text("Rongai Sub-County Land Office",30,  y);
  doc.text("Kajiado County Government",    130, y);
  y += 4;
  doc.text(`Date: ${new Date().toLocaleDateString("en-KE")}`, 30, y);
  y += 10;

  // ── QR code placeholder (Etherscan link text) ──
  drawHorizontalLine(doc, y);
  y += 5;
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text("Verify this deed on-chain:", pageW / 2, y, { align: "center" });
  y += 4;
  doc.setTextColor(0, 80, 160);
  const verifyUrl = `https://sepolia.etherscan.io/address/${parcelData.currentOwner || parcelData.to || ""}`;
  doc.text(verifyUrl, pageW / 2, y, { align: "center" });
  y += 4;
  doc.setTextColor(80, 80, 80);
  doc.text(`Deed ID: ${deedId}`, pageW / 2, y, { align: "center" });

  // ── Footer ──
  doc.setFillColor(14, 48, 30);
  doc.rect(5, 285, 200, 7, "F");
  doc.setTextColor(180, 160, 100);
  doc.setFontSize(7);
  doc.text(
    "Rongai Blockchain Land Registry Management System — Kajiado County, Kenya © 2026",
    pageW / 2, 290, { align: "center" }
  );

  // ── Generate blob and hash ──
  const pdfBlob     = doc.output("blob");
  const documentHash = await hashPDFBytes(pdfBlob);

  return { doc, pdfBlob, documentHash, deedId };
}

// ── Generate Transfer Certificate PDF ────────────────────────────
export async function generateTransferCertificate(transferData, parcelData = {}) {
  const doc  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  let y = 0;

  // ── Border ──
  doc.setDrawColor(20, 40, 80);
  doc.setLineWidth(3);
  doc.rect(5, 5, 200, 287);
  doc.setLineWidth(0.5);
  doc.rect(7, 7, 196, 283);

  // ── Header ──
  doc.setFillColor(15, 30, 80);
  doc.rect(5, 5, 200, 45, "F");

  doc.setFillColor(180, 160, 100);
  doc.circle(pageW / 2, 22, 10, "F");
  doc.setTextColor(15, 30, 80);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("COAT", pageW / 2, 20, { align: "center" });
  doc.text("OF ARMS", pageW / 2, 24, { align: "center" });

  doc.setTextColor(220, 200, 120);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("REPUBLIC OF KENYA", pageW / 2, 36, { align: "center" });
  doc.setFontSize(10);
  doc.setTextColor(200, 210, 240);
  doc.text("Ministry of Lands, Housing & Urban Development", pageW / 2, 42, { align: "center" });

  y = 55;

  doc.setTextColor(15, 30, 80);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("TRANSFER CERTIFICATE", pageW / 2, y, { align: "center" });
  y += 6;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Certificate of Land Ownership Transfer", pageW / 2, y, { align: "center" });
  y += 4;
  doc.text("Rongai Sub-County — Kajiado County", pageW / 2, y, { align: "center" });
  y += 8;

  drawHorizontalLine(doc, y);
  y += 6;

  const certId    = `CERT-${transferData.transferId || transferData.parcelId}-${Date.now()}`;
  const issueDate = formatDate(null);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 20);
  doc.text(`Certificate Ref: ${certId}`, 22, y);
  doc.text(`Issue Date: ${issueDate}`, pageW - 22, y, { align: "right" });
  y += 10;

  // ── Transfer details ──
  y = sectionHeader(doc, "Transfer Details", y);
  y = fieldRow(doc, "Transfer ID",    transferData.transferId   || "N/A", y);
  y = fieldRow(doc, "Parcel ID",      transferData.parcelId     || "N/A", y);
  y = fieldRow(doc, "Transfer Type",  transferData.transferType || "Sale", y);
  y = fieldRow(doc, "Agreed Price",   formatKES(transferData.agreedPriceKES || transferData.price), y);
  y = fieldRow(doc, "Transfer Date",  formatDate(transferData.completedAt),  y);
  y += 4;

  // ── Seller ──
  y = sectionHeader(doc, "Transferor (Seller)", y);
  y = fieldRow(doc, "Address",    transferData.seller    || "N/A", y);
  y = fieldRow(doc, "DID",        transferData.sellerDID || "N/A", y);
  y += 4;

  // ── Buyer ──
  y = sectionHeader(doc, "Transferee (Buyer)", y);
  y = fieldRow(doc, "Address",    transferData.buyer    || "N/A", y);
  y = fieldRow(doc, "DID",        transferData.buyerDID || "N/A", y);
  y += 4;

  // ── Parcel summary ──
  y = sectionHeader(doc, "Land Parcel Summary", y);
  y = fieldRow(doc, "Location",   parcelData.location  || "Rongai Ward, Kajiado County", y);
  y = fieldRow(doc, "Land Use",   parcelData.landUse   || "Residential", y);
  y = fieldRow(doc, "Area",       `${parcelData.areaSquareMeters?.toString() || "N/A"} sq.m`, y);
  y += 4;

  // ── Blockchain record ──
  y = sectionHeader(doc, "Blockchain Record", y);
  y = fieldRow(doc, "Network",    "Ethereum — Sepolia Testnet", y);
  y = fieldRow(doc, "Contract",   "LandTransferContract.sol",   y);
  y = fieldRow(doc, "IPFS Docs",  transferData.ipfsDocHash || transferData.ipfsHash || "N/A", y);
  y += 4;

  // ── Legal declaration ──
  y = sectionHeader(doc, "Declaration", y);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  const declaration = [
    "This Transfer Certificate confirms that ownership of the land described herein has been",
    "duly transferred in accordance with the Land Registration Act, Cap 300 of Kenya.",
    "This transaction is permanently and immutably recorded on the Rongai Blockchain",
    "Land Registry and cannot be altered or deleted."
  ];
  declaration.forEach(line => {
    doc.text(line, pageW / 2, y, { align: "center" });
    y += 5;
  });
  y += 4;

  drawHorizontalLine(doc, y);
  y += 8;

  // ── Signatures ──
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  const sigY = y;
  doc.text("____________________________", 30,  sigY);
  doc.text("____________________________", 130, sigY);
  y = sigY + 5;
  doc.setFont("helvetica", "bold");
  doc.text("Registrar of Lands",           30,  y);
  doc.text("Authorised Officer",           130, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.text("Rongai Sub-County Land Office",30,  y);
  doc.text("Kajiado County Government",    130, y);
  y += 10;

  drawHorizontalLine(doc, y);
  y += 5;
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text("Verify this certificate on-chain:", pageW / 2, y, { align: "center" });
  y += 4;
  doc.setTextColor(0, 80, 160);
  doc.text(`https://sepolia.etherscan.io/tx/${certId}`, pageW / 2, y, { align: "center" });
  y += 4;
  doc.setTextColor(80, 80, 80);
  doc.text(`Certificate ID: ${certId}`, pageW / 2, y, { align: "center" });

  // ── Footer ──
  doc.setFillColor(15, 30, 80);
  doc.rect(5, 285, 200, 7, "F");
  doc.setTextColor(180, 160, 100);
  doc.setFontSize(7);
  doc.text(
    "Rongai Blockchain Land Registry Management System — Kajiado County, Kenya © 2026",
    pageW / 2, 290, { align: "center" }
  );

  const pdfBlob      = doc.output("blob");
  const documentHash = await hashPDFBytes(pdfBlob);

  return { doc, pdfBlob, documentHash, certId };
}