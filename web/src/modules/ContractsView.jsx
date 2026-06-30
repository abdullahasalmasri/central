import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   العقود — قسم القانونية والامتثال
   إدارة العقود مع تنبيه القريبة الانتهاء (خلال 30 يومًا).
   getContracts / createContract / updateContract / deleteContract.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const TYPE_LABEL = { supply: "توريد عمالة", service: "خدمة", rent: "إيجار", other: "أخرى" };
const TYPE_ORDER = ["supply", "service", "rent", "other"];
const STATUS_INFO = {
  draft: { label: "مسودّة", color: "#64748b", bg: "#f1f5f9" },
  active: { label: "نشط", color: "#16a34a", bg: "#dcfce7" },
  renewing: { label: "قيد التجديد", color: "#2563eb", bg: "#dbeafe" },
  expiring: { label: "ينتهي قريبًا", color: "#ea580c", bg: "#ffedd5" },
  expired: { label: "منتهٍ", color: "#dc2626", bg: "#fee2e2" },
  cancelled: { label: "ملغى", color: "#475569", bg: "#e2e8f0" },
};
const STATUS_ORDER = ["draft", "active", "renewing", "expired", "cancelled"];

export default function ContractsView() {
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
      const res = await httpsCallable(functions, "getContracts")({});
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const s = data ? data.summary : { activeCount: 0, totalValue: 0, expiringCount: 0, renewingCount: 0, totalCount: 0 };
  const contracts = data ? data.contracts : [];
  const byType = data ? data.byType : [];
  const renewals = data ? data.renewals : [];
  const maxType = Math.max(1, ...byType.map((t) => t.count));

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>العقود</h1>
          <p style={styles.pageSub}>إدارة عقود العملاء والموردين ومتابعة التجديد.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setModal("new")}>+ عقد جديد</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : !data ? (
        <div style={styles.warnBox}>تعذّر تحميل البيانات.</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>عقود نشطة</span><span style={{ ...styles.kpiValue, color: "#78716c" }}>{s.activeCount}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>القيمة الإجمالية</span><span style={{ ...styles.kpiValue, color: "#059669" }} dir="ltr">{fmt(s.totalValue)}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>تنتهي قريبًا</span><span style={{ ...styles.kpiValue, color: "#ea580c" }}>{s.expiringCount}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>قيد التجديد</span><span style={{ ...styles.kpiValue, color: "#2563eb" }}>{s.renewingCount}</span></div>
          </div>

          {/* تنبيه التجديد */}
          {renewals.length > 0 ? (
            <div style={styles.renewalBanner}>
              <div style={styles.renewalHead}>🔔 عقود تنتهي خلال ٣٠ يومًا ({renewals.length})</div>
              <div style={styles.renewalList}>
                {renewals.map((r) => (
                  <div key={r.id} style={styles.renewalItem}>
                    <div>
                      <span style={styles.renewalName}>{r.name}</span>
                      {r.party ? <span style={styles.renewalParty}> — {r.party}</span> : null}
                    </div>
                    <span style={{ ...styles.renewalDays, color: r.days <= 7 ? "#dc2626" : "#ea580c" }}>{r.days <= 0 ? "منتهٍ" : `${r.days} يوم`}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div style={styles.twoCol}>
            {/* العقود */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>كل العقود ({contracts.length})</h3>
              {contracts.length === 0 ? <p style={styles.muted}>لا توجد عقود. أضف عقدًا جديدًا.</p> : (
                <div style={styles.contractList}>
                  {contracts.map((c) => {
                    const st = STATUS_INFO[c.computedStatus] || STATUS_INFO.draft;
                    return (
                      <div key={c.id} style={styles.contractCard}>
                        <div style={styles.cTop}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={styles.cNameRow}>
                              <span style={styles.cNum}>#{String(c.contractNumber).padStart(4, "0")}</span>
                              <span style={styles.cName}>{c.name}</span>
                            </div>
                            {c.party ? <div style={styles.cParty}>🤝 {c.party}</div> : null}
                          </div>
                          <span style={{ ...styles.chip, color: st.color, background: st.bg }}>{st.label}</span>
                        </div>
                        <div style={styles.cBody}>
                          <span style={styles.cTypeChip}>{TYPE_LABEL[c.type] || c.type}</span>
                          <span style={styles.cValue} dir="ltr">{fmt(c.value)} ﷼</span>
                          {c.endDate ? <span style={styles.cEnd}>ينتهي: <span dir="ltr">{c.endDate}</span></span> : null}
                          {c.autoRenew ? <span style={styles.cRenew}>♻ تجديد تلقائي</span> : null}
                        </div>
                        <div style={styles.cActions}>
                          <button style={styles.editBtn} onClick={() => setModal({ edit: c })}>✏️ تعديل</button>
                          <DeleteBtn contractId={c.id} name={c.name} onDone={loadData} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* الأنواع */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>أنواع العقود</h3>
              {byType.length === 0 ? <p style={styles.muted}>لا توجد عقود نشطة.</p> : (
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
          </div>
        </>
      )}

      {modal === "new" ? <ContractModal onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.edit ? <ContractModal contract={modal.edit} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
    </div>
  );
}

function DeleteBtn({ contractId, name, onDone }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm(`حذف عقد «${name}»؟`)) return;
    setBusy(true);
    try {
      await httpsCallable(functions, "deleteContract")({ contractId });
      onDone();
    } catch (e) { alert(e.message || "تعذّر الحذف."); setBusy(false); }
  }
  return <button style={styles.delBtn} onClick={del} disabled={busy}>{busy ? "..." : "🗑 حذف"}</button>;
}

function ContractModal({ contract, onClose, onSaved }) {
  const isEdit = !!contract;
  const c = contract || {};
  const [f, setF] = useState({
    name: c.name || "", party: c.party || "", type: c.type || "supply",
    value: c.value ? String(c.value) : "", startDate: c.startDate || "", endDate: c.endDate || "",
    status: c.status || "active", autoRenew: !!c.autoRenew, notes: c.notes || "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم العقد مطلوب."); return; }
    setSaving(true);
    try {
      const payload = {
        name: f.name.trim(), party: f.party.trim(), type: f.type,
        value: Number(f.value) || 0, startDate: f.startDate, endDate: f.endDate,
        status: f.status, autoRenew: f.autoRenew, notes: f.notes.trim(),
      };
      if (isEdit) {
        await httpsCallable(functions, "updateContract")({ contractId: contract.id, ...payload });
      } else {
        await httpsCallable(functions, "createContract")(payload);
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
          <h2 style={styles.modalTitle}>{isEdit ? `تعديل عقد #${String(contract.contractNumber).padStart(4, "0")}` : "عقد جديد"}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {err ? <div style={styles.error}>{err}</div> : null}

        <div style={styles.field}><label style={styles.label}>اسم العقد *</label><input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={saving} placeholder="توريd عمالة فنية" /></div>
        <div style={styles.field}><label style={styles.label}>الطرف الآخر</label><input style={styles.input} value={f.party} onChange={(e) => set("party", e.target.value)} disabled={saving} placeholder="اسم العميل/المورد" /></div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>النوع</label>
            <select style={styles.input} value={f.type} onChange={(e) => set("type", e.target.value)} disabled={saving}>{TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
          </div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>القيمة</label><input style={styles.input} type="number" min="0" value={f.value} onChange={(e) => set("value", e.target.value)} disabled={saving} dir="ltr" /></div></div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>تاريخ البداية</label><input style={styles.input} type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} disabled={saving} dir="ltr" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>تاريخ النهاية</label><input style={styles.input} type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} disabled={saving} dir="ltr" /></div></div>
        </div>
        <div style={styles.field}><label style={styles.label}>الحالة</label>
          <select style={styles.input} value={f.status} onChange={(e) => set("status", e.target.value)} disabled={saving}>{STATUS_ORDER.map((st) => <option key={st} value={st}>{STATUS_INFO[st].label}</option>)}</select>
        </div>
        <label style={styles.checkRow}>
          <input type="checkbox" checked={f.autoRenew} onChange={(e) => set("autoRenew", e.target.checked)} disabled={saving} />
          <span>تجديد تلقائي عند الانتهاء</span>
        </label>
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

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 24, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  renewalBanner: { background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: "16px 20px", marginBottom: 18 },
  renewalHead: { fontSize: 14, fontWeight: 800, color: "#9a3412", marginBottom: 12 },
  renewalList: { display: "flex", flexDirection: "column", gap: 8 },
  renewalItem: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", borderRadius: 8, padding: "10px 14px", gap: 10 },
  renewalName: { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  renewalParty: { fontSize: 13, color: "#64748b" },
  renewalDays: { fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" },

  twoCol: { display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 18, alignItems: "start" },

  section: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 22px", marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a", margin: "0 0 16px" },

  contractList: { display: "flex", flexDirection: "column", gap: 12 },
  contractCard: { border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" },
  cTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  cNameRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cNum: { fontSize: 12, fontWeight: 800, color: "#94a3b8", fontFamily: "monospace" },
  cName: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  cParty: { fontSize: 13, color: "#64748b", marginTop: 4 },
  chip: { fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 12px", whiteSpace: "nowrap" },
  cBody: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 },
  cTypeChip: { fontSize: 12, color: "#78716c", background: "#f5f5f4", borderRadius: 6, padding: "3px 10px", fontWeight: 600 },
  cValue: { fontSize: 14, fontWeight: 800, color: "#059669", fontFamily: "monospace" },
  cEnd: { fontSize: 12, color: "#64748b" },
  cRenew: { fontSize: 12, color: "#2563eb", fontWeight: 600 },
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
  checkRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#334155", marginBottom: 12, cursor: "pointer" },
  modalActions: { display: "flex", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#78716c", border: "none", borderRadius: 8, cursor: "pointer" },
};
