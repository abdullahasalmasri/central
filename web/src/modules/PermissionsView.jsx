import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   الصلاحيات — الإدارة العليا
   إدارة صلاحيات الموظفين على الوحدات الرئيسية (8 وحدات).
   المالك يملك صلاحية كاملة دائمًا. التعديل عبر setUserPermissions.
   ============================================================ */

const MODULES = [
  { id: "finance", name: "المالية", icon: "💰", color: "#059669" },
  { id: "hr", name: "الموارد البشرية", icon: "👥", color: "#2563eb" },
  { id: "operations", name: "العمليات", icon: "⚙️", color: "#ea580c" },
  { id: "projects", name: "المشاريع", icon: "📁", color: "#0891b2" },
  { id: "assets", name: "الأصول", icon: "🏭", color: "#0e7490" },
  { id: "procurement", name: "المشتريات", icon: "🛒", color: "#db2777" },
  { id: "sales", name: "المبيعات والتسويق", icon: "📣", color: "#e11d48" },
  { id: "attendance", name: "الحضور", icon: "🕐", color: "#7c3aed" },
  { id: "reviews", name: "التقييم", icon: "⭐", color: "#ca8a04" },
];
const ROLE_LABELS = { owner: "المالك", staff: "موظف", worker: "عامل" };

export default function PermissionsView() {
  const [tenantId, setTenantId] = useState("");
  const [users, setUsers] = useState([]);
  const [myRole, setMyRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editModal, setEditModal] = useState(null); // { uid, name, permissions }

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) { setError("لم يتم تسجيل الدخول."); setLoading(false); return; }
        const userSnap = await getDoc(doc(db, "users", uid));
        const tid = userSnap.exists() ? userSnap.data().tenantId : null;
        if (!tid) { setError("تعذّر تحديد المنشأة."); setLoading(false); return; }
        setMyRole(userSnap.data().role || "");
        setTenantId(tid);
      } catch (e) {
        setError("تعذّر تحميل بيانات المستخدم."); setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (tenantId) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const snap = await getDocs(query(collection(db, "users"), where("tenantId", "==", tenantId)));
      const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((u) => u.role !== "worker");
      // المالك أولاً ثم الموظفون
      list.sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0));
      setUsers(list);
    } catch (e) {
      setError("تعذّر تحميل الموظفين.");
    } finally {
      setLoading(false);
    }
  }

  const isOwner = myRole === "owner";

  async function savePermissions(uid, permissions) {
    const fn = httpsCallable(functions, "setUserPermissions");
    await fn({ uid, permissions });
    setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, permissions } : u)));
    setEditModal(null);
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>🔐 الصلاحيات</h1>
          <p style={styles.pageSub}>صلاحيات الموظفين على وحدات النظام — مَن يصل لأي قسم.</p>
        </div>
        <div style={styles.statBadge}>{users.filter((u) => u.role !== "owner").length} موظف</div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {!loading && !isOwner ? (
        <div style={styles.infoBox}>👁 أنت تشاهد الصلاحيات فقط. تعديلها متاح للمالك.</div>
      ) : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : users.length === 0 ? (
        <div style={styles.warnBox}>لا يوجد موظفون. أضف موظفين من الموارد البشرية ← شؤون الموظفين.</div>
      ) : (
        <div style={styles.list}>
          {users.map((u) => {
            const owner = u.role === "owner";
            const perms = owner ? MODULES.map((m) => m.id) : (u.permissions || []);
            return (
              <div key={u.uid} style={{ ...styles.userCard, ...(owner ? styles.ownerCard : {}) }}>
                <div style={styles.userHead}>
                  <div style={styles.userInfo}>
                    <div style={{ ...styles.avatar, background: owner ? "#7c3aed" : "#e2e8f0", color: owner ? "#fff" : "#64748b" }}>
                      {(u.name || "؟").charAt(0)}
                    </div>
                    <div>
                      <div style={styles.userName}>{u.name || "—"}</div>
                      <div style={styles.userMeta}>
                        <span style={{ ...styles.roleChip, ...(owner ? styles.ownerChip : {}) }}>{ROLE_LABELS[u.role] || u.role}</span>
                        {u.email ? <span style={styles.userEmail}>{u.email}</span> : null}
                      </div>
                    </div>
                  </div>
                  {isOwner && !owner ? (
                    <button style={styles.editBtn} onClick={() => setEditModal({ uid: u.uid, name: u.name, permissions: [...perms] })}>تعديل الصلاحيات</button>
                  ) : null}
                </div>

                {owner ? (
                  <div style={styles.ownerNote}>👑 المالك يملك صلاحية كاملة على جميع الوحدات (لا تحتاج تعيين).</div>
                ) : (
                  <div style={styles.permGrid}>
                    {perms.length === 0 ? <span style={styles.noPerms}>لا توجد صلاحيات — لا يصل لأي قسم</span> : MODULES.filter((m) => perms.includes(m.id)).map((m) => (
                      <span key={m.id} style={{ ...styles.permChip, background: m.color + "15", color: m.color }}>{m.icon} {m.name}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editModal ? (
        <PermissionsModal
          modal={editModal}
          onClose={() => setEditModal(null)}
          onSave={(perms) => savePermissions(editModal.uid, perms)}
        />
      ) : null}
    </div>
  );
}

function PermissionsModal({ modal, onClose, onSave }) {
  const [selected, setSelected] = useState(new Set(modal.permissions));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  async function save() {
    setErr("");
    const perms = Array.from(selected);
    if (perms.length === 0) { setErr("اختر صلاحية واحدة على الأقل (أو يبقى الموظف بلا وصول)."); return; }
    setSaving(true);
    try {
      await onSave(perms);
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>صلاحيات {modal.name}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {err ? <div style={styles.error}>{err}</div> : null}
        <p style={styles.modalNote}>اختر الوحدات التي يمكن للموظف الوصول إليها:</p>

        <div style={styles.modGrid}>
          {MODULES.map((m) => {
            const on = selected.has(m.id);
            return (
              <button key={m.id} style={{ ...styles.modBtn, ...(on ? { borderColor: m.color, background: m.color + "12" } : {}) }} onClick={() => toggle(m.id)} disabled={saving}>
                <span style={styles.modIcon}>{m.icon}</span>
                <span style={{ ...styles.modName, color: on ? m.color : "#475569" }}>{m.name}</span>
                <span style={{ ...styles.modCheck, ...(on ? { background: m.color, borderColor: m.color } : {}) }}>{on ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>

        <div style={styles.selCount}>{selected.size} وحدة مختارة</div>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ الصلاحيات"}</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#7c3aed", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  statBadge: { background: "#f3e8ff", color: "#7c3aed", borderRadius: 20, padding: "8px 18px", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },
  infoBox: { padding: "12px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13, color: "#64748b", marginBottom: 18 },

  list: { display: "flex", flexDirection: "column", gap: 14 },
  userCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "18px 20px" },
  ownerCard: { borderColor: "#e9d5ff", background: "#faf5ff" },
  userHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" },
  userInfo: { display: "flex", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, flexShrink: 0 },
  userName: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  userMeta: { display: "flex", alignItems: "center", gap: 10, marginTop: 3, flexWrap: "wrap" },
  roleChip: { fontSize: 11, fontWeight: 700, color: "#475569", background: "#f1f5f9", borderRadius: 6, padding: "2px 10px" },
  ownerChip: { background: "#7c3aed", color: "#fff" },
  userEmail: { fontSize: 12, color: "#94a3b8" },
  editBtn: { padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "#7c3aed", background: "#f3e8ff", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  ownerNote: { fontSize: 13, color: "#6b21a8", background: "#f3e8ff", borderRadius: 8, padding: "10px 14px" },
  permGrid: { display: "flex", flexWrap: "wrap", gap: 8 },
  permChip: { fontSize: 13, fontWeight: 600, borderRadius: 8, padding: "6px 12px" },
  noPerms: { fontSize: 13, color: "#dc2626", background: "#fef2f2", borderRadius: 8, padding: "8px 14px", fontWeight: 600 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  modalNote: { fontSize: 13, color: "#64748b", margin: "0 0 16px" },

  modGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 },
  modBtn: { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#fff", border: "2px solid #e2e8f0", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "right" },
  modIcon: { fontSize: 20 },
  modName: { fontSize: 14, fontWeight: 600, flex: 1 },
  modCheck: { width: 20, height: 20, borderRadius: 6, border: "2px solid #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 800, flexShrink: 0 },
  selCount: { fontSize: 13, color: "#7c3aed", fontWeight: 700, textAlign: "center", marginBottom: 4 },

  modalActions: { display: "flex", gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 8, cursor: "pointer" },
};
