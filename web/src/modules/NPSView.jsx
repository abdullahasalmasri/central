import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   رضا العملاء و NPS — قسم التميز والجودة
   تقييمات العملاء (0-10) ومنها NPS + CSAT + التوزيع + الاتجاه.
   getNPSData / createRating / deleteRating.
   ============================================================ */

const MONTH_NAMES = ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"];
const monthLabel = (m) => { const [, mo] = m.split("-").map(Number); return MONTH_NAMES[mo - 1] || m; };
function npsClass(nps) {
  if (nps >= 50) return { label: "ممتاز", color: "#16a34a" };
  if (nps >= 0) return { label: "جيد", color: "#ea580c" };
  return { label: "يحتاج تحسين", color: "#dc2626" };
}
function scoreColor(score) {
  if (score >= 9) return "#16a34a";
  if (score >= 7) return "#94a3b8";
  return "#dc2626";
}

export default function NPSView() {
  const [tenantId, setTenantId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);

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
      const res = await httpsCallable(functions, "getNPSData")({});
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const s = data ? data.summary : { nps: 0, csat: 0, total: 0, trendDelta: 0, promoters: 0, detractors: 0 };
  const dist = data ? data.distribution : { promoters: { count: 0, pct: 0 }, passives: { count: 0, pct: 0 }, detractors: { count: 0, pct: 0 } };
  const byCustomer = data ? data.byCustomer : [];
  const trend = data ? data.trend : [];
  const ratings = data ? data.ratings : [];
  const npsInfo = npsClass(s.nps);
  const maxTrend = Math.max(1, ...trend.map((t) => t.csat));

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>رضا العملاء و NPS</h1>
          <p style={styles.pageSub}>قياس رضا العملاء ومؤشر صافي الترويج.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setModal(true)}>+ تسجيل تقييم</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : !data ? (
        <div style={styles.warnBox}>تعذّر تحميل البيانات.</div>
      ) : s.total === 0 ? (
        <div style={styles.warnBox}>لا توجد تقييمات بعد. سجّل أول تقييم عميل.</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>مؤشر NPS</span>
              <span style={{ ...styles.kpiValue, color: npsInfo.color }} dir="ltr">{s.nps > 0 ? "+" : ""}{s.nps}</span>
              <span style={{ ...styles.kpiSub, color: npsInfo.color }}>{npsInfo.label}</span>
            </div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>رضا العملاء (CSAT)</span><span style={{ ...styles.kpiValue, color: "#16a34a" }} dir="ltr">{s.csat}%</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>التقييمات</span><span style={{ ...styles.kpiValue, color: "#2563eb" }}>{s.total}</span></div>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>الاتجاه (CSAT)</span>
              <span style={{ ...styles.kpiValue, color: s.trendDelta >= 0 ? "#16a34a" : "#dc2626" }} dir="ltr">{s.trendDelta > 0 ? "+" : ""}{s.trendDelta}</span>
            </div>
          </div>

          {/* توزيع NPS */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>توزيع المقيّمين</h3>
            <div style={styles.distBar}>
              {dist.promoters.pct > 0 ? <div style={{ ...styles.distSeg, width: `${dist.promoters.pct}%`, background: "#16a34a" }}>{dist.promoters.pct >= 10 ? `${dist.promoters.pct}%` : ""}</div> : null}
              {dist.passives.pct > 0 ? <div style={{ ...styles.distSeg, width: `${dist.passives.pct}%`, background: "#94a3b8" }}>{dist.passives.pct >= 10 ? `${dist.passives.pct}%` : ""}</div> : null}
              {dist.detractors.pct > 0 ? <div style={{ ...styles.distSeg, width: `${dist.detractors.pct}%`, background: "#dc2626" }}>{dist.detractors.pct >= 10 ? `${dist.detractors.pct}%` : ""}</div> : null}
            </div>
            <div style={styles.distLegend}>
              <span style={styles.legItem}><span style={{ ...styles.legDot, background: "#16a34a" }} />مروّجون (٩-١٠): {dist.promoters.count}</span>
              <span style={styles.legItem}><span style={{ ...styles.legDot, background: "#94a3b8" }} />محايدون (٧-٨): {dist.passives.count}</span>
              <span style={styles.legItem}><span style={{ ...styles.legDot, background: "#dc2626" }} />منتقدون (٠-٦): {dist.detractors.count}</span>
            </div>
          </div>

          <div style={styles.twoCol}>
            {/* الاتجاه الشهري */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>رضا العملاء عبر الزمن</h3>
              {trend.length === 0 ? <p style={styles.muted}>لا توجد بيانات كافية.</p> : (
                <div style={styles.trendChart}>
                  {trend.map((t, i) => (
                    <div key={i} style={styles.trendCol}>
                      <div style={styles.trendBarWrap}>
                        <div style={{ ...styles.trendBar, height: `${(t.csat / maxTrend) * 100}%` }} />
                      </div>
                      <span style={styles.trendVal} dir="ltr">{Math.round(t.csat)}</span>
                      <span style={styles.trendMonth}>{monthLabel(t.month)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* حسب العميل */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>التقييم حسب العميل</h3>
              {byCustomer.length === 0 ? <p style={styles.muted}>لا توجد تقييمات بأسماء عملاء.</p> : (
                <div style={styles.custList}>
                  {byCustomer.slice(0, 6).map((c, i) => (
                    <div key={i} style={styles.custItem}>
                      <div style={styles.custTop}>
                        <span style={styles.custName}>{c.name}</span>
                        <span style={{ ...styles.custScore, color: scoreColor(c.avgScore) }} dir="ltr">{c.avgScore}/10</span>
                      </div>
                      <div style={styles.custBar}><div style={{ ...styles.custFill, width: `${c.score100}%`, background: scoreColor(c.avgScore) }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* التقييمات الأخيرة */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>أحدث التقييمات</h3>
            <div style={styles.ratingList}>
              {ratings.slice(0, 12).map((r) => (
                <div key={r.id} style={styles.ratingCard}>
                  <div style={{ ...styles.ratingScore, background: scoreColor(r.score) }}>{r.score}</div>
                  <div style={styles.ratingBody}>
                    <div style={styles.ratingTop}>
                      <span style={styles.ratingCustomer}>{r.customerName || "عميل"}</span>
                      {r.date ? <span style={styles.ratingDate} dir="ltr">{r.date}</span> : null}
                    </div>
                    {r.surveyName ? <span style={styles.ratingSurvey}>{r.surveyName}</span> : null}
                    {r.comment ? <div style={styles.ratingComment}>"{r.comment}"</div> : null}
                  </div>
                  <DeleteBtn ratingId={r.id} onDone={loadData} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {modal ? <RatingModal onClose={() => setModal(false)} onSaved={() => { setModal(false); loadData(); }} /> : null}
    </div>
  );
}

function DeleteBtn({ ratingId, onDone }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm("حذف هذا التقييم؟")) return;
    setBusy(true);
    try {
      await httpsCallable(functions, "deleteRating")({ ratingId });
      onDone();
    } catch (e) { alert(e.message || "تعذّر الحذف."); setBusy(false); }
  }
  return <button style={styles.delBtn} onClick={del} disabled={busy}>{busy ? "..." : "🗑"}</button>;
}

function RatingModal({ onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ customerName: "", score: 9, comment: "", surveyName: "", date: today });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    setSaving(true);
    try {
      await httpsCallable(functions, "createRating")({
        customerName: f.customerName.trim(), score: f.score, comment: f.comment.trim(),
        surveyName: f.surveyName.trim(), date: f.date,
      });
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الحفظ."); setSaving(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}><h2 style={styles.modalTitle}>تسجيل تقييم عميل</h2><button style={styles.close} onClick={onClose}>✕</button></div>
        {err ? <div style={styles.error}>{err}</div> : null}

        <div style={styles.field}><label style={styles.label}>العميل</label><input style={styles.input} value={f.customerName} onChange={(e) => set("customerName", e.target.value)} disabled={saving} placeholder="اسم العميل" /></div>

        <div style={styles.field}>
          <label style={styles.label}>الدرجة (0 = غير راضٍ، 10 = راضٍ جدًا)</label>
          <div style={styles.scoreGrid}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button key={n} style={{ ...styles.scoreBtn, ...(f.score === n ? { background: scoreColor(n), color: "#fff", borderColor: scoreColor(n) } : {}) }} onClick={() => set("score", n)} disabled={saving}>{n}</button>
            ))}
          </div>
          <div style={styles.scoreHint}>
            <span style={{ color: "#dc2626" }}>منتقد (0-6)</span>
            <span style={{ color: "#94a3b8" }}>محايد (7-8)</span>
            <span style={{ color: "#16a34a" }}>مروّج (9-10)</span>
          </div>
        </div>

        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الاستطلاع (اختياري)</label><input style={styles.input} value={f.surveyName} onChange={(e) => set("surveyName", e.target.value)} disabled={saving} placeholder="رضا الخدمة Q2" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>التاريخ</label><input style={styles.input} type="date" value={f.date} onChange={(e) => set("date", e.target.value)} disabled={saving} dir="ltr" /></div></div>
        </div>
        <div style={styles.field}><label style={styles.label}>تعليق العميل</label><textarea style={styles.textarea} value={f.comment} onChange={(e) => set("comment", e.target.value)} disabled={saving} rows={2} /></div>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "تسجيل"}</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#65a30d", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  addBtn: { padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#65a30d", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 5 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 28, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },
  kpiSub: { fontSize: 12, fontWeight: 700 },

  section: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 22px", marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a", margin: "0 0 16px" },

  distBar: { display: "flex", height: 36, borderRadius: 8, overflow: "hidden", background: "#f1f5f9", marginBottom: 14 },
  distSeg: { display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 800, minWidth: 0, transition: "width .3s" },
  distLegend: { display: "flex", gap: 18, flexWrap: "wrap" },
  legItem: { display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#475569", fontWeight: 600 },
  legDot: { width: 12, height: 12, borderRadius: 3, flexShrink: 0 },

  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" },

  trendChart: { display: "flex", gap: 10, alignItems: "flex-end", height: 160, paddingTop: 10 },
  trendCol: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" },
  trendBarWrap: { flex: 1, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" },
  trendBar: { width: "70%", maxWidth: 40, background: "linear-gradient(180deg, #84cc16, #65a30d)", borderRadius: "6px 6px 0 0", minHeight: 4 },
  trendVal: { fontSize: 12, fontWeight: 700, color: "#334155", fontFamily: "monospace" },
  trendMonth: { fontSize: 11, color: "#94a3b8", fontWeight: 600 },

  custList: { display: "flex", flexDirection: "column", gap: 14 },
  custItem: {},
  custTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 },
  custName: { fontSize: 14, fontWeight: 600, color: "#334155" },
  custScore: { fontSize: 14, fontWeight: 800, fontFamily: "monospace" },
  custBar: { height: 8, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" },
  custFill: { height: "100%", borderRadius: 999 },

  ratingList: { display: "flex", flexDirection: "column", gap: 10 },
  ratingCard: { display: "flex", gap: 14, alignItems: "flex-start", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" },
  ratingScore: { width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 17, fontWeight: 800, fontFamily: "monospace", flexShrink: 0 },
  ratingBody: { flex: 1, minWidth: 0 },
  ratingTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" },
  ratingCustomer: { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  ratingDate: { fontSize: 12, color: "#94a3b8", fontFamily: "monospace" },
  ratingSurvey: { fontSize: 12, color: "#65a30d", fontWeight: 600 },
  ratingComment: { fontSize: 13, color: "#64748b", fontStyle: "italic", marginTop: 4, lineHeight: 1.5 },
  delBtn: { padding: "6px 10px", fontSize: 12, background: "#fef2f2", border: "none", borderRadius: 7, cursor: "pointer", flexShrink: 0 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 14 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  row: { display: "flex", gap: 12 },
  scoreGrid: { display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: 5 },
  scoreBtn: { padding: "8px 0", fontSize: 14, fontWeight: 700, color: "#475569", background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" },
  scoreHint: { display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, fontWeight: 600 },
  modalActions: { display: "flex", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#65a30d", border: "none", borderRadius: 8, cursor: "pointer" },
};
