import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

const DEAL_TYPES = [
  { id: "sale", label: "للبيع" },
  { id: "rental", label: "للتأجير" },
  { id: "consumable", label: "للاستهلاك" },
];

// نافذة كتالوج الأصناف: عرض + إضافة + إرسال التكلفة للمالية.
export default function ItemsModal({ tenantId, onClose }) {
  const [items, setItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busyItem, setBusyItem] = useState("");

  // حقول النموذج
  const [name, setName] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [dealTypes, setDealTypes] = useState([]);
  const [description, setDescription] = useState("");
  const [preferredVendorId, setPreferredVendorId] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    setListError("");
    try {
      const [itemSnap, vendorSnap] = await Promise.all([
        getDocs(query(collection(db, "items"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "vendors"), where("tenantId", "==", tenantId))),
      ]);
      setItems(itemSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setVendors(vendorSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setListError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function toggleDeal(id) {
    setDealTypes((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  function resetForm() {
    setName(""); setItemCode(""); setCategory(""); setUnit("");
    setDealTypes([]); setDescription(""); setPreferredVendorId(""); setEstimatedCost("");
    setFormError("");
  }

  async function handleSave() {
    setFormError("");
    if (name.trim().length < 2) {
      setFormError("اسم الصنف مطلوب (حرفان على الأقل).");
      return;
    }
    if (dealTypes.length === 0) {
      setFormError("اختر نوع تعامل واحدًا على الأقل.");
      return;
    }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createItem");
      await fn({
        name: name.trim(), itemCode: itemCode.trim(), category: category.trim(),
        unit: unit.trim(), dealTypes: dealTypes, description: description.trim(),
        preferredVendorId: preferredVendorId || "",
        estimatedCost: estimatedCost !== "" ? Number(estimatedCost) : null,
      });
      resetForm();
      setShowForm(false);
      await loadData();
    } catch (err) {
      setFormError(err.message || "تعذّر إنشاء الصنف.");
    } finally {
      setSaving(false);
    }
  }

  // إرسال التكلفة للمالية
  async function sendCost(itemId, currentEstimate) {
    const input = window.prompt("التكلفة التقديرية لإرسالها للمالية (ريال):", currentEstimate || "");
    if (input === null) return;
    const cost = Number(input);
    if (!Number.isFinite(cost) || cost < 0) {
      alert("قيمة غير صحيحة.");
      return;
    }
    setBusyItem(itemId);
    try {
      const fn = httpsCallable(functions, "submitItemCost");
      await fn({ itemId: itemId, estimatedCost: cost });
      await loadData();
    } catch (err) {
      alert(err.message || "تعذّر إرسال التكلفة.");
    } finally {
      setBusyItem("");
    }
  }

  function costStatusBadge(status) {
    const map = {
      draft: { label: "مسودّة", bg: "#f1f5f9", fg: "#475569" },
      pending_finance: { label: "بانتظار المالية", bg: "#fef3c7", fg: "#92400e" },
      approved: { label: "معتمدة", bg: "#dcfce7", fg: "#166534" },
      rejected: { label: "مرفوضة", bg: "#fee2e2", fg: "#b91c1c" },
    };
    return map[status] || map.draft;
  }

  function dealLabel(id) {
    const d = DEAL_TYPES.find((x) => x.id === id);
    return d ? d.label : id;
  }
  function vendorName(id) {
    const v = vendors.find((x) => x.id === id);
    return v ? v.name : null;
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.head}>
          <h2 style={styles.title}>كتالوج الأصناف</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        {!showForm ? (
          <>
            <div style={styles.toolbar}>
              <span style={styles.count}>{items.length} صنف</span>
              <button style={styles.addBtn} onClick={() => setShowForm(true)}>+ إضافة صنف</button>
            </div>

            {loading ? (
              <p style={styles.muted}>جارٍ التحميل...</p>
            ) : listError ? (
              <div style={styles.error}>{listError}</div>
            ) : items.length === 0 ? (
              <p style={styles.muted}>لا توجد أصناف بعد. أضف أول صنف.</p>
            ) : (
              <div style={styles.list}>
                {items.map((it) => {
                  const badge = costStatusBadge(it.costStatus);
                  const busy = busyItem === it.id;
                  return (
                    <div key={it.id} style={styles.itemCard}>
                      <div style={styles.iTop}>
                        <strong style={styles.iName}>{it.name}</strong>
                        <span style={{ ...styles.statusBadge, background: badge.bg, color: badge.fg }}>
                          {badge.label}
                        </span>
                      </div>

                      <div style={styles.iDeals}>
                        {(it.dealTypes || []).map((d) => (
                          <span key={d} style={styles.dealChip}>{dealLabel(d)}</span>
                        ))}
                        {it.unit ? <span style={styles.iUnit}>· {it.unit}</span> : null}
                      </div>

                      <div style={styles.iCosts}>
                        {it.estimatedCost != null ? <span>تقديرية: {it.estimatedCost} ﷼</span> : null}
                        {it.approvedCost != null ? <span style={styles.approvedCost}>معتمدة: {it.approvedCost} ﷼</span> : null}
                        {vendorName(it.preferredVendorId) ? <span>· {vendorName(it.preferredVendorId)}</span> : null}
                      </div>

                      {/* زر إرسال التكلفة — يظهر للمسودّة أو المرفوضة */}
                      {(it.costStatus === "draft" || it.costStatus === "rejected") ? (
                        <button
                          style={styles.sendCostBtn}
                          onClick={() => sendCost(it.id, it.estimatedCost)}
                          disabled={busy}
                        >
                          {busy ? "..." : "إرسال التكلفة للمالية"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <button style={styles.backBtn} onClick={() => { setShowForm(false); resetForm(); }}>
              ← رجوع للقائمة
            </button>

            <label style={styles.label}>اسم الصنف *</label>
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مولّد كهربائي 5kVA" disabled={saving} />

            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>رمز الصنف (SKU)</label>
                <input style={styles.input} value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="ITM-001" disabled={saving} dir="ltr" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>وحدة القياس</label>
                <input style={styles.input} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="قطعة / متر / كرتون" disabled={saving} />
              </div>
            </div>

            <label style={styles.label}>الفئة</label>
            <input style={styles.input} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="معدّات / مواد / أدوات" disabled={saving} />

            <label style={styles.label}>أنواع التعامل * (يمكن اختيار أكثر من نوع)</label>
            <div style={styles.deals}>
              {DEAL_TYPES.map((d) => (
                <label key={d.id} style={{ ...styles.dealOption, ...(dealTypes.includes(d.id) ? styles.dealOptionOn : {}) }}>
                  <input type="checkbox" checked={dealTypes.includes(d.id)} onChange={() => toggleDeal(d.id)} disabled={saving} style={{ display: "none" }} />
                  {d.label}
                </label>
              ))}
            </div>

            <label style={styles.label}>المورّد المفضّل</label>
            <select style={styles.input} value={preferredVendorId} onChange={(e) => setPreferredVendorId(e.target.value)} disabled={saving}>
              <option value="">— بدون —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>

            <label style={styles.label}>التكلفة التقديرية (ريال)</label>
            <input style={styles.input} type="number" min="0" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} placeholder="اختياري — ترسلها للمالية لاحقًا" disabled={saving} dir="ltr" />

            <label style={styles.label}>وصف</label>
            <textarea style={{ ...styles.input, resize: "vertical", fontFamily: "inherit" }} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="تفاصيل إضافية..." disabled={saving} />

            {formError ? <div style={styles.error}>{formError}</div> : null}

            <button style={styles.save} onClick={handleSave} disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "حفظ الصنف"}
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
  itemCard: { padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" },
  iTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  iName: { fontSize: 15 },
  statusBadge: { padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 },
  iDeals: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 8 },
  dealChip: { fontSize: 12, color: "#7c3aed", background: "#f3e8ff", padding: "2px 9px", borderRadius: 10, fontWeight: 600 },
  iUnit: { fontSize: 12, color: "#94a3b8" },
  iCosts: { display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13, color: "#64748b" },
  approvedCost: { color: "#166534", fontWeight: 600 },
  sendCostBtn: { marginTop: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#7c3aed", background: "#f3e8ff", border: "none", borderRadius: 7, cursor: "pointer" },
  label: { display: "block", margin: "14px 0 6px", fontSize: 14, fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  row: { display: "flex", gap: 12 },
  deals: { display: "flex", flexWrap: "wrap", gap: 8 },
  dealOption: { padding: "8px 16px", fontSize: 14, borderRadius: 20, cursor: "pointer", border: "1px solid #cbd5e1", background: "#fff", color: "#475569", userSelect: "none" },
  dealOptionOn: { background: "#7c3aed", color: "#fff", borderColor: "#7c3aed", fontWeight: 600 },
  error: { marginTop: 16, padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14 },
  save: { width: "100%", marginTop: 20, padding: "12px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 8, cursor: "pointer" },
  muted: { color: "#94a3b8", fontSize: 14 },
};