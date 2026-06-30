import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   توزيع الموارد — قسم التكاليف والربحية
   كيف توزّع موارد الشركة (العمالة + الأصول) على المشاريع لشهر
   محدّد، مع النسب وتنبيه التركّز (getResourceAllocation).
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const thisMonth = () => new Date().toISOString().slice(0, 7);
const STATUS_LABELS = { active: "نشط", planning: "تخطيط", paused: "متوقّف", completed: "مكتمل", cancelled: "ملغى" };
const CONCENTRATION_LIMIT = 50; // تنبيه لو مشروع ياخذ أكثر من 50% من الموارد

export default function CostAllocationView() {
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
      const fn = httpsCallable(functions, "getResourceAllocation");
      const res = await fn({ month });
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل التوزيع.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const t = data ? data.totals : { workersCount: 0, workerCost: 0, assetsCount: 0, assetCost: 0, totalCost: 0 };
  const projects = data ? data.projects : [];
  const topProject = projects.length > 0 ? projects[0] : null;
  const concentrated = topProject && topProject.share > CONCENTRATION_LIMIT;
  const laborPct = t.totalCost > 0 ? Math.round((t.workerCost / t.totalCost) * 100) : 0;
  const assetPct = t.totalCost > 0 ? Math.round((t.assetCost / t.totalCost) * 100) : 0;

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>توزيع الموارد</h1>
          <p style={styles.pageSub}>كيف توزّع العمالة والأصول على المشاريع — لكل شهر.</p>
        </div>
        <div style={styles.monthPick}>
          <label style={styles.monthLabel}>الشهر:</label>
          <input style={styles.monthInput} type="month" value={month} onChange={(e) => setMonth(e.target.value)} dir="ltr" />
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ تحميل التوزيع...</p> : !data ? (
        <div style={styles.warnBox}>تعذّر تحميل التوزيع.</div>
      ) : (
        <>
          {/* بطاقات الإجماليات */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>👷 العمالة</span>
              <span style={{ ...styles.kpiValue, color: "#2563eb" }} dir="ltr">{fmt(t.workerCost)}</span>
              <span style={styles.kpiSub}>{t.workersCount} عامل · {laborPct}%</span>
            </div>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>🏭 الأصول</span>
              <span style={{ ...styles.kpiValue, color: "#0e7490" }} dir="ltr">{fmt(t.assetCost)}</span>
              <span style={styles.kpiSub}>{t.assetsCount} أصل · {assetPct}%</span>
            </div>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>إجمالي الموارد</span>
              <span style={styles.kpiValue} dir="ltr">{fmt(t.totalCost)}</span>
              <span style={styles.kpiSub}>{data.projectsCount} مشروع</span>
            </div>
          </div>

          {/* شريط نسبة العمالة مقابل الأصول */}
          {t.totalCost > 0 ? (
            <div style={styles.splitCard}>
              <div style={styles.splitTitle}>توزيع التكلفة: عمالة مقابل أصول</div>
              <div style={styles.splitBar}>
                <div style={{ ...styles.splitSeg, width: `${laborPct}%`, background: "#2563eb" }}>{laborPct >= 12 ? `عمالة ${laborPct}%` : ""}</div>
                <div style={{ ...styles.splitSeg, width: `${assetPct}%`, background: "#0e7490" }}>{assetPct >= 12 ? `أصول ${assetPct}%` : ""}</div>
              </div>
            </div>
          ) : null}

          {/* تنبيه التركّز */}
          {concentrated ? (
            <div style={styles.concentrationWarn}>
              ⚠ <strong>تركّز موارد:</strong> مشروع «{topProject.projectName || `#${topProject.projectNumber}`}» يستحوذ على <strong>{topProject.share}%</strong> من موارد الشركة. وزّع المخاطر إن أمكن.
            </div>
          ) : null}

          {/* قائمة المشاريع */}
          {projects.length === 0 ? (
            <div style={styles.warnBox}>لا توجد مشاريع بموارد في {month}.</div>
          ) : (
            <div style={styles.projList}>
              {projects.map((p) => (
                <div key={p.projectId} style={styles.projCard}>
                  <div style={styles.projHead}>
                    <div style={styles.projNameWrap}>
                      <span style={styles.projName}>{p.projectName || `مشروع #${p.projectNumber}`}</span>
                      {p.status ? <span style={styles.statusChip}>{STATUS_LABELS[p.status] || p.status}</span> : null}
                    </div>
                    <span style={styles.projShare} dir="ltr">{p.share}%</span>
                  </div>

                  <div style={styles.shareBar}>
                    <div style={{ ...styles.shareFill, width: `${Math.min(100, p.share)}%` }} />
                  </div>

                  <div style={styles.resRow}>
                    <div style={styles.resItem}>
                      <span style={styles.resIcon}>👷</span>
                      <div style={styles.resInfo}>
                        <span style={styles.resLabel}>العمالة</span>
                        <span style={styles.resVal}>{p.workersCount} عامل · <span dir="ltr">{fmt(p.workerCost)}</span></span>
                      </div>
                    </div>
                    <div style={styles.resItem}>
                      <span style={styles.resIcon}>🏭</span>
                      <div style={styles.resInfo}>
                        <span style={styles.resLabel}>الأصول</span>
                        <span style={styles.resVal}>{p.assetsCount} أصل · <span dir="ltr">{fmt(p.assetCost)}</span></span>
                      </div>
                    </div>
                    <div style={styles.resTotal}>
                      <span style={styles.resTotalLabel}>إجمالي الموارد</span>
                      <span style={styles.resTotalVal} dir="ltr">{fmt(p.totalCost)} ﷼</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p style={styles.note}>💡 العمالة من إسنادات المشاريع الشهرية · الأصول من إسناد الأصول للمشاريع (الإيجار/القسط موزّع على المشاريع المشتركة) · النسبة = حصة المشروع من إجمالي موارد الشركة.</p>
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

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 5 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 23, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },
  kpiSub: { fontSize: 11, color: "#94a3b8", fontWeight: 500 },

  splitCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", marginBottom: 16 },
  splitTitle: { fontSize: 14, fontWeight: 700, color: "#334155", marginBottom: 12 },
  splitBar: { display: "flex", height: 32, borderRadius: 8, overflow: "hidden", background: "#f1f5f9" },
  splitSeg: { display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", minWidth: 0, transition: "width .3s" },

  concentrationWarn: { padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, fontSize: 14, color: "#991b1b", marginBottom: 16, lineHeight: 1.6 },

  projList: { display: "flex", flexDirection: "column", gap: 12 },
  projCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px" },
  projHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10 },
  projNameWrap: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  projName: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  statusChip: { fontSize: 11, color: "#475569", background: "#f1f5f9", borderRadius: 6, padding: "2px 8px", fontWeight: 600 },
  projShare: { fontSize: 20, fontWeight: 800, color: "#ca8a04", fontFamily: "monospace" },

  shareBar: { height: 8, background: "#f1f5f9", borderRadius: 999, overflow: "hidden", marginBottom: 16 },
  shareFill: { height: "100%", background: "linear-gradient(90deg, #ca8a04, #fbbf24)", borderRadius: 999, transition: "width .3s" },

  resRow: { display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" },
  resItem: { display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 160 },
  resIcon: { fontSize: 24 },
  resInfo: { display: "flex", flexDirection: "column", gap: 2 },
  resLabel: { fontSize: 11, color: "#94a3b8", fontWeight: 600 },
  resVal: { fontSize: 14, fontWeight: 600, color: "#334155" },
  resTotal: { display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end", paddingRight: 14, borderRight: "2px solid #f1f5f9" },
  resTotalLabel: { fontSize: 11, color: "#94a3b8", fontWeight: 600 },
  resTotalVal: { fontSize: 16, fontWeight: 800, color: "#ca8a04", fontFamily: "monospace" },

  note: { fontSize: 12, color: "#94a3b8", margin: "16px 0 0", lineHeight: 1.6 },
};
