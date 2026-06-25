import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

const STATUS_LABELS = {
  planned: "مخطّط", active: "نشط", on_hold: "متوقّف",
  under_review: "قيد المراجعة", completed: "مكتمل", cancelled: "ملغى",
};
const STATUS_COLORS = {
  planned: { bg: "#dbeafe", fg: "#1e40af" },
  active: { bg: "#dcfce7", fg: "#166534" },
  on_hold: { bg: "#fef9c3", fg: "#854d0e" },
  under_review: { bg: "#ffedd5", fg: "#9a3412" },
  completed: { bg: "#e0e7ff", fg: "#3730a3" },
  cancelled: { bg: "#fee2e2", fg: "#991b1b" },
};
const APPROVAL_LABELS = { approved: "معتمد", rejected: "مرفوض" };

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const monthsAgo = (k) => {
  const d = new Date();
  d.setMonth(d.getMonth() - k);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function ProjectApprovalTab({ tenantId, companyName }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [month, setMonth] = useState(monthsAgo(0));
  const [fromMonth, setFromMonth] = useState(monthsAgo(5));
  const [toMonth, setToMonth] = useState(monthsAgo(0));
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejectFor, setRejectFor] = useState(null); // { scope, month, label }

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "projects"), where("tenantId", "==", tenantId)));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.projectNumber || 0) - (a.projectNumber || 0));
        setProjects(list);
      } catch (e) {
        setError("تعذّر تحميل المشاريع.");
      }
    })();
  }, []);

  async function runReview() {
    if (!projectId) { setError("اختر مشروعًا أولًا."); return; }
    if (fromMonth > toMonth) { setError("بداية الفترة بعد نهايتها."); return; }
    setLoading(true);
    setError("");
    setReview(null);
    try {
      const fn = httpsCallable(functions, "getProjectFinanceReview");
      const r = await fn({ projectId, month, fromMonth, toMonth });
      setReview(r.data);
    } catch (e) {
      setError(e.message || "تعذّر جلب المراجعة.");
    } finally {
      setLoading(false);
    }
  }

  async function doApprove(scope, m) {
    setBusy(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "setProjectFinanceApproval");
      await fn({ projectId, scope, month: m, action: "approve", fromMonth, toMonth });
      await runReview();
    } catch (e) {
      setError(e.message || "تعذّر الاعتماد.");
    } finally {
      setBusy(false);
    }
  }

  async function doReject(scope, m, reason) {
    setBusy(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "setProjectFinanceApproval");
      await fn({ projectId, scope, month: m, action: "reject", rejectionReason: reason, fromMonth, toMonth });
      setRejectFor(null);
      await runReview();
    } catch (e) {
      setError(e.message || "تعذّر الرفض.");
      setRejectFor(null);
    } finally {
      setBusy(false);
    }
  }

  const sc = review ? (STATUS_COLORS[review.projectStatus] || STATUS_COLORS.planned) : null;

  return (
    <div>
      <div style={styles.head}>
        <h2 style={styles.title}>اعتماد المشاريع المالي</h2>
        <p style={styles.sub}>راجع ربحية المشروع الكاملة (العمالة + الأصول) واعتمدها أو ارفضها — شهريًّا أو لكامل الفترة. الرفض يُحوّل المشروع إلى «قيد المراجعة».</p>
      </div>

      {/* صف الاختيار */}
      <div style={styles.controls}>
        <div style={styles.ctrlField}>
          <label style={styles.label}>المشروع</label>
          <select style={styles.select} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— اختر —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name} (#{p.projectNumber})</option>
            ))}
          </select>
        </div>
        <div style={styles.ctrlField}>
          <label style={styles.label}>شهر المراجعة</label>
          <input style={styles.input} type="month" value={month} onChange={(e) => setMonth(e.target.value)} dir="ltr" />
        </div>
        <div style={styles.ctrlField}>
          <label style={styles.label}>الفترة من</label>
          <input style={styles.input} type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} dir="ltr" />
        </div>
        <div style={styles.ctrlField}>
          <label style={styles.label}>إلى</label>
          <input style={styles.input} type="month" value={toMonth} onChange={(e) => setToMonth(e.target.value)} dir="ltr" />
        </div>
        <button style={styles.reviewBtn} onClick={runReview} disabled={loading}>{loading ? "..." : "مراجعة"}</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {!review ? (
        <div style={styles.empty}>اختر مشروعًا واضغط «مراجعة» لعرض ربحيته وحالة اعتماده.</div>
      ) : (
        <>
          {/* رأس المشروع */}
          <div style={styles.projHead}>
            <div>
              <span style={styles.projName}>{review.projectName}</span>
              <span style={styles.projNum} dir="ltr"> #{review.projectNumber}</span>
            </div>
            <span style={{ ...styles.statusTag, background: sc.bg, color: sc.fg }}>{STATUS_LABELS[review.projectStatus] || review.projectStatus}</span>
          </div>

          {/* ربحية الشهر المحدّد */}
          <div style={styles.section}>
            <div style={styles.sectionHead}>
              <h3 style={styles.sectionTitle}>ربحية شهر {review.month}</h3>
              {review.monthApproval ? (
                <span style={{ ...styles.apprBadge, ...(review.monthApproval.status === "approved" ? styles.apprGreen : styles.apprRed) }}>
                  {APPROVAL_LABELS[review.monthApproval.status]}
                </span>
              ) : <span style={styles.apprNone}>لم يُراجَع</span>}
            </div>

            <div style={styles.kpis}>
              <Kpi label="الإيراد" value={review.monthProfit.revenue} />
              <Kpi label="صافي الإيراد" value={review.monthProfit.netRevenue} />
              <Kpi label="التكلفة" value={review.monthProfit.cost} />
              <Kpi label="الربح" value={review.monthProfit.profit} highlight color={review.monthProfit.profit >= 0 ? "#16a34a" : "#dc2626"} />
              <Kpi label="الهامش %" value={review.monthProfit.margin} pct color={review.monthProfit.margin >= 0 ? "#16a34a" : "#dc2626"} />
              <Kpi label="العمّال" value={review.monthWorkers} plain />
            </div>

            {review.monthApproval && review.monthApproval.status === "rejected" && review.monthApproval.rejectionReason ? (
              <div style={styles.reasonBox}>سبب الرفض: {review.monthApproval.rejectionReason}</div>
            ) : null}

            <div style={styles.actions}>
              <button style={styles.approveBtn} onClick={() => doApprove("month", review.month)} disabled={busy}>✓ اعتماد الشهر</button>
              <button style={styles.rejectBtn} onClick={() => setRejectFor({ scope: "month", month: review.month, label: `شهر ${review.month}` })} disabled={busy}>✕ رفض الشهر</button>
            </div>
          </div>

          {/* جدول الفترة */}
          <div style={styles.section}>
            <div style={styles.sectionHead}>
              <h3 style={styles.sectionTitle}>ربحية الفترة ({review.range.fromMonth} ← {review.range.toMonth})</h3>
              {review.overallApproval ? (
                <span style={{ ...styles.apprBadge, ...(review.overallApproval.status === "approved" ? styles.apprGreen : styles.apprRed) }}>
                  كامل المشروع: {APPROVAL_LABELS[review.overallApproval.status]}
                </span>
              ) : <span style={styles.apprNone}>كامل المشروع: لم يُراجَع</span>}
            </div>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>الشهر</th>
                    <th style={styles.thR}>العمّال</th>
                    <th style={styles.thR}>الإيراد</th>
                    <th style={styles.thR}>التكلفة</th>
                    <th style={styles.thR}>الربح</th>
                    <th style={styles.thR}>الهامش %</th>
                    <th style={styles.thC}>الاعتماد</th>
                  </tr>
                </thead>
                <tbody>
                  {review.range.months.map((m) => (
                    <tr key={m.month}>
                      <td style={styles.td} dir="ltr">{m.month}</td>
                      <td style={styles.tdR}>{m.workersCount}</td>
                      <td style={styles.tdR} dir="ltr">{fmt(m.revenue)}</td>
                      <td style={styles.tdR} dir="ltr">{fmt(m.cost)}</td>
                      <td style={{ ...styles.tdR, color: m.profit >= 0 ? "#16a34a" : "#dc2626", fontWeight: 700 }} dir="ltr">{fmt(m.profit)}</td>
                      <td style={{ ...styles.tdR, color: m.margin >= 0 ? "#16a34a" : "#dc2626" }} dir="ltr">{fmt(m.margin)}</td>
                      <td style={styles.tdC}>
                        {m.approvalStatus ? (
                          <span style={{ ...styles.miniBadge, ...(m.approvalStatus === "approved" ? styles.apprGreen : styles.apprRed) }}>{APPROVAL_LABELS[m.approvalStatus]}</span>
                        ) : <span style={styles.dash}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={styles.totalRow}>
                    <td style={styles.tdBold}>الإجمالي</td>
                    <td style={styles.tdR}></td>
                    <td style={styles.tdRBold} dir="ltr">{fmt(review.range.totals.revenue)}</td>
                    <td style={styles.tdRBold} dir="ltr">{fmt(review.range.totals.cost)}</td>
                    <td style={{ ...styles.tdRBold, color: review.range.totals.profit >= 0 ? "#16a34a" : "#dc2626" }} dir="ltr">{fmt(review.range.totals.profit)}</td>
                    <td style={{ ...styles.tdRBold, color: review.range.totals.margin >= 0 ? "#16a34a" : "#dc2626" }} dir="ltr">{fmt(review.range.totals.margin)}</td>
                    <td style={styles.tdC}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {review.overallApproval && review.overallApproval.status === "rejected" && review.overallApproval.rejectionReason ? (
              <div style={styles.reasonBox}>سبب الرفض: {review.overallApproval.rejectionReason}</div>
            ) : null}

            <div style={styles.actions}>
              <button style={styles.approveBtn} onClick={() => doApprove("project", "")} disabled={busy}>✓ اعتماد كامل المشروع</button>
              <button style={styles.rejectBtn} onClick={() => setRejectFor({ scope: "project", month: "", label: "كامل المشروع" })} disabled={busy}>✕ رفض كامل المشروع</button>
            </div>
          </div>
        </>
      )}

      {rejectFor ? (
        <RejectModal target={rejectFor} busy={busy} onCancel={() => setRejectFor(null)} onConfirm={(reason) => doReject(rejectFor.scope, rejectFor.month, reason)} />
      ) : null}
    </div>
  );
}

function Kpi({ label, value, color, highlight, pct, plain }) {
  return (
    <div style={{ ...styles.kpi, ...(highlight ? styles.kpiHi : {}) }}>
      <span style={styles.kpiLabel}>{label}</span>
      <span style={{ ...styles.kpiValue, color: color || "#0f172a" }} dir="ltr">
        {plain ? value : fmt(value)}{pct ? "%" : ""}
      </span>
    </div>
  );
}

function RejectModal({ target, busy, onCancel, onConfirm }) {
  const [reason, setReason] = useState("");
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.modalTitle}>رفض {target.label}</h3>
        <p style={styles.modalSub}>سيتحوّل المشروع إلى «قيد المراجعة» ويعود لقسم المشاريع.</p>
        <label style={styles.label}>سبب الرفض</label>
        <textarea style={styles.textarea} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="مثال: الهامش أقل من المستهدف، راجعوا التكاليف." />
        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onCancel} disabled={busy}>إلغاء</button>
          <button style={styles.confirmReject} onClick={() => onConfirm(reason.trim())} disabled={busy || reason.trim().length < 3}>{busy ? "..." : "تأكيد الرفض"}</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  head: { marginBottom: 18 },
  title: { margin: "0 0 6px", fontSize: 20, color: "#16a34a" },
  sub: { margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.6 },

  controls: { display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", padding: 16, background: "#f8fafc", borderRadius: 10, marginBottom: 16 },
  ctrlField: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: "#334155" },
  select: { padding: "9px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, background: "#fff", minWidth: 200 },
  input: { padding: "9px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8 },
  reviewBtn: { padding: "10px 24px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 14 },
  empty: { padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14, background: "#fff", border: "1px dashed #e2e8f0", borderRadius: 12 },

  projHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 16 },
  projName: { fontSize: 18, fontWeight: 700, color: "#0f172a" },
  projNum: { fontSize: 14, color: "#94a3b8", fontFamily: "monospace" },
  statusTag: { padding: "5px 14px", borderRadius: 14, fontSize: 13, fontWeight: 600 },

  section: { padding: 18, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 16 },
  sectionHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 },
  sectionTitle: { margin: 0, fontSize: 16, color: "#0f172a" },
  apprBadge: { padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700 },
  apprGreen: { background: "#dcfce7", color: "#166534" },
  apprRed: { background: "#fee2e2", color: "#991b1b" },
  apprNone: { padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: "#f1f5f9", color: "#64748b" },

  kpis: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 12 },
  kpi: { padding: 14, background: "#f8fafc", borderRadius: 10, display: "flex", flexDirection: "column", gap: 5, textAlign: "center" },
  kpiHi: { background: "#f0fdf4", border: "1px solid #bbf7d0" },
  kpiLabel: { fontSize: 12, color: "#64748b" },
  kpiValue: { fontSize: 20, fontWeight: 700 },

  reasonBox: { padding: "10px 14px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, fontSize: 13, color: "#9a3412", marginBottom: 12 },

  actions: { display: "flex", gap: 10, flexWrap: "wrap" },
  approveBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },
  rejectBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 600, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, cursor: "pointer" },

  tableWrap: { overflowX: "auto", marginBottom: 12 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "right", padding: "9px 12px", fontSize: 12, color: "#64748b", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" },
  thR: { textAlign: "left", padding: "9px 12px", fontSize: 12, color: "#64748b", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" },
  thC: { textAlign: "center", padding: "9px 12px", fontSize: 12, color: "#64748b", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" },
  td: { padding: "9px 12px", borderBottom: "1px solid #f1f5f9", color: "#0f172a" },
  tdR: { padding: "9px 12px", borderBottom: "1px solid #f1f5f9", textAlign: "left", color: "#334155", fontFamily: "monospace" },
  tdC: { padding: "9px 12px", borderBottom: "1px solid #f1f5f9", textAlign: "center" },
  tdBold: { padding: "10px 12px", fontWeight: 700, color: "#0f172a" },
  tdRBold: { padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#0f172a", fontFamily: "monospace" },
  totalRow: { background: "#f8fafc", borderTop: "2px solid #e2e8f0" },
  miniBadge: { padding: "2px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600 },
  dash: { color: "#cbd5e1" },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modal: { width: "100%", maxWidth: 460, background: "#fff", borderRadius: 12, padding: 24, direction: "rtl", textAlign: "right" },
  modalTitle: { margin: "0 0 6px", fontSize: 18, color: "#dc2626" },
  modalSub: { margin: "0 0 14px", fontSize: 13, color: "#64748b" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", marginTop: 6 },
  modalActions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 },
  cancelBtn: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#e2e8f0", border: "none", borderRadius: 8, cursor: "pointer" },
  confirmReject: { padding: "10px 20px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#dc2626", border: "none", borderRadius: 8, cursor: "pointer" },
};
