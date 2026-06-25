import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { exportToPDF, datedFileName } from "./exportUtils";

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const yearStart = () => `${new Date().getFullYear()}-01-01`;

export default function FinancialStatementsTab({ tenantId, companyName }) {
  const [fromDate, setFromDate] = useState(yearStart());
  const [toDate, setToDate] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("income"); // income | balance

  async function generate() {
    if (fromDate > toDate) { setError("بداية الفترة بعد نهايتها."); return; }
    setLoading(true);
    setError("");
    setData(null);
    try {
      const fn = httpsCallable(functions, "getFinancialStatements");
      const r = await fn({ fromDate, toDate });
      setData(r.data);
    } catch (e) {
      setError(e.message || "تعذّر إنشاء القوائم.");
    } finally {
      setLoading(false);
    }
  }

  function exportIncome() {
    if (!data) return;
    const rows = [
      ...data.incomeStatement.revenues.map((a) => ({ band: "الإيرادات", code: a.code, name: a.name, amount: fmt(a.amount) })),
      { band: "", code: "", name: "إجمالي الإيرادات", amount: fmt(data.incomeStatement.totalRevenue) },
      ...data.incomeStatement.expenses.map((a) => ({ band: "المصروفات", code: a.code, name: a.name, amount: fmt(a.amount) })),
      { band: "", code: "", name: "إجمالي المصروفات", amount: fmt(data.incomeStatement.totalExpense) },
      { band: "", code: "", name: "صافي الدخل", amount: fmt(data.incomeStatement.netIncome) },
    ];
    exportToPDF({
      rows,
      columns: [{ key: "band", label: "البند" }, { key: "code", label: "الحساب" }, { key: "name", label: "الاسم" }, { key: "amount", label: "المبلغ" }],
      fileName: datedFileName("income_statement"),
      header: { companyName: companyName || "الشركة", title: "قائمة الدخل", subtitle: `${fromDate} ← ${toDate}` },
    });
  }

  const is = data ? data.incomeStatement : null;
  const bs = data ? data.balanceSheet : null;

  return (
    <div>
      <div style={styles.head}>
        <h2 style={styles.title}>القوائم المالية</h2>
        <p style={styles.sub}>قائمة الدخل والميزانية العمومية من القيود المعتمدة (IFRS).</p>
      </div>

      <div style={styles.controls}>
        <div style={styles.field}>
          <label style={styles.label}>من تاريخ</label>
          <input style={styles.input} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} dir="ltr" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>إلى تاريخ</label>
          <input style={styles.input} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} dir="ltr" />
        </div>
        <button style={styles.genBtn} onClick={generate} disabled={loading}>{loading ? "..." : "إنشاء القوائم"}</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {!data ? (
        <div style={styles.empty}>اختر الفترة واضغط «إنشاء القوائم».</div>
      ) : (
        <>
          <div style={styles.switcher}>
            <button style={{ ...styles.switchBtn, ...(view === "income" ? styles.switchActive : {}) }} onClick={() => setView("income")}>قائمة الدخل</button>
            <button style={{ ...styles.switchBtn, ...(view === "balance" ? styles.switchActive : {}) }} onClick={() => setView("balance")}>الميزانية العمومية</button>
          </div>

          {view === "income" ? (
            <div style={styles.statement}>
              <div style={styles.stmtHead}>
                <div>
                  <h3 style={styles.stmtTitle}>قائمة الدخل</h3>
                  <span style={styles.stmtPeriod} dir="ltr">{is && data.fromDate} ← {data.toDate}</span>
                </div>
                <button style={styles.pdfBtn} onClick={exportIncome}>📄 PDF</button>
              </div>

              <Group title="الإيرادات" items={is.revenues} total={is.totalRevenue} totalLabel="إجمالي الإيرادات" color="#16a34a" />
              <Group title="المصروفات" items={is.expenses} total={is.totalExpense} totalLabel="إجمالي المصروفات" color="#dc2626" />

              <div style={{ ...styles.netRow, background: is.netIncome >= 0 ? "#f0fdf4" : "#fef2f2", borderColor: is.netIncome >= 0 ? "#bbf7d0" : "#fecaca" }}>
                <span style={styles.netLabel}>صافي الدخل {is.netIncome >= 0 ? "(ربح)" : "(خسارة)"}</span>
                <span style={{ ...styles.netValue, color: is.netIncome >= 0 ? "#16a34a" : "#dc2626" }} dir="ltr">{fmt(is.netIncome)} ﷼</span>
              </div>
            </div>
          ) : (
            <div style={styles.statement}>
              <div style={styles.stmtHead}>
                <div>
                  <h3 style={styles.stmtTitle}>الميزانية العمومية</h3>
                  <span style={styles.stmtPeriod} dir="ltr">كما في {bs.asOf}</span>
                </div>
                <span style={{ ...styles.balTag, ...(bs.balanced ? styles.balOk : styles.balErr) }}>
                  {bs.balanced ? "✓ متوازنة" : "⚠ غير متوازنة"}
                </span>
              </div>

              {/* الأصول */}
              <div style={styles.bsSection}>
                <div style={styles.bsSectionTitle}>الأصول</div>
                <SubGroup title="متداولة" items={bs.assets.current} />
                <SubGroup title="غير متداولة" items={bs.assets.nonCurrent} />
                <div style={styles.bsTotal}><span>إجمالي الأصول</span><span dir="ltr">{fmt(bs.assets.total)}</span></div>
              </div>

              {/* الخصوم */}
              <div style={styles.bsSection}>
                <div style={styles.bsSectionTitle}>الخصوم</div>
                <SubGroup title="متداولة" items={bs.liabilities.current} />
                <SubGroup title="غير متداولة" items={bs.liabilities.nonCurrent} />
                <div style={styles.bsTotal}><span>إجمالي الخصوم</span><span dir="ltr">{fmt(bs.liabilities.total)}</span></div>
              </div>

              {/* حقوق الملكية */}
              <div style={styles.bsSection}>
                <div style={styles.bsSectionTitle}>حقوق الملكية</div>
                {bs.equity.items.map((a) => (
                  <div key={a.code} style={styles.bsRow}><span style={styles.bsName}><span style={styles.bsCode} dir="ltr">{a.code}</span> {a.name}</span><span style={styles.bsAmt} dir="ltr">{fmt(a.amount)}</span></div>
                ))}
                <div style={styles.bsRow}><span style={styles.bsName}>الأرباح المحتجزة (صافي الدخل المتراكم)</span><span style={styles.bsAmt} dir="ltr">{fmt(bs.equity.retainedEarnings)}</span></div>
                <div style={styles.bsTotal}><span>إجمالي حقوق الملكية</span><span dir="ltr">{fmt(bs.equity.total)}</span></div>
              </div>

              {/* المعادلة */}
              <div style={{ ...styles.netRow, background: bs.balanced ? "#f0fdf4" : "#fef2f2", borderColor: bs.balanced ? "#bbf7d0" : "#fecaca" }}>
                <span style={styles.netLabel}>الخصوم + حقوق الملكية</span>
                <span style={{ ...styles.netValue, color: "#0f172a" }} dir="ltr">{fmt(bs.totalLiabilitiesAndEquity)} ﷼</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Group({ title, items, total, totalLabel, color }) {
  return (
    <div style={styles.group}>
      <div style={{ ...styles.groupTitle, color }}>{title}</div>
      {items.length === 0 ? (
        <div style={styles.noItems}>لا حركات في الفترة.</div>
      ) : items.map((a) => (
        <div key={a.code} style={styles.row}>
          <span style={styles.rowName}><span style={styles.rowCode} dir="ltr">{a.code}</span> {a.name}</span>
          <span style={styles.rowAmt} dir="ltr">{fmt(a.amount)}</span>
        </div>
      ))}
      <div style={styles.groupTotal}><span>{totalLabel}</span><span dir="ltr">{fmt(total)}</span></div>
    </div>
  );
}

function SubGroup({ title, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={styles.subGroup}>
      <div style={styles.subTitle}>{title}</div>
      {items.map((a) => (
        <div key={a.code} style={styles.bsRow}>
          <span style={styles.bsName}><span style={styles.bsCode} dir="ltr">{a.code}</span> {a.name}</span>
          <span style={styles.bsAmt} dir="ltr">{fmt(a.amount)}</span>
        </div>
      ))}
    </div>
  );
}

const styles = {
  head: { marginBottom: 18 },
  title: { margin: "0 0 6px", fontSize: 20, color: "#16a34a" },
  sub: { margin: 0, fontSize: 13, color: "#64748b" },

  controls: { display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", padding: 16, background: "#f8fafc", borderRadius: 10, marginBottom: 16 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: "#334155" },
  input: { padding: "9px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8 },
  genBtn: { padding: "10px 24px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 14 },
  empty: { padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14, background: "#fff", border: "1px dashed #e2e8f0", borderRadius: 12 },

  switcher: { display: "flex", gap: 8, marginBottom: 16 },
  switchBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  switchActive: { color: "#fff", background: "#16a34a" },

  statement: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, maxWidth: 720 },
  stmtHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 16, borderBottom: "2px solid #e2e8f0" },
  stmtTitle: { margin: "0 0 4px", fontSize: 18, color: "#0f172a" },
  stmtPeriod: { fontSize: 13, color: "#94a3b8", fontFamily: "monospace" },
  pdfBtn: { padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, cursor: "pointer" },

  group: { marginBottom: 18 },
  groupTitle: { fontSize: 15, fontWeight: 700, marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #f1f5f9" },
  row: { display: "flex", justifyContent: "space-between", padding: "7px 8px", fontSize: 14 },
  rowName: { color: "#334155" },
  rowCode: { color: "#94a3b8", fontFamily: "monospace", fontSize: 12, marginInlineEnd: 6 },
  rowAmt: { color: "#0f172a", fontFamily: "monospace", fontWeight: 500 },
  noItems: { padding: "8px", fontSize: 13, color: "#cbd5e1" },
  groupTotal: { display: "flex", justifyContent: "space-between", padding: "10px 8px", marginTop: 6, background: "#f8fafc", borderRadius: 8, fontSize: 14, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" },

  netRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", border: "1px solid", borderRadius: 10, marginTop: 12 },
  netLabel: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  netValue: { fontSize: 20, fontWeight: 800, fontFamily: "monospace" },

  balTag: { padding: "5px 14px", borderRadius: 12, fontSize: 13, fontWeight: 700 },
  balOk: { background: "#dcfce7", color: "#166534" },
  balErr: { background: "#fee2e2", color: "#991b1b" },

  bsSection: { marginBottom: 18 },
  bsSectionTitle: { fontSize: 16, fontWeight: 700, color: "#16a34a", marginBottom: 10, paddingBottom: 6, borderBottom: "2px solid #f0fdf4" },
  subGroup: { marginBottom: 10 },
  subTitle: { fontSize: 12, fontWeight: 600, color: "#94a3b8", margin: "6px 0", paddingInlineStart: 4 },
  bsRow: { display: "flex", justifyContent: "space-between", padding: "6px 8px", fontSize: 14 },
  bsName: { color: "#334155" },
  bsCode: { color: "#94a3b8", fontFamily: "monospace", fontSize: 12, marginInlineEnd: 6 },
  bsAmt: { color: "#0f172a", fontFamily: "monospace", fontWeight: 500 },
  bsTotal: { display: "flex", justifyContent: "space-between", padding: "10px 8px", marginTop: 6, background: "#f8fafc", borderRadius: 8, fontSize: 15, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" },
};
