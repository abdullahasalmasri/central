import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   التوظيف — قسم الموارد البشرية
   شواغر وظيفية + متقدمون + لوحة مراحل (فرز/مقابلة/عرض) + تعيين كموظف.
   عند التعيين يُنشأ ملف موظف تلقائيًا (ربط مع تفرّع الموظفين).
   ============================================================ */

const STAGES = [
  { key: "new", label: "جديد", color: "#475569", bg: "#f1f5f9" },
  { key: "screening", label: "فرز", color: "#0369a1", bg: "#e0f2fe" },
  { key: "interview", label: "مقابلة", color: "#6d28d9", bg: "#ede9fe" },
  { key: "offer", label: "عرض وظيفي", color: "#c2410c", bg: "#ffedd5" },
];
const STAGE_ORDER = ["new", "screening", "interview", "offer"];
const STAGE_LABEL = { new: "جديد", screening: "فرز", interview: "مقابلة", offer: "عرض وظيفي", hired: "مُعيّن", rejected: "مرفوض" };
const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");

export default function RecruitmentView() {
  const [tenantId, setTenantId] = useState("");
  const [vacancies, setVacancies] = useState([]);
  const [applicants, setApplicants] = useState([]);
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
      const [vSnap, aSnap] = await Promise.all([
        getDocs(query(collection(db, "vacancies"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "applicants"), where("tenantId", "==", tenantId))),
      ]);
      const vList = vSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      vList.sort((a, b) => (b.vacancyNumber || 0) - (a.vacancyNumber || 0));
      setVacancies(vList);
      setApplicants(aSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (selected) {
        const fresh = vList.find((v) => v.id === selected.id);
        setSelected(fresh || null);
      }
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  const countFor = (vacancyId) => applicants.filter((a) => a.vacancyId === vacancyId && a.stage !== "rejected").length;

  if (selected) {
    return <VacancyDetail vacancy={selected} applicants={applicants.filter((a) => a.vacancyId === selected.id)} onBack={() => setSelected(null)} onReload={loadData} />;
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>التوظيف</h1>
          <p style={styles.pageSub}>الشواغر الوظيفية والمتقدمون — من الإعلان إلى التعيين.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setShowCreate(true)}>+ شاغر وظيفي</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : vacancies.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>🧑‍💼</div>
          <p style={styles.emptyTitle}>لا توجد شواغر بعد</p>
          <p style={styles.muted}>اضغط «+ شاغر وظيفي» لإضافة أول شاغر وبدء استقبال المتقدمين.</p>
        </div>
      ) : (
        <div style={styles.vacancyGrid}>
          {vacancies.map((v) => (
            <div key={v.id} style={styles.vacancyCard} onClick={() => setSelected(v)}>
              <div style={styles.vCardTop}>
                <span style={styles.vTitle}>{v.title}</span>
                <span style={{ ...styles.statusDot, ...(v.status === "open" ? styles.openDot : styles.closedDot) }}>
                  {v.status === "open" ? "مفتوح" : "مغلق"}
                </span>
              </div>
              {v.department ? <div style={styles.vDept}>{v.department}</div> : null}
              <div style={styles.vMeta}>
                <span>👥 {countFor(v.id)} متقدم</span>
                <span>المطلوب: {v.count}</span>
              </div>
              {(v.salaryMin || v.salaryMax) ? (
                <div style={styles.vSalary} dir="ltr">
                  {v.salaryMin ? fmt(v.salaryMin) : "—"} - {v.salaryMax ? fmt(v.salaryMax) : "—"} ﷼
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {showCreate ? <CreateVacancyModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); loadData(); }} /> : null}
    </div>
  );
}

// ═══════════ تفاصيل الشاغر + لوحة المراحل ═══════════
function VacancyDetail({ vacancy, applicants, onBack, onReload }) {
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [hireApp, setHireApp] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const active = applicants.filter((a) => STAGE_ORDER.includes(a.stage));
  const hired = applicants.filter((a) => a.stage === "hired");
  const rejected = applicants.filter((a) => a.stage === "rejected");

  async function move(applicant, direction) {
    const idx = STAGE_ORDER.indexOf(applicant.stage);
    const newStage = direction === "next" ? STAGE_ORDER[idx + 1] : STAGE_ORDER[idx - 1];
    if (!newStage) return;
    setBusyId(applicant.id); setError("");
    try {
      const fn = httpsCallable(functions, "moveApplicantStage");
      await fn({ applicantId: applicant.id, stage: newStage });
      onReload();
    } catch (e) {
      setError(e.message || "تعذّر النقل.");
    } finally {
      setBusyId("");
    }
  }

  async function reject(applicant) {
    setBusyId(applicant.id); setError("");
    try {
      const fn = httpsCallable(functions, "moveApplicantStage");
      await fn({ applicantId: applicant.id, stage: "rejected" });
      onReload();
    } catch (e) {
      setError(e.message || "تعذّر الرفض.");
    } finally {
      setBusyId("");
    }
  }

  async function toggleStatus() {
    setStatusBusy(true); setError("");
    try {
      const fn = httpsCallable(functions, "updateVacancyStatus");
      await fn({ vacancyId: vacancy.id, status: vacancy.status === "open" ? "closed" : "open" });
      onReload();
    } catch (e) {
      setError(e.message || "تعذّر التحديث.");
    } finally {
      setStatusBusy(false);
    }
  }

  return (
    <div style={styles.page}>
      <button style={styles.backBtn} onClick={onBack}>← رجوع للشواغر</button>

      <div style={styles.detailHead}>
        <div>
          <h1 style={styles.pageTitle}>{vacancy.title}</h1>
          <div style={styles.detailMeta}>
            <span style={{ ...styles.statusDot, ...(vacancy.status === "open" ? styles.openDot : styles.closedDot) }}>{vacancy.status === "open" ? "مفتوح" : "مغلق"}</span>
            {vacancy.department ? <span style={styles.metaText}>{vacancy.department}</span> : null}
            <span style={styles.metaText}>المطلوب: {vacancy.count}</span>
            {vacancy.employmentType ? <span style={styles.metaText}>{vacancy.employmentType}</span> : null}
          </div>
        </div>
        <div style={styles.detailBtns}>
          <button style={styles.statusBtn} onClick={toggleStatus} disabled={statusBusy}>{vacancy.status === "open" ? "إغلاق الشاغر" : "إعادة فتح"}</button>
          <button style={styles.addBtn} onClick={() => setShowAdd(true)}>+ متقدم</button>
        </div>
      </div>

      {vacancy.description ? <div style={styles.descBox}>{vacancy.description}</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {/* لوحة المراحل */}
      <div style={styles.kanban}>
        {STAGES.map((st) => {
          const items = active.filter((a) => a.stage === st.key);
          return (
            <div key={st.key} style={styles.column}>
              <div style={{ ...styles.colHead, borderTopColor: st.color }}>
                <span style={{ color: st.color }}>{st.label}</span>
                <span style={styles.colCount}>{items.length}</span>
              </div>
              <div style={styles.colBody}>
                {items.length === 0 ? <div style={styles.colEmpty}>—</div> : items.map((a) => (
                  <ApplicantCard
                    key={a.id} applicant={a} stage={st.key} busy={busyId === a.id}
                    onNext={() => move(a, "next")} onPrev={() => move(a, "prev")}
                    onReject={() => reject(a)} onHire={() => setHireApp(a)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* المكتملون */}
      {(hired.length > 0 || rejected.length > 0) ? (
        <div style={styles.completedSection}>
          {hired.length > 0 ? (
            <div style={styles.completedBlock}>
              <div style={styles.completedTitle}>✅ معيّنون ({hired.length})</div>
              <div style={styles.completedList}>
                {hired.map((a) => <span key={a.id} style={styles.hiredChip}>{a.name}</span>)}
              </div>
            </div>
          ) : null}
          {rejected.length > 0 ? (
            <div style={styles.completedBlock}>
              <div style={styles.completedTitle}>✕ مرفوضون ({rejected.length})</div>
              <div style={styles.completedList}>
                {rejected.map((a) => <span key={a.id} style={styles.rejectedChip}>{a.name}</span>)}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showAdd ? <CreateApplicantModal vacancy={vacancy} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); onReload(); }} /> : null}
      {hireApp ? <HireModal applicant={hireApp} vacancy={vacancy} onClose={() => setHireApp(null)} onHired={() => { setHireApp(null); onReload(); }} /> : null}
    </div>
  );
}

function ApplicantCard({ applicant, stage, busy, onNext, onPrev, onReject, onHire }) {
  const isOffer = stage === "offer";
  const isFirst = stage === "new";
  return (
    <div style={styles.appCard}>
      <div style={styles.appName}>{applicant.name}</div>
      <div style={styles.appInfo}>
        {applicant.nationality ? <span>{applicant.nationality}</span> : null}
        {applicant.phone ? <span dir="ltr">{applicant.phone}</span> : null}
      </div>
      {applicant.source ? <div style={styles.appSource}>المصدر: {applicant.source}</div> : null}
      <div style={styles.appActions}>
        {!isFirst ? <button style={styles.prevBtn} onClick={onPrev} disabled={busy} title="للمرحلة السابقة">←</button> : null}
        {isOffer ? (
          <button style={styles.hireBtn} onClick={onHire} disabled={busy}>✓ تعيين</button>
        ) : (
          <button style={styles.nextBtn} onClick={onNext} disabled={busy}>التالي →</button>
        )}
        <button style={styles.rejBtn} onClick={onReject} disabled={busy} title="رفض">✕</button>
      </div>
    </div>
  );
}

// ═══════════ مودال شاغر جديد ═══════════
function CreateVacancyModal({ onClose, onSaved }) {
  const [f, setF] = useState({ title: "", department: "", count: "1", employmentType: "دوام كامل", description: "", salaryMin: "", salaryMax: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (f.title.trim().length < 2) { setErr("المسمى الوظيفي مطلوب."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createVacancy");
      await fn({
        title: f.title, department: f.department, count: parseInt(f.count, 10) || 1,
        employmentType: f.employmentType, description: f.description,
        salaryMin: f.salaryMin === "" ? null : Number(f.salaryMin),
        salaryMax: f.salaryMax === "" ? null : Number(f.salaryMax),
      });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="شاغر وظيفي جديد" onClose={onClose}>
      {err ? <div style={styles.error}>{err}</div> : null}
      <Field label="المسمى الوظيفي *"><input style={styles.input} value={f.title} onChange={(e) => set("title", e.target.value)} disabled={saving} /></Field>
      <div style={styles.row}>
        <div style={{ flex: 1 }}><Field label="القسم"><input style={styles.input} value={f.department} onChange={(e) => set("department", e.target.value)} disabled={saving} /></Field></div>
        <div style={{ width: 110 }}><Field label="العدد المطلوب"><input style={styles.input} type="number" min="1" value={f.count} onChange={(e) => set("count", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
      </div>
      <Field label="نوع التوظيف">
        <select style={styles.input} value={f.employmentType} onChange={(e) => set("employmentType", e.target.value)} disabled={saving}>
          <option value="دوام كامل">دوام كامل</option><option value="دوام جزئي">دوام جزئي</option><option value="مؤقت">مؤقت</option><option value="عقد">عقد</option>
        </select>
      </Field>
      <div style={styles.row}>
        <div style={{ flex: 1 }}><Field label="الراتب من"><input style={styles.input} type="number" min="0" value={f.salaryMin} onChange={(e) => set("salaryMin", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
        <div style={{ flex: 1 }}><Field label="الراتب إلى"><input style={styles.input} type="number" min="0" value={f.salaryMax} onChange={(e) => set("salaryMax", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
      </div>
      <Field label="الوصف / المتطلبات"><textarea style={styles.textarea} value={f.description} onChange={(e) => set("description", e.target.value)} disabled={saving} rows={3} /></Field>
      <FormActions onClose={onClose} onSave={save} saving={saving} label="إنشاء الشاغر" />
    </Modal>
  );
}

// ═══════════ مودال متقدم جديد ═══════════
function CreateApplicantModal({ vacancy, onClose, onSaved }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", nationality: "", source: "", notes: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم المتقدم مطلوب."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createApplicant");
      await fn({ vacancyId: vacancy.id, ...f });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`متقدم جديد — ${vacancy.title}`} onClose={onClose}>
      {err ? <div style={styles.error}>{err}</div> : null}
      <Field label="اسم المتقدم *"><input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={saving} /></Field>
      <div style={styles.row}>
        <div style={{ flex: 1 }}><Field label="الجوال"><input style={styles.input} value={f.phone} onChange={(e) => set("phone", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
        <div style={{ flex: 1 }}><Field label="الجنسية"><input style={styles.input} value={f.nationality} onChange={(e) => set("nationality", e.target.value)} disabled={saving} /></Field></div>
      </div>
      <Field label="البريد الإلكتروني"><input style={styles.input} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} disabled={saving} dir="ltr" /></Field>
      <Field label="مصدر التقديم"><input style={styles.input} value={f.source} onChange={(e) => set("source", e.target.value)} placeholder="لينكدإن، إحالة، إعلان..." disabled={saving} /></Field>
      <Field label="ملاحظات"><textarea style={styles.textarea} value={f.notes} onChange={(e) => set("notes", e.target.value)} disabled={saving} rows={2} /></Field>
      <FormActions onClose={onClose} onSave={save} saving={saving} label="تسجيل المتقدم" />
    </Modal>
  );
}

// ═══════════ مودال التعيين كموظف ═══════════
function HireModal({ applicant, vacancy, onClose, onHired }) {
  const [jobTitle, setJobTitle] = useState(vacancy.title || "");
  const [department, setDepartment] = useState(vacancy.department || "");
  const [hireDate, setHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [basicSalary, setBasicSalary] = useState(vacancy.salaryMin != null ? String(vacancy.salaryMin) : "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function hire() {
    setErr("");
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "hireApplicant");
      await fn({ applicantId: applicant.id, jobTitle, department, hireDate, basicSalary: Number(basicSalary) || 0 });
      onHired();
    } catch (e) {
      setErr(e.message || "تعذّر التعيين.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="تعيين كموظف" onClose={onClose}>
      {err ? <div style={styles.error}>{err}</div> : null}
      <div style={styles.hireBanner}>
        <span style={styles.hireBannerName}>{applicant.name}</span>
        <span style={styles.hireBannerNote}>سيُنشأ ملف موظف جديد بهذه البيانات</span>
      </div>
      <Field label="المسمى الوظيفي"><input style={styles.input} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} disabled={saving} /></Field>
      <div style={styles.row}>
        <div style={{ flex: 1 }}><Field label="القسم"><input style={styles.input} value={department} onChange={(e) => setDepartment(e.target.value)} disabled={saving} /></Field></div>
        <div style={{ flex: 1 }}><Field label="تاريخ التعيين"><input style={styles.input} type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} disabled={saving} dir="ltr" /></Field></div>
      </div>
      <Field label="الراتب الأساسي"><input style={styles.input} type="number" min="0" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} disabled={saving} dir="ltr" /></Field>
      <p style={styles.hireHint}>💡 تقدر تكمّل بقية بيانات الموظف (الوثائق، البدلات) لاحقًا من تفرّع «الموظفون».</p>
      <div style={styles.modalActions}>
        <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
        <button style={styles.saveBtnFull} onClick={hire} disabled={saving}>{saving ? "جارٍ التعيين..." : "✓ تعيين كموظف"}</button>
      </div>
    </Modal>
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
  empty: { padding: 48, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" },

  vacancyGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16 },
  vacancyCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px", cursor: "pointer" },
  vCardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  vTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  statusDot: { padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" },
  openDot: { background: "#dcfce7", color: "#166534" },
  closedDot: { background: "#f1f5f9", color: "#64748b" },
  vDept: { fontSize: 13, color: "#64748b", marginBottom: 12 },
  vMeta: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8" },
  vSalary: { marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9", fontSize: 13, color: "#059669", fontWeight: 600, fontFamily: "monospace" },

  detailHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 },
  detailMeta: { display: "flex", gap: 12, alignItems: "center", marginTop: 8, flexWrap: "wrap" },
  metaText: { fontSize: 13, color: "#64748b" },
  detailBtns: { display: "flex", gap: 10 },
  statusBtn: { padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer" },
  descBox: { padding: "12px 16px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13, color: "#475569", lineHeight: 1.6, marginBottom: 16 },

  kanban: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 },
  column: { background: "#f8fafc", borderRadius: 12, overflow: "hidden", minWidth: 0 },
  colHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#fff", borderTop: "3px solid", fontSize: 13, fontWeight: 700 },
  colCount: { background: "#f1f5f9", color: "#64748b", borderRadius: 10, padding: "1px 8px", fontSize: 12 },
  colBody: { padding: 10, display: "flex", flexDirection: "column", gap: 8, minHeight: 80 },
  colEmpty: { textAlign: "center", color: "#cbd5e1", fontSize: 13, padding: "16px 0" },

  appCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" },
  appName: { fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 },
  appInfo: { display: "flex", flexDirection: "column", gap: 2, fontSize: 12, color: "#64748b", marginBottom: 4 },
  appSource: { fontSize: 11, color: "#94a3b8", marginBottom: 8 },
  appActions: { display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" },
  prevBtn: { padding: "5px 8px", fontSize: 12, fontWeight: 600, color: "#64748b", background: "#f1f5f9", border: "none", borderRadius: 6, cursor: "pointer" },
  nextBtn: { flex: 1, padding: "5px 8px", fontSize: 12, fontWeight: 700, color: "#0369a1", background: "#e0f2fe", border: "none", borderRadius: 6, cursor: "pointer" },
  hireBtn: { flex: 1, padding: "5px 8px", fontSize: 12, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 6, cursor: "pointer" },
  rejBtn: { padding: "5px 9px", fontSize: 12, fontWeight: 700, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 6, cursor: "pointer" },

  completedSection: { display: "flex", gap: 16, flexWrap: "wrap" },
  completedBlock: { flex: 1, minWidth: 240, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 18px" },
  completedTitle: { fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 10 },
  completedList: { display: "flex", flexWrap: "wrap", gap: 6 },
  hiredChip: { padding: "4px 12px", background: "#dcfce7", color: "#166534", borderRadius: 14, fontSize: 12, fontWeight: 600 },
  rejectedChip: { padding: "4px 12px", background: "#f1f5f9", color: "#94a3b8", borderRadius: 14, fontSize: 12, textDecoration: "line-through" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  row: { display: "flex", gap: 12 },

  hireBanner: { display: "flex", flexDirection: "column", gap: 3, padding: "12px 16px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, marginBottom: 16 },
  hireBannerName: { fontSize: 16, fontWeight: 800, color: "#065f46" },
  hireBannerNote: { fontSize: 12, color: "#047857" },
  hireHint: { fontSize: 12, color: "#64748b", margin: "4px 0 0", background: "#f8fafc", padding: "10px 12px", borderRadius: 8 },

  modalActions: { display: "flex", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtnFull: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" },
};
