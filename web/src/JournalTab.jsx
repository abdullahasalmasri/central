import { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { exportToExcel, exportToPDF, datedFileName } from "./exportUtils";

// تبويب القيود اليومية: إنشاء قيد متوازن + عرض القيود.
export default function JournalTab({ tenantId, companyName }) {
  const [accounts, setAccounts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [viewEntry, setViewEntry] = useState(null);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [accSnap, entSnap] = await Promise.all([
        getDocs(query(collection(db, "accounts"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "journalEntries"), where("tenantId", "==", tenantId))),
      ]);
      const accList = accSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      accList.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
      setAccounts(accList.filter((a) => a.isActive !== false));

      const entList = entSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      entList.sort((a, b) => (b.entryNumber || 0) - (a.entryNumber || 0));
      setEntries(entList);
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const company = companyName || "الشركة";

  // ===== التصدير =====
  function buildRows() {
    return entries.map((e) => ({
      number: e.entryNumber,
      date: e.date,
      description: e.description || "",
      debit: e.totalDebit,
      credit: e.totalCredit,
      source: sourceLabel(e.source),
    }));
  }
  const exportColumns = [
    { key: "number", header: "رقم القيد" },
    { key: "date", header: "التاريخ" },
    { key: "description", header: "البيان" },
    { key: "debit", header: "مدين" },
    { key: "credit", header: "دائن" },
    { key: "source", header: "المصدر" },
  ];
  const exportExcel = () => exportToExcel({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("القيود"), sheetName: "القيود" });
  const exportPDF = () => exportToPDF({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("القيود"), header: { companyName: company, title: "دفتر اليومية", subtitle: "القيود المحاسبية" } });

  if (loading) return <p style={styles.muted}>جارٍ التحميل...</p>;

  // لا توجد حسابات — لا يمكن إنشاء قيود
  if (accounts.length === 0) {
    return (
      <div style={styles.notice}>
        <p style={styles.noticeText}>أنشئ دليل الحسابات أولاً (من تبويب «دليل الحسابات») قبل إنشاء القيود.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.toolbar}>
        <span style={styles.count}>{entries.length} قيد</span>
        <div style={styles.toolBtns}>
          {entries.length > 0 ? (
            <>
              <button style={styles.pdfBtn} onClick={exportPDF}>⬇ PDF</button>
              <button style={styles.exportBtn} onClick={exportExcel}>⬇ Excel</button>
            </>
          ) : null}
          <button style={styles.addBtn} onClick={() => setShowForm(true)}>+ قيد جديد</button>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {entries.length === 0 ? (
        <p style={styles.muted}>لا توجد قيود بعد. أنشئ أول قيد.</p>
      ) : (
        <table style={styles.table}>
          <thead><tr>
            <th style={styles.th}>القيد</th><th style={styles.th}>التاريخ</th>
            <th style={styles.th}>البيان</th><th style={styles.th}>المبلغ</th>
            <th style={styles.th}>المصدر</th><th style={styles.th}></th>
          </tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td style={styles.tdNum} dir="ltr">JE-{e.entryNumber}</td>
                <td style={styles.td} dir="ltr">{e.date}</td>
                <td style={styles.td}>{e.description || "—"}</td>
                <td style={styles.tdAmount} dir="ltr">{(e.totalDebit || 0).toLocaleString()} ﷼</td>
                <td style={styles.td}><span style={styles.sourceTag}>{sourceLabel(e.source)}</span></td>
                <td style={styles.td}>
                  <button style={styles.viewBtn} onClick={() => setViewEntry(e)}>عرض</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm ? (
        <JournalForm accounts={accounts} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadData(); }} />
      ) : null}

      {viewEntry ? (
        <EntryDetail entry={viewEntry} onClose={() => setViewEntry(null)} />
      ) : null}
    </div>
  );
}

function sourceLabel(s) {
  const map = { manual: "يدوي", invoice: "فاتورة", payroll: "رواتب", procurement: "مشتريات" };
  return map[s] || s || "يدوي";
}

// ═══ نموذج إنشاء قيد ═══
function JournalForm({ accounts, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  // أطراف القيد: نبدأ بطرفين
  const [lines, setLines] = useState([
    { accountId: "", debit: "", credit: "" },
    { accountId: "", debit: "", credit: "" },
  ]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  function updateLine(idx, field, value) {
    setLines((prev) => prev.map((ln, i) => {
      if (i !== idx) return ln;
      const updated = { ...ln, [field]: value };
      // إدخال مدين يصفّر الدائن والعكس
      if (field === "debit" && value) updated.credit = "";
      if (field === "credit" && value) updated.debit = "";
      return updated;
    }));
  }

  function addLine() {
    setLines((prev) => [...prev, { accountId: "", debit: "", credit: "" }]);
  }
  function removeLine(idx) {
    if (lines.length <= 2) return; // طرفان على الأقل
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  // حساب المجاميع
  const totalDebit = lines.reduce((s, ln) => s + (Number(ln.debit) || 0), 0);
  const totalCredit = lines.reduce((s, ln) => s + (Number(ln.credit) || 0), 0);
  const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0;

  async function save() {
    setErr("");
    // تحقّق محلّي
    const cleanLines = lines
      .filter((ln) => ln.accountId && (Number(ln.debit) > 0 || Number(ln.credit) > 0))
      .map((ln) => ({
        accountId: ln.accountId,
        debit: Number(ln.debit) || 0,
        credit: Number(ln.credit) || 0,
      }));

    if (cleanLines.length < 2) { setErr("القيد يحتاج طرفين على الأقل بحساب ومبلغ."); return; }
    if (!balanced) { setErr("القيد غير متوازن — مجموع المدين يجب أن يساوي مجموع الدائن."); return; }

    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createJournalEntry");
      await fn({ date, description, lines: cleanLines, source: "manual" });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر حفظ القيد.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modalWide} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>قيد يومية جديد</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>التاريخ *</label>
            <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving} dir="ltr" />
          </div>
          <div style={{ flex: 2 }}>
            <label style={styles.label}>البيان</label>
            <input style={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف القيد..." disabled={saving} />
          </div>
        </div>

        <label style={styles.label}>أطراف القيد</label>
        <div style={styles.linesHead}>
          <span style={styles.lhAccount}>الحساب</span>
          <span style={styles.lhAmount}>مدين</span>
          <span style={styles.lhAmount}>دائن</span>
          <span style={styles.lhDel}></span>
        </div>

        {lines.map((ln, idx) => (
          <div key={idx} style={styles.lineRow}>
            <select style={styles.lineAccount} value={ln.accountId} onChange={(e) => updateLine(idx, "accountId", e.target.value)} disabled={saving}>
              <option value="">— اختر حسابًا —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
              ))}
            </select>
            <input style={styles.lineAmount} type="number" min="0" value={ln.debit} onChange={(e) => updateLine(idx, "debit", e.target.value)} placeholder="0" disabled={saving} dir="ltr" />
            <input style={styles.lineAmount} type="number" min="0" value={ln.credit} onChange={(e) => updateLine(idx, "credit", e.target.value)} placeholder="0" disabled={saving} dir="ltr" />
            <button style={styles.delBtn} onClick={() => removeLine(idx)} disabled={saving || lines.length <= 2} title="حذف الطرف">✕</button>
          </div>
        ))}

        <button style={styles.addLineBtn} onClick={addLine} disabled={saving}>+ إضافة طرف</button>

        {/* شريط التوازن */}
        <div style={{ ...styles.balanceBar, ...(balanced ? styles.balanceOk : styles.balanceBad) }}>
          <span>المدين: {totalDebit.toLocaleString()} ﷼</span>
          <span>الدائن: {totalCredit.toLocaleString()} ﷼</span>
          <span style={styles.balanceStatus}>
            {balanced ? "✓ متوازن" : totalDebit === 0 ? "أدخل المبالغ" : `الفرق: ${Math.abs(totalDebit - totalCredit).toLocaleString()}`}
          </span>
        </div>

        {err ? <div style={styles.error}>{err}</div> : null}

        <button style={{ ...styles.save, ...(balanced ? {} : styles.saveDisabled) }} onClick={save} disabled={saving || !balanced}>
          {saving ? "جارٍ الترحيل..." : "ترحيل القيد"}
        </button>
      </div>
    </div>
  );
}

// ═══ تفاصيل قيد ═══
function EntryDetail({ entry, onClose }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modalWide} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>قيد JE-{entry.entryNumber}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.detailMeta}>
          <span>📅 {entry.date}</span>
          <span style={styles.sourceTag}>{sourceLabel(entry.source)}</span>
        </div>
        {entry.description ? <p style={styles.detailDesc}>{entry.description}</p> : null}

        <table style={styles.detailTable}>
          <thead><tr>
            <th style={styles.th}>الحساب</th>
            <th style={styles.thAmount}>مدين</th>
            <th style={styles.thAmount}>دائن</th>
          </tr></thead>
          <tbody>
            {(entry.lines || []).map((ln, i) => (
              <tr key={i}>
                <td style={styles.td}>
                  <span style={styles.lineCode} dir="ltr">{ln.accountCode}</span> {ln.accountName}
                </td>
                <td style={styles.tdAmount} dir="ltr">{ln.debit ? ln.debit.toLocaleString() : "—"}</td>
                <td style={styles.tdAmount} dir="ltr">{ln.credit ? ln.credit.toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={styles.totalRow}>
              <td style={styles.tdTotal}>الإجمالي</td>
              <td style={styles.tdAmountTotal} dir="ltr">{(entry.totalDebit || 0).toLocaleString()} ﷼</td>
              <td style={styles.tdAmountTotal} dir="ltr">{(entry.totalCredit || 0).toLocaleString()} ﷼</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

const styles = {
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 },
  count: { fontSize: 14, color: "#64748b", fontWeight: 600 },
  toolBtns: { display: "flex", gap: 8 },
  pdfBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer" },
  exportBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "none", borderRadius: 8, cursor: "pointer" },
  addBtn: { padding: "9px 16px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },

  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8 },
  th: { textAlign: "right", padding: "10px 12px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0" },
  thAmount: { textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0" },
  td: { padding: "11px 12px", fontSize: 14, borderBottom: "1px solid #f1f5f9" },
  tdNum: { padding: "11px 12px", fontSize: 13, fontWeight: 700, color: "#16a34a", fontFamily: "monospace", borderBottom: "1px solid #f1f5f9" },
  tdAmount: { padding: "11px 12px", fontSize: 14, textAlign: "left", borderBottom: "1px solid #f1f5f9", fontWeight: 600 },
  sourceTag: { fontSize: 11, color: "#475569", background: "#f1f5f9", padding: "2px 8px", borderRadius: 8, fontWeight: 600 },
  viewBtn: { padding: "5px 12px", fontSize: 12, fontWeight: 600, color: "#16a34a", background: "#dcfce7", border: "none", borderRadius: 6, cursor: "pointer" },

  notice: { padding: 24, background: "#fffbeb", border: "1px solid #fcd97e", borderRadius: 12 },
  noticeText: { margin: 0, fontSize: 14, color: "#92400e" },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modalWide: { width: "100%", maxWidth: 680, background: "#fff", borderRadius: 12, padding: 28, direction: "rtl", textAlign: "right", maxHeight: "90vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  label: { display: "block", margin: "14px 0 6px", fontSize: 14, fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  row: { display: "flex", gap: 12 },

  linesHead: { display: "flex", gap: 8, padding: "0 4px 6px", alignItems: "center" },
  lhAccount: { flex: 3, fontSize: 12, fontWeight: 700, color: "#94a3b8" },
  lhAmount: { flex: 1, fontSize: 12, fontWeight: 700, color: "#94a3b8", textAlign: "center" },
  lhDel: { width: 32 },
  lineRow: { display: "flex", gap: 8, marginBottom: 8, alignItems: "center" },
  lineAccount: { flex: 3, padding: "9px 10px", fontSize: 13, border: "1px solid #ccc", borderRadius: 8, background: "#fff", minWidth: 0 },
  lineAmount: { flex: 1, padding: "9px 8px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", textAlign: "center", minWidth: 0 },
  delBtn: { width: 32, height: 32, flexShrink: 0, fontSize: 14, color: "#dc2626", background: "#fee2e2", border: "none", borderRadius: 6, cursor: "pointer" },
  addLineBtn: { marginTop: 4, padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#16a34a", background: "#dcfce7", border: "none", borderRadius: 8, cursor: "pointer" },

  balanceBar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, marginTop: 16, fontSize: 14, fontWeight: 600, flexWrap: "wrap" },
  balanceOk: { background: "#dcfce7", color: "#166534" },
  balanceBad: { background: "#fef3c7", color: "#92400e" },
  balanceStatus: { fontWeight: 700 },

  save: { width: "100%", marginTop: 20, padding: "12px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },
  saveDisabled: { background: "#cbd5e1", cursor: "not-allowed" },

  detailMeta: { display: "flex", gap: 12, alignItems: "center", marginBottom: 12, fontSize: 14, color: "#64748b" },
  detailDesc: { margin: "0 0 16px", fontSize: 15, color: "#0f172a", padding: "10px 14px", background: "#f8fafc", borderRadius: 8 },
  detailTable: { width: "100%", borderCollapse: "collapse" },
  lineCode: { fontFamily: "monospace", fontWeight: 600, color: "#64748b", marginLeft: 6 },
  totalRow: { background: "#f8fafc" },
  tdTotal: { padding: "12px", fontSize: 14, fontWeight: 700, borderTop: "2px solid #e2e8f0" },
  tdAmountTotal: { padding: "12px", fontSize: 14, fontWeight: 700, textAlign: "left", borderTop: "2px solid #e2e8f0", color: "#16a34a" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginTop: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
};