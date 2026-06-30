import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   المبيعات المباشرة — قسم المبيعات والتسويق
   صفقات (عملاء محتملون) في خط أنابيب بمراحل + مندوبون.
   getSalesData / createDeal / updateDeal / deleteDeal.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const STAGE_INFO = {
  contact: { label: "تواصل أولي", color: "#60a5fa" },
  proposal: { label: "عرض", color: "#818cf8" },
  negotiation: { label: "تفاوض", color: "#fb923c" },
  closing: { label: "إغلاق", color: "#34d399" },
};
const STAGE_ORDER = ["contact", "proposal", "negotiation", "closing"];
const SOURCE_LABELS = { referral: "توصية", website: "الموقع", campaign: "حملة", cold: "تواصل بارد", existing: "عميل حالي", other: "أخرى" };

export default function SalesView() {
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
      const fn = httpsCallable(functions, "getSalesData");
      const res = await fn({});
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const s = data ? data.summary : { pipelineValue: 0, activeCount: 0, wonCount: 0, wonValue: 0, conversionRate: 0 };
  const pipeline = data ? data.pipeline : [];
  const deals = data ? data.deals : [];
  const reps = data ? data.reps : [];
  const maxPipe = Math.max(1, ...pipeline.map((p) => p.value));
  const maxRep = Math.max(1, ...reps.map((r) => r.value));

  async function quickUpdate(dealId, patch) {
    try {
      const fn = httpsCallable(functions, "updateDeal");
      await fn({ dealId, ...patch });
      loadData();
    } catch (e) { alert(e.message || "تعذّر التحديث."); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>المبيعات المباشرة</h1>
          <p style={styles.pageSub}>إدارة الصفقات والعملاء المحتملين عبر خط الأنابيب.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setModal("new")}>+ صفقة جديدة</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : !data ? (
        <div style={styles.warnBox}>تعذّر تحميل البيانات.</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>قيمة خط الأنابيب</span><span style={{ ...styles.kpiValue, color: "#db2777" }} dir="ltr">{fmt(s.pipelineValue)}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>صفقات نشطة</span><span style={styles.kpiValue}>{s.activeCount}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>صفقات مكسوبة</span><span style={{ ...styles.kpiValue, color: "#16a34a" }}>{s.wonCount}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>معدل التحويل</span><span style={{ ...styles.kpiValue, color: "#2563eb" }} dir="ltr">{fmt(s.conversionRate)}%</span></div>
          </div>

          {/* خط الأنابيب */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>خط الأنابيب</h3>
            <div style={styles.pipeline}>
              {pipeline.map((p) => (
                <div key={p.stage} style={styles.pipeStage}>
                  <div style={styles.pipeHead}>
                    <span style={{ ...styles.pipeDot, background: STAGE_INFO[p.stage].color }} />
                    <span style={styles.pipeLabel}>{STAGE_INFO[p.stage].label}</span>
                    <span style={styles.pipeCount}>{p.count}</span>
                  </div>
                  <div style={styles.pipeValue} dir="ltr">{fmt(p.value)}</div>
                  <div style={styles.pipeBar}><div style={{ ...styles.pipeFill, width: `${(p.value / maxPipe) * 100}%`, background: STAGE_INFO[p.stage].color }} /></div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.twoCol}>
            {/* الصفقات النشطة */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>الصفقات النشطة ({deals.length})</h3>
              {deals.length === 0 ? <p style={styles.muted}>لا توجد صفقات نشطة. أضف صفقة جديدة.</p> : (
                <div style={styles.dealList}>
                  {deals.map((d) => (
                    <div key={d.id} style={styles.dealCard}>
                      <div style={styles.dealTop}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={styles.dealName}>{d.name}</div>
                          {d.customerName ? <div style={styles.dealCustomer}>🏢 {d.customerName}</div> : null}
                        </div>
                        <span style={styles.dealValue} dir="ltr">{fmt(d.value)}</span>
                      </div>
                      <div style={styles.dealMeta}>
                        {d.rep ? <span style={styles.dealChip}>👤 {d.rep}</span> : null}
                        {d.source ? <span style={styles.dealChip}>{SOURCE_LABELS[d.source] || d.source}</span> : null}
                      </div>
                      <div style={styles.dealActions}>
                        <select style={{ ...styles.stageSelect, color: STAGE_INFO[d.stage].color }} value={d.stage} onChange={(e) => quickUpdate(d.id, { stage: e.target.value })}>
                          {STAGE_ORDER.map((st) => <option key={st} value={st}>{STAGE_INFO[st].label}</option>)}
                        </select>
                        <button style={styles.wonBtn} onClick={() => quickUpdate(d.id, { status: "won" })}>✓ فوز</button>
                        <button style={styles.lostBtn} onClick={() => quickUpdate(d.id, { status: "lost" })}>✕ خسارة</button>
                        <button style={styles.editBtn} onClick={() => setModal({ edit: d })}>✏️</button>
                        <DeleteBtn dealId={d.id} name={d.name} onDone={loadData} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* المندوبون */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>أداء المندوبين</h3>
              {reps.length === 0 ? <p style={styles.muted}>لا يوجد مندوبون بعد.</p> : (
                <div style={styles.repList}>
                  {reps.map((r, i) => (
                    <div key={i} style={styles.repItem}>
                      <div style={styles.repTop}>
                        <span style={styles.repName}>{r.name}</span>
                        <span style={styles.repValue} dir="ltr">{fmt(r.value)}</span>
                      </div>
                      <div style={styles.repBar}><div style={{ ...styles.repFill, width: `${(r.value / maxRep) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {modal === "new" ? <DealModal onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.edit ? <DealModal deal={modal.edit} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
    </div>
  );
}

function DeleteBtn({ dealId, name, onDone }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm(`حذف صفقة «${name}»؟`)) return;
    setBusy(true);
    try {
      const fn = httpsCallable(functions, "deleteDeal");
      await fn({ dealId });
      onDone();
    } catch (e) { alert(e.message || "تعذّر الحذف."); setBusy(false); }
  }
  return <button style={styles.delBtn} onClick={del} disabled={busy}>{busy ? "..." : "🗑"}</button>;
}

function DealModal({ deal, onClose, onSaved }) {
  const isEdit = !!deal;
  const d = deal || {};
  const [f, setF] = useState({
    name: d.name || "", customerName: d.customerName || "", contactPerson: d.contactPerson || "",
    contactPhone: d.contactPhone || "", value: d.value ? String(d.value) : "",
    stage: d.stage || "contact", rep: d.rep || "", source: d.source || "referral",
    expectedCloseDate: d.expectedCloseDate || "", notes: d.notes || "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم الصفقة مطلوب."); return; }
    setSaving(true);
    try {
      const payload = {
        name: f.name.trim(), customerName: f.customerName.trim(), contactPerson: f.contactPerson.trim(),
        contactPhone: f.contactPhone.trim(), value: Number(f.value) || 0, stage: f.stage,
        rep: f.rep.trim(), source: f.source, expectedCloseDate: f.expectedCloseDate, notes: f.notes.trim(),
      };
      if (isEdit) {
        await httpsCallable(functions, "updateDeal")({ dealId: deal.id, ...payload });
      } else {
        await httpsCallable(functions, "createDeal")(payload);
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
          <h2 style={styles.modalTitle}>{isEdit ? "تعديل الصفقة" : "صفقة جديدة"}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {err ? <div style={styles.error}>{err}</div> : null}

        <Field label="اسم الصفقة *"><input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={saving} placeholder="توريد عمالة — مشروع نيوم" /></Field>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><Field label="العميل / الشركة"><input style={styles.input} value={f.customerName} onChange={(e) => set("customerName", e.target.value)} disabled={saving} /></Field></div>
          <div style={{ flex: 1 }}><Field label="القيمة المتوقّعة"><input style={styles.input} type="number" min="0" value={f.value} onChange={(e) => set("value", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><Field label="الشخص المسؤول"><input style={styles.input} value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} disabled={saving} /></Field></div>
          <div style={{ flex: 1 }}><Field label="الجوال"><input style={styles.input} value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><Field label="المرحلة">
            <select style={styles.input} value={f.stage} onChange={(e) => set("stage", e.target.value)} disabled={saving}>
              {STAGE_ORDER.map((st) => <option key={st} value={st}>{STAGE_INFO[st].label}</option>)}
            </select>
          </Field></div>
          <div style={{ flex: 1 }}><Field label="المصدر">
            <select style={styles.input} value={f.source} onChange={(e) => set("source", e.target.value)} disabled={saving}>
              {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field></div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><Field label="المندوب"><input style={styles.input} value={f.rep} onChange={(e) => set("rep", e.target.value)} disabled={saving} /></Field></div>
          <div style={{ flex: 1 }}><Field label="تاريخ الإغلاق المتوقّع"><input style={styles.input} type="date" value={f.expectedCloseDate} onChange={(e) => set("expectedCloseDate", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
        </div>
        <Field label="ملاحظات"><textarea style={styles.textarea} value={f.notes} onChange={(e) => set("notes", e.target.value)} disabled={saving} rows={2} /></Field>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : isEdit ? "حفظ" : "إضافة"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) { return <div style={styles.field}><label style={styles.label}>{label}</label>{children}</div>; }

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#db2777", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  addBtn: { padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#db2777", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 24, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  section: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 22px", marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a", margin: "0 0 16px" },

  pipeline: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 },
  pipeStage: { background: "#f8fafc", borderRadius: 10, padding: "14px 16px" },
  pipeHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  pipeDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  pipeLabel: { fontSize: 13, fontWeight: 700, color: "#334155", flex: 1 },
  pipeCount: { fontSize: 12, fontWeight: 700, color: "#64748b", background: "#fff", borderRadius: 10, padding: "1px 9px", fontFamily: "monospace" },
  pipeValue: { fontSize: 18, fontWeight: 800, color: "#0f172a", fontFamily: "monospace", marginBottom: 8 },
  pipeBar: { height: 6, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" },
  pipeFill: { height: "100%", borderRadius: 999 },

  twoCol: { display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18, alignItems: "start" },

  dealList: { display: "flex", flexDirection: "column", gap: 12 },
  dealCard: { border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" },
  dealTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  dealName: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  dealCustomer: { fontSize: 13, color: "#64748b", marginTop: 3 },
  dealValue: { fontSize: 16, fontWeight: 800, color: "#db2777", fontFamily: "monospace", whiteSpace: "nowrap" },
  dealMeta: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 },
  dealChip: { fontSize: 12, color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "3px 10px" },
  dealActions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  stageSelect: { padding: "6px 10px", fontSize: 12, fontWeight: 700, border: "1px solid #cbd5e1", borderRadius: 7, fontFamily: "inherit", background: "#fff", cursor: "pointer" },
  wonBtn: { padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#16a34a", background: "#f0fdf4", border: "none", borderRadius: 7, cursor: "pointer" },
  lostBtn: { padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#dc2626", background: "#fef2f2", border: "none", borderRadius: 7, cursor: "pointer" },
  editBtn: { padding: "6px 10px", fontSize: 12, background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },
  delBtn: { padding: "6px 10px", fontSize: 12, background: "#fef2f2", border: "none", borderRadius: 7, cursor: "pointer" },

  repList: { display: "flex", flexDirection: "column", gap: 14 },
  repItem: {},
  repTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 },
  repName: { fontSize: 14, fontWeight: 600, color: "#334155" },
  repValue: { fontSize: 14, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" },
  repBar: { height: 8, background: "#fce7f3", borderRadius: 999, overflow: "hidden" },
  repFill: { height: "100%", background: "linear-gradient(90deg, #db2777, #f472b6)", borderRadius: 999 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  row: { display: "flex", gap: 12 },
  modalActions: { display: "flex", gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#db2777", border: "none", borderRadius: 8, cursor: "pointer" },
};
