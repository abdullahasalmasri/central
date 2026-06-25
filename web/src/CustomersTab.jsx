import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { exportToExcel, exportToPDF, datedFileName } from "./exportUtils";

// كيان العملاء (Customer Master) — متوافق مع ZATCA للفاتورة القياسية.
export default function CustomersTab({ tenantId, companyName }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const snap = await getDocs(query(collection(db, "customers"), where("tenantId", "==", tenantId)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
      setCustomers(list);
    } catch (err) {
      setError("تعذّر تحميل العملاء.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadData(); }, []);

  const company = companyName || "الشركة";

  function buildRows() {
    return customers.map((c) => ({
      name: c.name,
      customerCode: c.customerCode || "",
      taxNumber: c.taxNumber || "",
      crNumber: c.crNumber || "",
      city: (c.address && c.address.city) || "",
      phone: c.phone || "",
    }));
  }
  const exportColumns = [
    { key: "name", header: "اسم العميل" },
    { key: "customerCode", header: "الرمز" },
    { key: "taxNumber", header: "الرقم الضريبي" },
    { key: "crNumber", header: "السجل التجاري" },
    { key: "city", header: "المدينة" },
    { key: "phone", header: "الجوال" },
  ];
  const exportExcel = () => exportToExcel({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("العملاء"), sheetName: "العملاء" });
  const exportPDF = () => exportToPDF({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("العملاء"), header: { companyName: company, title: "سجل العملاء", subtitle: "قسم المالية" } });

  if (loading) return <p style={styles.muted}>جارٍ التحميل...</p>;

  return (
    <div>
      <div style={styles.toolbar}>
        <span style={styles.count}>{customers.length} عميل</span>
        <div style={styles.toolBtns}>
          {customers.length > 0 ? (
            <>
              <button style={styles.pdfBtn} onClick={exportPDF}>⬇ PDF</button>
              <button style={styles.exportBtn} onClick={exportExcel}>⬇ Excel</button>
            </>
          ) : null}
          <button style={styles.addBtn} onClick={() => { setEditing(null); setShowForm(true); }}>+ إضافة عميل</button>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {customers.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>👥</div>
          <p style={styles.muted}>لا يوجد عملاء بعد. أضف أول عميل لإصدار الفواتير.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {customers.map((c) => (
            <div key={c.id} style={styles.card}>
              <div style={styles.cardMain}>
                <div style={styles.cardTop}>
                  <strong style={styles.cName}>{c.name}</strong>
                  {c.customerCode ? <span style={styles.codeTag} dir="ltr">{c.customerCode}</span> : null}
                </div>
                <div style={styles.cardMeta}>
                  {c.taxNumber ? <span style={styles.metaItem}>🧾 <span dir="ltr">{c.taxNumber}</span></span> : <span style={styles.noTax}>بدون رقم ضريبي</span>}
                  {c.address && c.address.city ? <span style={styles.metaItem}>📍 {c.address.city}</span> : null}
                  {c.phone ? <span style={styles.metaItem} dir="ltr">{c.phone}</span> : null}
                </div>
              </div>
              <button style={styles.editBtn} onClick={() => { setEditing(c); setShowForm(true); }}>تعديل</button>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <CustomerForm
          customer={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); loadData(); }}
        />
      ) : null}
    </div>
  );
}

// ═══ نموذج إضافة/تعديل عميل ═══
function CustomerForm({ customer, onClose, onSaved }) {
  const isEdit = !!customer;
  const addr = (customer && customer.address) || {};
  const [f, setF] = useState({
    name: customer ? customer.name || "" : "",
    customerCode: customer ? customer.customerCode || "" : "",
    taxNumber: customer ? customer.taxNumber || "" : "",
    crNumber: customer ? customer.crNumber || "" : "",
    contactPerson: customer ? customer.contactPerson || "" : "",
    phone: customer ? customer.phone || "" : "",
    email: customer ? customer.email || "" : "",
    buildingNumber: addr.buildingNumber || "",
    street: addr.street || "",
    district: addr.district || "",
    city: addr.city || "",
    postalCode: addr.postalCode || "",
    additionalNumber: addr.additionalNumber || "",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم العميل مطلوب."); return; }
    if (f.taxNumber.trim() && !/^3\d{13}3$/.test(f.taxNumber.trim())) {
      setErr("الرقم الضريبي يجب أن يكون 15 رقمًا يبدأ وينتهي بالرقم 3.");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const fn = httpsCallable(functions, "updateCustomer");
        await fn({ customerId: customer.id, ...f, name: f.name.trim() });
      } else {
        const fn = httpsCallable(functions, "createCustomer");
        await fn({ ...f, name: f.name.trim() });
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
          <h2 style={styles.modalTitle}>{isEdit ? "تعديل عميل" : "إضافة عميل"}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        {/* البيانات الأساسية */}
        <label style={styles.label}>اسم العميل / الشركة *</label>
        <input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={saving} />

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>الرقم الضريبي (VAT)</label>
            <input style={styles.input} value={f.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} placeholder="3XXXXXXXXXXXX3" disabled={saving} dir="ltr" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>السجل التجاري</label>
            <input style={styles.input} value={f.crNumber} onChange={(e) => set("crNumber", e.target.value)} disabled={saving} dir="ltr" />
          </div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>رمز العميل</label>
            <input style={styles.input} value={f.customerCode} onChange={(e) => set("customerCode", e.target.value)} disabled={saving} dir="ltr" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>شخص التواصل</label>
            <input style={styles.input} value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} disabled={saving} />
          </div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>الجوال</label>
            <input style={styles.input} value={f.phone} onChange={(e) => set("phone", e.target.value)} disabled={saving} dir="ltr" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>البريد</label>
            <input style={styles.input} value={f.email} onChange={(e) => set("email", e.target.value)} disabled={saving} dir="ltr" />
          </div>
        </div>

        {/* العنوان الوطني */}
        <div style={styles.addressTitle}>العنوان الوطني (لمتطلبات ZATCA)</div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>رقم المبنى</label>
            <input style={styles.input} value={f.buildingNumber} onChange={(e) => set("buildingNumber", e.target.value)} disabled={saving} dir="ltr" />
          </div>
          <div style={{ flex: 2 }}>
            <label style={styles.label}>الشارع</label>
            <input style={styles.input} value={f.street} onChange={(e) => set("street", e.target.value)} disabled={saving} />
          </div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>الحي</label>
            <input style={styles.input} value={f.district} onChange={(e) => set("district", e.target.value)} disabled={saving} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>المدينة</label>
            <input style={styles.input} value={f.city} onChange={(e) => set("city", e.target.value)} disabled={saving} />
          </div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>الرمز البريدي</label>
            <input style={styles.input} value={f.postalCode} onChange={(e) => set("postalCode", e.target.value)} disabled={saving} dir="ltr" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>الرقم الإضافي</label>
            <input style={styles.input} value={f.additionalNumber} onChange={(e) => set("additionalNumber", e.target.value)} disabled={saving} dir="ltr" />
          </div>
        </div>

        {err ? <div style={styles.error}>{err}</div> : null}
        <button style={styles.save} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : (isEdit ? "حفظ التعديلات" : "حفظ العميل")}</button>
      </div>
    </div>
  );
}

const styles = {
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 },
  count: { fontSize: 14, color: "#64748b", fontWeight: 600 },
  toolBtns: { display: "flex", gap: 8 },
  pdfBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer" },
  exportBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "none", borderRadius: 8, cursor: "pointer" },
  addBtn: { padding: "9px 16px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },

  empty: { padding: 40, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 48, marginBottom: 12 },

  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, gap: 12 },
  cardMain: { flex: 1, minWidth: 0 },
  cardTop: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" },
  cName: { fontSize: 15, color: "#0f172a" },
  codeTag: { fontSize: 11, color: "#475569", background: "#f1f5f9", padding: "2px 8px", borderRadius: 6, fontFamily: "monospace" },
  cardMeta: { display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, color: "#64748b" },
  metaItem: { display: "flex", alignItems: "center", gap: 4 },
  noTax: { fontSize: 12, color: "#b45309", background: "#fef3c7", padding: "2px 8px", borderRadius: 6 },
  editBtn: { padding: "7px 16px", fontSize: 13, fontWeight: 600, color: "#16a34a", background: "#dcfce7", border: "none", borderRadius: 7, cursor: "pointer", flexShrink: 0 },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modal: { width: "100%", maxWidth: 600, background: "#fff", borderRadius: 12, padding: 28, direction: "rtl", textAlign: "right", maxHeight: "90vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  label: { display: "block", margin: "12px 0 6px", fontSize: 13, fontWeight: 600 },
  input: { width: "100%", padding: "9px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  row: { display: "flex", gap: 12 },
  addressTitle: { marginTop: 18, marginBottom: 4, fontSize: 13, fontWeight: 700, color: "#16a34a", borderTop: "1px solid #e2e8f0", paddingTop: 16 },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginTop: 16 },
  save: { width: "100%", marginTop: 20, padding: "12px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },
  muted: { color: "#94a3b8", fontSize: 14 },
};