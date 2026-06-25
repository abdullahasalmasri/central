import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

const ALL_MODULES = [
  { id: "hr", label: "الموارد البشرية" },
  { id: "finance", label: "المالية" },
  { id: "attendance", label: "الحضور والانصراف" },
  { id: "reviews", label: "التقييمات" },
];

// نموذج إنشاء موظف إداري — مع اختيار الصلاحيات والمدير المباشر.
// currentUid/currentName: المستخدم المُنشئ (يكون المدير الافتراضي).
// currentIsOwner: هل المُنشئ هو المالك (عندها المدير الافتراضي = المالك مباشرة).
export default function AddEmployeeModal({
  allowedModules, managers, currentUid, currentName, currentIsOwner, ownerLabel, onClose, onCreated,
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState([]);
  // الافتراضي: المُنشئ هو المدير المباشر. المالك يُمثّل بـ "" (جذر الشجرة)
  const [managerUid, setManagerUid] = useState(currentIsOwner ? "" : (currentUid || ""));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // الوحدات التي يحق للمستدعي منحها (صلاحياته هو)
  const grantable = ALL_MODULES.filter(
    (m) => !allowedModules || allowedModules.includes(m.id)
  );

  // بناء خيارات المدير — مع ضمان ظهور المُنشئ نفسه دائمًا
  const managerChoices = [];
  if (currentIsOwner) {
    managerChoices.push({ value: "", label: `${currentName || "المالك"} (أنا — الإدارة العليا)` });
  } else {
    managerChoices.push({ value: currentUid, label: `${currentName || "أنا"} (أنا)` });
    managerChoices.push({ value: "", label: ownerLabel || "المالك (الإدارة العليا)" });
  }
  for (const m of (managers || [])) {
    if (m.id === currentUid) continue; // المُنشئ مضاف بالأعلى
    if (m.role === "owner") continue; // المالك مضاف كـ ""
    managerChoices.push({ value: m.id, label: m.name });
  }

  function toggleModule(id) {
    setPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    setError("");
    if (name.trim().length < 2) {
      setError("اسم الموظف مطلوب (حرفان على الأقل).");
      return;
    }
    if (!email.includes("@")) {
      setError("البريد الإلكتروني غير صحيح.");
      return;
    }
    if (password.length < 6) {
      setError("كلمة المرور المؤقتة 6 أحرف على الأقل.");
      return;
    }
    if (permissions.length === 0) {
      setError("اختر صلاحية واحدة على الأقل.");
      return;
    }

    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createEmployee");
      await fn({
        name: name.trim(),
        email: email.trim(),
        password: password,
        permissions: permissions,
        managerUid: managerUid || "", // فارغ = تحت المالك مباشرة
      });
      onCreated();
    } catch (err) {
      setError(err.message || "تعذّر إنشاء الموظف.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.head}>
          <h2 style={styles.title}>إضافة موظف إداري</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <label style={styles.label}>اسم الموظف</label>
        <input
          style={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثال: سعد المطيري"
          disabled={saving}
        />

        <label style={styles.label}>البريد الإلكتروني</label>
        <input
          style={styles.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="saad@company.com"
          disabled={saving}
          dir="ltr"
        />

        <label style={styles.label}>كلمة المرور المؤقتة</label>
        <input
          style={styles.input}
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="6 أحرف على الأقل"
          disabled={saving}
          dir="ltr"
        />

        <label style={styles.label}>المدير المباشر</label>
        <select
          style={styles.input}
          value={managerUid}
          onChange={(e) => setManagerUid(e.target.value)}
          disabled={saving}
        >
          {managerChoices.map((c) => (
            <option key={c.value || "__owner__"} value={c.value}>{c.label}</option>
          ))}
        </select>
        <p style={styles.fieldHint}>الموظف الجديد يتبع المدير المختار. الافتراضي أنت.</p>

        <label style={styles.label}>الصلاحيات</label>
        <div style={styles.modules}>
          {grantable.map((m) => (
            <label
              key={m.id}
              style={{
                ...styles.moduleChip,
                ...(permissions.includes(m.id) ? styles.moduleChipOn : {}),
              }}
            >
              <input
                type="checkbox"
                checked={permissions.includes(m.id)}
                onChange={() => toggleModule(m.id)}
                disabled={saving}
                style={{ display: "none" }}
              />
              {m.label}
            </label>
          ))}
        </div>

        {error ? <div style={styles.error}>{error}</div> : null}

        <button style={styles.save} onClick={handleSave} disabled={saving}>
          {saving ? "جارٍ الإنشاء..." : "إنشاء الموظف"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100,
  },
  modal: {
    width: "100%", maxWidth: 480, background: "#fff", borderRadius: 12, padding: 28,
    fontFamily: "system-ui, sans-serif", direction: "rtl", textAlign: "right",
    maxHeight: "90vh", overflowY: "auto",
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  label: { display: "block", margin: "14px 0 6px", fontSize: 14, fontWeight: 600 },
  input: {
    width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #ccc",
    borderRadius: 8, boxSizing: "border-box", background: "#fff",
  },
  fieldHint: { margin: "6px 0 0", fontSize: 12, color: "#94a3b8" },
  modules: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 },
  moduleChip: {
    padding: "8px 14px", fontSize: 14, borderRadius: 20, cursor: "pointer",
    border: "1px solid #cbd5e1", background: "#fff", color: "#475569", userSelect: "none",
  },
  moduleChipOn: { background: "#2563eb", color: "#fff", borderColor: "#2563eb", fontWeight: 600 },
  error: { marginTop: 16, padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14 },
  save: {
    width: "100%", marginTop: 20, padding: "12px", fontSize: 16, fontWeight: 600,
    color: "#fff", background: "#2563eb", border: "none", borderRadius: 8, cursor: "pointer",
  },
};
