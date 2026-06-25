import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

// نموذج إضافة عامل. currentUid/currentName: المُنشئ (المشرف الافتراضي). currentIsOwner: هل المُنشئ هو المالك.
export default function AddWorkerModal({ members, tenantId, currentUid, currentName, currentIsOwner, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [supervisorUid, setSupervisorUid] = useState(currentUid || "");
  const [jobTitleId, setJobTitleId] = useState("");
  const [jobTitles, setJobTitles] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // خيارات المشرف — مع ضمان ظهور المُنشئ نفسه دائمًا
  const supervisorChoices = [];
  supervisorChoices.push({ value: currentUid, label: `${currentName || "أنا"} (أنا)` });
  if (!currentIsOwner) {
    const ownerMember = (members || []).find((m) => m.role === "owner");
    if (ownerMember) supervisorChoices.push({ value: ownerMember.id, label: `${ownerMember.name} (المالك)` });
  }
  for (const m of (members || [])) {
    if (m.id === currentUid) continue;
    if (m.role === "owner") continue;
    if (m.role !== "staff") continue;
    supervisorChoices.push({ value: m.id, label: `${m.name} (موظف)` });
  }

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "jobTitles"), where("tenantId", "==", tenantId)));
        setJobTitles(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.isActive !== false));
      } catch (e) {
        // تجاهل — المهنة اختيارية
      }
    })();
  }, [tenantId]);

  async function handleCreate() {
    setError("");
    if (name.trim().length < 2) { setError("اسم العامل مطلوب (حرفان على الأقل)."); return; }
    if (!email.includes("@")) { setError("البريد الإلكتروني غير صحيح."); return; }
    if (password.length < 6) { setError("كلمة المرور المؤقتة 6 أحرف على الأقل."); return; }
    if (!supervisorUid) { setError("اختر مشرفًا للعامل."); return; }

    setLoading(true);
    try {
      const fn = httpsCallable(functions, "createWorker");
      await fn({
        name: name.trim(), email: email.trim(), password: password,
        supervisorUid: supervisorUid, employeeNumber: employeeNumber.trim(), jobTitleId: jobTitleId,
      });
      onCreated();
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>إضافة عامل جديد</h2>
        <p style={styles.hint}>أنشئ حساب العامل بكلمة مرور مؤقتة، واربطه بمشرفه المباشر ومهنته.</p>

        <label style={styles.label}>اسم العامل</label>
        <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: عبدالرحمن العتيبي" disabled={loading} />

        <label style={styles.label}>البريد الإلكتروني</label>
        <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="worker@company.com" disabled={loading} />

        <label style={styles.label}>كلمة المرور المؤقتة</label>
        <input style={styles.input} type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="يغيّرها العامل أول دخول" disabled={loading} />

        <label style={styles.label}>الرقم الوظيفي (اختياري)</label>
        <input style={styles.input} value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} placeholder="مثال: W-1001" disabled={loading} />

        <label style={styles.label}>المهنة (اختياري)</label>
        <select style={styles.input} value={jobTitleId} onChange={(e) => setJobTitleId(e.target.value)} disabled={loading}>
          <option value="">— بدون مهنة —</option>
          {jobTitles.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
        {jobTitles.length === 0 ? (
          <span style={styles.fieldHint}>لا توجد مهن مُعرّفة. أنشئها من الموارد البشرية ← المهن.</span>
        ) : (
          <span style={styles.fieldHint}>المهنة تساعد في مطابقة العامل مع طلبات الموارد عند الإسناد.</span>
        )}

        <label style={styles.label}>المشرف المباشر</label>
        <select style={styles.input} value={supervisorUid} onChange={(e) => setSupervisorUid(e.target.value)} disabled={loading}>
          {supervisorChoices.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
        </select>
        <span style={styles.fieldHint}>الافتراضي أنت. يمكنك تغيير المشرف لاحقًا من الهيكل التنظيمي.</span>

        {error ? <div style={styles.error}>{error}</div> : null}

        <div style={styles.actions}>
          <button style={styles.cancel} onClick={onClose} disabled={loading}>إلغاء</button>
          <button style={styles.create} onClick={handleCreate} disabled={loading}>
            {loading ? "جارٍ الإنشاء..." : "إنشاء العامل"}
          </button>
        </div>
      </div>
    </div>
  );
}

function mapError(err) {
  const msg = err && err.message ? err.message : "";
  if (msg.includes("مستخدم بالفعل")) return "هذا البريد مستخدم بالفعل.";
  if (msg.includes("غير مخوّل")) return "غير مخوّل لإنشاء عمّال.";
  if (msg.includes("صلاحية")) return msg;
  if (msg.includes("المهنة")) return "المهنة المحددة غير صحيحة.";
  if (msg.includes("المشرف")) return "المشرف المحدّد غير صحيح.";
  return msg || "تعذّر إنشاء العامل، حاول مرة أخرى.";
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modal: { width: "100%", maxWidth: 460, background: "#fff", borderRadius: 12, padding: 28, fontFamily: "system-ui, sans-serif", direction: "rtl", textAlign: "right", maxHeight: "90vh", overflowY: "auto" },
  title: { margin: "0 0 4px", fontSize: 20 },
  hint: { margin: "0 0 20px", fontSize: 13, color: "#666", lineHeight: 1.6 },
  label: { display: "block", margin: "14px 0 6px", fontSize: 14, fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  fieldHint: { display: "block", fontSize: 11, color: "#94a3b8", marginTop: 5, lineHeight: 1.5 },
  error: { marginTop: 16, padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14 },
  actions: { display: "flex", gap: 12, marginTop: 24 },
  cancel: { flex: 1, padding: "12px", fontSize: 15, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  create: { flex: 2, padding: "12px", fontSize: 15, fontWeight: 600, color: "#fff", background: "#7c2d12", border: "none", borderRadius: 8, cursor: "pointer" },
};
