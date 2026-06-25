import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

export default function LoginForm({ onSwitchToRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError("");
    if (!email.includes("@") || password.length < 6) {
      setError("أدخل بريدًا صحيحًا وكلمة مرور (6 أحرف على الأقل).");
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // النجاح يلتقطه useAuth تلقائيًا — لا نحتاج عمل شيء هنا
    } catch (err) {
      setError("بريد أو كلمة مرور غير صحيحة.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.card}>
      <h1 style={styles.title}>تسجيل الدخول</h1>
      <p style={styles.subtitle}>ادخل إلى حساب شركتك</p>

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
        placeholder="كلمة المرور"
        disabled={loading}
      />

      {error ? <div style={styles.error}>{error}</div> : null}

      <button style={styles.button} onClick={handleLogin} disabled={loading}>
        {loading ? "جارٍ الدخول..." : "دخول"}
      </button>

      <p style={styles.switch}>
        ما عندك حساب؟{" "}
        <span style={styles.link} onClick={onSwitchToRegister}>
          سجّل شركة جديدة
        </span>
      </p>
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
  switch: { marginTop: 20, fontSize: 14, color: "#666", textAlign: "center" },
  link: { color: "#2563eb", cursor: "pointer", fontWeight: 600 },
};