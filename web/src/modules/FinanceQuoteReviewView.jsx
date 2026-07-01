import { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

/* ============================================================
   مراجعة المالية لعروض الأسعار (المرحلة ١ من الدورة)
   المالية تشوف العروض المرسلة، تقارن المعروض بالتكلفة المرجعية،
   ثم توافق (رقم مرجعي) أو ترفض (سبب) — مع إشعار المبيعات.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const genderLabel = (g) => (g === "male" ? "ذكر" : g === "female" ? "أنثى" : "—");

export default function FinanceQuoteReviewView() {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await httpsCallable(functions, "getFinanceQuotes")({});
      setQuotes((res.data && res.data.quotes) || []);
    } catch (e) {
      setError(e.message || "تعذّر تحميل العروض.");
    } finally { setLoading(false); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>مراجعة عروض الأسعار</h1>
          <p style={styles.pageSub}>راجع العروض المرسلة من المبيعات مقابل التكلفة المرجعية، ثم اعتمد أو ارفض.</p>
        </div>
        <span style={styles.countBadge}>{quotes.length} بانتظار المراجعة</span>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : quotes.length === 0 ? (
        <div style={styles.emptyBox}>لا توجد عروض بانتظار المراجعة.</div>
      ) : (
        <div style={styles.list}>
          {quotes.map((q) => (
            <div key={q.id} style={styles.quoteCard} onClick={() => setActive(q)}>
              <div style={styles.quoteCardMain}>
                <span style={styles.quoteNum}>#{q.quoteNumber}</span>
                <span style={styles.quoteCust}>{q.customerName || "بدون عميل"}</span>
              </div>
              <div style={styles.quoteCardSide}>
                <span style={styles.quoteTotal} dir="ltr">{fmt(q.total)} ر.س</span>
                <span style={styles.reviewLink}>مراجعة ←</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {active ? (
        <ReviewModal quote={active} onClose={() => setActive(null)} onDone={() => { setActive(null); load(); }} />
      ) : null}
    </div>
  );
}

function ReviewModal({ quote, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const labor = quote.laborItems || [];
  const equip = quote.equipmentItems || [];

  async function approve() {
    setBusy(true); setError("");
    try {
      await httpsCallable(functions, "approvePriceQuote")({ quoteId: quote.id });
      onDone();
    } catch (e) { setError(e.message || "تعذّر الاعتماد."); setBusy(false); }
  }

  async function reject() {
    if (!reason.trim()) { setError("اذكر سبب الرفض."); return; }
    setBusy(true); setError("");
    try {
      await httpsCallable(functions, "rejectPriceQuote")({ quoteId: quote.id, reason: reason.trim() });
      onDone();
    } catch (e) { setError(e.message || "تعذّر الرفض."); setBusy(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>مراجعة عرض #{quote.quoteNumber}</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error ? <div style={styles.error}>{error}</div> : null}

        <div style={styles.modalBody}>
          <div style={styles.custRow}>العميل: <b>{quote.customerName || "—"}</b></div>

          {/* بنود العمالة — مقارنة المعروض بالمرجعي */}
          {labor.length > 0 ? <div style={styles.secLabel}>👷 بنود العمالة (المعروض مقابل المرجعي)</div> : null}
          {labor.map((it, idx) => {
            const refTotal = (Number(it.refCost) || 0) + (Number(it.refHousing) || 0) + (Number(it.refTransport) || 0);
            const margin = (Number(it.unitPrice) || 0) - refTotal;
            const ok = margin >= 0;
            return (
              <div key={idx} style={styles.reviewItem}>
                <div style={styles.reviewInfo}>
                  <span style={styles.chip}>{genderLabel(it.gender)}</span>
                  <span style={styles.chip}>{it.nationality || "—"}</span>
                  <span style={styles.chip}>{it.jobTitleName || it.jobTitle || "—"}</span>
                  <span style={styles.chipCount}>× {it.count}</span>
                </div>
                <div style={styles.compareRow}>
                  <div style={styles.compareCol}>
                    <span style={styles.compareLabel}>سعر الوحدة المعروض</span>
                    <span style={styles.compareOffered} dir="ltr">{fmt(it.unitPrice)}</span>
                  </div>
                  <div style={styles.compareCol}>
                    <span style={styles.compareLabel}>التكلفة المرجعية</span>
                    <span style={styles.compareRef} dir="ltr">{fmt(refTotal)}</span>
                  </div>
                  <div style={styles.compareCol}>
                    <span style={styles.compareLabel}>هامش الربح</span>
                    <span style={{ ...styles.compareMargin, color: ok ? "#059669" : "#dc2626" }} dir="ltr">
                      {ok ? "+" : ""}{fmt(margin)}
                    </span>
                  </div>
                </div>
                {!ok ? <div style={styles.warnLine}>⚠️ السعر المعروض أقل من التكلفة المرجعية</div> : null}
              </div>
            );
          })}

          {/* المعدات */}
          {equip.length > 0 ? <div style={styles.secLabel}>🔧 المعدات</div> : null}
          {equip.map((it, idx) => (
            <div key={idx} style={styles.equipRow}>
              <span>{it.type || "—"} {it.model ? `· ${it.model}` : ""} {it.manufacturer ? `· ${it.manufacturer}` : ""}</span>
              <span dir="ltr">{fmt(it.unitPrice)} × {it.count} = {fmt(it.lineTotal)}</span>
            </div>
          ))}

          {/* الإجماليات */}
          <div style={styles.totalsBox}>
            <div style={styles.totalRow}><span>الإجمالي قبل الضريبة</span><span dir="ltr">{fmt(quote.subtotal)}</span></div>
            <div style={styles.totalRow}><span>الضريبة {quote.vatRate || 15}%</span><span dir="ltr">{fmt(quote.taxAmount)}</span></div>
            <div style={styles.totalRowFinal}><span>الإجمالي شامل الضريبة</span><span dir="ltr">{fmt(quote.total)}</span></div>
          </div>
        </div>

        {/* أزرار المراجعة */}
        {rejecting ? (
          <div style={styles.rejectBox}>
            <label style={styles.rejectLabel}>سبب الرفض (للتوثيق) *</label>
            <textarea style={styles.rejectInput} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="مثال: السعر المعروض أقل من التكلفة، يرجى التعديل" disabled={busy} />
            <div style={styles.modalFoot}>
              <button style={styles.cancelBtn} onClick={() => { setRejecting(false); setReason(""); setError(""); }} disabled={busy}>رجوع</button>
              <button style={styles.confirmReject} onClick={reject} disabled={busy}>{busy ? "..." : "تأكيد الرفض"}</button>
            </div>
          </div>
        ) : (
          <div style={styles.modalFoot}>
            <button style={styles.rejectBtn} onClick={() => setRejecting(true)} disabled={busy}>رفض</button>
            <button style={styles.approveBtn} onClick={approve} disabled={busy}>{busy ? "جارٍ الاعتماد..." : "✓ اعتماد وإصدار رقم مرجعي"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#0891b2", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  countBadge: { padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "#0891b2", background: "#cffafe", borderRadius: 20 },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
  emptyBox: { padding: "40px 20px", textAlign: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, color: "#94a3b8", fontSize: 15 },

  list: { display: "flex", flexDirection: "column", gap: 10 },
  quoteCard: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", cursor: "pointer", transition: "border-color .15s" },
  quoteCardMain: { display: "flex", alignItems: "center", gap: 14 },
  quoteNum: { fontSize: 16, fontWeight: 800, color: "#0891b2", fontFamily: "monospace" },
  quoteCust: { fontSize: 15, fontWeight: 600, color: "#0f172a" },
  quoteCardSide: { display: "flex", alignItems: "center", gap: 16 },
  quoteTotal: { fontSize: 15, fontWeight: 700, color: "#334155", fontFamily: "monospace" },
  reviewLink: { fontSize: 13, fontWeight: 700, color: "#0891b2" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000, overflowY: "auto" },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 680, boxShadow: "0 20px 60px rgba(0,0,0,.3)" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid #e2e8f0" },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 },
  closeBtn: { width: 32, height: 32, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 15, color: "#64748b" },
  modalBody: { padding: "20px 24px", maxHeight: "58vh", overflowY: "auto" },

  custRow: { fontSize: 14, color: "#475569", marginBottom: 16 },
  secLabel: { fontSize: 14, fontWeight: 800, color: "#0891b2", margin: "12px 0 10px", paddingBottom: 6, borderBottom: "2px solid #ecfeff" },

  reviewItem: { border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 10, background: "#fafbfc" },
  reviewInfo: { display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" },
  chip: { fontSize: 12, fontWeight: 700, color: "#334155", background: "#e2e8f0", padding: "3px 10px", borderRadius: 6 },
  chipCount: { fontSize: 12, fontWeight: 700, color: "#0891b2", background: "#cffafe", padding: "3px 10px", borderRadius: 6 },
  compareRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
  compareCol: { display: "flex", flexDirection: "column", gap: 4, textAlign: "center", background: "#fff", borderRadius: 8, padding: "8px 6px", border: "1px solid #f1f5f9" },
  compareLabel: { fontSize: 11, color: "#94a3b8", fontWeight: 600 },
  compareOffered: { fontSize: 15, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },
  compareRef: { fontSize: 15, fontWeight: 700, color: "#64748b", fontFamily: "monospace" },
  compareMargin: { fontSize: 15, fontWeight: 800, fontFamily: "monospace" },
  warnLine: { marginTop: 8, fontSize: 12, color: "#dc2626", fontWeight: 600 },

  equipRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#fafbfc", borderRadius: 8, marginBottom: 8, fontSize: 13, color: "#475569" },

  totalsBox: { background: "#f8fafc", borderRadius: 10, padding: "14px 18px", marginTop: 12 },
  totalRow: { display: "flex", justifyContent: "space-between", fontSize: 14, color: "#475569", padding: "4px 0" },
  totalRowFinal: { display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, color: "#0f172a", padding: "8px 0 0", marginTop: 6, borderTop: "2px solid #e2e8f0" },

  modalFoot: { display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 24px", borderTop: "1px solid #e2e8f0" },
  rejectBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 700, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  approveBtn: { padding: "10px 22px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },

  rejectBox: { padding: "16px 24px", borderTop: "1px solid #e2e8f0", background: "#fef2f2" },
  rejectLabel: { display: "block", fontSize: 13, fontWeight: 700, color: "#b91c1c", marginBottom: 6 },
  rejectInput: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #fecaca", borderRadius: 8, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" },
  cancelBtn: { padding: "10px 18px", fontSize: 14, color: "#64748b", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  confirmReject: { padding: "10px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#dc2626", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
};
