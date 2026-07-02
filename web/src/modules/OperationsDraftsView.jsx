import { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

/* ============================================================
   مسودات العمليات — قسم العمليات (المرحلة ٤ من دورة العقود)
   تعرض المشاريع المنشأة من عروض + ملخّص إسناد العمالة،
   وتتيح إرسال المسودة للمشاريع للموافقة النهائية.
   الإسناد الفعلي للعمالة يتم في شاشة "الأفراد".
   ============================================================ */

export default function OperationsDraftsView() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await httpsCallable(functions, "getProjectsForOperations")({});
      setProjects((res.data && res.data.projects) || []);
    } catch (e) {
      setError(e.message || "تعذّر تحميل المشاريع.");
    } finally { setLoading(false); }
  }

  async function submitDraft(projectId) {
    setBusy(projectId); setError(""); setMsg("");
    try {
      const res = await httpsCallable(functions, "submitOperationsDraft")({ projectId });
      setMsg(`أُرسلت المسودة ${res.data.draftNumber} للمشاريع.`);
      await load();
    } catch (e) {
      setError(e.message || "تعذّر إرسال المسودة.");
    } finally { setBusy(""); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>مسودات العمليات</h1>
          <p style={styles.pageSub}>أسند العمالة للمشاريع (من شاشة الأفراد)، ثم أرسل المسودة للمشاريع للموافقة.</p>
        </div>
      </div>

      <div style={styles.hint}>💡 الإسناد الفعلي للعمالة يتم في شاشة «الأفراد». هذه الشاشة لإرسال المسودة بعد الإسناد.</div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {msg ? <div style={styles.success}>{msg}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : projects.length === 0 ? (
        <div style={styles.emptyBox}>لا توجد مشاريع من عروض الأسعار. أنشئ مشروعًا من عرض مقبول أولاً.</div>
      ) : (
        <div style={styles.list}>
          {projects.map((p) => {
            const submitted = p.operationsDraftStatus === "submitted";
            const canSubmit = !submitted && p.assignedCount > 0;
            return (
              <div key={p.id} style={styles.projCard}>
                <div style={styles.projMain}>
                  <div style={styles.projHead}>
                    <span style={styles.projNum}>#{p.projectNumber}</span>
                    <span style={styles.projName}>{p.name}</span>
                  </div>
                  <div style={styles.projMeta}>
                    <span>العميل: {p.customerName || "—"}</span>
                    {p.poNumber ? <span> · أمر شراء: {p.poNumber}</span> : null}
                    {p.supplyPeriod ? <span> · التوريد: {p.supplyPeriod}</span> : null}
                  </div>
                  <div style={styles.assignInfo}>
                    <span style={styles.assignBadge}>{p.assignedCount} عامل مُسند</span>
                    {p.assignedEmployees && p.assignedEmployees.length > 0 ? (
                      <span style={styles.assignNames}>
                        {p.assignedEmployees.slice(0, 3).map((e) => e.employeeName).filter(Boolean).join("، ")}
                        {p.assignedEmployees.length > 3 ? ` +${p.assignedEmployees.length - 3}` : ""}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div style={styles.projSide}>
                  {submitted ? (
                    <span style={styles.draftDone}>✓ أُرسلت المسودة<br /><b>{p.operationsDraftNumber}</b></span>
                  ) : canSubmit ? (
                    <button style={styles.submitBtn} onClick={() => submitDraft(p.id)} disabled={busy === p.id}>
                      {busy === p.id ? "جارٍ الإرسال..." : "📤 إرسال مسودة"}
                    </button>
                  ) : (
                    <span style={styles.noAssign}>أسند عمالة أولاً</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#7c3aed", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },

  hint: { padding: "12px 16px", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, fontSize: 13, color: "#6d28d9", marginBottom: 16 },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  success: { padding: "10px 12px", background: "#dcfce7", color: "#15803d", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
  emptyBox: { padding: "40px 20px", textAlign: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, color: "#94a3b8", fontSize: 15 },

  list: { display: "flex", flexDirection: "column", gap: 12 },
  projCard: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 22px", gap: 16, flexWrap: "wrap" },
  projMain: { flex: 1, minWidth: 240 },
  projHead: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6 },
  projNum: { fontSize: 16, fontWeight: 800, color: "#7c3aed", fontFamily: "monospace" },
  projName: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  projMeta: { fontSize: 13, color: "#64748b", marginBottom: 10 },
  assignInfo: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  assignBadge: { fontSize: 12, fontWeight: 700, color: "#7c3aed", background: "#f5f3ff", padding: "4px 12px", borderRadius: 20 },
  assignNames: { fontSize: 12, color: "#94a3b8" },

  projSide: { display: "flex", alignItems: "center" },
  submitBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  draftDone: { fontSize: 13, fontWeight: 600, color: "#16a34a", textAlign: "center", lineHeight: 1.6 },
  noAssign: { fontSize: 13, color: "#94a3b8", fontWeight: 600 },
};
