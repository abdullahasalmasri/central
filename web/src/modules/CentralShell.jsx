import React, { useState, useEffect } from "react";
import {
  Crown, Wallet, Users, Settings, Building2, TrendingUp, Megaphone, Scale,
  Award, CreditCard, Boxes, ChevronDown, Menu, X, Globe, Bell, Search, Package, LogOut, ArrowRight
} from "lucide-react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../firebase";
import { useT } from "./i18n";
import LanguageSwitcher from "./LanguageSwitcher";

/* ============================================================
   Central — الهيكل الرئيسي (App Shell)
   القائمة الجانبية الهرمية + التنقّل + منطقة المحتوى التي تعرض كل واجهة.

   🔑 نقطة "البقاء في نفس الصفحة عند التحديث":
   في معاينة Claude، التحديث يعيد للواجهة الافتراضية (البيئة معزولة، لا يوجد تخزين).
   في نظامك على ba9it.com، فعّل الحفظ بإحدى طريقتين (الكود جاهز بالأسفل عند useState):
     (أ) الأفضل — react-router: لكل واجهة مسار URL، والتحديث (F5) يبقى على نفس الـ URL تلقائيًا.
     (ب) الأبسط — localStorage: سطران يحفظان الواجهة الحالية ويقرآنها عند البدء.
   ============================================================ */

// 🗂️ شجرة التنقّل — الأقسام التسعة + إدارة المنصة
// كل تفرّع: id (يطابق الواجهة) + name + (file: ملف الواجهة المبنية أو null إن كانت مخطّطة)
const NAV = [
  { type: "section", id: "exec", name: "الإدارة العليا", icon: Crown, color: "#7c3aed", children: [
    { id: "exec_kpi",  name: "لوحة المؤشرات",   file: "ExecutiveDashboard.jsx" },
    { id: "exec_org",  name: "الهيكل التنظيمي", file: "OrgStructureView.jsx" },
    { id: "exec_perm", name: "الصلاحيات",       file: "PermissionsView.jsx" },
  ]},
  { type: "section", id: "fin", name: "المالية", icon: Wallet, color: "#059669", children: [
    { id: "fin_acc",   name: "المحاسبة",          file: null },
    { id: "fin_inv",   name: "الفوترة و ZATCA",   file: null },
    { id: "fin_cust",  name: "العملاء",           file: null },
    { id: "fin_fs",    name: "القوائم المالية",   file: null },
    { id: "fin_coll",  name: "التحصيل",           file: "CollectionsView.jsx" },
    { id: "fin_treas", name: "الخزينة",           file: "TreasuryView.jsx" },
    { id: "fin_fpa",   name: "التخطيط والتحليل",  file: "FPAView.jsx" },
    { id: "fin_proc",  name: "المشتريات",         file: "ProcurementView.jsx" },
    { id: "fin_pos",   name: "نقاط البيع (POS)",  file: "POSView.jsx" },
    { id: "fin_cash",  name: "الكاشير",           file: "CashierView.jsx" },
    { id: "fin_review", name: "مراجعة عروض الأسعار", file: "FinanceQuoteReviewView.jsx" },
  ]},
  { type: "section", id: "hr", name: "الموارد البشرية", icon: Users, color: "#2563eb", children: [
    { id: "hr_emp",   name: "شؤون الموظفين",   file: null },
    { id: "hr_pay",   name: "الرواتب",         file: "PayrollView.jsx" },
    { id: "hr_rec",   name: "التوظيف",         file: "RecruitmentView.jsx" },
    { id: "hr_train", name: "التدريب",         file: "TrainingView.jsx" },
    { id: "hr_rel",   name: "علاقات الموظفين", file: "EmployeeRelationsView.jsx" },
  ]},
  { type: "section", id: "ops", name: "العمليات", icon: Settings, color: "#ea580c", children: [
    { id: "ops_proj",       name: "المشاريع",            file: "ProjectsView.jsx" },
    { id: "ops_people",     name: "الأفراد",             file: "PeopleView.jsx" },
    { id: "ops_facilities", name: "المرافق",             file: "FacilitiesView.jsx" },
    { id: "ops_materials",  name: "المواد",              file: "MaterialsView.jsx" },
    { id: "ops_inv",        name: "المخزون",             file: "InventoryView.jsx" },
    { id: "ops_req",        name: "طلبات المخزون",       file: "StockRequestsView.jsx" },
    { id: "ops_process",    name: "العمليات التشغيلية",   file: "ProcessesView.jsx" },
    { id: "ops_planning",   name: "التخطيط والرقابة",     file: "PlanningView.jsx" },
    { id: "ops_qs",         name: "الجودة والسلامة",      file: "QualitySafetyView.jsx" },
    { id: "ops_draft", name: "مسودات العمليات", file: "OperationsDraftsView.jsx" },
    { id: "ops_approval", name: "الموافقة النهائية", file: "FinalApprovalView.jsx" },
  ]},
  { type: "section", id: "assets", name: "الأصول والمرافق", icon: Building2, color: "#0e7490", children: [
    { id: "as_veh",  name: "المركبات", file: "AssetsView.jsx" },
    { id: "as_hous", name: "الإسكان",  file: "AssetsView.jsx" },
    { id: "as_equ",  name: "المعدّات", file: "AssetsView.jsx" },
    { id: "as_simple", name: "الأصول البسيطة", file: "AssetsView.jsx" },
    { id: "as_dep",  name: "الإهلاك",  file: "DepreciationView.jsx" },
    { id: "as_ben", name: "ربط السكن والمواصلات", file: "AssetBeneficiariesView.jsx" },
  ]},
  { type: "section", id: "cost", name: "التكاليف والربحية", icon: TrendingUp, color: "#ca8a04", children: [
    { id: "cost_full",  name: "التكلفة الشاملة", file: "CostOverviewView.jsx" },
    { id: "cost_prof",  name: "تقارير الربحية",  file: "CostProfitabilityView.jsx" },
    { id: "cost_alloc", name: "توزيع الموارد",   file: "CostAllocationView.jsx" },
  ]},
  { type: "section", id: "sales", name: "المبيعات والتسويق", icon: Megaphone, color: "#db2777", children: [
    { id: "sal_dir",  name: "المبيعات المباشرة", file: "SalesView.jsx" },
    { id: "sal_quote", name: "عروض الأسعار",      file: "QuotesView.jsx" },
    { id: "sal_mkt",  name: "التسويق والتواصل",  file: "MarketingView.jsx" },
    { id: "sal_serv", name: "خدمة العملاء",      file: "CustomerServiceView.jsx" },
  ]},
  { type: "section", id: "legal", name: "القانونية والامتثال", icon: Scale, color: "#78716c", children: [
    { id: "leg_con", name: "العقود",             file: "ContractsView.jsx" },
    { id: "leg_pcon", name: "عقود المشاريع", file: "ProjectContractsView.jsx" },
    { id: "leg_com", name: "الامتثال والتراخيص", file: "ComplianceView.jsx" },
    { id: "leg_dis", name: "المنازعات",          file: "DisputesView.jsx" },
  ]},
  { type: "section", id: "quality", name: "التميز والجودة", icon: Award, color: "#65a30d", children: [
    { id: "qa_aud", name: "التدقيق الداخلي",   file: "InternalAuditView.jsx" },
    { id: "qa_nps", name: "رضا العملاء و NPS", file: "NPSView.jsx" },
    { id: "qa_imp", name: "تحسين العمليات",    file: "ProcessImprovementView.jsx" },
  ]},
  { type: "divider", label: "إدارة المنصة" },
  { type: "item", id: "subscriptions", name: "الاشتراكات", icon: CreditCard, color: "#d97706", file: "SubscriptionView.jsx" },
  { type: "item", id: "build",         name: "بناء النظام", icon: Boxes,      color: "#4f46e5", file: "BuildSystemView.jsx" },
  { type: "item", id: "support",       name: "الدعم",        icon: Bell,       color: "#2563eb", file: "SupportView.jsx" },
];

// خريطة مسطّحة: id → معلومات الواجهة (للعنوان والمحتوى)
const VIEW_INFO = {};
NAV.forEach((node) => {
  if (node.type === "section") {
    node.children.forEach((c) =>
      (VIEW_INFO[c.id] = { name: c.name, file: c.file, deptName: node.name, dept: node.id, color: node.color, icon: node.icon }));
  } else if (node.type === "item") {
    VIEW_INFO[node.id] = { name: node.name, file: node.file, deptName: "إدارة المنصة", dept: null, color: node.color, icon: node.icon };
  }
});

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .sh-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec; --sb:#fff;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    background:var(--bg); color:var(--ink); min-height:100vh;
    display:flex; -webkit-font-smoothing:antialiased;
  }

  /* SIDEBAR */
  .sh-sidebar{width:264px; background:var(--sb); border-left:1px solid var(--line); height:100vh;
    position:sticky; top:0; display:flex; flex-direction:column; flex-shrink:0; z-index:40}
  .sh-brand{display:flex; align-items:center; gap:11px; padding:18px 20px; border-bottom:1px solid var(--line)}
  .sh-brand-logo{width:38px; height:38px; border-radius:11px; background:linear-gradient(135deg,#4f46e5,#7c3aed);
    display:grid; place-items:center; color:#fff; flex-shrink:0; font-weight:800; font-size:18px}
  .sh-brand-name{font-size:18px; font-weight:800; letter-spacing:-.4px}
  .sh-brand-name span{color:#4f46e5}
  .sh-brand-sub{font-size:11px; color:var(--ink3); margin-top:1px}

  .sh-nav{flex:1; overflow-y:auto; padding:12px 12px 24px}
  .sh-nav::-webkit-scrollbar{width:6px}
  .sh-nav::-webkit-scrollbar-thumb{background:#dde2ec; border-radius:99px}

  .sh-sec{margin-bottom:2px}
  .sh-sec-btn{width:100%; display:flex; align-items:center; gap:11px; padding:10px 11px; border:none; background:none;
    cursor:pointer; border-radius:10px; font-family:inherit; text-align:right; color:var(--ink); transition:background .12s}
  .sh-sec-btn:hover{background:var(--bg)}
  .sh-sec-ic{width:30px; height:30px; border-radius:8px; display:grid; place-items:center; flex-shrink:0;
    background:color-mix(in srgb,var(--c) 13%,transparent); color:var(--c)}
  .sh-sec-name{flex:1; font-size:13.5px; font-weight:600; min-width:0}
  .sh-sec-chev{color:var(--ink3); transition:transform .2s; flex-shrink:0}
  .sh-sec-chev.open{transform:rotate(180deg)}

  .sh-children{overflow:hidden; max-height:0; transition:max-height .26s ease; padding-right:14px}
  .sh-children.open{max-height:520px}
  .sh-children-inner{padding:3px 0 6px; border-right:1.5px solid var(--line); margin-right:14px}
  .sh-child{width:100%; display:flex; align-items:center; gap:9px; padding:8px 11px; border:none; background:none;
    cursor:pointer; border-radius:8px; font-family:inherit; text-align:right; color:var(--ink2); font-size:12.5px; font-weight:500;
    transition:all .12s; position:relative}
  .sh-child:hover{background:var(--bg); color:var(--ink)}
  .sh-child.active{background:color-mix(in srgb,var(--c) 11%,transparent); color:var(--c); font-weight:700}
  .sh-child-dot{width:5px; height:5px; border-radius:50%; background:currentColor; opacity:.45; flex-shrink:0}
  .sh-child.active .sh-child-dot{opacity:1}
  .sh-child-file{margin-right:auto; width:6px; height:6px; border-radius:50%; background:#22c55e; flex-shrink:0}

  .sh-divider{font-size:10.5px; font-weight:800; color:var(--ink3); letter-spacing:.4px;
    padding:16px 12px 8px; text-transform:uppercase}

  .sh-item-btn{width:100%; display:flex; align-items:center; gap:11px; padding:10px 11px; border:none; background:none;
    cursor:pointer; border-radius:10px; font-family:inherit; text-align:right; color:var(--ink); transition:background .12s; margin-bottom:2px}
  .sh-item-btn:hover{background:var(--bg)}
  .sh-item-btn.active{background:color-mix(in srgb,var(--c) 12%,transparent)}
  .sh-item-btn.active .sh-sec-name{color:var(--c); font-weight:700}

  /* MAIN */
  .sh-main{flex:1; min-width:0; display:flex; flex-direction:column; min-height:100vh}
  .sh-topbar{height:62px; background:var(--panel); border-bottom:1px solid var(--line); display:flex; align-items:center;
    gap:14px; padding:0 22px; position:sticky; top:0; z-index:30}
  .sh-burger{display:none; width:38px; height:38px; border-radius:9px; border:1px solid var(--line2); background:var(--panel);
    cursor:pointer; place-items:center; color:var(--ink2); flex-shrink:0}
  .sh-crumb{display:flex; align-items:center; gap:8px; min-width:0}
  .sh-back{display:grid; width:38px; height:38px; border-radius:9px; border:1px solid var(--line2); background:var(--panel);
    cursor:pointer; place-items:center; color:var(--ink2); flex-shrink:0; transition:all .15s}
  .sh-back:hover{background:color-mix(in srgb,var(--ink2) 8%,transparent); color:var(--ink)}
  .sh-crumb-dept{font-size:12.5px; color:var(--ink3); font-weight:500; white-space:nowrap}
  .sh-crumb-sep{color:var(--ink3); flex-shrink:0}
  .sh-crumb-cur{font-size:15px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .sh-top-actions{margin-right:auto; display:flex; align-items:center; gap:8px; flex-shrink:0}
  .sh-top-btn{width:38px; height:38px; border-radius:9px; border:1px solid var(--line2); background:var(--panel);
    cursor:pointer; display:grid; place-items:center; color:var(--ink2)}
  .sh-top-btn:hover{background:var(--bg)}
  .sh-lang{display:flex; align-items:center; gap:6px; height:38px; padding:0 13px; border-radius:9px; border:1px solid var(--line2);
    background:var(--panel); cursor:pointer; font-family:inherit; font-size:12.5px; font-weight:600; color:var(--ink2)}
  .sh-avatar{width:38px; height:38px; border-radius:50%; background:linear-gradient(135deg,#4f46e5,#7c3aed);
    color:#fff; display:grid; place-items:center; font-weight:700; font-size:14px; flex-shrink:0}

  .sh-content{flex:1; overflow-y:auto}

  /* PLACEHOLDER (تُستبدل بالواجهة الفعلية) */
  .sh-ph{min-height:100%; display:grid; place-items:center; padding:40px 24px}
  .sh-ph-card{max-width:440px; text-align:center}
  .sh-ph-ic{width:74px; height:74px; border-radius:20px; display:grid; place-items:center; margin:0 auto 20px;
    background:color-mix(in srgb,var(--c) 13%,transparent); color:var(--c)}
  .sh-ph-name{font-size:22px; font-weight:800; margin-bottom:6px}
  .sh-ph-dept{font-size:13px; color:var(--ink3); margin-bottom:22px}
  .sh-ph-box{background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:18px 20px; text-align:right}
  .sh-ph-box.ready{border-color:#bbf7d0; background:#f0fdf4}
  .sh-ph-box.plan{border-color:#fde68a; background:#fffbeb}
  .sh-ph-status{display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; margin-bottom:10px}
  .sh-ph-status.ready{color:#15803d}
  .sh-ph-status.plan{color:#92740a}
  .sh-ph-file{font-family:'SF Mono',Menlo,monospace; font-size:12.5px; background:#0f172a; color:#a5f3fc;
    padding:9px 13px; border-radius:9px; direction:ltr; text-align:left; margin-bottom:10px}
  .sh-ph-desc{font-size:12.5px; color:var(--ink2); line-height:1.7}
  .sh-ph-code{font-family:'SF Mono',Menlo,monospace; font-size:11.5px; background:var(--bg); color:var(--ink2);
    padding:8px 11px; border-radius:7px; direction:ltr; text-align:left; margin-top:8px; border:1px solid var(--line)}

  .sh-overlay{display:none; position:fixed; inset:0; background:rgba(15,23,42,.45); z-index:35}
  .sh-overlay.show{display:block}

  @media(max-width:980px){
    .sh-sidebar{position:fixed; right:0; top:0; transform:translateX(100%); transition:transform .26s ease; box-shadow:-10px 0 40px rgba(0,0,0,.12)}
    .sh-sidebar.open{transform:translateX(0)}
    .sh-burger{display:grid}
  }
  @media(max-width:560px){
    .sh-topbar{padding:0 14px}
    .sh-lang span,.sh-crumb-dept{display:none}
    .sh-top-actions .sh-top-btn:first-child{display:none}
  }

  /* زر تسجيل الخروج */
  .sh-logout{width:38px; height:38px; border-radius:9px; border:1px solid var(--line2); background:var(--panel);
    cursor:pointer; display:grid; place-items:center; color:var(--ink2); flex-shrink:0; transition:all .12s}
  .sh-logout:hover{background:#fef2f2; border-color:#fecaca; color:#dc2626}

  /* شاشة تسجيل الدخول */
  .lg-wrap{min-height:100vh; display:grid; place-items:center; padding:20px;
    background:linear-gradient(135deg,#eef1f7,#e2e8f3);
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif; direction:rtl}
  .lg-card{background:#fff; border-radius:20px; box-shadow:0 12px 48px rgba(15,23,42,.12);
    padding:40px 32px; width:100%; max-width:380px; text-align:center}
  .lg-logo{width:60px; height:60px; border-radius:16px; background:linear-gradient(135deg,#4f46e5,#7c3aed);
    display:grid; place-items:center; color:#fff; font-weight:800; font-size:28px; margin:0 auto 18px}
  .lg-title{font-size:26px; font-weight:800; letter-spacing:-.5px; color:#161b26}
  .lg-title span{color:#4f46e5}
  .lg-sub{font-size:13px; color:#94a0b8; margin:4px 0 26px}
  .lg-input{width:100%; padding:13px 15px; font-size:14px; border:1px solid #dde2ec; border-radius:11px;
    margin-bottom:12px; font-family:inherit; box-sizing:border-box; outline:none; transition:border-color .12s}
  .lg-input:focus{border-color:#4f46e5}
  .lg-btn{width:100%; padding:13px; font-size:15px; font-weight:700; color:#fff; background:#4f46e5;
    border:none; border-radius:11px; cursor:pointer; margin-top:6px; transition:background .12s; font-family:inherit}
  .lg-btn:hover{background:#4338ca}
  .lg-btn:disabled{opacity:.6; cursor:default}
  .lg-err{background:#fef2f2; color:#dc2626; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:16px}

  /* شاشة التحميل */
  .sh-loading{min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:16px; background:#f4f6f9; font-family:'IBM Plex Sans Arabic',sans-serif; direction:rtl}
  .sh-loading-text{font-size:14px; color:#94a0b8}
`;

// إيجاد القسم الذي يحتوي تفرّعًا معيّنًا (لفتحه تلقائيًا)
function sectionOfView(viewId) {
  const sec = NAV.find((n) => n.type === "section" && n.children && n.children.some((c) => c.id === viewId));
  return sec ? sec.id : null;
}
// قراءة الواجهة الحالية من رابط المتصفح (#) — تثبت عند تحديث الصفحة
function viewFromHash() {
  const h = (window.location.hash || "").replace(/^#/, "");
  return VIEW_INFO[h] ? h : "exec_kpi";
}

// جرس الإشعارات — تنبيهات فعلية موجّهة للإدارات لاتخاذ إجراء
function NotificationBell() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await httpsCallable(functions, "getMyNotifications")({});
      setNotifs((res.data && res.data.notifications) || []);
      setUnread((res.data && res.data.unreadCount) || 0);
    } catch (e) { /* تجاهل */ }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000); // تحديث كل دقيقة
    return () => clearInterval(iv);
  }, []);

  const markRead = async (id) => {
    try {
      await httpsCallable(functions, "markNotificationRead")({ notifId: id });
      setNotifs((arr) => arr.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnread((u) => Math.max(0, u - 1));
    } catch (e) { /* تجاهل */ }
  };

  const goTo = (n) => {
    if (!n.read) markRead(n.id);
    if (n.relatedType === "price_quote") {
      window.location.hash = n.targetModule === "SALES" ? "#sal_quote" : "#fin_review";
    }
    setOpen(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <button className="sh-top-btn" onClick={() => { setOpen((o) => !o); if (!open) load(); }} style={{ position: "relative" }}>
        <Bell size={17} />
        {unread > 0 ? <span style={bellStyles.badge}>{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {open ? (
        <>
          <div style={bellStyles.overlay} onClick={() => setOpen(false)} />
          <div style={bellStyles.panel}>
            <div style={bellStyles.head}>{t("notifications")}</div>
            {loading ? (
              <div style={bellStyles.empty}>…</div>
            ) : notifs.length === 0 ? (
              <div style={bellStyles.empty}>{t("noNotifications")}</div>
            ) : (
              <div style={bellStyles.list}>
                {notifs.map((n) => (
                  <div key={n.id} style={{ ...bellStyles.item, ...(n.read ? {} : bellStyles.itemUnread) }} onClick={() => goTo(n)}>
                    <div style={bellStyles.itemTitle}>{n.title}</div>
                    <div style={bellStyles.itemMsg}>{n.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

const bellStyles = {
  badge: { position: "absolute", top: -4, insetInlineEnd: -4, minWidth: 16, height: 16, padding: "0 4px", background: "#dc2626", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 },
  overlay: { position: "fixed", inset: 0, zIndex: 998 },
  panel: { position: "absolute", top: "calc(100% + 8px)", insetInlineEnd: 0, width: 340, maxHeight: 420, overflowY: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,.15)", zIndex: 999 },
  head: { padding: "14px 16px", fontSize: 14, fontWeight: 800, color: "#0f172a", borderBottom: "1px solid #f1f5f9" },
  empty: { padding: "28px 16px", textAlign: "center", color: "#94a3b8", fontSize: 13 },
  list: { display: "flex", flexDirection: "column" },
  item: { padding: "12px 16px", borderBottom: "1px solid #f8fafc", cursor: "pointer", background: "#fff" },
  itemUnread: { background: "#eff6ff" },
  itemTitle: { fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 3 },
  itemMsg: { fontSize: 12, color: "#64748b", lineHeight: 1.5 },
};

export default function CentralShell({ views = {} }) {
  const { t, dir } = useT();
  // ===== المصادقة =====
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
    return () => unsub();
  }, []);

  // ===== التنقّل (يثبت عند التحديث عبر #) =====
  const [activeView, setActiveView] = useState(viewFromHash());
  useEffect(() => {
    const onHash = () => setActiveView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const [expanded, setExpanded] = useState(() => {
    const sec = sectionOfView(viewFromHash());
    return sec ? { [sec]: true } : { exec: true };
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navStack, setNavStack] = useState([]); // سجلّ الصفحات السابقة (لزر العودة)

  const toggleSection = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));
  const openView = (id) => {
    setNavStack((prev) => (id !== activeView ? [...prev, activeView] : prev)); // احفظ الحالية قبل الانتقال
    if (window.location.hash !== "#" + id) window.location.hash = id;
    setActiveView(id);
    const sec = sectionOfView(id);
    if (sec) setExpanded((p) => ({ ...p, [sec]: true }));
    setMobileOpen(false);
  };
  const goBack = () => {
    if (navStack.length === 0) return;
    const prev = navStack[navStack.length - 1];
    setNavStack((s) => s.slice(0, -1)); // احذف آخر صفحة من السجل
    if (window.location.hash !== "#" + prev) window.location.hash = prev;
    setActiveView(prev);
    const sec = sectionOfView(prev);
    if (sec) setExpanded((p) => ({ ...p, [sec]: true }));
  };
  const handleLogout = async () => {
    try { await signOut(auth); } catch (e) { /* تجاهل */ }
  };

  // شاشة تحميل أثناء فحص المصادقة، ثم شاشة الدخول إن لم يكن مسجّلًا الدخول
  if (authLoading) return <LoadingScreen />;
  if (!user) return <LoginScreen />;

  const userInitial = ((user.displayName || user.email || "؟").trim().charAt(0) || "؟").toUpperCase();
  const cur = VIEW_INFO[activeView] || {};
  const CurIcon = cur.icon || Package;

  return (
    <div className="sh-root">
      <style>{STYLES}</style>

      {/* SIDEBAR */}
      <aside className={`sh-sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="sh-brand">
          <div className="sh-brand-logo">C</div>
          <div>
            <div className="sh-brand-name">Central<span>.</span></div>
            <div className="sh-brand-sub">نظام إدارة التوريد</div>
          </div>
        </div>

        <nav className="sh-nav">
          {NAV.map((node, idx) => {
            if (node.type === "divider") {
              return <div className="sh-divider" key={idx}>{node.label}</div>;
            }
            if (node.type === "item") {
              const Icon = node.icon;
              const active = activeView === node.id;
              return (
                <button key={node.id} className={`sh-item-btn ${active ? "active" : ""}`}
                        style={{ "--c": node.color }} onClick={() => openView(node.id)}>
                  <span className="sh-sec-ic"><Icon size={17} /></span>
                  <span className="sh-sec-name">{t(node.id)}</span>
                </button>
              );
            }
            // section
            const Icon = node.icon;
            const isOpen = !!expanded[node.id];
            const hasActive = node.children.some((c) => c.id === activeView);
            return (
              <div className="sh-sec" key={node.id} style={{ "--c": node.color }}>
                <button className="sh-sec-btn" onClick={() => toggleSection(node.id)}>
                  <span className="sh-sec-ic"><Icon size={17} /></span>
                  <span className="sh-sec-name" style={hasActive ? { color: node.color, fontWeight: 700 } : null}>{t(node.id)}</span>
                  <ChevronDown size={16} className={`sh-sec-chev ${isOpen ? "open" : ""}`} />
                </button>
                <div className={`sh-children ${isOpen ? "open" : ""}`}>
                  <div className="sh-children-inner">
                    {node.children.map((c) => {
                      const active = activeView === c.id;
                      return (
                        <button key={c.id} className={`sh-child ${active ? "active" : ""}`}
                                style={{ "--c": node.color }} onClick={() => openView(c.id)}>
                          <span className="sh-child-dot" />
                          <span>{t(c.id)}</span>
                          {c.file && <span className="sh-child-file" title="واجهة جاهزة" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* OVERLAY (mobile) */}
      <div className={`sh-overlay ${mobileOpen ? "show" : ""}`} onClick={() => setMobileOpen(false)} />

      {/* MAIN */}
      <div className="sh-main">
        <div className="sh-topbar">
          <button className="sh-burger" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
          {navStack.length > 0 ? (
            <button className="sh-back" onClick={goBack} title="رجوع"><ArrowRight size={18} /></button>
          ) : null}
          <div className="sh-crumb">
            <span className="sh-crumb-dept">{cur.dept ? t(cur.dept) : t("platformAdmin")}</span>
            <ChevronDown size={14} className="sh-crumb-sep" style={{ transform: "rotate(90deg)" }} />
            <span className="sh-crumb-cur">{t(activeView)}</span>
          </div>
          <div className="sh-top-actions">
            <button className="sh-top-btn"><Search size={17} /></button>
            <NotificationBell />
            <LanguageSwitcher />
            <div className="sh-avatar" title={user.email || ""}>{userInitial}</div>
            <button className="sh-logout" onClick={handleLogout} title={t("logout")}><LogOut size={17} /></button>
          </div>
        </div>

        {/* CONTENT — يعرض الواجهة الفعلية المربوطة، وإلا رسالة للتفرّع المخطّط */}
        <div className="sh-content">
          {views[activeView] ? (
            React.createElement(views[activeView], { view: activeView })
          ) : (
            <div className="sh-ph" style={{ "--c": cur.color }}>
              <div className="sh-ph-card">
                <div className="sh-ph-ic"><CurIcon size={34} /></div>
                <div className="sh-ph-name">{t(activeView)}</div>
                <div className="sh-ph-dept">{cur.dept ? t(cur.dept) : t("platformAdmin")}</div>
                {cur.file ? (
                  <div className="sh-ph-box ready">
                    <div className="sh-ph-status ready"><Package size={15} /> واجهة جاهزة للربط</div>
                    <div className="sh-ph-file">{cur.file}</div>
                    <div className="sh-ph-desc">
                      هذه الواجهة مبنية. أضِفها إلى خريطة <code>views</code> في ملف App.jsx لتظهر هنا.
                    </div>
                  </div>
                ) : (
                  <div className="sh-ph-box plan">
                    <div className="sh-ph-status plan"><Settings size={15} /> واجهة مخطّطة</div>
                    <div className="sh-ph-desc">
                      هذا التفرّع ضمن الهيكل لكن واجهته لم تُبنَ بعد. جاهز للبناء عند الحاجة بنفس نمط بقية الواجهات.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════ شاشة تسجيل الدخول ═══════════
function loginError(code) {
  const map = {
    "auth/invalid-email": "البريد الإلكتروني غير صحيح.",
    "auth/user-not-found": "لا يوجد حساب بهذا البريد.",
    "auth/wrong-password": "كلمة المرور غير صحيحة.",
    "auth/invalid-credential": "البريد أو كلمة المرور غير صحيحة.",
    "auth/too-many-requests": "محاولات كثيرة، انتظر قليلًا ثم أعد المحاولة.",
    "auth/user-disabled": "هذا الحساب معطّل.",
    "auth/network-request-failed": "تعذّر الاتصال، تحقّق من الإنترنت.",
  };
  return map[code] || "تعذّر تسجيل الدخول، تأكّد من البيانات.";
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setErr("");
    if (!email.includes("@")) { setErr("البريد الإلكتروني غير صحيح."); return; }
    if (password.length < 6) { setErr("كلمة المرور 6 أحرف على الأقل."); return; }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // onAuthStateChanged في CentralShell يتكفّل بعرض النظام
    } catch (e) {
      setErr(loginError(e && e.code));
      setLoading(false);
    }
  }
  const onKey = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div className="lg-wrap">
      <style>{STYLES}</style>
      <div className="lg-card">
        <div className="lg-logo">C</div>
        <div className="lg-title">Central<span>.</span></div>
        <div className="lg-sub">نظام إدارة التوريد</div>
        {err ? <div className="lg-err">{err}</div> : null}
        <input className="lg-input" type="email" placeholder="البريد الإلكتروني" value={email}
               onChange={(e) => setEmail(e.target.value)} onKeyDown={onKey} disabled={loading} dir="ltr" autoFocus />
        <input className="lg-input" type="password" placeholder="كلمة المرور" value={password}
               onChange={(e) => setPassword(e.target.value)} onKeyDown={onKey} disabled={loading} dir="ltr" />
        <button className="lg-btn" onClick={submit} disabled={loading}>
          {loading ? "جارٍ الدخول..." : "تسجيل الدخول"}
        </button>
      </div>
    </div>
  );
}

// ═══════════ شاشة التحميل ═══════════
function LoadingScreen() {
  return (
    <div className="sh-loading">
      <style>{STYLES}</style>
      <div className="lg-logo">C</div>
      <div className="sh-loading-text">جارٍ التحميل...</div>
    </div>
  );
}
