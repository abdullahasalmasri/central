import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   التدريب — قسم الموارد البشرية
   برامج تدريبية + تسجيل موظفين + متابعة الإكمال + إصدار شهادات.
   ============================================================ */

const ENROLL_CFG = {
  registered: { label: "مسجّل", bg: "#f1f5f9", color: "#64748b" },
  attending: { label: "قيد الحضور", bg: "#e0f2fe", color: "#0369a1" },
  completed: { label: "مكتمل", bg: "#dcfce7", color: "#166534" },
  dropped: { label: "منسحب", bg: "#fee2e2", color: "#b91c1c" },
};
const PROGRAM_CFG = {
  planned: { label: "مخطّط", bg: "#f1f5f9", color: "#64748b" },
  active: { label: "نشط", bg: "#dcfce7", color: "#166534" },
  completed: { label: "مكتمل", bg: "#e0e7ff", color: "#4338ca" },
  cancelled: { label: "ملغى", bg: "#fee2e2", color: "#b91c1c" },
};
const MODE_LABEL = { onsite: "حضوري", online: "عن بُعد" };
const ENROLL_OPTIONS = [["registered", "مسجّل"], ["attending", "قيد الحضور"], ["completed", "مكتمل"], ["dropped", "منسحب"]];
const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");

export default function TrainingView() {
  const [tenantId, setTenantId] = useState("");
  const [companyName, setCompanyName] = useState("الشركة");
  const [programs, setPrograms] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) { setError("لم يتم تسجيل الدخول."); setLoading(false); return; }
        const userSnap = await getDoc(doc(db, "users", uid));
        const tid = userSnap.exists() ? userSnap.data().tenantId : null;
        if (!tid) { setError("تعذّر تحديد المنشأة."); setLoading(false); return; }
        try {
          const tSnap = await getDoc(doc(db, "tenants", tid));
          if (tSnap.exists() && tSnap.data().name) setCompanyName(tSnap.data().name);
        } catch (e) { /* اختياري */ }
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
      const [pSnap, eSnap, empSnap] = await Promise.all([
        getDocs(query(collection(db, "trainingPrograms"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "trainingEnrollments"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "employees"), where("tenantId", "==", tenantId))),
      ]);
      const pList = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      pList.sort((a, b) => (b.programNumber || 0) - (a.programNumber || 0));
      setPrograms(pList);
      setEnrollments(eSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (selected) {
        const fresh = pList.find((p) => p.id === selected.id);
        setSelected(fresh || null);
      }
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  const enrollCountFor = (programId) => enrollments.filter((e) => e.programId === programId && e.status !== "dropped").length;

  if (selected) {
    return (
      <ProgramDetail
        program={selected}
        enrollments={enrollments.filter((e) => e.programId === selected.id)}
        employees={employees}
        companyName={companyName}
        onBack={() => setSelected(null)}
        onReload={loadData}
      />
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>التدريب</h1>
          <p style={styles.pageSub}>البرامج التدريبية وتسجيل الموظفين ومتابعة الإكمال والشهادات.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setShowCreate(true)}>+ برنامج تدريبي</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : programs.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>🎓</div>
          <p style={styles.emptyTitle}>لا توجد برامج تدريبية بعد</p>
          <p style={styles.muted}>اضغط «+ برنامج تدريبي» لإضافة أول برنامج وتسجيل الموظفين.</p>
        </div>
      ) : (
        <div style={styles.programGrid}>
          {programs.map((p) => {
            const cfg = PROGRAM_CFG[p.status] || PROGRAM_CFG.planned;
            return (
              <div key={p.id} style={styles.programCard} onClick={() => setSelected(p)}>
                <div style={styles.pCardTop}>
                  <span style={styles.pTitle}>{p.title}</span>
                  <span style={{ ...styles.badge2, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                </div>
                {p.category ? <div style={styles.pCat}>{p.category}</div> : null}
                {p.provider ? <div style={styles.pProvider}>🏛️ {p.provider}</div> : null}
                <div style={styles.pMeta}>
                  <span>👥 {enrollCountFor(p.id)} مشارك</span>
                  {p.durationHours ? <span>⏱️ {p.durationHours} ساعة</span> : null}
                  {p.mode ? <span>{MODE_LABEL[p.mode]}</span> : null}
                </div>
                {(p.startDate || p.endDate) ? (
                  <div style={styles.pDates} dir="ltr">{p.startDate || "—"} {p.endDate ? `← ${p.endDate}` : ""}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {showCreate ? <CreateProgramModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); loadData(); }} /> : null}
    </div>
  );
}

// ═══════════ تفاصيل البرنامج ═══════════
function ProgramDetail({ program, enrollments, employees, companyName, onBack, onReload }) {
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [cert, setCert] = useState(null);

  const cfg = PROGRAM_CFG[program.status] || PROGRAM_CFG.planned;
  const completed = enrollments.filter((e) => e.status === "completed").length;
  const certified = enrollments.filter((e) => e.certificateNumber).length;

  async function changeStatus(enrollment, status, score) {
    setBusyId(enrollment.id); setError("");
    try {
      const fn = httpsCallable(functions, "updateEnrollmentStatus");
      const payload = { enrollmentId: enrollment.id, status };
      if (score !== undefined && score !== null && score !== "") payload.score = Number(score);
      await fn(payload);
      onReload();
    } catch (e) {
      setError(e.message || "تعذّر التحديث.");
    } finally {
      setBusyId("");
    }
  }

  async function issueCert(enrollment) {
    setBusyId(enrollment.id); setError("");
    try {
      const fn = httpsCallable(functions, "issueCertificate");
      await fn({ enrollmentId: enrollment.id });
      onReload();
    } catch (e) {
      setError(e.message || "تعذّر إصدار الشهادة.");
    } finally {
      setBusyId("");
    }
  }

  async function changeProgramStatus(status) {
    setStatusBusy(true); setError("");
    try {
      const fn = httpsCallable(functions, "updateProgramStatus");
      await fn({ programId: program.id, status });
      onReload();
    } catch (e) {
      setError(e.message || "تعذّر التحديث.");
    } finally {
      setStatusBusy(false);
    }
  }

  const enrolledIds = new Set(enrollments.map((e) => e.employeeId));

  return (
    <div style={styles.page}>
      <button style={styles.backBtn} onClick={onBack}>← رجوع للبرامج</button>

      <div style={styles.detailHead}>
        <div>
          <h1 style={styles.pageTitle}>{program.title}</h1>
          <div style={styles.detailMeta}>
            <span style={{ ...styles.badge2, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
            {program.category ? <span style={styles.metaText}>{program.category}</span> : null}
            {program.provider ? <span style={styles.metaText}>🏛️ {program.provider}</span> : null}
            {program.durationHours ? <span style={styles.metaText}>⏱️ {program.durationHours} ساعة</span> : null}
            {program.mode ? <span style={styles.metaText}>{MODE_LABEL[program.mode]}</span> : null}
            {program.cost ? <span style={styles.metaText} dir="ltr">{fmt(program.cost)} ﷼</span> : null}
          </div>
        </div>
        <div style={styles.detailBtns}>
          <select style={styles.statusSelect} value={program.status} onChange={(e) => changeProgramStatus(e.target.value)} disabled={statusBusy}>
            <option value="planned">مخطّط</option><option value="active">نشط</option><option value="completed">مكتمل</option><option value="cancelled">ملغى</option>
          </select>
          <button style={styles.addBtn} onClick={() => setShowEnroll(true)}>+ تسجيل موظف</button>
        </div>
      </div>

      {program.description ? <div style={styles.descBox}>{program.description}</div> : null}

      <div style={styles.statsRow}>
        <div style={styles.statBox}><span style={styles.statVal}>{enrollments.filter((e) => e.status !== "dropped").length}</span><span style={styles.statLbl}>مشارك</span></div>
        <div style={styles.statBox}><span style={styles.statVal}>{completed}</span><span style={styles.statLbl}>أكمل</span></div>
        <div style={styles.statBox}><span style={styles.statVal}>{certified}</span><span style={styles.statLbl}>شهادة صادرة</span></div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {enrollments.length === 0 ? (
        <div style={styles.empty}><p style={styles.muted}>لا يوجد مشاركون. اضغط «+ تسجيل موظف» لإضافة مشاركين.</p></div>
      ) : (
        <div style={styles.panel}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>الموظف</th>
                <th style={styles.thCenter}>الحالة</th>
                <th style={styles.thCenter}>الدرجة</th>
                <th style={styles.thCenter}>الشهادة</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((en) => {
                const ecfg = ENROLL_CFG[en.status] || ENROLL_CFG.registered;
                const isCompleted = en.status === "completed";
                return (
                  <tr key={en.id}>
                    <td style={styles.tdName}>
                      {en.employeeCode ? <span style={styles.codeTag}>{en.employeeCode}</span> : null}
                      {en.employeeName}
                    </td>
                    <td style={styles.tdCenter}>
                      <select style={{ ...styles.enrollSelect, background: ecfg.bg, color: ecfg.color }} value={en.status} onChange={(e) => changeStatus(en, e.target.value)} disabled={busyId === en.id}>
                        {ENROLL_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td style={styles.tdCenter}>
                      {isCompleted ? (
                        <input style={styles.scoreInput} type="number" min="0" max="100" defaultValue={en.score != null ? en.score : ""} placeholder="—" onBlur={(e) => { if (e.target.value !== (en.score != null ? String(en.score) : "")) changeStatus(en, "completed", e.target.value); }} disabled={busyId === en.id} dir="ltr" />
                      ) : <span style={styles.mutedSmall}>—</span>}
                    </td>
                    <td style={styles.tdCenter}>
                      {en.certificateNumber ? (
                        <button style={styles.certViewBtn} onClick={() => setCert(en)}>📜 #{en.certificateNumber}</button>
                      ) : isCompleted ? (
                        <button style={styles.certIssueBtn} onClick={() => issueCert(en)} disabled={busyId === en.id}>إصدار شهادة</button>
                      ) : <span style={styles.mutedSmall}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showEnroll ? <EnrollModal program={program} employees={employees} enrolledIds={enrolledIds} onClose={() => setShowEnroll(false)} onSaved={() => { setShowEnroll(false); onReload(); }} /> : null}
      {cert ? <CertificateModal enrollment={cert} program={program} companyName={companyName} onClose={() => setCert(null)} /> : null}
    </div>
  );
}

// ═══════════ مودال برنامج جديد ═══════════
function CreateProgramModal({ onClose, onSaved }) {
  const [f, setF] = useState({ title: "", category: "", provider: "", description: "", startDate: "", endDate: "", durationHours: "", mode: "onsite", cost: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (f.title.trim().length < 2) { setErr("اسم البرنامج مطلوب."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createTrainingProgram");
      await fn({
        title: f.title, category: f.category, provider: f.provider, description: f.description,
        startDate: f.startDate, endDate: f.endDate, mode: f.mode,
        durationHours: f.durationHours === "" ? null : Number(f.durationHours),
        cost: f.cost === "" ? null : Number(f.cost),
      });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="برنامج تدريبي جديد" onClose={onClose}>
      {err ? <div style={styles.error}>{err}</div> : null}
      <Field label="اسم البرنامج *"><input style={styles.input} value={f.title} onChange={(e) => set("title", e.target.value)} disabled={saving} /></Field>
      <div style={styles.row}>
        <div style={{ flex: 1 }}><Field label="الفئة"><input style={styles.input} value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="سلامة، مهارات..." disabled={saving} /></Field></div>
        <div style={{ flex: 1 }}><Field label="الجهة المقدّمة"><input style={styles.input} value={f.provider} onChange={(e) => set("provider", e.target.value)} disabled={saving} /></Field></div>
      </div>
      <div style={styles.row}>
        <div style={{ flex: 1 }}><Field label="تاريخ البداية"><input style={styles.input} type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
        <div style={{ flex: 1 }}><Field label="تاريخ النهاية"><input style={styles.input} type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
      </div>
      <div style={styles.row}>
        <div style={{ flex: 1 }}><Field label="عدد الساعات"><input style={styles.input} type="number" min="0" value={f.durationHours} onChange={(e) => set("durationHours", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
        <div style={{ flex: 1 }}>
          <Field label="نوع التدريب">
            <select style={styles.input} value={f.mode} onChange={(e) => set("mode", e.target.value)} disabled={saving}>
              <option value="onsite">حضوري</option><option value="online">عن بُعد</option>
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}><Field label="التكلفة"><input style={styles.input} type="number" min="0" value={f.cost} onChange={(e) => set("cost", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
      </div>
      <Field label="الوصف"><textarea style={styles.textarea} value={f.description} onChange={(e) => set("description", e.target.value)} disabled={saving} rows={2} /></Field>
      <FormActions onClose={onClose} onSave={save} saving={saving} label="إنشاء البرنامج" />
    </Modal>
  );
}

// ═══════════ مودال تسجيل موظف ═══════════
function EnrollModal({ program, employees, enrolledIds, onClose, onSaved }) {
  const [employeeId, setEmployeeId] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const available = employees.filter((e) => e.status === "active" && !enrolledIds.has(e.id));

  async function save() {
    setErr("");
    if (!employeeId) { setErr("اختر موظفًا."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "enrollEmployee");
      await fn({ programId: program.id, employeeId });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر التسجيل.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="تسجيل موظف في البرنامج" onClose={onClose}>
      {err ? <div style={styles.error}>{err}</div> : null}
      {available.length === 0 ? (
        <p style={styles.muted}>كل الموظفين النشطين مسجّلون بالفعل، أو لا يوجد موظفون نشطون.</p>
      ) : (
        <Field label="الموظف *">
          <select style={styles.input} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={saving}>
            <option value="">— اختر موظفًا —</option>
            {available.map((e) => <option key={e.id} value={e.id}>{e.name}{e.employeeCode ? ` (${e.employeeCode})` : ""}</option>)}
          </select>
        </Field>
      )}
      <div style={styles.modalActions}>
        <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
        <button style={styles.saveBtnFull} onClick={save} disabled={saving || available.length === 0}>{saving ? "جارٍ التسجيل..." : "تسجيل"}</button>
      </div>
    </Modal>
  );
}

// ═══════════ مودال الشهادة ═══════════
function CertificateModal({ enrollment, program, companyName, onClose }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.certModal} onClick={(e) => e.stopPropagation()}>
        <button style={styles.certClose} onClick={onClose}>✕</button>
        <div style={styles.certBorder}>
          <div style={styles.certCompany}>{companyName}</div>
          <div style={styles.certTitle}>شهادة إتمام تدريب</div>
          <div style={styles.certText}>تشهد المنشأة بأن</div>
          <div style={styles.certName}>{enrollment.employeeName}</div>
          <div style={styles.certText}>قد أتمّ بنجاح البرنامج التدريبي</div>
          <div style={styles.certProgram}>{program.title}</div>
          {program.durationHours ? <div style={styles.certHours}>بواقع {program.durationHours} ساعة تدريبية</div> : null}
          {enrollment.score != null ? <div style={styles.certScore}>الدرجة: {enrollment.score}%</div> : null}
          <div style={styles.certFooter}>
            <div style={styles.certFooterItem}><span style={styles.certFooterLabel}>رقم الشهادة</span><span dir="ltr">#{enrollment.certificateNumber}</span></div>
            <div style={styles.certFooterItem}><span style={styles.certFooterLabel}>تاريخ الإصدار</span><span dir="ltr">{enrollment.certificateIssueDate}</span></div>
          </div>
        </div>
        <button style={styles.printBtn} onClick={() => window.print()}>🖨️ طباعة الشهادة</button>
      </div>
    </div>
  );
}

// ═══════════ مكوّنات مشتركة ═══════════
function Modal({ title, children, onClose }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>{title}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
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
      <button style={styles.saveBtnFull} onClick={onSave} disabled={saving}>{saving ? "جارٍ الحفظ..." : label}</button>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#059669", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  addBtn: { padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },
  backBtn: { padding: "8px 16px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", marginBottom: 18 },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },
  mutedSmall: { color: "#cbd5e1", fontSize: 13 },
  empty: { padding: 48, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" },

  programGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 },
  programCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px", cursor: "pointer" },
  pCardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  pTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  badge2: { display: "inline-block", padding: "3px 10px", borderRadius: 14, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" },
  pCat: { fontSize: 13, color: "#64748b", marginBottom: 4 },
  pProvider: { fontSize: 12, color: "#94a3b8", marginBottom: 12 },
  pMeta: { display: "flex", gap: 12, fontSize: 12, color: "#94a3b8", flexWrap: "wrap" },
  pDates: { marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9", fontSize: 12, color: "#64748b", fontFamily: "monospace" },

  detailHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 },
  detailMeta: { display: "flex", gap: 12, alignItems: "center", marginTop: 8, flexWrap: "wrap" },
  metaText: { fontSize: 13, color: "#64748b" },
  detailBtns: { display: "flex", gap: 10, alignItems: "center" },
  statusSelect: { padding: "9px 12px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  descBox: { padding: "12px 16px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13, color: "#475569", lineHeight: 1.6, marginBottom: 16 },

  statsRow: { display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" },
  statBox: { flex: 1, minWidth: 110, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "16px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 },
  statVal: { fontSize: 26, fontWeight: 800, color: "#059669", fontFamily: "monospace" },
  statLbl: { fontSize: 12, color: "#64748b" },

  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "right", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  thCenter: { textAlign: "center", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  tdName: { padding: "11px 14px", fontSize: 14, borderBottom: "1px solid #f1f5f9", color: "#334155" },
  tdCenter: { padding: "10px 14px", fontSize: 14, textAlign: "center", borderBottom: "1px solid #f1f5f9" },
  codeTag: { display: "inline-block", padding: "1px 8px", marginLeft: 8, background: "#eef2ff", color: "#4338ca", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "monospace" },
  enrollSelect: { padding: "6px 12px", fontSize: 12, fontWeight: 700, border: "none", borderRadius: 14, cursor: "pointer", fontFamily: "inherit" },
  scoreInput: { width: 64, padding: "6px 8px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 7, fontFamily: "monospace", textAlign: "center" },
  certViewBtn: { padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#4338ca", background: "#eef2ff", border: "none", borderRadius: 8, cursor: "pointer" },
  certIssueBtn: { padding: "6px 14px", fontSize: 12, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  row: { display: "flex", gap: 12 },
  modalActions: { display: "flex", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtnFull: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" },

  certModal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", position: "relative" },
  certClose: { position: "absolute", top: 16, left: 16, fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", zIndex: 1 },
  certBorder: { border: "3px double #059669", borderRadius: 12, padding: "32px 24px", textAlign: "center", background: "#fefefe" },
  certCompany: { fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 18 },
  certTitle: { fontSize: 22, fontWeight: 800, color: "#059669", marginBottom: 20 },
  certText: { fontSize: 13, color: "#64748b", marginBottom: 8 },
  certName: { fontSize: 24, fontWeight: 800, color: "#0f172a", marginBottom: 14, paddingBottom: 8, borderBottom: "2px solid #ecfdf5" },
  certProgram: { fontSize: 18, fontWeight: 700, color: "#0369a1", marginBottom: 10 },
  certHours: { fontSize: 13, color: "#64748b", marginBottom: 6 },
  certScore: { fontSize: 14, fontWeight: 700, color: "#059669", marginBottom: 6 },
  certFooter: { display: "flex", justifyContent: "space-around", marginTop: 24, paddingTop: 18, borderTop: "1px solid #e2e8f0" },
  certFooterItem: { display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontFamily: "monospace", color: "#334155" },
  certFooterLabel: { fontSize: 11, color: "#94a3b8", fontFamily: "'IBM Plex Sans Arabic', sans-serif" },
  printBtn: { width: "100%", padding: "12px", fontSize: 14, fontWeight: 700, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 16 },
};
