import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   تحسين العمليات — قسم التميز والجودة (آخر صفحة في النظام)
   مبادرات التحسين مع التقدّم والوفورات ومؤشرات قبل/بعد.
   getImprovementData / createImprovement / updateImprovement /
   deleteImprovement.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const STATUS_INFO = {
  planned: { label: "مخطّطة", color: "#64748b", bg: "#f1f5f9" },
  active: { label: "نشطة", color: "#2563eb", bg: "#dbeafe" },
  done: { label: "مكتملة", color: "#16a34a", bg: "#dcfce7" },
};
const STATUS_ORDER = ["planned", "active", "done"];

export default function ProcessImprovementView() {
  const [tenantId, setTenantId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);

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
      const res = await httpsCallable(functions, "getImprovementData")({});
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const s = data ? data.summary : { activeCount: 0, doneCount: 0, plannedCount: 0, totalCount: 0, totalSavings: 0, totalTimeSaved: 0, avgProgress: 0 };
  const improvements = data ? data.improvements : [];
  const efficiency = data ? data.efficiency : [];
  const byDept = data ? data.byDept : [];
  const maxDept = Math.max(1, ...byDept.map((d) => d.value));

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>تحسين العمليات</h1>
          <p style={styles.pageSub}>مبادرات تحسين الكفاءة وتتبّع أثرها والوفورات.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setModal("new")}>+ مبادرة جديدة</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : !data ? (
        <div style={styles.warnBox}>تعذّر تحميل البيانات.</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>مبادرات نشطة</span><span style={{ ...styles.kpiValue, color: "#65a30d" }}>{s.activeCount}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>الوفورات المحققة</span><span style={{ ...styles.kpiValue, color: "#16a34a" }} dir="ltr">{fmt(s.totalSavings)}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>متوسط الإنجاز</span><span style={{ ...styles.kpiValue, color: "#2563eb" }} dir="ltr">{s.avgProgress}%</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>مبادرات مكتملة</span><span style={{ ...styles.kpiValue, color: "#7c3aed" }}>{s.doneCount}</span></div>
          </div>

          {/* الأثر */}
          {(s.totalTimeSaved > 0 || s.totalSavings > 0) ? (
            <div style={styles.impactBar}>
              <div style={styles.impactItem}><span style={styles.impactIcon}>⏱</span><div><span style={styles.impactVal} dir="ltr">{fmt(s.totalTimeSaved)}</span><span style={styles.impactLabel}>ساعة موفّرة</span></div></div>
              <div style={styles.impactDivider} />
              <div style={styles.impactItem}><span style={styles.impactIcon}>💰</span><div><span style={styles.impactVal} dir="ltr">{fmt(s.totalSavings)}</span><span style={styles.impactLabel}>ريال وفورات</span></div></div>
            </div>
          ) : null}

          <div style={styles.twoCol}>
            {/* المبادرات */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>مبادرات التحسين ({improvements.length})</h3>
              {improvements.length === 0 ? <p style={styles.muted}>لا توجد مبادرات. أضف مبادرة جديدة.</p> : (
                <div style={styles.initList}>
                  {improvements.map((i) => {
                    const st = STATUS_INFO[i.status] || STATUS_INFO.active;
                    return (
                      <div key={i.id} style={styles.initCard}>
                        <div style={styles.iTop}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={styles.iName}>{i.name}</div>
                            {i.department ? <div style={styles.iDept}>🏢 {i.department}</div> : null}
                          </div>
                          <span style={{ ...styles.chip, color: st.color, background: st.bg }}>{st.label}</span>
                        </div>
                        <div style={styles.progressRow}>
                          <div style={styles.progressTrack}><div style={{ ...styles.progressFill, width: `${i.progress}%`, background: i.progress >= 100 ? "#16a34a" : "#65a30d" }} /></div>
                          <span style={styles.progressPct} dir="ltr">{i.progress}%</span>
                        </div>
                        <div style={styles.iMeta}>
                          {i.savings > 0 ? <span style={styles.iSavings}>💰 <span dir="ltr">{fmt(i.savings)}</span> ر.س</span> : null}
                          {i.timeSavedHours > 0 ? <span style={styles.iTime}>⏱ <span dir="ltr">{fmt(i.timeSavedHours)}</span> ساعة</span> : null}
                        </div>
                        <div style={styles.iActions}>
                          <button style={styles.editBtn} onClick={() => setModal({ edit: i })}>✏️ تعديل</button>
                          <DeleteBtn improvementId={i.id} name={i.name} onDone={loadData} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* الكفاءة + الأقسام */}
            <div>
              {efficiency.length > 0 ? (
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>مؤشرات الكفاءة (قبل / بعد)</h3>
                  <div style={styles.effList}>
                    {efficiency.map((e, idx) => (
                      <div key={idx} style={styles.effItem}>
                        <span style={styles.effName}>{e.name}</span>
                        <div style={styles.effCompare}>
                          <span style={styles.effBefore}>{e.before}</span>
                          <span style={styles.effArrow}>←</span>
                          <span style={styles.effAfter}>{e.after}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>مبادرات حسب القسم</h3>
                {byDept.length === 0 ? <p style={styles.muted}>لا توجد بيانات.</p> : (
                  <div style={styles.deptList}>
                    {byDept.map((d, idx) => (
                      <div key={idx} style={styles.deptItem}>
                        <div style={styles.deptTop}>
                          <span style={styles.deptName}>{d.name}</span>
                          <span style={styles.deptVal}>{d.value}</span>
                        </div>
                        <div style={styles.deptBar}><div style={{ ...styles.deptFill, width: `${(d.value / maxDept) * 100}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {modal === "new" ? <ImprovementModal onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.edit ? <ImprovementModal improvement={modal.edit} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
    </div>
  );
}

function DeleteBtn({ improvementId, name, onDone }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm(`حذف مبادرة «${name}»؟`)) return;
    setBusy(true);
    try {
      await httpsCallable(functions, "deleteImprovement")({ improvementId });
      onDone();
    } catch (e) { alert(e.message || "تعذّر الحذف."); setBusy(false); }
  }
  return <button style={styles.delBtn} onClick={del} disabled={busy}>{busy ? "..." : "🗑 حذف"}</button>;
}

function ImprovementModal({ improvement, onClose, onSaved }) {
  const isEdit = !!improvement;
  const im = improvement || {};
  const [f, setF] = useState({
    name: im.name || "", department: im.department || "", status: im.status || "active",
    progress: im.progress != null ? String(im.progress) : "0",
    savings: im.savings ? String(im.savings) : "", timeSavedHours: im.timeSavedHours ? String(im.timeSavedHours) : "",
    beforeMetric: im.beforeMetric || "", afterMetric: im.afterMetric || "", notes: im.notes || "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم المبادرة مطلوب."); return; }
    setSaving(true);
    try {
      const payload = {
        name: f.name.trim(), department: f.department.trim(), status: f.status,
        progress: Number(f.progress) || 0, savings: Number(f.savings) || 0, timeSavedHours: Number(f.timeSavedHours) || 0,
        beforeMetric: f.beforeMetric.trim(), afterMetric: f.afterMetric.trim(), notes: f.notes.trim(),
      };
      if (isEdit) await httpsCallable(functions, "updateImprovement")({ improvementId: improvement.id, ...payload });
      else await httpsCallable(functions, "createImprovement")(payload);
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الحفظ."); setSaving(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}><h2 style={styles.modalTitle}>{isEdit ? "تعديل المبادرة" : "مبادرة تحسين جديدة"}</h2><button style={styles.close} onClick={onClose}>✕</button></div>
        {err ? <div style={styles.error}>{err}</div> : null}

        <div style={styles.field}><label style={styles.label}>اسم المبادرة *</label><input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={saving} placeholder="أتمتة معالجة الفواتير" /></div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>القسم</label><input style={styles.input} value={f.department} onChange={(e) => set("department", e.target.value)} disabled={saving} placeholder="المالية" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الحالة</label>
            <select style={styles.input} value={f.status} onChange={(e) => set("status", e.target.value)} disabled={saving}>{STATUS_ORDER.map((st) => <option key={st} value={st}>{STATUS_INFO[st].label}</option>)}</select>
          </div></div>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>نسبة التقدّم: {f.progress}%</label>
          <input style={styles.range} type="range" min="0" max="100" step="5" value={f.progress} onChange={(e) => set("progress", e.target.value)} disabled={saving} dir="ltr" />
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الوفورات (ر.س)</label><input style={styles.input} type="number" min="0" value={f.savings} onChange={(e) => set("savings", e.target.value)} disabled={saving} dir="ltr" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>ساعات موفّرة</label><input style={styles.input} type="number" min="0" value={f.timeSavedHours} onChange={(e) => set("timeSavedHours", e.target.value)} disabled={saving} dir="ltr" /></div></div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>المؤشر قبل</label><input style={styles.input} value={f.beforeMetric} onChange={(e) => set("beforeMetric", e.target.value)} disabled={saving} placeholder="٤٨ ساعة" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>المؤشر بعد</label><input style={styles.input} value={f.afterMetric} onChange={(e) => set("afterMetric", e.target.value)} disabled={saving} placeholder="١٢ ساعة" /></div></div>
        </div>
        <div style={styles.field}><label style={styles.label}>ملاحظات</label><textarea style={styles.textarea} value={f.notes} onChange={(e) => set("notes", e.target.value)} disabled={saving} rows={2} /></div>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : isEdit ? "حفظ" : "إضافة"}</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#65a30d", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  addBtn: { padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#65a30d", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 24, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  impactBar: { background: "linear-gradient(135deg, #65a30d, #4d7c0f)", borderRadius: 12, padding: "18px 24px", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 30, flexWrap: "wrap" },
  impactItem: { display: "flex", alignItems: "center", gap: 12 },
  impactIcon: { fontSize: 30 },
  impactVal: { display: "block", fontSize: 24, fontWeight: 800, color: "#fff", fontFamily: "monospace" },
  impactLabel: { display: "block", fontSize: 12, color: "#ecfccb", fontWeight: 600 },
  impactDivider: { width: 1, height: 40, background: "rgba(255,255,255,.3)" },

  twoCol: { display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18, alignItems: "start" },

  section: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 22px", marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a", margin: "0 0 16px" },

  initList: { display: "flex", flexDirection: "column", gap: 12 },
  initCard: { border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" },
  iTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  iName: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  iDept: { fontSize: 13, color: "#64748b", marginTop: 4 },
  chip: { fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 12px", whiteSpace: "nowrap" },
  progressRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 },
  progressTrack: { flex: 1, height: 10, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999, transition: "width .3s" },
  progressPct: { fontSize: 13, fontWeight: 800, color: "#334155", fontFamily: "monospace", minWidth: 38, textAlign: "left" },
  iMeta: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 },
  iSavings: { fontSize: 12, color: "#16a34a", fontWeight: 600 },
  iTime: { fontSize: 12, color: "#2563eb", fontWeight: 600 },
  iActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  editBtn: { padding: "7px 14px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },
  delBtn: { padding: "7px 14px", fontSize: 13, fontWeight: 600, color: "#dc2626", background: "#fef2f2", border: "none", borderRadius: 7, cursor: "pointer" },

  effList: { display: "flex", flexDirection: "column", gap: 12 },
  effItem: { background: "#f8fafc", borderRadius: 8, padding: "10px 14px" },
  effName: { display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 },
  effCompare: { display: "flex", alignItems: "center", gap: 10 },
  effBefore: { fontSize: 13, color: "#dc2626", fontWeight: 600, textDecoration: "line-through" },
  effArrow: { fontSize: 14, color: "#94a3b8" },
  effAfter: { fontSize: 13, color: "#16a34a", fontWeight: 800 },

  deptList: { display: "flex", flexDirection: "column", gap: 14 },
  deptItem: {},
  deptTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 },
  deptName: { fontSize: 14, fontWeight: 600, color: "#334155" },
  deptVal: { fontSize: 13, color: "#64748b", fontWeight: 700, fontFamily: "monospace" },
  deptBar: { height: 8, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" },
  deptFill: { height: "100%", background: "linear-gradient(90deg, #65a30d, #84cc16)", borderRadius: 999 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  range: { width: "100%", accentColor: "#65a30d" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  row: { display: "flex", gap: 12 },
  modalActions: { display: "flex", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#65a30d", border: "none", borderRadius: 8, cursor: "pointer" },
};
