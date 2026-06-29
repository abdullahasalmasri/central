import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";
import { exportToExcel, exportToPDF, datedFileName } from "../exportUtils";

/* ============================================================
   الخزينة — قسم المالية
   تعرض رصيد النقد وحركاته (وارد/صادر) من القيود، وتسجّل سندات الصرف.
   سند الصرف (createPayment) يولّد قيدًا: مدين المصروف / دائن الخزينة.
   ============================================================ */

const TREASURY_CODE = "1100";
const METHOD_LABELS = { cash: "نقدًا", transfer: "تحويل", cheque: "شيك" };

export default function TreasuryView() {
  const [tenantId, setTenantId] = useState("");
  const [companyName, setCompanyName] = useState("الشركة");
  const [accounts, setAccounts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("movements");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) { setError("لم يتم تسجيل الدخول."); setLoading(false); return; }
        const userSnap = await getDoc(doc(db, "users", uid));
        const tid = userSnap.exists() ? userSnap.data().tenantId : null;
        if (!tid) { setError("تعذّر تحديد المنشأة."); setLoading(false); return; }
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

  useEffect(() => {
    if (tenantId) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [accSnap, jeSnap, paySnap] = await Promise.all([
        getDocs(query(collection(db, "accounts"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "journalEntries"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "payments"), where("tenantId", "==", tenantId))),
      ]);
      setAccounts(accSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setEntries(jeSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      const payList = paySnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      payList.sort((a, b) => (b.paymentNumber || 0) - (a.paymentNumber || 0));
      setPayments(payList);
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  const company = companyName;
  const treasury = accounts.find((a) => a.code === TREASURY_CODE) || null;
  const expenseAccounts = accounts
    .filter((a) => a.type === "expense" && a.isActive !== false)
    .sort((a, b) => (a.code || "").localeCompare(b.code || ""));
  const balance = treasury ? (Number(treasury.balance) || 0) : 0;

  // حركات الخزينة من القيود المعتمدة
  const movements = [];
  let totalIn = 0, totalOut = 0;
  if (treasury) {
    for (const je of entries) {
      if (je.status && je.status !== "posted") continue;
      for (const ln of (je.lines || [])) {
        if (ln.accountId === treasury.id) {
          const debit = Number(ln.debit) || 0;
          const credit = Number(ln.credit) || 0;
          totalIn += debit;
          totalOut += credit;
          movements.push({
            date: je.date || "",
            entryNumber: je.entryNumber || null,
            description: je.description || "",
            note: ln.note || "",
            debit, credit,
          });
        }
      }
    }
    movements.sort((a, b) => (a.date).localeCompare(b.date) || (a.entryNumber || 0) - (b.entryNumber || 0));
  }
  // الرصيد الجاري
  let run = 0;
  const movementsRun = movements.map((m) => { run += m.debit - m.credit; return { ...m, running: run }; });
  const displayMovements = [...movementsRun].reverse(); // الأحدث أولاً

  // تصدير الحركات
  function buildMovRows() {
    return movementsRun.map((m) => ({
      date: m.date,
      entry: m.entryNumber ? `#${m.entryNumber}` : "",
      desc: [m.description, m.note].filter(Boolean).join(" — "),
      in: m.debit || "",
      out: m.credit || "",
      balance: m.running,
    }));
  }
  const movColumns = [
    { key: "date", header: "التاريخ" },
    { key: "entry", header: "القيد" },
    { key: "desc", header: "البيان" },
    { key: "in", header: "وارد" },
    { key: "out", header: "صادر" },
    { key: "balance", header: "الرصيد" },
  ];
  const exportMovExcel = () => exportToExcel({ rows: buildMovRows(), columns: movColumns, fileName: datedFileName("حركات-الخزينة"), sheetName: "حركات الخزينة" });
  const exportMovPDF = () => exportToPDF({ rows: buildMovRows(), columns: movColumns, fileName: datedFileName("حركات-الخزينة"), header: { companyName: company, title: "حركات الخزينة", subtitle: "النقد وما في حكمه" } });

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>الخزينة</h1>
          <p style={styles.pageSub}>رصيد النقد وحركاته، وتسجيل سندات الصرف.</p>
        </div>
        <button style={styles.payBtn} onClick={() => setShowForm(true)} disabled={!treasury}>➖ سند صرف</button>
      </div>

      {!treasury && !loading ? (
        <div style={styles.error}>حساب الخزينة (1100) غير موجود في دليل الحسابات. أنشئ دليل الحسابات أولًا.</div>
      ) : null}

      {/* مؤشرات */}
      <div style={styles.cards}>
        <div style={styles.cardBig}>
          <span style={styles.cardLabel}>رصيد الخزينة الحالي</span>
          <span style={{ ...styles.cardValueBig, color: balance >= 0 ? "#059669" : "#dc2626" }} dir="ltr">{balance.toLocaleString()} ﷼</span>
        </div>
        <div style={styles.card}>
          <span style={styles.cardLabel}>إجمالي الوارد</span>
          <span style={{ ...styles.cardValue, color: "#16a34a" }} dir="ltr">{totalIn.toLocaleString()}</span>
        </div>
        <div style={styles.card}>
          <span style={styles.cardLabel}>إجمالي الصادر</span>
          <span style={{ ...styles.cardValue, color: "#dc2626" }} dir="ltr">{totalOut.toLocaleString()}</span>
        </div>
      </div>

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === "movements" ? styles.tabActive : {}) }} onClick={() => setTab("movements")}>
          💵 حركات الخزينة
        </button>
        <button style={{ ...styles.tab, ...(tab === "payments" ? styles.tabActive : {}) }} onClick={() => setTab("payments")}>
          🧾 سندات الصرف
        </button>
      </div>

      {error && treasury ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : (
        tab === "movements" ? (
          <>
            <div style={styles.toolbar}>
              <span style={styles.summaryText}>{movements.length} حركة</span>
              {movements.length > 0 ? (
                <div style={styles.toolBtns}>
                  <button style={styles.pdfBtn} onClick={exportMovPDF}>⬇ PDF</button>
                  <button style={styles.exportBtn} onClick={exportMovExcel}>⬇ Excel</button>
                </div>
              ) : null}
            </div>
            {movements.length === 0 ? (
              <div style={styles.empty}><p style={styles.muted}>لا توجد حركات نقدية بعد.</p></div>
            ) : (
              <div style={styles.panel}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>التاريخ</th>
                      <th style={styles.th}>البيان</th>
                      <th style={styles.thAmount}>وارد</th>
                      <th style={styles.thAmount}>صادر</th>
                      <th style={styles.thAmount}>الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayMovements.map((m, i) => (
                      <tr key={i}>
                        <td style={styles.tdName} dir="ltr">{m.date}</td>
                        <td style={styles.tdName}>
                          {m.entryNumber ? <span style={styles.entryTag}>#{m.entryNumber}</span> : null}
                          {[m.description, m.note].filter(Boolean).join(" — ") || "—"}
                        </td>
                        <td style={{ ...styles.tdAmount, color: "#16a34a" }} dir="ltr">{m.debit ? m.debit.toLocaleString() : "—"}</td>
                        <td style={{ ...styles.tdAmount, color: "#dc2626" }} dir="ltr">{m.credit ? m.credit.toLocaleString() : "—"}</td>
                        <td style={{ ...styles.tdAmount, fontWeight: 700 }} dir="ltr">{m.running.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          payments.length === 0 ? (
            <div style={styles.empty}><p style={styles.muted}>لا توجد سندات صرف بعد. اضغط «سند صرف» لتسجيل مصروف نقدي.</p></div>
          ) : (
            <div style={styles.panel}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>السند</th>
                    <th style={styles.th}>التاريخ</th>
                    <th style={styles.th}>المصروف</th>
                    <th style={styles.th}>المستفيد</th>
                    <th style={styles.thCenter}>الطريقة</th>
                    <th style={styles.thAmount}>المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td style={styles.tdCode} dir="ltr">PAY-{p.paymentNumber}</td>
                      <td style={styles.tdName} dir="ltr">{p.date}</td>
                      <td style={styles.tdName}>
                        {p.expenseAccountCode ? <span style={styles.entryTag}>{p.expenseAccountCode}</span> : null}
                        {p.expenseAccountName || "—"}
                      </td>
                      <td style={styles.tdName}>{p.beneficiary || "—"}</td>
                      <td style={styles.tdCenter}>{METHOD_LABELS[p.method] || p.method}</td>
                      <td style={{ ...styles.tdAmount, fontWeight: 700, color: "#dc2626" }} dir="ltr">{(Number(p.amount) || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )
      )}

      {showForm ? (
        <PaymentForm
          expenseAccounts={expenseAccounts}
          balance={balance}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadData(); }}
        />
      ) : null}
    </div>
  );
}

// ═══════════ مودال سند الصرف ═══════════
function PaymentForm({ expenseAccounts, balance, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [beneficiary, setBeneficiary] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const amountNum = Number(amount) || 0;
  const exceedsBalance = amountNum > balance + 0.01;

  async function save() {
    setErr("");
    if (!expenseAccountId) { setErr("اختر حساب المصروف."); return; }
    if (!(amountNum > 0)) { setErr("أدخل مبلغًا أكبر من صفر."); return; }
    if (exceedsBalance) { setErr(`المبلغ يتجاوز رصيد الخزينة (${balance.toLocaleString()} ﷼).`); return; }

    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createPayment");
      await fn({ date, expenseAccountId, amount: amountNum, method, beneficiary, notes });
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
          <h2 style={styles.modalTitle}>سند صرف</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.balanceHint}>
          <span>رصيد الخزينة المتاح</span>
          <span dir="ltr" style={{ fontWeight: 800, color: balance >= 0 ? "#059669" : "#dc2626" }}>{balance.toLocaleString()} ﷼</span>
        </div>

        {err ? <div style={styles.error}>{err}</div> : null}

        <label style={styles.label}>حساب المصروف *</label>
        <select style={styles.input} value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)} disabled={saving}>
          <option value="">— اختر حساب المصروف —</option>
          {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
        </select>

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>المبلغ *</label>
            <input style={{ ...styles.input, ...(exceedsBalance ? styles.inputError : {}) }} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={saving} dir="ltr" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>التاريخ *</label>
            <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving} dir="ltr" />
          </div>
        </div>
        {exceedsBalance ? <div style={styles.warnSmall}>⚠ المبلغ يتجاوز رصيد الخزينة المتاح.</div> : null}

        <label style={styles.label}>طريقة الصرف</label>
        <div style={styles.methodRow}>
          {["cash", "transfer", "cheque"].map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)} disabled={saving}
              style={{ ...styles.methodBtn, ...(method === m ? styles.methodBtnActive : {}) }}>
              {METHOD_LABELS[m]}
            </button>
          ))}
        </div>

        <label style={styles.label}>المستفيد (اختياري)</label>
        <input style={styles.input} value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="اسم المستفيد / الجهة" disabled={saving} />

        <label style={styles.label}>ملاحظات (اختياري)</label>
        <input style={styles.input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="رقم الفاتورة، البيان..." disabled={saving} />

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving || exceedsBalance}>
            {saving ? "جارٍ الحفظ..." : "تسجيل السند"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#059669", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  payBtn: { padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#dc2626", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  cards: { display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" },
  cardBig: { flex: 2, minWidth: 240, display: "flex", flexDirection: "column", gap: 6, padding: "18px 20px", background: "#fff", border: "2px solid #059669", borderRadius: 12 },
  card: { flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 6, padding: "16px 18px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 },
  cardLabel: { fontSize: 13, color: "#64748b" },
  cardValueBig: { fontSize: 28, fontWeight: 800, fontFamily: "monospace" },
  cardValue: { fontSize: 20, fontWeight: 800, fontFamily: "monospace" },

  tabs: { display: "flex", gap: 8, marginBottom: 18, borderBottom: "2px solid #e2e8f0" },
  tab: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "none", border: "none", borderBottom: "3px solid transparent", cursor: "pointer", marginBottom: -2 },
  tabActive: { color: "#059669", borderBottomColor: "#059669" },

  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 },
  summaryText: { fontSize: 14, color: "#15803d", fontWeight: 600 },
  toolBtns: { display: "flex", gap: 8 },
  pdfBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer" },
  exportBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "none", borderRadius: 8, cursor: "pointer" },

  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "right", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  thAmount: { textAlign: "left", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  thCenter: { textAlign: "center", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  tdCode: { padding: "11px 14px", fontSize: 14, fontWeight: 600, color: "#475569", fontFamily: "monospace", borderBottom: "1px solid #f1f5f9" },
  tdName: { padding: "11px 14px", fontSize: 14, borderBottom: "1px solid #f1f5f9" },
  tdAmount: { padding: "11px 14px", fontSize: 14, textAlign: "left", borderBottom: "1px solid #f1f5f9", fontFamily: "monospace" },
  tdCenter: { padding: "11px 14px", fontSize: 14, textAlign: "center", borderBottom: "1px solid #f1f5f9" },
  entryTag: { display: "inline-block", padding: "1px 8px", marginLeft: 8, background: "#eef2ff", color: "#4338ca", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "monospace" },

  empty: { padding: 40, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  muted: { color: "#94a3b8", fontSize: 14 },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },

  balanceHint: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, marginBottom: 16, fontSize: 14, color: "#475569" },

  row: { display: "flex", gap: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "12px 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  inputError: { borderColor: "#dc2626", background: "#fef2f2" },
  warnSmall: { padding: "8px 12px", background: "#fef3c7", color: "#92400e", borderRadius: 8, fontSize: 12, marginTop: 8 },

  methodRow: { display: "flex", gap: 8 },
  methodBtn: { flex: 1, padding: "9px 8px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#fff", border: "2px solid #e2e8f0", borderRadius: 8, cursor: "pointer" },
  methodBtnActive: { borderColor: "#059669", background: "#ecfdf5", color: "#059669" },

  modalActions: { display: "flex", gap: 10, marginTop: 22 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" },
};
