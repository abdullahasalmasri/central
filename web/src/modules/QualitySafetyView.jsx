import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   الجودة والسلامة — قسم العمليات
   حوادث السلامة المهنية + جولات التفتيش الميدانية.
   getSafetyData / createIncident / updateIncident / deleteIncident /
   createSafetyInspection / deleteSafetyInspection.
   ============================================================ */

const SEVERITY = {
  nearmiss: { label: "شبه حادث", color: "#64748b", bg: "#f1f5f9" },
  minor: { label: "بسيطة", color: "#2563eb", bg: "#dbeafe" },
  moderate: { label: "متوسطة", color: "#ea580c", bg: "#ffedd5" },
  major: { label: "خطيرة", color: "#dc2626", bg: "#fee2e2" },
};
const SEV_ORDER = ["nearmiss", "minor", "moderate", "major"];
const INC_STATUS = {
  open: { label: "مفتوحة", color: "#dc2626", bg: "#fee2e2" },
  review: { label: "قيد المراجعة", color: "#ea580c", bg: "#ffedd5" },
  closed: { label: "مغلقة", color: "#16a34a", bg: "#dcfce7" },
};
const INC_STATUS_ORDER = ["open", "review", "closed"];
const RESULT = {
  pass: { label: "مطابق ✓", color: "#16a34a", bg: "#dcfce7" },
  notes: { label: "ملاحظات", color: "#ea580c", bg: "#ffedd5" },
  action: { label: "يحتاج إجراء", color: "#dc2626", bg: "#fee2e2" },
};
const RESULT_ORDER = ["pass", "notes", "action"];

export default function QualitySafetyView() {
  const [tenantId, setTenantId] = useState("");
  const [tab, setTab] = useState("incidents");
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
      const res = await httpsCallable(functions, "getSafetyData")({});
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const s = data ? data.summary : { daysWithoutIncident: null, totalIncidents: 0, incidentsThisMonth: 0, openIncidents: 0, passRate: null, totalInspections: 0, severityBreakdown: {} };
  const incidents = data ? data.incidents : [];
  const inspections = data ? data.inspections : [];

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>الجودة والسلامة</h1>
          <p style={styles.pageSub}>السلامة المهنية وجولات التفتيش الميدانية.</p>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : !data ? (
        <div style={styles.warnBox}>تعذّر تحميل البيانات.</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>أيام بلا حوادث</span><span style={{ ...styles.kpiValue, color: "#16a34a" }}>{s.daysWithoutIncident != null ? s.daysWithoutIncident : "—"}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>حوادث هذا الشهر</span><span style={{ ...styles.kpiValue, color: s.incidentsThisMonth > 0 ? "#ea580c" : "#16a34a" }}>{s.incidentsThisMonth}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>حوادث مفتوحة</span><span style={{ ...styles.kpiValue, color: s.openIncidents > 0 ? "#dc2626" : "#16a34a" }}>{s.openIncidents}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>مطابقة التفتيش</span><span style={{ ...styles.kpiValue, color: "#2563eb" }} dir="ltr">{s.passRate != null ? `${s.passRate}%` : "—"}</span></div>
          </div>

          {/* تبويب */}
          <div style={styles.tabs}>
            <button style={tab === "incidents" ? styles.tabActive : styles.tab} onClick={() => setTab("incidents")}>⚠️ الحوادث</button>
            <button style={tab === "inspections" ? styles.tabActive : styles.tab} onClick={() => setTab("inspections")}>🔍 جولات التفتيش</button>
          </div>

          {tab === "incidents" ? (
            <div style={styles.section}>
              <div style={styles.secHead}>
                <h3 style={styles.sectionTitle}>سجل الحوادث ({incidents.length})</h3>
                <button style={styles.addBtn} onClick={() => setModal({ newIncident: true })}>+ تسجيل حادث</button>
              </div>
              {incidents.length === 0 ? <p style={styles.muted}>لا توجد حوادث مسجّلة. 🎉</p> : (
                <div style={styles.list}>
                  {incidents.map((i) => {
                    const sev = SEVERITY[i.severity] || SEVERITY.minor;
                    const st = INC_STATUS[i.status] || INC_STATUS.open;
                    return (
                      <div key={i.id} style={styles.incCard}>
                        <div style={styles.iTop}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={styles.iTypeRow}>
                              <span style={styles.iNum}>#{String(i.incidentNumber).padStart(4, "0")}</span>
                              <span style={styles.iType}>{i.type}</span>
                            </div>
                            <div style={styles.iMeta}>
                              {i.site ? <span style={styles.iChip}>📍 {i.site}</span> : null}
                              {i.incidentDate ? <span style={styles.iChip} dir="ltr">📅 {i.incidentDate}</span> : null}
                            </div>
                          </div>
                          <div style={styles.iBadges}>
                            <span style={{ ...styles.chip, color: sev.color, background: sev.bg }}>{sev.label}</span>
                            <span style={{ ...styles.chip, color: st.color, background: st.bg }}>{st.label}</span>
                          </div>
                        </div>
                        {i.description ? <div style={styles.iDesc}>{i.description}</div> : null}
                        {i.correctiveAction ? <div style={styles.iAction}><span style={styles.iActionLabel}>الإجراء التصحيحي:</span> {i.correctiveAction}</div> : null}
                        <div style={styles.iActions}>
                          <button style={styles.editBtn} onClick={() => setModal({ editIncident: i })}>✏️ تعديل</button>
                          <DeleteBtn fn="deleteIncident" idKey="incidentId" id={i.id} label={`حادث #${String(i.incidentNumber).padStart(4, "0")}`} onDone={loadData} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div style={styles.section}>
              <div style={styles.secHead}>
                <h3 style={styles.sectionTitle}>جولات التفتيش ({inspections.length})</h3>
                <button style={styles.addBtn} onClick={() => setModal({ newInspection: true })}>+ جولة جديدة</button>
              </div>
              {inspections.length === 0 ? <p style={styles.muted}>لا توجد جولات مسجّلة.</p> : (
                <div style={styles.list}>
                  {inspections.map((ins) => {
                    const r = RESULT[ins.result] || RESULT.pass;
                    return (
                      <div key={ins.id} style={styles.inspRow}>
                        <span style={styles.inspNum}>#{String(ins.inspectionNumber).padStart(4, "0")}</span>
                        <div style={styles.inspBody}>
                          <span style={styles.inspSite}>📍 {ins.site}</span>
                          <span style={styles.inspMeta}>{ins.inspectionDate ? <span dir="ltr">{ins.inspectionDate}</span> : null}{ins.inspector ? ` · ${ins.inspector}` : ""}</span>
                          {ins.notes ? <span style={styles.inspNotes}>{ins.notes}</span> : null}
                        </div>
                        <span style={{ ...styles.chip, color: r.color, background: r.bg }}>{r.label}</span>
                        <DeleteBtn fn="deleteSafetyInspection" idKey="inspectionId" id={ins.id} label={`جولة #${String(ins.inspectionNumber).padStart(4, "0")}`} onDone={loadData} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {modal && modal.newIncident ? <IncidentModal onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.editIncident ? <IncidentModal incident={modal.editIncident} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.newInspection ? <InspectionModal onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
    </div>
  );
}

function DeleteBtn({ fn, idKey, id, label, onDone }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm(`حذف ${label}؟`)) return;
    setBusy(true);
    try {
      await httpsCallable(functions, fn)({ [idKey]: id });
      onDone();
    } catch (e) { alert(e.message || "تعذّر الحذف."); setBusy(false); }
  }
  return <button style={styles.delBtn} onClick={del} disabled={busy}>{busy ? "..." : "🗑"}</button>;
}

function IncidentModal({ incident, onClose, onSaved }) {
  const isEdit = !!incident;
  const inc = incident || {};
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    type: inc.type || "", site: inc.site || "", severity: inc.severity || "minor",
    status: inc.status || "open", incidentDate: inc.incidentDate || today,
    description: inc.description || "", correctiveAction: inc.correctiveAction || "", reportedBy: inc.reportedBy || "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    setErr("");
    if (f.type.trim().length < 2) { setErr("نوع الحادث مطلوب."); return; }
    setSaving(true);
    try {
      const payload = { type: f.type.trim(), site: f.site.trim(), severity: f.severity, status: f.status, incidentDate: f.incidentDate, description: f.description.trim(), correctiveAction: f.correctiveAction.trim(), reportedBy: f.reportedBy.trim() };
      if (isEdit) await httpsCallable(functions, "updateIncident")({ incidentId: incident.id, ...payload });
      else await httpsCallable(functions, "createIncident")(payload);
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الحفظ."); setSaving(false); }
  }
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}><h2 style={styles.modalTitle}>{isEdit ? "تعديل الحادث" : "تسجيل حادث"}</h2><button style={styles.close} onClick={onClose}>✕</button></div>
        {err ? <div style={styles.error}>{err}</div> : null}
        <div style={styles.field}><label style={styles.label}>نوع الحادث *</label><input style={styles.input} value={f.type} onChange={(e) => set("type", e.target.value)} disabled={saving} placeholder="انزلاق / إصابة / عطل معدّة" /></div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الموقع</label><input style={styles.input} value={f.site} onChange={(e) => set("site", e.target.value)} disabled={saving} placeholder="اسم المشروع/الموقع" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>التاريخ</label><input style={styles.input} type="date" value={f.incidentDate} onChange={(e) => set("incidentDate", e.target.value)} disabled={saving} dir="ltr" /></div></div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الخطورة</label>
            <select style={styles.input} value={f.severity} onChange={(e) => set("severity", e.target.value)} disabled={saving}>{SEV_ORDER.map((sv) => <option key={sv} value={sv}>{SEVERITY[sv].label}</option>)}</select>
          </div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الحالة</label>
            <select style={styles.input} value={f.status} onChange={(e) => set("status", e.target.value)} disabled={saving}>{INC_STATUS_ORDER.map((st) => <option key={st} value={st}>{INC_STATUS[st].label}</option>)}</select>
          </div></div>
        </div>
        <div style={styles.field}><label style={styles.label}>الوصف</label><textarea style={styles.textarea} value={f.description} onChange={(e) => set("description", e.target.value)} disabled={saving} rows={2} /></div>
        <div style={styles.field}><label style={styles.label}>الإجراء التصحيحي</label><textarea style={styles.textarea} value={f.correctiveAction} onChange={(e) => set("correctiveAction", e.target.value)} disabled={saving} rows={2} placeholder="ما تم لمنع تكرار الحادث" /></div>
        <div style={styles.field}><label style={styles.label}>المُبلِّغ</label><input style={styles.input} value={f.reportedBy} onChange={(e) => set("reportedBy", e.target.value)} disabled={saving} /></div>
        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : isEdit ? "حفظ" : "تسجيل"}</button>
        </div>
      </div>
    </div>
  );
}

function InspectionModal({ onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ site: "", inspectionDate: today, result: "pass", inspector: "", notes: "" });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    setErr("");
    if (f.site.trim().length < 2) { setErr("الموقع مطلوب."); return; }
    setSaving(true);
    try {
      await httpsCallable(functions, "createSafetyInspection")({ site: f.site.trim(), inspectionDate: f.inspectionDate, result: f.result, inspector: f.inspector.trim(), notes: f.notes.trim() });
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الحفظ."); setSaving(false); }
  }
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}><h2 style={styles.modalTitle}>جولة تفتيش جديدة</h2><button style={styles.close} onClick={onClose}>✕</button></div>
        {err ? <div style={styles.error}>{err}</div> : null}
        <div style={styles.field}><label style={styles.label}>الموقع *</label><input style={styles.input} value={f.site} onChange={(e) => set("site", e.target.value)} disabled={saving} placeholder="اسم المشروع/الموقع" /></div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>التاريخ</label><input style={styles.input} type="date" value={f.inspectionDate} onChange={(e) => set("inspectionDate", e.target.value)} disabled={saving} dir="ltr" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>النتيجة</label>
            <select style={styles.input} value={f.result} onChange={(e) => set("result", e.target.value)} disabled={saving}>{RESULT_ORDER.map((r) => <option key={r} value={r}>{RESULT[r].label}</option>)}</select>
          </div></div>
        </div>
        <div style={styles.field}><label style={styles.label}>المفتّش</label><input style={styles.input} value={f.inspector} onChange={(e) => set("inspector", e.target.value)} disabled={saving} /></div>
        <div style={styles.field}><label style={styles.label}>ملاحظات</label><textarea style={styles.textarea} value={f.notes} onChange={(e) => set("notes", e.target.value)} disabled={saving} rows={2} /></div>
        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "تسجيل"}</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { marginBottom: 18 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#ea580c", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 26, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  tabs: { display: "flex", gap: 8, marginBottom: 18, borderBottom: "2px solid #e2e8f0" },
  tab: { padding: "10px 18px", fontSize: 14, fontWeight: 700, color: "#64748b", background: "none", border: "none", borderBottom: "2px solid transparent", marginBottom: -2, cursor: "pointer" },
  tabActive: { padding: "10px 18px", fontSize: 14, fontWeight: 700, color: "#ea580c", background: "none", border: "none", borderBottom: "2px solid #ea580c", marginBottom: -2, cursor: "pointer" },

  section: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 22px" },
  secHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a", margin: 0 },
  addBtn: { padding: "9px 18px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer" },
  list: { display: "flex", flexDirection: "column", gap: 12 },

  incCard: { border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" },
  iTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  iTypeRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 },
  iNum: { fontSize: 12, fontWeight: 800, color: "#94a3b8", fontFamily: "monospace" },
  iType: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  iMeta: { display: "flex", gap: 8, flexWrap: "wrap" },
  iChip: { fontSize: 12, color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "3px 10px" },
  iBadges: { display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" },
  chip: { fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 12px", whiteSpace: "nowrap" },
  iDesc: { fontSize: 13, color: "#334155", background: "#f8fafc", borderRadius: 8, padding: "10px 12px", marginBottom: 10, lineHeight: 1.5 },
  iAction: { fontSize: 13, color: "#334155", background: "#fff7ed", borderRadius: 8, padding: "10px 12px", marginBottom: 10, lineHeight: 1.5, borderRight: "3px solid #ea580c" },
  iActionLabel: { fontWeight: 700, color: "#c2410c" },
  iActions: { display: "flex", gap: 8 },
  editBtn: { padding: "7px 14px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },
  delBtn: { padding: "7px 11px", fontSize: 13, background: "#fef2f2", border: "none", borderRadius: 7, cursor: "pointer", flexShrink: 0 },

  inspRow: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: 10 },
  inspNum: { fontSize: 12, fontWeight: 800, color: "#94a3b8", fontFamily: "monospace", flexShrink: 0 },
  inspBody: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 },
  inspSite: { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  inspMeta: { fontSize: 12, color: "#94a3b8" },
  inspNotes: { fontSize: 12, color: "#64748b" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  row: { display: "flex", gap: 12 },
  modalActions: { display: "flex", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer" },
};
