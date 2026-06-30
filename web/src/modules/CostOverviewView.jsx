import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   التكلفة الشاملة — قسم التكاليف والربحية
   نظرة مالية شاملة عبر فترة: تكاليف العمالة (المشاريع) + إهلاك
   الأصول، واتجاهها شهريًا (getEnterpriseProfitabilityRange + getDepreciation).
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const fmtK = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1) + "م";
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(0) + "ك";
  return String(Math.round(v));
};
const monthLabel = (m) => {
  const names = ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"];
  const [y, mo] = m.split("-").map(Number);
  return `${names[mo - 1]} ${String(y).slice(2)}`;
};
// النطاق الافتراضي: آخر 6 أشهر
function defaultRange() {
  const now = new Date();
  const to = now.toISOString().slice(0, 7);
  const fromDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const from = fromDate.toISOString().slice(0, 7);
  return { from, to };
}

export default function CostOverviewView() {
  const dr = defaultRange();
  const [tenantId, setTenantId] = useState("");
  const [fromMonth, setFromMonth] = useState(dr.from);
  const [toMonth, setToMonth] = useState(dr.to);
  const [range, setRange] = useState(null);
  const [annualDep, setAnnualDep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
  }, [tenantId, fromMonth, toMonth]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [rangeRes, depRes] = await Promise.all([
        httpsCallable(functions, "getEnterpriseProfitabilityRange")({ fromMonth, toMonth }),
        httpsCallable(functions, "getDepreciation")({}).catch(() => ({ data: { kpis: { annualDep: 0 } } })),
      ]);
      setRange(rangeRes.data);
      setAnnualDep((depRes.data && depRes.data.kpis && depRes.data.kpis.annualDep) || 0);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
      setRange(null);
    } finally {
      setLoading(false);
    }
  }

  const monthlyDep = annualDep / 12;
  const months = range ? range.monthly : [];
  const monthsCount = range ? range.monthsCount : 0;
  const laborCost = range ? range.totals.cost : 0;
  const totalRevenue = range ? range.totals.revenue : 0;
  const totalDep = monthlyDep * monthsCount;
  const totalCost = laborCost + totalDep;
  const netProfit = totalRevenue - totalCost;

  // بيانات الرسم: لكل شهر التكلفة الكلية (عمالة + إهلاك) والإيراد
  const chartData = months.map((m) => ({
    month: m.month,
    revenue: m.revenue,
    cost: m.cost + monthlyDep,
    profit: m.revenue - (m.cost + monthlyDep),
  }));
  const maxVal = Math.max(1, ...chartData.map((d) => Math.max(d.revenue, d.cost)));

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>التكلفة الشاملة</h1>
          <p style={styles.pageSub}>اتجاه تكاليف الشركة عبر فترة: عمالة المشاريع + إهلاك الأصول.</p>
        </div>
        <div style={styles.rangePick}>
          <input style={styles.monthInput} type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} dir="ltr" />
          <span style={styles.rangeSep}>←</span>
          <input style={styles.monthInput} type="month" value={toMonth} onChange={(e) => setToMonth(e.target.value)} dir="ltr" />
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ حساب التكاليف...</p> : !range ? (
        <div style={styles.warnBox}>تعذّر تحميل البيانات.</div>
      ) : (
        <>
          {/* بطاقات الإجماليات */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>إجمالي الإيراد</span>
              <span style={styles.kpiValue} dir="ltr">{fmt(totalRevenue)}</span>
              <span style={styles.kpiSub}>{monthsCount} شهر</span>
            </div>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>تكلفة العمالة</span>
              <span style={{ ...styles.kpiValue, color: "#c2410c" }} dir="ltr">{fmt(laborCost)}</span>
              <span style={styles.kpiSub}>المشاريع</span>
            </div>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>إهلاك الأصول</span>
              <span style={{ ...styles.kpiValue, color: "#7c3aed" }} dir="ltr">{fmt(totalDep)}</span>
              <span style={styles.kpiSub}>{fmt(monthlyDep)}/شهر</span>
            </div>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>صافي الربح</span>
              <span style={{ ...styles.kpiValue, color: netProfit >= 0 ? "#059669" : "#dc2626" }} dir="ltr">{netProfit >= 0 ? "+" : ""}{fmt(netProfit)}</span>
              <span style={styles.kpiSub}>بعد الإهلاك</span>
            </div>
          </div>

          {/* الرسم البياني */}
          {chartData.length === 0 ? (
            <div style={styles.warnBox}>لا توجد بيانات في هذه الفترة.</div>
          ) : (
            <div style={styles.chartCard}>
              <div style={styles.chartHead}>
                <span style={styles.chartTitle}>اتجاه الإيراد والتكلفة</span>
                <div style={styles.legend}>
                  <span style={styles.legendItem}><i style={{ ...styles.legendDot, background: "#059669" }} /> الإيراد</span>
                  <span style={styles.legendItem}><i style={{ ...styles.legendDot, background: "#ca8a04" }} /> التكلفة الكلية</span>
                </div>
              </div>
              <div style={styles.chart}>
                {chartData.map((d) => (
                  <div key={d.month} style={styles.barGroup}>
                    <div style={styles.bars}>
                      <div style={styles.barWrap} title={`الإيراد: ${fmt(d.revenue)}`}>
                        <span style={styles.barVal}>{fmtK(d.revenue)}</span>
                        <div style={{ ...styles.bar, height: `${(d.revenue / maxVal) * 100}%`, background: "#059669" }} />
                      </div>
                      <div style={styles.barWrap} title={`التكلفة: ${fmt(d.cost)}`}>
                        <span style={styles.barVal}>{fmtK(d.cost)}</span>
                        <div style={{ ...styles.bar, height: `${(d.cost / maxVal) * 100}%`, background: "#ca8a04" }} />
                      </div>
                    </div>
                    <span style={styles.barLabel}>{monthLabel(d.month)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* جدول شهري */}
          {chartData.length > 0 ? (
            <div style={styles.tableCard}>
              <div style={styles.tableHead}>
                <span style={styles.thMonth}>الشهر</span>
                <span style={styles.thNum}>الإيراد</span>
                <span style={styles.thNum}>عمالة</span>
                <span style={styles.thNum}>إهلاك</span>
                <span style={styles.thNum}>تكلفة كلية</span>
                <span style={styles.thNum}>صافي الربح</span>
              </div>
              {chartData.map((d) => (
                <div key={d.month} style={styles.tableRow}>
                  <span style={styles.tdMonth}>{monthLabel(d.month)}</span>
                  <span style={styles.tdNum} dir="ltr">{fmt(d.revenue)}</span>
                  <span style={{ ...styles.tdNum, color: "#c2410c" }} dir="ltr">{fmt(d.cost - monthlyDep)}</span>
                  <span style={{ ...styles.tdNum, color: "#7c3aed" }} dir="ltr">{fmt(monthlyDep)}</span>
                  <span style={styles.tdNum} dir="ltr">{fmt(d.cost)}</span>
                  <span style={{ ...styles.tdNum, color: d.profit >= 0 ? "#059669" : "#dc2626", fontWeight: 700 }} dir="ltr">{d.profit >= 0 ? "+" : ""}{fmt(d.profit)}</span>
                </div>
              ))}
            </div>
          ) : null}

          <p style={styles.note}>💡 تكلفة العمالة من إسنادات المشاريع · الإهلاك موزّع شهريًا (الإهلاك السنوي ÷ 12) · صافي الربح = الإيراد − العمالة − الإهلاك.</p>
        </>
      )}
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#ca8a04", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  rangePick: { display: "flex", alignItems: "center", gap: 8, background: "#fff", padding: "10px 16px", borderRadius: 10, border: "1px solid #e2e8f0" },
  monthInput: { padding: "8px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit" },
  rangeSep: { color: "#94a3b8", fontSize: 16 },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 5 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 23, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },
  kpiSub: { fontSize: 11, color: "#94a3b8", fontWeight: 500 },

  chartCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 22px", marginBottom: 18 },
  chartHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 },
  chartTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a" },
  legend: { display: "flex", gap: 16 },
  legendItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", fontWeight: 600 },
  legendDot: { width: 12, height: 12, borderRadius: 3, display: "inline-block" },
  chart: { display: "flex", gap: 12, alignItems: "flex-end", height: 220, paddingTop: 16, overflowX: "auto" },
  barGroup: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1, minWidth: 54, height: "100%" },
  bars: { display: "flex", gap: 4, alignItems: "flex-end", height: "100%", width: "100%", justifyContent: "center" },
  barWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", flex: 1, maxWidth: 26, position: "relative" },
  barVal: { fontSize: 9, color: "#94a3b8", fontWeight: 700, marginBottom: 3, fontFamily: "monospace", whiteSpace: "nowrap" },
  bar: { width: "100%", borderRadius: "4px 4px 0 0", minHeight: 2, transition: "height .3s" },
  barLabel: { fontSize: 11, color: "#64748b", fontWeight: 600, whiteSpace: "nowrap" },

  tableCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "8px 0", marginBottom: 16 },
  tableHead: { display: "grid", gridTemplateColumns: "1.2fr 1.1fr 1fr 1fr 1.1fr 1.1fr", gap: 8, padding: "12px 20px", borderBottom: "2px solid #f1f5f9", fontSize: 12, color: "#64748b", fontWeight: 700 },
  thMonth: {},
  thNum: { textAlign: "left" },
  tableRow: { display: "grid", gridTemplateColumns: "1.2fr 1.1fr 1fr 1fr 1.1fr 1.1fr", gap: 8, padding: "13px 20px", borderBottom: "1px solid #f8fafc", alignItems: "center" },
  tdMonth: { fontSize: 14, fontWeight: 600, color: "#0f172a" },
  tdNum: { textAlign: "left", fontSize: 14, color: "#334155", fontFamily: "monospace" },

  note: { fontSize: 12, color: "#94a3b8", margin: "16px 0 0", lineHeight: 1.6 },
};
