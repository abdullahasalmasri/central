import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";
import { exportToPDF, datedFileName } from "../exportUtils";

/* ============================================================
   القوائم المالية الخمس (IFRS) — قسم المالية
   1) قائمة المركز المالي  2) قائمة الدخل  3) قائمة الدخل الشامل
   4) قائمة التغير في حقوق الملكية  5) قائمة التدفقات النقدية
   تُحسب كلها من القيود المعتمدة عبر getFinancialStatements.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const yearStart = () => `${new Date().getFullYear()}-01-01`;

const TABS = [
  { id: "balance", label: "المركز المالي" },
  { id: "income", label: "الدخل" },
  { id: "comprehensive", label: "الدخل الشامل" },
  { id: "equity", label: "التغير في حقوق الملكية" },
  { id: "cashflow", label: "التدفقات النقدية" },
];

export default function FinancialStatementsView() {
  const [companyName, setCompanyName] = useState("الشركة");
  const [fromDate, setFromDate] = useState(yearStart());
  const [toDate, setToDate] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("balance");

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) return;
        const userSnap = await getDoc(doc(db, "users", uid));
        const tid = userSnap.exists() ? userSnap.data().tenantId : null;
        if (!tid) return;
        const tSnap = await getDoc(doc(db, "tenants", tid));
        if (tSnap.exists() && tSnap.data().name) setCompanyName(tSnap.data().name);
      } catch (e) { /* اسم المنشأة اختياري */ }
    })();
  }, []);

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

  const period = `${fromDate} ← ${toDate}`;
  const co = companyName || "الشركة";

  function doExport(title, rows) {
    exportToPDF({
      rows,
      columns: [{ key: "label", header: "البند" }, { key: "amount", header: "المبلغ" }],
      fileName: datedFileName(title),
      header: { companyName: co, title, subtitle: period },
    });
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>القوائم المالية</h1>
      <p style={styles.pageSub}>القوائم الخمس وفق المعايير الدولية (IFRS) — محسوبة من القيود المعتمدة.</p>

      <div style={styles.controls}>
        <div style={styles.field}>
          <label style={styles.label}>من تاريخ</label>
          <input style={styles.input} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} dir="ltr" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>إلى تاريخ</label>
          <input style={styles.input} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} dir="ltr" />
        </div>
        <button style={styles.genBtn} onClick={generate} disabled={loading}>
          {loading ? "جارٍ الإنشاء..." : "📊 إنشاء القوائم"}
        </button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {!data ? (
        <div style={styles.empty}>
          <p style={styles.muted}>اختر الفترة واضغط «إنشاء القوائم» لعرض القوائم المالية الخمس.</p>
        </div>
      ) : (
        <>
          <div style={styles.tabs}>
            {TABS.map((t) => (
              <button key={t.id} style={{ ...styles.tab, ...(view === t.id ? styles.tabActive : {}) }} onClick={() => setView(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {view === "balance" && <BalanceSheet bs={data.balanceSheet} co={co} period={period} onExport={doExport} />}
          {view === "income" && <IncomeStatement is={data.incomeStatement} co={co} period={period} onExport={doExport} />}
          {view === "comprehensive" && <ComprehensiveIncome ci={data.comprehensiveIncome} co={co} period={period} onExport={doExport} />}
          {view === "equity" && <EquityStatement eq={data.equityStatement} co={co} period={period} onExport={doExport} />}
          {view === "cashflow" && <CashFlow cf={data.cashFlow} co={co} period={period} onExport={doExport} />}
        </>
      )}
    </div>
  );
}

// ═══════════ (1) قائمة المركز المالي ═══════════
function BalanceSheet({ bs, co, period, onExport }) {
  function exportPdf() {
    const rows = [
      { label: "— الأصول المتداولة —", amount: "" },
      ...bs.assets.current.map((a) => ({ label: `${a.code} ${a.name}`, amount: fmt(a.amount) })),
      { label: "— الأصول غير المتداولة —", amount: "" },
      ...bs.assets.nonCurrent.map((a) => ({ label: `${a.code} ${a.name}`, amount: fmt(a.amount) })),
      { label: "إجمالي الأصول", amount: fmt(bs.assets.total) },
      { label: "— الخصوم المتداولة —", amount: "" },
      ...bs.liabilities.current.map((a) => ({ label: `${a.code} ${a.name}`, amount: fmt(a.amount) })),
      { label: "— الخصوم غير المتداولة —", amount: "" },
      ...bs.liabilities.nonCurrent.map((a) => ({ label: `${a.code} ${a.name}`, amount: fmt(a.amount) })),
      { label: "إجمالي الخصوم", amount: fmt(bs.liabilities.total) },
      { label: "— حقوق الملكية —", amount: "" },
      ...bs.equity.items.map((a) => ({ label: `${a.code} ${a.name}`, amount: fmt(a.amount) })),
      { label: "الأرباح المُبقاة (غير المُقفلة)", amount: fmt(bs.equity.retainedEarnings) },
      { label: "إجمالي حقوق الملكية", amount: fmt(bs.equity.total) },
      { label: "إجمالي الخصوم وحقوق الملكية", amount: fmt(bs.totalLiabilitiesAndEquity) },
    ];
    onExport("قائمة المركز المالي", rows);
  }
  return (
    <div style={styles.stmt}>
      <StmtHead co={co} title="قائمة المركز المالي" sub={`كما في ${bs.asOf}`} onExport={exportPdf} />
      <div style={styles.twoCol}>
        <div style={styles.col}>
          <Section title="الأصول">
            <SubHead text="متداولة" />
            {bs.assets.current.length ? bs.assets.current.map((a) => <Line key={a.code} code={a.code} name={a.name} amount={a.amount} />) : <Empty />}
            <SubHead text="غير متداولة" />
            {bs.assets.nonCurrent.length ? bs.assets.nonCurrent.map((a) => <Line key={a.code} code={a.code} name={a.name} amount={a.amount} />) : <Empty />}
            <Total label="إجمالي الأصول" amount={bs.assets.total} />
          </Section>
        </div>
        <div style={styles.col}>
          <Section title="الخصوم">
            <SubHead text="متداولة" />
            {bs.liabilities.current.length ? bs.liabilities.current.map((a) => <Line key={a.code} code={a.code} name={a.name} amount={a.amount} />) : <Empty />}
            <SubHead text="غير متداولة" />
            {bs.liabilities.nonCurrent.length ? bs.liabilities.nonCurrent.map((a) => <Line key={a.code} code={a.code} name={a.name} amount={a.amount} />) : <Empty />}
            <Total label="إجمالي الخصوم" amount={bs.liabilities.total} />
          </Section>
          <Section title="حقوق الملكية">
            {bs.equity.items.map((a) => <Line key={a.code} code={a.code} name={a.name} amount={a.amount} />)}
            <Line code="" name="الأرباح المُبقاة (غير المُقفلة)" amount={bs.equity.retainedEarnings} />
            <Total label="إجمالي حقوق الملكية" amount={bs.equity.total} />
          </Section>
          <Total label="إجمالي الخصوم وحقوق الملكية" amount={bs.totalLiabilitiesAndEquity} strong />
        </div>
      </div>
      <div style={{ ...styles.balanceTag, ...(bs.balanced ? styles.okTag : styles.badTag) }}>
        {bs.balanced ? "✓ متوازنة — الأصول = الخصوم + حقوق الملكية" : "⚠ غير متوازنة — راجع القيود"}
      </div>
    </div>
  );
}

// ═══════════ (2) قائمة الدخل ═══════════
function IncomeStatement({ is, co, period, onExport }) {
  function exportPdf() {
    const rows = [
      { label: "— الإيرادات —", amount: "" },
      ...is.revenues.map((a) => ({ label: `${a.code} ${a.name}`, amount: fmt(a.amount) })),
      { label: "إجمالي الإيرادات", amount: fmt(is.totalRevenue) },
      { label: "— المصروفات —", amount: "" },
      ...is.expenses.map((a) => ({ label: `${a.code} ${a.name}`, amount: fmt(a.amount) })),
      { label: "إجمالي المصروفات", amount: fmt(is.totalExpense) },
      { label: "صافي الدخل", amount: fmt(is.netIncome) },
    ];
    onExport("قائمة الدخل", rows);
  }
  return (
    <div style={styles.stmt}>
      <StmtHead co={co} title="قائمة الدخل" sub={period} onExport={exportPdf} />
      <div style={styles.single}>
        <Section title="الإيرادات">
          {is.revenues.length ? is.revenues.map((a) => <Line key={a.code} code={a.code} name={a.name} amount={a.amount} />) : <Empty />}
          <Total label="إجمالي الإيرادات" amount={is.totalRevenue} />
        </Section>
        <Section title="المصروفات">
          {is.expenses.length ? is.expenses.map((a) => <Line key={a.code} code={a.code} name={a.name} amount={a.amount} />) : <Empty />}
          <Total label="إجمالي المصروفات" amount={is.totalExpense} />
        </Section>
        <div style={{ ...styles.netRow, ...(is.netIncome >= 0 ? styles.netPos : styles.netNeg) }}>
          <span>{is.netIncome >= 0 ? "صافي الربح" : "صافي الخسارة"}</span>
          <span dir="ltr">{fmt(Math.abs(is.netIncome))} ﷼</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════ (3) قائمة الدخل الشامل ═══════════
function ComprehensiveIncome({ ci, co, period, onExport }) {
  function exportPdf() {
    const rows = [
      { label: "صافي الدخل", amount: fmt(ci.netIncome) },
      { label: "— بنود الدخل الشامل الأخرى —", amount: "" },
      ...(ci.ociItems.length ? ci.ociItems.map((a) => ({ label: a.name, amount: fmt(a.amount) })) : [{ label: "لا يوجد", amount: "" }]),
      { label: "إجمالي الدخل الشامل", amount: fmt(ci.totalComprehensiveIncome) },
    ];
    onExport("قائمة الدخل الشامل", rows);
  }
  return (
    <div style={styles.stmt}>
      <StmtHead co={co} title="قائمة الدخل الشامل" sub={period} onExport={exportPdf} />
      <div style={styles.single}>
        <Line code="" name="صافي الدخل" amount={ci.netIncome} bold />
        <SubHead text="بنود الدخل الشامل الأخرى (OCI)" />
        {ci.ociItems.length ? ci.ociItems.map((a, i) => <Line key={i} code="" name={a.name} amount={a.amount} />) : (
          <p style={styles.ociNote}>لا توجد بنود دخل شامل أخرى في نشاطك (لا إعادة تقييم، لا فروقات عملة، لا تحوّط).</p>
        )}
        <div style={{ ...styles.netRow, ...(ci.totalComprehensiveIncome >= 0 ? styles.netPos : styles.netNeg) }}>
          <span>إجمالي الدخل الشامل</span>
          <span dir="ltr">{fmt(Math.abs(ci.totalComprehensiveIncome))} ﷼</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════ (4) قائمة التغير في حقوق الملكية ═══════════
function EquityStatement({ eq, co, period, onExport }) {
  function exportPdf() {
    const rows = [
      { label: "حقوق الملكية — بداية الفترة", amount: fmt(eq.openingTotal) },
      { label: "صافي دخل الفترة", amount: fmt(eq.netIncome) },
      ...(Math.abs(eq.capitalMovement) > 0.005 ? [{ label: "حركات رأس المال", amount: fmt(eq.capitalMovement) }] : []),
      { label: "حقوق الملكية — نهاية الفترة", amount: fmt(eq.closingTotal) },
    ];
    onExport("قائمة التغير في حقوق الملكية", rows);
  }
  return (
    <div style={styles.stmt}>
      <StmtHead co={co} title="قائمة التغير في حقوق الملكية" sub={period} onExport={exportPdf} />
      <div style={styles.single}>
        {/* جدول مكوّنات حقوق الملكية */}
        <table style={styles.eqTable}>
          <thead>
            <tr>
              <th style={styles.eqTh}>الحساب</th>
              <th style={styles.eqThNum}>رصيد افتتاحي</th>
              <th style={styles.eqThNum}>التغيّر</th>
              <th style={styles.eqThNum}>رصيد ختامي</th>
            </tr>
          </thead>
          <tbody>
            {eq.components.map((c) => {
              const change = Math.round((c.closing - c.opening) * 100) / 100;
              return (
                <tr key={c.code}>
                  <td style={styles.eqTd}><span style={styles.codeBadge} dir="ltr">{c.code}</span>{c.name}</td>
                  <td style={styles.eqTdNum} dir="ltr">{fmt(c.opening)}</td>
                  <td style={{ ...styles.eqTdNum, color: change >= 0 ? "#16a34a" : "#dc2626" }} dir="ltr">{fmt(change)}</td>
                  <td style={{ ...styles.eqTdNum, fontWeight: 700 }} dir="ltr">{fmt(c.closing)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* ملخّص الحركة */}
        <div style={styles.eqSummary}>
          <div style={styles.eqSumRow}><span>حقوق الملكية — بداية الفترة</span><span dir="ltr">{fmt(eq.openingTotal)} ﷼</span></div>
          <div style={styles.eqSumRow}><span>+ صافي دخل الفترة</span><span dir="ltr" style={{ color: eq.netIncome >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(eq.netIncome)} ﷼</span></div>
          {Math.abs(eq.capitalMovement) > 0.005 ? (
            <div style={styles.eqSumRow}><span>± حركات رأس المال</span><span dir="ltr">{fmt(eq.capitalMovement)} ﷼</span></div>
          ) : null}
          <div style={{ ...styles.eqSumRow, ...styles.eqSumTotal }}><span>حقوق الملكية — نهاية الفترة</span><span dir="ltr">{fmt(eq.closingTotal)} ﷼</span></div>
        </div>
      </div>
    </div>
  );
}

// ═══════════ (5) قائمة التدفقات النقدية ═══════════
function CashFlow({ cf, co, period, onExport }) {
  function exportPdf() {
    const rows = [
      { label: "— التدفقات التشغيلية —", amount: "" },
      ...cf.operating.items.map((a) => ({ label: a.description, amount: fmt(a.amount) })),
      { label: "صافي التدفقات التشغيلية", amount: fmt(cf.operating.total) },
      { label: "— التدفقات الاستثمارية —", amount: "" },
      ...(cf.investing.items.length ? cf.investing.items.map((a) => ({ label: a.description, amount: fmt(a.amount) })) : [{ label: "لا يوجد", amount: "" }]),
      { label: "صافي التدفقات الاستثمارية", amount: fmt(cf.investing.total) },
      { label: "— التدفقات التمويلية —", amount: "" },
      ...(cf.financing.items.length ? cf.financing.items.map((a) => ({ label: a.description, amount: fmt(a.amount) })) : [{ label: "لا يوجد", amount: "" }]),
      { label: "صافي التدفقات التمويلية", amount: fmt(cf.financing.total) },
      { label: "صافي التغير في النقد", amount: fmt(cf.netChange) },
      { label: "نقد بداية الفترة", amount: fmt(cf.openingCash) },
      { label: "نقد نهاية الفترة", amount: fmt(cf.closingCash) },
    ];
    onExport("قائمة التدفقات النقدية", rows);
  }
  return (
    <div style={styles.stmt}>
      <StmtHead co={co} title="قائمة التدفقات النقدية" sub={period} onExport={exportPdf} />
      <div style={styles.single}>
        <CashSection title="التدفقات النقدية التشغيلية" items={cf.operating.items} total={cf.operating.total} />
        <CashSection title="التدفقات النقدية الاستثمارية" items={cf.investing.items} total={cf.investing.total} />
        <CashSection title="التدفقات النقدية التمويلية" items={cf.financing.items} total={cf.financing.total} />

        <div style={{ ...styles.netRow, ...(cf.netChange >= 0 ? styles.netPos : styles.netNeg) }}>
          <span>صافي التغيّر في النقد</span>
          <span dir="ltr">{fmt(cf.netChange)} ﷼</span>
        </div>
        <div style={styles.cashRecon}>
          <div style={styles.eqSumRow}><span>نقد بداية الفترة</span><span dir="ltr">{fmt(cf.openingCash)} ﷼</span></div>
          <div style={styles.eqSumRow}><span>+ صافي التغيّر</span><span dir="ltr">{fmt(cf.netChange)} ﷼</span></div>
          <div style={{ ...styles.eqSumRow, ...styles.eqSumTotal }}><span>نقد نهاية الفترة</span><span dir="ltr">{fmt(cf.closingCash)} ﷼</span></div>
        </div>
        {!cf.reconciles ? <div style={styles.warnSmall}>⚠ ملاحظة: قد لا تتطابق الأرقام تمامًا بسبب حركات نقدية غير مصنّفة.</div> : null}
      </div>
    </div>
  );
}

function CashSection({ title, items, total }) {
  return (
    <Section title={title}>
      {items.length ? items.map((a, i) => (
        <div key={i} style={styles.cashLine}>
          <span style={styles.cashDesc}>{a.description}<span style={styles.cashDate} dir="ltr"> · {a.date}</span></span>
          <span style={{ ...styles.cashAmt, color: a.amount >= 0 ? "#16a34a" : "#dc2626" }} dir="ltr">{fmt(a.amount)}</span>
        </div>
      )) : <Empty />}
      <Total label={`صافي ${title.includes("تشغيل") ? "التشغيلية" : title.includes("استثمار") ? "الاستثمارية" : "التمويلية"}`} amount={total} />
    </Section>
  );
}

// ═══════════ مكوّنات مشتركة ═══════════
function StmtHead({ co, title, sub, onExport }) {
  return (
    <div style={styles.stmtHead}>
      <div>
        <div style={styles.stmtCo}>{co}</div>
        <div style={styles.stmtTitle}>{title}</div>
        <div style={styles.stmtSub}>{sub}</div>
      </div>
      <button style={styles.expBtn} onClick={onExport}>⬇ PDF</button>
    </div>
  );
}
function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}
function SubHead({ text }) {
  return <div style={styles.subHead}>{text}</div>;
}
function Line({ code, name, amount, bold }) {
  return (
    <div style={styles.line}>
      <span style={styles.lineName}>{code ? <span style={styles.codeBadge} dir="ltr">{code}</span> : null}<span style={bold ? { fontWeight: 700 } : null}>{name}</span></span>
      <span style={{ ...styles.lineAmt, ...(bold ? { fontWeight: 700 } : {}) }} dir="ltr">{fmt(amount)}</span>
    </div>
  );
}
function Total({ label, amount, strong }) {
  return (
    <div style={{ ...styles.totalLine, ...(strong ? styles.totalStrong : {}) }}>
      <span>{label}</span>
      <span dir="ltr">{fmt(amount)} ﷼</span>
    </div>
  );
}
function Empty() {
  return <p style={styles.lineEmpty}>لا يوجد</p>;
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#059669", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: "0 0 22px" },

  controls: { display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 20, padding: "16px 18px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: "#334155" },
  input: { padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit" },
  genBtn: { padding: "11px 22px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  tabs: { display: "flex", gap: 6, marginBottom: 18, borderBottom: "2px solid #e2e8f0", flexWrap: "wrap" },
  tab: { padding: "9px 16px", fontSize: 13, fontWeight: 600, color: "#64748b", background: "none", border: "none", borderBottom: "3px solid transparent", cursor: "pointer", marginBottom: -2 },
  tabActive: { color: "#059669", borderBottomColor: "#059669" },

  empty: { padding: 40, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  muted: { color: "#94a3b8", fontSize: 14 },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },

  stmt: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 22 },
  stmtHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #e2e8f0", paddingBottom: 14, marginBottom: 18 },
  stmtCo: { fontSize: 16, fontWeight: 800, color: "#0f172a" },
  stmtTitle: { fontSize: 15, fontWeight: 700, color: "#059669", marginTop: 2 },
  stmtSub: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  expBtn: { padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer" },

  twoCol: { display: "flex", gap: 24, flexWrap: "wrap" },
  col: { flex: 1, minWidth: 280 },
  single: { maxWidth: 620 },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: "#334155", paddingBottom: 8, borderBottom: "2px solid #f1f5f9", marginBottom: 8 },
  subHead: { fontSize: 12, fontWeight: 600, color: "#94a3b8", margin: "10px 0 4px" },

  line: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 14, color: "#475569" },
  lineName: { display: "flex", alignItems: "center", gap: 4 },
  lineAmt: { fontFamily: "monospace", fontSize: 14 },
  lineEmpty: { fontSize: 13, color: "#cbd5e1", padding: "6px 0", margin: 0 },
  codeBadge: { display: "inline-block", padding: "1px 7px", marginLeft: 6, background: "#f1f5f9", color: "#64748b", borderRadius: 5, fontSize: 11, fontWeight: 700, fontFamily: "monospace" },

  totalLine: { display: "flex", justifyContent: "space-between", padding: "10px 0 4px", marginTop: 6, borderTop: "2px solid #e2e8f0", fontSize: 14, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" },
  totalStrong: { borderTop: "3px double #059669", color: "#059669", fontSize: 15 },

  netRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderRadius: 10, marginTop: 16, fontSize: 17, fontWeight: 800, fontFamily: "monospace" },
  netPos: { background: "#dcfce7", color: "#166534" },
  netNeg: { background: "#fee2e2", color: "#b91c1c" },

  balanceTag: { padding: "12px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, textAlign: "center", marginTop: 18 },
  okTag: { background: "#dcfce7", color: "#166534" },
  badTag: { background: "#fef3c7", color: "#92400e" },

  ociNote: { fontSize: 13, color: "#94a3b8", padding: "8px 12px", background: "#f8fafc", borderRadius: 8, margin: "6px 0" },

  eqTable: { width: "100%", borderCollapse: "collapse", marginBottom: 18 },
  eqTh: { textAlign: "right", padding: "10px 12px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  eqThNum: { textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  eqTd: { padding: "10px 12px", fontSize: 14, borderBottom: "1px solid #f1f5f9", color: "#475569" },
  eqTdNum: { padding: "10px 12px", fontSize: 14, textAlign: "left", borderBottom: "1px solid #f1f5f9", fontFamily: "monospace" },
  eqSummary: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px" },
  eqSumRow: { display: "flex", justifyContent: "space-between", fontSize: 14, color: "#475569", padding: "6px 0", fontFamily: "monospace" },
  eqSumTotal: { borderTop: "2px solid #cbd5e1", marginTop: 6, paddingTop: 10, fontWeight: 800, color: "#059669", fontSize: 15 },

  cashLine: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 13, color: "#475569" },
  cashDesc: { flex: 1 },
  cashDate: { color: "#cbd5e1", fontSize: 11 },
  cashAmt: { fontFamily: "monospace", fontWeight: 600 },
  cashRecon: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px", marginTop: 14 },
  warnSmall: { padding: "10px 14px", background: "#fef3c7", color: "#92400e", borderRadius: 8, fontSize: 12, marginTop: 12 },
};
