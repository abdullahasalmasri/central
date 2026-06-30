import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   تقارير الربحية — قسم التكاليف والربحية
   تجمع ربحية كل المشاريع لشهر محدّد (getEnterpriseProfitability)
   مع إجماليات الشركة وترتيب المشاريع بالربح.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const thisMonth = () => new Date().toISOString().slice(0, 7);
const STATUS_LABELS = { active: "نشط", planning: "تخطيط", paused: "متوقّف", completed: "مكتمل", cancelled: "ملغى" };

export default function CostProfitabilityView() {
  const [tenantId, setTenantId] = useState("");
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
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
  }, [tenantId, month]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "getEnterpriseProfitability");
      const res = await fn({ month });
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل التقرير.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const t = data ? data.totals : { revenue: 0, netRevenue: 0, cost: 0, profit: 0, margin: 0 };
  const projects = data ? data.projects : [];

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>تقارير الربحية</h1>
          <p style={styles.pageSub}>ربحية كل المشاريع مجمّعة — لكل شهر، مرتّبة بالربح.</p>
        </div>
        <div style={styles.monthPick}>
          <label style={styles.monthLabel}>الشهر:</label>
          <input style={styles.monthInput} type="month" value={month} onChange={(e) => setMonth(e.target.value)} dir="ltr" />
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ حساب الربحية...</p> : !data ? (
        <div style={styles.warnBox}>تعذّر تحميل التقرير.</div>
      ) : (
        <>
          {/* بطاقات الإجماليات */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>إجمالي الإيراد</span>
              <span style={styles.kpiValue} dir="ltr">{fmt(t.revenue)}</span>
            </div>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>إجمالي التكلفة</span>
              <span style={{ ...styles.kpiValue, color: "#c2410c" }} dir="ltr">{fmt(t.cost)}</span>
            </div>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>صافي الربح</span>
              <span style={{ ...styles.kpiValue, color: t.profit >= 0 ? "#059669" : "#dc2626" }} dir="ltr">{t.profit >= 0 ? "+" : ""}{fmt(t.profit)}</span>
            </div>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>هامش الربح</span>
              <span style={{ ...styles.kpiValue, color: t.margin >= 0 ? "#059669" : "#dc2626" }} dir="ltr">{fmt(t.margin)}%</span>
            </div>
          </div>

          <div style={styles.metaRow}>
            <span style={styles.metaChip}>📁 {data.projectsCount} مشروع</span>
            <span style={styles.metaChip}>👷 {data.workersCount} عامل</span>
            {data.missingCostCount > 0 ? <span style={styles.metaWarn}>⚠ {data.missingCostCount} إسناد بتكلفة ناقصة</span> : null}
          </div>

          {/* جدول المشاريع */}
          {projects.length === 0 ? (
            <div style={styles.warnBox}>لا توجد مشاريع بنشاط في {month}. جرّب شهرًا آخر.</div>
          ) : (
            <div style={styles.tableCard}>
              <div style={styles.tableHead}>
                <span style={styles.thRank}>#</span>
                <span style={styles.thName}>المشروع</span>
                <span style={styles.thNum}>العمالة</span>
                <span style={styles.thNum}>الإيراد</span>
                <span style={styles.thNum}>التكلفة</span>
                <span style={styles.thNum}>الربح</span>
                <span style={styles.thNum}>الهامش</span>
              </div>
              {projects.map((p, i) => (
                <div key={p.projectId} style={styles.tableRow}>
                  <span style={{ ...styles.tdRank, ...(i === 0 ? styles.rankGold : i === 1 ? styles.rankSilver : i === 2 ? styles.rankBronze : {}) }}>{i + 1}</span>
                  <span style={styles.tdName}>
                    <span style={styles.projName}>{p.projectName || `مشروع #${p.projectNumber}`}</span>
                    {p.status ? <span style={styles.statusChip}>{STATUS_LABELS[p.status] || p.status}</span> : null}
                    {p.missingCostCount > 0 ? <span style={styles.missChip}>⚠ {p.missingCostCount}</span> : null}
                  </span>
                  <span style={styles.tdNum}>{p.workersCount}</span>
                  <span style={styles.tdNum} dir="ltr">{fmt(p.revenue)}</span>
                  <span style={{ ...styles.tdNum, color: "#c2410c" }} dir="ltr">{fmt(p.cost)}</span>
                  <span style={{ ...styles.tdNum, color: p.profit >= 0 ? "#059669" : "#dc2626", fontWeight: 700 }} dir="ltr">{p.profit >= 0 ? "+" : ""}{fmt(p.profit)}</span>
                  <span style={{ ...styles.tdNum, color: p.margin >= 0 ? "#059669" : "#dc2626" }} dir="ltr">{fmt(p.margin)}%</span>
                </div>
              ))}
              <div style={styles.tableTotal}>
                <span style={styles.thRank}></span>
                <span style={styles.tdName}><strong>الإجمالي</strong></span>
                <span style={styles.tdNum}>{data.workersCount}</span>
                <span style={styles.tdNum} dir="ltr"><strong>{fmt(t.revenue)}</strong></span>
                <span style={{ ...styles.tdNum, color: "#c2410c" }} dir="ltr"><strong>{fmt(t.cost)}</strong></span>
                <span style={{ ...styles.tdNum, color: t.profit >= 0 ? "#059669" : "#dc2626" }} dir="ltr"><strong>{fmt(t.profit)}</strong></span>
                <span style={{ ...styles.tdNum, color: t.margin >= 0 ? "#059669" : "#dc2626" }} dir="ltr"><strong>{fmt(t.margin)}%</strong></span>
              </div>
            </div>
          )}

          <p style={styles.note}>💡 الربحية محسوبة من إسنادات العمالة للمشاريع (الإيراد من العميل − تكلفة العامل − نصيب الإدارة). الإسنادات بتكلفة ناقصة لا تُحتسب.</p>
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
  monthPick: { display: "flex", alignItems: "center", gap: 10, background: "#fff", padding: "10px 16px", borderRadius: 10, border: "1px solid #e2e8f0" },
  monthLabel: { fontSize: 13, fontWeight: 700, color: "#334155" },
  monthInput: { padding: "8px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 24, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  metaRow: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 },
  metaChip: { fontSize: 13, color: "#475569", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20, padding: "6px 14px", fontWeight: 600 },
  metaWarn: { fontSize: 13, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 20, padding: "6px 14px", fontWeight: 600 },

  tableCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "8px 0", overflow: "hidden" },
  tableHead: { display: "grid", gridTemplateColumns: "40px 2.4fr 0.8fr 1.1fr 1.1fr 1.1fr 0.9fr", gap: 8, padding: "12px 20px", borderBottom: "2px solid #f1f5f9", fontSize: 12, color: "#64748b", fontWeight: 700 },
  thRank: { textAlign: "center" },
  thName: {},
  thNum: { textAlign: "left" },
  tableRow: { display: "grid", gridTemplateColumns: "40px 2.4fr 0.8fr 1.1fr 1.1fr 1.1fr 0.9fr", gap: 8, padding: "14px 20px", borderBottom: "1px solid #f8fafc", alignItems: "center" },
  tdRank: { textAlign: "center", fontSize: 14, fontWeight: 700, color: "#94a3b8" },
  rankGold: { color: "#ca8a04" },
  rankSilver: { color: "#94a3b8" },
  rankBronze: { color: "#c2410c" },
  tdName: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  projName: { fontSize: 14, fontWeight: 600, color: "#0f172a" },
  statusChip: { fontSize: 11, color: "#475569", background: "#f1f5f9", borderRadius: 6, padding: "2px 8px", fontWeight: 600 },
  missChip: { fontSize: 11, color: "#92400e", background: "#fffbeb", borderRadius: 6, padding: "2px 8px", fontWeight: 600 },
  tdNum: { textAlign: "left", fontSize: 14, color: "#334155", fontFamily: "monospace" },
  tableTotal: { display: "grid", gridTemplateColumns: "40px 2.4fr 0.8fr 1.1fr 1.1fr 1.1fr 0.9fr", gap: 8, padding: "14px 20px", background: "#fafafa", alignItems: "center", fontFamily: "monospace" },

  note: { fontSize: 12, color: "#94a3b8", margin: "16px 0 0", lineHeight: 1.6 },
};
