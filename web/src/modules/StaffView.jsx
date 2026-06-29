import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   الموظفون — قسم الموارد البشرية
   تبويبان: ملفات الموظفين (HR كامل) · الحسابات والصلاحيات
   ملف الموظف يتابع الوثائق وتواريخ انتهائها مع تنبيه قبل 60 يومًا.
   ============================================================ */

const MODULE_LABELS = {
  hr: "الموارد البشرية", finance: "المالية", attendance: "الحضور", reviews: "التقييمات",
  procurement: "المشتريات", projects: "المشاريع", operations: "العمليات", assets: "الأصول",
};
const ALL_MODULES = Object.keys(MODULE_LABELS);
const DOC_TYPES = [
  { key: "iqama", label: "الإقامة/الهوية" },
  { key: "passport", label: "الجواز" },
  { key: "workPermit", label: "رخصة العمل" },
  { key: "healthCert", label: "الشهادة الصحية" },
  { key: "insurance", label: "التأمين" },
];
const STATUS_CFG = {
  active: { label: "نشط", bg: "#dcfce7", color: "#166534" },
  on_leave: { label: "إجازة", bg: "#fef3c7", color: "#92400e" },
  terminated: { label: "منتهي الخدمة", bg: "#f1f5f9", color: "#64748b" },
};
const ROLE_LABELS = { owner: "المالك", staff: "موظف", worker: "عامل" };
const ALERT_THRESHOLD = 60;

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return Math.floor((d - today) / 86400000);
}
function docAlerts(emp) {
  const out = [];
  const docs = emp.documents || {};
  DOC_TYPES.forEach((dt) => {
    const expiry = docs[dt.key] && docs[dt.key].expiry;
    const days = daysUntil(expiry);
    if (days !== null && days <= ALERT_THRESHOLD) out.push({ doc: dt.label, expiry, days });
  });
  const cExp = emp.job && emp.job.contractExpiry;
  const cDays = daysUntil(cExp);
  if (cDays !== null && cDays <= ALERT_THRESHOLD) out.push({ doc: "العقد", expiry: cExp, days: cDays });
  out.sort((a, b) => a.days - b.days);
  return out;
}
function alertColor(days) {
  if (days < 0) return { bg: "#fee2e2", color: "#b91c1c", text: "منتهية" };
  if (days <= 30) return { bg: "#ffedd5", color: "#c2410c", text: `${days} يوم` };
  return { bg: "#fef9c3", color: "#a16207", text: `${days} يوم` };
}

export default function StaffView() {
  const [tenantId, setTenantId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("profiles");
  const [modal, setModal] = useState(null); // "newEmp" | {editEmp} | "newAccount"

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
      const [eSnap, uSnap] = await Promise.all([
        getDocs(query(collection(db, "employees"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "users"), where("tenantId", "==", tenantId))),
      ]);
      setEmployees(eSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setUsers(uSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  const linkedUserIds = new Set(employees.map((e) => e.linkedUserId).filter(Boolean));

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>الموظفون</h1>
          <p style={styles.pageSub}>ملفات الموظفين ووثائقهم وتنبيهات الانتهاء، وحسابات الدخول والصلاحيات.</p>
        </div>
        <div style={styles.topBtns}>
          {tab === "profiles" ? <button style={styles.addBtn} onClick={() => setModal("newEmp")}>+ موظف</button> : null}
          {tab === "accounts" ? <button style={styles.addBtn} onClick={() => setModal("newAccount")}>+ حساب دخول</button> : null}
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === "profiles" ? styles.tabActive : {}) }} onClick={() => setTab("profiles")}>
          👤 ملفات الموظفين
        </button>
        <button style={{ ...styles.tab, ...(tab === "accounts" ? styles.tabActive : {}) }} onClick={() => setTab("accounts")}>
          🔑 الحسابات والصلاحيات
        </button>
      </div>

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : (
        tab === "profiles"
          ? <ProfilesTab employees={employees} users={users} onEdit={(emp) => setModal({ editEmp: emp })} />
          : <AccountsTab users={users} employees={employees} />
      )}

      {modal === "newEmp" ? (
        <EmployeeForm users={users} linkedUserIds={linkedUserIds} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} />
      ) : null}
      {modal && modal.editEmp ? (
        <EmployeeForm employee={modal.editEmp} users={users} linkedUserIds={linkedUserIds} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} />
      ) : null}
      {modal === "newAccount" ? (
        <AccountForm users={users} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} />
      ) : null}
    </div>
  );
}

// ═══════════ تبويب ملفات الموظفين ═══════════
function ProfilesTab({ employees, users, onEdit }) {
  // تجميع كل التنبيهات
  const allAlerts = [];
  employees.forEach((emp) => {
    docAlerts(emp).forEach((a) => allAlerts.push({ ...a, empName: emp.name, empId: emp.id }));
  });
  allAlerts.sort((a, b) => a.days - b.days);

  const userName = (uid) => { const u = users.find((x) => x.id === uid); return u ? u.name : null; };

  return (
    <div>
      {allAlerts.length > 0 ? (
        <div style={styles.alertBanner}>
          <div style={styles.alertHead}>
            🔔 تنبيهات الوثائق ({allAlerts.length}) — وثائق منتهية أو تنتهي خلال {ALERT_THRESHOLD} يومًا
          </div>
          <div style={styles.alertList}>
            {allAlerts.slice(0, 8).map((a, i) => {
              const c = alertColor(a.days);
              return (
                <div key={i} style={styles.alertItem}>
                  <span style={styles.alertEmp}>{a.empName}</span>
                  <span style={styles.alertDoc}>{a.doc}</span>
                  <span style={{ ...styles.alertDays, background: c.bg, color: c.color }}>{c.text}</span>
                  <span style={styles.alertDate} dir="ltr">{a.expiry}</span>
                </div>
              );
            })}
            {allAlerts.length > 8 ? <div style={styles.alertMore}>+ {allAlerts.length - 8} تنبيهات أخرى</div> : null}
          </div>
        </div>
      ) : null}

      {employees.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>👤</div>
          <p style={styles.muted}>لا توجد ملفات موظفين بعد. اضغط «+ موظف» لإضافة أول موظف.</p>
        </div>
      ) : (
        <div style={styles.panel}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>الموظف</th>
                <th style={styles.th}>المسمى / القسم</th>
                <th style={styles.th}>الجنسية</th>
                <th style={styles.thAmount}>الراتب</th>
                <th style={styles.thCenter}>أقرب انتهاء</th>
                <th style={styles.thCenter}>الحالة</th>
                <th style={styles.thCenter}>الحساب</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const alerts = docAlerts(emp);
                const nearest = alerts.length ? alerts[0] : null;
                const cfg = STATUS_CFG[emp.status] || STATUS_CFG.active;
                const linked = userName(emp.linkedUserId);
                return (
                  <tr key={emp.id} style={styles.rowClickable} onClick={() => onEdit(emp)}>
                    <td style={styles.tdName}>
                      {emp.employeeCode ? <span style={styles.codeTag}>{emp.employeeCode}</span> : null}
                      <strong>{emp.name}</strong>
                    </td>
                    <td style={styles.tdName}>
                      {emp.job && emp.job.title ? emp.job.title : "—"}
                      {emp.job && emp.job.department ? <span style={styles.deptText}> · {emp.job.department}</span> : null}
                    </td>
                    <td style={styles.tdName}>{emp.nationality || "—"}</td>
                    <td style={styles.tdAmount} dir="ltr">{emp.salary ? fmt(emp.salary.total) : "—"}</td>
                    <td style={styles.tdCenter}>
                      {nearest ? (() => { const c = alertColor(nearest.days); return <span style={{ ...styles.miniBadge, background: c.bg, color: c.color }}>{nearest.doc}: {c.text}</span>; })() : <span style={styles.okMark}>✓</span>}
                    </td>
                    <td style={styles.tdCenter}>
                      <span style={{ ...styles.badge2, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    </td>
                    <td style={styles.tdCenter}>
                      {linked ? <span style={styles.linkedYes}>🔑 {linked}</span> : <span style={styles.mutedSmall}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={styles.tableHint}>💡 اضغط على أي موظف لتعديل ملفه.</p>
    </div>
  );
}

// ═══════════ تبويب الحسابات والصلاحيات ═══════════
function AccountsTab({ users, employees }) {
  const empByUser = {};
  employees.forEach((e) => { if (e.linkedUserId) empByUser[e.linkedUserId] = e.name; });

  if (users.length === 0) {
    return <div style={styles.empty}><p style={styles.muted}>لا توجد حسابات بعد.</p></div>;
  }
  return (
    <div>
      <div style={styles.accountsNote}>
        🔑 هذه حسابات الدخول للنظام وصلاحياتها. أنشئ حسابًا لمن يحتاج الدخول (المدراء، المحاسبون...)، واربطه بملف الموظف.
      </div>
      <div style={styles.panel}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>الاسم</th>
              <th style={styles.th}>البريد الإلكتروني</th>
              <th style={styles.thCenter}>الدور</th>
              <th style={styles.th}>الصلاحيات</th>
              <th style={styles.th}>ملف الموظف</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={styles.tdName}><strong>{u.name}</strong></td>
                <td style={styles.tdName} dir="ltr">{u.email || "—"}</td>
                <td style={styles.tdCenter}>
                  <span style={{ ...styles.roleBadge, ...(u.role === "owner" ? styles.roleOwner : {}) }}>{ROLE_LABELS[u.role] || u.role}</span>
                </td>
                <td style={styles.tdName}>
                  {u.role === "owner" ? (
                    <span style={styles.allPerms}>كل الصلاحيات</span>
                  ) : (u.permissions || []).length ? (
                    <div style={styles.permTags}>
                      {(u.permissions || []).map((p) => <span key={p} style={styles.permTag}>{MODULE_LABELS[p] || p}</span>)}
                    </div>
                  ) : <span style={styles.mutedSmall}>—</span>}
                </td>
                <td style={styles.tdName}>{empByUser[u.id] || <span style={styles.mutedSmall}>غير مرتبط</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════ نموذج ملف الموظف ═══════════
function EmployeeForm({ employee, users, linkedUserIds, onClose, onSaved }) {
  const isEdit = !!employee;
  const e = employee || {};
  const docs = e.documents || {};
  const job = e.job || {};
  const sal = e.salary || {};
  const cost = e.costing || {};
  const [f, setF] = useState({
    employeeCode: e.employeeCode || "", name: e.name || "", nationality: e.nationality || "", phone: e.phone || "",
    birthDate: e.birthDate || "", gender: e.gender || "",
    iqamaNumber: docs.iqama?.number || "", iqamaExpiry: docs.iqama?.expiry || "",
    passportNumber: docs.passport?.number || "", passportExpiry: docs.passport?.expiry || "",
    workPermitNumber: docs.workPermit?.number || "", workPermitExpiry: docs.workPermit?.expiry || "",
    healthCertNumber: docs.healthCert?.number || "", healthCertExpiry: docs.healthCert?.expiry || "",
    insuranceNumber: docs.insurance?.number || "", insuranceExpiry: docs.insurance?.expiry || "",
    jobTitle: job.title || "", department: job.department || "", hireDate: job.hireDate || "",
    contractType: job.contractType || "", contractExpiry: job.contractExpiry || "",
    basicSalary: sal.basic != null ? String(sal.basic) : "", housingAllowance: sal.housing != null ? String(sal.housing) : "",
    transportAllowance: sal.transport != null ? String(sal.transport) : "", otherAllowance: sal.other != null ? String(sal.other) : "",
    governmentFees: cost.governmentFees != null ? String(cost.governmentFees) : "", otHourlyRate: cost.otHourlyRate != null ? String(cost.otHourlyRate) : "",
    defaultTargetProfit: cost.defaultTargetProfit != null ? String(cost.defaultTargetProfit) : "",
    status: e.status || "active", notes: e.notes || "", linkedUserId: e.linkedUserId || "",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const totalSalary = (Number(f.basicSalary) || 0) + (Number(f.housingAllowance) || 0) + (Number(f.transportAllowance) || 0) + (Number(f.otherAllowance) || 0);
  const availableUsers = users.filter((u) => u.role !== "owner" && (!linkedUserIds.has(u.id) || u.id === f.linkedUserId));

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم الموظف مطلوب (حرفان على الأقل)."); return; }
    setSaving(true);
    try {
      const payload = { ...f, basicSalary: Number(f.basicSalary) || 0, housingAllowance: Number(f.housingAllowance) || 0, transportAllowance: Number(f.transportAllowance) || 0, otherAllowance: Number(f.otherAllowance) || 0, governmentFees: Number(f.governmentFees) || 0, otHourlyRate: Number(f.otHourlyRate) || 0, defaultTargetProfit: Number(f.defaultTargetProfit) || 0 };
      if (isEdit) {
        const fn = httpsCallable(functions, "updateEmployeeProfile");
        await fn({ employeeId: employee.id, ...payload });
      } else {
        const fn = httpsCallable(functions, "createEmployeeProfile");
        await fn(payload);
      }
      onSaved();
    } catch (ex) {
      setErr(ex.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  const docFields = [
    { numKey: "iqamaNumber", expKey: "iqamaExpiry", label: "الإقامة/الهوية" },
    { numKey: "passportNumber", expKey: "passportExpiry", label: "الجواز" },
    { numKey: "workPermitNumber", expKey: "workPermitExpiry", label: "رخصة العمل" },
    { numKey: "healthCertNumber", expKey: "healthCertExpiry", label: "الشهادة الصحية" },
    { numKey: "insuranceNumber", expKey: "insuranceExpiry", label: "التأمين" },
  ];

  return (
    <Modal title={isEdit ? "تعديل ملف الموظف" : "موظف جديد"} onClose={onClose} wide>
      {err ? <div style={styles.error}>{err}</div> : null}

      <SectionTitle>معلومات شخصية</SectionTitle>
      <div style={styles.grid2}>
        <Field label="الاسم *"><input style={styles.input} value={f.name} onChange={(ev) => set("name", ev.target.value)} disabled={saving} /></Field>
        <Field label="كود الموظف"><input style={styles.input} value={f.employeeCode} onChange={(ev) => set("employeeCode", ev.target.value)} disabled={saving} dir="ltr" /></Field>
        <Field label="الجنسية"><input style={styles.input} value={f.nationality} onChange={(ev) => set("nationality", ev.target.value)} disabled={saving} /></Field>
        <Field label="الجوال"><input style={styles.input} value={f.phone} onChange={(ev) => set("phone", ev.target.value)} disabled={saving} dir="ltr" /></Field>
        <Field label="تاريخ الميلاد"><input style={styles.input} type="date" value={f.birthDate} onChange={(ev) => set("birthDate", ev.target.value)} disabled={saving} dir="ltr" /></Field>
        <Field label="الجنس">
          <select style={styles.input} value={f.gender} onChange={(ev) => set("gender", ev.target.value)} disabled={saving}>
            <option value="">—</option><option value="male">ذكر</option><option value="female">أنثى</option>
          </select>
        </Field>
      </div>

      <SectionTitle>الوثائق وتواريخ الانتهاء</SectionTitle>
      <p style={styles.docHint}>🔔 ينبّهك النظام قبل {ALERT_THRESHOLD} يومًا من انتهاء أي وثيقة.</p>
      {docFields.map((d) => {
        const days = daysUntil(f[d.expKey]);
        const warn = days !== null && days <= ALERT_THRESHOLD;
        const c = warn ? alertColor(days) : null;
        return (
          <div key={d.numKey} style={styles.docRow}>
            <span style={styles.docLabel}>{d.label}</span>
            <input style={styles.docNumInput} placeholder="الرقم" value={f[d.numKey]} onChange={(ev) => set(d.numKey, ev.target.value)} disabled={saving} dir="ltr" />
            <input style={{ ...styles.docDateInput, ...(warn ? styles.inputWarn : {}) }} type="date" value={f[d.expKey]} onChange={(ev) => set(d.expKey, ev.target.value)} disabled={saving} dir="ltr" />
            {warn ? <span style={{ ...styles.docWarnTag, background: c.bg, color: c.color }}>{c.text}</span> : <span style={styles.docWarnSpacer} />}
          </div>
        );
      })}

      <SectionTitle>معلومات وظيفية</SectionTitle>
      <div style={styles.grid2}>
        <Field label="المسمى الوظيفي"><input style={styles.input} value={f.jobTitle} onChange={(ev) => set("jobTitle", ev.target.value)} disabled={saving} /></Field>
        <Field label="القسم"><input style={styles.input} value={f.department} onChange={(ev) => set("department", ev.target.value)} disabled={saving} /></Field>
        <Field label="تاريخ التعيين"><input style={styles.input} type="date" value={f.hireDate} onChange={(ev) => set("hireDate", ev.target.value)} disabled={saving} dir="ltr" /></Field>
        <Field label="نوع العقد">
          <select style={styles.input} value={f.contractType} onChange={(ev) => set("contractType", ev.target.value)} disabled={saving}>
            <option value="">—</option><option value="محدد المدة">محدد المدة</option><option value="غير محدد المدة">غير محدد المدة</option><option value="مؤقت">مؤقت</option>
          </select>
        </Field>
        <Field label="انتهاء العقد">
          <input style={{ ...styles.input, ...(daysUntil(f.contractExpiry) !== null && daysUntil(f.contractExpiry) <= ALERT_THRESHOLD ? styles.inputWarn : {}) }} type="date" value={f.contractExpiry} onChange={(ev) => set("contractExpiry", ev.target.value)} disabled={saving} dir="ltr" />
        </Field>
        <Field label="الحالة">
          <select style={styles.input} value={f.status} onChange={(ev) => set("status", ev.target.value)} disabled={saving}>
            <option value="active">نشط</option><option value="on_leave">إجازة</option><option value="terminated">منتهي الخدمة</option>
          </select>
        </Field>
      </div>

      <SectionTitle>الراتب والبدلات</SectionTitle>
      <div style={styles.grid2}>
        <Field label="الراتب الأساسي"><input style={styles.input} type="number" min="0" value={f.basicSalary} onChange={(ev) => set("basicSalary", ev.target.value)} disabled={saving} dir="ltr" /></Field>
        <Field label="بدل السكن"><input style={styles.input} type="number" min="0" value={f.housingAllowance} onChange={(ev) => set("housingAllowance", ev.target.value)} disabled={saving} dir="ltr" /></Field>
        <Field label="بدل المواصلات"><input style={styles.input} type="number" min="0" value={f.transportAllowance} onChange={(ev) => set("transportAllowance", ev.target.value)} disabled={saving} dir="ltr" /></Field>
        <Field label="بدلات أخرى"><input style={styles.input} type="number" min="0" value={f.otherAllowance} onChange={(ev) => set("otherAllowance", ev.target.value)} disabled={saving} dir="ltr" /></Field>
      </div>
      <div style={styles.salaryTotal}>
        <span>إجمالي الراتب الشهري</span>
        <span dir="ltr">{fmt(totalSalary)} ﷼</span>
      </div>

      <SectionTitle>مكوّنات التكلفة التشغيلية (للعمليات)</SectionTitle>
      <div style={styles.costNote}>تُستخدم لتوزيع التكاليف و Overtime عند إسناد الموظف للمشاريع.</div>
      <div style={styles.grid2}>
        <Field label="الرسوم الحكومية + الإدارية / شهر"><input style={styles.input} type="number" min="0" value={f.governmentFees} onChange={(ev) => set("governmentFees", ev.target.value)} disabled={saving} dir="ltr" /></Field>
        <Field label="معدل ساعة Overtime"><input style={styles.input} type="number" min="0" value={f.otHourlyRate} onChange={(ev) => set("otHourlyRate", ev.target.value)} disabled={saving} dir="ltr" /></Field>
        <Field label="الربح المستهدف الافتراضي / مشروع"><input style={styles.input} type="number" min="0" value={f.defaultTargetProfit} onChange={(ev) => set("defaultTargetProfit", ev.target.value)} disabled={saving} dir="ltr" /></Field>
      </div>

      <SectionTitle>حساب الدخول (اختياري)</SectionTitle>
      <Field label="ربط بحساب دخول">
        <select style={styles.input} value={f.linkedUserId} onChange={(ev) => set("linkedUserId", ev.target.value)} disabled={saving}>
          <option value="">— بدون حساب دخول —</option>
          {availableUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
        </select>
      </Field>
      <p style={styles.linkHint}>💡 لإنشاء حساب جديد بصلاحيات، استخدم تبويب «الحسابات والصلاحيات».</p>

      <Field label="ملاحظات"><input style={styles.input} value={f.notes} onChange={(ev) => set("notes", ev.target.value)} disabled={saving} /></Field>

      <div style={styles.modalActions}>
        <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
        <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : isEdit ? "حفظ التعديلات" : "حفظ الموظف"}</button>
      </div>
    </Modal>
  );
}

// ═══════════ نموذج حساب دخول جديد ═══════════
function AccountForm({ users, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [managerUid, setManagerUid] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const togglePerm = (p) => setPermissions((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  const managers = users.filter((u) => u.role === "owner" || u.role === "staff");

  async function save() {
    setErr("");
    if (name.trim().length < 2) { setErr("الاسم مطلوب (حرفان على الأقل)."); return; }
    if (!email.includes("@")) { setErr("البريد الإلكتروني غير صحيح."); return; }
    if (password.length < 6) { setErr("كلمة المرور 6 أحرف على الأقل."); return; }
    if (permissions.length === 0) { setErr("اختر صلاحية واحدة على الأقل."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createEmployee");
      await fn({ name, email, password, permissions, managerUid });
      onSaved();
    } catch (ex) {
      setErr(ex.message || "تعذّر إنشاء الحساب.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="حساب دخول جديد" onClose={onClose}>
      {err ? <div style={styles.error}>{err}</div> : null}
      <Field label="الاسم *"><input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} disabled={saving} /></Field>
      <Field label="البريد الإلكتروني *"><input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} dir="ltr" /></Field>
      <Field label="كلمة المرور المؤقتة *"><input style={styles.input} type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6 أحرف على الأقل" disabled={saving} dir="ltr" /></Field>

      <label style={styles.label}>الصلاحيات *</label>
      <div style={styles.permGrid}>
        {ALL_MODULES.map((p) => (
          <button key={p} type="button" onClick={() => togglePerm(p)} disabled={saving}
            style={{ ...styles.permBtn, ...(permissions.includes(p) ? styles.permBtnActive : {}) }}>
            {permissions.includes(p) ? "✓ " : ""}{MODULE_LABELS[p]}
          </button>
        ))}
      </div>

      <Field label="المدير المباشر">
        <select style={styles.input} value={managerUid} onChange={(e) => setManagerUid(e.target.value)} disabled={saving}>
          <option value="">— تحت المالك مباشرة —</option>
          {managers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>

      <div style={styles.modalActions}>
        <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
        <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الإنشاء..." : "إنشاء الحساب"}</button>
      </div>
    </Modal>
  );
}

// ═══════════ مكوّنات مشتركة ═══════════
function Modal({ title, children, onClose, wide }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, ...(wide ? styles.modalWide : {}) }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>{title}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function SectionTitle({ children }) { return <div style={styles.sectionTitle}>{children}</div>; }
function Field({ label, children }) {
  return <div style={styles.field}><label style={styles.label}>{label}</label>{children}</div>;
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#059669", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0, maxWidth: 560 },
  topBtns: { display: "flex", gap: 10 },
  addBtn: { padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },
  mutedSmall: { color: "#94a3b8", fontSize: 12 },

  tabs: { display: "flex", gap: 8, marginBottom: 18, borderBottom: "2px solid #e2e8f0", flexWrap: "wrap" },
  tab: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "none", border: "none", borderBottom: "3px solid transparent", cursor: "pointer", marginBottom: -2 },
  tabActive: { color: "#059669", borderBottomColor: "#059669" },

  empty: { padding: 44, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 40, marginBottom: 10 },

  alertBanner: { background: "#fff", border: "1px solid #fed7aa", borderRadius: 12, padding: "16px 20px", marginBottom: 20 },
  alertHead: { fontSize: 14, fontWeight: 700, color: "#9a3412", marginBottom: 12 },
  alertList: { display: "flex", flexDirection: "column", gap: 8 },
  alertItem: { display: "flex", alignItems: "center", gap: 12, fontSize: 13, flexWrap: "wrap" },
  alertEmp: { fontWeight: 700, color: "#0f172a", minWidth: 120 },
  alertDoc: { color: "#475569", flex: 1, minWidth: 100 },
  alertDays: { padding: "2px 12px", borderRadius: 14, fontSize: 12, fontWeight: 700 },
  alertDate: { color: "#94a3b8", fontFamily: "monospace", fontSize: 12 },
  alertMore: { fontSize: 12, color: "#94a3b8", paddingTop: 4 },

  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "right", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  thAmount: { textAlign: "left", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  thCenter: { textAlign: "center", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  tdName: { padding: "11px 14px", fontSize: 14, borderBottom: "1px solid #f1f5f9", color: "#334155" },
  tdAmount: { padding: "11px 14px", fontSize: 14, textAlign: "left", borderBottom: "1px solid #f1f5f9", fontFamily: "monospace" },
  tdCenter: { padding: "11px 14px", fontSize: 14, textAlign: "center", borderBottom: "1px solid #f1f5f9" },
  rowClickable: { cursor: "pointer" },
  codeTag: { display: "inline-block", padding: "1px 8px", marginLeft: 8, background: "#eef2ff", color: "#4338ca", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "monospace" },
  deptText: { color: "#94a3b8", fontSize: 13 },
  badge2: { display: "inline-block", padding: "3px 12px", borderRadius: 16, fontSize: 12, fontWeight: 700 },
  miniBadge: { display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700 },
  okMark: { color: "#16a34a", fontWeight: 700 },
  linkedYes: { fontSize: 12, color: "#0369a1", fontWeight: 600 },
  tableHint: { fontSize: 12, color: "#94a3b8", marginTop: 12 },

  accountsNote: { padding: "12px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, fontSize: 13, color: "#1e40af", marginBottom: 16 },
  roleBadge: { display: "inline-block", padding: "3px 12px", borderRadius: 16, fontSize: 12, fontWeight: 700, background: "#f1f5f9", color: "#475569" },
  roleOwner: { background: "#fef3c7", color: "#92400e" },
  allPerms: { fontSize: 13, color: "#92400e", fontWeight: 600 },
  permTags: { display: "flex", flexWrap: "wrap", gap: 4 },
  permTag: { display: "inline-block", padding: "2px 8px", background: "#ecfdf5", color: "#065f46", borderRadius: 6, fontSize: 11, fontWeight: 600 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalWide: { maxWidth: 680 },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },

  sectionTitle: { fontSize: 14, fontWeight: 700, color: "#059669", margin: "20px 0 10px", paddingBottom: 6, borderBottom: "2px solid #ecfdf5" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  field: { display: "flex", flexDirection: "column" },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  inputWarn: { borderColor: "#f59e0b", background: "#fffbeb" },

  docHint: { fontSize: 12, color: "#9a3412", background: "#fff7ed", padding: "8px 12px", borderRadius: 8, margin: "0 0 12px" },
  docRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  docLabel: { fontSize: 13, color: "#475569", width: 110, flexShrink: 0 },
  docNumInput: { flex: 1, padding: "8px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit" },
  docDateInput: { width: 150, padding: "8px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit", flexShrink: 0 },
  docWarnTag: { padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, width: 64, textAlign: "center", flexShrink: 0 },
  docWarnSpacer: { width: 64, flexShrink: 0 },

  salaryTotal: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, marginTop: 12, fontSize: 15, fontWeight: 800, color: "#065f46", fontFamily: "monospace" },
  costNote: { fontSize: 12, color: "#94a3b8", marginBottom: 12, marginTop: -4 },

  linkHint: { fontSize: 12, color: "#64748b", margin: "8px 0 0" },

  permGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 4 },
  permBtn: { padding: "9px 10px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#fff", border: "2px solid #e2e8f0", borderRadius: 8, cursor: "pointer", textAlign: "right" },
  permBtnActive: { borderColor: "#059669", background: "#ecfdf5", color: "#059669" },

  modalActions: { display: "flex", gap: 10, marginTop: 22 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" },
};
