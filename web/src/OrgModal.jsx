import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// واجهة الهيكل التنظيمي: شجرة الموظفين الإداريين + العمّال تحت مشرفيهم،
// مع تغيير مدير أي موظف أو مشرف أي عامل (دون حذف الحساب).
// staff: الموظفون الإداريون + المالك. workers: العمّال.
export default function OrgModal({ staff, workers, ownerUid, ownerName, onClose, onUpdated }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState("");
  const [newManager, setNewManager] = useState("");

  const employees = (staff || []).filter((s) => s.role === "staff");
  const allWorkers = workers || [];
  const OWNER_KEY = "__owner__";

  // خريطة الموظفين الأبناء حسب المدير (managerUid)
  const childrenMap = {};
  for (const emp of employees) {
    const key = emp.managerUid || OWNER_KEY;
    if (!childrenMap[key]) childrenMap[key] = [];
    childrenMap[key].push(emp);
  }
  // خريطة العمّال حسب المشرف (supervisorUid)
  const workersByMgr = {};
  for (const w of allWorkers) {
    const key = w.supervisorUid || OWNER_KEY;
    if (!workersByMgr[key]) workersByMgr[key] = [];
    workersByMgr[key].push(w);
  }

  async function save(personUid) {
    setBusy(personUid);
    setError("");
    try {
      const fn = httpsCallable(functions, "setManager");
      await fn({ employeeUid: personUid, managerUid: newManager });
      setEditing("");
      setNewManager("");
      onUpdated();
    } catch (err) {
      setError(err.message || "تعذّر تغيير المدير.");
    } finally {
      setBusy("");
    }
  }

  function startEdit(person, isWorker) {
    setEditing(person.id);
    // القيمة الحالية: الموظف managerUid (""=المالك)؛ العامل supervisorUid (ownerUid=المالك)
    setNewManager(isWorker ? (person.supervisorUid || ownerUid) : (person.managerUid || ""));
  }

  // محرّر المدير/المشرف. للعامل قيمة المالك = ownerUid؛ للموظف = ""
  function renderEditor(person, isWorker) {
    return (
      <div style={styles.editRow}>
        <select
          style={styles.select}
          value={newManager}
          onChange={(e) => setNewManager(e.target.value)}
          disabled={busy === person.id}
        >
          <option value={isWorker ? ownerUid : ""}>{ownerName || "المالك"} (الإدارة العليا)</option>
          {employees.filter((m) => m.id !== person.id).map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button style={styles.saveBtn} onClick={() => save(person.id)} disabled={busy === person.id}>
          {busy === person.id ? "..." : "حفظ"}
        </button>
        <button
          style={styles.cancelBtn}
          onClick={() => { setEditing(""); setNewManager(""); }}
          disabled={busy === person.id}
        >
          إلغاء
        </button>
      </div>
    );
  }

  // عقدة عامل (ورقة في الشجرة)
  function workerNode(w, depth) {
    return (
      <div key={w.id} style={{ ...styles.workerNode, marginRight: depth * 24 }}>
        <div style={styles.nodeInfo}>
          <span style={styles.nodeName}>👷 {w.name}</span>
          <span style={styles.workerTag}>عامل</span>
        </div>
        {editing === w.id ? renderEditor(w, true) : (
          <button style={styles.changeBtnWorker} onClick={() => startEdit(w, true)}>تغيير المشرف</button>
        )}
      </div>
    );
  }

  // عقدة موظف + عمّاله + أبنائه الإداريين (تعاودي)
  function staffNode(uid, depth) {
    // الموظفون تحت المالك managerUid=null (OWNER_KEY)؛ العمّال تحت المالك supervisorUid=ownerUid (uid فعلي)
    const staffKey = uid === ownerUid ? OWNER_KEY : uid;
    const kids = childrenMap[staffKey] || [];
    const myWorkers = workersByMgr[uid] || [];
    return (
      <>
        {myWorkers.map((w) => workerNode(w, depth))}
        {kids.map((emp) => (
          <div key={emp.id}>
            <div style={{ ...styles.node, marginRight: depth * 24 }}>
              <div style={styles.nodeInfo}>
                <span style={styles.nodeName}>{emp.name}</span>
                <span style={styles.nodePerms}>
                  {emp.permissions && emp.permissions.length > 0
                    ? emp.permissions.map(permLabel).join("، ")
                    : "بلا صلاحيات"}
                </span>
              </div>
              {editing === emp.id ? renderEditor(emp, false) : (
                <button style={styles.changeBtn} onClick={() => startEdit(emp, false)}>تغيير المدير</button>
              )}
            </div>
            {staffNode(emp.id, depth + 1)}
          </div>
        ))}
      </>
    );
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.head}>
          <h2 style={styles.title}>الهيكل التنظيمي</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        {error ? <div style={styles.error}>{error}</div> : null}

        {/* جذر الشجرة: المالك */}
        <div style={styles.ownerNode}>
          <span style={styles.ownerBadge}>الإدارة العليا</span>
          <strong>{ownerName || "المالك"}</strong>
        </div>

        {employees.length === 0 && allWorkers.length === 0 ? (
          <p style={styles.muted}>لا يوجد موظفون أو عمّال بعد.</p>
        ) : (
          <div style={styles.tree}>{staffNode(ownerUid, 0)}</div>
        )}

        <p style={styles.hint}>
          الشجرة تتبع سلسلة الإدارة. يمكنك تغيير مدير أي موظف أو مشرف أي عامل دون حذف حسابه.
        </p>
      </div>
    </div>
  );
}

function permLabel(p) {
  const map = { hr: "موارد بشرية", finance: "مالية", attendance: "حضور", reviews: "تقييمات" };
  return map[p] || p;
}

const styles = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100,
  },
  modal: {
    width: "100%", maxWidth: 640, background: "#fff", borderRadius: 12, padding: 28,
    fontFamily: "system-ui, sans-serif", direction: "rtl", textAlign: "right",
    maxHeight: "90vh", overflowY: "auto",
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  ownerNode: {
    display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
    background: "#1e293b", color: "#fff", borderRadius: 10, marginBottom: 8,
  },
  ownerBadge: {
    padding: "3px 10px", background: "#475569", color: "#fff", borderRadius: 12, fontSize: 12, fontWeight: 600,
  },
  tree: { display: "flex", flexDirection: "column", gap: 8 },
  node: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 16px", background: "#f8fafc", border: "1px solid #e2e8f0",
    borderRadius: 10, marginBottom: 8, gap: 12,
  },
  workerNode: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 16px", background: "#fffbeb", border: "1px solid #fde68a",
    borderRadius: 10, marginBottom: 8, gap: 12,
  },
  nodeInfo: { display: "flex", flexDirection: "column", gap: 4 },
  nodeName: { fontSize: 15, fontWeight: 600 },
  nodePerms: { fontSize: 12, color: "#64748b" },
  workerTag: { fontSize: 11, color: "#b45309", fontWeight: 600 },
  changeBtn: {
    padding: "7px 14px", fontSize: 13, color: "#0f766e", background: "#ccfbf1",
    border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, flexShrink: 0,
  },
  changeBtnWorker: {
    padding: "7px 14px", fontSize: 13, color: "#b45309", background: "#fef3c7",
    border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, flexShrink: 0,
  },
  editRow: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" },
  select: { padding: "8px 10px", fontSize: 13, border: "1px solid #ccc", borderRadius: 6, background: "#fff" },
  saveBtn: {
    padding: "8px 14px", fontSize: 13, color: "#fff", background: "#16a34a",
    border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600,
  },
  cancelBtn: {
    padding: "8px 14px", fontSize: 13, color: "#475569", background: "#f1f5f9",
    border: "none", borderRadius: 6, cursor: "pointer",
  },
  error: { marginBottom: 16, padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14 },
  hint: { marginTop: 16, padding: "10px 12px", background: "#f0fdfa", color: "#0f766e", borderRadius: 8, fontSize: 13 },
  muted: { color: "#94a3b8", fontSize: 14 },
};
