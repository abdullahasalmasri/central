import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   عروض الأسعار — قسم المبيعات والتسويق
   عرض سعر برقم تلقائي + تاريخ ووقت الإصدار + ضريبة 15%.
   يصدر مستقلًّا أو مرتبطًا بصفقة.
   getQuotes / createQuote / updateQuote / deleteQuote.
   ============================================================ */

const VAT_RATE = 15;
const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const STATUS_INFO = {
  draft: { label: "مسودّة", color: "#64748b", bg: "#f1f5f9" },
  sent: { label: "مُرسل", color: "#2563eb", bg: "#dbeafe" },
  accepted: { label: "مقبول", color: "#16a34a", bg: "#dcfce7" },
  rejected: { label: "مرفوض", color: "#dc2626", bg: "#fee2e2" },
  expired: { label: "منتهٍ", color: "#92400e", bg: "#fef3c7" },
};
const STATUS_ORDER = ["draft", "sent", "accepted", "rejected", "expired"];

function fmtDateTime(millis) {
  if (!millis) return "—";
  const d = new Date(millis);
  const date = d.toLocaleDateString("en-GB"); // DD/MM/YYYY
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

export default function QuotesView() {
  const [tenantId, setTenantId] = useState("");
  const [data, setData] = useState(null);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) { setError("لم يتم تسجيل الدخول."); setLoading(false); return; }
        const userSnap = await getDoc(doc(db, "users", uid));
        const tid = userSnap.exists() ? userSnap.data().tenantId : null;
        if (!tid) { setError("تعذّر تحديد المنشأة."); setLoading(false); return; }
        setTenantId(tid);
      } catch (e) {
        setError("تعذّر تحميل بيانات المستخدم."); setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (tenantId) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [qRes, sRes] = await Promise.all([
        httpsCallable(functions, "getQuotes")({}),
        httpsCallable(functions, "getSalesData")({}).catch(() => ({ data: { deals: [] } })),
      ]);
      setData(qRes.data);
      setDeals((sRes.data && sRes.data.deals) || []);
    } catch (e) {
      setError(e.message || "تعذّر تحميل العروض.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const s = data ? data.summary : { total: 0, totalValue: 0, acceptedCount: 0, acceptedValue: 0 };
  const quotes = data ? data.quotes : [];

  async function changeStatus(quoteId, status) {
    try {
      await httpsCallable(functions, "updateQuote")({ quoteId, status });
      loadData();
    } catch (e) { alert(e.message || "تعذّر التحديث."); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>عروض الأسعار</h1>
          <p style={styles.pageSub}>إصدار عروض أسعار رسمية برقم وتاريخ تلقائي.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setModal("new")}>+ عرض جديد</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : !data ? (
        <div style={styles.warnBox}>تعذّر تحميل العروض.</div>
      ) : (
        <>
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>إجمالي العروض</span><span style={styles.kpiValue}>{s.total}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>قيمة العروض</span><span style={{ ...styles.kpiValue, color: "#db2777" }} dir="ltr">{fmt(s.totalValue)}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>عروض مقبولة</span><span style={{ ...styles.kpiValue, color: "#16a34a" }}>{s.acceptedCount}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>قيمة المقبولة</span><span style={{ ...styles.kpiValue, color: "#16a34a" }} dir="ltr">{fmt(s.acceptedValue)}</span></div>
          </div>

          {quotes.length === 0 ? (
            <div style={styles.warnBox}>لا توجد عروض أسعار. أنشئ عرضك الأول.</div>
          ) : (
            <div style={styles.list}>
              {quotes.map((q) => {
                const st = STATUS_INFO[q.status] || STATUS_INFO.draft;
                return (
                  <div key={q.id} style={styles.quoteCard}>
                    <div style={styles.qHead}>
                      <div style={styles.qNumWrap}>
                        <span style={styles.qNum}>عرض #{String(q.quoteNumber).padStart(4, "0")}</span>
                        <span style={{ ...styles.statusChip, color: st.color, background: st.bg }}>{st.label}</span>
                      </div>
                      <span style={styles.qIssued}>📅 {fmtDateTime(q.issuedAt)}</span>
                    </div>

                    <div style={styles.qBody}>
                      {q.customerName ? <div style={styles.qCustomer}>🏢 {q.customerName}</div> : null}
                      <div style={styles.qDesc}>{q.description}</div>
                    </div>

                    <div style={styles.qTotals}>
                      <div style={styles.qTotalItem}><span style={styles.qtLabel}>المبلغ</span><span style={styles.qtVal} dir="ltr">{fmt(q.amount)}</span></div>
                      <div style={styles.qTotalItem}><span style={styles.qtLabel}>ضريبة {q.vatRate}%</span><span style={styles.qtVal} dir="ltr">{fmt(q.vatAmount)}</span></div>
                      <div style={styles.qTotalItem}><span style={styles.qtLabel}>الإجمالي</span><span style={styles.qtGrand} dir="ltr">{fmt(q.totalWithVat)} ﷼</span></div>
                    </div>

                    {q.validUntil ? <div style={styles.qValid}>صالح حتى: <span dir="ltr">{q.validUntil}</span></div> : null}

                    <div style={styles.qActions}>
                      <select style={styles.statusSelect} value={q.status} onChange={(e) => changeStatus(q.id, e.target.value)}>
                        {STATUS_ORDER.map((st2) => <option key={st2} value={st2}>{STATUS_INFO[st2].label}</option>)}
                      </select>
                      <button style={styles.editBtn} onClick={() => setModal({ edit: q })}>✏️ تعديل</button>
                      <DeleteBtn quoteId={q.id} num={q.quoteNumber} onDone={loadData} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {modal === "new" ? <QuoteModal deals={deals} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.edit ? <QuoteModal quote={modal.edit} deals={deals} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
    </div>
  );
}

function DeleteBtn({ quoteId, num, onDone }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm(`حذف عرض #${String(num).padStart(4, "0")}؟`)) return;
    setBusy(true);
    try {
      await httpsCallable(functions, "deleteQuote")({ quoteId });
      onDone();
    } catch (e) { alert(e.message || "تعذّر الحذف."); setBusy(false); }
  }
  return <button style={styles.delBtn} onClick={del} disabled={busy}>{busy ? "..." : "🗑 حذف"}</button>;
}

function QuoteModal({ quote, deals, onClose, onSaved }) {
  const isEdit = !!quote;
  const q = quote || {};
  const [f, setF] = useState({
    dealId: q.dealId || "", customerName: q.customerName || "", description: q.description || "",
    amount: q.amount ? String(q.amount) : "", validUntil: q.validUntil || "", notes: q.notes || "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // عند اختيار صفقة: عبّئ العميل والمبلغ
  function pickDeal(dealId) {
    const d = deals.find((x) => x.id === dealId);
    if (d) setF((p) => ({ ...p, dealId, customerName: p.customerName || d.customerName || "", amount: p.amount || (d.value ? String(d.value) : "") }));
    else setF((p) => ({ ...p, dealId }));
  }

  const amountNum = Number(f.amount) || 0;
  const vat = Math.round(amountNum * (VAT_RATE / 100) * 100) / 100;
  const total = Math.round((amountNum + vat) * 100) / 100;

  async function save() {
    setErr("");
    if (f.description.trim().length < 2) { setErr("وصف العرض مطلوب."); return; }
    if (amountNum <= 0) { setErr("المبلغ يجب أن يكون أكبر من صفر."); return; }
    setSaving(true);
    try {
      const payload = {
        customerName: f.customerName.trim(), description: f.description.trim(),
        amount: amountNum, validUntil: f.validUntil, notes: f.notes.trim(),
      };
      if (isEdit) {
        await httpsCallable(functions, "updateQuote")({ quoteId: quote.id, ...payload });
      } else {
        await httpsCallable(functions, "createQuote")({ ...payload, dealId: f.dealId || undefined });
      }
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>{isEdit ? `تعديل عرض #${String(quote.quoteNumber).padStart(4, "0")}` : "عرض سعر جديد"}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {err ? <div style={styles.error}>{err}</div> : null}

        {!isEdit && deals.length > 0 ? (
          <div style={styles.field}>
            <label style={styles.label}>ربط بصفقة (اختياري)</label>
            <select style={styles.input} value={f.dealId} onChange={(e) => pickDeal(e.target.value)} disabled={saving}>
              <option value="">— عرض مستقل —</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.name}{d.customerName ? ` — ${d.customerName}` : ""}</option>)}
            </select>
          </div>
        ) : null}

        <div style={styles.field}><label style={styles.label}>العميل / الشركة</label><input style={styles.input} value={f.customerName} onChange={(e) => set("customerName", e.target.value)} disabled={saving} placeholder="اسم العميل" /></div>
        <div style={styles.field}><label style={styles.label}>وصف العرض *</label><textarea style={styles.textarea} value={f.description} onChange={(e) => set("description", e.target.value)} disabled={saving} rows={2} placeholder="توريد 50 عاملًا لمدة 6 أشهر..." /></div>
        <div style={styles.field}><label style={styles.label}>المبلغ (قبل الضريبة) *</label><input style={styles.input} type="number" min="0" value={f.amount} onChange={(e) => set("amount", e.target.value)} disabled={saving} dir="ltr" placeholder="0.00" /></div>

        {/* معاينة الإجمالي */}
        <div style={styles.preview}>
          <div style={styles.prRow}><span>المبلغ</span><span dir="ltr">{fmt(amountNum)}</span></div>
          <div style={styles.prRow}><span>ضريبة {VAT_RATE}%</span><span dir="ltr">{fmt(vat)}</span></div>
          <div style={styles.prGrand}><span>الإجمالي</span><span dir="ltr">{fmt(total)} ﷼</span></div>
        </div>

        <div style={styles.field}><label style={styles.label}>صالح حتى (اختياري)</label><input style={styles.input} type="date" value={f.validUntil} onChange={(e) => set("validUntil", e.target.value)} disabled={saving} dir="ltr" /></div>
        <div style={styles.field}><label style={styles.label}>ملاحظات (اختياري)</label><textarea style={styles.textarea} value={f.notes} onChange={(e) => set("notes", e.target.value)} disabled={saving} rows={2} /></div>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الإصدار..." : isEdit ? "حفظ" : "إصدار العرض"}</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#db2777", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  addBtn: { padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#db2777", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 24, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  list: { display: "flex", flexDirection: "column", gap: 14 },
  quoteCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px" },
  qHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10, flexWrap: "wrap" },
  qNumWrap: { display: "flex", alignItems: "center", gap: 10 },
  qNum: { fontSize: 17, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },
  statusChip: { fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 12px" },
  qIssued: { fontSize: 13, color: "#64748b", fontWeight: 600, fontFamily: "monospace" },

  qBody: { marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #f1f5f9" },
  qCustomer: { fontSize: 14, fontWeight: 600, color: "#334155", marginBottom: 6 },
  qDesc: { fontSize: 14, color: "#475569", lineHeight: 1.6 },

  qTotals: { display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 10 },
  qTotalItem: { display: "flex", flexDirection: "column", gap: 3 },
  qtLabel: { fontSize: 12, color: "#94a3b8", fontWeight: 600 },
  qtVal: { fontSize: 15, fontWeight: 700, color: "#334155", fontFamily: "monospace" },
  qtGrand: { fontSize: 17, fontWeight: 800, color: "#db2777", fontFamily: "monospace" },

  qValid: { fontSize: 12, color: "#92400e", background: "#fffbeb", borderRadius: 6, padding: "5px 10px", display: "inline-block", marginBottom: 12 },
  qActions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 },
  statusSelect: { padding: "7px 12px", fontSize: 13, fontWeight: 700, border: "1px solid #cbd5e1", borderRadius: 7, fontFamily: "inherit", background: "#fff", cursor: "pointer" },
  editBtn: { padding: "7px 14px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },
  delBtn: { padding: "7px 14px", fontSize: 13, fontWeight: 600, color: "#dc2626", background: "#fef2f2", border: "none", borderRadius: 7, cursor: "pointer" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },

  preview: { background: "#fdf2f8", border: "1px solid #fbcfe8", borderRadius: 10, padding: "12px 16px", marginBottom: 14 },
  prRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b", marginBottom: 6, fontWeight: 600 },
  prGrand: { display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, color: "#db2777", paddingTop: 8, borderTop: "1px solid #fbcfe8" },

  modalActions: { display: "flex", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#db2777", border: "none", borderRadius: 8, cursor: "pointer" },
};
