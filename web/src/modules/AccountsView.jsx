import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";
import { exportToExcel, exportToPDF, datedFileName } from "../exportUtils";

/* ============================================================
   دليل الحسابات (المحاسبة) — قسم المالية
   منقولة من النظام القديم (AccountsTab) إلى الـ Shell الجديد.
   تجلب tenantId واسم المنشأة بنفسها، ثم تقرأ الحسابات من Firestore.
   الإنشاء والإضافة عبر Cloud Functions (seedChartOfAccounts / createAccount).
   ============================================================ */

const ACCOUNT_TYPES = [
  { id: "asset", label: "الأصول", color: "#2563eb", range: "1000-1999" },
  { id: "liability", label: "الخصوم", color: "#dc2626", range: "2000-2999" },
  { id: "equity", label: "حقوق الملكية", color: "#7c3aed", range: "3000-3999" },
  { id: "revenue", label: "الإيرادات", color: "#16a34a", range: "4000-4999" },
  { id: "expense", label: "المصروفات", color: "#ea580c", range: "5000-5999" },
];

const SUBTYPE_LABELS = {
  current_asset: "متداول", non_current_asset: "غير متداول",
  current_liability: "متداول", non_current_liability: "غير متداول",
  equity: "حقوق ملكية",
  operating_revenue: "تشغيلي", non_operating_revenue: "غير تشغيلي",
  cogs: "تكلفة مبيعات", operating_expense: "تشغيلي", non_operating_expense: "غير تشغيلي",
};

export default function AccountsView() {
  const [tenantId, setTenantId] = useState("");
  const [companyName, setCompanyName] = useState("الشركة");
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // 1) جلب هوية المستخدم (tenantId واسم المنشأة) عند فتح الواجهة
  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) { setError("لم يتم تسجيل الدخول."); setLoading(false); return; }
        const userSnap = await getDoc(doc(db, "users", uid));
        const tid = userSnap.exists() ? userSnap.data().tenantId : null;
        if (!tid) { setError("تعذّر تحديد المنشأة لهذا المستخدم."); setLoading(false); return; }
        try {
          const tSnap = await getDoc(doc(db, "tenants", tid));
          if (tSnap.exists() && tSnap.data().name) setCompanyName(tSnap.data().name);
        } catch (e) { /* اسم المنشأة اختياري */ }
        setTenantId(tid);
      } catch (e) {
        setError("تعذّر تحميل بيانات المستخدم.");
        setLoading(false);
      }
    })();
  }, []);

  // 2) عند توفّر tenantId، حمّل الحسابات
  useEffect(() => {
    if (tenantId) loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function loadAccounts() {
    setLoading(true);
    setError("");
    try {
      const snap = await getDocs(query(collection(db, "accounts"), where("tenantId", "==", tenantId)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
      setAccounts(list);
    } catch (err) {
      setError("تعذّر تحميل دليل الحسابات.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "seedChartOfAccounts");
      await fn({});
      await loadAccounts();
    } catch (err) {
      setError(err.message || "تعذّر إنشاء الدليل الافتراضي.");
    } finally {
      setSeeding(false);
    }
  }

  const accountsByType = (typeId) => accounts.filter((a) => a.type === typeId);
  const typeLabel = (id) => { const t = ACCOUNT_TYPES.find((x) => x.id === id); return t ? t.label : id; };

  function buildRows() {
    return accounts.map((a) => ({
      code: a.code, name: a.name, type: typeLabel(a.type),
      subtype: SUBTYPE_LABELS[a.subtype] || "", balance: a.balance != null ? a.balance : 0,
    }));
  }
  const exportColumns = [
    { key: "code", header: "رقم الحساب" }, { key: "name", header: "اسم الحساب" },
    { key: "type", header: "النوع" }, { key: "subtype", header: "التصنيف" }, { key: "balance", header: "الرصيد" },
  ];
  const exportExcel = () => exportToExcel({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("دليل-الحسابات"), sheetName: "دليل الحسابات" });
  const exportPDF = () => exportToPDF({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("دليل-الحسابات"), header: { companyName, title: "دليل الحسابات", subtitle: "وفق معايير IFRS" } });

  return (
    <div style={styles.page}>
      <div style={styles.pageHead}>
        <h1 style={styles.pageTitle}>دليل الحسابات</h1>
        <p style={styles.pageSub}>الحسابات المحاسبية لمنشأتك · متوافق مع معايير IFRS</p>
      </div>

      {loading ? (
        <p style={styles.muted}>جارٍ التحميل...</p>
      ) : accounts.length === 0 ? (
        <>
          {error ? <div style={styles.error}>{error}</div> : null}
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📒</div>
            <h2 style={styles.emptyTitle}>لم يُنشأ دليل الحسابات بعد</h2>
            <p style={styles.emptyDesc}>ابدأ بدليل حسابات افتراضي متوافق مع معايير IFRS (١٩ حسابًا أساسيًا)، ثم عدّل وأضف حسب احتياج منشأتك.</p>
            <button style={styles.seedBtn} onClick={handleSeed} disabled={seeding}>
              {seeding ? "جارٍ الإنشاء..." : "🚀 إنشاء الدليل الافتراضي (IFRS)"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={styles.toolbar}>
            <span style={styles.summaryText}>{accounts.length} حساب · متوافق مع IFRS</span>
            <div style={styles.toolBtns}>
              <button style={styles.pdfBtn} onClick={exportPDF}>⬇ PDF</button>
              <button style={styles.exportBtn} onClick={exportExcel}>⬇ Excel</button>
              <button style={styles.addBtn} onClick={() => setShowAddForm(true)}>+ إضافة حساب</button>
            </div>
          </div>

          {error ? <div style={styles.error}>{error}</div> : null}

          <div style={styles.groups}>
            {ACCOUNT_TYPES.map((type) => {
              const list = accountsByType(type.id);
              if (list.length === 0) return null;
              return (
                <div key={type.id} style={styles.group}>
                  <div style={{ ...styles.groupHead, borderRightColor: type.color }}>
                    <span style={{ ...styles.groupTitle, color: type.color }}>{type.label}</span>
                    <span style={styles.groupRange}>{type.range}</span>
                    <span style={styles.groupCount}>{list.length}</span>
                  </div>
                  <table style={styles.table}>
                    <tbody>
                      {list.map((acc) => (
                        <tr key={acc.id}>
                          <td style={styles.tdCode} dir="ltr">{acc.code}</td>
                          <td style={styles.tdName}>
                            {acc.name}
                            {acc.isSystem ? <span style={styles.sysTag}>أساسي</span> : null}
                          </td>
                          <td style={styles.tdSubtype}>{SUBTYPE_LABELS[acc.subtype] || "—"}</td>
                          <td style={styles.tdBalance} dir="ltr">{(acc.balance || 0).toLocaleString()} ﷼</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showAddForm ? (
        <AccountForm onClose={() => setShowAddForm(false)} onSaved={() => { setShowAddForm(false); loadAccounts(); }} />
      ) : null}
    </div>
  );
}

// ═══ نموذج إضافة حساب ═══
function AccountForm({ onClose, onSaved }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [subtype, setSubtype] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const subtypesByType = {
    asset: [{ id: "current_asset", label: "متداول" }, { id: "non_current_asset", label: "غير متداول" }],
    liability: [{ id: "current_liability", label: "متداول" }, { id: "non_current_liability", label: "غير متداول" }],
    equity: [{ id: "equity", label: "حقوق ملكية" }],
    revenue: [{ id: "operating_revenue", label: "تشغيلي" }, { id: "non_operating_revenue", label: "غير تشغيلي" }],
    expense: [{ id: "cogs", label: "تكلفة مبيعات" }, { id: "operating_expense", label: "تشغيلي" }, { id: "non_operating_expense", label: "غير تشغيلي" }],
  };
  const availableSubtypes = type ? (subtypesByType[type] || []) : [];

  async function save() {
    setErr("");
    if (!/^\d{3,6}$/.test(code.trim())) { setErr("رقم الحساب يجب أن يكون من 3 إلى 6 أرقام."); return; }
    if (name.trim().length < 2) { setErr("اسم الحساب مطلوب."); return; }
    if (!type) { setErr("اختر نوع الحساب."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createAccount");
      await fn({ code: code.trim(), name: name.trim(), type, subtype });
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
          <h2 style={styles.modalTitle}>إضافة حساب</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>رقم الحساب *</label>
            <input style={styles.input} value={code} onChange={(e) => setCode(e.target.value)} placeholder="1400" disabled={saving} dir="ltr" />
          </div>
          <div style={{ flex: 2 }}>
            <label style={styles.label}>اسم الحساب *</label>
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: سلف الموظفين" disabled={saving} />
          </div>
        </div>
        <label style={styles.label}>نوع الحساب *</label>
        <div style={styles.typeGrid}>
          {ACCOUNT_TYPES.map((t) => (
            <button key={t.id} type="button" onClick={() => { setType(t.id); setSubtype(""); }} disabled={saving}
              style={{ ...styles.typeOption, ...(type === t.id ? { background: t.color, color: "#fff", borderColor: t.color } : {}) }}>
              {t.label}
              <span style={styles.typeRange}>{t.range}</span>
            </button>
          ))}
        </div>
        {availableSubtypes.length > 0 ? (
          <>
            <label style={styles.label}>التصنيف</label>
            <select style={styles.input} value={subtype} onChange={(e) => setSubtype(e.target.value)} disabled={saving}>
              <option value="">— اختر —</option>
              {availableSubtypes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </>
        ) : null}
        {err ? <div style={styles.error}>{err}</div> : null}
        <button style={styles.save} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ الحساب"}</button>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif", direction: "rtl" },
  pageHead: { marginBottom: 20 },
  pageTitle: { margin: 0, fontSize: 23, fontWeight: 700, color: "#059669", letterSpacing: "-.4px" },
  pageSub: { margin: "4px 0 0", fontSize: 13, color: "#5a6580" },

  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 },
  summaryText: { fontSize: 14, color: "#15803d", fontWeight: 600 },
  toolBtns: { display: "flex", gap: 8 },
  pdfBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer" },
  exportBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "none", borderRadius: 8, cursor: "pointer" },
  addBtn: { padding: "9px 16px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" },

  emptyState: { textAlign: "center", padding: "60px 24px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { margin: "0 0 12px", fontSize: 20, color: "#0f172a" },
  emptyDesc: { margin: "0 auto 24px", fontSize: 15, color: "#64748b", maxWidth: 480, lineHeight: 1.7 },
  seedBtn: { padding: "14px 28px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#059669", border: "none", borderRadius: 10, cursor: "pointer" },

  groups: { display: "flex", flexDirection: "column", gap: 20 },
  group: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" },
  groupHead: { display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "#f8fafc", borderRight: "4px solid", borderBottom: "1px solid #e2e8f0" },
  groupTitle: { fontSize: 16, fontWeight: 700 },
  groupRange: { fontSize: 12, color: "#94a3b8", fontFamily: "monospace" },
  groupCount: { marginRight: "auto", fontSize: 13, color: "#64748b", background: "#e2e8f0", padding: "2px 10px", borderRadius: 12, fontWeight: 600 },
  table: { width: "100%", borderCollapse: "collapse" },
  tdCode: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#475569", fontFamily: "monospace", width: 80, borderBottom: "1px solid #f1f5f9" },
  tdName: { padding: "10px 12px", fontSize: 14, borderBottom: "1px solid #f1f5f9" },
  tdSubtype: { padding: "10px 12px", fontSize: 12, color: "#94a3b8", borderBottom: "1px solid #f1f5f9" },
  tdBalance: { padding: "10px 18px", fontSize: 14, color: "#0f172a", textAlign: "left", borderBottom: "1px solid #f1f5f9" },
  sysTag: { marginRight: 8, fontSize: 10, color: "#16a34a", background: "#dcfce7", padding: "1px 7px", borderRadius: 8, fontWeight: 600 },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modal: { width: "100%", maxWidth: 540, background: "#fff", borderRadius: 12, padding: 28, direction: "rtl", textAlign: "right", maxHeight: "90vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  label: { display: "block", margin: "14px 0 6px", fontSize: 14, fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  row: { display: "flex", gap: 12 },
  typeGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8 },
  typeOption: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 8px", fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: "pointer", border: "1px solid #cbd5e1", background: "#fff", color: "#475569" },
  typeRange: { fontSize: 9, opacity: 0.7, fontFamily: "monospace" },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  save: { width: "100%", marginTop: 20, padding: "12px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" },
  muted: { color: "#94a3b8", fontSize: 14 },
};
