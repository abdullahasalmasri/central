import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   الهيكل التنظيمي — الإدارة العليا
   شجرة الأقسام الإدارية: المُفعّل (المدفوع) ملوّن مع مديره،
   وغير المُفعّل رمادي ومقفل — لتحفيز رفع مستوى الاشتراك.
   التفعيل والمدراء من getOrgStructure / updateOrgSection.
   ============================================================ */

// شجرة الأقسام (تطابق السايدبار) — الحالة تأتي من الاشتراك
const SECTIONS = [
  { id: "exec", name: "الإدارة العليا", color: "#7c3aed", children: [
    { id: "exec_kpi", name: "لوحة المؤشرات" }, { id: "exec_org", name: "الهيكل التنظيمي" }, { id: "exec_perm", name: "الصلاحيات" },
  ]},
  { id: "fin", name: "المالية", color: "#059669", children: [
    { id: "fin_acc", name: "المحاسبة" }, { id: "fin_inv", name: "الفوترة و ZATCA" }, { id: "fin_cust", name: "العملاء" },
    { id: "fin_fs", name: "القوائم المالية" }, { id: "fin_coll", name: "التحصيل" }, { id: "fin_treas", name: "الخزينة" },
    { id: "fin_fpa", name: "التخطيط والتحليل" }, { id: "fin_proc", name: "المشتريات" },
  ]},
  { id: "hr", name: "الموارد البشرية", color: "#2563eb", children: [
    { id: "hr_emp", name: "شؤون الموظفين" }, { id: "hr_pay", name: "الرواتب" }, { id: "hr_rec", name: "التوظيف" },
    { id: "hr_train", name: "التدريب" }, { id: "hr_rel", name: "علاقات الموظفين" },
  ]},
  { id: "ops", name: "العمليات", color: "#ea580c", children: [
    { id: "ops_proj", name: "المشاريع" }, { id: "ops_people", name: "الأفراد" }, { id: "ops_facilities", name: "المرافق" },
    { id: "ops_materials", name: "المواد" }, { id: "ops_process", name: "العمليات التشغيلية" }, { id: "ops_planning", name: "التخطيط والرقابة" },
    { id: "ops_qs", name: "الجودة والسلامة" },
  ]},
  { id: "assets", name: "الأصول والمرافق", color: "#0e7490", children: [
    { id: "as_veh", name: "المركبات" }, { id: "as_hous", name: "الإسكان" }, { id: "as_equ", name: "المعدّات" },
    { id: "as_simple", name: "الأصول البسيطة" }, { id: "as_dep", name: "الإهلاك" },
  ]},
  { id: "cost", name: "التكاليف والربحية", color: "#ca8a04", children: [
    { id: "cost_full", name: "التكلفة الشاملة" }, { id: "cost_prof", name: "تقارير الربحية" }, { id: "cost_alloc", name: "توزيع الموارد" },
  ]},
  { id: "sales", name: "المبيعات والتسويق", color: "#db2777", children: [
    { id: "sal_dir", name: "المبيعات المباشرة" }, { id: "sal_mkt", name: "التسويق والتواصل" }, { id: "sal_serv", name: "خدمة العملاء" },
  ]},
  { id: "legal", name: "القانونية والامتثال", color: "#78716c", children: [
    { id: "leg_con", name: "العقود" }, { id: "leg_com", name: "الامتثال والتراخيص" }, { id: "leg_dis", name: "المنازعات" },
  ]},
  { id: "quality", name: "التميز والجودة", color: "#65a30d", children: [
    { id: "qa_aud", name: "التدقيق الداخلي" }, { id: "qa_nps", name: "رضا العملاء و NPS" }, { id: "qa_imp", name: "تحسين العمليات" },
  ]},
];

export default function OrgStructureView() {
  const [tenantId, setTenantId] = useState("");
  const [org, setOrg] = useState({});
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [managerModal, setManagerModal] = useState(null); // { sectionId, name, current }

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
  }, [tenantId]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "getOrgStructure");
      const res = await fn({});
      setOrg(res.data.orgStructure || {});
      setCanManage(!!res.data.canManage);
    } catch (e) {
      setError(e.message || "تعذّر تحميل الهيكل.");
    } finally {
      setLoading(false);
    }
  }

  const isActive = (id) => !!(org[id] && org[id].active);
  const managerOf = (id) => (org[id] && org[id].manager) || "";

  async function toggle(sectionId) {
    if (!canManage) return;
    try {
      const fn = httpsCallable(functions, "updateOrgSection");
      await fn({ sectionId, active: !isActive(sectionId) });
      setOrg((prev) => ({ ...prev, [sectionId]: { ...(prev[sectionId] || {}), active: !isActive(sectionId) } }));
    } catch (e) { alert(e.message || "تعذّر التحديث."); }
  }

  async function saveManager(sectionId, name) {
    try {
      const fn = httpsCallable(functions, "updateOrgSection");
      await fn({ sectionId, manager: name });
      setOrg((prev) => ({ ...prev, [sectionId]: { ...(prev[sectionId] || {}), manager: name || null } }));
      setManagerModal(null);
    } catch (e) { alert(e.message || "تعذّر الحفظ."); }
  }

  // إحصائيات عامة
  const allChildren = SECTIONS.flatMap((s) => s.children);
  const activeTotal = allChildren.filter((c) => isActive(c.id)).length;

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>👑 الهيكل التنظيمي</h1>
          <p style={styles.pageSub}>أقسام الشركة الإدارية — المُفعّل ملوّن، وغير المُفعّل مقفل.</p>
        </div>
        <div style={styles.statBadge}>{activeTotal} / {allChildren.length} قسم مُفعّل</div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {!loading && !canManage ? (
        <div style={styles.infoBox}>👁 أنت تشاهد الهيكل فقط. تفعيل الأقسام وتعيين المدراء متاح للمالك.</div>
      ) : null}
      {!loading && canManage ? (
        <div style={styles.ownerBox}>🔑 بصفتك المالك: فعّل الأقسام المشترَك بها وعيّن مديريها. الأقسام المقفلة تحتاج ترقية الاشتراك.</div>
      ) : null}

      {loading ? <p style={styles.muted}>جارٍ تحميل الهيكل...</p> : (
        <div style={styles.grid}>
          {SECTIONS.map((section) => {
            const activeCount = section.children.filter((c) => isActive(c.id)).length;
            const sectionActive = activeCount > 0;
            return (
              <div key={section.id} style={{ ...styles.deptCard, ...(sectionActive ? {} : styles.deptCardLocked) }}>
                <div style={{ ...styles.deptHead, background: sectionActive ? section.color : "#94a3b8" }}>
                  <span style={styles.deptName}>{section.name}</span>
                  <span style={styles.deptCount}>{activeCount}/{section.children.length}</span>
                </div>
                <div style={styles.subList}>
                  {section.children.map((child) => {
                    const active = isActive(child.id);
                    const mgr = managerOf(child.id);
                    return (
                      <div key={child.id} style={{ ...styles.subItem, ...(active ? {} : styles.subItemLocked) }}>
                        <div style={styles.subLeft}>
                          <span style={{ ...styles.dot, background: active ? section.color : "#cbd5e1" }} />
                          <div style={styles.subInfo}>
                            <span style={{ ...styles.subName, color: active ? "#0f172a" : "#94a3b8" }}>{child.name}</span>
                            {active ? (
                              <span style={styles.mgrLine}>
                                {mgr ? <>👤 {mgr}</> : <span style={styles.noMgr}>بلا مدير</span>}
                                {canManage ? <button style={styles.editMgr} onClick={() => setManagerModal({ sectionId: child.id, name: mgr, title: child.name })}>✏️</button> : null}
                              </span>
                            ) : (
                              <span style={styles.lockedLabel}>🔒 غير مُفعّل</span>
                            )}
                          </div>
                        </div>
                        {canManage ? (
                          <button
                            style={{ ...styles.toggleBtn, ...(active ? styles.toggleOn : styles.toggleOff) }}
                            onClick={() => toggle(child.id)}
                          >
                            {active ? "إيقاف" : "تفعيل"}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {managerModal ? (
        <ManagerModal
          modal={managerModal}
          onClose={() => setManagerModal(null)}
          onSave={(name) => saveManager(managerModal.sectionId, name)}
        />
      ) : null}
    </div>
  );
}

function ManagerModal({ modal, onClose, onSave }) {
  const [name, setName] = useState(modal.name || "");
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await onSave(name.trim()); setSaving(false); }
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>مدير قسم {modal.title}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        <label style={styles.label}>اسم المدير المسؤول</label>
        <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} disabled={saving} placeholder="مثال: أحمد العتيبي" autoFocus />
        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ"}</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#7c3aed", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  statBadge: { background: "#f3e8ff", color: "#7c3aed", borderRadius: 20, padding: "8px 18px", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },
  infoBox: { padding: "12px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13, color: "#64748b", marginBottom: 18 },
  ownerBox: { padding: "12px 16px", background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 10, fontSize: 13, color: "#6b21a8", marginBottom: 18 },

  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 16 },
  deptCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" },
  deptCardLocked: { opacity: 0.85 },
  deptHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", color: "#fff" },
  deptName: { fontSize: 16, fontWeight: 800 },
  deptCount: { fontSize: 13, fontWeight: 700, background: "rgba(255,255,255,.25)", borderRadius: 12, padding: "2px 10px", fontFamily: "monospace" },

  subList: { padding: "8px 0" },
  subItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px", borderBottom: "1px solid #f8fafc", gap: 10 },
  subItemLocked: { background: "#fafafa" },
  subLeft: { display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  subInfo: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  subName: { fontSize: 14, fontWeight: 600 },
  mgrLine: { fontSize: 12, color: "#475569", display: "flex", alignItems: "center", gap: 6 },
  noMgr: { color: "#cbd5e1", fontStyle: "italic" },
  editMgr: { background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: 0, opacity: 0.6 },
  lockedLabel: { fontSize: 11, color: "#cbd5e1", fontWeight: 600 },

  toggleBtn: { padding: "6px 14px", fontSize: 12, fontWeight: 700, border: "none", borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap" },
  toggleOn: { background: "#fef2f2", color: "#dc2626" },
  toggleOff: { background: "#f0fdf4", color: "#16a34a" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  modalActions: { display: "flex", gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 8, cursor: "pointer" },
};
