import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   العمليات التشغيلية — قسم العمليات
   ثلاثة أنظمة: المهام (كانبان) · الجدولة (مراحل) · الجودة (فحوصات).
   كلها مرتبطة بالمشروع.
   ============================================================ */

const TASK_STATUS = {
  todo: { label: "للعمل", bg: "#f1f5f9", color: "#64748b" },
  in_progress: { label: "جاري", bg: "#dbeafe", color: "#1e40af" },
  done: { label: "منجز", bg: "#dcfce7", color: "#166534" },
};
const TASK_COLUMNS = ["todo", "in_progress", "done"];
const PRIORITY = {
  low: { label: "منخفضة", color: "#64748b", bg: "#f1f5f9" },
  normal: { label: "عادية", color: "#0369a1", bg: "#e0f2fe" },
  high: { label: "عالية", color: "#c2410c", bg: "#ffedd5" },
  urgent: { label: "عاجلة", color: "#b91c1c", bg: "#fee2e2" },
};
const MILESTONE_STATUS = {
  planned: { label: "مخطّط", bg: "#f1f5f9", color: "#64748b" },
  in_progress: { label: "جاري", bg: "#dbeafe", color: "#1e40af" },
  completed: { label: "مكتمل", bg: "#dcfce7", color: "#166534" },
  delayed: { label: "متأخّر", bg: "#fee2e2", color: "#b91c1c" },
};
const INSPECTION_RESULT = {
  pass: { label: "ناجح", bg: "#dcfce7", color: "#166534", icon: "✓" },
  fail: { label: "راسب", bg: "#fee2e2", color: "#b91c1c", icon: "✕" },
  conditional: { label: "مشروط", bg: "#fef3c7", color: "#92400e", icon: "!" },
};

export default function ProcessesView() {
  const [tenantId, setTenantId] = useState("");
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [tab, setTab] = useState("tasks");
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
      const [pSnap, eSnap, tSnap, mSnap, iSnap] = await Promise.all([
        getDocs(query(collection(db, "projects"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "employees"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "operationTasks"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "projectMilestones"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "qualityInspections"), where("tenantId", "==", tenantId))),
      ]);
      const pList = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      pList.sort((a, b) => (b.projectNumber || 0) - (a.projectNumber || 0));
      setProjects(pList);
      setEmployees(eSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTasks(tSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setMilestones(mSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setInspections(iSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (!selectedProjectId && pList.length > 0) setSelectedProjectId(pList[0].id);
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  const pTasks = tasks.filter((t) => t.projectId === selectedProjectId && t.status !== "cancelled");
  const pMilestones = milestones.filter((m) => m.projectId === selectedProjectId);
  const pInspections = inspections.filter((i) => i.projectId === selectedProjectId);

  const addLabel = tab === "tasks" ? "+ مهمة" : tab === "schedule" ? "+ مرحلة" : "+ فحص";
  const addModal = tab === "tasks" ? "task" : tab === "schedule" ? "milestone" : "inspection";

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>العمليات التشغيلية</h1>
          <p style={styles.pageSub}>المهام والجدولة ومراقبة الجودة لكل مشروع.</p>
        </div>
        {selectedProject ? (
          <button style={styles.addBtn} onClick={() => setModal(addModal)}>{addLabel}</button>
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

          <div style={styles.tabs}>
            <button style={{ ...styles.tab, ...(tab === "tasks" ? styles.tabActive : {}) }} onClick={() => setTab("tasks")}>📋 المهام</button>
            <button style={{ ...styles.tab, ...(tab === "schedule" ? styles.tabActive : {}) }} onClick={() => setTab("schedule")}>📅 الجدولة</button>
            <button style={{ ...styles.tab, ...(tab === "quality" ? styles.tabActive : {}) }} onClick={() => setTab("quality")}>✓ الجودة</button>
          </div>

          {tab === "tasks" ? <TasksTab tasks={pTasks} onReload={loadData} />
            : tab === "schedule" ? <ScheduleTab milestones={pMilestones} onReload={loadData} onEdit={(m) => setModal({ editMilestone: m })} />
              : <QualityTab inspections={pInspections} onReload={loadData} />}
        </>
      )}

      {modal === "task" && selectedProject ? <TaskModal project={selectedProject} employees={employees} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal === "milestone" && selectedProject ? <MilestoneModal project={selectedProject} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.editMilestone ? <MilestoneModal project={selectedProject} milestone={modal.editMilestone} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal === "inspection" && selectedProject ? <InspectionModal project={selectedProject} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
    </div>
  );
}

// ═══════════ تبويب المهام (كانبان) ═══════════
function TasksTab({ tasks, onReload }) {
  const [busyId, setBusyId] = useState("");

  async function move(task, newStatus) {
    setBusyId(task.id);
    try {
      const fn = httpsCallable(functions, "updateTaskStatus");
      await fn({ taskId: task.id, status: newStatus });
      onReload();
    } catch (e) { alert(e.message || "تعذّر التحديث."); } finally { setBusyId(""); }
  }
  async function remove(task) {
    if (!window.confirm(`حذف المهمة «${task.title}»؟`)) return;
    setBusyId(task.id);
    try {
      const fn = httpsCallable(functions, "deleteTask");
      await fn({ taskId: task.id });
      onReload();
    } catch (e) { alert(e.message || "تعذّر الحذف."); } finally { setBusyId(""); }
  }

  if (tasks.length === 0) {
    return <div style={styles.empty}><div style={styles.emptyIcon}>📋</div><p style={styles.muted}>لا توجد مهام. اضغط «+ مهمة».</p></div>;
  }

  return (
    <div style={styles.kanban}>
      {TASK_COLUMNS.map((col) => {
        const cfg = TASK_STATUS[col];
        const colTasks = tasks.filter((t) => t.status === col);
        return (
          <div key={col} style={styles.kanbanCol}>
            <div style={{ ...styles.kanbanHead, color: cfg.color }}>
              {cfg.label} <span style={styles.kanbanCount}>{colTasks.length}</span>
            </div>
            <div style={styles.kanbanBody}>
              {colTasks.length === 0 ? <div style={styles.kanbanEmpty}>—</div> : colTasks.map((t) => {
                const pr = PRIORITY[t.priority] || PRIORITY.normal;
                const idx = TASK_COLUMNS.indexOf(col);
                return (
                  <div key={t.id} style={styles.taskCard}>
                    <div style={styles.taskTop}>
                      <span style={{ ...styles.prTag, background: pr.bg, color: pr.color }}>{pr.label}</span>
                      <button style={styles.taskDel} onClick={() => remove(t)} disabled={busyId === t.id}>✕</button>
                    </div>
                    <div style={styles.taskTitle}>{t.title}</div>
                    {t.description ? <div style={styles.taskDesc}>{t.description}</div> : null}
                    <div style={styles.taskMeta}>
                      {t.assigneeName ? <span>👤 {t.assigneeName}</span> : null}
                      {t.dueDate ? <span dir="ltr">📅 {t.dueDate}</span> : null}
                    </div>
                    <div style={styles.taskActions}>
                      {idx > 0 ? <button style={styles.moveBtn} onClick={() => move(t, TASK_COLUMNS[idx - 1])} disabled={busyId === t.id}>→ رجوع</button> : <span />}
                      {idx < TASK_COLUMNS.length - 1 ? <button style={styles.moveBtnPrimary} onClick={() => move(t, TASK_COLUMNS[idx + 1])} disabled={busyId === t.id}>{idx === 0 ? "ابدأ" : "أنجز"} ←</button> : <span />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════ تبويب الجدولة (المراحل) ═══════════
function ScheduleTab({ milestones, onReload, onEdit }) {
  const [busyId, setBusyId] = useState("");
  const sorted = [...milestones].sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"));

  async function remove(m) {
    if (!window.confirm(`حذف المرحلة «${m.title}»؟`)) return;
    setBusyId(m.id);
    try {
      const fn = httpsCallable(functions, "deleteMilestone");
      await fn({ milestoneId: m.id });
      onReload();
    } catch (e) { alert(e.message || "تعذّر الحذف."); } finally { setBusyId(""); }
  }

  if (milestones.length === 0) {
    return <div style={styles.empty}><div style={styles.emptyIcon}>📅</div><p style={styles.muted}>لا توجد مراحل. اضغط «+ مرحلة».</p></div>;
  }

  return (
    <div style={styles.milestoneList}>
      {sorted.map((m) => {
        const cfg = MILESTONE_STATUS[m.status] || MILESTONE_STATUS.planned;
        return (
          <div key={m.id} style={styles.milestoneCard}>
            <div style={styles.mTop}>
              <div style={styles.mTitleWrap}>
                <span style={styles.mTitle}>{m.title}</span>
                <span style={{ ...styles.mBadge, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
              </div>
              <div style={styles.mActions}>
                <button style={styles.mEdit} onClick={() => onEdit(m)}>تعديل</button>
                <button style={styles.mDel} onClick={() => remove(m)} disabled={busyId === m.id}>حذف</button>
              </div>
            </div>
            {m.description ? <div style={styles.mDesc}>{m.description}</div> : null}
            <div style={styles.progressWrap}>
              <div style={styles.progressBar}><div style={{ ...styles.progressFill, width: `${m.progress || 0}%` }} /></div>
              <span style={styles.progressVal}>{m.progress || 0}%</span>
            </div>
            {(m.startDate || m.endDate) ? <div style={styles.mDates} dir="ltr">{m.startDate || "—"} ← {m.endDate || "—"}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════ تبويب الجودة (الفحوصات) ═══════════
function QualityTab({ inspections, onReload }) {
  const [busyId, setBusyId] = useState("");
  const sorted = [...inspections].sort((a, b) => (b.inspectionDate || "").localeCompare(a.inspectionDate || ""));

  async function remove(i) {
    if (!window.confirm(`حذف الفحص «${i.title}»؟`)) return;
    setBusyId(i.id);
    try {
      const fn = httpsCallable(functions, "deleteInspection");
      await fn({ inspectionId: i.id });
      onReload();
    } catch (e) { alert(e.message || "تعذّر الحذف."); } finally { setBusyId(""); }
  }

  if (inspections.length === 0) {
    return <div style={styles.empty}><div style={styles.emptyIcon}>✓</div><p style={styles.muted}>لا توجد فحوصات. اضغط «+ فحص».</p></div>;
  }

  const passed = inspections.filter((i) => i.result === "pass").length;
  const failed = inspections.filter((i) => i.result === "fail").length;

  return (
    <div>
      <div style={styles.qSummary}>
        <div style={styles.qStat}><span style={{ ...styles.qStatVal, color: "#166534" }}>{passed}</span><span style={styles.qStatLabel}>ناجح</span></div>
        <div style={styles.qStat}><span style={{ ...styles.qStatVal, color: "#b91c1c" }}>{failed}</span><span style={styles.qStatLabel}>راسب</span></div>
        <div style={styles.qStat}><span style={styles.qStatVal}>{inspections.length}</span><span style={styles.qStatLabel}>الإجمالي</span></div>
      </div>
      <div style={styles.inspList}>
        {sorted.map((i) => {
          const cfg = INSPECTION_RESULT[i.result] || INSPECTION_RESULT.pass;
          return (
            <div key={i.id} style={styles.inspCard}>
              <div style={{ ...styles.inspIcon, background: cfg.bg, color: cfg.color }}>{cfg.icon}</div>
              <div style={styles.inspBody}>
                <div style={styles.inspTitle}>{i.title}</div>
                <div style={styles.inspMeta}>
                  <span dir="ltr">📅 {i.inspectionDate}</span>
                  {i.inspectorName ? <span>👤 {i.inspectorName}</span> : null}
                  <span style={{ ...styles.inspResult, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                </div>
                {i.findings ? <div style={styles.inspFindings}>{i.findings}</div> : null}
              </div>
              <button style={styles.inspDel} onClick={() => remove(i)} disabled={busyId === i.id}>✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════ المودالات ═══════════
function TaskModal({ project, employees, onClose, onSaved }) {
  const [f, setF] = useState({ title: "", description: "", assigneeId: "", priority: "normal", dueDate: "" });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const activeEmps = employees.filter((e) => e.status === "active");

  async function save() {
    setErr("");
    if (f.title.trim().length < 2) { setErr("عنوان المهمة مطلوب."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createTask");
      await fn({ projectId: project.id, ...f });
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الحفظ."); } finally { setSaving(false); }
  }

  return (
    <Modal title="مهمة جديدة" onClose={onClose}>
      {err ? <div style={styles.error}>{err}</div> : null}
      <Field label="العنوان *"><input style={styles.input} value={f.title} onChange={(e) => set("title", e.target.value)} disabled={saving} /></Field>
      <Field label="الوصف"><textarea style={styles.textarea} value={f.description} onChange={(e) => set("description", e.target.value)} disabled={saving} rows={2} /></Field>
      <Field label="المسؤول">
        <select style={styles.input} value={f.assigneeId} onChange={(e) => set("assigneeId", e.target.value)} disabled={saving}>
          <option value="">— بدون —</option>
          {activeEmps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </Field>
      <div style={styles.row}>
        <div style={{ flex: 1 }}><Field label="الأولوية">
          <select style={styles.input} value={f.priority} onChange={(e) => set("priority", e.target.value)} disabled={saving}>
            {Object.entries(PRIORITY).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
          </select>
        </Field></div>
        <div style={{ flex: 1 }}><Field label="تاريخ الاستحقاق"><input style={styles.input} type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
      </div>
      <FormActions onClose={onClose} onSave={save} saving={saving} label="إنشاء المهمة" />
    </Modal>
  );
}

function MilestoneModal({ project, milestone, onClose, onSaved }) {
  const isEdit = !!milestone;
  const m = milestone || {};
  const [f, setF] = useState({
    title: m.title || "", description: m.description || "",
    startDate: m.startDate || "", endDate: m.endDate || "",
    progress: m.progress != null ? String(m.progress) : "0", status: m.status || "planned",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (f.title.trim().length < 2) { setErr("عنوان المرحلة مطلوب."); return; }
    if (f.startDate && f.endDate && f.endDate < f.startDate) { setErr("تاريخ النهاية قبل البداية."); return; }
    setSaving(true);
    try {
      if (isEdit) {
        const fn = httpsCallable(functions, "updateMilestone");
        await fn({ milestoneId: milestone.id, ...f, progress: Number(f.progress) || 0 });
      } else {
        const fn = httpsCallable(functions, "createMilestone");
        await fn({ projectId: project.id, ...f, progress: Number(f.progress) || 0 });
      }
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الحفظ."); } finally { setSaving(false); }
  }

  return (
    <Modal title={isEdit ? "تعديل المرحلة" : "مرحلة جديدة"} onClose={onClose}>
      {err ? <div style={styles.error}>{err}</div> : null}
      <Field label="العنوان *"><input style={styles.input} value={f.title} onChange={(e) => set("title", e.target.value)} disabled={saving} /></Field>
      <Field label="الوصف"><textarea style={styles.textarea} value={f.description} onChange={(e) => set("description", e.target.value)} disabled={saving} rows={2} /></Field>
      <div style={styles.row}>
        <div style={{ flex: 1 }}><Field label="من تاريخ"><input style={styles.input} type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
        <div style={{ flex: 1 }}><Field label="إلى تاريخ"><input style={styles.input} type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
      </div>
      <Field label={`نسبة الإنجاز: ${f.progress}%`}>
        <input style={styles.range} type="range" min="0" max="100" step="5" value={f.progress} onChange={(e) => set("progress", e.target.value)} disabled={saving} />
      </Field>
      <Field label="الحالة">
        <select style={styles.input} value={f.status} onChange={(e) => set("status", e.target.value)} disabled={saving}>
          {Object.entries(MILESTONE_STATUS).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
      </Field>
      <FormActions onClose={onClose} onSave={save} saving={saving} label={isEdit ? "حفظ" : "إنشاء المرحلة"} />
    </Modal>
  );
}

function InspectionModal({ project, onClose, onSaved }) {
  const [f, setF] = useState({ title: "", inspectionDate: new Date().toISOString().slice(0, 10), result: "pass", inspectorName: "", findings: "", notes: "" });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (f.title.trim().length < 2) { setErr("عنوان الفحص مطلوب."); return; }
    if (!f.inspectionDate) { setErr("تاريخ الفحص مطلوب."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createInspection");
      await fn({ projectId: project.id, ...f });
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الحفظ."); } finally { setSaving(false); }
  }

  return (
    <Modal title="فحص جودة جديد" onClose={onClose}>
      {err ? <div style={styles.error}>{err}</div> : null}
      <Field label="نوع الفحص / العنوان *"><input style={styles.input} value={f.title} onChange={(e) => set("title", e.target.value)} disabled={saving} placeholder="مثل: فحص السلامة" /></Field>
      <div style={styles.row}>
        <div style={{ flex: 1 }}><Field label="التاريخ *"><input style={styles.input} type="date" value={f.inspectionDate} onChange={(e) => set("inspectionDate", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
        <div style={{ flex: 1 }}><Field label="النتيجة">
          <select style={styles.input} value={f.result} onChange={(e) => set("result", e.target.value)} disabled={saving}>
            {Object.entries(INSPECTION_RESULT).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
          </select>
        </Field></div>
      </div>
      <Field label="المفتّش / المسؤول"><input style={styles.input} value={f.inspectorName} onChange={(e) => set("inspectorName", e.target.value)} disabled={saving} /></Field>
      <Field label="الملاحظات / النتائج"><textarea style={styles.textarea} value={f.findings} onChange={(e) => set("findings", e.target.value)} disabled={saving} rows={2} /></Field>
      <FormActions onClose={onClose} onSave={save} saving={saving} label="حفظ الفحص" />
    </Modal>
  );
}

// ═══════════ مكوّنات مشتركة ═══════════
function Modal({ title, children, onClose }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}><h2 style={styles.modalTitle}>{title}</h2><button style={styles.close} onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }) { return <div style={styles.field}><label style={styles.label}>{label}</label>{children}</div>; }
function FormActions({ onClose, onSave, saving, label }) {
  return (
    <div style={styles.modalActions}>
      <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
      <button style={styles.saveBtn} onClick={onSave} disabled={saving}>{saving ? "جارٍ الحفظ..." : label}</button>
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

  tabs: { display: "flex", gap: 8, marginBottom: 18, borderBottom: "2px solid #e2e8f0", flexWrap: "wrap" },
  tab: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "none", border: "none", borderBottom: "3px solid transparent", cursor: "pointer", marginBottom: -2 },
  tabActive: { color: "#ea580c", borderBottomColor: "#ea580c" },

  empty: { padding: 44, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 40, marginBottom: 10 },

  kanban: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 },
  kanbanCol: { background: "#f8fafc", borderRadius: 12, padding: 12, minHeight: 200 },
  kanbanHead: { fontSize: 14, fontWeight: 800, padding: "4px 8px 12px", display: "flex", alignItems: "center", gap: 8 },
  kanbanCount: { fontSize: 12, background: "#fff", borderRadius: 10, padding: "1px 8px", color: "#64748b" },
  kanbanBody: { display: "flex", flexDirection: "column", gap: 10 },
  kanbanEmpty: { textAlign: "center", color: "#cbd5e1", fontSize: 13, padding: "20px 0" },
  taskCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" },
  taskTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  prTag: { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8 },
  taskDel: { fontSize: 13, color: "#cbd5e1", background: "none", border: "none", cursor: "pointer" },
  taskTitle: { fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 },
  taskDesc: { fontSize: 12, color: "#64748b", marginBottom: 8, lineHeight: 1.5 },
  taskMeta: { display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "#94a3b8", marginBottom: 10 },
  taskActions: { display: "flex", justifyContent: "space-between", gap: 8 },
  moveBtn: { fontSize: 12, fontWeight: 600, color: "#64748b", background: "#f1f5f9", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer" },
  moveBtnPrimary: { fontSize: 12, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer" },

  milestoneList: { display: "flex", flexDirection: "column", gap: 14 },
  milestoneCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px" },
  mTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  mTitleWrap: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  mTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  mBadge: { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12 },
  mActions: { display: "flex", gap: 8 },
  mEdit: { fontSize: 12, fontWeight: 600, color: "#0369a1", background: "#e0f2fe", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer" },
  mDel: { fontSize: 12, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer" },
  mDesc: { fontSize: 13, color: "#64748b", marginBottom: 12, lineHeight: 1.5 },
  progressWrap: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 },
  progressBar: { flex: 1, height: 10, background: "#f1f5f9", borderRadius: 5, overflow: "hidden" },
  progressFill: { height: "100%", background: "#ea580c", borderRadius: 5 },
  progressVal: { fontSize: 13, fontWeight: 700, color: "#ea580c", fontFamily: "monospace", minWidth: 40, textAlign: "left" },
  mDates: { fontSize: 12, color: "#94a3b8", fontFamily: "monospace" },

  qSummary: { display: "flex", gap: 12, marginBottom: 18 },
  qStat: { flex: 1, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px", textAlign: "center" },
  qStatVal: { display: "block", fontSize: 26, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },
  qStatLabel: { fontSize: 12, color: "#64748b" },
  inspList: { display: "flex", flexDirection: "column", gap: 12 },
  inspCard: { display: "flex", alignItems: "flex-start", gap: 14, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px" },
  inspIcon: { width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 20, fontWeight: 800, flexShrink: 0 },
  inspBody: { flex: 1 },
  inspTitle: { fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 6 },
  inspMeta: { display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "#94a3b8", alignItems: "center" },
  inspResult: { fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 10 },
  inspFindings: { fontSize: 13, color: "#64748b", marginTop: 8, lineHeight: 1.5, background: "#f8fafc", padding: "8px 12px", borderRadius: 8 },
  inspDel: { fontSize: 14, color: "#cbd5e1", background: "none", border: "none", cursor: "pointer", flexShrink: 0 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  range: { width: "100%", accentColor: "#ea580c" },
  row: { display: "flex", gap: 12 },
  modalActions: { display: "flex", gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer" },
};
