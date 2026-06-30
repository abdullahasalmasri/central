import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   التسويق والتواصل — قسم المبيعات والتسويق
   حملات تسويقية (قناة، وصول، عملاء، ميزانية) + تحليل القنوات.
   getMarketingData / createCampaign / updateCampaign / deleteCampaign.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const STATUS_INFO = {
  planned: { label: "مخطّطة", color: "#64748b", bg: "#f1f5f9" },
  active: { label: "نشطة", color: "#16a34a", bg: "#dcfce7" },
  ended: { label: "منتهية", color: "#92400e", bg: "#fef3c7" },
};
const STATUS_ORDER = ["planned", "active", "ended"];

export default function MarketingView() {
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
      const fn = httpsCallable(functions, "getMarketingData");
      const res = await fn({});
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const s = data ? data.summary : { totalReach: 0, totalLeads: 0, totalSpent: 0, totalBudget: 0, activeCount: 0, costPerLead: 0 };
  const campaigns = data ? data.campaigns : [];
  const byChannel = data ? data.byChannel : [];
  const maxLeads = Math.max(1, ...byChannel.map((c) => c.leads));
  const budgetPct = s.totalBudget > 0 ? Math.min(100, Math.round((s.totalSpent / s.totalBudget) * 100)) : 0;

  async function changeStatus(campaignId, status) {
    try {
      await httpsCallable(functions, "updateCampaign")({ campaignId, status });
      loadData();
    } catch (e) { alert(e.message || "تعذّر التحديث."); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>التسويق والتواصل</h1>
          <p style={styles.pageSub}>إدارة الحملات التسويقية وتحليل القنوات.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setModal("new")}>+ حملة جديدة</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : !data ? (
        <div style={styles.warnBox}>تعذّر تحميل البيانات.</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>الوصول</span><span style={{ ...styles.kpiValue, color: "#db2777" }} dir="ltr">{fmt(s.totalReach)}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>عملاء محتملون</span><span style={{ ...styles.kpiValue, color: "#16a34a" }}>{s.totalLeads}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>المصروف</span><span style={{ ...styles.kpiValue, color: "#ea580c" }} dir="ltr">{fmt(s.totalSpent)}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>تكلفة العميل</span><span style={styles.kpiValue} dir="ltr">{fmt(s.costPerLead)}</span></div>
          </div>

          {/* الميزانية */}
          {s.totalBudget > 0 ? (
            <div style={styles.budgetCard}>
              <div style={styles.budgetHead}>
                <span style={styles.budgetTitle}>الميزانية: <span dir="ltr">{fmt(s.totalSpent)}</span> من <span dir="ltr">{fmt(s.totalBudget)}</span></span>
                <span style={{ ...styles.budgetPct, color: budgetPct > 90 ? "#dc2626" : "#db2777" }}>{budgetPct}%</span>
              </div>
              <div style={styles.budgetBar}><div style={{ ...styles.budgetFill, width: `${budgetPct}%`, background: budgetPct > 90 ? "#dc2626" : "#db2777" }} /></div>
            </div>
          ) : null}

          <div style={styles.twoCol}>
            {/* الحملات */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>الحملات ({campaigns.length})</h3>
              {campaigns.length === 0 ? <p style={styles.muted}>لا توجد حملات. أضف حملة جديدة.</p> : (
                <div style={styles.campList}>
                  {campaigns.map((c) => {
                    const st = STATUS_INFO[c.status] || STATUS_INFO.planned;
                    return (
                      <div key={c.id} style={styles.campCard}>
                        <div style={styles.campTop}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={styles.campName}>{c.name}</div>
                            {c.channel ? <span style={styles.channelChip}>{c.channel}</span> : null}
                          </div>
                          <span style={{ ...styles.statusChip, color: st.color, background: st.bg }}>{st.label}</span>
                        </div>
                        <div style={styles.campStats}>
                          <div style={styles.statItem}><span style={styles.statLabel}>الوصول</span><span style={styles.statVal} dir="ltr">{fmt(c.reach)}</span></div>
                          <div style={styles.statItem}><span style={styles.statLabel}>عملاء</span><span style={{ ...styles.statVal, color: "#16a34a" }}>{c.leads}</span></div>
                          <div style={styles.statItem}><span style={styles.statLabel}>المصروف</span><span style={styles.statVal} dir="ltr">{fmt(c.spent)}</span></div>
                        </div>
                        <div style={styles.campActions}>
                          <select style={styles.statusSelect} value={c.status} onChange={(e) => changeStatus(c.id, e.target.value)}>
                            {STATUS_ORDER.map((st2) => <option key={st2} value={st2}>{STATUS_INFO[st2].label}</option>)}
                          </select>
                          <button style={styles.editBtn} onClick={() => setModal({ edit: c })}>✏️</button>
                          <DeleteBtn campaignId={c.id} name={c.name} onDone={loadData} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* القنوات */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>أداء القنوات</h3>
              {byChannel.length === 0 ? <p style={styles.muted}>لا توجد بيانات قنوات.</p> : (
                <div style={styles.chList}>
                  {byChannel.map((ch, i) => (
                    <div key={i} style={styles.chItem}>
                      <div style={styles.chTop}>
                        <span style={styles.chName}>{ch.channel}</span>
                        <span style={styles.chLeads}>{ch.leads} عميل</span>
                      </div>
                      <div style={styles.chBar}><div style={{ ...styles.chFill, width: `${(ch.leads / maxLeads) * 100}%` }} /></div>
                      <div style={styles.chMeta}>
                        <span>الوصول: <span dir="ltr">{fmt(ch.reach)}</span></span>
                        {ch.costPerLead > 0 ? <span>تكلفة العميل: <span dir="ltr">{fmt(ch.costPerLead)}</span></span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {modal === "new" ? <CampaignModal onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.edit ? <CampaignModal campaign={modal.edit} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
    </div>
  );
}

function DeleteBtn({ campaignId, name, onDone }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm(`حذف حملة «${name}»؟`)) return;
    setBusy(true);
    try {
      await httpsCallable(functions, "deleteCampaign")({ campaignId });
      onDone();
    } catch (e) { alert(e.message || "تعذّر الحذف."); setBusy(false); }
  }
  return <button style={styles.delBtn} onClick={del} disabled={busy}>{busy ? "..." : "🗑"}</button>;
}

function CampaignModal({ campaign, onClose, onSaved }) {
  const isEdit = !!campaign;
  const c = campaign || {};
  const [f, setF] = useState({
    name: c.name || "", channel: c.channel || "", status: c.status || "planned",
    budget: c.budget ? String(c.budget) : "", spent: c.spent ? String(c.spent) : "",
    leads: c.leads ? String(c.leads) : "", reach: c.reach ? String(c.reach) : "",
    startDate: c.startDate || "", endDate: c.endDate || "", notes: c.notes || "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم الحملة مطلوب."); return; }
    setSaving(true);
    try {
      const payload = {
        name: f.name.trim(), channel: f.channel.trim(), status: f.status,
        budget: Number(f.budget) || 0, spent: Number(f.spent) || 0,
        leads: Number(f.leads) || 0, reach: Number(f.reach) || 0,
        startDate: f.startDate, endDate: f.endDate, notes: f.notes.trim(),
      };
      if (isEdit) {
        await httpsCallable(functions, "updateCampaign")({ campaignId: campaign.id, ...payload });
      } else {
        await httpsCallable(functions, "createCampaign")(payload);
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
          <h2 style={styles.modalTitle}>{isEdit ? "تعديل الحملة" : "حملة جديدة"}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {err ? <div style={styles.error}>{err}</div> : null}

        <div style={styles.field}><label style={styles.label}>اسم الحملة *</label><input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={saving} placeholder="حملة لينكدإن للتوظيف" /></div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>القناة</label><input style={styles.input} value={f.channel} onChange={(e) => set("channel", e.target.value)} disabled={saving} placeholder="لينكدإن، جوجل، فعالية..." /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الحالة</label>
            <select style={styles.input} value={f.status} onChange={(e) => set("status", e.target.value)} disabled={saving}>
              {STATUS_ORDER.map((st) => <option key={st} value={st}>{STATUS_INFO[st].label}</option>)}
            </select>
          </div></div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الميزانية</label><input style={styles.input} type="number" min="0" value={f.budget} onChange={(e) => set("budget", e.target.value)} disabled={saving} dir="ltr" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>المصروف</label><input style={styles.input} type="number" min="0" value={f.spent} onChange={(e) => set("spent", e.target.value)} disabled={saving} dir="ltr" /></div></div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الوصول</label><input style={styles.input} type="number" min="0" value={f.reach} onChange={(e) => set("reach", e.target.value)} disabled={saving} dir="ltr" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>عملاء محتملون</label><input style={styles.input} type="number" min="0" value={f.leads} onChange={(e) => set("leads", e.target.value)} disabled={saving} dir="ltr" /></div></div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>تاريخ البداية</label><input style={styles.input} type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} disabled={saving} dir="ltr" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>تاريخ النهاية</label><input style={styles.input} type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} disabled={saving} dir="ltr" /></div></div>
        </div>
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
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#db2777", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  addBtn: { padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#db2777", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 24, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  budgetCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", marginBottom: 18 },
  budgetHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  budgetTitle: { fontSize: 14, fontWeight: 700, color: "#334155" },
  budgetPct: { fontSize: 18, fontWeight: 800, fontFamily: "monospace" },
  budgetBar: { height: 10, background: "#fce7f3", borderRadius: 999, overflow: "hidden" },
  budgetFill: { height: "100%", borderRadius: 999 },

  twoCol: { display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18, alignItems: "start" },

  section: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 22px", marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a", margin: "0 0 16px" },

  campList: { display: "flex", flexDirection: "column", gap: 12 },
  campCard: { border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" },
  campTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  campName: { fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 6 },
  channelChip: { fontSize: 12, color: "#db2777", background: "#fce7f3", borderRadius: 6, padding: "2px 10px", fontWeight: 600 },
  statusChip: { fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 12px", whiteSpace: "nowrap" },
  campStats: { display: "flex", gap: 20, marginBottom: 12, flexWrap: "wrap" },
  statItem: { display: "flex", flexDirection: "column", gap: 3 },
  statLabel: { fontSize: 11, color: "#94a3b8", fontWeight: 600 },
  statVal: { fontSize: 15, fontWeight: 700, color: "#334155", fontFamily: "monospace" },
  campActions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  statusSelect: { padding: "6px 10px", fontSize: 12, fontWeight: 700, border: "1px solid #cbd5e1", borderRadius: 7, fontFamily: "inherit", background: "#fff", cursor: "pointer" },
  editBtn: { padding: "6px 10px", fontSize: 12, background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },
  delBtn: { padding: "6px 10px", fontSize: 12, background: "#fef2f2", border: "none", borderRadius: 7, cursor: "pointer" },

  chList: { display: "flex", flexDirection: "column", gap: 16 },
  chItem: {},
  chTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 },
  chName: { fontSize: 14, fontWeight: 700, color: "#334155" },
  chLeads: { fontSize: 13, fontWeight: 700, color: "#16a34a" },
  chBar: { height: 8, background: "#fce7f3", borderRadius: 999, overflow: "hidden", marginBottom: 7 },
  chFill: { height: "100%", background: "linear-gradient(90deg, #db2777, #f472b6)", borderRadius: 999 },
  chMeta: { display: "flex", gap: 16, fontSize: 12, color: "#94a3b8", flexWrap: "wrap" },

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
  modalActions: { display: "flex", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#db2777", border: "none", borderRadius: 8, cursor: "pointer" },
};
