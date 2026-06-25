import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { exportToExcel, exportToPDF, datedFileName } from "./exportUtils";

const DEAL_TYPES = [
  { id: "sale", label: "للبيع" },
  { id: "rental", label: "للتأجير" },
  { id: "consumable", label: "للاستهلاك" },
];
const TERMS = { cash: "نقدًا", net30: "30 يوم", net60: "60 يوم", net90: "90 يوم" };
const COST_LABELS = {
  draft: "مسودّة", pending_finance: "بانتظار المالية", approved: "معتمدة", rejected: "مرفوضة",
};

export default function ProcurementPage({ tenantId, companyName }) {
  const [tab, setTab] = useState("vendors");
  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [busyItem, setBusyItem] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [vSnap, iSnap] = await Promise.all([
        getDocs(query(collection(db, "vendors"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "items"), where("tenantId", "==", tenantId))),
      ]);
      setVendors(vSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setItems(iSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function dealLabel(id) {
    const d = DEAL_TYPES.find((x) => x.id === id);
    return d ? d.label : id;
  }
  function vendorName(id) {
    const v = vendors.find((x) => x.id === id);
    return v ? v.name : "—";
  }

  const company = companyName || "الشركة";

  // ===== بناء صفوف الموردين =====
  function vendorRows() {
    return vendors.map((v) => ({
      name: v.name,
      vendorCode: v.vendorCode || "",
      contactPerson: v.contactPerson || "",
      phone: v.phone || "",
      taxNumber: v.taxNumber || "",
      paymentTerms: TERMS[v.paymentTerms] || "",
    }));
  }
  const vendorColumns = [
    { key: "name", header: "اسم المورّد" },
    { key: "vendorCode", header: "الرمز" },
    { key: "contactPerson", header: "شخص التواصل" },
    { key: "phone", header: "الجوال" },
    { key: "taxNumber", header: "الرقم الضريبي" },
    { key: "paymentTerms", header: "شروط الدفع" },
  ];

  function exportVendorsExcel() {
    exportToExcel({ rows: vendorRows(), columns: vendorColumns, fileName: datedFileName("الموردون"), sheetName: "الموردون" });
  }
  function exportVendorsPDF() {
    exportToPDF({
      rows: vendorRows(), columns: vendorColumns, fileName: datedFileName("الموردون"),
      header: { companyName: company, title: "تقرير الموردين", subtitle: "قسم المشتريات" },
    });
  }

  // ===== بناء صفوف الأصناف =====
  function itemRows() {
    return items.map((it) => ({
      name: it.name,
      itemCode: it.itemCode || "",
      category: it.category || "",
      dealTypes: (it.dealTypes || []).map(dealLabel).join("، "),
      estimatedCost: it.estimatedCost != null ? it.estimatedCost : "",
      approvedCost: it.approvedCost != null ? it.approvedCost : "",
      costStatus: COST_LABELS[it.costStatus] || "",
    }));
  }
  const itemColumns = [
    { key: "name", header: "اسم الصنف" },
    { key: "itemCode", header: "الرمز" },
    { key: "category", header: "الفئة" },
    { key: "dealTypes", header: "أنواع التعامل" },
    { key: "estimatedCost", header: "التقديرية" },
    { key: "approvedCost", header: "المعتمدة" },
    { key: "costStatus", header: "الحالة" },
  ];

  function exportItemsExcel() {
    exportToExcel({ rows: itemRows(), columns: itemColumns, fileName: datedFileName("كتالوج-الأصناف"), sheetName: "الأصناف" });
  }
  function exportItemsPDF() {
    exportToPDF({
      rows: itemRows(), columns: itemColumns, fileName: datedFileName("كتالوج-الأصناف"),
      header: { companyName: company, title: "كتالوج الأصناف", subtitle: "قسم المشتريات" },
    });
  }

  async function sendCost(itemId, currentEstimate) {
    const input = window.prompt("التكلفة التقديرية لإرسالها للمالية (ريال):", currentEstimate || "");
    if (input === null) return;
    const cost = Number(input);
    if (!Number.isFinite(cost) || cost < 0) { alert("قيمة غير صحيحة."); return; }
    setBusyItem(itemId);
    try {
      const fn = httpsCallable(functions, "submitItemCost");
      await fn({ itemId, estimatedCost: cost });
      await loadData();
    } catch (err) {
      alert(err.message || "تعذّر إرسال التكلفة.");
    } finally {
      setBusyItem("");
    }
  }

  return (
    <div>
      <div style={styles.pageHead}>
        <h1 style={styles.pageTitle}>المشتريات</h1>
      </div>

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === "vendors" ? styles.tabActive : {}) }} onClick={() => setTab("vendors")}>
          🚚 الموردون ({vendors.length})
        </button>
        <button style={{ ...styles.tab, ...(tab === "items" ? styles.tabActive : {}) }} onClick={() => setTab("items")}>
          📦 كتالوج الأصناف ({items.length})
        </button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {/* تبويب الموردين */}
      {tab === "vendors" ? (
        <div style={styles.panel}>
          <div style={styles.toolbar}>
            <span style={styles.count}>{vendors.length} مورّد</span>
            <div style={styles.toolBtns}>
              <button style={styles.pdfBtn} onClick={exportVendorsPDF} disabled={vendors.length === 0}>⬇ PDF</button>
              <button style={styles.exportBtn} onClick={exportVendorsExcel} disabled={vendors.length === 0}>⬇ Excel</button>
              <button style={styles.addBtn} onClick={() => setShowVendorForm(true)}>+ إضافة مورّد</button>
            </div>
          </div>

          {loading ? (
            <p style={styles.muted}>جارٍ التحميل...</p>
          ) : vendors.length === 0 ? (
            <p style={styles.muted}>لا يوجد موردون بعد.</p>
          ) : (
            <table style={styles.table}>
              <thead><tr>
                <th style={styles.th}>الاسم</th><th style={styles.th}>الرمز</th>
                <th style={styles.th}>التواصل</th><th style={styles.th}>الرقم الضريبي</th>
                <th style={styles.th}>الدفع</th>
              </tr></thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id}>
                    <td style={styles.td}>{v.name}</td>
                    <td style={styles.td}>{v.vendorCode || "—"}</td>
                    <td style={styles.td}>{v.contactPerson || v.phone || "—"}</td>
                    <td style={styles.td} dir="ltr">{v.taxNumber || "—"}</td>
                    <td style={styles.td}>{TERMS[v.paymentTerms] || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {/* تبويب الأصناف */}
      {tab === "items" ? (
        <div style={styles.panel}>
          <div style={styles.toolbar}>
            <span style={styles.count}>{items.length} صنف</span>
            <div style={styles.toolBtns}>
              <button style={styles.pdfBtn} onClick={exportItemsPDF} disabled={items.length === 0}>⬇ PDF</button>
              <button style={styles.exportBtn} onClick={exportItemsExcel} disabled={items.length === 0}>⬇ Excel</button>
              <button style={styles.addBtn} onClick={() => setShowItemForm(true)}>+ إضافة صنف</button>
            </div>
          </div>

          {loading ? (
            <p style={styles.muted}>جارٍ التحميل...</p>
          ) : items.length === 0 ? (
            <p style={styles.muted}>لا توجد أصناف بعد.</p>
          ) : (
            <table style={styles.table}>
              <thead><tr>
                <th style={styles.th}>الاسم</th><th style={styles.th}>الأنواع</th>
                <th style={styles.th}>التقديرية</th><th style={styles.th}>المعتمدة</th>
                <th style={styles.th}>الحالة</th><th style={styles.th}>إجراء</th>
              </tr></thead>
              <tbody>
                {items.map((it) => {
                  const badge = COST_LABELS[it.costStatus] || "";
                  const canSend = it.costStatus === "draft" || it.costStatus === "rejected";
                  return (
                    <tr key={it.id}>
                      <td style={styles.td}>{it.name}</td>
                      <td style={styles.td}>
                        {(it.dealTypes || []).map((d) => (
                          <span key={d} style={styles.dealChip}>{dealLabel(d)}</span>
                        ))}
                      </td>
                      <td style={styles.td}>{it.estimatedCost != null ? `${it.estimatedCost} ﷼` : "—"}</td>
                      <td style={styles.td}>{it.approvedCost != null ? `${it.approvedCost} ﷼` : "—"}</td>
                      <td style={styles.td}><span style={{ ...styles.statusBadge, ...statusStyle(it.costStatus) }}>{badge}</span></td>
                      <td style={styles.td}>
                        {canSend ? (
                          <button style={styles.sendBtn} onClick={() => sendCost(it.id, it.estimatedCost)} disabled={busyItem === it.id}>
                            {busyItem === it.id ? "..." : "إرسال للمالية"}
                          </button>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {showVendorForm ? (
        <VendorForm onClose={() => setShowVendorForm(false)} onSaved={() => { setShowVendorForm(false); loadData(); }} />
      ) : null}
      {showItemForm ? (
        <ItemForm vendors={vendors} onClose={() => setShowItemForm(false)} onSaved={() => { setShowItemForm(false); loadData(); }} />
      ) : null}
    </div>
  );
}

function statusStyle(status) {
  const map = {
    draft: { background: "#f1f5f9", color: "#475569" },
    pending_finance: { background: "#fef3c7", color: "#92400e" },
    approved: { background: "#dcfce7", color: "#166534" },
    rejected: { background: "#fee2e2", color: "#b91c1c" },
  };
  return map[status] || map.draft;
}

function VendorForm({ onClose, onSaved }) {
  const [f, setF] = useState({ name: "", vendorCode: "", contactPerson: "", phone: "", email: "", taxNumber: "", address: "", paymentTerms: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم المورّد مطلوب."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createVendor");
      await fn({ ...f, name: f.name.trim() });
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
          <h2 style={styles.modalTitle}>إضافة مورّد</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        <label style={styles.label}>اسم المورّد *</label>
        <input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={saving} />
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>الرمز</label>
            <input style={styles.input} value={f.vendorCode} onChange={(e) => set("vendorCode", e.target.value)} disabled={saving} dir="ltr" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>الرقم الضريبي</label>
            <input style={styles.input} value={f.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} disabled={saving} dir="ltr" />
          </div>
        </div>
        <label style={styles.label}>شخص التواصل</label>
        <input style={styles.input} value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} disabled={saving} />
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
        <label style={styles.label}>العنوان</label>
        <input style={styles.input} value={f.address} onChange={(e) => set("address", e.target.value)} disabled={saving} />
        <label style={styles.label}>شروط الدفع</label>
        <select style={styles.input} value={f.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} disabled={saving}>
          <option value="">— اختر —</option>
          <option value="cash">نقدًا</option>
          <option value="net30">آجل 30 يوم</option>
          <option value="net60">آجل 60 يوم</option>
          <option value="net90">آجل 90 يوم</option>
        </select>
        {err ? <div style={styles.error}>{err}</div> : null}
        <button style={styles.save} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ المورّد"}</button>
      </div>
    </div>
  );
}

function ItemForm({ vendors, onClose, onSaved }) {
  const [f, setF] = useState({ name: "", itemCode: "", category: "", unit: "", description: "", preferredVendorId: "", estimatedCost: "" });
  const [dealTypes, setDealTypes] = useState([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggleDeal = (id) => setDealTypes((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم الصنف مطلوب."); return; }
    if (dealTypes.length === 0) { setErr("اختر نوع تعامل واحدًا على الأقل."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createItem");
      await fn({ ...f, name: f.name.trim(), dealTypes, estimatedCost: f.estimatedCost !== "" ? Number(f.estimatedCost) : null });
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
          <h2 style={styles.modalTitle}>إضافة صنف</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        <label style={styles.label}>اسم الصنف *</label>
        <input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={saving} />
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>الرمز (SKU)</label>
            <input style={styles.input} value={f.itemCode} onChange={(e) => set("itemCode", e.target.value)} disabled={saving} dir="ltr" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>الوحدة</label>
            <input style={styles.input} value={f.unit} onChange={(e) => set("unit", e.target.value)} disabled={saving} />
          </div>
        </div>
        <label style={styles.label}>الفئة</label>
        <input style={styles.input} value={f.category} onChange={(e) => set("category", e.target.value)} disabled={saving} />
        <label style={styles.label}>أنواع التعامل * (أكثر من نوع ممكن)</label>
        <div style={styles.deals}>
          {DEAL_TYPES.map((d) => (
            <button key={d.id} type="button" onClick={() => toggleDeal(d.id)} disabled={saving}
              style={{ ...styles.dealOption, ...(dealTypes.includes(d.id) ? styles.dealOptionOn : {}) }}>
              {d.label}
            </button>
          ))}
        </div>
        <label style={styles.label}>المورّد المفضّل</label>
        <select style={styles.input} value={f.preferredVendorId} onChange={(e) => set("preferredVendorId", e.target.value)} disabled={saving}>
          <option value="">— بدون —</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <label style={styles.label}>التكلفة التقديرية (ريال)</label>
        <input style={styles.input} type="number" min="0" value={f.estimatedCost} onChange={(e) => set("estimatedCost", e.target.value)} placeholder="اختياري" disabled={saving} dir="ltr" />
        {err ? <div style={styles.error}>{err}</div> : null}
        <button style={styles.save} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ الصنف"}</button>
      </div>
    </div>
  );
}

const styles = {
  pageHead: { marginBottom: 20 },
  pageTitle: { margin: 0, fontSize: 24, color: "#7c3aed" },
  tabs: { display: "flex", gap: 8, marginBottom: 20, borderBottom: "2px solid #e2e8f0" },
  tab: { padding: "12px 20px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "transparent", border: "none", borderBottom: "3px solid transparent", cursor: "pointer", marginBottom: "-2px" },
  tabActive: { color: "#7c3aed", borderBottomColor: "#7c3aed" },
  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24 },
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 },
  count: { fontSize: 14, color: "#64748b", fontWeight: 600 },
  toolBtns: { display: "flex", gap: 8 },
  pdfBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer" },
  exportBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "none", borderRadius: 8, cursor: "pointer" },
  addBtn: { padding: "9px 16px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 8, cursor: "pointer" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "right", padding: "10px 12px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0" },
  td: { padding: "12px", fontSize: 14, borderBottom: "1px solid #f1f5f9" },
  dealChip: { fontSize: 11, color: "#7c3aed", background: "#f3e8ff", padding: "2px 8px", borderRadius: 8, fontWeight: 600, marginLeft: 4 },
  statusBadge: { padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 },
  sendBtn: { padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#7c3aed", background: "#f3e8ff", border: "none", borderRadius: 6, cursor: "pointer" },
  muted: { color: "#94a3b8", fontSize: 14 },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modal: { width: "100%", maxWidth: 560, background: "#fff", borderRadius: 12, padding: 28, direction: "rtl", textAlign: "right", maxHeight: "90vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  label: { display: "block", margin: "14px 0 6px", fontSize: 14, fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  row: { display: "flex", gap: 12 },
  deals: { display: "flex", flexWrap: "wrap", gap: 8 },
  dealOption: { padding: "8px 16px", fontSize: 14, borderRadius: 20, cursor: "pointer", border: "1px solid #cbd5e1", background: "#fff", color: "#475569" },
  dealOptionOn: { background: "#7c3aed", color: "#fff", borderColor: "#7c3aed", fontWeight: 600 },
  save: { width: "100%", marginTop: 20, padding: "12px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 8, cursor: "pointer" },
};