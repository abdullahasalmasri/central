import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   الامتثال والتراخيص — قسم القانونية والامتثال
   تراخيص مع تنبيه انتهاء + قائمة متطلبات امتثال للسوق السعودي.
   getCompliance / createLicense / updateLicense / deleteLicense /
   setComplianceItem.
   ============================================================ */

const STATUS_INFO = {
  valid: { label: "ساري", color: "#16a34a", bg: "#dcfce7" },
  expiring: { label: "ينتهي قريبًا", color: "#ea580c", bg: "#ffedd5" },
  expired: { label: "منتهٍ", color: "#dc2626", bg: "#fee2e2" },
};

// متطلبات الامتثال للسوق السعودي (ثابتة)
const REQUIREMENTS = [
  { key: "cr", name: "السجل التجاري", note: "ساري المفعول" },
  { key: "zatca", name: "فوترة ZATCA", note: "فوترة إلكترونية معتمدة" },
  { key: "vat", name: "ضريبة القيمة المضافة", note: "إقرارات منتظمة" },
  { key: "gosi", name: "التأمينات (GOSI)", note: "اشتراكات محدّثة" },
  { key: "nitaqat", name: "نطاقات — السعودة", note: "النطاق الأخضر" },
  { key: "wps", name: "حماية الأجور (WPS)", note: "الرواتب عبر النظام" },
  { key: "mol", name: "رخصة مكتب العمل", note: "سارية ومحدّثة" },
  { key: "safety", name: "اشتراطات السلامة", note: "الدفاع المدني" },
];

export default function ComplianceView() {
  const [tenantId, setTenantId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [savingKey, setSavingKey] = useState("");

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
      const res = await httpsCallable(functions, "getCompliance")({});
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const s = data ? data.summary : { validCount: 0, expiringCount: 0, expiredCount: 0, totalCount: 0 };
  const licenses = data ? data.licenses : [];
  const renewals = data ? data.renewals : [];
  const cs = data ? data.complianceStatus : {};

  const metCount = REQUIREMENTS.filter((r) => cs[r.key] && cs[r.key].ok).length;
  const complianceRate = Math.round((metCount / REQUIREMENTS.length) * 100);

  async function toggleReq(key, currentOk) {
    setSavingKey(key);
    try {
      await httpsCallable(functions, "setComplianceItem")({ key, ok: !currentOk });
      setData((prev) => ({ ...prev, complianceStatus: { ...prev.complianceStatus, [key]: { ...(prev.complianceStatus[key] || {}), ok: !currentOk } } }));
    } catch (e) { alert(e.message || "تعذّر التحديث."); }
    finally { setSavingKey(""); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>الامتثال والتراخيص</h1>
          <p style={styles.pageSub}>متابعة التراخيص ومتطلبات الامتثال النظامية.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setModal("new")}>+ ترخيص جديد</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : !data ? (
        <div style={styles.warnBox}>تعذّر تحميل البيانات.</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>نسبة الامتثال</span><span style={{ ...styles.kpiValue, color: complianceRate >= 80 ? "#16a34a" : complianceRate >= 50 ? "#ea580c" : "#dc2626" }} dir="ltr">{complianceRate}%</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>تراخيص سارية</span><span style={{ ...styles.kpiValue, color: "#78716c" }}>{s.validCount}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>تنتهي قريبًا</span><span style={{ ...styles.kpiValue, color: "#ea580c" }}>{s.expiringCount}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>منتهية</span><span style={{ ...styles.kpiValue, color: "#dc2626" }}>{s.expiredCount}</span></div>
          </div>

          {/* تنبيه التجديد */}
          {renewals.length > 0 ? (
            <div style={styles.renewalBanner}>
              <div style={styles.renewalHead}>🔔 تراخيص تنتهي خلال ٣٠ يومًا ({renewals.length})</div>
              <div style={styles.renewalList}>
                {renewals.map((r) => (
                  <div key={r.id} style={styles.renewalItem}>
                    <div><span style={styles.renewalName}>{r.name}</span>{r.authority ? <span style={styles.renewalAuth}> — {r.authority}</span> : null}</div>
                    <span style={{ ...styles.renewalDays, color: r.days <= 7 ? "#dc2626" : "#ea580c" }}>{r.days <= 0 ? "منتهٍ" : `${r.days} يوم`}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div style={styles.twoCol}>
            {/* التراخيص */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>التراخيص والتصاريح ({licenses.length})</h3>
              {licenses.length === 0 ? <p style={styles.muted}>لا توجد تراخيص. أضف ترخيصًا جديدًا.</p> : (
                <div style={styles.licList}>
                  {licenses.map((l) => {
                    const st = STATUS_INFO[l.computedStatus] || STATUS_INFO.valid;
                    return (
                      <div key={l.id} style={styles.licCard}>
                        <div style={styles.lTop}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={styles.lName}>{l.name}</div>
                            {l.authority ? <div style={styles.lAuth}>🏛 {l.authority}</div> : null}
                          </div>
                          <span style={{ ...styles.chip, color: st.color, background: st.bg }}>{st.label}</span>
                        </div>
                        <div style={styles.lBody}>
                          {l.licenseNumber ? <span style={styles.lNum} dir="ltr">#{l.licenseNumber}</span> : null}
                          {l.endDate ? <span style={styles.lEnd}>ينتهي: <span dir="ltr">{l.endDate}</span></span> : null}
                        </div>
                        <div style={styles.lActions}>
                          <button style={styles.editBtn} onClick={() => setModal({ edit: l })}>✏️ تعديل</button>
                          <DeleteBtn licenseId={l.id} name={l.name} onDone={loadData} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* متطلبات الامتثال */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>متطلبات الامتثال</h3>
              <div style={styles.reqHint}>اضغط على المتطلب لتغيير حالته</div>
              <div style={styles.reqList}>
                {REQUIREMENTS.map((r) => {
                  const ok = !!(cs[r.key] && cs[r.key].ok);
                  return (
                    <button key={r.key} style={{ ...styles.reqItem, ...(ok ? styles.reqOk : {}) }} onClick={() => toggleReq(r.key, ok)} disabled={savingKey === r.key}>
                      <span style={{ ...styles.reqCheck, ...(ok ? { background: "#16a34a", borderColor: "#16a34a", color: "#fff" } : {}) }}>{ok ? "✓" : ""}</span>
                      <div style={styles.reqInfo}>
                        <span style={{ ...styles.reqName, color: ok ? "#166534" : "#334155" }}>{r.name}</span>
                        <span style={styles.reqNote}>{r.note}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {modal === "new" ? <LicenseModal onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.edit ? <LicenseModal license={modal.edit} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
    </div>
  );
}

function DeleteBtn({ licenseId, name, onDone }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm(`حذف ترخيص «${name}»؟`)) return;
    setBusy(true);
    try {
      await httpsCallable(functions, "deleteLicense")({ licenseId });
      onDone();
    } catch (e) { alert(e.message || "تعذّر الحذف."); setBusy(false); }
  }
  return <button style={styles.delBtn} onClick={del} disabled={busy}>{busy ? "..." : "🗑 حذف"}</button>;
}

function LicenseModal({ license, onClose, onSaved }) {
  const isEdit = !!license;
  const l = license || {};
  const [f, setF] = useState({
    name: l.name || "", licenseNumber: l.licenseNumber || "", authority: l.authority || "",
    issueDate: l.issueDate || "", endDate: l.endDate || "", notes: l.notes || "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم الترخيص مطلوب."); return; }
    setSaving(true);
    try {
      const payload = {
        name: f.name.trim(), licenseNumber: f.licenseNumber.trim(), authority: f.authority.trim(),
        issueDate: f.issueDate, endDate: f.endDate, notes: f.notes.trim(),
      };
      if (isEdit) {
        await httpsCallable(functions, "updateLicense")({ licenseId: license.id, ...payload });
      } else {
        await httpsCallable(functions, "createLicense")(payload);
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
          <h2 style={styles.modalTitle}>{isEdit ? "تعديل الترخيص" : "ترخيص جديد"}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {err ? <div style={styles.error}>{err}</div> : null}

        <div style={styles.field}><label style={styles.label}>اسم الترخيص *</label><input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={saving} placeholder="السجل التجاري" /></div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>رقم الترخيص</label><input style={styles.input} value={f.licenseNumber} onChange={(e) => set("licenseNumber", e.target.value)} disabled={saving} dir="ltr" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الجهة المصدرة</label><input style={styles.input} value={f.authority} onChange={(e) => set("authority", e.target.value)} disabled={saving} placeholder="وزارة التجارة" /></div></div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>تاريخ الإصدار</label><input style={styles.input} type="date" value={f.issueDate} onChange={(e) => set("issueDate", e.target.value)} disabled={saving} dir="ltr" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>تاريخ الانتهاء</label><input style={styles.input} type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} disabled={saving} dir="ltr" /></div></div>
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
  renewalAuth: { fontSize: 13, color: "#64748b" },
  renewalDays: { fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" },

  twoCol: { display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18, alignItems: "start" },

  section: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 22px", marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a", margin: "0 0 16px" },

  licList: { display: "flex", flexDirection: "column", gap: 12 },
  licCard: { border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" },
  lTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  lName: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  lAuth: { fontSize: 13, color: "#64748b", marginTop: 4 },
  chip: { fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 12px", whiteSpace: "nowrap" },
  lBody: { display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 12 },
  lNum: { fontSize: 12, color: "#78716c", background: "#f5f5f4", borderRadius: 6, padding: "3px 10px", fontFamily: "monospace", fontWeight: 600 },
  lEnd: { fontSize: 12, color: "#64748b" },
  lActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  editBtn: { padding: "7px 14px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },
  delBtn: { padding: "7px 14px", fontSize: 13, fontWeight: 600, color: "#dc2626", background: "#fef2f2", border: "none", borderRadius: 7, cursor: "pointer" },

  reqHint: { fontSize: 12, color: "#94a3b8", marginBottom: 12 },
  reqList: { display: "flex", flexDirection: "column", gap: 8 },
  reqItem: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "right", width: "100%" },
  reqOk: { background: "#f0fdf4", borderColor: "#bbf7d0" },
  reqCheck: { width: 22, height: 22, borderRadius: 6, border: "2px solid #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 },
  reqInfo: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  reqName: { fontSize: 14, fontWeight: 700 },
  reqNote: { fontSize: 12, color: "#94a3b8" },

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
