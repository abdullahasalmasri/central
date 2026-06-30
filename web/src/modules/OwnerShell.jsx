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

// بنية الإدارات والأقسام (مطابقة لـ Central) — لصفحة التسعير
const PRICING_STRUCTURE = [
  { id: "exec", name: "الإدارة العليا", color: "#7c3aed", subs: [
    { id: "exec_kpi", name: "لوحة المؤشرات" }, { id: "exec_org", name: "الهيكل التنظيمي" }, { id: "exec_perm", name: "الصلاحيات" },
  ] },
  { id: "fin", name: "المالية", color: "#059669", subs: [
    { id: "fin_acc", name: "المحاسبة" }, { id: "fin_inv", name: "الفوترة و ZATCA" }, { id: "fin_cust", name: "العملاء" },
    { id: "fin_fs", name: "القوائم المالية" }, { id: "fin_coll", name: "التحصيل" }, { id: "fin_treas", name: "الخزينة" },
    { id: "fin_fpa", name: "التخطيط والتحليل" }, { id: "fin_proc", name: "المشتريات" }, { id: "fin_pos", name: "نقاط البيع" }, { id: "fin_cash", name: "الكاشير" },
  ] },
  { id: "hr", name: "الموارد البشرية", color: "#2563eb", subs: [
    { id: "hr_emp", name: "شؤون الموظفين" }, { id: "hr_pay", name: "الرواتب" }, { id: "hr_rec", name: "التوظيف" },
    { id: "hr_train", name: "التدريب" }, { id: "hr_rel", name: "علاقات الموظفين" },
  ] },
  { id: "ops", name: "العمليات", color: "#ea580c", subs: [
    { id: "ops_proj", name: "المشاريع" }, { id: "ops_people", name: "الأفراد" }, { id: "ops_facilities", name: "المرافق" },
    { id: "ops_materials", name: "المواد" }, { id: "ops_inv", name: "المخزون" }, { id: "ops_req", name: "طلبات المخزون" },
    { id: "ops_process", name: "العمليات التشغيلية" }, { id: "ops_planning", name: "التخطيط والرقابة" }, { id: "ops_qs", name: "الجودة والسلامة" },
  ] },
  { id: "assets", name: "الأصول والمرافق", color: "#0e7490", subs: [
    { id: "as_veh", name: "المركبات" }, { id: "as_hous", name: "الإسكان" }, { id: "as_equ", name: "المعدّات" },
    { id: "as_simple", name: "الأصول البسيطة" }, { id: "as_dep", name: "الإهلاك" },
  ] },
  { id: "cost", name: "التكاليف والربحية", color: "#ca8a04", subs: [
    { id: "cost_full", name: "التكلفة الشاملة" }, { id: "cost_prof", name: "تقارير الربحية" }, { id: "cost_alloc", name: "توزيع الموارد" },
  ] },
  { id: "sales", name: "المبيعات والتسويق", color: "#db2777", subs: [
    { id: "sal_dir", name: "المبيعات المباشرة" }, { id: "sal_quote", name: "عروض الأسعار" }, { id: "sal_mkt", name: "التسويق والتواصل" }, { id: "sal_serv", name: "خدمة العملاء" },
  ] },
  { id: "legal", name: "القانونية والامتثال", color: "#78716c", subs: [
    { id: "leg_con", name: "العقود" }, { id: "leg_com", name: "الامتثال والتراخيص" }, { id: "leg_dis", name: "المنازعات" },
  ] },
  { id: "quality", name: "التميز والجودة", color: "#65a30d", subs: [
    { id: "qa_aud", name: "التدقيق الداخلي" }, { id: "qa_nps", name: "رضا العملاء و NPS" }, { id: "qa_imp", name: "تحسين العمليات" },
  ] },
];

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
  const [tab, setTab] = useState("clients"); // clients | pricing
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

      {/* التبويبات */}
      <div style={styles.tabsBar}>
        <button style={tab === "clients" ? styles.tabOn : styles.tabOff} onClick={() => setTab("clients")}>👥 العملاء</button>
        <button style={tab === "pricing" ? styles.tabOn : styles.tabOff} onClick={() => setTab("pricing")}>💲 التسعير</button>
      </div>

      {tab === "pricing" ? <PricingTab /> : (
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
      )}

      {modal ? <EditModal tenant={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
    </div>
  );
}

// ═══════════ تبويب التسعير ═══════════
function PricingTab() {
  const [prices, setPrices] = useState({}); // { sub_id: number }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await httpsCallable(functions, "getPlatformPricing")({});
      const p = res.data.prices || {};
      const asStr = {};
      Object.keys(p).forEach((k) => { asStr[k] = String(p[k]); });
      setPrices(asStr);
    } catch (e) {
      setError(e.message || "تعذّر تحميل الأسعار.");
    } finally {
      setLoading(false);
    }
  }

  function setPrice(subId, val) {
    setSavedMsg("");
    setPrices((p) => ({ ...p, [subId]: val }));
  }

  async function save() {
    setError("");
    setSavedMsg("");
    setSaving(true);
    try {
      const clean = {};
      Object.keys(prices).forEach((k) => {
        const v = Number(prices[k]);
        if (Number.isFinite(v) && v > 0) clean[k] = v;
      });
      const res = await httpsCallable(functions, "setPlatformPricing")({ prices: clean });
      setSavedMsg(`تم الحفظ (${res.data.count} قسم مُسعّر).`);
    } catch (e) {
      setError(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  // سعر الإدارة = مجموع أسعار أقسامها
  const deptTotal = (dept) => dept.subs.reduce((sum, sub) => sum + (Number(prices[sub.id]) || 0), 0);
  const grandTotal = PRICING_STRUCTURE.reduce((sum, d) => sum + deptTotal(d), 0);

  return (
    <div style={styles.body}>
      <h1 style={styles.pageTitle}>تسعير الأقسام</h1>
      <p style={styles.pageSub}>حدّد سعر كل قسم بالريال لكل عامل شهريًا. سعر الإدارة = مجموع أقسامها. العميل يدفع للأقسام التي يفعّلها × عدد العمالة.</p>

      {error ? <div style={styles.error}>{error}</div> : null}
      {savedMsg ? <div style={styles.savedBox}>✓ {savedMsg}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : (
        <>
          <div style={styles.priceSummary}>
            <span style={styles.priceSummaryLabel}>السعر الكامل (كل الأقسام) للعامل الواحد شهريًا:</span>
            <span style={styles.priceSummaryVal} dir="ltr">{fmt(grandTotal)} ر.س</span>
          </div>

          <div style={styles.deptList}>
            {PRICING_STRUCTURE.map((dept) => (
              <div key={dept.id} style={styles.deptCard}>
                <div style={{ ...styles.deptHead, borderRightColor: dept.color }}>
                  <span style={{ ...styles.deptName, color: dept.color }}>{dept.name}</span>
                  <span style={styles.deptTotal} dir="ltr">{fmt(deptTotal(dept))} ر.س/عامل</span>
                </div>
                <div style={styles.subGrid}>
                  {dept.subs.map((sub) => (
                    <div key={sub.id} style={styles.subRow}>
                      <span style={styles.subName}>{sub.name}</span>
                      <div style={styles.priceInputWrap}>
                        <input
                          style={styles.priceInput}
                          type="number" min="0" step="0.05"
                          value={prices[sub.id] || ""}
                          onChange={(e) => setPrice(sub.id, e.target.value)}
                          placeholder="0.00"
                          dir="ltr"
                          disabled={saving}
                        />
                        <span style={styles.priceUnit}>ر.س</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={styles.saveBar}>
            <button style={styles.saveAllBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "💾 حفظ الأسعار"}</button>
          </div>
        </>
      )}
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

  // التبويبات
  tabsBar: { display: "flex", gap: 6, padding: "12px 30px 0", maxWidth: 1100, margin: "0 auto", borderBottom: "1px solid #e2e8f0" },
  tabOn: { padding: "11px 22px", fontSize: 14, fontWeight: 700, color: "#6366f1", background: "transparent", border: "none", borderBottom: "2.5px solid #6366f1", cursor: "pointer", marginBottom: -1 },
  tabOff: { padding: "11px 22px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "transparent", border: "none", borderBottom: "2.5px solid transparent", cursor: "pointer", marginBottom: -1 },

  // التسعير
  savedBox: { padding: "10px 14px", background: "#dcfce7", color: "#15803d", borderRadius: 8, fontSize: 14, marginBottom: 16, fontWeight: 600 },
  priceSummary: { background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 12, padding: "16px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 },
  priceSummaryLabel: { fontSize: 14, color: "#4338ca", fontWeight: 600 },
  priceSummaryVal: { fontSize: 24, fontWeight: 800, color: "#4f46e5", fontFamily: "monospace" },
  deptList: { display: "flex", flexDirection: "column", gap: 14 },
  deptCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" },
  deptHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderRight: "4px solid", background: "#fafbfc" },
  deptName: { fontSize: 16, fontWeight: 800 },
  deptTotal: { fontSize: 14, fontWeight: 700, color: "#64748b", fontFamily: "monospace" },
  subGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, padding: "16px 18px" },
  subRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f8fafc", borderRadius: 8 },
  subName: { fontSize: 13, fontWeight: 600, color: "#334155", flex: 1, minWidth: 0 },
  priceInputWrap: { display: "flex", alignItems: "center", gap: 5, flexShrink: 0 },
  priceInput: { width: 75, padding: "7px 9px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 7, textAlign: "center", fontFamily: "monospace", boxSizing: "border-box" },
  priceUnit: { fontSize: 12, color: "#94a3b8" },
  saveBar: { display: "flex", justifyContent: "flex-start", marginTop: 22, position: "sticky", bottom: 16 },
  saveAllBtn: { padding: "13px 30px", fontSize: 15, fontWeight: 700, color: "#fff", background: "#6366f1", border: "none", borderRadius: 10, cursor: "pointer", boxShadow: "0 4px 12px rgba(99,102,241,.3)" },
};
