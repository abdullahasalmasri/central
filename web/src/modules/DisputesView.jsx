import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   المنازعات — قسم القانونية والامتثال
   إدارة القضايا والنزاعات مع القيمة المعرّضة ومعدل الكسب.
   getDisputes / createDispute / updateDispute / deleteDispute.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const TYPE_LABEL = { labor: "عمالية", commercial: "تجارية", contractual: "تعاقدية", other: "أخرى" };
const TYPE_ORDER = ["labor", "commercial", "contractual", "other"];
const STATUS_INFO = {
  review: { label: "قيد النظر", color: "#2563eb", bg: "#dbeafe" },
  settlement: { label: "تسوية", color: "#ea580c", bg: "#ffedd5" },
  ruling: { label: "حكم", color: "#7c3aed", bg: "#ede9fe" },
  closed: { label: "مغلقة", color: "#64748b", bg: "#f1f5f9" },
};
const STATUS_ORDER = ["review", "settlement", "ruling", "closed"];
const OUTCOME_LABEL = { won: "كسب ✓", lost: "خسارة ✕", settled: "تسوية" };
const OUTCOME_ORDER = ["won", "lost", "settled"];

export default function DisputesView() {
  const [tenantId, setTenantId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);

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
      const res = await httpsCallable(functions, "getDisputes")({});
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const s = data ? data.summary : { openCount: 0, totalCount: 0, valueAtRisk: 0, provisions: 0, winRate: 0, wonCount: 0, lostCount: 0 };
  const disputes = data ? data.disputes : [];
  const byType = data ? data.byType : [];
  const maxType = Math.max(1, ...byType.map((t) => t.count));

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>المنازعات</h1>
          <p style={styles.pageSub}>إدارة القضايا والنزاعات القانونية ومتابعتها.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setModal("new")}>+ قضية جديدة</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : !data ? (
        <div style={styles.warnBox}>تعذّر تحميل البيانات.</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>قضايا مفتوحة</span><span style={{ ...styles.kpiValue, color: "#78716c" }}>{s.openCount}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>القيمة المعرّضة</span><span style={{ ...styles.kpiValue, color: "#dc2626" }} dir="ltr">{fmt(s.valueAtRisk)}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>معدل الكسب</span><span style={{ ...styles.kpiValue, color: "#16a34a" }} dir="ltr">{fmt(s.winRate)}%</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>المخصّصات القانونية</span><span style={{ ...styles.kpiValue, color: "#2563eb" }} dir="ltr">{fmt(s.provisions)}</span></div>
          </div>

          <div style={styles.twoCol}>
            {/* القضايا */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>القضايا ({disputes.length})</h3>
              {disputes.length === 0 ? <p style={styles.muted}>لا توجد قضايا. أضف قضية جديدة.</p> : (
                <div style={styles.caseList}>
                  {disputes.map((c) => {
                    const st = STATUS_INFO[c.status] || STATUS_INFO.review;
                    return (
                      <div key={c.id} style={styles.caseCard}>
                        <div style={styles.cTop}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={styles.cNameRow}>
                              <span style={styles.cNum}>#{String(c.disputeNumber).padStart(4, "0")}</span>
                              <span style={styles.cName}>{c.name}</span>
                            </div>
                            {c.party ? <div style={styles.cParty}>⚖️ {c.party}</div> : null}
                          </div>
                          <span style={{ ...styles.chip, color: st.color, background: st.bg }}>{st.label}</span>
                        </div>
                        <div style={styles.cBody}>
                          <span style={styles.cTypeChip}>{TYPE_LABEL[c.type] || c.type}</span>
                          <span style={styles.cValue} dir="ltr">{fmt(c.value)} ﷼</span>
                          {c.provision > 0 ? <span style={styles.cProv}>مخصّص: <span dir="ltr">{fmt(c.provision)}</span></span> : null}
                          {c.outcome ? <span style={{ ...styles.cOutcome, color: c.outcome === "won" ? "#16a34a" : c.outcome === "lost" ? "#dc2626" : "#ea580c" }}>{OUTCOME_LABEL[c.outcome]}</span> : null}
                        </div>
                        <div style={styles.cActions}>
                          <button style={styles.editBtn} onClick={() => setModal({ edit: c })}>✏️ تعديل</button>
                          <DeleteBtn disputeId={c.id} name={c.name} onDone={loadData} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* الأنواع + معدل الكسب */}
            <div>
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>أنواع المنازعات</h3>
                {byType.length === 0 ? <p style={styles.muted}>لا توجد قضايا.</p> : (
                  <div style={styles.typeList}>
                    {byType.map((t) => (
                      <div key={t.type} style={styles.typeItem}>
                        <div style={styles.typeTop}>
                          <span style={styles.typeName}>{TYPE_LABEL[t.type] || t.type}</span>
                          <span style={styles.typeCount}>{t.count} ({t.pct}%)</span>
                        </div>
                        <div style={styles.typeBar}><div style={{ ...styles.typeFill, width: `${(t.count / maxType) * 100}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(s.wonCount + s.lostCount) > 0 ? (
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>سجل القضايا المغلقة</h3>
                  <div style={styles.recordRow}>
                    <div style={styles.recordItem}><span style={{ ...styles.recordVal, color: "#16a34a" }}>{s.wonCount}</span><span style={styles.recordLabel}>مكسوبة</span></div>
                    <div style={styles.recordItem}><span style={{ ...styles.recordVal, color: "#dc2626" }}>{s.lostCount}</span><span style={styles.recordLabel}>خاسرة</span></div>
                    <div style={styles.recordItem}><span style={{ ...styles.recordVal, color: "#2563eb" }} dir="ltr">{fmt(s.winRate)}%</span><span style={styles.recordLabel}>معدل الكسب</span></div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}

      {modal === "new" ? <DisputeModal onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.edit ? <DisputeModal dispute={modal.edit} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
    </div>
  );
}

function DeleteBtn({ disputeId, name, onDone }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm(`حذف قضية «${name}»؟`)) return;
    setBusy(true);
    try {
      await httpsCallable(functions, "deleteDispute")({ disputeId });
      onDone();
    } catch (e) { alert(e.message || "تعذّر الحذف."); setBusy(false); }
  }
  return <button style={styles.delBtn} onClick={del} disabled={busy}>{busy ? "..." : "🗑 حذف"}</button>;
}

function DisputeModal({ dispute, onClose, onSaved }) {
  const isEdit = !!dispute;
  const c = dispute || {};
  const [f, setF] = useState({
    name: c.name || "", party: c.party || "", type: c.type || "labor",
    value: c.value ? String(c.value) : "", provision: c.provision ? String(c.provision) : "",
    status: c.status || "review", outcome: c.outcome || "", openDate: c.openDate || "", notes: c.notes || "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const showOutcome = f.status === "closed";

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم القضية مطلوب."); return; }
    setSaving(true);
    try {
      const payload = {
        name: f.name.trim(), party: f.party.trim(), type: f.type,
        value: Number(f.value) || 0, provision: Number(f.provision) || 0,
        status: f.status, outcome: f.status === "closed" ? (f.outcome || null) : null,
        openDate: f.openDate, notes: f.notes.trim(),
      };
      if (isEdit) {
        await httpsCallable(functions, "updateDispute")({ disputeId: dispute.id, ...payload });
      } else {
        await httpsCallable(functions, "createDispute")(payload);
      }
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>{isEdit ? `تعديل قضية #${String(dispute.disputeNumber).padStart(4, "0")}` : "قضية جديدة"}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {err ? <div style={styles.error}>{err}</div> : null}

        <div style={styles.field}><label style={styles.label}>اسم القضية *</label><input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={saving} placeholder="نزاع مستحقات عامل" /></div>
        <div style={styles.field}><label style={styles.label}>الطرف الآخر</label><input style={styles.input} value={f.party} onChange={(e) => set("party", e.target.value)} disabled={saving} placeholder="اسم الطرف" /></div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>النوع</label>
            <select style={styles.input} value={f.type} onChange={(e) => set("type", e.target.value)} disabled={saving}>{TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
          </div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الحالة</label>
            <select style={styles.input} value={f.status} onChange={(e) => set("status", e.target.value)} disabled={saving}>{STATUS_ORDER.map((st) => <option key={st} value={st}>{STATUS_INFO[st].label}</option>)}</select>
          </div></div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>القيمة المعرّضة</label><input style={styles.input} type="number" min="0" value={f.value} onChange={(e) => set("value", e.target.value)} disabled={saving} dir="ltr" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>المخصّص القانوني</label><input style={styles.input} type="number" min="0" value={f.provision} onChange={(e) => set("provision", e.target.value)} disabled={saving} dir="ltr" /></div></div>
        </div>
        {showOutcome ? (
          <div style={styles.field}><label style={styles.label}>نتيجة القضية</label>
            <select style={styles.input} value={f.outcome} onChange={(e) => set("outcome", e.target.value)} disabled={saving}>
              <option value="">— اختر —</option>
              {OUTCOME_ORDER.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
            </select>
          </div>
        ) : null}
        <div style={styles.field}><label style={styles.label}>تاريخ الفتح</label><input style={styles.input} type="date" value={f.openDate} onChange={(e) => set("openDate", e.target.value)} disabled={saving} dir="ltr" /></div>
        <div style={styles.field}><label style={styles.label}>ملاحظات</label><textarea style={styles.textarea} value={f.notes} onChange={(e) => set("notes", e.target.value)} disabled={saving} rows={2} /></div>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : isEdit ? "حفظ" : "إضافة"}</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#78716c", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  addBtn: { padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#78716c", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 23, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  twoCol: { display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 18, alignItems: "start" },

  section: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 22px", marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a", margin: "0 0 16px" },

  caseList: { display: "flex", flexDirection: "column", gap: 12 },
  caseCard: { border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" },
  cTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  cNameRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cNum: { fontSize: 12, fontWeight: 800, color: "#94a3b8", fontFamily: "monospace" },
  cName: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  cParty: { fontSize: 13, color: "#64748b", marginTop: 4 },
  chip: { fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 12px", whiteSpace: "nowrap" },
  cBody: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 },
  cTypeChip: { fontSize: 12, color: "#78716c", background: "#f5f5f4", borderRadius: 6, padding: "3px 10px", fontWeight: 600 },
  cValue: { fontSize: 14, fontWeight: 800, color: "#dc2626", fontFamily: "monospace" },
  cProv: { fontSize: 12, color: "#2563eb" },
  cOutcome: { fontSize: 12, fontWeight: 700 },
  cActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  editBtn: { padding: "7px 14px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },
  delBtn: { padding: "7px 14px", fontSize: 13, fontWeight: 600, color: "#dc2626", background: "#fef2f2", border: "none", borderRadius: 7, cursor: "pointer" },

  typeList: { display: "flex", flexDirection: "column", gap: 14 },
  typeItem: {},
  typeTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 },
  typeName: { fontSize: 14, fontWeight: 700, color: "#334155" },
  typeCount: { fontSize: 13, color: "#64748b", fontWeight: 600, fontFamily: "monospace" },
  typeBar: { height: 8, background: "#f5f5f4", borderRadius: 999, overflow: "hidden" },
  typeFill: { height: "100%", background: "linear-gradient(90deg, #78716c, #a8a29e)", borderRadius: 999 },

  recordRow: { display: "flex", gap: 12, justifyContent: "space-around" },
  recordItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  recordVal: { fontSize: 24, fontWeight: 800, fontFamily: "monospace" },
  recordLabel: { fontSize: 12, color: "#94a3b8", fontWeight: 600 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  row: { display: "flex", gap: 12 },
  modalActions: { display: "flex", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#78716c", border: "none", borderRadius: 8, cursor: "pointer" },
};
