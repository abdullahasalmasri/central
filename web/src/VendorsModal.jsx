import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

// نافذة إدارة الموردين: عرض + إضافة (وفق Vendor Master).
export default function VendorsModal({ tenantId, onClose }) {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [showForm, setShowForm] = useState(false);

  // حقول النموذج
  const [name, setName] = useState("");
  const [vendorCode, setVendorCode] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [address, setAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadVendors() {
    setLoading(true);
    setListError("");
    try {
      const snap = await getDocs(query(collection(db, "vendors"), where("tenantId", "==", tenantId)));
      setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setListError("تعذّر تحميل الموردين.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVendors();
  }, []);

  function resetForm() {
    setName(""); setVendorCode(""); setContactPerson(""); setPhone("");
    setEmail(""); setTaxNumber(""); setAddress(""); setPaymentTerms("");
    setFormError("");
  }

  async function handleSave() {
    setFormError("");
    if (name.trim().length < 2) {
      setFormError("اسم المورّد مطلوب (حرفان على الأقل).");
      return;
    }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createVendor");
      await fn({
        name: name.trim(), vendorCode: vendorCode.trim(), contactPerson: contactPerson.trim(),
        phone: phone.trim(), email: email.trim(), taxNumber: taxNumber.trim(),
        address: address.trim(), paymentTerms: paymentTerms,
      });
      resetForm();
      setShowForm(false);
      await loadVendors();
    } catch (err) {
      setFormError(err.message || "تعذّر إنشاء المورّد.");
    } finally {
      setSaving(false);
    }
  }

  function termsLabel(t) {
    const map = { cash: "نقدًا", net30: "30 يوم", net60: "60 يوم", net90: "90 يوم" };
    return map[t] || "—";
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.head}>
          <h2 style={styles.title}>الموردون</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        {!showForm ? (
          <>
            <div style={styles.toolbar}>
              <span style={styles.count}>{vendors.length} مورّد</span>
              <button style={styles.addBtn} onClick={() => setShowForm(true)}>+ إضافة مورّد</button>
            </div>

            {loading ? (
              <p style={styles.muted}>جارٍ التحميل...</p>
            ) : listError ? (
              <div style={styles.error}>{listError}</div>
            ) : vendors.length === 0 ? (
              <p style={styles.muted}>لا يوجد موردون بعد. أضف أول مورّد.</p>
            ) : (
              <div style={styles.list}>
                {vendors.map((v) => (
                  <div key={v.id} style={styles.vendorCard}>
                    <div style={styles.vTop}>
                      <strong style={styles.vName}>{v.name}</strong>
                      {v.vendorCode ? <span style={styles.vCode}>{v.vendorCode}</span> : null}
                    </div>
                    <div style={styles.vMeta}>
                      {v.contactPerson ? <span>👤 {v.contactPerson}</span> : null}
                      {v.phone ? <span>📞 {v.phone}</span> : null}
                      {v.taxNumber ? <span>🧾 {v.taxNumber}</span> : null}
                      <span>💳 {termsLabel(v.paymentTerms)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <button style={styles.backBtn} onClick={() => { setShowForm(false); resetForm(); }}>
              ← رجوع للقائمة
            </button>

            <label style={styles.label}>اسم المورّد *</label>
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مؤسسة التوريدات الحديثة" disabled={saving} />

            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>رمز المورّد</label>
                <input style={styles.input} value={vendorCode} onChange={(e) => setVendorCode(e.target.value)} placeholder="V-001" disabled={saving} dir="ltr" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>الرقم الضريبي</label>
                <input style={styles.input} value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder="300..." disabled={saving} dir="ltr" />
              </div>
            </div>

            <label style={styles.label}>شخص التواصل</label>
            <input style={styles.input} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="الاسm" disabled={saving} />

            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>الجوال</label>
                <input style={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05..." disabled={saving} dir="ltr" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>البريد</label>
                <input style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vendor@..." disabled={saving} dir="ltr" />
              </div>
            </div>

            <label style={styles.label}>العنوان</label>
            <input style={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="المدينة، الحي" disabled={saving} />

            <label style={styles.label}>شروط الدفع</label>
            <select style={styles.input} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} disabled={saving}>
              <option value="">— اختر —</option>
              <option value="cash">نقدًا</option>
              <option value="net30">آجل 30 يوم</option>
              <option value="net60">آجل 60 يوم</option>
              <option value="net90">آجل 90 يوم</option>
            </select>

            {formError ? <div style={styles.error}>{formError}</div> : null}

            <button style={styles.save} onClick={handleSave} disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "حفظ المورّد"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modal: { width: "100%", maxWidth: 560, background: "#fff", borderRadius: 12, padding: 28, fontFamily: "system-ui, sans-serif", direction: "rtl", textAlign: "right", maxHeight: "90vh", overflowY: "auto" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  count: { fontSize: 14, color: "#64748b", fontWeight: 600 },
  addBtn: { padding: "9px 16px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 8, cursor: "pointer" },
  backBtn: { background: "none", border: "none", color: "#7c3aed", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 12, padding: 0 },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  vendorCard: { padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" },
  vTop: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 },
  vName: { fontSize: 15 },
  vCode: { fontSize: 12, color: "#7c3aed", background: "#f3e8ff", padding: "2px 8px", borderRadius: 6, fontWeight: 600 },
  vMeta: { display: "flex", flexWrap: "wrap", gap: 14, fontSize: 13, color: "#64748b" },
  label: { display: "block", margin: "14px 0 6px", fontSize: 14, fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  row: { display: "flex", gap: 12 },
  error: { marginTop: 16, padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14 },
  save: { width: "100%", marginTop: 20, padding: "12px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 8, cursor: "pointer" },
  muted: { color: "#94a3b8", fontSize: 14 },
};