import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   بيانات الشركة الرسمية
   البيانات التي تظهر في رأس عرض السعر والعقد وجميع الأوراق:
   الاسم التجاري، السجل التجاري، الترخيص، الرقم الضريبي، العنوان،
   الشخص المخوّل، هاتف الشركة، هاتف المخوّل.
   يعدّلها المالك أو من له صلاحية المالية.
   ============================================================ */

export default function CompanyProfileView() {
  const [tenantId, setTenantId] = useState("");
  const [form, setForm] = useState({
    name: "", crNumber: "", licenseNumber: "", taxNumber: "",
    addressText: "", authorizedPerson: "", companyPhone: "", authorizedPhone: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) { setError("يجب تسجيل الدخول."); setLoading(false); return; }
        const uSnap = await getDoc(doc(db, "users", uid));
        const tid = uSnap.exists() ? uSnap.data().tenantId : null;
        if (!tid) { setError("حسابك غير مرتبط بشركة."); setLoading(false); return; }
        setTenantId(tid);
        const tSnap = await getDoc(doc(db, "tenants", tid));
        if (tSnap.exists()) {
          const t = tSnap.data();
          setForm({
            name: t.name || "", crNumber: t.crNumber || "", licenseNumber: t.licenseNumber || "",
            taxNumber: t.taxNumber || "", addressText: t.addressText || "",
            authorizedPerson: t.authorizedPerson || "", companyPhone: t.companyPhone || "",
            authorizedPhone: t.authorizedPhone || "",
          });
        }
      } catch (e) { setError(e.message || "خطأ."); }
      finally { setLoading(false); }
    })();
  }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function save() {
    setError(""); setMsg("");
    if (!form.name.trim()) { setError("الاسم التجاري مطلوب."); return; }
    if (form.taxNumber && !/^3\d{13}3$/.test(form.taxNumber.trim())) {
      setError("الرقم الضريبي يجب أن يكون ١٥ رقمًا يبدأ وينتهي بـ ٣."); return;
    }
    setSaving(true);
    try {
      await httpsCallable(functions, "updateCompanyProfile")({
        name: form.name.trim(), crNumber: form.crNumber.trim(), licenseNumber: form.licenseNumber.trim(),
        taxNumber: form.taxNumber.trim(), addressText: form.addressText.trim(),
        authorizedPerson: form.authorizedPerson.trim(), companyPhone: form.companyPhone.trim(),
        authorizedPhone: form.authorizedPhone.trim(),
      });
      setMsg("حُفظت بيانات الشركة بنجاح.");
    } catch (e) {
      setError(e.message || "تعذّر الحفظ. تأكد أن لديك صلاحية المالك أو المالية.");
    } finally { setSaving(false); }
  }

  if (loading) return <div style={styles.page}><p style={styles.muted}>جارٍ التحميل...</p></div>;

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>بيانات الشركة</h1>
          <p style={styles.pageSub}>تظهر هذه البيانات في رأس عرض السعر والعقد وجميع الأوراق الرسمية.</p>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {msg ? <div style={styles.success}>{msg}</div> : null}

      <div style={styles.card}>
        <div style={styles.sectionLabel}>البيانات الأساسية (رأس الأوراق)</div>
        <div style={styles.grid}>
          <Field label="الاسم التجاري *" value={form.name} onChange={(v) => set("name", v)} disabled={saving} />
          <Field label="رقم السجل التجاري" value={form.crNumber} onChange={(v) => set("crNumber", v)} disabled={saving} ltr />
          <Field label="رقم الترخيص" value={form.licenseNumber} onChange={(v) => set("licenseNumber", v)} disabled={saving} ltr />
          <Field label="الرقم الضريبي" value={form.taxNumber} onChange={(v) => set("taxNumber", v)} disabled={saving} ltr placeholder="3XXXXXXXXXXXXX3" />
        </div>

        <Field label="العنوان" value={form.addressText} onChange={(v) => set("addressText", v)} disabled={saving} placeholder="المدينة، الحي، الشارع، الرمز البريدي" full />

        <div style={styles.sectionLabel}>بيانات التواصل والتخويل</div>
        <div style={styles.grid}>
          <Field label="اسم الشخص المخوّل" value={form.authorizedPerson} onChange={(v) => set("authorizedPerson", v)} disabled={saving} />
          <Field label="رقم التواصل للشركة" value={form.companyPhone} onChange={(v) => set("companyPhone", v)} disabled={saving} ltr />
          <Field label="رقم الشخص المخوّل" value={form.authorizedPhone} onChange={(v) => set("authorizedPhone", v)} disabled={saving} ltr />
        </div>

        <div style={styles.footRow}>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ البيانات"}</button>
        </div>
      </div>

      {/* معاينة التذييل */}
      <div style={styles.previewBox}>
        <div style={styles.previewLabel}>معاينة تذييل الصفحات:</div>
        <div style={styles.previewFooter}>
          {[form.name || "اسم الشركة", form.crNumber && `س.ت ${form.crNumber}`, form.licenseNumber && `ترخيص ${form.licenseNumber}`, form.addressText]
            .filter(Boolean).join("  -  ")}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, disabled, ltr, placeholder, full }) {
  return (
    <div style={full ? styles.fieldFull : styles.field}>
      <label style={styles.label}>{label}</label>
      <input style={styles.input} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} dir={ltr ? "ltr" : "rtl"} placeholder={placeholder || ""} />
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { marginBottom: 18 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#1e40af", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  muted: { color: "#94a3b8", fontSize: 14 },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  success: { padding: "10px 12px", background: "#dcfce7", color: "#15803d", borderRadius: 8, fontSize: 14, marginBottom: 16 },

  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "22px 26px" },
  sectionLabel: { fontSize: 14, fontWeight: 800, color: "#1e40af", marginTop: 18, marginBottom: 14, paddingBottom: 6, borderBottom: "2px solid #eff6ff" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 },
  field: { display: "flex", flexDirection: "column" },
  fieldFull: { display: "flex", flexDirection: "column", marginTop: 16 },
  label: { fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 },
  input: { padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit", boxSizing: "border-box" },
  footRow: { display: "flex", justifyContent: "flex-end", marginTop: 24 },
  saveBtn: { padding: "11px 28px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#1e40af", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },

  previewBox: { marginTop: 18, background: "#fff", border: "1px dashed #cbd5e1", borderRadius: 12, padding: "16px 20px" },
  previewLabel: { fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8 },
  previewFooter: { fontSize: 13, color: "#334155", textAlign: "center", paddingTop: 10, borderTop: "1px solid #e2e8f0" },
};
