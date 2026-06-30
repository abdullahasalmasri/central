import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../firebase";

/* ============================================================
   OwnerShell — منصة المالك (Platform Owner)
   واجهة منفصلة عن Central، نفس Firebase. تُفتح عبر #owner.
   مصادقة → تحقّق أن الحساب مالك منصة → لوحة العملاء.
   getAllTenants / setTenantStatus / updateTenantSubscription.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const STATUS = {
  active: { label: "نشط", color: "#16a34a", bg: "#dcfce7", dot: "#16a34a" },
  suspended: { label: "موقوف", color: "#dc2626", bg: "#fee2e2", dot: "#dc2626" },
  pending: { label: "قيد التفعيل", color: "#ea580c", bg: "#ffedd5", dot: "#ea580c" },
};
function fmtDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-GB");
}

export default function OwnerShell() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(null); // null = جاري الفحص

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        try {
          const res = await httpsCallable(functions, "checkPlatformOwner")({});
          setIsOwner(!!res.data.isOwner);
        } catch (e) { setIsOwner(false); }
      } else {
        setIsOwner(null);
      }
    });
    return () => unsub();
  }, []);

  if (authLoading) return <Centered><Spin /></Centered>;
  if (!user) return <OwnerLogin />;
  if (isOwner === null) return <Centered><Spin /><p style={styles.checkingText}>جارٍ التحقّق من الصلاحية...</p></Centered>;
  if (!isOwner) return <NotAuthorized email={user.email} />;
  return <OwnerDashboard user={user} />;
}

// مؤشّر دوران (مع keyframes مضمّنة لأن React inline styles لا تدعم @keyframes)
function Spin() {
  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={styles.spinner} />
    </>
  );
}

function Centered({ children }) {
  return <div style={styles.centered}>{children}</div>;
}

function OwnerLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setErr("");
    if (!email.trim() || !password) { setErr("أدخل البريد وكلمة المرور."); return; }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      setErr("بيانات الدخول غير صحيحة.");
      setLoading(false);
    }
  }

  return (
    <div style={styles.loginWrap}>
      <div style={styles.loginCard}>
        <div style={styles.loginLogo}>C</div>
        <h1 style={styles.loginTitle}>منصة المالك</h1>
        <p style={styles.loginSub}>الدخول مخصّص لمالك النظام</p>
        {err ? <div style={styles.loginErr}>{err}</div> : null}
        <input style={styles.loginInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني" dir="ltr" disabled={loading} />
        <input style={styles.loginInput} type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="كلمة المرور" dir="ltr" disabled={loading} />
        <button style={styles.loginBtn} onClick={submit} disabled={loading}>{loading ? "جارٍ الدخول..." : "دخول"}</button>
      </div>
    </div>
  );
}

function NotAuthorized({ email }) {
  return (
    <div style={styles.loginWrap}>
      <div style={styles.loginCard}>
        <div style={{ ...styles.loginLogo, background: "#dc2626" }}>!</div>
        <h1 style={styles.loginTitle}>غير مخوّل</h1>
        <p style={styles.loginSub}>الحساب {email} ليس مالك منصة.</p>
        <button style={styles.loginBtn} onClick={() => signOut(auth)}>تسجيل الخروج</button>
      </div>
    </div>
  );
}

function OwnerDashboard({ user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [busyId, setBusyId] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const res = await httpsCallable(functions, "getAllTenants")({});
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(tenantId, status) {
    setBusyId(tenantId);
    try {
      await httpsCallable(functions, "setTenantStatus")({ tenantId, status });
      await loadData();
    } catch (e) {
      alert(e.message || "تعذّر تغيير الحالة.");
    } finally {
      setBusyId("");
    }
  }

  const s = data ? data.summary : { totalTenants: 0, activeCount: 0, suspendedCount: 0, pendingCount: 0, monthlyRevenue: 0, totalUsers: 0 };
  const tenants = data ? data.tenants : [];
  const q = search.trim().toLowerCase();
  let filtered = filter === "all" ? tenants : tenants.filter((t) => t.subscriptionStatus === filter);
  if (q) filtered = filtered.filter((t) => (t.name || "").toLowerCase().includes(q) || (t.contactEmail || "").toLowerCase().includes(q));

  return (
    <div style={styles.dash}>
      {/* الشريط العلوي */}
      <div style={styles.topbar}>
        <div style={styles.brand}>
          <div style={styles.brandLogo}>C</div>
          <div>
            <div style={styles.brandName}>Central</div>
            <div style={styles.brandSub}>منصة المالك</div>
          </div>
        </div>
        <div style={styles.topRight}>
          <span style={styles.ownerEmail}>{user.email}</span>
          <button style={styles.logoutBtn} onClick={() => signOut(auth)}>خروج</button>
        </div>
      </div>

      <div style={styles.body}>
        <h1 style={styles.pageTitle}>لوحة العملاء</h1>
        <p style={styles.pageSub}>إدارة الشركات المشتركة وحالات اشتراكها.</p>

        {error ? <div style={styles.error}>{error}</div> : null}

        {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : !data ? (
          <div style={styles.warnBox}>تعذّر تحميل البيانات.</div>
        ) : (
          <>
            {/* KPIs */}
            <div style={styles.kpiGrid}>
              <div style={styles.kpiCard}><span style={styles.kpiLabel}>إجمالي العملاء</span><span style={{ ...styles.kpiValue, color: "#6366f1" }}>{s.totalTenants}</span></div>
              <div style={styles.kpiCard}><span style={styles.kpiLabel}>عملاء نشطون</span><span style={{ ...styles.kpiValue, color: "#16a34a" }}>{s.activeCount}</span></div>
              <div style={styles.kpiCard}><span style={styles.kpiLabel}>موقوفون</span><span style={{ ...styles.kpiValue, color: s.suspendedCount > 0 ? "#dc2626" : "#16a34a" }}>{s.suspendedCount}</span></div>
              <div style={styles.kpiCard}><span style={styles.kpiLabel}>الإيراد الشهري (نشط)</span><span style={{ ...styles.kpiValue, color: "#16a34a" }} dir="ltr">{fmt(s.monthlyRevenue)}</span></div>
            </div>

            {/* أدوات */}
            <div style={styles.tools}>
              <input style={styles.search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ابحث عن عميل..." />
              <div style={styles.filters}>
                {[["all", "الكل"], ["active", "نشط"], ["pending", "قيد التفعيل"], ["suspended", "موقوف"]].map(([k, lbl]) => (
                  <button key={k} style={filter === k ? styles.filterOn : styles.filterOff} onClick={() => setFilter(k)}>{lbl}</button>
                ))}
              </div>
            </div>

            {/* قائمة العملاء */}
            {filtered.length === 0 ? (
              <div style={styles.warnBox}>{tenants.length === 0 ? "لا يوجد عملاء مسجّلون بعد." : "لا توجد نتائج."}</div>
            ) : (
              <div style={styles.tenantList}>
                {filtered.map((t) => {
                  const st = STATUS[t.subscriptionStatus] || STATUS.pending;
                  const busy = busyId === t.id;
                  const overLimit = t.maxUsers > 0 && t.userCount > t.maxUsers;
                  return (
                    <div key={t.id} style={styles.tenantCard}>
                      <div style={styles.tLeft}>
                        <div style={styles.tNameRow}>
                          <span style={{ ...styles.statusDot, background: st.dot }} />
                          <span style={styles.tName}>{t.name}</span>
                          <span style={{ ...styles.chip, color: st.color, background: st.bg }}>{st.label}</span>
                        </div>
                        <div style={styles.tMeta}>
                          <span style={overLimit ? styles.tUsersOver : styles.tUsers}>👥 {t.userCount}{t.maxUsers > 0 ? ` / ${t.maxUsers}` : ""}</span>
                          {t.subscriptionAmount > 0 ? <span style={styles.tAmount} dir="ltr">{fmt(t.subscriptionAmount)} ر.س/شهر</span> : <span style={styles.tNoAmount}>لا مبلغ محدّد</span>}
                          {t.contactEmail ? <span style={styles.tContact} dir="ltr">{t.contactEmail}</span> : null}
                          <span style={styles.tDate}>سُجّل {fmtDate(t.createdAt)}</span>
                        </div>
                      </div>
                      <div style={styles.tActions}>
                        {t.subscriptionStatus === "active" ? (
                          <button style={styles.suspendBtn} onClick={() => { if (window.confirm(`إيقاف اشتراك «${t.name}»؟ سيُقفل النظام عنهم.`)) changeStatus(t.id, "suspended"); }} disabled={busy}>{busy ? "..." : "⏸ إيقاف"}</button>
                        ) : (
                          <button style={styles.activateBtn} onClick={() => changeStatus(t.id, "active")} disabled={busy}>{busy ? "..." : "▶ تفعيل"}</button>
                        )}
                        <button style={styles.editBtn} onClick={() => setModal(t)} disabled={busy}>✏️ تعديل</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {modal ? <EditModal tenant={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
    </div>
  );
}

function EditModal({ tenant, onClose, onSaved }) {
  const [f, setF] = useState({
    subscriptionAmount: tenant.subscriptionAmount ? String(tenant.subscriptionAmount) : "",
    maxUsers: tenant.maxUsers ? String(tenant.maxUsers) : "",
    contactEmail: tenant.contactEmail || "",
    contactPhone: tenant.contactPhone || "",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    setSaving(true);
    try {
      await httpsCallable(functions, "updateTenantSubscription")({
        tenantId: tenant.id,
        subscriptionAmount: Number(f.subscriptionAmount) || 0,
        maxUsers: Number(f.maxUsers) || 0,
        contactEmail: f.contactEmail.trim(),
        contactPhone: f.contactPhone.trim(),
      });
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الحفظ."); setSaving(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>تعديل اشتراك «{tenant.name}»</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {err ? <div style={styles.error}>{err}</div> : null}
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>المبلغ الشهري (ر.س)</label><input style={styles.input} type="number" min="0" value={f.subscriptionAmount} onChange={(e) => set("subscriptionAmount", e.target.value)} disabled={saving} dir="ltr" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الحد الأقصى للمستخدمين</label><input style={styles.input} type="number" min="0" value={f.maxUsers} onChange={(e) => set("maxUsers", e.target.value)} disabled={saving} dir="ltr" /></div></div>
        </div>
        <div style={styles.field}><label style={styles.label}>بريد التواصل</label><input style={styles.input} type="email" value={f.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} disabled={saving} dir="ltr" /></div>
        <div style={styles.field}><label style={styles.label}>جوال التواصل</label><input style={styles.input} value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} disabled={saving} dir="ltr" /></div>
        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ"}</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  centered: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f172a", gap: 14, fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  spinner: { width: 40, height: 40, border: "3px solid #334155", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  checkingText: { color: "#94a3b8", fontSize: 14 },

  loginWrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", padding: 16, fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  loginCard: { background: "#1e293b", borderRadius: 18, padding: "36px 32px", width: "100%", maxWidth: 380, textAlign: "center", border: "1px solid #334155" },
  loginLogo: { width: 56, height: 56, borderRadius: 14, background: "#6366f1", color: "#fff", fontSize: 28, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" },
  loginTitle: { fontSize: 22, fontWeight: 800, color: "#f8fafc", margin: "0 0 6px" },
  loginSub: { fontSize: 14, color: "#94a3b8", margin: "0 0 22px" },
  loginErr: { padding: "10px 12px", background: "#7f1d1d", color: "#fecaca", borderRadius: 8, fontSize: 13, marginBottom: 16 },
  loginInput: { width: "100%", padding: "12px 14px", fontSize: 14, border: "1px solid #475569", borderRadius: 10, boxSizing: "border-box", marginBottom: 12, background: "#0f172a", color: "#f8fafc", fontFamily: "inherit" },
  loginBtn: { width: "100%", padding: "13px", fontSize: 15, fontWeight: 700, color: "#fff", background: "#6366f1", border: "none", borderRadius: 10, cursor: "pointer", marginTop: 4 },

  dash: { minHeight: "100vh", background: "#f1f5f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topbar: { background: "#0f172a", padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 10 },
  brand: { display: "flex", alignItems: "center", gap: 12 },
  brandLogo: { width: 40, height: 40, borderRadius: 10, background: "#6366f1", color: "#fff", fontSize: 22, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" },
  brandName: { fontSize: 17, fontWeight: 800, color: "#f8fafc", lineHeight: 1 },
  brandSub: { fontSize: 12, color: "#818cf8", marginTop: 3, fontWeight: 600 },
  topRight: { display: "flex", alignItems: "center", gap: 14 },
  ownerEmail: { fontSize: 13, color: "#94a3b8" },
  logoutBtn: { padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#fff", background: "#334155", border: "none", borderRadius: 8, cursor: "pointer" },

  body: { padding: "28px 30px 50px", maxWidth: 1100, margin: "0 auto" },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#0f172a", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: "0 0 22px" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "14px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e" },
  muted: { color: "#94a3b8", fontSize: 14 },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 22 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 8 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 28, fontWeight: 800, fontFamily: "monospace" },

  tools: { display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap", alignItems: "center" },
  search: { flex: 1, minWidth: 200, padding: "11px 14px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 10, boxSizing: "border-box", fontFamily: "inherit" },
  filters: { display: "flex", gap: 8, flexWrap: "wrap" },
  filterOn: { padding: "9px 16px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#6366f1", border: "none", borderRadius: 20, cursor: "pointer" },
  filterOff: { padding: "9px 16px", fontSize: 13, fontWeight: 600, color: "#64748b", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20, cursor: "pointer" },

  tenantList: { display: "flex", flexDirection: "column", gap: 12 },
  tenantCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" },
  tLeft: { flex: 1, minWidth: 0 },
  tNameRow: { display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 8 },
  statusDot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  tName: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  chip: { fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 12px" },
  tMeta: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#64748b" },
  tUsers: { color: "#475569" },
  tUsersOver: { color: "#dc2626", fontWeight: 700 },
  tAmount: { color: "#16a34a", fontWeight: 600 },
  tNoAmount: { color: "#cbd5e1" },
  tContact: { color: "#94a3b8" },
  tDate: { color: "#94a3b8" },
  tActions: { display: "flex", gap: 8, flexShrink: 0 },
  activateBtn: { padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },
  suspendBtn: { padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, cursor: "pointer" },
  editBtn: { padding: "9px 16px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 14 },
  label: { fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  row: { display: "flex", gap: 12 },
  modalActions: { display: "flex", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#6366f1", border: "none", borderRadius: 8, cursor: "pointer" },
};
