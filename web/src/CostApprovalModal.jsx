import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

// نافذة اعتماد المالية لتكاليف أصناف المشتريات.
// تعرض الأصناف بحالة pending_finance، وتتيح الاعتماد (مع تعديل التكلفة) أو الرفض.
export default function CostApprovalModal({ tenantId, onClose }) {
  const [pendingItems, setPendingItems] = useState([]);
  const [decidedItems, setDecidedItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [editingId, setEditingId] = useState(""); // أي صنف يُعدّل تكلفته قبل الاعتماد
  const [approvedCost, setApprovedCost] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [itemSnap, vendorSnap] = await Promise.all([
        getDocs(query(collection(db, "items"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "vendors"), where("tenantId", "==", tenantId))),
      ]);
      const all = itemSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPendingItems(all.filter((it) => it.costStatus === "pending_finance"));
      setDecidedItems(all.filter((it) => it.costStatus === "approved" || it.costStatus === "rejected"));
      setVendors(vendorSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setError("تعذّر تحميل الأصناف.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function decide(itemId, action, cost) {
    setBusy(itemId);
    setError("");
    try {
      const fn = httpsCallable(functions, "approveItemCost");
      const payload = { itemId: itemId, action: action };
      if (action === "approve" && cost !== undefined && cost !== "") {
        payload.approvedCost = Number(cost);
      }
      await fn(payload);
      setEditingId("");
      setApprovedCost("");
      await loadData();
    } catch (err) {
      setError(err.message || "تعذّر تنفيذ الإجراء.");
    } finally {
      setBusy("");
    }
  }

  function dealLabel(id) {
    const map = { sale: "للبيع", rental: "للتأجير", consumable: "للاستهلاك" };
    return map[id] || id;
  }
  function vendorName(id) {
    const v = vendors.find((x) => x.id === id);
    return v ? v.name : null;
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.head}>
          <h2 style={styles.title}>اعتماد تكاليف المشتريات</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        {error ? <div style={styles.error}>{error}</div> : null}

        {/* بانتظار الاعتماد */}
        <h3 style={styles.section}>
          بانتظار اعتمادك {pendingItems.length > 0 ? `(${pendingItems.length})` : ""}
        </h3>

        {loading ? (
          <p style={styles.muted}>جارٍ التحميل...</p>
        ) : pendingItems.length === 0 ? (
          <p style={styles.muted}>لا توجد تكاليف بانتظار الاعتماد. 👍</p>
        ) : (
          <div style={styles.list}>
            {pendingItems.map((it) => {
              const busyThis = busy === it.id;
              return (
                <div key={it.id} style={styles.card}>
                  <div style={styles.cTop}>
                    <strong style={styles.cName}>{it.name}</strong>
                    <span style={styles.estCost}>التقديرية: {it.estimatedCost} ﷼</span>
                  </div>
                  <div style={styles.cMeta}>
                    {(it.dealTypes || []).map((d) => (
                      <span key={d} style={styles.dealChip}>{dealLabel(d)}</span>
                    ))}
                    {it.unit ? <span style={styles.muted2}>· {it.unit}</span> : null}
                    {vendorName(it.preferredVendorId) ? <span style={styles.muted2}>· {vendorName(it.preferredVendorId)}</span> : null}
                  </div>

                  {editingId === it.id ? (
                    // تعديل التكلفة قبل الاعتماد
                    <div style={styles.editBox}>
                      <label style={styles.editLabel}>التكلفة المعتمدة (ريال):</label>
                      <div style={styles.editRow}>
                        <input
                          style={styles.editInput}
                          type="number"
                          min="0"
                          value={approvedCost}
                          onChange={(e) => setApprovedCost(e.target.value)}
                          placeholder={String(it.estimatedCost)}
                          disabled={busyThis}
                          dir="ltr"
                        />
                        <button style={styles.confirmBtn} onClick={() => decide(it.id, "approve", approvedCost)} disabled={busyThis}>
                          {busyThis ? "..." : "تأكيد الاعتماد"}
                        </button>
                        <button style={styles.cancelBtn} onClick={() => { setEditingId(""); setApprovedCost(""); }} disabled={busyThis}>
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={styles.actions}>
                      <button style={styles.approveBtn} onClick={() => decide(it.id, "approve")} disabled={busyThis}>
                        {busyThis ? "..." : "اعتماد التقديرية"}
                      </button>
                      <button style={styles.editBtn} onClick={() => { setEditingId(it.id); setApprovedCost(""); }} disabled={busyThis}>
                        تعديل ثم اعتماد
                      </button>
                      <button style={styles.rejectBtn} onClick={() => decide(it.id, "reject")} disabled={busyThis}>
                        رفض
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* قرارات سابقة */}
        {decidedItems.length > 0 ? (
          <>
            <h3 style={styles.section}>قرارات سابقة</h3>
            <div style={styles.list}>
              {decidedItems.map((it) => (
                <div key={it.id} style={styles.decidedRow}>
                  <span>{it.name}</span>
                  {it.costStatus === "approved" ? (
                    <span style={styles.approvedTag}>معتمد: {it.approvedCost} ﷼</span>
                  ) : (
                    <span style={styles.rejectedTag}>مرفوض</span>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : null}

        <p style={styles.hint}>
          اعتماد التكلفة يجعل الصنف جاهزًا للتسعير والبيع. التكلفة المعتمدة قد تختلف عن تقدير المشتريات.
        </p>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modal: { width: "100%", maxWidth: 580, background: "#fff", borderRadius: 12, padding: 28, fontFamily: "system-ui, sans-serif", direction: "rtl", textAlign: "right", maxHeight: "90vh", overflowY: "auto" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  section: { fontSize: 15, color: "#15803d", margin: "20px 0 12px", borderBottom: "2px solid #dcfce7", paddingBottom: 6 },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: { padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" },
  cTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  cName: { fontSize: 15 },
  estCost: { fontSize: 14, color: "#92400e", fontWeight: 600 },
  cMeta: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 },
  dealChip: { fontSize: 12, color: "#7c3aed", background: "#f3e8ff", padding: "2px 9px", borderRadius: 10, fontWeight: 600 },
  muted2: { fontSize: 12, color: "#94a3b8" },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  approveBtn: { flex: 1, minWidth: 110, padding: "9px", fontSize: 13, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 7, cursor: "pointer" },
  editBtn: { flex: 1, minWidth: 110, padding: "9px", fontSize: 13, fontWeight: 600, color: "#0891b2", background: "#cffafe", border: "none", borderRadius: 7, cursor: "pointer" },
  rejectBtn: { flex: 1, minWidth: 80, padding: "9px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 7, cursor: "pointer" },
  editBox: { marginTop: 4 },
  editLabel: { fontSize: 13, fontWeight: 600, color: "#0f172a", display: "block", marginBottom: 6 },
  editRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  editInput: { flex: 1, minWidth: 100, padding: "9px 12px", fontSize: 15, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" },
  confirmBtn: { padding: "9px 16px", fontSize: 13, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 7, cursor: "pointer" },
  cancelBtn: { padding: "9px 14px", fontSize: 13, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },
  decidedRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#f8fafc", borderRadius: 8, fontSize: 14 },
  approvedTag: { padding: "3px 10px", background: "#dcfce7", color: "#166534", borderRadius: 12, fontSize: 12, fontWeight: 600 },
  rejectedTag: { padding: "3px 10px", background: "#fee2e2", color: "#b91c1c", borderRadius: 12, fontSize: 12, fontWeight: 600 },
  hint: { marginTop: 16, padding: "10px 12px", background: "#f0fdf4", color: "#15803d", borderRadius: 8, fontSize: 13 },
  muted: { color: "#94a3b8", fontSize: 14 },
  error: { marginBottom: 16, padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14 },
};