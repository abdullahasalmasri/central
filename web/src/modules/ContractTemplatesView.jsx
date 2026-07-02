import { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

/* ============================================================
   قوالب العقود القابلة لإعادة الاستخدام (١)
   إنشاء/تعديل قوالب نصّية ببنود ومتغيّرات {key} تُعبّأ تلقائيًا
   عند إصدار العقد من مشروع.
   ============================================================ */

// المتغيّرات المتاحة (تُعبّأ من بيانات الشركة/العميل/العرض)
const VARS = [
  { key: "company_name", label: "اسم الشركة" },
  { key: "company_tax", label: "ضريبي الشركة" },
  { key: "company_cr", label: "سجل الشركة" },
  { key: "client_name", label: "اسم العميل" },
  { key: "client_tax", label: "ضريبي العميل" },
  { key: "client_cr", label: "سجل العميل" },
  { key: "quote_number", label: "رقم العرض" },
  { key: "po_number", label: "رقم أمر الشراء" },
  { key: "start_date", label: "تاريخ البداية" },
  { key: "end_date", label: "تاريخ النهاية" },
  { key: "total_value", label: "القيمة الإجمالية" },
  { key: "project_name", label: "اسم المشروع" },
  { key: "today", label: "تاريخ اليوم" },
];

const SAMPLE = `بموجب هذا العقد المبرم بتاريخ {today}، يلتزم الطرف الأول ({company_name}) بتوريد العمالة للطرف الثاني ({client_name}) وفق الشروط التالية:

أولًا: مدة العقد من {start_date} إلى {end_date}.
ثانيًا: القيمة الإجمالية {total_value} ريال سعودي.
ثالثًا: يستند هذا العقد إلى عرض السعر رقم {quote_number} وأمر الشراء رقم {po_number}.
رابعًا: يلتزم الطرف الأول بتوفير العمالة المؤهلة حسب المواصفات المتفق عليها.
خامسًا: تُسدّد المستحقات شهريًا خلال ١٥ يومًا من تاريخ الفاتورة.`;

export default function ContractTemplatesView() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [modal, setModal] = useState(null); // { id?, name, body }
  const [busy, setBusy] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await httpsCallable(functions, "getContractTemplates")({});
      setTemplates((res.data && res.data.templates) || []);
    } catch (e) {
      setError(e.message || "تعذّر التحميل.");
    } finally { setLoading(false); }
  }

  function openNew() { setModal({ name: "", body: SAMPLE }); setMsg(""); }
  function openEdit(t) { setModal({ id: t.id, name: t.name, body: t.body || "" }); setMsg(""); }

  function insertVar(key) {
    setModal((m) => ({ ...m, body: (m.body || "") + "{" + key + "}" }));
  }

  async function save() {
    if (!modal.name.trim()) { setError("أدخل اسم القالب."); return; }
    if (!modal.body.trim()) { setError("أدخل نص القالب."); return; }
    setBusy(true); setError("");
    try {
      if (modal.id) {
        await httpsCallable(functions, "updateContractTemplate")({ templateId: modal.id, name: modal.name.trim(), body: modal.body });
        setMsg("حُدّث القالب.");
      } else {
        await httpsCallable(functions, "createContractTemplate")({ name: modal.name.trim(), body: modal.body });
        setMsg("أُنشئ القالب.");
      }
      setModal(null);
      await load();
    } catch (e) {
      setError(e.message || "تعذّر الحفظ.");
    } finally { setBusy(false); }
  }

  async function del(t) {
    if (!confirm(`حذف القالب «${t.name}»؟`)) return;
    setBusy(true); setError("");
    try {
      await httpsCallable(functions, "deleteContractTemplate")({ templateId: t.id });
      setMsg("حُذف القالب.");
      await load();
    } catch (e) {
      setError(e.message || "تعذّر الحذف.");
    } finally { setBusy(false); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>قوالب العقود</h1>
          <p style={styles.pageSub}>قوالب نصّية جاهزة ببنود ومتغيّرات تُعبّأ تلقائيًا عند إصدار العقد.</p>
        </div>
        <button style={styles.newBtn} onClick={openNew}>+ قالب جديد</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {msg ? <div style={styles.success}>{msg}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : templates.length === 0 ? (
        <div style={styles.emptyBox}>لا توجد قوالب. أنشئ قالبك الأول ليُستخدم عند إصدار العقود.</div>
      ) : (
        <div style={styles.list}>
          {templates.map((t) => (
            <div key={t.id} style={styles.card}>
              <div style={styles.cardMain}>
                <div style={styles.tplName}>📄 {t.name}</div>
                <div style={styles.tplPreview}>{(t.body || "").slice(0, 120)}{(t.body || "").length > 120 ? "…" : ""}</div>
              </div>
              <div style={styles.cardActions}>
                <button style={styles.editBtn} onClick={() => openEdit(t)}>تعديل</button>
                <button style={styles.delBtn} onClick={() => del(t)} disabled={busy}>حذف</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* محرّر القالب */}
      {modal ? (
        <div style={styles.overlay} onClick={() => setModal(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <h2 style={styles.modalTitle}>{modal.id ? "تعديل قالب" : "قالب جديد"}</h2>
              <button style={styles.closeBtn} onClick={() => setModal(null)}>✕</button>
            </div>
            <div style={styles.formBody}>
              <label style={styles.fieldLabel}>اسم القالب</label>
              <input style={styles.input} value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} disabled={busy} placeholder="عقد توريد عمالة قياسي" />

              <label style={styles.fieldLabel}>المتغيّرات (انقر لإضافتها للنص)</label>
              <div style={styles.varsBox}>
                {VARS.map((v) => (
                  <button key={v.key} style={styles.varChip} onClick={() => insertVar(v.key)} disabled={busy} title={v.label}>
                    {v.label}
                  </button>
                ))}
              </div>

              <label style={styles.fieldLabel}>نص القالب</label>
              <textarea style={styles.textarea} value={modal.body} onChange={(e) => setModal({ ...modal, body: e.target.value })} disabled={busy} rows={12} dir="rtl" />
            </div>
            <div style={styles.modalFoot}>
              <button style={styles.cancelBtn} onClick={() => setModal(null)} disabled={busy}>إلغاء</button>
              <button style={styles.saveBtn} onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ القالب"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#7c2d12", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  newBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#7c2d12", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  success: { padding: "10px 12px", background: "#dcfce7", color: "#15803d", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
  emptyBox: { padding: "40px 20px", textAlign: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, color: "#94a3b8", fontSize: 15 },

  list: { display: "flex", flexDirection: "column", gap: 12 },
  card: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", gap: 16, flexWrap: "wrap" },
  cardMain: { flex: 1, minWidth: 240 },
  tplName: { fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 6 },
  tplPreview: { fontSize: 13, color: "#94a3b8", lineHeight: 1.6, whiteSpace: "pre-wrap" },
  cardActions: { display: "flex", gap: 8 },
  editBtn: { padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "#7c2d12", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  delBtn: { padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 600, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", borderBottom: "1px solid #e2e8f0" },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  closeBtn: { width: 32, height: 32, border: "none", background: "#f1f5f9", borderRadius: 8, fontSize: 16, cursor: "pointer", color: "#64748b" },
  formBody: { padding: "20px 22px", overflowY: "auto" },
  fieldLabel: { display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 8, marginTop: 14 },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit", boxSizing: "border-box" },
  varsBox: { display: "flex", flexWrap: "wrap", gap: 6 },
  varChip: { padding: "5px 10px", fontSize: 12, fontWeight: 600, color: "#7c2d12", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit", boxSizing: "border-box", lineHeight: 1.8, resize: "vertical" },
  modalFoot: { display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 22px", borderTop: "1px solid #e2e8f0" },
  cancelBtn: { padding: "10px 18px", fontSize: 14, color: "#64748b", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  saveBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#7c2d12", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
};
