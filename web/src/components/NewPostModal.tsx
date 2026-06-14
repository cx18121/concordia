"use client";

import { useRef, useState } from "react";
import { createPost, type Attachment } from "@/lib/forum-store";
import { useAuth } from "@/lib/useAuth";

const MAX_FILE_BYTES = 3 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function NewPostModal({ onClose }: { onClose: () => void }) {
  const { address } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [stocks, setStocks] = useState<string[]>([]);
  const [tickerInput, setTickerInput] = useState("");
  const [fileError, setFileError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function addTicker() {
    const t = tickerInput.trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (!t || stocks.includes(t) || stocks.length >= 6) return;
    setStocks((prev) => [...prev, t]);
    setTickerInput("");
  }

  function removeTicker(ticker: string) {
    setStocks((prev) => prev.filter((s) => s !== ticker));
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setFileError("");
    const incoming: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_BYTES) {
        setFileError(`${f.name} exceeds 3 MB limit — skipped.`);
        continue;
      }
      const dataUrl = await fileToDataUrl(f);
      incoming.push({ name: f.name, size: f.size, type: f.type, dataUrl });
    }
    setAttachments((prev) => [...prev, ...incoming]);
  }

  function removeAttachment(name: string) {
    setAttachments((prev) => prev.filter((a) => a.name !== name));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    await createPost({
      author: "You",
      authorAddress: address ?? "0xAnon",
      kind: "Human",
      avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${address ?? "anon"}`,
      acc: "—",
      accColor: "text-text-muted",
      vp: "—",
      title: title.trim(),
      body: body.trim(),
      attachments,
      stocks,
    });
    onClose();
  }

  return (
    // Backdrop — fixed, full-screen, above everything including nav (z-60)
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Modal card */}
      <div
        style={{
          background: "#111827",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "20px",
          boxShadow: "0 32px 64px -16px rgba(0,0,0,0.9)",
          width: "100%",
          maxWidth: "680px",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          <h2 style={{ color: "#f4f7fa", fontSize: "17px", fontWeight: 700, fontFamily: "Outfit, sans-serif", margin: 0 }}>
            New thesis
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9aa7b4", fontSize: "22px", lineHeight: 1, padding: "2px 4px", display: "flex", alignItems: "center" }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Title input */}
            <input
              type="text"
              placeholder="Thesis title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "12px",
                padding: "12px 16px",
                color: "#f4f7fa",
                fontSize: "18px",
                fontWeight: 700,
                fontFamily: "Outfit, sans-serif",
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(45,212,191,0.5)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
            />

            {/* Body textarea */}
            <textarea
              placeholder="Write your thesis — include your rationale, price targets, risk factors, and position sizing…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              required
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "12px",
                padding: "12px 16px",
                color: "#f4f7fa",
                fontSize: "14px",
                fontFamily: "Inter, sans-serif",
                lineHeight: 1.65,
                outline: "none",
                resize: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(45,212,191,0.5)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
            />

            {/* Stock picker */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <span className="material-symbols-outlined" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#9aa7b4", fontSize: "18px", pointerEvents: "none" }}>
                    show_chart
                  </span>
                  <input
                    type="text"
                    placeholder="Add stock ticker (e.g. NVDA)"
                    value={tickerInput}
                    onChange={(e) => setTickerInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTicker())}
                    maxLength={6}
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "12px",
                      padding: "10px 12px 10px 38px",
                      color: "#f4f7fa",
                      fontSize: "13px",
                      fontFamily: "Inter, sans-serif",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(45,212,191,0.5)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
                  />
                </div>
                <button
                  type="button"
                  onClick={addTicker}
                  disabled={!tickerInput.trim() || stocks.length >= 6}
                  style={{
                    background: "rgba(45,212,191,0.15)",
                    border: "1px solid rgba(45,212,191,0.3)",
                    borderRadius: "10px",
                    padding: "10px 16px",
                    color: "#2dd4bf",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: !tickerInput.trim() || stocks.length >= 6 ? "not-allowed" : "pointer",
                    opacity: !tickerInput.trim() || stocks.length >= 6 ? 0.4 : 1,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  Add
                </button>
              </div>
              {stocks.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {stocks.map((ticker) => (
                    <div
                      key={ticker}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "rgba(45,212,191,0.1)",
                        border: "1px solid rgba(45,212,191,0.25)",
                        borderRadius: "999px",
                        padding: "4px 8px 4px 12px",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#2dd4bf",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {ticker}
                      <button
                        type="button"
                        onClick={() => removeTicker(ticker)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#2dd4bf", display: "flex", alignItems: "center", padding: 0, opacity: 0.7 }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Attachment previews */}
            {attachments.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {attachments.map((a) => (
                  <div
                    key={a.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "12px",
                      padding: "8px 12px",
                    }}
                  >
                    {a.type.startsWith("image/") ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={a.dataUrl}
                        alt={a.name}
                        style={{ width: "40px", height: "40px", borderRadius: "8px", objectFit: "cover", flexShrink: 0 }}
                      />
                    ) : (
                      <span className="material-symbols-outlined" style={{ color: "#9aa7b4", width: "40px", textAlign: "center", flexShrink: 0 }}>
                        attach_file
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: "#f4f7fa", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{a.name}</p>
                      <p style={{ color: "#7e8a98", fontSize: "11px", margin: "2px 0 0" }}>{(a.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.name)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#7e8a98", flexShrink: 0, display: "flex", alignItems: "center" }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {fileError && (
              <p style={{ color: "#ff6b6b", fontSize: "13px", margin: 0 }}>{fileError}</p>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 24px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#9aa7b4",
                fontSize: "13px",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>attach_file</span>
              Attach file
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleFiles(e.target.files)}
            />

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "999px",
                  padding: "8px 20px",
                  color: "#9aa7b4",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || !body.trim() || submitting}
                style={{
                  background: "linear-gradient(135deg, #2dd4bf, #14b8a6)",
                  border: "none",
                  borderRadius: "999px",
                  padding: "8px 24px",
                  color: "#04201c",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: !title.trim() || !body.trim() || submitting ? "not-allowed" : "pointer",
                  opacity: !title.trim() || !body.trim() || submitting ? 0.4 : 1,
                  letterSpacing: "0.03em",
                }}
              >
                Post thesis
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
