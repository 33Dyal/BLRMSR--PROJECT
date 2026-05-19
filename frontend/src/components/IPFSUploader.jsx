import { useState, useRef } from "react";

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;

async function uploadToIPFS(file) {
  if (!PINATA_JWT) throw new Error("VITE_PINATA_JWT not set in .env");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.details || `Pinata error ${res.status}`);
  }
  const data = await res.json();
  return data.IpfsHash;
}

export default function IPFSUploader({ value, onChange, label, accept }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setFileName(file.name);
    setError("");
    try {
      setUploading(true);
      const cid = await uploadToIPFS(file);
      onChange(cid);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ marginBottom: "4px" }}>
      {label && (
        <div style={{ fontSize: "12px", fontWeight: 600, color: "#5a6a7a",
          letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: "6px" }}>
          {label}
        </div>
      )}
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        onDragOver={(e) => e.preventDefault()}
        style={{ border: "2px dashed #dde3ea", borderRadius: "10px", padding: "16px 20px",
          cursor: "pointer", background: "#f9fbfc", display: "flex", alignItems: "center", gap: "12px" }}
      >
        <span style={{ fontSize: "22px" }}>{uploading ? "⏳" : "📎"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "13.5px", fontWeight: 600, color: "#1a2633" }}>
            {uploading ? "Uploading to IPFS..." : fileName ? fileName : "Click or drag a file to upload"}
          </div>
          <div style={{ fontSize: "11.5px", color: "#9aabb8", marginTop: "2px" }}>
            {accept || "any file"}
          </div>
        </div>
        <div style={{ background: "rgba(26,92,53,0.10)", border: "1.5px solid rgba(26,92,53,0.25)",
          borderRadius: "6px", color: "#1a5c35", padding: "6px 14px", fontSize: "12px", fontWeight: 700 }}>
          Choose File
        </div>
      </div>
      <input ref={inputRef} type="file" accept={accept}
        onChange={(e) => handleFile(e.target.files[0])} style={{ display: "none" }} />
      {error && <div style={{ fontSize: "12px", color: "#e05c5c", marginTop: "6px" }}>⚠ {error}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
        <input value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="IPFS CID auto-fills after upload, or paste manually"
          style={{ flex: 1, fontFamily: "monospace", fontSize: "12px", color: value ? "#1a5c35" : "#9aabb8",
            background: value ? "rgba(46,204,137,0.05)" : "#f9fbfc",
            border: "1.5px solid " + (value ? "rgba(46,204,137,0.35)" : "#dde3ea"),
            borderRadius: "6px", padding: "8px 10px", outline: "none" }} />
        {value && (
          <a href={"https://gateway.pinata.cloud/ipfs/" + value} target="_blank" rel="noreferrer"
            style={{ fontSize: "12px", color: "#2ecc89", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
            View on IPFS ↗
          </a>
        )}
      </div>
    </div>
  );
}