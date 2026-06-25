import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./firebase";
import { fetchEmployees } from "./employees";
import AddEmployeeModal from "./AddEmployeeModal";
import OrgModal from "./OrgModal";

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function OwnerDashboard({ user, claims }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [schedDate, setSchedDate] = useState(todayStr());
  const [schedBusy, setSchedBusy] = useState(false);
  const [schedMsg, setSchedMsg] = useState("");

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showOrg, setShowOrg] = useState(false);

  const tenantId = claims.tenantId;

  // تصنيف الأعضاء
  const staffMembers = employees.filter((e) => e.role === "owner" || e.role === "staff");
  const adminStaff = employees.filter((e) => e.role === "staff");
  const workerMembers = employees.filter((e) => e.role === "worker");
  const ownerRecord = employees.find((e) => e.role === "owner");
  const ownerName = ownerRecord ? ownerRecord.name : "المالك";

  async function loadEmployees() {
    setLoading(true);
    setError("");
    try {
      const list = await fetchEmployees(tenantId);
      setEmployees(list);
    } catch (err) {
      setError("تعذّر تحميل قائمة الموظفين.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const summaryId = `${tenantId}_${schedDate}`;
      const snap = await getDoc(doc(db, "summaries", summaryId));
      setSummary(snap.exists() ? snap.data() : null);
    } catch (err) {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line
  }, [schedDate]);

  async function runAutoGenerate() {
    setSchedBusy(true);
    setSchedMsg("");
    try {
      const fn = httpsCallable(functions, "autoGenerateRecords");
      const r = await fn({ date: schedDate });
      setSchedMsg(`✅ التوليد: ${r.data.created} سجل أُنشئ، ${r.data.skipped} تُخطّي (من ${r.data.targets} هدف).`);
      await loadSummary();
    } catch (err) {
      setSchedMsg("⚠ " + (err.message || "تعذّر التوليد."));
    } finally {
      setSchedBusy(false);
    }
  }

  async function runFinalize() {
    setSchedBusy(true);
    setSchedMsg("");
    try {
      const fn = httpsCallable(functions, "finalizeExpired");
      const r = await fn({});
      setSchedMsg(`✅ الاعتماد: ${r.data.finalizedRecords} سجل اعتُمد، ${r.data.acceptedExceptions} استثناء حُسم تلقائيًا.`);
      await loadSummary();
    } catch (err) {
      setSchedMsg("⚠ " + (err.message || "تعذّر الاعتماد."));
    } finally {
      setSchedBusy(false);
    }
  }

  async function runRecompute() {
    setSchedBusy(true);
    setSchedMsg("");
    try {
      const fn = httpsCallable(functions, "recomputeSummaries");
      const r = await fn({ date: schedDate });
      setSchedMsg(`✅ تحديث الملخّصات: ${r.data.tenantsUpdated} شركة.`);
      await loadSummary();
    } catch (err) {
      setSchedMsg("⚠ " + (err.message || "تعذّر التحديث."));
    } finally {
      setSchedBusy(false);
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>لوحة إدارة الشركة</h1>
          <p style={styles.sub}>{user.email}</p>
        </div>
        <button style={styles.logout} onClick={() => signOut(auth)}>خروج</button>
      </header>

      {/* بطاقة إحصائيات اليوم */}
      <section style={styles.card}>
        <div style={styles.statsHead}>
          <h2 style={styles.cardTitle}>إحصائيات الحضور</h2>
          <input
            style={styles.dateInput}
            type="date"
            value={schedDate}
            onChange={(e) => setSchedDate(e.target.value)}
          />
        </div>

        {summaryLoading ? (
          <p style={styles.muted}>جارٍ التحميل...</p>
        ) : !summary ? (
          <p style={styles.muted}>لا توجد بيانات لهذا اليوم. شغّل التوليد بالأسفل.</p>
        ) : (
          <>
            <div style={styles.statsGrid}>
              <Stat label="الحاضرون" value={summary.presentCount} color="#16a34a" />
              <Stat label="الغائبون" value={summary.absentCount} color="#dc2626" />
              <Stat label="المتأخرون" value={summary.lateCount} color="#d97706" />
              <Stat label="إجمالي العمّال" value={summary.totalWorkers} color="#0f766e" />
              <Stat label="سجلّات مفتوحة" value={summary.openRecords} color="#2563eb" />
              <Stat label="سجلّات معتمدة" value={summary.finalizedRecords} color="#64748b" />
              <Stat label="بانتظار رد العمّال" value={summary.pendingExceptions} color="#7c3aed" />
              <Stat label="اعتراضات" value={summary.objectedExceptions} color="#be123c" highlight={summary.objectedExceptions > 0} />
            </div>
            {summary.objectedExceptions > 0 ? (
              <div style={styles.alert}>
                ⚠ يوجد {summary.objectedExceptions} اعتراض يحتاج مراجعة الإدارة.
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* بطاقة المجدّول */}
      <section style={styles.card}>
        <h2 style={styles.cardTitle}>المجدّول الزمني (اختبار يدوي)</h2>
        <p style={styles.hint}>في الإنتاج يعمل تلقائيًا. هنا نشغّله يدويًا.</p>
        <div style={styles.schedControls}>
          <button style={styles.genBtn} onClick={runAutoGenerate} disabled={schedBusy}>
            {schedBusy ? "..." : "توليد سجلّات اليوم"}
          </button>
          <button style={styles.finBtn} onClick={runFinalize} disabled={schedBusy}>
            {schedBusy ? "..." : "الاعتماد بالمهلة"}
          </button>
          <button style={styles.recBtn} onClick={runRecompute} disabled={schedBusy}>
            {schedBusy ? "..." : "تحديث الملخّصات"}
          </button>
        </div>
        {schedMsg ? <div style={styles.schedMsg}>{schedMsg}</div> : null}
      </section>

      {/* بطاقة الموظفين والهيكل */}
      <section style={styles.card}>
        <div style={styles.empHead}>
          <h2 style={styles.cardTitle}>الموظفون والعمّال ({employees.length})</h2>
          <div style={styles.empActions}>
            <button style={styles.addBtn} onClick={() => setShowAddEmployee(true)}>+ إضافة موظف إداري</button>
            <button style={styles.orgBtn} onClick={() => setShowOrg(true)}>🏢 الهيكل التنظيمي</button>
          </div>
        </div>
        <p style={styles.hint}>
          أضِف الموظفين الإداريين هنا (يكون مديرهم المباشر أنت). كل موظف إداري يضيف من تحته من موظفين أو عمّال حسب صلاحياته.
        </p>
        {loading ? (
          <p style={styles.muted}>جارٍ التحميل...</p>
        ) : error ? (
          <div style={styles.error}>{error}</div>
        ) : employees.length === 0 ? (
          <p style={styles.muted}>لا يوجد موظفون بعد. ابدأ بإضافة موظف إداري.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>الاسم</th>
                <th style={styles.th}>البريد</th>
                <th style={styles.th}>الدور</th>
                <th style={styles.th}>الصلاحيات</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td style={styles.td}>{emp.name}</td>
                  <td style={styles.td}>{emp.email}</td>
                  <td style={styles.td}>{roleLabel(emp.role)}</td>
                  <td style={styles.td}>
                    {emp.role === "owner"
                      ? "كل الصلاحيات"
                      : emp.role === "worker"
                      ? "—"
                      : (emp.permissions && emp.permissions.length > 0 ? emp.permissions.join("، ") : "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {showAddEmployee ? (
        <AddEmployeeModal
          allowedModules={null}
          managers={adminStaff}
          currentUid={user.uid}
          currentName={ownerName}
          currentIsOwner={true}
          ownerLabel={`${ownerName} (الإدارة العليا)`}
          onClose={() => setShowAddEmployee(false)}
          onCreated={() => { setShowAddEmployee(false); loadEmployees(); }}
        />
      ) : null}

      {showOrg ? (
        <OrgModal
          staff={staffMembers}
          workers={workerMembers}
          ownerUid={user.uid}
          ownerName={ownerName}
          onClose={() => setShowOrg(false)}
          onUpdated={loadEmployees}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value, color, highlight }) {
  return (
    <div style={{
      padding: "16px", borderRadius: 10, background: highlight ? "#fff1f2" : "#f8fafc",
      border: highlight ? "1px solid #fecdd3" : "1px solid #e2e8f0", textAlign: "center",
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color }}>{value ?? 0}</div>
      <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function roleLabel(role) {
  if (role === "owner") return "مالك";
  if (role === "staff") return "موظف";
  if (role === "worker") return "عامل";
  return role;
}

const styles = {
  page: { minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui, sans-serif", direction: "rtl" },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "20px 32px", background: "#1e293b", color: "#fff",
  },
  title: { margin: 0, fontSize: 20 },
  sub: { margin: "4px 0 0", fontSize: 13, color: "#94a3b8" },
  logout: {
    padding: "8px 16px", fontSize: 14, color: "#fff", background: "transparent",
    border: "1px solid #475569", borderRadius: 8, cursor: "pointer",
  },
  card: {
    maxWidth: 900, margin: "24px auto", padding: 24, background: "#fff",
    border: "1px solid #e2e8f0", borderRadius: 12,
  },
  cardTitle: { margin: 0, fontSize: 18 },
  statsHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  dateInput: { padding: "8px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, background: "#fff" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12 },
  alert: { marginTop: 16, padding: "12px 14px", background: "#fff1f2", color: "#be123c", borderRadius: 8, fontSize: 14, fontWeight: 600 },
  hint: { margin: "8px 0 16px", fontSize: 13, color: "#64748b", lineHeight: 1.7 },
  schedControls: { display: "flex", gap: 12, flexWrap: "wrap" },
  genBtn: { padding: "11px 18px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#0f766e", border: "none", borderRadius: 8, cursor: "pointer" },
  finBtn: { padding: "11px 18px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 8, cursor: "pointer" },
  recBtn: { padding: "11px 18px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#0891b2", border: "none", borderRadius: 8, cursor: "pointer" },
  schedMsg: { marginTop: 16, padding: "10px 12px", background: "#f0fdfa", color: "#0f766e", borderRadius: 8, fontSize: 14 },
  empHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  empActions: { display: "flex", gap: 10, flexWrap: "wrap" },
  addBtn: { padding: "9px 16px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#2563eb", border: "none", borderRadius: 8, cursor: "pointer" },
  orgBtn: { padding: "9px 16px", fontSize: 14, fontWeight: 600, color: "#0f766e", background: "#ccfbf1", border: "none", borderRadius: 8, cursor: "pointer" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "right", padding: "10px 12px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0" },
  td: { padding: "12px", fontSize: 14, borderBottom: "1px solid #f1f5f9" },
  muted: { color: "#94a3b8", fontSize: 14 },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14 },
};
