import { useState, useEffect, useMemo } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

/* ============================================================
   BuildSystemView — بناء النظام (العميل يختار أقسامه ويدفع)
   يقرأ الأسعار من منصة المالك، العميل يحدّد المستخدمين والعمالة،
   يختار الأقسام، يشوف التكلفة مباشرة، ويحفظ ويفعّل.
   getBuildData / saveTenantBuild.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const WORKER_STEPS = [100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000];

// بنية الإدارات والأقسام (مطابقة لـ Central ومنصة المالك)
const STRUCTURE = [
  { id: "exec", name: "الإدارة العليا", color: "#7c3aed", subs: [
    { id: "exec_kpi", name: "لوحة المؤشرات" }, { id: "exec_org", name: "الهيكل التنظيمي" }, { id: "exec_perm", name: "الصلاحيات" },
  ] },
  { id: "fin", name: "المالية", color: "#059669", subs: [
    { id: "fin_acc", name: "المحاسبة" }, { id: "fin_inv", name: "الفوترة و ZATCA" }, { id: "fin_cust", name: "العملاء" },
    { id: "fin_fs", name: "القوائم المالية" }, { id: "fin_coll", name: "التحصيل" }, { id: "fin_treas", name: "الخزينة" },
    { id: "fin_fpa", name: "التخطيط والتحليل" }, { id: "fin_proc", name: "المشتريات" }, { id: "fin_pos", name: "نقاط البيع" }, { id: "fin_cash", name: "الكاشير" },
  ] },
  { id: "hr", name: "الموارد البشرية", color: "#2563eb", subs: [
    { id: "hr_emp", name: "شؤون الموظفين" }, { id: "hr_pay", name: "الرواتب" }, { id: "hr_rec", name: "التوظيف" },
    { id: "hr_train", name: "التدريب" }, { id: "hr_rel", name: "علاقات الموظفين" },
  ] },
  { id: "ops", name: "العمليات", color: "#ea580c", subs: [
    { id: "ops_proj", name: "المشاريع" }, { id: "ops_people", name: "الأفراد" }, { id: "ops_facilities", name: "المرافق" },
    { id: "ops_materials", name: "المواد" }, { id: "ops_inv", name: "المخزون" }, { id: "ops_req", name: "طلبات المخزون" },
    { id: "ops_process", name: "العمليات التشغيلية" }, { id: "ops_planning", name: "التخطيط والرقابة" }, { id: "ops_qs", name: "الجودة والسلامة" },
  ] },
  { id: "assets", name: "الأصول والمرافق", color: "#0e7490", subs: [
    { id: "as_veh", name: "المركبات" }, { id: "as_hous", name: "الإسكان" }, { id: "as_equ", name: "المعدّات" },
    { id: "as_simple", name: "الأصول البسيطة" }, { id: "as_dep", name: "الإهلاك" },
  ] },
  { id: "cost", name: "التكاليف والربحية", color: "#ca8a04", subs: [
    { id: "cost_full", name: "التكلفة الشاملة" }, { id: "cost_prof", name: "تقارير الربحية" }, { id: "cost_alloc", name: "توزيع الموارد" },
  ] },
  { id: "sales", name: "المبيعات والتسويق", color: "#db2777", subs: [
    { id: "sal_dir", name: "المبيعات المباشرة" }, { id: "sal_quote", name: "عروض الأسعار" }, { id: "sal_mkt", name: "التسويق والتواصل" }, { id: "sal_serv", name: "خدمة العملاء" },
  ] },
  { id: "legal", name: "القانونية والامتثال", color: "#78716c", subs: [
    { id: "leg_con", name: "العقود" }, { id: "leg_com", name: "الامتثال والتراخيص" }, { id: "leg_dis", name: "المنازعات" },
  ] },
  { id: "quality", name: "التميز والجودة", color: "#65a30d", subs: [
    { id: "qa_aud", name: "التدقيق الداخلي" }, { id: "qa_nps", name: "رضا العملاء و NPS" }, { id: "qa_imp", name: "تحسين العمليات" },
  ] },
];

export default function BuildSystemView() {
  const [pricing, setPricing] = useState(null);
  const [selected, setSelected] = useState({}); // { sub_id: true }
  const [userCount, setUserCount] = useState(1);
  const [workerCount, setWorkerCount] = useState(100);
  const [current, setCurrent] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await httpsCallable(functions, "getBuildData")({});
      const d = res.data;
      setPricing(d.pricing);
      setIsOwner(!!d.isOwner);
      setCurrent(d.current);
      const sel = {};
      (d.current.activeModules || []).forEach((m) => { sel[m] = true; });
      setSelected(sel);
      if (d.current.userCount > 0) setUserCount(d.current.userCount);
      if (d.current.workerCount > 0) setWorkerCount(d.current.workerCount);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(subId) {
    setSavedMsg("");
    setSelected((s) => {
      const n = { ...s };
      if (n[subId]) delete n[subId]; else n[subId] = true;
      return n;
    });
  }
  function toggleDept(dept) {
    setSavedMsg("");
    const allOn = dept.subs.every((s) => selected[s.id]);
    setSelected((s) => {
      const n = { ...s };
      dept.subs.forEach((sub) => { if (allOn) delete n[sub.id]; else n[sub.id] = true; });
      return n;
    });
  }

  // الحساب المباشر (نفس منطق الباكإند)
  const calc = useMemo(() => {
    if (!pricing) return { total: 0, hasWorker: false, userCost: 0, deptCost: 0, workerCost: 0, deptCount: 0 };
    const userCost = (Number(pricing.userPrice) || 0) * userCount;
    let deptCost = 0, workerDeptCount = 0, deptCount = 0;
    Object.keys(selected).forEach((m) => {
      deptCount++;
      if (pricing.workerDepts[m]) workerDeptCount++;
      else deptCost += Number(pricing.prices[m]) || 0;
    });
    const workerCost = (Number(pricing.workerPrice) || 0) * workerCount * workerDeptCount;
    return { total: userCost + deptCost + workerCost, hasWorker: workerDeptCount > 0, userCost, deptCost, workerCost, deptCount, workerDeptCount };
  }, [pricing, selected, userCount, workerCount]);

  async function save() {
    setError("");
    setSavedMsg("");
    if (calc.deptCount === 0) { setError("اختر قسمًا واحدًا على الأقل."); return; }
    if (calc.hasWorker && workerCount < 1) { setError("حدّد عدد العمالة (اخترت أقسامًا تُسعّر بالعامل)."); return; }
    setSaving(true);
    try {
      const res = await httpsCallable(functions, "saveTenantBuild")({
        modules: Object.keys(selected),
        userCount: userCount,
        workerCount: workerCount,
      });
      setSavedMsg(`تم الحفظ والتفعيل. اشتراكك الشهري: ${fmt(res.data.subscriptionAmount)} ر.س`);
      load();
    } catch (e) {
      setError(e.message || "تعذّر الحفظ.");
      setSaving(false);
    }
  }

  if (loading) return <div style={styles.page}><p style={styles.muted}>جارٍ التحميل...</p></div>;

  return (
    <div style={styles.page}>
      <div style={styles.head}>
        <h1 style={styles.pageTitle}>بناء النظام</h1>
        <p style={styles.pageSub}>اختر الأقسام التي تحتاجها فقط، وادفع مقابلها. النظام يبدأ بما تختاره ويكبر معك.</p>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {savedMsg ? <div style={styles.savedBox}>✓ {savedMsg}</div> : null}
      {!isOwner ? <div style={styles.warnBox}>التعديل والدفع متاحان لمالك الحساب فقط. يمكنك تصفّح الأقسام والأسعار.</div> : null}

      {/* الأعداد + التكلفة */}
      <div style={styles.controlBar}>
        <div style={styles.countCard}>
          <label style={styles.countLabel}>👤 عدد المستخدمين الإداريين</label>
          <input style={styles.countInput} type="number" min="1" value={userCount} onChange={(e) => { setSavedMsg(""); setUserCount(Math.max(1, Number(e.target.value) || 1)); }} disabled={!isOwner || saving} dir="ltr" />
        </div>
        <div style={styles.countCard}>
          <label style={styles.countLabel}>👷 عدد العمالة {calc.hasWorker ? <span style={styles.reqStar}>*</span> : <span style={styles.optNote}>(للأقسام المرتبطة بالعمالة)</span>}</label>
          <select style={styles.countInput} value={workerCount} onChange={(e) => { setSavedMsg(""); setWorkerCount(Number(e.target.value)); }} disabled={!isOwner || saving} dir="ltr">
            {WORKER_STEPS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div style={styles.totalCard}>
          <span style={styles.totalLabel}>الاشتراك الشهري</span>
          <span style={styles.totalValue} dir="ltr">{fmt(calc.total)}</span>
          <span style={styles.totalUnit}>ر.س / شهر</span>
        </div>
      </div>

      {/* تفصيل التكلفة */}
      {calc.deptCount > 0 ? (
        <div style={styles.breakdown}>
          <span style={styles.bdItem}>المستخدمون: <b dir="ltr">{fmt(calc.userCost)}</b></span>
          <span style={styles.bdSep}>+</span>
          <span style={styles.bdItem}>الأقسام الثابتة: <b dir="ltr">{fmt(calc.deptCost)}</b></span>
          {calc.workerDeptCount > 0 ? <><span style={styles.bdSep}>+</span><span style={styles.bdItem}>العمالة ({calc.workerDeptCount} قسم): <b dir="ltr">{fmt(calc.workerCost)}</b></span></> : null}
        </div>
      ) : null}

      {/* الإدارات والأقسام */}
      <div style={styles.deptList}>
        {STRUCTURE.map((dept) => {
          const allOn = dept.subs.every((s) => selected[s.id]);
          const someOn = dept.subs.some((s) => selected[s.id]);
          return (
            <div key={dept.id} style={{ ...styles.deptCard, ...(someOn ? { borderColor: dept.color } : {}) }}>
              <div style={{ ...styles.deptHead, borderRightColor: dept.color }}>
                <label style={styles.deptCheck}>
                  <input type="checkbox" checked={allOn} ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }} onChange={() => toggleDept(dept)} disabled={!isOwner || saving} />
                  <span style={{ ...styles.deptName, color: dept.color }}>{dept.name}</span>
                </label>
                <span style={styles.deptCount}>{dept.subs.filter((s) => selected[s.id]).length}/{dept.subs.length}</span>
              </div>
              <div style={styles.subGrid}>
                {dept.subs.map((sub) => {
                  const isSel = !!selected[sub.id];
                  const isWorker = pricing && pricing.workerDepts[sub.id];
                  const price = pricing ? (Number(pricing.prices[sub.id]) || 0) : 0;
                  return (
                    <label key={sub.id} style={{ ...styles.subRow, ...(isSel ? styles.subRowOn : {}) }}>
                      <div style={styles.subLeft}>
                        <input type="checkbox" checked={isSel} onChange={() => toggle(sub.id)} disabled={!isOwner || saving} />
                        <span style={styles.subName}>{sub.name}</span>
                      </div>
                      {isWorker ? (
                        <span style={styles.workerPrice} dir="ltr">{fmt(pricing.workerPrice)} × عامل</span>
                      ) : price > 0 ? (
                        <span style={styles.subPrice} dir="ltr">{fmt(price)} ر.س</span>
                      ) : (
                        <span style={styles.freePrice}>—</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* زر الحفظ */}
      {isOwner ? (
        <div style={styles.saveBar}>
          <div style={styles.saveSummary}>
            <span style={styles.saveSummaryText}>{calc.deptCount} قسم مختار</span>
            <span style={styles.saveSummaryAmount} dir="ltr">{fmt(calc.total)} ر.س/شهر</span>
          </div>
          <button style={styles.saveBtn} onClick={save} disabled={saving || calc.deptCount === 0}>{saving ? "جارٍ الحفظ..." : "💾 حفظ وتفعيل"}</button>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 120px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  head: { marginBottom: 22 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#4f46e5", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  savedBox: { padding: "11px 14px", background: "#dcfce7", color: "#15803d", borderRadius: 8, fontSize: 14, marginBottom: 16, fontWeight: 700 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },

  controlBar: { display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 14, marginBottom: 14 },
  countCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 18px" },
  countLabel: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 10 },
  reqStar: { color: "#dc2626", fontWeight: 800 },
  optNote: { fontSize: 11, color: "#94a3b8", fontWeight: 400 },
  countInput: { width: "100%", padding: "10px 12px", fontSize: 16, fontWeight: 700, border: "1px solid #cbd5e1", borderRadius: 8, textAlign: "center", fontFamily: "monospace", boxSizing: "border-box" },
  totalCard: { background: "linear-gradient(135deg, #4f46e5, #6366f1)", borderRadius: 12, padding: "14px 28px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 180 },
  totalLabel: { fontSize: 12, color: "#c7d2fe", fontWeight: 600 },
  totalValue: { fontSize: 30, fontWeight: 800, color: "#fff", fontFamily: "monospace", lineHeight: 1.2 },
  totalUnit: { fontSize: 12, color: "#c7d2fe" },

  breakdown: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 16px", background: "#eef2ff", borderRadius: 10, fontSize: 13, color: "#4338ca", marginBottom: 20 },
  bdItem: { fontWeight: 500 },
  bdSep: { color: "#a5b4fc", fontWeight: 800 },

  deptList: { display: "flex", flexDirection: "column", gap: 12 },
  deptCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", transition: "border-color .15s" },
  deptHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px", borderRight: "4px solid", background: "#fafbfc" },
  deptCheck: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" },
  deptName: { fontSize: 16, fontWeight: 800 },
  deptCount: { fontSize: 13, fontWeight: 700, color: "#94a3b8", fontFamily: "monospace" },
  subGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8, padding: "14px 18px" },
  subRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 12px", background: "#f8fafc", borderRadius: 8, cursor: "pointer", border: "1px solid transparent" },
  subRowOn: { background: "#eef2ff", borderColor: "#c7d2fe" },
  subLeft: { display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0 },
  subName: { fontSize: 13, fontWeight: 600, color: "#334155" },
  subPrice: { fontSize: 13, fontWeight: 700, color: "#16a34a", fontFamily: "monospace", flexShrink: 0 },
  workerPrice: { fontSize: 12, fontWeight: 700, color: "#ea580c", fontFamily: "monospace", flexShrink: 0 },
  freePrice: { fontSize: 13, color: "#cbd5e1", flexShrink: 0 },

  saveBar: { position: "fixed", bottom: 0, right: 0, left: 0, background: "#fff", borderTop: "1px solid #e2e8f0", padding: "14px 30px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, boxShadow: "0 -4px 16px rgba(0,0,0,.06)", zIndex: 50 },
  saveSummary: { display: "flex", flexDirection: "column", gap: 2 },
  saveSummaryText: { fontSize: 13, color: "#64748b" },
  saveSummaryAmount: { fontSize: 20, fontWeight: 800, color: "#4f46e5", fontFamily: "monospace" },
  saveBtn: { padding: "13px 32px", fontSize: 15, fontWeight: 700, color: "#fff", background: "#4f46e5", border: "none", borderRadius: 10, cursor: "pointer" },
};
