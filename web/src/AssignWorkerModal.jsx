import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

const PERIOD_LABELS = { hourly: "بالساعة", daily: "يومي", monthly: "شهري", yearly: "سنوي" };

// نافذة إسناد العمالة لطلب (العمليات)
export default function AssignWorkerModal({ tenantId, request, onClose, onAssigned }) {
  const [assignments, setAssignments] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [assignSnap, workerSnap] = await Promise.all([
        getDocs(query(
          collection(db, "workerAssignments"),
          where("tenantId", "==", tenantId),
          where("requestId", "==", request.id)
        )),
        getDocs(query(collection(db, "users"), where("tenantId", "==", tenantId), where("role", "==", "worker"))),
      ]);
      const assignList = assignSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((a) => a.status === "active");
      assignList.sort((a, b) => (a.assignmentNumber || 0) - (b.assignmentNumber || 0));
      setAssignments(assignList);
      setWorkers(workerSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadData(); }, []);

  async function removeAssignment(a) {
    if (!confirm(`استبعاد ${a.workerName} من هذا الطلب؟`)) return;
    setBusyId(a.id);
    setError("");
    try {
      const fn = httpsCallable(functions, "removeWorkerAssignment");
      await fn({ assignmentId: a.id });
      await loadData();
      if (onAssigned) onAssigned();
    } catch (err) {
      setError(err.message || "تعذّر الاستبعاد.");
    } finally {
      setBusyId("");
    }
  }

  // العمال غير المُسندين لهذا الطلب
  const assignedUids = assignments.map((a) => a.workerUid);
  const availableWorkers = workers.filter((w) => !assignedUids.includes(w.id));

  // مطابقة المهنة المطلوبة (اقتراح، لا إلزام)
  const matchingWorkers = request.jobTitleId
    ? availableWorkers.filter((w) => w.jobTitleId === request.jobTitleId)
    : availableWorkers;
  const otherWorkers = request.jobTitleId
    ? availableWorkers.filter((w) => w.jobTitleId !== request.jobTitleId)
    : [];

  const fulfilled = request.fulfilledQuantity || 0;
  const remaining = Math.max(0, (request.quantity || 0) - fulfilled);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>إسناد عمالة — REQ-{request.requestNumber}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.reqSummary}>
          <div style={styles.sumItem}><span style={styles.sumLabel}>المشروع</span><span style={styles.sumValue}>{request.projectName}</span></div>
          <div style={styles.sumItem}><span style={styles.sumLabel}>المهنة</span><span style={styles.sumValue}>{request.jobTitleName || "—"}</span></div>
          <div style={styles.sumItem}><span style={styles.sumLabel}>الفترة</span><span style={styles.sumValue}>{request.shiftName || "—"}</span></div>
          <div style={styles.sumItem}><span style={styles.sumLabel}>المطلوب</span><span style={styles.sumValue}>{request.quantity}</span></div>
        </div>

        <div style={styles.progressBar}>
          <div style={styles.progressInfo}>
            <span>تم إسناد <strong>{fulfilled}</strong> من <strong>{request.quantity}</strong></span>
            <span style={styles.remaining}>المتبقّي: {remaining}</span>
          </div>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${request.quantity > 0 ? Math.min(100, (fulfilled / request.quantity) * 100) : 0}%` }} />
          </div>
        </div>

        {error ? <div style={styles.error}>{error}</div> : null}

        {/* العمال المُسندون */}
        <h3 style={styles.sectionTitle}>العمالة المُسندة ({assignments.length})</h3>
        {loading ? (
          <p style={styles.muted}>جارٍ التحميل...</p>
        ) : assignments.length === 0 ? (
          <p style={styles.muted}>لم يُسنَد أحد بعد.</p>
        ) : (
          <div style={styles.assignList}>
            {assignments.map((a) => (
              <div key={a.id} style={styles.assignCard}>
                <div style={styles.assignInfo}>
                  <strong style={styles.assignName}>{a.workerName}</strong>
                  {a.workerJobTitle ? <span style={styles.assignTitle}>{a.workerJobTitle}</span> : null}
                  <span style={styles.assignPrice}>
                    {a.rentalPrice.toLocaleString()} ﷼ / {PERIOD_LABELS[a.rentalPeriod] || a.rentalPeriod}
                  </span>
                </div>
                <button style={styles.removeBtn} onClick={() => removeAssignment(a)} disabled={busyId === a.id}>
                  {busyId === a.id ? "..." : "استبعاد"}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* زر إضافة إسناد */}
        {!showForm ? (
          <button style={styles.addBtn} onClick={() => setShowForm(true)} disabled={request.status === "cancelled"}>
            + إسناد عامل
          </button>
        ) : (
          <AssignForm
            tenantId={tenantId}
            request={request}
            matchingWorkers={matchingWorkers}
            otherWorkers={otherWorkers}
            onCancel={() => setShowForm(false)}
            onDone={() => { setShowForm(false); loadData(); if (onAssigned) onAssigned(); }}
          />
        )}
      </div>
    </div>
  );
}

// ═══ نموذج إسناد عامل واحد ═══
function AssignForm({ tenantId, request, matchingWorkers, otherWorkers, onCancel, onDone }) {
  const [workerUid, setWorkerUid] = useState("");
  const [rentalPrice, setRentalPrice] = useState("");
  const [rentalPeriod, setRentalPeriod] = useState("daily");
  const [startDate, setStartDate] = useState(request.startDate || "");
  const [endDate, setEndDate] = useState(request.endDate || "");
  const [notes, setNotes] = useState("");
  const [conflicts, setConflicts] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [acknowledgeConflict, setAcknowledgeConflict] = useState(false);

  // فحص التعارض عند اختيار عامل أو تغيير التواريخ
  useEffect(() => {
    if (!workerUid) { setConflicts(null); return; }
    let cancelled = false;
    async function check() {
      setChecking(true);
      setConflicts(null);
      setAcknowledgeConflict(false);
      try {
        const fn = httpsCallable(functions, "checkWorkerConflicts");
        const res = await fn({
          workerUid: workerUid,
          shiftStartTime: request.shiftStartTime || null,
          shiftDurationHours: request.shiftDurationHours || null,
          startDate: startDate || request.startDate || "",
          endDate: endDate || request.endDate || "",
        });
        if (!cancelled) setConflicts(res.data);
      } catch (err) {
        if (!cancelled) setConflicts(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, [workerUid, startDate, endDate]);

  const hasConflict = conflicts && conflicts.conflicts && conflicts.conflicts.length > 0;

  async function save() {
    setError("");
    if (!workerUid) { setError("اختر العامل."); return; }
    const price = Number(rentalPrice);
    if (!Number.isFinite(price) || price < 0) { setError("سعر التأجير غير صحيح."); return; }
    if (hasConflict && !acknowledgeConflict) { setError("يوجد تعارض. أكّد المتابعة رغم التعارض أو اختر عاملًا آخر."); return; }

    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createWorkerAssignment");
      await fn({
        requestId: request.id,
        workerUid: workerUid,
        rentalPrice: price,
        rentalPeriod: rentalPeriod,
        startDate: startDate,
        endDate: endDate,
        notes: notes,
      });
      onDone();
    } catch (e) {
      setError(e.message || "تعذّر الإسناد.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.formBox}>
      <h4 style={styles.formTitle}>إسناد عامل جديد</h4>

      <label style={styles.label}>العامل *</label>
      <select style={styles.input} value={workerUid} onChange={(e) => setWorkerUid(e.target.value)} disabled={saving}>
        <option value="">— اختر العامل —</option>
        {matchingWorkers.length > 0 ? (
          <optgroup label={`مطابقون للمهنة (${request.jobTitleName || ""})`}>
            {matchingWorkers.map((w) => <option key={w.id} value={w.id}>{w.name}{w.jobTitleName ? ` — ${w.jobTitleName}` : ""}</option>)}
          </optgroup>
        ) : null}
        {otherWorkers.length > 0 ? (
          <optgroup label="عمّال آخرون">
            {otherWorkers.map((w) => <option key={w.id} value={w.id}>{w.name}{w.jobTitleName ? ` — ${w.jobTitleName}` : ""}</option>)}
          </optgroup>
        ) : null}
      </select>

      {/* كشف التعارض */}
      {checking ? (
        <div style={styles.checking}>⏳ جارٍ فحص توفّر العامل...</div>
      ) : null}

      {conflicts && !checking ? (
        <>
          {conflicts.activeCount > 0 ? (
            <div style={styles.activeInfo}>
              هذا العامل مُسنَد حاليًا في <strong>{conflicts.activeCount}</strong> مشروع آخر.
            </div>
          ) : (
            <div style={styles.freeInfo}>✓ العامل متفرّغ، لا إسنادات حالية.</div>
          )}

          {hasConflict ? (
            <div style={styles.conflictBox}>
              <div style={styles.conflictTitle}>⚠️ تعارض زمني محتمل</div>
              <p style={styles.conflictDesc}>هذا العامل مُسنَد في نفس الفترة الزمنية للمشاريع التالية:</p>
              {conflicts.conflicts.map((c) => (
                <div key={c.id} style={styles.conflictItem}>
                  <strong>{c.projectName}</strong> (PRJ-{c.projectNumber})
                  {c.shiftName ? ` · ${c.shiftName}` : ""}
                  <span style={styles.conflictDates} dir="ltr"> {c.startDate || "—"} ← {c.endDate || "مفتوح"}</span>
                </div>
              ))}
              <label style={styles.ackRow}>
                <input type="checkbox" checked={acknowledgeConflict} onChange={(e) => setAcknowledgeConflict(e.target.checked)} disabled={saving} />
                <span style={styles.ackText}>أُدرك التعارض وأرغب في الإسناد رغم ذلك (قرار العمليات)</span>
              </label>
            </div>
          ) : null}
        </>
      ) : null}

      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>سعر التأجير (الإيراد) *</label>
          <input style={styles.input} type="number" min="0" value={rentalPrice} onChange={(e) => setRentalPrice(e.target.value)} placeholder="0" disabled={saving} dir="ltr" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>الدورية</label>
          <select style={styles.input} value={rentalPeriod} onChange={(e) => setRentalPeriod(e.target.value)} disabled={saving}>
            <option value="hourly">بالساعة</option>
            <option value="daily">يومي</option>
            <option value="monthly">شهري</option>
            <option value="yearly">سنوي</option>
          </select>
        </div>
      </div>

      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>بداية الإسناد</label>
          <input style={styles.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={saving} dir="ltr" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>نهاية الإسناد</label>
          <input style={styles.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={saving} dir="ltr" />
        </div>
      </div>

      <label style={styles.label}>ملاحظات</label>
      <input style={styles.input} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} />

      {error ? <div style={styles.error}>{error}</div> : null}

      <div style={styles.formActions}>
        <button style={styles.saveBtn} onClick={save} disabled={saving || checking}>
          {saving ? "جارٍ الإسناد..." : "تأكيد الإسناد"}
        </button>
        <button style={styles.cancelBtn} onClick={onCancel} disabled={saving}>إلغاء</button>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 110 },
  modal: { width: "100%", maxWidth: 620, background: "#fff", borderRadius: 12, padding: 28, direction: "rtl", textAlign: "right", maxHeight: "94vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { margin: 0, fontSize: 19, color: "#ea580c" },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },

  reqSummary: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, padding: 14, background: "#fff7ed", borderRadius: 10, marginBottom: 16 },
  sumItem: { display: "flex", flexDirection: "column", gap: 3 },
  sumLabel: { fontSize: 11, color: "#9a3412" },
  sumValue: { fontSize: 14, color: "#0f172a", fontWeight: 600 },

  progressBar: { marginBottom: 20 },
  progressInfo: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#475569", marginBottom: 6 },
  remaining: { color: "#ea580c", fontWeight: 600 },
  progressTrack: { height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", background: "#16a34a", borderRadius: 4, transition: "width 0.3s" },

  sectionTitle: { fontSize: 15, color: "#0f172a", margin: "8px 0 12px", paddingBottom: 6, borderBottom: "2px solid #f1f5f9" },
  assignList: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 },
  assignCard: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#f8fafc", borderRadius: 8, gap: 12 },
  assignInfo: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  assignName: { fontSize: 14, color: "#0f172a" },
  assignTitle: { fontSize: 12, color: "#7c3aed" },
  assignPrice: { fontSize: 13, color: "#16a34a", fontWeight: 600 },
  removeBtn: { padding: "7px 16px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 7, cursor: "pointer", flexShrink: 0 },

  addBtn: { width: "100%", padding: "12px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer" },

  formBox: { padding: 16, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" },
  formTitle: { margin: "0 0 12px", fontSize: 15, color: "#0f172a" },
  label: { display: "block", margin: "12px 0 6px", fontSize: 13, fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  row: { display: "flex", gap: 12 },

  checking: { padding: "10px 12px", background: "#eff6ff", color: "#1e40af", borderRadius: 8, fontSize: 13, marginTop: 10 },
  activeInfo: { padding: "10px 12px", background: "#fffbeb", color: "#92400e", borderRadius: 8, fontSize: 13, marginTop: 10 },
  freeInfo: { padding: "10px 12px", background: "#f0fdf4", color: "#166534", borderRadius: 8, fontSize: 13, marginTop: 10, fontWeight: 600 },

  conflictBox: { padding: 14, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, marginTop: 10 },
  conflictTitle: { fontSize: 14, fontWeight: 700, color: "#b91c1c", marginBottom: 8 },
  conflictDesc: { fontSize: 13, color: "#7f1d1d", marginBottom: 10 },
  conflictItem: { padding: "8px 10px", background: "#fff", borderRadius: 6, fontSize: 13, color: "#0f172a", marginBottom: 6 },
  conflictDates: { color: "#94a3b8", fontSize: 12 },
  ackRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" },
  ackText: { fontSize: 13, color: "#7f1d1d", fontWeight: 600 },

  formActions: { display: "flex", gap: 8, marginTop: 18 },
  saveBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },
  cancelBtn: { padding: "11px 20px", fontSize: 14, color: "#475569", background: "#e2e8f0", border: "none", borderRadius: 8, cursor: "pointer" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginTop: 12 },
  muted: { color: "#94a3b8", fontSize: 14 },
};