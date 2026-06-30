import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   التخطيط والرقابة — قسم العمليات
   لوحة ربحية لكل مشروع: تجمع تكاليف الأفراد + المرافق + المواد
   (الفعلي تلقائي) وتقارنها بموازنة مخطّطة مفصّلة.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");

export default function PlanningView() {
  const [tenantId, setTenantId] = useState("");
  const [projects, setProjects] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [showBudget, setShowBudget] = useState(false);

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
    if (tenantId) loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    if (tenantId && selectedProjectId) loadProfitability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, tenantId]);

  async function loadProjects() {
    setLoading(true);
    setError("");
    try {
      const pSnap = await getDocs(query(collection(db, "projects"), where("tenantId", "==", tenantId)));
      const pList = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      pList.sort((a, b) => (b.projectNumber || 0) - (a.projectNumber || 0));
      setProjects(pList);
      if (!selectedProjectId && pList.length > 0) setSelectedProjectId(pList[0].id);
    } catch (err) {
      setError("تعذّر تحميل المشاريع.");
    } finally {
      setLoading(false);
    }
  }

  async function loadProfitability() {
    setDataLoading(true);
    try {
      const fn = httpsCallable(functions, "getProjectProfitability");
      const res = await fn({ projectId: selectedProjectId });
      setData(res.data);
    } catch (e) {
      setData(null);
    } finally {
      setDataLoading(false);
    }
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>التخطيط والرقابة</h1>
          <p style={styles.pageSub}>ربحية كل مشروع — الفعلي تلقائيًا، مقارنًا بالموازنة المخطّطة.</p>
        </div>
        {selectedProject ? (
          <button style={styles.addBtn} onClick={() => setShowBudget(true)}>تعديل الموازنة</button>
        ) : null}
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : projects.length === 0 ? (
        <div style={styles.warnBox}>⚠ لا توجد مشاريع. أنشئ مشروعًا أولًا من <strong>العمليات ← المشاريع</strong>.</div>
      ) : (
        <>
          <div style={styles.selectorRow}>
            <label style={styles.selectorLabel}>المشروع:</label>
            <select style={styles.projectSelect} value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>#{p.projectNumber} — {p.name}{p.customerName ? ` (${p.customerName})` : ""}</option>)}
            </select>
          </div>

          {dataLoading ? <p style={styles.muted}>جارٍ حساب الربحية...</p> : !data ? (
            <div style={styles.warnBox}>تعذّر حساب الربحية.</div>
          ) : (
            <>
              {/* بطاقات الربحية الفعلية */}
              <div style={styles.kpiGrid}>
                <div style={styles.kpiCard}>
                  <span style={styles.kpiLabel}>التكلفة الفعلية</span>
                  <span style={{ ...styles.kpiValue, color: "#c2410c" }} dir="ltr">{fmt(data.actual.totalCost)}</span>
                </div>
                <div style={styles.kpiCard}>
                  <span style={styles.kpiLabel}>الإيراد الفعلي</span>
                  <span style={styles.kpiValue} dir="ltr">{fmt(data.actual.totalRevenue)}</span>
                </div>
                <div style={styles.kpiCard}>
                  <span style={styles.kpiLabel}>صافي الربح</span>
                  <span style={{ ...styles.kpiValue, color: data.actual.netProfit >= 0 ? "#059669" : "#dc2626" }} dir="ltr">{data.actual.netProfit >= 0 ? "+" : ""}{fmt(data.actual.netProfit)}</span>
                </div>
                <div style={styles.kpiCard}>
                  <span style={styles.kpiLabel}>هامش الربح</span>
                  <span style={{ ...styles.kpiValue, color: data.actual.margin >= 0 ? "#059669" : "#dc2626" }} dir="ltr">{fmt(data.actual.margin)}%</span>
                </div>
              </div>

              {/* تفصيل الفعلي حسب البند */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>تفصيل التكلفة والإيراد الفعلي</h3>
                <div style={styles.breakdownGrid}>
                  <BreakdownRow label="👷 الأفراد" cost={data.actual.people} rev={data.actual.peopleRev} />
                  <BreakdownRow label="🏭 المرافق" cost={data.actual.facilities} rev={data.actual.facilitiesRev} />
                  <BreakdownRow label="📦 المواد" cost={data.actual.materials} rev={data.actual.materialsRev} />
                  <div style={styles.breakdownTotal}>
                    <span style={styles.bdName}>الإجمالي</span>
                    <span style={styles.bdCostTotal} dir="ltr">{fmt(data.actual.totalCost)}</span>
                    <span style={styles.bdRevTotal} dir="ltr">{fmt(data.actual.totalRevenue)}</span>
                  </div>
                </div>
                <div style={styles.bdHeader}>
                  <span></span><span style={styles.bdHeadLabel}>التكلفة</span><span style={styles.bdHeadLabel}>الإيراد</span>
                </div>
              </div>

              {/* الموازنة: مخطّط ضد فعلي */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>الموازنة المخطّطة مقابل الفعلي</h3>
                {!data.budget.hasBudget ? (
                  <div style={styles.noBudget}>
                    لم تُحدّد موازنة لهذا المشروع بعد. اضغط <strong>«تعديل الموازنة»</strong> لتحديد الميزانية المخطّطة.
                  </div>
                ) : null}
                <div style={styles.budgetTable}>
                  <div style={styles.btHead}>
                    <span>البند</span>
                    <span style={styles.btNum}>المخطّط</span>
                    <span style={styles.btNum}>الفعلي</span>
                    <span style={styles.btNum}>الانحراف</span>
                  </div>
                  <BudgetRow label="الأفراد" planned={data.budget.people} actual={data.actual.people} variance={data.variance.people} isCost />
                  <BudgetRow label="المرافق" planned={data.budget.facilities} actual={data.actual.facilities} variance={data.variance.facilities} isCost />
                  <BudgetRow label="المواد" planned={data.budget.materials} actual={data.actual.materials} variance={data.variance.materials} isCost />
                  <BudgetRow label="إجمالي التكلفة" planned={data.budget.totalCost} actual={data.actual.totalCost} variance={data.variance.totalCost} isCost bold />
                  <BudgetRow label="الإيراد" planned={data.budget.targetRevenue} actual={data.actual.totalRevenue} variance={data.variance.revenue} bold />
                </div>
                <p style={styles.hint}>💡 انحراف التكلفة: الأخضر = تحت الميزانية (جيد). انحراف الإيراد: الأخضر = فوق المستهدف (جيد).</p>
              </div>
            </>
          )}
        </>
      )}

      {showBudget && data ? (
        <BudgetModal
          project={selectedProject}
          current={data.budget}
          onClose={() => setShowBudget(false)}
          onSaved={() => { setShowBudget(false); loadProfitability(); }}
        />
      ) : null}
    </div>
  );
}

function BreakdownRow({ label, cost, rev }) {
  return (
    <div style={styles.breakdownRow}>
      <span style={styles.bdName}>{label}</span>
      <span style={styles.bdCost} dir="ltr">{fmt(cost)}</span>
      <span style={styles.bdRev} dir="ltr">{fmt(rev)}</span>
    </div>
  );
}

function BudgetRow({ label, planned, actual, variance, isCost, bold }) {
  // للتكلفة: موجب = تحت الميزانية (جيد، أخضر). للإيراد: موجب = فوق المستهدف (جيد، أخضر).
  const good = variance >= 0;
  const color = good ? "#059669" : "#dc2626";
  const arrow = variance === 0 ? "—" : good ? "▲" : "▼";
  return (
    <div style={{ ...styles.btRow, ...(bold ? styles.btRowBold : {}) }}>
      <span style={styles.btLabel}>{label}</span>
      <span style={styles.btNumVal} dir="ltr">{fmt(planned)}</span>
      <span style={styles.btNumVal} dir="ltr">{fmt(actual)}</span>
      <span style={{ ...styles.btVariance, color }} dir="ltr">{arrow} {fmt(Math.abs(variance))}</span>
    </div>
  );
}

// ═══════════ مودال الموازنة ═══════════
function BudgetModal({ project, current, onClose, onSaved }) {
  const [f, setF] = useState({
    budgetPeople: current.people ? String(current.people) : "",
    budgetFacilities: current.facilities ? String(current.facilities) : "",
    budgetMaterials: current.materials ? String(current.materials) : "",
    targetRevenue: current.targetRevenue ? String(current.targetRevenue) : "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const totalCost = (Number(f.budgetPeople) || 0) + (Number(f.budgetFacilities) || 0) + (Number(f.budgetMaterials) || 0);
  const targetProfit = (Number(f.targetRevenue) || 0) - totalCost;

  async function save() {
    setErr("");
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "setBudget");
      await fn({
        projectId: project.id,
        budgetPeople: Number(f.budgetPeople) || 0,
        budgetFacilities: Number(f.budgetFacilities) || 0,
        budgetMaterials: Number(f.budgetMaterials) || 0,
        targetRevenue: Number(f.targetRevenue) || 0,
      });
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
          <h2 style={styles.modalTitle}>موازنة المشروع — {project.name}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {err ? <div style={styles.error}>{err}</div> : null}

        <p style={styles.modalNote}>حدّد الميزانية المخطّطة لكل بند والإيراد المستهدف.</p>

        <div style={styles.field}>
          <label style={styles.label}>👷 ميزانية الأفراد</label>
          <input style={styles.input} type="number" min="0" value={f.budgetPeople} onChange={(e) => set("budgetPeople", e.target.value)} disabled={saving} dir="ltr" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>🏭 ميزانية المرافق</label>
          <input style={styles.input} type="number" min="0" value={f.budgetFacilities} onChange={(e) => set("budgetFacilities", e.target.value)} disabled={saving} dir="ltr" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>📦 ميزانية المواد</label>
          <input style={styles.input} type="number" min="0" value={f.budgetMaterials} onChange={(e) => set("budgetMaterials", e.target.value)} disabled={saving} dir="ltr" />
        </div>

        <div style={styles.budgetSummary}>
          <span>إجمالي ميزانية التكلفة</span>
          <span dir="ltr">{fmt(totalCost)} ﷼</span>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>🎯 الإيراد المستهدف</label>
          <input style={styles.input} type="number" min="0" value={f.targetRevenue} onChange={(e) => set("targetRevenue", e.target.value)} disabled={saving} dir="ltr" />
        </div>

        <div style={{ ...styles.profitSummary, background: targetProfit >= 0 ? "#ecfdf5" : "#fef2f2", color: targetProfit >= 0 ? "#065f46" : "#991b1b" }}>
          <span>الربح المستهدف</span>
          <span dir="ltr">{targetProfit >= 0 ? "+" : ""}{fmt(targetProfit)} ﷼</span>
        </div>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ الموازنة"}</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#ea580c", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  addBtn: { padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  selectorRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 18, background: "#fff", padding: "14px 18px", borderRadius: 12, border: "1px solid #e2e8f0" },
  selectorLabel: { fontSize: 14, fontWeight: 700, color: "#334155", whiteSpace: "nowrap" },
  projectSelect: { flex: 1, padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit", background: "#fff" },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 22 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 24, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  section: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 22px", marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a", margin: "0 0 16px" },

  breakdownGrid: { display: "flex", flexDirection: "column", gap: 2 },
  breakdownRow: { display: "grid", gridTemplateColumns: "1fr auto auto", gap: 16, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" },
  breakdownTotal: { display: "grid", gridTemplateColumns: "1fr auto auto", gap: 16, alignItems: "center", padding: "12px 0 0", borderTop: "2px solid #e2e8f0", marginTop: 4 },
  bdName: { fontSize: 14, fontWeight: 600, color: "#334155" },
  bdCost: { fontSize: 14, color: "#c2410c", fontFamily: "monospace", fontWeight: 600, minWidth: 90, textAlign: "left" },
  bdRev: { fontSize: 14, color: "#0f172a", fontFamily: "monospace", fontWeight: 600, minWidth: 90, textAlign: "left" },
  bdCostTotal: { fontSize: 16, color: "#c2410c", fontFamily: "monospace", fontWeight: 800, minWidth: 90, textAlign: "left" },
  bdRevTotal: { fontSize: 16, color: "#0f172a", fontFamily: "monospace", fontWeight: 800, minWidth: 90, textAlign: "left" },
  bdHeader: { display: "grid", gridTemplateColumns: "1fr auto auto", gap: 16, marginTop: 6 },
  bdHeadLabel: { fontSize: 11, color: "#94a3b8", fontWeight: 600, minWidth: 90, textAlign: "left" },

  noBudget: { padding: "12px 16px", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 10, fontSize: 13, color: "#64748b", marginBottom: 14 },
  budgetTable: { display: "flex", flexDirection: "column" },
  btHead: { display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 10, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, fontSize: 12, color: "#64748b", fontWeight: 700 },
  btNum: { textAlign: "left" },
  btRow: { display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 10, padding: "12px", borderBottom: "1px solid #f1f5f9", alignItems: "center" },
  btRowBold: { background: "#fafafa", fontWeight: 800 },
  btLabel: { fontSize: 14, color: "#334155", fontWeight: 600 },
  btNumVal: { fontSize: 14, color: "#475569", fontFamily: "monospace", textAlign: "left" },
  btVariance: { fontSize: 14, fontWeight: 700, fontFamily: "monospace", textAlign: "left" },
  hint: { fontSize: 12, color: "#94a3b8", margin: "14px 0 0", lineHeight: 1.6 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  modalNote: { fontSize: 13, color: "#64748b", margin: "0 0 16px" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },

  budgetSummary: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, fontSize: 14, fontWeight: 800, color: "#9a3412", fontFamily: "monospace", marginBottom: 16 },
  profitSummary: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: 10, fontSize: 15, fontWeight: 800, fontFamily: "monospace", marginBottom: 4 },

  modalActions: { display: "flex", gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer" },
};
