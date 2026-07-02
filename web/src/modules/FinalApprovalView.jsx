import { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

/* ============================================================
   الموافقة النهائية — المرحلة ٥ من دورة العقود
   تبويبان: مراجعة المشاريع (توافق → المالية) + موافقة المالية النهائية
   (رقم موافقة → العقود). كلاهما يدعم الرفض (يرجع للعمليات).
   ============================================================ */

const TABS = [
  { key: "projects_review", label: "مراجعة المشاريع", stage: "projects_review", color: "#0d9488" },
  { key: "finance_review", label: "موافقة المالية النهائية", stage: "finance_review", color: "#0891b2" },
];

export default function FinalApprovalView() {
  const [tab, setTab] = useState("projects_review");
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [rejectId, setRejectId] = useState("");
  const [reason, setReason] = useState("");

  const cur = TABS.find((t) => t.key === tab);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  async function load() {
    setLoading(true); setError(""); setMsg("");
    try {
      const res = await httpsCallable(functions, "getFinalApprovalProjects")({ stage: cur.stage });
      setProjects((res.data && res.data.projects) || []);
    } catch (e) {
      setError(e.message || "تعذّر التحميل.");
      setProjects([]);
    } finally { setLoading(false); }
  }

  async function act(fnName, projectId, extra) {
    setBusy(projectId); setError(""); setMsg("");
    try {
      const res = await httpsCallable(functions, fnName)({ projectId, ...(extra || {}) });
      if (res.data && res.data.approvalNumber) setMsg(`تمت الموافقة النهائية — رقم ${res.data.approvalNumber}.`);
      else setMsg("تم تنفيذ الإجراء.");
      setRejectId(""); setReason("");
      await load();
    } catch (e) {
      setError(e.message || "تعذّر التنفيذ.");
    } finally { setBusy(""); }
  }

  const isProjectsTab = tab === "projects_review";

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>الموافقة النهائية</h1>
          <p style={styles.pageSub}>مراجعة المشاريع ثم الموافقة النهائية من المالية قبل إصدار العقد.</p>
        </div>
      </div>

      {/* التبويبات */}
      <div style={styles.tabs}>
        {TABS.map((t) => (
          <button key={t.key} style={{ ...styles.tab, ...(tab === t.key ? { ...styles.tabActive, color: t.color, borderColor: t.color } : {}) }} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {msg ? <div style={styles.success}>{msg}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : projects.length === 0 ? (
        <div style={styles.emptyBox}>لا توجد مشاريع في هذه المرحلة.</div>
      ) : (
        <div style={styles.list}>
          {projects.map((p) => (
            <div key={p.id} style={styles.card}>
              <div style={styles.cardMain}>
                <div style={styles.cardHead}>
                  <span style={{ ...styles.projNum, color: cur.color }}>#{p.projectNumber}</span>
                  <span style={styles.projName}>{p.name}</span>
                </div>
                <div style={styles.cardMeta}>
                  <span>العميل: {p.customerName || "—"}</span>
                  {p.operationsDraftNumber ? <span> · المسودة: {p.operationsDraftNumber}</span> : null}
                  {p.poNumber ? <span> · أمر شراء: {p.poNumber}</span> : null}
                </div>
              </div>

              {rejectId === p.id ? (
                <div style={styles.rejectInline}>
                  <input style={styles.reasonInput} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب الرفض (اختياري)" disabled={busy === p.id} />
                  <button style={styles.confirmReject} onClick={() => act(isProjectsTab ? "projectsRejectDraft" : "financeRejectProject", p.id, { reason: reason.trim() })} disabled={busy === p.id}>{busy === p.id ? "..." : "تأكيد"}</button>
                  <button style={styles.cancelBtn} onClick={() => { setRejectId(""); setReason(""); }} disabled={busy === p.id}>إلغاء</button>
                </div>
              ) : (
                <div style={styles.cardActions}>
                  <button style={styles.rejectBtn} onClick={() => setRejectId(p.id)} disabled={busy === p.id}>رفض</button>
                  <button style={{ ...styles.approveBtn, background: cur.color }} onClick={() => act(isProjectsTab ? "projectsApproveDraft" : "financeApproveProject", p.id)} disabled={busy === p.id}>
                    {busy === p.id ? "..." : isProjectsTab ? "✓ موافقة وإرسال للمالية" : "✓ موافقة نهائية"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { marginBottom: 18 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#0f172a", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },

  tabs: { display: "flex", gap: 8, marginBottom: 20, borderBottom: "2px solid #e2e8f0" },
  tab: { padding: "10px 18px", fontSize: 14, fontWeight: 700, color: "#94a3b8", background: "transparent", border: "none", borderBottom: "3px solid transparent", cursor: "pointer", fontFamily: "inherit", marginBottom: -2 },
  tabActive: { borderBottomWidth: 3, borderBottomStyle: "solid" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  success: { padding: "10px 12px", background: "#dcfce7", color: "#15803d", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
  emptyBox: { padding: "40px 20px", textAlign: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, color: "#94a3b8", fontSize: 15 },

  list: { display: "flex", flexDirection: "column", gap: 12 },
  card: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 22px", gap: 16, flexWrap: "wrap" },
  cardMain: { flex: 1, minWidth: 220 },
  cardHead: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6 },
  projNum: { fontSize: 16, fontWeight: 800, fontFamily: "monospace" },
  projName: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  cardMeta: { fontSize: 13, color: "#64748b" },

  cardActions: { display: "flex", gap: 10 },
  rejectBtn: { padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  approveBtn: { padding: "9px 20px", fontSize: 13, fontWeight: 700, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },

  rejectInline: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  reasonInput: { padding: "8px 12px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit", minWidth: 200 },
  confirmReject: { padding: "9px 16px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#dc2626", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  cancelBtn: { padding: "9px 16px", fontSize: 13, color: "#64748b", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
};
