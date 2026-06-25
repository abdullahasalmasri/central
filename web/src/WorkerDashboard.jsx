import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./firebase";
import { fetchUserDoc } from "./employees";

export default function WorkerDashboard({ user }) {
  const [me, setMe] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [objectingId, setObjectingId] = useState(""); // أي استثناء يكتب له اعتراض
  const [objectText, setObjectText] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const myDoc = await fetchUserDoc(user.uid);
      setMe(myDoc);

      // استثناءات العامل (subjectUid == uid) — القاعدة تسمح بقراءتها
      const snap = await getDocs(
        query(collection(db, "attendanceExceptions"), where("subjectUid", "==", user.uid))
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // الأحدث أولًا (حسب التاريخ)
      list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      setExceptions(list);
    } catch (err) {
      setError("تعذّر تحميل بياناتك.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function respond(exceptionId, action, text) {
    setBusy(exceptionId);
    setError("");
    try {
      const fn = httpsCallable(functions, "respondToException");
      await fn({ exceptionId: exceptionId, action: action, responseText: text || "" });
      setObjectingId("");
      setObjectText("");
      await loadData();
    } catch (err) {
      setError(err.message || "تعذّر إرسال ردّك.");
    } finally {
      setBusy("");
    }
  }

  const pending = exceptions.filter((e) => e.status === "pending_worker");
  const resolved = exceptions.filter((e) => e.status !== "pending_worker");

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>حسابي</h1>
          <p style={styles.sub}>{user.email}</p>
        </div>
        <button style={styles.logout} onClick={() => signOut(auth)}>خروج</button>
      </header>

      {/* بطاقة بياناتي */}
      <section style={styles.card}>
        {loading ? (
          <p style={styles.muted}>جارٍ التحميل...</p>
        ) : error ? (
          <div style={styles.error}>{error}</div>
        ) : me ? (
          <div style={styles.profileRow}>
            <div style={styles.avatar}>{me.name ? me.name.charAt(0) : "؟"}</div>
            <div>
              <h2 style={styles.name}>{me.name}</h2>
              <p style={styles.meta}>
                {me.employeeNumber ? `الرقم: ${me.employeeNumber}` : ""} · {me.email}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {/* الاستثناءات التي تحتاج رد */}
      <section style={styles.card}>
        <h2 style={styles.cardTitle}>
          ملاحظات تحتاج ردّك {pending.length > 0 ? `(${pending.length})` : ""}
        </h2>

        {loading ? (
          <p style={styles.muted}>جارٍ التحميل...</p>
        ) : pending.length === 0 ? (
          <p style={styles.muted}>لا توجد ملاحظات بحاجة لردّك. 👍</p>
        ) : (
          <div style={styles.list}>
            {pending.map((ex) => (
              <div key={ex.id} style={styles.exCard}>
                <div style={styles.exHead}>
                  <span style={styles.exType}>
                    {ex.exceptionType === "absent" ? "غياب" : "تأخير"}
                  </span>
                  <span style={styles.exDate}>{ex.date}</span>
                </div>
                {ex.supervisorNote ? (
                  <p style={styles.exNote}>ملاحظة المشرف: {ex.supervisorNote}</p>
                ) : (
                  <p style={styles.exNoteMuted}>سجّل المشرف {ex.exceptionType === "absent" ? "غيابك" : "تأخّرك"} في هذا اليوم.</p>
                )}

                {objectingId === ex.id ? (
                  // وضع كتابة الاعتراض
                  <div style={styles.objectBox}>
                    <textarea
                      style={styles.textarea}
                      value={objectText}
                      onChange={(e) => setObjectText(e.target.value)}
                      placeholder="اكتب سبب اعتراضك..."
                      rows={3}
                      disabled={busy === ex.id}
                    />
                    <div style={styles.objectActions}>
                      <button
                        style={styles.cancelBtn}
                        onClick={() => { setObjectingId(""); setObjectText(""); }}
                        disabled={busy === ex.id}
                      >
                        إلغاء
                      </button>
                      <button
                        style={styles.sendObjectBtn}
                        onClick={() => respond(ex.id, "object", objectText)}
                        disabled={busy === ex.id || objectText.trim().length < 2}
                      >
                        {busy === ex.id ? "..." : "إرسال الاعتراض"}
                      </button>
                    </div>
                  </div>
                ) : (
                  // أزرار الموافقة/الاعتراض
                  <div style={styles.exActions}>
                    <button
                      style={styles.acceptBtn}
                      onClick={() => respond(ex.id, "accept", "")}
                      disabled={busy === ex.id}
                    >
                      {busy === ex.id ? "..." : "موافق"}
                    </button>
                    <button
                      style={styles.objectBtn}
                      onClick={() => { setObjectingId(ex.id); setObjectText(""); }}
                      disabled={busy === ex.id}
                    >
                      اعتراض
                    </button>
                  </div>
                )}
                <p style={styles.deadline}>
                  إن لم تردّ خلال المهلة، تُعتبر موافقة تلقائية.
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* السجل السابق */}
      {resolved.length > 0 ? (
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>سجل سابق</h2>
          <div style={styles.list}>
            {resolved.map((ex) => (
              <div key={ex.id} style={styles.resolvedRow}>
                <span>{ex.exceptionType === "absent" ? "غياب" : "تأخير"} · {ex.date}</span>
                <span style={ex.status === "objected" ? styles.objectedTag : styles.acceptedTag}>
                  {ex.status === "objected" ? "معترَض عليه" : "موافَق عليه"}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui, sans-serif", direction: "rtl" },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "20px 32px", background: "#7c2d12", color: "#fff",
  },
  title: { margin: 0, fontSize: 20 },
  sub: { margin: "4px 0 0", fontSize: 13, color: "#fed7aa" },
  logout: {
    padding: "8px 16px", fontSize: 14, color: "#fff", background: "transparent",
    border: "1px solid #c2410c", borderRadius: 8, cursor: "pointer",
  },
  card: {
    maxWidth: 560, margin: "20px auto", padding: 24, background: "#fff",
    border: "1px solid #e2e8f0", borderRadius: 12,
  },
  profileRow: { display: "flex", alignItems: "center", gap: 16 },
  avatar: {
    width: 56, height: 56, borderRadius: "50%", background: "#7c2d12", color: "#fff",
    fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  name: { margin: "0 0 4px", fontSize: 18 },
  meta: { margin: 0, fontSize: 13, color: "#64748b" },
  cardTitle: { margin: "0 0 16px", fontSize: 17 },
  list: { display: "flex", flexDirection: "column", gap: 12 },
  exCard: { padding: 16, border: "1px solid #fed7aa", borderRadius: 10, background: "#fffbeb" },
  exHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  exType: { padding: "3px 12px", background: "#fef3c7", color: "#92400e", borderRadius: 12, fontSize: 13, fontWeight: 600 },
  exDate: { fontSize: 13, color: "#64748b" },
  exNote: { margin: "8px 0", fontSize: 14, color: "#0f172a" },
  exNoteMuted: { margin: "8px 0", fontSize: 14, color: "#64748b" },
  exActions: { display: "flex", gap: 8, marginTop: 12 },
  acceptBtn: {
    flex: 1, padding: "10px", fontSize: 14, fontWeight: 600, color: "#fff",
    background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer",
  },
  objectBtn: {
    flex: 1, padding: "10px", fontSize: 14, fontWeight: 600, color: "#b91c1c",
    background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer",
  },
  objectBox: { marginTop: 12 },
  textarea: {
    width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #ccc",
    borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical",
  },
  objectActions: { display: "flex", gap: 8, marginTop: 8 },
  cancelBtn: {
    flex: 1, padding: "10px", fontSize: 14, color: "#475569", background: "#f1f5f9",
    border: "none", borderRadius: 8, cursor: "pointer",
  },
  sendObjectBtn: {
    flex: 2, padding: "10px", fontSize: 14, fontWeight: 600, color: "#fff",
    background: "#b91c1c", border: "none", borderRadius: 8, cursor: "pointer",
  },
  deadline: { margin: "10px 0 0", fontSize: 12, color: "#9a3412" },
  resolvedRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 14px", background: "#f8fafc", borderRadius: 8, fontSize: 14,
  },
  acceptedTag: { padding: "3px 10px", background: "#dcfce7", color: "#166534", borderRadius: 12, fontSize: 12, fontWeight: 600 },
  objectedTag: { padding: "3px 10px", background: "#fee2e2", color: "#b91c1c", borderRadius: 12, fontSize: 12, fontWeight: 600 },
  muted: { color: "#94a3b8", fontSize: 14 },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14 },
};