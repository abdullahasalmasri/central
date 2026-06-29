import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   علاقات الموظفين — قسم الموارد البشرية
   ثلاثة أنظمة: الإجازات (طلب/اعتماد/رصيد) · الجزاءات · تقييم الأداء.
   ============================================================ */

const LEAVE_TYPE_LABEL = { annual: "سنوية", sick: "مرضية", unpaid: "بدون راتب", emergency: "طارئة", other: "أخرى" };
const LEAVE_STATUS_CFG = {
  pending: { label: "معلّق", bg: "#fef3c7", color: "#92400e" },
  approved: { label: "معتمد", bg: "#dcfce7", color: "#166534" },
  rejected: { label: "مرفوض", bg: "#fee2e2", color: "#b91c1c" },
};
const PENALTY_TYPE_CFG = {
  warning: { label: "إنذار", bg: "#fef3c7", color: "#92400e" },
  deduction: { label: "خصم", bg: "#ffedd5", color: "#c2410c" },
  suspension: { label: "إيقاف", bg: "#fee2e2", color: "#b91c1c" },
  other: { label: "أخرى", bg: "#f1f5f9", color: "#64748b" },
};
const CRITERIA = [
  { key: "quality", label: "جودة العمل" },
  { key: "commitment", label: "الالتزام" },
  { key: "teamwork", label: "العمل الجماعي" },
  { key: "productivity", label: "الإنتاجية" },
  { key: "initiative", label: "المبادرة" },
];
const ANNUAL_ENTITLEMENT = 21;
const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");

function ratingLabel(score) {
  if (score >= 4.5) return { label: "ممتاز", color: "#166534", bg: "#dcfce7" };
  if (score >= 3.5) return { label: "جيد جدًا", color: "#059669", bg: "#d1fae5" };
  if (score >= 2.5) return { label: "جيد", color: "#0369a1", bg: "#e0f2fe" };
  if (score >= 1.5) return { label: "مقبول", color: "#c2410c", bg: "#ffedd5" };
  return { label: "ضعيف", color: "#b91c1c", bg: "#fee2e2" };
}

export default function EmployeeRelationsView() {
  const [tenantId, setTenantId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("leaves");
  const [modal, setModal] = useState(null); // "leave" | "penalty" | "evaluation" | {viewEval}

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
      const [empSnap, lSnap, pSnap, eSnap] = await Promise.all([
        getDocs(query(collection(db, "employees"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "leaveRequests"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "penalties"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "evaluations"), where("tenantId", "==", tenantId))),
      ]);
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLeaves(lSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPenalties(pSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setEvaluations(eSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  const activeEmployees = employees.filter((e) => e.status === "active");
  const addLabel = tab === "leaves" ? "+ طلب إجازة" : tab === "penalties" ? "+ جزاء" : "+ تقييم";
  const addModal = tab === "leaves" ? "leave" : tab === "penalties" ? "penalty" : "evaluation";

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>علاقات الموظفين</h1>
          <p style={styles.pageSub}>الإجازات والجزاءات وتقييم الأداء.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setModal(addModal)} disabled={activeEmployees.length === 0}>{addLabel}</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {activeEmployees.length === 0 && !loading ? <div style={styles.warnBox}>⚠ لا يوجد موظفون نشطون. أضف موظفين من تفرّع «الموظفون» أولًا.</div> : null}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === "leaves" ? styles.tabActive : {}) }} onClick={() => setTab("leaves")}>🏖️ الإجازات</button>
        <button style={{ ...styles.tab, ...(tab === "penalties" ? styles.tabActive : {}) }} onClick={() => setTab("penalties")}>⚠️ الجزاءات</button>
        <button style={{ ...styles.tab, ...(tab === "evaluations" ? styles.tabActive : {}) }} onClick={() => setTab("evaluations")}>⭐ تقييم الأداء</button>
      </div>

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : (
        tab === "leaves" ? <LeavesTab leaves={leaves} employees={employees} onReload={loadData} />
          : tab === "penalties" ? <PenaltiesTab penalties={penalties} />
            : <EvaluationsTab evaluations={evaluations} onView={(ev) => setModal({ viewEval: ev })} />
      )}

      {modal === "leave" ? <LeaveModal employees={activeEmployees} leaves={leaves} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal === "penalty" ? <PenaltyModal employees={activeEmployees} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal === "evaluation" ? <EvaluationModal employees={activeEmployees} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.viewEval ? <ViewEvaluationModal evaluation={modal.viewEval} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

// ═══════════ تبويب الإجازات ═══════════
function LeavesTab({ leaves, employees, onReload }) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  // أرصدة السنوية المعتمدة لكل موظف
  const usedByEmp = {};
  leaves.forEach((l) => {
    if (l.type === "annual" && l.status === "approved") {
      usedByEmp[l.employeeId] = (usedByEmp[l.employeeId] || 0) + (Number(l.days) || 0);
    }
  });
  const balances = Object.keys(usedByEmp).map((empId) => {
    const emp = employees.find((e) => e.id === empId);
    const used = usedByEmp[empId];
    return { name: emp ? emp.name : "—", used, remaining: ANNUAL_ENTITLEMENT - used };
  });

  const sorted = [...leaves].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return (b.startDate || "").localeCompare(a.startDate || "");
  });

  async function review(leave, action) {
    setBusyId(leave.id); setError("");
    try {
      const fn = httpsCallable(functions, "updateLeaveStatus");
      await fn({ leaveId: leave.id, action });
      onReload();
    } catch (e) {
      setError(e.message || "تعذّر التحديث.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div>
      {error ? <div style={styles.error}>{error}</div> : null}

      {balances.length > 0 ? (
        <div style={styles.balanceSection}>
          <div style={styles.balanceTitle}>أرصدة الإجازات السنوية (الاستحقاق {ANNUAL_ENTITLEMENT} يومًا)</div>
          <div style={styles.balanceGrid}>
            {balances.map((b, i) => (
              <div key={i} style={styles.balanceCard}>
                <div style={styles.balanceName}>{b.name}</div>
                <div style={styles.balanceBar}>
                  <div style={{ ...styles.balanceFill, width: `${Math.min(100, (b.used / ANNUAL_ENTITLEMENT) * 100)}%` }} />
                </div>
                <div style={styles.balanceNums}>
                  <span>مستخدم: {b.used}</span>
                  <span style={{ color: b.remaining < 0 ? "#b91c1c" : "#059669" }}>متبقّي: {b.remaining}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {leaves.length === 0 ? (
        <div style={styles.empty}><div style={styles.emptyIcon}>🏖️</div><p style={styles.muted}>لا توجد طلبات إجازات. اضغط «+ طلب إجازة».</p></div>
      ) : (
        <div style={styles.panel}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>الموظف</th>
                <th style={styles.thCenter}>النوع</th>
                <th style={styles.thCenter}>من — إلى</th>
                <th style={styles.thCenter}>الأيام</th>
                <th style={styles.th}>السبب</th>
                <th style={styles.thCenter}>الحالة</th>
                <th style={styles.thCenter}>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((l) => {
                const cfg = LEAVE_STATUS_CFG[l.status] || LEAVE_STATUS_CFG.pending;
                return (
                  <tr key={l.id}>
                    <td style={styles.tdName}>
                      {l.employeeCode ? <span style={styles.codeTag}>{l.employeeCode}</span> : null}
                      {l.employeeName}
                    </td>
                    <td style={styles.tdCenter}><span style={styles.typeTag}>{LEAVE_TYPE_LABEL[l.type] || l.type}</span></td>
                    <td style={styles.tdCenter} dir="ltr"><span style={styles.dateRange}>{l.startDate} ← {l.endDate}</span></td>
                    <td style={styles.tdCenter}><strong>{l.days}</strong></td>
                    <td style={styles.tdReason}>{l.reason || "—"}</td>
                    <td style={styles.tdCenter}><span style={{ ...styles.badge2, background: cfg.bg, color: cfg.color }}>{cfg.label}</span></td>
                    <td style={styles.tdCenter}>
                      {l.status === "pending" ? (
                        <div style={styles.reviewBtns}>
                          <button style={styles.approveSmall} onClick={() => review(l, "approve")} disabled={busyId === l.id}>✓</button>
                          <button style={styles.rejectSmall} onClick={() => review(l, "reject")} disabled={busyId === l.id}>✕</button>
                        </div>
                      ) : <span style={styles.mutedSmall}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════ تبويب الجزاءات ═══════════
function PenaltiesTab({ penalties }) {
  const sorted = [...penalties].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div>
      <div style={styles.infoNote}>ℹ️ الجزاءات سجلّ توثيقي. الخصومات تُدخل يدويًا في مسير الرواتب عند الحاجة.</div>
      {penalties.length === 0 ? (
        <div style={styles.empty}><div style={styles.emptyIcon}>⚠️</div><p style={styles.muted}>لا توجد جزاءات مسجّلة. اضغط «+ جزاء».</p></div>
      ) : (
        <div style={styles.panel}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>الموظف</th>
                <th style={styles.thCenter}>النوع</th>
                <th style={styles.thCenter}>التاريخ</th>
                <th style={styles.thNum}>المبلغ</th>
                <th style={styles.th}>السبب</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const cfg = PENALTY_TYPE_CFG[p.type] || PENALTY_TYPE_CFG.other;
                return (
                  <tr key={p.id}>
                    <td style={styles.tdName}>
                      {p.employeeCode ? <span style={styles.codeTag}>{p.employeeCode}</span> : null}
                      {p.employeeName}
                    </td>
                    <td style={styles.tdCenter}><span style={{ ...styles.badge2, background: cfg.bg, color: cfg.color }}>{cfg.label}</span></td>
                    <td style={styles.tdCenter} dir="ltr">{p.date}</td>
                    <td style={styles.tdNum} dir="ltr">{p.amount != null ? fmt(p.amount) : "—"}</td>
                    <td style={styles.tdReason}>{p.reason || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════ تبويب التقييم ═══════════
function EvaluationsTab({ evaluations, onView }) {
  const sorted = [...evaluations].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (evaluations.length === 0) {
    return <div style={styles.empty}><div style={styles.emptyIcon}>⭐</div><p style={styles.muted}>لا توجد تقييمات. اضغط «+ تقييم».</p></div>;
  }
  return (
    <div style={styles.evalGrid}>
      {sorted.map((ev) => {
        const r = ratingLabel(ev.overallScore);
        return (
          <div key={ev.id} style={styles.evalCard} onClick={() => onView(ev)}>
            <div style={styles.evalTop}>
              <span style={styles.evalName}>{ev.employeeName}</span>
              <span style={{ ...styles.ratingBadge, background: r.bg, color: r.color }}>{r.label}</span>
            </div>
            <div style={styles.evalPeriod}>{ev.period}</div>
            <div style={styles.evalScore}>
              <span style={styles.evalScoreVal}>{fmt(ev.overallScore)}</span>
              <span style={styles.evalScoreMax}>/ 5</span>
            </div>
            <div style={styles.evalStars}>{renderStars(ev.overallScore)}</div>
            <div style={styles.evalDate} dir="ltr">{ev.date}</div>
          </div>
        );
      })}
    </div>
  );
}

function renderStars(score) {
  const full = Math.round(score);
  return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
}

// ═══════════ مودال طلب إجازة ═══════════
function LeaveModal({ employees, leaves, onClose, onSaved }) {
  const [f, setF] = useState({ employeeId: "", type: "annual", startDate: "", endDate: "", reason: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const days = (f.startDate && f.endDate && f.endDate >= f.startDate)
    ? Math.floor((new Date(f.endDate + "T00:00:00") - new Date(f.startDate + "T00:00:00")) / 86400000) + 1 : 0;

  // رصيد الموظف المختار (سنوي)
  let balanceNote = null;
  if (f.employeeId && f.type === "annual") {
    const used = leaves.filter((l) => l.employeeId === f.employeeId && l.type === "annual" && l.status === "approved").reduce((s, l) => s + (Number(l.days) || 0), 0);
    balanceNote = `الرصيد السنوي: مستخدم ${used} من ${ANNUAL_ENTITLEMENT} (متبقّي ${ANNUAL_ENTITLEMENT - used})`;
  }

  async function save() {
    setErr("");
    if (!f.employeeId) { setErr("اختر موظفًا."); return; }
    if (!f.startDate || !f.endDate) { setErr("حدّد تواريخ الإجازة."); return; }
    if (f.endDate < f.startDate) { setErr("تاريخ النهاية قبل البداية."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createLeaveRequest");
      await fn(f);
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="طلب إجازة" onClose={onClose}>
      {err ? <div style={styles.error}>{err}</div> : null}
      <Field label="الموظف *">
        <select style={styles.input} value={f.employeeId} onChange={(e) => set("employeeId", e.target.value)} disabled={saving}>
          <option value="">— اختر موظفًا —</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.employeeCode ? ` (${e.employeeCode})` : ""}</option>)}
        </select>
      </Field>
      <Field label="نوع الإجازة">
        <select style={styles.input} value={f.type} onChange={(e) => set("type", e.target.value)} disabled={saving}>
          {Object.entries(LEAVE_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      {balanceNote ? <div style={styles.balanceNote}>{balanceNote}</div> : null}
      <div style={styles.row}>
        <div style={{ flex: 1 }}><Field label="من *"><input style={styles.input} type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
        <div style={{ flex: 1 }}><Field label="إلى *"><input style={styles.input} type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
      </div>
      {days > 0 ? <div style={styles.daysNote}>عدد الأيام: <strong>{days}</strong></div> : null}
      <Field label="السبب"><textarea style={styles.textarea} value={f.reason} onChange={(e) => set("reason", e.target.value)} disabled={saving} rows={2} /></Field>
      <FormActions onClose={onClose} onSave={save} saving={saving} label="تقديم الطلب" />
    </Modal>
  );
}

// ═══════════ مودال جزاء ═══════════
function PenaltyModal({ employees, onClose, onSaved }) {
  const [f, setF] = useState({ employeeId: "", type: "warning", date: new Date().toISOString().slice(0, 10), amount: "", reason: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const showAmount = f.type === "deduction";

  async function save() {
    setErr("");
    if (!f.employeeId) { setErr("اختر موظفًا."); return; }
    if (f.reason.trim().length < 2) { setErr("سبب الجزاء مطلوب."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createPenalty");
      await fn({ ...f, amount: showAmount && f.amount !== "" ? Number(f.amount) : null });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="تسجيل جزاء" onClose={onClose}>
      {err ? <div style={styles.error}>{err}</div> : null}
      <Field label="الموظف *">
        <select style={styles.input} value={f.employeeId} onChange={(e) => set("employeeId", e.target.value)} disabled={saving}>
          <option value="">— اختر موظفًا —</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.employeeCode ? ` (${e.employeeCode})` : ""}</option>)}
        </select>
      </Field>
      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <Field label="نوع الجزاء">
            <select style={styles.input} value={f.type} onChange={(e) => set("type", e.target.value)} disabled={saving}>
              {Object.entries(PENALTY_TYPE_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}><Field label="التاريخ *"><input style={styles.input} type="date" value={f.date} onChange={(e) => set("date", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
      </div>
      {showAmount ? <Field label="مبلغ الخصم (للتوثيق)"><input style={styles.input} type="number" min="0" value={f.amount} onChange={(e) => set("amount", e.target.value)} disabled={saving} dir="ltr" /></Field> : null}
      <Field label="السبب *"><textarea style={styles.textarea} value={f.reason} onChange={(e) => set("reason", e.target.value)} disabled={saving} rows={2} /></Field>
      <FormActions onClose={onClose} onSave={save} saving={saving} label="تسجيل الجزاء" />
    </Modal>
  );
}

// ═══════════ مودال تقييم ═══════════
function EvaluationModal({ employees, onClose, onSaved }) {
  const [employeeId, setEmployeeId] = useState("");
  const [period, setPeriod] = useState("");
  const [scores, setScores] = useState({ quality: 0, commitment: 0, teamwork: 0, productivity: 0, initiative: 0 });
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const rated = CRITERIA.filter((c) => scores[c.key] > 0);
  const overall = rated.length ? rated.reduce((s, c) => s + scores[c.key], 0) / rated.length : 0;
  const r = ratingLabel(overall);

  async function save() {
    setErr("");
    if (!employeeId) { setErr("اختر موظفًا."); return; }
    if (!period.trim()) { setErr("أدخل فترة التقييم."); return; }
    if (rated.length === 0) { setErr("قيّم معيارًا واحدًا على الأقل."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createEvaluation");
      await fn({ employeeId, period, criteria: scores, strengths, improvements, notes });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="تقييم أداء" onClose={onClose}>
      {err ? <div style={styles.error}>{err}</div> : null}
      <Field label="الموظف *">
        <select style={styles.input} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={saving}>
          <option value="">— اختر موظفًا —</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.employeeCode ? ` (${e.employeeCode})` : ""}</option>)}
        </select>
      </Field>
      <Field label="فترة التقييم *"><input style={styles.input} value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="مثل: الربع الأول 2026" disabled={saving} /></Field>

      <div style={styles.criteriaSection}>
        <div style={styles.criteriaTitle}>المعايير</div>
        {CRITERIA.map((c) => (
          <div key={c.key} style={styles.criteriaRow}>
            <span style={styles.criteriaLabel}>{c.label}</span>
            <StarRating value={scores[c.key]} onChange={(v) => setScores((p) => ({ ...p, [c.key]: v }))} disabled={saving} />
          </div>
        ))}
        {rated.length > 0 ? (
          <div style={styles.overallRow}>
            <span>التقييم العام</span>
            <span style={{ ...styles.overallBadge, background: r.bg, color: r.color }}>{fmt(overall)} / 5 — {r.label}</span>
          </div>
        ) : null}
      </div>

      <Field label="نقاط القوة"><textarea style={styles.textarea} value={strengths} onChange={(e) => setStrengths(e.target.value)} disabled={saving} rows={2} /></Field>
      <Field label="مجالات التحسين"><textarea style={styles.textarea} value={improvements} onChange={(e) => setImprovements(e.target.value)} disabled={saving} rows={2} /></Field>
      <Field label="ملاحظات"><textarea style={styles.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} rows={2} /></Field>
      <FormActions onClose={onClose} onSave={save} saving={saving} label="حفظ التقييم" />
    </Modal>
  );
}

function StarRating({ value, onChange, disabled }) {
  return (
    <div style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n === value ? 0 : n)} disabled={disabled}
          style={{ ...styles.star, color: n <= value ? "#f59e0b" : "#cbd5e1" }}>★</button>
      ))}
    </div>
  );
}

// ═══════════ مودال عرض تقييم ═══════════
function ViewEvaluationModal({ evaluation, onClose }) {
  const r = ratingLabel(evaluation.overallScore);
  return (
    <Modal title={`تقييم ${evaluation.employeeName}`} onClose={onClose}>
      <div style={styles.viewHead}>
        <div>
          <div style={styles.viewPeriod}>{evaluation.period}</div>
          <div style={styles.viewDate} dir="ltr">{evaluation.date}</div>
        </div>
        <div style={{ ...styles.viewRating, background: r.bg, color: r.color }}>
          <span style={styles.viewRatingVal}>{fmt(evaluation.overallScore)}/5</span>
          <span>{r.label}</span>
        </div>
      </div>

      <div style={styles.viewCriteria}>
        {CRITERIA.map((c) => {
          const v = (evaluation.criteria || {})[c.key];
          if (v == null) return null;
          return (
            <div key={c.key} style={styles.viewCritRow}>
              <span style={styles.viewCritLabel}>{c.label}</span>
              <span style={styles.viewCritStars}>{renderStars(v)} <span style={styles.viewCritNum}>{v}/5</span></span>
            </div>
          );
        })}
      </div>

      {evaluation.strengths ? <ViewBlock title="نقاط القوة" text={evaluation.strengths} /> : null}
      {evaluation.improvements ? <ViewBlock title="مجالات التحسين" text={evaluation.improvements} /> : null}
      {evaluation.notes ? <ViewBlock title="ملاحظات" text={evaluation.notes} /> : null}

      <button style={styles.closeBtnFull} onClick={onClose}>إغلاق</button>
    </Modal>
  );
}
function ViewBlock({ title, text }) {
  return <div style={styles.viewBlock}><div style={styles.viewBlockTitle}>{title}</div><div style={styles.viewBlockText}>{text}</div></div>;
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

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },
  mutedSmall: { color: "#cbd5e1", fontSize: 13 },

  tabs: { display: "flex", gap: 8, marginBottom: 18, borderBottom: "2px solid #e2e8f0", flexWrap: "wrap" },
  tab: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "none", border: "none", borderBottom: "3px solid transparent", cursor: "pointer", marginBottom: -2 },
  tabActive: { color: "#059669", borderBottomColor: "#059669" },

  empty: { padding: 44, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 40, marginBottom: 10 },

  balanceSection: { marginBottom: 20 },
  balanceTitle: { fontSize: 14, fontWeight: 700, color: "#334155", marginBottom: 12 },
  balanceGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 },
  balanceCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" },
  balanceName: { fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 10 },
  balanceBar: { height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", marginBottom: 8 },
  balanceFill: { height: "100%", background: "#059669", borderRadius: 4 },
  balanceNums: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", fontWeight: 600 },

  infoNote: { padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, fontSize: 13, color: "#1e40af", marginBottom: 16 },

  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "auto" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 680 },
  th: { textAlign: "right", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" },
  thCenter: { textAlign: "center", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" },
  thNum: { textAlign: "left", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" },
  tdName: { padding: "11px 14px", fontSize: 14, borderBottom: "1px solid #f1f5f9", color: "#334155", whiteSpace: "nowrap" },
  tdCenter: { padding: "11px 14px", fontSize: 14, textAlign: "center", borderBottom: "1px solid #f1f5f9" },
  tdNum: { padding: "11px 14px", fontSize: 14, textAlign: "left", borderBottom: "1px solid #f1f5f9", fontFamily: "monospace" },
  tdReason: { padding: "11px 14px", fontSize: 13, borderBottom: "1px solid #f1f5f9", color: "#64748b", maxWidth: 200 },
  codeTag: { display: "inline-block", padding: "1px 8px", marginLeft: 8, background: "#eef2ff", color: "#4338ca", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "monospace" },
  typeTag: { display: "inline-block", padding: "2px 10px", background: "#f1f5f9", color: "#475569", borderRadius: 12, fontSize: 12, fontWeight: 600 },
  dateRange: { fontSize: 12, fontFamily: "monospace", color: "#475569" },
  badge2: { display: "inline-block", padding: "3px 12px", borderRadius: 14, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  reviewBtns: { display: "flex", gap: 6, justifyContent: "center" },
  approveSmall: { padding: "5px 12px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 7, cursor: "pointer" },
  rejectSmall: { padding: "5px 12px", fontSize: 13, fontWeight: 700, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 7, cursor: "pointer" },

  evalGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 },
  evalCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px", cursor: "pointer", textAlign: "center" },
  evalTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  evalName: { fontSize: 15, fontWeight: 700, color: "#0f172a", textAlign: "right" },
  ratingBadge: { padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" },
  evalPeriod: { fontSize: 12, color: "#64748b", textAlign: "right", marginBottom: 14 },
  evalScore: { display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4 },
  evalScoreVal: { fontSize: 32, fontWeight: 800, color: "#059669", fontFamily: "monospace" },
  evalScoreMax: { fontSize: 14, color: "#94a3b8" },
  evalStars: { fontSize: 18, color: "#f59e0b", letterSpacing: 2, margin: "6px 0" },
  evalDate: { fontSize: 11, color: "#94a3b8", fontFamily: "monospace" },

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
  closeBtnFull: { width: "100%", padding: "11px", fontSize: 14, fontWeight: 700, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 16 },

  balanceNote: { padding: "8px 12px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, fontSize: 12, color: "#065f46", marginBottom: 12, fontWeight: 600 },
  daysNote: { padding: "8px 12px", background: "#eff6ff", borderRadius: 8, fontSize: 13, color: "#1e40af", marginBottom: 12 },

  criteriaSection: { background: "#f8fafc", borderRadius: 10, padding: "14px 16px", marginBottom: 12 },
  criteriaTitle: { fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 10 },
  criteriaRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  criteriaLabel: { fontSize: 14, color: "#475569" },
  starRow: { display: "flex", gap: 2 },
  star: { fontSize: 22, background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 },
  overallRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid #e2e8f0", fontSize: 14, fontWeight: 700, color: "#0f172a" },
  overallBadge: { padding: "4px 14px", borderRadius: 14, fontSize: 13, fontWeight: 700 },

  viewHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 14, borderBottom: "2px solid #e2e8f0" },
  viewPeriod: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  viewDate: { fontSize: 12, color: "#94a3b8", fontFamily: "monospace", marginTop: 2 },
  viewRating: { display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700 },
  viewRatingVal: { fontSize: 20, fontFamily: "monospace" },
  viewCriteria: { marginBottom: 16 },
  viewCritRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9" },
  viewCritLabel: { fontSize: 14, color: "#475569" },
  viewCritStars: { fontSize: 16, color: "#f59e0b", letterSpacing: 2 },
  viewCritNum: { fontSize: 12, color: "#94a3b8", fontFamily: "monospace" },
  viewBlock: { marginBottom: 14 },
  viewBlockTitle: { fontSize: 13, fontWeight: 700, color: "#059669", marginBottom: 6 },
  viewBlockText: { fontSize: 14, color: "#475569", lineHeight: 1.6, background: "#f8fafc", padding: "10px 14px", borderRadius: 8 },
};
