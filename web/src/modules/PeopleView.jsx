import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   الأفراد — قسم العمليات (المرحلة 2: توزيع التكاليف + Overtime)
   إسناد ملفات الموظفين للمشاريع مع مشاركة التكاليف عند تعدّد المشاريع،
   وحساب Overtime على أساس شهري (إجمالي الساعات > السقف الشهري).
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");

export default function PeopleView() {
  const [tenantId, setTenantId] = useState("");
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]); // خام (لعرض إسنادات الموظف الحالية)
  const [costing, setCosting] = useState(null);        // محسوب من getOperationsCosting
  const [loading, setLoading] = useState(true);
  const [costingLoading, setCostingLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [showAssign, setShowAssign] = useState(false);

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

  useEffect(() => {
    if (tenantId && selectedProjectId) loadCosting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, tenantId]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [pSnap, eSnap, aSnap] = await Promise.all([
        getDocs(query(collection(db, "projects"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "employees"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "employeeAssignments"), where("tenantId", "==", tenantId), where("status", "==", "active"))),
      ]);
      const pList = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      pList.sort((a, b) => (b.projectNumber || 0) - (a.projectNumber || 0));
      setProjects(pList);
      setEmployees(eSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setAssignments(aSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (!selectedProjectId && pList.length > 0) setSelectedProjectId(pList[0].id);
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCosting() {
    setCostingLoading(true);
    try {
      const fn = httpsCallable(functions, "getOperationsCosting");
      const res = await fn({ projectId: selectedProjectId });
      setCosting(res.data);
    } catch (e) {
      setCosting(null);
    } finally {
      setCostingLoading(false);
    }
  }

  function reloadAll() {
    loadData();
    loadCosting();
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  const rows = costing ? costing.assignments : [];

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>الأفراد</h1>
          <p style={styles.pageSub}>إسناد الموظفين للمشاريع مع توزيع التكاليف و Overtime.</p>
        </div>
        {selectedProject ? (
          <button style={styles.addBtn} onClick={() => setShowAssign(true)} disabled={employees.length === 0}>+ إسناد موظف</button>
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

          {employees.length === 0 ? (
            <div style={styles.warnBox}>⚠ لا توجد ملفات موظفين. أضف موظفين من <strong>الموارد البشرية ← الموظفون</strong>.</div>
          ) : null}

          {costing && costing.summary && costing.summary.count > 0 ? (
            <div style={styles.summaryCards}>
              <div style={styles.sumCard}>
                <span style={styles.sumLabel}>إجمالي الإيراد</span>
                <span style={styles.sumValue} dir="ltr">{fmt(costing.summary.totalRevenue)}</span>
              </div>
              <div style={styles.sumCard}>
                <span style={styles.sumLabel}>إجمالي التكلفة</span>
                <span style={{ ...styles.sumValue, color: "#c2410c" }} dir="ltr">{fmt(costing.summary.totalCost)}</span>
              </div>
              <div style={styles.sumCard}>
                <span style={styles.sumLabel}>صافي الربح</span>
                <span style={{ ...styles.sumValue, color: costing.summary.totalNetProfit >= 0 ? "#059669" : "#dc2626" }} dir="ltr">{fmt(costing.summary.totalNetProfit)}</span>
              </div>
            </div>
          ) : null}

          {costingLoading ? <p style={styles.muted}>جارٍ حساب التكاليف...</p> : rows.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>👷</div>
              <p style={styles.emptyTitle}>لا يوجد موظفون مسندون لهذا المشروع</p>
              <p style={styles.muted}>اضغط «+ إسناد موظف» لإسناد أول موظف.</p>
            </div>
          ) : (
            <div style={styles.cardsGrid}>
              {rows.map((r) => (
                <div key={r.assignmentId} style={styles.empCard}>
                  <div style={styles.empCardTop}>
                    <div style={styles.empInfo}>
                      {r.employeeCode ? <span style={styles.codeTag}>{r.employeeCode}</span> : null}
                      <span style={styles.empName}>{r.employeeName}</span>
                      {r.isShared ? <span style={styles.sharedTag} title={`مسند في ${r.projectsCount} مشاريع`}>🔗 مشترك ({r.projectsCount})</span> : null}
                      {r.hasOT ? <span style={styles.otTag} title="يتجاوز السقف الشهري">⏱️ Overtime</span> : null}
                    </div>
                    <RemoveBtn assignmentId={r.assignmentId} name={r.employeeName} onDone={reloadAll} />
                  </div>
                  <div style={styles.empJob}>{r.employeeJobTitle || "—"} · {r.totalMonthlyHours} ساعة/شهر (السقف {r.monthlyCapHours}){r.hasOT ? ` · OT ${r.otHours} ساعة` : ""}</div>

                  <div style={styles.breakdown}>
                    <div style={styles.bdItem}><span style={styles.bdLabel}>نصيب الراتب</span><span style={styles.bdVal} dir="ltr">{fmt(r.baseShare)}</span></div>
                    <div style={styles.bdItem}><span style={styles.bdLabel}>الرسوم</span><span style={styles.bdVal} dir="ltr">{fmt(r.govShare)}</span></div>
                    <div style={styles.bdItem}><span style={styles.bdLabel}>Overtime</span><span style={{ ...styles.bdVal, color: r.otShare > 0 ? "#c2410c" : "#94a3b8" }} dir="ltr">{fmt(r.otShare)}</span></div>
                    <div style={styles.bdItem}><span style={styles.bdLabel}>الربح المستهدف</span><span style={styles.bdVal} dir="ltr">{fmt(r.profit)}</span></div>
                  </div>

                  <div style={styles.empCardFooter}>
                    <div style={styles.footItem}><span style={styles.footLabel}>التكلفة</span><span style={styles.footCost} dir="ltr">{fmt(r.totalCost)}</span></div>
                    <div style={styles.footItem}><span style={styles.footLabel}>الإيراد</span><span style={styles.footRev} dir="ltr">{fmt(r.revenue)}</span></div>
                    <div style={styles.footItem}><span style={styles.footLabel}>صافي الربح</span><span style={{ ...styles.footNet, color: r.netProfit >= 0 ? "#059669" : "#dc2626" }} dir="ltr">{r.netProfit >= 0 ? "+" : ""}{fmt(r.netProfit)}</span></div>
                  </div>
                </div>
              ))}
              <p style={styles.hint}>💡 التكلفة تتشارك بين مشاريع الموظف (الراتب + الرسوم + OT). الربح المستهدف ثابت لكل مشروع. Overtime يُحسب شهريًا عند تجاوز {costing ? costing.monthlyCapHours : 208} ساعة.</p>
            </div>
          )}
        </>
      )}

      {showAssign && selectedProject ? (
        <AssignModal
          project={selectedProject}
          employees={employees}
          allAssignments={assignments}
          onClose={() => setShowAssign(false)}
          onSaved={() => { setShowAssign(false); reloadAll(); }}
        />
      ) : null}
    </div>
  );
}

function RemoveBtn({ assignmentId, name, onDone }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(`إزالة إسناد ${name} من هذا المشروع؟`)) return;
    setBusy(true);
    try {
      const fn = httpsCallable(functions, "removeAssignment");
      await fn({ assignmentId });
      onDone();
    } catch (e) {
      alert(e.message || "تعذّر الإزالة.");
      setBusy(false);
    }
  }
  return <button style={styles.removeBtn} onClick={remove} disabled={busy}>{busy ? "..." : "إزالة"}</button>;
}

// ═══════════ مودال الإسناد ═══════════
function AssignModal({ project, employees, allAssignments, onClose, onSaved }) {
  const [employeeId, setEmployeeId] = useState("");
  const [rentalPrice, setRentalPrice] = useState("");
  const [rentalPeriod, setRentalPeriod] = useState("monthly");
  const [hoursPerDay, setHoursPerDay] = useState("8");
  const [daysPerWeek, setDaysPerWeek] = useState("6");
  const [targetProfit, setTargetProfit] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const assignedHere = new Set(allAssignments.filter((a) => a.projectId === project.id).map((a) => a.employeeId));
  const available = employees.filter((e) => e.status === "active" && !assignedHere.has(e.id));

  const selectedEmp = employees.find((e) => e.id === employeeId) || null;
  const currentAssignments = employeeId ? allAssignments.filter((a) => a.employeeId === employeeId && a.projectId !== project.id) : [];

  const monthlyHours = Math.round((Number(hoursPerDay) || 0) * (Number(daysPerWeek) || 0) * 4.33 * 10) / 10;
  const otherHours = currentAssignments.reduce((s, a) => s + (Number(a.monthlyHours) || 0), 0);
  const totalHours = Math.round((otherHours + monthlyHours) * 10) / 10;
  const willHaveOT = totalHours > 208;

  function onSelectEmployee(id) {
    setEmployeeId(id);
    const emp = employees.find((e) => e.id === id);
    if (emp && emp.costing && emp.costing.defaultTargetProfit != null) setTargetProfit(String(emp.costing.defaultTargetProfit));
    else setTargetProfit("");
  }

  async function save() {
    setErr("");
    if (!employeeId) { setErr("اختر موظفًا."); return; }
    if (rentalPrice === "" || Number(rentalPrice) < 0) { setErr("أدخل سعر التأجير."); return; }
    setSaving(true);
    try {
      const emp = employees.find((e) => e.id === employeeId);
      const baseCost = (emp && emp.salary && emp.salary.total) || 0;
      const fn = httpsCallable(functions, "assignEmployeeToProject");
      await fn({
        projectId: project.id, employeeId,
        rentalPrice: Number(rentalPrice) || 0, rentalPeriod,
        monthlyCost: baseCost,
        hoursPerDay: Number(hoursPerDay) || 0, daysPerWeek: Number(daysPerWeek) || 0,
        targetProfit: Number(targetProfit) || 0,
        notes,
      });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الإسناد.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>إسناد موظف — {project.name}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {err ? <div style={styles.error}>{err}</div> : null}

        {available.length === 0 ? (
          <p style={styles.muted}>كل الموظفين النشطين مسندون لهذا المشروع، أو لا يوجد موظفون نشطون.</p>
        ) : (
          <>
            <div style={styles.field}>
              <label style={styles.label}>الموظف *</label>
              <select style={styles.input} value={employeeId} onChange={(e) => onSelectEmployee(e.target.value)} disabled={saving}>
                <option value="">— اختر موظفًا —</option>
                {available.map((e) => <option key={e.id} value={e.id}>{e.name}{e.employeeCode ? ` (${e.employeeCode})` : ""}{e.job && e.job.title ? ` — ${e.job.title}` : ""}</option>)}
              </select>
            </div>

            {selectedEmp && currentAssignments.length > 0 ? (
              <div style={styles.currentBox}>
                <div style={styles.currentTitle}>⚠️ مسند حاليًا في {currentAssignments.length} مشروع:</div>
                {currentAssignments.map((a) => (
                  <div key={a.id} style={styles.currentItem}>
                    <span>📋 {a.projectName}</span>
                    <span dir="ltr">{a.monthlyHours || 0} ساعة/شهر</span>
                  </div>
                ))}
                <div style={styles.currentNote}>💡 التكلفة ستتوزّع على كل مشاريعه تلقائيًا.</div>
              </div>
            ) : selectedEmp ? (
              <div style={styles.freeBox}>✓ غير مسند لأي مشروع آخر حاليًا.</div>
            ) : null}

            {selectedEmp && selectedEmp.salary ? (
              <div style={styles.costInfo}>
                <span>الراتب: <strong dir="ltr">{fmt(selectedEmp.salary.total)}</strong></span>
                <span>الرسوم: <strong dir="ltr">{fmt((selectedEmp.costing && selectedEmp.costing.governmentFees) || 0)}</strong></span>
                <span>معدل OT: <strong dir="ltr">{fmt((selectedEmp.costing && selectedEmp.costing.otHourlyRate) || 0)}</strong></span>
              </div>
            ) : null}

            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>سعر التأجير (للعميل) *</label>
                <input style={styles.input} type="number" min="0" value={rentalPrice} onChange={(e) => setRentalPrice(e.target.value)} disabled={saving} dir="ltr" />
              </div>
              <div style={{ width: 110 }}>
                <label style={styles.label}>الفترة</label>
                <select style={styles.input} value={rentalPeriod} onChange={(e) => setRentalPeriod(e.target.value)} disabled={saving}>
                  <option value="monthly">شهري</option><option value="daily">يومي</option>
                </select>
              </div>
            </div>

            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>ساعات/يوم</label>
                <input style={styles.input} type="number" min="0" max="24" value={hoursPerDay} onChange={(e) => setHoursPerDay(e.target.value)} disabled={saving} dir="ltr" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>أيام/أسبوع</label>
                <input style={styles.input} type="number" min="0" max="7" value={daysPerWeek} onChange={(e) => setDaysPerWeek(e.target.value)} disabled={saving} dir="ltr" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>الربح المستهدف</label>
                <input style={styles.input} type="number" min="0" value={targetProfit} onChange={(e) => setTargetProfit(e.target.value)} disabled={saving} dir="ltr" />
              </div>
            </div>

            {employeeId ? (
              <div style={{ ...styles.hoursPreview, background: willHaveOT ? "#fff7ed" : "#f0f9ff", borderColor: willHaveOT ? "#fed7aa" : "#bae6fd" }}>
                <span>هذا المشروع: <strong dir="ltr">{monthlyHours}</strong> ساعة/شهر</span>
                {currentAssignments.length > 0 ? <span>الإجمالي عبر مشاريعه: <strong dir="ltr">{totalHours}</strong> / 208</span> : null}
                {willHaveOT ? <span style={styles.otWarn}>⏱️ سيتجاوز السقف → Overtime</span> : <span style={styles.otOk}>✓ ضمن السقف</span>}
              </div>
            ) : null}

            <div style={styles.field}>
              <label style={styles.label}>ملاحظات</label>
              <input style={styles.input} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} />
            </div>
          </>
        )}

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving || available.length === 0}>{saving ? "جارٍ الإسناد..." : "إسناد"}</button>
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

  summaryCards: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 18 },
  sumCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 6 },
  sumLabel: { fontSize: 12, color: "#64748b", fontWeight: 600 },
  sumValue: { fontSize: 22, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  empty: { padding: 48, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" },

  cardsGrid: { display: "flex", flexDirection: "column", gap: 14 },
  empCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px" },
  empCardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 4 },
  empInfo: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  codeTag: { display: "inline-block", padding: "1px 8px", background: "#eef2ff", color: "#4338ca", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "monospace" },
  empName: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  sharedTag: { padding: "2px 10px", background: "#fff7ed", color: "#c2410c", borderRadius: 10, fontSize: 11, fontWeight: 700 },
  otTag: { padding: "2px 10px", background: "#fef2f2", color: "#dc2626", borderRadius: 10, fontSize: 11, fontWeight: 700 },
  empJob: { fontSize: 13, color: "#64748b", marginBottom: 14 },

  breakdown: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9", marginBottom: 12 },
  bdItem: { display: "flex", flexDirection: "column", gap: 4, textAlign: "center" },
  bdLabel: { fontSize: 11, color: "#94a3b8", fontWeight: 600 },
  bdVal: { fontSize: 15, fontWeight: 700, color: "#334155", fontFamily: "monospace" },

  empCardFooter: { display: "flex", justifyContent: "space-around", gap: 10 },
  footItem: { display: "flex", flexDirection: "column", gap: 4, textAlign: "center" },
  footLabel: { fontSize: 11, color: "#64748b", fontWeight: 600 },
  footCost: { fontSize: 17, fontWeight: 800, color: "#c2410c", fontFamily: "monospace" },
  footRev: { fontSize: 17, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },
  footNet: { fontSize: 17, fontWeight: 800, fontFamily: "monospace" },
  hint: { fontSize: 12, color: "#94a3b8", margin: "4px 0 0", lineHeight: 1.6 },

  removeBtn: { padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 540, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  row: { display: "flex", gap: 12, marginBottom: 12 },

  currentBox: { background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "12px 14px", marginBottom: 12 },
  currentTitle: { fontSize: 13, fontWeight: 700, color: "#9a3412", marginBottom: 8 },
  currentItem: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#7c2d12", padding: "3px 0", fontFamily: "monospace" },
  currentNote: { fontSize: 11, color: "#c2410c", marginTop: 6 },
  freeBox: { background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#065f46", fontWeight: 600, marginBottom: 12 },

  costInfo: { display: "flex", gap: 16, flexWrap: "wrap", padding: "10px 14px", background: "#f8fafc", borderRadius: 8, fontSize: 13, color: "#475569", marginBottom: 12 },

  hoursPreview: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", padding: "10px 14px", border: "1px solid", borderRadius: 8, fontSize: 13, color: "#0f172a", marginBottom: 12 },
  otWarn: { color: "#c2410c", fontWeight: 700 },
  otOk: { color: "#059669", fontWeight: 700 },

  modalActions: { display: "flex", gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer" },
};
