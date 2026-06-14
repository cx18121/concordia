"use client";

import { useRef, useState } from "react";
import { createPost, updatePost, type Attachment, type Post } from "@/lib/forum-store";
import { useAuth } from "@/lib/useAuth";

const KNOWN_TICKERS: { ticker: string; name: string }[] = [
  { ticker: "AAPL", name: "Apple" },
  { ticker: "MSFT", name: "Microsoft" },
  { ticker: "NVDA", name: "NVIDIA" },
  { ticker: "META", name: "Meta Platforms" },
  { ticker: "GOOGL", name: "Alphabet" },
  { ticker: "AMZN", name: "Amazon" },
  { ticker: "TSLA", name: "Tesla" },
  { ticker: "JPM", name: "JPMorgan Chase" },
  { ticker: "V", name: "Visa" },
  { ticker: "MA", name: "Mastercard" },
  { ticker: "UNH", name: "UnitedHealth" },
  { ticker: "XOM", name: "ExxonMobil" },
  { ticker: "JNJ", name: "Johnson & Johnson" },
  { ticker: "PG", name: "Procter & Gamble" },
  { ticker: "HD", name: "Home Depot" },
  { ticker: "AVGO", name: "Broadcom" },
  { ticker: "LLY", name: "Eli Lilly" },
  { ticker: "MRK", name: "Merck" },
  { ticker: "CVX", name: "Chevron" },
  { ticker: "ABBV", name: "AbbVie" },
  { ticker: "KO", name: "Coca-Cola" },
  { ticker: "PEP", name: "PepsiCo" },
  { ticker: "BAC", name: "Bank of America" },
  { ticker: "MCD", name: "McDonald's" },
  { ticker: "COST", name: "Costco" },
  { ticker: "WMT", name: "Walmart" },
  { ticker: "DIS", name: "Disney" },
  { ticker: "NFLX", name: "Netflix" },
  { ticker: "ADBE", name: "Adobe" },
  { ticker: "CRM", name: "Salesforce" },
  { ticker: "INTC", name: "Intel" },
  { ticker: "AMD", name: "AMD" },
  { ticker: "QCOM", name: "Qualcomm" },
  { ticker: "TXN", name: "Texas Instruments" },
  { ticker: "ORCL", name: "Oracle" },
  { ticker: "IBM", name: "IBM" },
  { ticker: "GS", name: "Goldman Sachs" },
  { ticker: "MS", name: "Morgan Stanley" },
  { ticker: "WFC", name: "Wells Fargo" },
  { ticker: "C", name: "Citigroup" },
  { ticker: "BLK", name: "BlackRock" },
  { ticker: "PYPL", name: "PayPal" },
  { ticker: "SQ", name: "Block" },
  { ticker: "COIN", name: "Coinbase" },
  { ticker: "HOOD", name: "Robinhood" },
  { ticker: "PLTR", name: "Palantir" },
  { ticker: "SNOW", name: "Snowflake" },
  { ticker: "DDOG", name: "Datadog" },
  { ticker: "CRWD", name: "CrowdStrike" },
  { ticker: "NET", name: "Cloudflare" },
  { ticker: "ZS", name: "Zscaler" },
  { ticker: "UBER", name: "Uber" },
  { ticker: "ABNB", name: "Airbnb" },
  { ticker: "SHOP", name: "Shopify" },
  { ticker: "MELI", name: "MercadoLibre" },
  { ticker: "SPOT", name: "Spotify" },
  { ticker: "NKE", name: "Nike" },
  { ticker: "SBUX", name: "Starbucks" },
  { ticker: "TGT", name: "Target" },
  { ticker: "AMGN", name: "Amgen" },
  { ticker: "GILD", name: "Gilead" },
  { ticker: "VRTX", name: "Vertex" },
  { ticker: "REGN", name: "Regeneron" },
  { ticker: "PFE", name: "Pfizer" },
  { ticker: "F", name: "Ford" },
  { ticker: "GM", name: "General Motors" },
  { ticker: "GE", name: "GE Aerospace" },
  { ticker: "BA", name: "Boeing" },
  { ticker: "CAT", name: "Caterpillar" },
  { ticker: "LMT", name: "Lockheed Martin" },
  { ticker: "RTX", name: "RTX Corp" },
  { ticker: "SPY", name: "S&P 500 ETF" },
  { ticker: "QQQ", name: "Nasdaq ETF" },
  { ticker: "GLD", name: "Gold ETF" },
  { ticker: "BTC", name: "Bitcoin" },
  { ticker: "ETH", name: "Ethereum" },
];

const MAX_FILE_BYTES = 3 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function NewPostModal({
  onClose,
  editPost,
}: {
  onClose: () => void;
  editPost?: Post;
}) {
  const { address } = useAuth();
  const [title, setTitle] = useState(editPost?.title ?? "");
  const [body, setBody] = useState(editPost?.body ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>(editPost?.attachments ?? []);
  const [stocks, setStocks] = useState<string[]>(editPost?.stocks ?? []);
  const [tickerInput, setTickerInput] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [fileError, setFileError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tickerRef = useRef<HTMLInputElement>(null);

  const suggestions = tickerInput.trim().length > 0
    ? KNOWN_TICKERS.filter(
        (k) =>
          (k.ticker.startsWith(tickerInput.trim().toUpperCase()) ||
            k.name.toLowerCase().includes(tickerInput.trim().toLowerCase())) &&
          !stocks.includes(k.ticker),
      ).slice(0, 8)
    : [];

  function addTicker(ticker?: string) {
    const t = (ticker ?? tickerInput).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!t || stocks.includes(t) || stocks.length >= 6) return;
    setStocks((prev) => [...prev, t]);
    setTickerInput("");
    setDropdownOpen(false);
    tickerRef.current?.focus();
  }

  function removeTicker(ticker: string) {
    setStocks((prev) => prev.filter((s) => s !== ticker));
  }

  function handleTickerKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); addTicker(); }
    if (e.key === "Escape") setDropdownOpen(false);
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setFileError("");
    const incoming: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_BYTES) {
        setFileError(`${f.name} is over the 3 MB limit, so it was skipped.`);
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
    if (editPost) {
      await updatePost(editPost.id, {
        title: title.trim(),
        body: body.trim(),
        attachments,
        stocks,
      });
    } else {
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
    }
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
        className="newpost-card"
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
            {editPost ? "Edit thesis" : "New thesis"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="newpost-close"
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
              placeholder="Make your case. Cover your rationale, price targets, risk factors, and position sizing."
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

            {/* Stock picker with autocomplete */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ position: "relative" }}>
                <span className="material-symbols-outlined" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#9aa7b4", fontSize: "18px", pointerEvents: "none", zIndex: 1 }}>
                  show_chart
                </span>
                <input
                  ref={tickerRef}
                  type="text"
                  placeholder="Add a ticker. Type to search (e.g. NVDA, Apple)"
                  value={tickerInput}
                  onChange={(e) => { setTickerInput(e.target.value.toUpperCase()); setDropdownOpen(true); }}
                  onKeyDown={handleTickerKeyDown}
                  onFocus={() => setDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setDropdownOpen(false), 120)}
                  maxLength={10}
                  disabled={stocks.length >= 6}
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: dropdownOpen && suggestions.length > 0 ? "12px 12px 0 0" : "12px",
                    padding: "10px 12px 10px 38px",
                    color: "#f4f7fa",
                    fontSize: "13px",
                    fontFamily: "Inter, sans-serif",
                    outline: "none",
                    boxSizing: "border-box",
                    opacity: stocks.length >= 6 ? 0.4 : 1,
                  }}
                  onFocusCapture={(e) => (e.currentTarget.style.borderColor = "rgba(45,212,191,0.5)")}
                  onBlurCapture={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
                />
                {/* Dropdown */}
                {dropdownOpen && suggestions.length > 0 && (
                  <div style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    background: "#0f1923",
                    border: "1px solid rgba(45,212,191,0.3)",
                    borderTop: "none",
                    borderRadius: "0 0 12px 12px",
                    overflow: "hidden",
                    zIndex: 10,
                    boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
                  }}>
                    {suggestions.map((s, i) => (
                      <button
                        key={s.ticker}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); addTicker(s.ticker); }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "9px 14px",
                          background: "none",
                          border: "none",
                          borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(45,212,191,0.08)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        <span style={{ color: "#2dd4bf", fontSize: "12px", fontWeight: 700, fontFamily: "Inter, monospace", minWidth: "48px", letterSpacing: "0.04em" }}>
                          {s.ticker}
                        </span>
                        <span style={{ color: "#9aa7b4", fontSize: "12px" }}>{s.name}</span>
                      </button>
                    ))}
                  </div>
                )}
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
            className="newpost-footer"
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
              className="newpost-attach"
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

            <div className="newpost-actions" style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={onClose}
                className="newpost-btn"
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
                className="newpost-btn"
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
                {submitting ? "Posting…" : editPost ? "Save changes" : "Post thesis"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
