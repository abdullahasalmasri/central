import { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

/* ============================================================
   توقيعات العقود — سلسلة التوقيع المتبادل
   العقود → المبيعات → العميل → العقود → المالية → المشاريع
   يعرض العقود قيد التوقيع + شريط تقدم + زر التوقيع المناسب للمرحلة.
   الصلاحية تُفحص في الخادم؛ من لا يملك القسم المطلوب سيُرفض.
   ============================================================ */

// الإجراء المناسب لكل مرحلة
const STAGE_ACTION = {
  issued: { label: "📤 إرسال للعميل للتوقيع", fn: "sendContractToClient", color: "#4f46e5" },
  pending_client: { label: "✍️ تسجيل توقيع العميل", fn: "recordClientSignature", color: "#0891b2" },
  pending_contracts: { label: "✍️ توقيع إدارة العقود", fn: "signContractInternal", color: "#7c2d12" },
  pending_finance: { label: "✍️ توقيع المالية", fn: "signContractInternal", color: "#0d9488" },
  pending_projects: { label: "✍️ توقيع المشاريع", fn: "signContractInternal", color: "#7c3aed" },
};
const STAGE_LABEL = {
  issued: "صادر — بانتظار الإرسال للعميل",
  pending_client: "بانتظار توقيع العميل",
  pending_contracts: "بانتظار توقيع إدارة العقود",
  pending_finance: "بانتظار توقيع المالية",
  pending_projects: "بانتظار توقيع المشاريع",
};

export default function ContractSignaturesView() {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await httpsCallable(functions, "getContractsForSignature")({});
      setContracts((res.data && res.data.contracts) || []);
    } catch (e) {
      setError(e.message || "تعذّر التحميل.");
    } finally { setLoading(false); }
  }

  async function sign(contract) {
    const action = STAGE_ACTION[contract.signatureStage];
    if (!action) return;
    setBusy(contract.id); setError(""); setMsg("");
    try {
      const res = await httpsCallable(functions, action.fn)({ contractId: contract.id });
      setMsg(res.data.signatureStage === "active" ? `اكتمل توقيع العقد #${contract.contractNumber} — أصبح نافذًا! 🎉` : "تم التوقيع، انتقل العقد للمرحلة التالية.");
      await load();
    } catch (e) {
      setError(e.message || "تعذّر التوقيع. تأكد أن لديك صلاحية هذه المرحلة.");
    } finally { setBusy(""); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>توقيعات العقود</h1>
          <p style={styles.pageSub}>تتبّع سلسلة التوقيع المتبادل: العميل ← إدارة العقود ← المالية ← المشاريع.</p>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {msg ? <div style={styles.success}>{msg}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : contracts.length === 0 ? (
        <div style={styles.emptyBox}>لا توجد عقود قيد التوقيع. أصدِر عقدًا من «عقود المشاريع» أولاً.</div>
      ) : (
        <div style={styles.list}>
          {contracts.map((c) => {
            const action = STAGE_ACTION[c.signatureStage];
            const sigs = [
              { label: "العميل", done: !!c.clientSignedAt },
              { label: "العقود", done: !!c.contractsSignedAt },
              { label: "المالية", done: !!c.financeSignedAt },
              { label: "المشاريع", done: !!c.projectsSignedAt },
            ];
            return (
              <div key={c.id} style={styles.card}>
                <div style={styles.cardHead}>
                  <div>
                    <span style={styles.contractNum}>عقد #{c.contractNumber}</span>
                    <span style={styles.contractName}>{c.name}</span>
                  </div>
                  <span style={styles.stagePill}>{STAGE_LABEL[c.signatureStage] || c.signatureStage}</span>
                </div>

                {/* شريط التقدم */}
                <div style={styles.progress}>
                  {sigs.map((s, i) => (
                    <div key={i} style={styles.progStep}>
                      <div style={{ ...styles.progDot, ...(s.done ? styles.progDotDone : {}) }}>{s.done ? "✓" : i + 1}</div>
                      <span style={{ ...styles.progLabel, ...(s.done ? styles.progLabelDone : {}) }}>{s.label}</span>
                      {i < sigs.length - 1 ? <div style={{ ...styles.progLine, ...(s.done ? styles.progLineDone : {}) }} /> : null}
                    </div>
                  ))}
                </div>

                {action ? (
                  <div style={styles.cardFoot}>
                    <button style={{ ...styles.signBtn, background: action.color }} onClick={() => sign(c)} disabled={busy === c.id}>
                      {busy === c.id ? "جارٍ..." : action.label}
                    </button>
                  </div>
                ) : null}
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
  topRow: { marginBottom: 18 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#4f46e5", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  success: { padding: "10px 12px", background: "#dcfce7", color: "#15803d", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
  emptyBox: { padding: "40px 20px", textAlign: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, color: "#94a3b8", fontSize: 15 },

  list: { display: "flex", flexDirection: "column", gap: 14 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 22px" },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 18 },
  contractNum: { fontSize: 16, fontWeight: 800, color: "#4f46e5", fontFamily: "monospace", marginLeft: 10 },
  contractName: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  stagePill: { fontSize: 12, fontWeight: 700, color: "#475569", background: "#f1f5f9", padding: "5px 12px", borderRadius: 20 },

  progress: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, position: "relative" },
  progStep: { display: "flex", flexDirection: "column", alignItems: "center", flex: 1, position: "relative" },
  progDot: { width: 34, height: 34, borderRadius: "50%", background: "#e2e8f0", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, zIndex: 2 },
  progDotDone: { background: "#16a34a", color: "#fff" },
  progLabel: { fontSize: 12, color: "#94a3b8", marginTop: 6, fontWeight: 600 },
  progLabelDone: { color: "#16a34a" },
  progLine: { position: "absolute", top: 17, right: "-50%", width: "100%", height: 3, background: "#e2e8f0", zIndex: 1 },
  progLineDone: { background: "#16a34a" },

  cardFoot: { display: "flex", justifyContent: "flex-end", marginTop: 16, paddingTop: 16, borderTop: "1px solid #f1f5f9" },
  signBtn: { padding: "10px 22px", fontSize: 14, fontWeight: 700, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
};
