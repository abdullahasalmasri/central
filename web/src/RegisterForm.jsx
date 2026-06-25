import { useState } from "react";
import { registerCompanyFlow } from "./registerCompany";

export default function RegisterForm({ onSuccess }) {
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError("");
    if (companyName.trim().length < 2) {
      setError("اسم الشركة مطلوب (حرفان على الأقل).");
      return;
    }
    if (password.length < 6) {
      setError("كلمة المرور 6 أحرف على الأقل.");
      return;
    }
    setLoading(true);
    try {
      const result = await registerCompanyFlow({
        email: email.trim(),
        password: password,
        companyName: companyName,
        ownerName: ownerName,
      });
      onSuccess(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.card}>
      <h1 style={styles.title}>تسجيل شركة جديدة</h1>
      <p style={styles.subtitle}>أنشئ حساب مالك الشركة للبدء</p>

      <label style={styles.label}>اسم الشركة</label>
      <input
        style={styles.input}
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        placeholder="شركة خالد للصيانة"
        disabled={loading}
      />

      <label style={styles.label}>اسمك (المالك)</label>
      <input
        style={styles.input}
        value={ownerName}
        onChange={(e) => setOwnerName(e.target.value)}
        placeholder="خالد"
        disabled={loading}
      />

      <label style={styles.label}>البريد الإلكتروني</label>
      <input
        style={styles.input}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="owner@company.com"
        disabled={loading}
      />

      <label style={styles.label}>كلمة المرور</label>
      <input
        style={styles.input}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="6 أحرف على الأقل"
        disabled={loading}
      />

      {error ? <div style={styles.error}>{error}</div> : null}

      <button style={styles.button} onClick={handleSubmit} disabled={loading}>
        {loading ? "جارٍ التسجيل..." : "تسجيل الشركة"}
      </button>
    </div>
  );
}

const styles = {
  card: {
    maxWidth: 420,
    margin: "40px auto",
    padding: 32,
    border: "1px solid #e2e2e2",
    borderRadius: 12,
    fontFamily: "system-ui, sans-serif",
    direction: "rtl",
    textAlign: "right",
  },
  title: { margin: "0 0 4px", fontSize: 24 },
  subtitle: { margin: "0 0 24px", color: "#666", fontSize: 14 },
  label: { display: "block", margin: "14px 0 6px", fontSize: 14, fontWeight: 600 },
  input: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 15,
    border: "1px solid #ccc",
    borderRadius: 8,
    boxSizing: "border-box",
  },
  button: {
    width: "100%",
    marginTop: 24,
    padding: "12px",
    fontSize: 16,
    fontWeight: 600,
    color: "#fff",
    background: "#2563eb",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  error: {
    marginTop: 16,
    padding: "10px 12px",
    background: "#fee2e2",
    color: "#b91c1c",
    borderRadius: 8,
    fontSize: 14,
  },
};