import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";
import { exportToExcel, exportToPDF, datedFileName } from "../exportUtils";

/* ============================================================
   التحصيل — قسم المالية
   تعرض الفواتير الآجلة (المتبقّي على كل عميل) وتسجّل سندات القبض.
   سند القبض (createReceipt) يولّد قيدًا: مدين الخزينة / دائن الذمم المدينة،
   ويحدّث المدفوع/المتبقّي/الحالة على الفاتورة. يدعم السداد الجزئي.
   ============================================================ */

const STATUS_LABELS = { unpaid: "آجل", partial: "جزئي", paid: "مسدّد" };
const STATUS_STYLE = {
  unpaid: { background: "#fef3c7", color: "#92400e" },
  partial: { background: "#dbeafe", color: "#1e40af" },
  paid: { background: "#dcfce7", color: "#166534" },
};
const METHOD_LABELS = { cash: "نقدًا", transfer: "تحويل", cheque: "شيك" };

export default function CollectionsView() {
  const [tenantId, setTenantId] = useState("");
  const [companyName, setCompanyName] = useState("الشركة");
  const [invoices, setInvoices] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("due");
  const [receiptInvoice, setReceiptInvoice] = useState(null);

  // 1) هوية المستخدم (tenantId + اسم المنشأة)
  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) { setError("لم يتم تسجيل الدخول."); setLoading(false); return; }
        const userSnap = await getDoc(doc(db, "users", uid));
        const tid = userSnap.exists() ? userSnap.data().tenantId : null;
        if (!tid) { setError("تعذّر تحديد المنشأة لهذا المستخدم."); setLoading(false); return; }
        try {
          const tSnap = await getDoc(doc(db, "tenants", tid));
          if (tSnap.exists() && tSnap.data().name) setCompanyName(tSnap.data().name);
        } catch (e) { /* اختياري */ }
        setTenantId(tid);
      } catch (e) {
        setError("تعذّر تحميل بيانات المستخدم.");
        setLoading(false);
      }
    })();
  }, []);

  // 2) عند توفّر tenantId، حمّل الفواتير والسندات
  useEffect(() => {
    if (tenantId) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [invSnap, recSnap] = await Promise.all([
        getDocs(query(collection(db, "invoices"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "receipts"), where("tenantId", "==", tenantId))),
      ]);
      const invList = invSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      invList.sort((a, b) => (b.invoiceNumber || 0) - (a.invoiceNumber || 0));
      setInvoices(invList);

      const recList = recSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      recList.sort((a, b) => (b.receiptNumber || 0) - (a.receiptNumber || 0));
      setReceipts(recList);
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  // الفواتير الآجلة فقط (النقدية مدفوعة أصلاً). توافق الفواتير القديمة.
  function invMeta(inv) {
    const method = inv.paymentMethod || "credit";
    const total = Number(inv.total) || 0;
    const paid = Number(inv.paidAmount) || 0;
    const remaining = inv.remainingAmount != null ? Number(inv.remainingAmount) : total;
    let status = inv.paymentStatus;
    if (!status) status = remaining <= 0.01 ? "paid" : (paid > 0 ? "partial" : "unpaid");
    return { method, total, paid, remaining, status };
  }

  const creditInvoices = invoices
    .map((inv) => ({ inv, m: invMeta(inv) }))
    .filter((x) => x.m.method !== "cash");

  // غير المسددة بالكامل تظهر أولاً
  const dueList = [...creditInvoices].sort((a, b) => {
    const aOpen = a.m.remaining > 0.01 ? 0 : 1;
    const bOpen = b.m.remaining > 0.01 ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return (b.inv.invoiceNumber || 0) - (a.inv.invoiceNumber || 0);
  });

  // إجماليات لوحة المؤشرات
  const totalReceivable = creditInvoices.reduce((s, x) => s + x.m.remaining, 0);
  const openCount = creditInvoices.filter((x) => x.m.remaining > 0.01).length;
  const totalCollected = receipts.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const company = companyName;

  // تصدير سجل السندات
  function buildReceiptRows() {
    return receipts.map((r) => ({
      number: `REC-${r.receiptNumber}`,
      date: r.date,
      invoice: r.invoiceNumber ? `INV-${r.invoiceNumber}` : "",
      customer: r.customerSnapshot ? r.customerSnapshot.name : "",
      method: METHOD_LABELS[r.method] || r.method,
      amount: r.amount,
    }));
  }
  const receiptColumns = [
    { key: "number", header: "رقم السند" },
    { key: "date", header: "التاريخ" },
    { key: "invoice", header: "الفاتورة" },
    { key: "customer", header: "العميل" },
    { key: "method", header: "طريقة الاستلام" },
    { key: "amount", header: "المبلغ" },
  ];
  const exportExcel = () => exportToExcel({ rows: buildReceiptRows(), columns: receiptColumns, fileName: datedFileName("سندات-القبض"), sheetName: "سندات القبض" });
  const exportPDF = () => exportToPDF({ rows: buildReceiptRows(), columns: receiptColumns, fileName: datedFileName("سندات-القبض"), header: { companyName: company, title: "سجل سندات القبض", subtitle: "التحصيل" } });

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>التحصيل</h1>
      <p style={styles.pageSub}>تسجيل سندات القبض على الفواتير الآجلة ومتابعة المتبقّي على العملاء.</p>

      {/* لوحة المؤشرات */}
      <div style={styles.cards}>
        <div style={styles.card}>
          <span style={styles.cardLabel}>إجمالي المتبقّي (ذمم مدينة)</span>
          <span style={styles.cardValue} dir="ltr">{totalReceivable.toLocaleString()} ﷼</span>
        </div>
        <div style={styles.card}>
          <span style={styles.cardLabel}>فواتير غير مسددة</span>
          <span style={styles.cardValue}>{openCount}</span>
        </div>
        <div style={styles.card}>
          <span style={styles.cardLabel}>إجمالي المُحصّل</span>
          <span style={{ ...styles.cardValue, color: "#16a34a" }} dir="ltr">{totalCollected.toLocaleString()} ﷼</span>
        </div>
      </div>

      {/* تبويبات */}
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === "due" ? styles.tabActive : {}) }} onClick={() => setTab("due")}>
          📋 الفواتير الآجلة
        </button>
        <button style={{ ...styles.tab, ...(tab === "receipts" ? styles.tabActive : {}) }} onClick={() => setTab("receipts")}>
          🧾 سجل السندات
        </button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : (
        tab === "due" ? (
          dueList.length === 0 ? (
            <div style={styles.empty}>
              <p style={styles.muted}>لا توجد فواتير آجلة. الفواتير النقدية مدفوعة تلقائيًا.</p>
            </div>
          ) : (
            <div style={styles.panel}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>الفاتورة</th>
                    <th style={styles.th}>العميل</th>
                    <th style={styles.thAmount}>الإجمالي</th>
                    <th style={styles.thAmount}>المدفوع</th>
                    <th style={styles.thAmount}>المتبقّي</th>
                    <th style={styles.thCenter}>الحالة</th>
                    <th style={styles.thCenter}>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {dueList.map(({ inv, m }) => (
                    <tr key={inv.id}>
                      <td style={styles.tdCode} dir="ltr">INV-{inv.invoiceNumber}</td>
                      <td style={styles.tdName}>{inv.customerSnapshot ? inv.customerSnapshot.name : "—"}</td>
                      <td style={styles.tdAmount} dir="ltr">{m.total.toLocaleString()}</td>
                      <td style={styles.tdAmount} dir="ltr">{m.paid.toLocaleString()}</td>
                      <td style={{ ...styles.tdAmount, fontWeight: 700, color: m.remaining > 0.01 ? "#b45309" : "#16a34a" }} dir="ltr">{m.remaining.toLocaleString()}</td>
                      <td style={styles.tdCenter}>
                        <span style={{ ...styles.badge, ...(STATUS_STYLE[m.status] || {}) }}>{STATUS_LABELS[m.status] || m.status}</span>
                      </td>
                      <td style={styles.tdCenter}>
                        {m.remaining > 0.01 ? (
                          <button style={styles.collectBtn} onClick={() => setReceiptInvoice({ inv, m })}>💰 تحصيل</button>
                        ) : (
                          <span style={styles.doneTag}>✓ مكتمل</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <>
            <div style={styles.toolbar}>
              <span style={styles.summaryText}>{receipts.length} سند قبض</span>
              {receipts.length > 0 ? (
                <div style={styles.toolBtns}>
                  <button style={styles.pdfBtn} onClick={exportPDF}>⬇ PDF</button>
                  <button style={styles.exportBtn} onClick={exportExcel}>⬇ Excel</button>
                </div>
              ) : null}
            </div>
            {receipts.length === 0 ? (
              <div style={styles.empty}>
                <p style={styles.muted}>لا توجد سندات قبض بعد. حصّل فاتورة آجلة ليظهر سندها هنا.</p>
              </div>
            ) : (
              <div style={styles.panel}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>السند</th>
                      <th style={styles.th}>التاريخ</th>
                      <th style={styles.th}>الفاتورة</th>
                      <th style={styles.th}>العميل</th>
                      <th style={styles.thCenter}>الطريقة</th>
                      <th style={styles.thAmount}>المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((r) => (
                      <tr key={r.id}>
                        <td style={styles.tdCode} dir="ltr">REC-{r.receiptNumber}</td>
                        <td style={styles.tdName} dir="ltr">{r.date}</td>
                        <td style={styles.tdCode} dir="ltr">{r.invoiceNumber ? `INV-${r.invoiceNumber}` : "—"}</td>
                        <td style={styles.tdName}>{r.customerSnapshot ? r.customerSnapshot.name : "—"}</td>
                        <td style={styles.tdCenter}>{METHOD_LABELS[r.method] || r.method}</td>
                        <td style={{ ...styles.tdAmount, fontWeight: 700, color: "#16a34a" }} dir="ltr">{(Number(r.amount) || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      )}

      {receiptInvoice ? (
        <ReceiptForm
          invoice={receiptInvoice.inv}
          meta={receiptInvoice.m}
          onClose={() => setReceiptInvoice(null)}
          onSaved={() => { setReceiptInvoice(null); loadData(); }}
        />
      ) : null}
    </div>
  );
}

// ═══════════ مودال تسجيل سند قبض ═══════════
function ReceiptForm({ invoice, meta, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState(String(meta.remaining));
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const amountNum = Number(amount) || 0;
  const willRemain = Math.round((meta.remaining - amountNum) * 100) / 100;

  async function save() {
    setErr("");
    if (!(amountNum > 0)) { setErr("أدخل مبلغًا أكبر من صفر."); return; }
    if (amountNum > meta.remaining + 0.01) { setErr(`المبلغ يتجاوز المتبقّي (${meta.remaining.toLocaleString()} ﷼).`); return; }

    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createReceipt");
      await fn({ invoiceId: invoice.id, amount: amountNum, date, method, notes });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر تسجيل السند.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>سند قبض — INV-{invoice.invoiceNumber}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.invoiceSummary}>
          <div style={styles.sumRow}><span>العميل</span><span style={styles.sumStrong}>{invoice.customerSnapshot ? invoice.customerSnapshot.name : "—"}</span></div>
          <div style={styles.sumRow}><span>إجمالي الفاتورة</span><span dir="ltr">{meta.total.toLocaleString()} ﷼</span></div>
          <div style={styles.sumRow}><span>المدفوع سابقًا</span><span dir="ltr">{meta.paid.toLocaleString()} ﷼</span></div>
          <div style={{ ...styles.sumRow, ...styles.sumRemaining }}><span>المتبقّي</span><span dir="ltr">{meta.remaining.toLocaleString()} ﷼</span></div>
        </div>

        {err ? <div style={styles.error}>{err}</div> : null}

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>المبلغ المحصّل *</label>
            <input style={styles.input} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={saving} dir="ltr" />
            <div style={styles.quickRow}>
              <button type="button" style={styles.quickBtn} onClick={() => setAmount(String(meta.remaining))} disabled={saving}>المبلغ كامل</button>
              <button type="button" style={styles.quickBtn} onClick={() => setAmount(String(Math.round((meta.remaining / 2) * 100) / 100))} disabled={saving}>النصف</button>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>تاريخ التحصيل *</label>
            <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving} dir="ltr" />
          </div>
        </div>

        <label style={styles.label}>طريقة الاستلام</label>
        <div style={styles.methodRow}>
          {["cash", "transfer", "cheque"].map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)} disabled={saving}
              style={{ ...styles.methodBtn, ...(method === m ? styles.methodBtnActive : {}) }}>
              {METHOD_LABELS[m]}
            </button>
          ))}
        </div>

        <label style={styles.label}>ملاحظات (اختياري)</label>
        <input style={styles.input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="رقم التحويل، اسم البنك..." disabled={saving} />

        {amountNum > 0 && amountNum <= meta.remaining + 0.01 ? (
          <div style={styles.preview}>
            بعد هذا السند: المتبقّي = <strong dir="ltr">{(willRemain < 0 ? 0 : willRemain).toLocaleString()} ﷼</strong>
            {willRemain <= 0.01 ? " — الفاتورة تُسدَّد بالكامل ✓" : " — سداد جزئي"}
          </div>
        ) : null}

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>
            {saving ? "جارٍ الحفظ..." : "تسجيل السند"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#059669", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: "0 0 22px" },

  cards: { display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" },
  card: { flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 6, padding: "16px 18px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 },
  cardLabel: { fontSize: 13, color: "#64748b" },
  cardValue: { fontSize: 22, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  tabs: { display: "flex", gap: 8, marginBottom: 18, borderBottom: "2px solid #e2e8f0" },
  tab: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "none", border: "none", borderBottom: "3px solid transparent", cursor: "pointer", marginBottom: -2 },
  tabActive: { color: "#059669", borderBottomColor: "#059669" },

  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "right", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  thAmount: { textAlign: "left", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  thCenter: { textAlign: "center", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  tdCode: { padding: "11px 14px", fontSize: 14, fontWeight: 600, color: "#475569", fontFamily: "monospace", borderBottom: "1px solid #f1f5f9" },
  tdName: { padding: "11px 14px", fontSize: 14, borderBottom: "1px solid #f1f5f9" },
  tdAmount: { padding: "11px 14px", fontSize: 14, textAlign: "left", borderBottom: "1px solid #f1f5f9", fontFamily: "monospace" },
  tdCenter: { padding: "11px 14px", fontSize: 14, textAlign: "center", borderBottom: "1px solid #f1f5f9" },

  badge: { display: "inline-block", padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 },
  collectBtn: { padding: "7px 16px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" },
  doneTag: { fontSize: 13, color: "#16a34a", fontWeight: 600 },

  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 },
  summaryText: { fontSize: 14, color: "#15803d", fontWeight: 600 },
  toolBtns: { display: "flex", gap: 8 },
  pdfBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer" },
  exportBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "none", borderRadius: 8, cursor: "pointer" },

  empty: { padding: 40, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  muted: { color: "#94a3b8", fontSize: 14 },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },

  invoiceSummary: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px", marginBottom: 18 },
  sumRow: { display: "flex", justifyContent: "space-between", fontSize: 14, color: "#475569", padding: "4px 0", fontFamily: "monospace" },
  sumStrong: { fontWeight: 700, color: "#0f172a" },
  sumRemaining: { borderTop: "1px dashed #cbd5e1", marginTop: 6, paddingTop: 8, fontWeight: 800, color: "#b45309", fontSize: 16 },

  row: { display: "flex", gap: 12, marginBottom: 4 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "12px 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  quickRow: { display: "flex", gap: 6, marginTop: 6 },
  quickBtn: { flex: 1, padding: "6px 8px", fontSize: 12, fontWeight: 600, color: "#059669", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 6, cursor: "pointer" },

  methodRow: { display: "flex", gap: 8 },
  methodBtn: { flex: 1, padding: "9px 8px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#fff", border: "2px solid #e2e8f0", borderRadius: 8, cursor: "pointer" },
  methodBtnActive: { borderColor: "#059669", background: "#ecfdf5", color: "#059669" },

  preview: { marginTop: 14, padding: "10px 14px", background: "#f0fdf4", color: "#15803d", borderRadius: 8, fontSize: 13 },

  modalActions: { display: "flex", gap: 10, marginTop: 22 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" },
};
