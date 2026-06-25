import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { exportToExcel, exportToPDF, datedFileName } from "./exportUtils";

// أنواع مدينة الطبيعة (رصيدها يظهر في عمود المدين)
const DEBIT_NATURE = ["asset", "expense"];

const TYPE_LABELS = {
  asset: "الأصول", liability: "الخصوم", equity: "حقوق الملكية",
  revenue: "الإيرادات", expense: "المصروفات",
};

// ميزان المراجعة: كل الحسابات بأرصدتها، يثبت توازن المدين والدائن.
export default function TrialBalanceTab({ tenantId, companyName }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const snap = await getDocs(query(collection(db, "accounts"), where("tenantId", "==", tenantId)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
      setAccounts(list);
    } catch (err) {
      setError("تعذّر تحميل الحسابات.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const company = companyName || "الشركة";

  // تحديd عمود كل حساب (مدين/دائن) ومبلغه
  function rowFor(acc) {
    const bal = acc.balance || 0;
    const isDebitNature = DEBIT_NATURE.includes(acc.type);
    // الرصيد المخزّن موجب حسب الطبيعة. لو موجب: يظهر في عمود طبيعته.
    // لو سالب (نادر، رصيد عكسي): يظهر في العمود المقابل.
    let debit = 0, credit = 0;
    if (isDebitNature) {
      if (bal >= 0) debit = bal; else credit = -bal;
    } else {
      if (bal >= 0) credit = bal; else debit = -bal;
    }
    return { debit, credit };
  }

  // الحسابات ذات الرصيد فقط (الميزان يعرض الحسابات المتحرّكة)
  const activeAccounts = accounts.filter((a) => (a.balance || 0) !== 0);

  let totalDebit = 0, totalCredit = 0;
  const rows = activeAccounts.map((acc) => {
    const { debit, credit } = rowFor(acc);
    totalDebit += debit;
    totalCredit += credit;
    return { acc, debit, credit };
  });

  const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

  // ===== التصدير =====
  function buildExportRows() {
    return rows.map((r) => ({
      code: r.acc.code,
      name: r.acc.name,
      type: TYPE_LABELS[r.acc.type] || r.acc.type,
      debit: r.debit || "",
      credit: r.credit || "",
    }));
  }
  const exportColumns = [
    { key: "code", header: "رقم الحساب" },
    { key: "name", header: "اسم الحساب" },
    { key: "type", header: "النوع" },
    { key: "debit", header: "مدين" },
    { key: "credit", header: "دائن" },
  ];
  const exportExcel = () => exportToExcel({ rows: buildExportRows(), columns: exportColumns, fileName: datedFileName("ميزان-المراجعة"), sheetName: "ميزان المراجعة" });
  const exportPDF = () => exportToPDF({ rows: buildExportRows(), columns: exportColumns, fileName: datedFileName("ميزان-المراجعة"), header: { companyName: company, title: "ميزان المراجعة", subtitle: "Trial Balance" } });

  if (loading) return <p style={styles.muted}>جارٍ التحميل...</p>;

  return (
    <div>
      <div style={styles.toolbar}>
        <span style={styles.summaryText}>
          ميزان المراas جعة · {activeAccounts.length} حساب متحرّك
        </span>
        {rows.length > 0 ? (
          <div style={styles.toolBtns}>
            <button style={styles.pdfBtn} onClick={exportPDF}>⬇ PDF</button>
            <button style={styles.exportBtn} onClick={exportExcel}>⬇ Excel</button>
          </div>
        ) : null}
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {rows.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.muted}>لا توجد حسابات متحرّكة بعد. أنشئ قيودًا لتظهر في ميزان المراجعة.</p>
        </div>
      ) : (
        <div style={styles.panel}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>رقم الحساب</th>
                <th style={styles.th}>اسم الحساب</th>
                <th style={styles.thAmount}>مدين</th>
                <th style={styles.thAmount}>دائن</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.acc.id}>
                  <td style={styles.tdCode} dir="ltr">{r.acc.code}</td>
                  <td style={styles.tdName}>{r.acc.name}</td>
                  <td style={styles.tdAmount} dir="ltr">{r.debit ? r.debit.toLocaleString() : "—"}</td>
                  <td style={styles.tdAmount} dir="ltr">{r.credit ? r.credit.toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={styles.totalRow}>
                <td style={styles.tdTotal} colSpan={2}>الإجمالي</td>
                <td style={styles.tdAmountTotal} dir="ltr">{totalDebit.toLocaleString()} ﷼</td>
                <td style={styles.tdAmountTotal} dir="ltr">{totalCredit.toLocaleString()} ﷼</td>
              </tr>
            </tfoot>
          </table>

          {/* مؤشّر التوازن */}
          <div style={{ ...styles.balanceIndicator, ...(balanced ? styles.balancedOk : styles.balancedBad) }}>
            {balanced ? (
              <>✓ الميزان متوازن — مجموع المدين يساوي مجموع الدائن</>
            ) : (
              <>⚠ الميزان غير متوازن — فرق قدره {Math.abs(totalDebit - totalCredit).toLocaleString()} ﷼ (راجع القيود)</>
            )}
          </div>
        </div>
      )}

      <p style={styles.hint}>
        ميزان المراجعة يعرض أرصدة الحسابات المتحرّكة. توازن المجموعين دليل سلامة القيود المزدوجة.
      </p>
    </div>
  );
}

const styles = {
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 },
  summaryText: { fontSize: 14, color: "#15803d", fontWeight: 600 },
  toolBtns: { display: "flex", gap: 8 },
  pdfBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer" },
  exportBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "none", borderRadius: 8, cursor: "pointer" },

  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "right", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  thAmount: { textAlign: "left", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  tdCode: { padding: "11px 14px", fontSize: 14, fontWeight: 600, color: "#475569", fontFamily: "monospace", borderBottom: "1px solid #f1f5f9" },
  tdName: { padding: "11px 14px", fontSize: 14, borderBottom: "1px solid #f1f5f9" },
  tdAmount: { padding: "11px 14px", fontSize: 14, textAlign: "left", borderBottom: "1px solid #f1f5f9", fontWeight: 600, fontFamily: "monospace" },
  totalRow: { background: "#f8fafc" },
  tdTotal: { padding: "14px", fontSize: 15, fontWeight: 700, borderTop: "2px solid #cbd5e1" },
  tdAmountTotal: { padding: "14px", fontSize: 15, fontWeight: 700, textAlign: "left", borderTop: "2px solid #cbd5e1", color: "#16a34a", fontFamily: "monospace" },

  balanceIndicator: { padding: "14px 18px", fontSize: 14, fontWeight: 600, textAlign: "center" },
  balancedOk: { background: "#dcfce7", color: "#166534" },
  balancedBad: { background: "#fef3c7", color: "#92400e" },

  empty: { padding: 40, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  hint: { marginTop: 16, padding: "12px 16px", background: "#f0fdf4", color: "#15803d", borderRadius: 8, fontSize: 13 },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
};