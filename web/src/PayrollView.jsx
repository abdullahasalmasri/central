import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   الرواتب — قسم الموارد البشرية
   مسير رواتب شهري بمتغيرات (إضافي/خصومات/سلف)، اعتماد (نقدي/مستحق)،
   صرف المستحق، وقسائم رواتب. يُولّد قيدًا محاسبيًا مربوطًا بالمالية.
   ============================================================ */

const MONTHS = ["", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const STATUS_CFG = {
  draft: { label: "مسودة", bg: "#f1f5f9", color: "#64748b" },
  approved: { label: "معتمد — بانتظار الصرف", bg: "#fef3c7", color: "#92400e" },
  paid: { label: "مدفوع", bg: "#dcfce7", color: "#166534" },
};
const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const periodLabel = (p) => { if (!p) return "—"; const [y, m] = p.split("-"); return `${MONTHS[parseInt(m, 10)]} ${y}`; };

export default function PayrollView() {
  const [tenantId, setTenantId] = useState("");
  const [companyName, setCompanyName] = useState("الشركة");
  const [payrolls, setPayrolls] = useState([]);
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
      const snap = await getDocs(query(collection(db, "payrollRuns"), where("tenantId", "==", tenantId)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.period || "").localeCompare(a.period || ""));
      setPayrolls(list);
      // تحديث المسير المفتوح إن وُجد
      if (selected) {
        const fresh = list.find((p) => p.id === selected.id);
        setSelected(fresh || null);
      }
    } catch (err) {
      setError("تعذّر تحميل المسيرات.");
    } finally {
      setLoading(false);
    }
  }

  if (selected) {
    return <PayrollDetail payroll={selected} companyName={companyName} onBack={() => setSelected(null)} onReload={loadData} />;
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>الرواتب</h1>
          <p style={styles.pageSub}>مسير الرواتب الشهري — من ملفات الموظفين إلى القيد المحاسبي.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setShowCreate(true)}>+ مسير جديد</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : payrolls.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>💵</div>
          <p style={styles.emptyTitle}>لا توجد مسيرات رواتب بعد</p>
          <p style={styles.muted}>اضغط «+ مسير جديد» لإنشاء أول مسير من موظفيك النشطين.</p>
        </div>
      ) : (
        <div style={styles.payrollGrid}>
          {payrolls.map((p) => {
            const cfg = STATUS_CFG[p.status] || STATUS_CFG.draft;
            return (
              <div key={p.id} style={styles.payrollCard} onClick={() => setSelected(p)}>
                <div style={styles.cardTop}>
                  <span style={styles.cardPeriod}>{periodLabel(p.period)}</span>
                  <span style={{ ...styles.badge2, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                </div>
                <div style={styles.cardNet} dir="ltr">{fmt(p.totalNet)} <span style={styles.cardCurrency}>﷼</span></div>
                <div style={styles.cardMeta}>
                  <span>👥 {(p.lines || []).length} موظف</span>
                  <span>مسير #{p.payrollNumber}</span>
                </div>
                {p.paymentMethod ? (
                  <div style={styles.cardMethod}>{p.paymentMethod === "cash" ? "💵 نقدي" : "📋 مستحق"}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {showCreate ? (
        <CreatePayrollModal existing={payrolls} onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); loadData().then(() => { const p = payrolls.find((x) => x.id === id); if (p) setSelected(p); }); }} onReload={loadData} />
      ) : null}
    </div>
  );
}

// ═══════════ تفاصيل المسير ═══════════
function PayrollDetail({ payroll, companyName, onBack, onReload }) {
  const [lines, setLines] = useState((payroll.lines || []).map((l) => ({ ...l })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [showApprove, setShowApprove] = useState(false);
  const [payslip, setPayslip] = useState(null);

  const isDraft = payroll.status === "draft";
  const isAccrued = payroll.status === "approved" && payroll.paymentMethod === "accrued";
  const cfg = STATUS_CFG[payroll.status] || STATUS_CFG.draft;

  function recompute(ln) {
    const gross = (Number(ln.basic) || 0) + (Number(ln.allowances) || 0) + (Number(ln.overtime) || 0);
    const net = gross - (Number(ln.deductions) || 0) - (Number(ln.advances) || 0);
    return { ...ln, gross, net: Math.round(net * 100) / 100 };
  }
  function setLineField(idx, field, value) {
    setLines((prev) => prev.map((ln, i) => i === idx ? recompute({ ...ln, [field]: value === "" ? 0 : Number(value) }) : ln));
  }
  const totals = lines.reduce((acc, ln) => {
    acc.gross += Number(ln.gross) || 0;
    acc.deductions += (Number(ln.deductions) || 0) + (Number(ln.advances) || 0);
    acc.net += Number(ln.net) || 0;
    return acc;
  }, { gross: 0, deductions: 0, net: 0 });

  async function saveLines() {
    setSaving(true); setError(""); setMsg("");
    try {
      const fn = httpsCallable(functions, "updatePayrollLines");
      await fn({ payrollId: payroll.id, lines: lines.map((l) => ({ employeeId: l.employeeId, overtime: Number(l.overtime) || 0, deductions: Number(l.deductions) || 0, advances: Number(l.advances) || 0 })) });
      setMsg("تم حفظ التعديلات.");
      onReload();
    } catch (e) {
      setError(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  async function payAccrued() {
    if (!window.confirm(`صرف رواتب ${periodLabel(payroll.period)} المستحقة من الخزينة (${fmt(payroll.totalNet)} ﷼)؟`)) return;
    setSaving(true); setError(""); setMsg("");
    try {
      const fn = httpsCallable(functions, "payAccruedPayroll");
      await fn({ payrollId: payroll.id });
      setMsg("تم صرف الرواتب المستحقة.");
      onReload();
    } catch (e) {
      setError(e.message || "تعذّر الصرف.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.page}>
      <button style={styles.backBtn} onClick={onBack}>← رجوع للمسيرات</button>

      <div style={styles.detailHead}>
        <div>
          <h1 style={styles.pageTitle}>مسير رواتب {periodLabel(payroll.period)}</h1>
          <div style={styles.detailMeta}>
            <span style={{ ...styles.badge2, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
            <span style={styles.metaText}>مسير #{payroll.payrollNumber}</span>
            <span style={styles.metaText}>👥 {lines.length} موظف</span>
            {payroll.paymentMethod ? <span style={styles.metaText}>{payroll.paymentMethod === "cash" ? "💵 صرف نقدي" : "📋 رواتب مستحقة"}</span> : null}
          </div>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {msg ? <div style={styles.success}>{msg}</div> : null}

      {isDraft ? <div style={styles.editHint}>✏️ هذا مسير مسودة — عدّل الإضافي والخصومات والسلف، احفظ، ثم اعتمد.</div> : null}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>الموظف</th>
              <th style={styles.thNum}>الأساسي</th>
              <th style={styles.thNum}>البدلات</th>
              <th style={styles.thNum}>الإضافي</th>
              <th style={styles.thNum}>الخصومات</th>
              <th style={styles.thNum}>السلف</th>
              <th style={styles.thNum}>الصافي</th>
              <th style={styles.thCenter}>قسيمة</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((ln, idx) => (
              <tr key={ln.employeeId}>
                <td style={styles.tdName}>
                  {ln.employeeCode ? <span style={styles.codeTag}>{ln.employeeCode}</span> : null}
                  {ln.name}
                </td>
                <td style={styles.tdNum} dir="ltr">{fmt(ln.basic)}</td>
                <td style={styles.tdNum} dir="ltr">{fmt(ln.allowances)}</td>
                <td style={styles.tdEdit}>
                  {isDraft ? <input style={styles.numInput} type="number" min="0" value={ln.overtime || ""} onChange={(e) => setLineField(idx, "overtime", e.target.value)} disabled={saving} dir="ltr" /> : <span dir="ltr">{fmt(ln.overtime)}</span>}
                </td>
                <td style={styles.tdEdit}>
                  {isDraft ? <input style={styles.numInput} type="number" min="0" value={ln.deductions || ""} onChange={(e) => setLineField(idx, "deductions", e.target.value)} disabled={saving} dir="ltr" /> : <span dir="ltr">{fmt(ln.deductions)}</span>}
                </td>
                <td style={styles.tdEdit}>
                  {isDraft ? <input style={styles.numInput} type="number" min="0" value={ln.advances || ""} onChange={(e) => setLineField(idx, "advances", e.target.value)} disabled={saving} dir="ltr" /> : <span dir="ltr">{fmt(ln.advances)}</span>}
                </td>
                <td style={{ ...styles.tdNum, fontWeight: 700, color: "#059669" }} dir="ltr">{fmt(ln.net)}</td>
                <td style={styles.tdCenter}>
                  <button style={styles.slipBtn} onClick={() => setPayslip(ln)}>📄</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={styles.totalRow}>
              <td style={styles.tdTotal}>الإجمالي</td>
              <td colSpan={5} style={styles.tdTotalMid} dir="ltr">إجمالي الاستحقاق {fmt(totals.gross)} · الخصومات {fmt(totals.deductions)}</td>
              <td style={styles.tdTotalNet} dir="ltr">{fmt(totals.net)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={styles.actionsBar}>
        {isDraft ? (
          <>
            <button style={styles.saveBtn} onClick={saveLines} disabled={saving}>{saving ? "..." : "💾 حفظ التعديلات"}</button>
            <button style={styles.approveBtn} onClick={() => setShowApprove(true)} disabled={saving}>✓ اعتماد المسير</button>
          </>
        ) : isAccrued ? (
          <button style={styles.payBtn} onClick={payAccrued} disabled={saving}>{saving ? "..." : "💵 صرف الرواتب المستحقة"}</button>
        ) : (
          <div style={styles.paidNote}>✓ هذا المسير مدفوع ومُرحّل للمحاسبة.</div>
        )}
      </div>

      {showApprove ? (
        <ApproveModal payroll={payroll} totalNet={totals.net} onClose={() => setShowApprove(false)} onApproved={() => { setShowApprove(false); onReload(); }} />
      ) : null}
      {payslip ? <PayslipModal line={payslip} period={payroll.period} companyName={companyName} onClose={() => setPayslip(null)} /> : null}
    </div>
  );
}

// ═══════════ مودال إنشاء مسير ═══════════
function CreatePayrollModal({ existing, onClose, onCreated, onReload }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const period = `${year}-${String(month).padStart(2, "0")}`;
  const dup = existing.some((p) => p.period === period);

  async function create() {
    if (dup) { setErr("يوجد مسير لهذا الشهر بالفعل."); return; }
    setSaving(true); setErr("");
    try {
      const fn = httpsCallable(functions, "createPayrollRun");
      const res = await fn({ year, month });
      onReload();
      onCreated(res.data.id);
    } catch (e) {
      setErr(e.message || "تعذّر الإنشاء.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>مسير رواتب جديد</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {err ? <div style={styles.error}>{err}</div> : null}
        <p style={styles.modalHint}>سيُنشأ المسير تلقائيًا لكل الموظفين النشطين برواتبهم وبدلاتهم.</p>
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>الشهر</label>
            <select style={styles.input} value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))} disabled={saving}>
              {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>السنة</label>
            <input style={styles.input} type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))} disabled={saving} dir="ltr" />
          </div>
        </div>
        {dup ? <div style={styles.warnSmall}>⚠ يوجد مسير لشهر {periodLabel(period)} بالفعل.</div> : null}
        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtnFull} onClick={create} disabled={saving || dup}>{saving ? "جارٍ الإنشاء..." : "إنشاء المسير"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════ مودال الاعتماد (اختيار طريقة الصرف) ═══════════
function ApproveModal({ payroll, totalNet, onClose, onApproved }) {
  const [method, setMethod] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function approve() {
    if (!method) { setErr("اختر طريقة الصرف."); return; }
    setSaving(true); setErr("");
    try {
      const fn = httpsCallable(functions, "approvePayrollRun");
      await fn({ payrollId: payroll.id, paymentMethod: method });
      onApproved();
    } catch (e) {
      setErr(e.message || "تعذّر الاعتماد.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>اعتماد المسير</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {err ? <div style={styles.error}>{err}</div> : null}
        <div style={styles.approveTotal}>
          <span>إجمالي صافي الرواتب</span>
          <span dir="ltr">{fmt(totalNet)} ﷼</span>
        </div>
        <p style={styles.modalHint}>اختر طريقة الصرف — تحدّد القيد المحاسبي:</p>

        <button type="button" onClick={() => setMethod("cash")} style={{ ...styles.methodCard, ...(method === "cash" ? styles.methodCardActive : {}) }} disabled={saving}>
          <div style={styles.methodTitle}>💵 نقدي مباشر</div>
          <div style={styles.methodDesc}>يُخصم من الخزينة فورًا · مدين مصروف الرواتب / دائن الخزينة</div>
        </button>
        <button type="button" onClick={() => setMethod("accrued")} style={{ ...styles.methodCard, ...(method === "accrued" ? styles.methodCardActive : {}) }} disabled={saving}>
          <div style={styles.methodTitle}>📋 رواتب مستحقة</div>
          <div style={styles.methodDesc}>التزام يُصرف لاحقًا · مدين مصروف الرواتب / دائن رواتب مستحقة</div>
        </button>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtnFull} onClick={approve} disabled={saving || !method}>{saving ? "جارٍ الاعتماد..." : "اعتماد"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════ مودال قسيمة الراتب ═══════════
function PayslipModal({ line, period, companyName, onClose }) {
  const earnings = [
    { label: "الراتب الأساسي", value: line.basic },
    { label: "البدلات", value: line.allowances },
    { label: "الإضافي", value: line.overtime },
  ];
  const deductions = [
    { label: "الخصومات", value: line.deductions },
    { label: "السلف", value: line.advances },
  ];
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.slipModal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.slipHeader}>
          <div>
            <div style={styles.slipCompany}>{companyName}</div>
            <div style={styles.slipTitle}>قسيمة راتب — {periodLabel(period)}</div>
          </div>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        <div style={styles.slipEmp}>
          <span style={styles.slipEmpName}>{line.name}</span>
          {line.employeeCode ? <span style={styles.codeTag}>{line.employeeCode}</span> : null}
        </div>

        <div style={styles.slipSection}>
          <div style={styles.slipSecTitle}>الاستحقاقات</div>
          {earnings.map((e, i) => (
            <div key={i} style={styles.slipRow}><span>{e.label}</span><span dir="ltr">{fmt(e.value)}</span></div>
          ))}
          <div style={styles.slipSub}><span>إجمالي الاستحقاق</span><span dir="ltr">{fmt(line.gross)}</span></div>
        </div>

        <div style={styles.slipSection}>
          <div style={styles.slipSecTitle}>الاستقطاعات</div>
          {deductions.map((d, i) => (
            <div key={i} style={styles.slipRow}><span>{d.label}</span><span dir="ltr">{fmt(d.value)}</span></div>
          ))}
          <div style={styles.slipSub}><span>إجمالي الاستقطاع</span><span dir="ltr">{fmt((Number(line.deductions) || 0) + (Number(line.advances) || 0))}</span></div>
        </div>

        <div style={styles.slipNet}>
          <span>صافي الراتب</span>
          <span dir="ltr">{fmt(line.net)} ﷼</span>
        </div>

        <button style={styles.printBtn} onClick={() => window.print()}>🖨️ طباعة</button>
      </div>
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
  success: { padding: "10px 14px", background: "#dcfce7", color: "#166534", borderRadius: 8, fontSize: 14, marginBottom: 16, fontWeight: 600 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  empty: { padding: 48, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" },

  payrollGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 },
  payrollCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px", cursor: "pointer", transition: "border-color .15s" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 8 },
  cardPeriod: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  cardNet: { fontSize: 26, fontWeight: 800, color: "#059669", fontFamily: "monospace", marginBottom: 10 },
  cardCurrency: { fontSize: 14, fontWeight: 400, color: "#94a3b8" },
  cardMeta: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8" },
  cardMethod: { marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9", fontSize: 12, color: "#64748b" },
  badge2: { display: "inline-block", padding: "3px 10px", borderRadius: 14, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" },

  detailHead: { marginBottom: 18 },
  detailMeta: { display: "flex", gap: 14, alignItems: "center", marginTop: 8, flexWrap: "wrap" },
  metaText: { fontSize: 13, color: "#64748b" },
  editHint: { padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, color: "#92400e", marginBottom: 16 },

  tableWrap: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "auto", marginBottom: 18 },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 720 },
  th: { textAlign: "right", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" },
  thNum: { textAlign: "left", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" },
  thCenter: { textAlign: "center", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  tdName: { padding: "10px 14px", fontSize: 14, borderBottom: "1px solid #f1f5f9", color: "#334155", whiteSpace: "nowrap" },
  tdNum: { padding: "10px 14px", fontSize: 14, textAlign: "left", borderBottom: "1px solid #f1f5f9", fontFamily: "monospace" },
  tdEdit: { padding: "6px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "left" },
  tdCenter: { padding: "10px 14px", textAlign: "center", borderBottom: "1px solid #f1f5f9" },
  numInput: { width: 90, padding: "7px 9px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 7, fontFamily: "monospace", textAlign: "left" },
  codeTag: { display: "inline-block", padding: "1px 8px", marginLeft: 8, background: "#eef2ff", color: "#4338ca", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "monospace" },
  slipBtn: { padding: "5px 10px", fontSize: 14, background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },
  totalRow: { background: "#f8fafc" },
  tdTotal: { padding: "12px 14px", fontSize: 14, fontWeight: 800, color: "#0f172a", borderTop: "2px solid #e2e8f0" },
  tdTotalMid: { padding: "12px 14px", fontSize: 12, color: "#64748b", textAlign: "left", borderTop: "2px solid #e2e8f0", fontFamily: "monospace" },
  tdTotalNet: { padding: "12px 14px", fontSize: 16, fontWeight: 800, color: "#059669", textAlign: "left", borderTop: "2px solid #e2e8f0", fontFamily: "monospace" },

  actionsBar: { display: "flex", gap: 12, flexWrap: "wrap" },
  saveBtn: { padding: "11px 22px", fontSize: 14, fontWeight: 700, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  approveBtn: { padding: "11px 24px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" },
  payBtn: { padding: "11px 24px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#0ea5e9", border: "none", borderRadius: 8, cursor: "pointer" },
  paidNote: { padding: "11px 18px", background: "#dcfce7", color: "#166534", borderRadius: 8, fontSize: 14, fontWeight: 600 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  modalHint: { fontSize: 13, color: "#64748b", margin: "0 0 16px" },
  row: { display: "flex", gap: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  warnSmall: { padding: "8px 12px", background: "#fef3c7", color: "#92400e", borderRadius: 8, fontSize: 12, marginTop: 10 },
  modalActions: { display: "flex", gap: 10, marginTop: 22 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtnFull: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" },

  approveTotal: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, marginBottom: 16, fontSize: 16, fontWeight: 800, color: "#065f46", fontFamily: "monospace" },
  methodCard: { display: "block", width: "100%", textAlign: "right", padding: "14px 16px", marginBottom: 10, background: "#fff", border: "2px solid #e2e8f0", borderRadius: 10, cursor: "pointer" },
  methodCardActive: { borderColor: "#059669", background: "#ecfdf5" },
  methodTitle: { fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 },
  methodDesc: { fontSize: 12, color: "#64748b", lineHeight: 1.5 },

  slipModal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  slipHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #e2e8f0", paddingBottom: 14, marginBottom: 14 },
  slipCompany: { fontSize: 16, fontWeight: 800, color: "#0f172a" },
  slipTitle: { fontSize: 13, color: "#059669", fontWeight: 600, marginTop: 2 },
  slipEmp: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 },
  slipEmpName: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  slipSection: { marginBottom: 16 },
  slipSecTitle: { fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #f1f5f9" },
  slipRow: { display: "flex", justifyContent: "space-between", fontSize: 14, color: "#475569", padding: "5px 0", fontFamily: "monospace" },
  slipSub: { display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "#0f172a", padding: "8px 0 0", marginTop: 4, borderTop: "1px dashed #cbd5e1", fontFamily: "monospace" },
  slipNet: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "#ecfdf5", borderRadius: 10, fontSize: 17, fontWeight: 800, color: "#065f46", fontFamily: "monospace", marginBottom: 16 },
  printBtn: { width: "100%", padding: "11px", fontSize: 14, fontWeight: 700, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
};
