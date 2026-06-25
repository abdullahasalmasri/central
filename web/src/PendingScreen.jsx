export default function PendingScreen({ tenantId }) {
  return (
    <div style={styles.card}>
      <div style={styles.icon}>⏳</div>
      <h1 style={styles.title}>تم تسجيل شركتك بنجاح</h1>
      <p style={styles.text}>
        حسابك الآن قيد المراجعة. سيتم تفعيل الاشتراك من إدارة Central،
        وبعدها تقدر تدخل وتبدأ بإضافة موظفيك الإداريين.
      </p>
      <div style={styles.idBox}>
        <span style={styles.idLabel}>معرّف الشركة</span>
        <code style={styles.idValue}>{tenantId}</code>
      </div>
    </div>
  );
}

const styles = {
  card: {
    maxWidth: 460,
    margin: "60px auto",
    padding: 40,
    border: "1px solid #e2e2e2",
    borderRadius: 12,
    textAlign: "center",
    fontFamily: "system-ui, sans-serif",
    direction: "rtl",
  },
  icon: { fontSize: 48, marginBottom: 8 },
  title: { margin: "0 0 12px", fontSize: 22 },
  text: { color: "#555", lineHeight: 1.7, fontSize: 15 },
  idBox: {
    marginTop: 24,
    padding: "12px 16px",
    background: "#f3f4f6",
    borderRadius: 8,
    display: "inline-block",
  },
  idLabel: { display: "block", fontSize: 12, color: "#888", marginBottom: 4 },
  idValue: { fontSize: 14, fontWeight: 600, color: "#111" },
};