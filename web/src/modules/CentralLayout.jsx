import React, { useState } from "react";
import {
  Crown, Landmark, Users, Wrench, Building2, TrendingUp,
  Megaphone, Scale, Award, ChevronLeft, Menu, X, Search,
  Globe, Bell, CircleUserRound, CheckCircle2, Circle, PanelRightClose,
  CreditCard, LayoutGrid, Layers
} from "lucide-react";

/* ============================================================
   بنية الأقسام التسعة المعتمدة — تُعدّل بسهولة من هنا
   built:true = مبني فعليًا · built:false = مخطّط (يُبنى لاحقًا)
   ============================================================ */
const DEPARTMENTS = [
  {
    id: "executive", name: "الإدارة العليا", icon: Crown, color: "#7c3aed",
    subs: [
      { id: "dashboard",   name: "لوحة المؤشرات",      built: false },
      { id: "orgchart",    name: "الهيكل التنظيمي",     built: true  },
      { id: "permissions", name: "الصلاحيات والأدوار",  built: true  },
    ],
  },
  {
    id: "finance", name: "المالية", icon: Landmark, color: "#059669",
    subs: [
      { id: "accounting", name: "المحاسبة العامة",        built: true  },
      { id: "invoicing",  name: "الفوترة و ZATCA",        built: true  },
      { id: "customers",  name: "العملاء",                built: true  },
      { id: "statements", name: "القوائم المالية",        built: true  },
      { id: "collection", name: "التحصيل والائتمان",      built: false },
      { id: "treasury",   name: "الخزينة",                built: false },
      { id: "fpa",        name: "التخطيط والتحليل المالي", built: false },
      { id: "fin_proc",   name: "المشتريات المالية",      built: false },
    ],
  },
  {
    id: "hr", name: "الموارد البشرية", icon: Users, color: "#2563eb",
    subs: [
      { id: "personnel", name: "شؤون الموظفين",      built: true  },
      { id: "payroll",   name: "الرواتب الداخلية",   built: false },
      { id: "hiring",    name: "التوظيف والاستقطاب", built: false },
      { id: "training",  name: "التدريب والتطوير",   built: false },
      { id: "relations", name: "علاقات الموظفين",    built: false },
    ],
  },
  {
    id: "operations", name: "العمليات", icon: Wrench, color: "#ea580c",
    subs: [
      { id: "scheduling", name: "الحجوزات والجدولة",     built: true  },
      { id: "resourcing", name: "طلبات الموارد والإسناد", built: true  },
      { id: "projects",   name: "المشاريع",              built: true  },
      { id: "hse",        name: "الجودة والسلامة",        built: false },
    ],
  },
  {
    id: "assets", name: "الأصول والمرافق", icon: Building2, color: "#0e7490",
    subs: [
      { id: "vehicles",     name: "المركبات (الأسطول)", built: true  },
      { id: "housing",      name: "الإسكان",            built: true  },
      { id: "equipment",    name: "المعدّات",           built: true  },
      { id: "depreciation", name: "الإهلاك",            built: false },
    ],
  },
  {
    id: "profitability", name: "التكاليف والربحية", icon: TrendingUp, color: "#ca8a04",
    subs: [
      { id: "costing",     name: "التكلفة الشاملة",       built: true  },
      { id: "profit_rep",  name: "تقارير الربحية",        built: true  },
      { id: "shared_res",  name: "توزيع الموارد المشتركة", built: true  },
    ],
  },
  {
    id: "sales", name: "المبيعات والتسويق", icon: Megaphone, color: "#db2777",
    subs: [
      { id: "direct_sales", name: "المبيعات المباشرة", built: false },
      { id: "marketing",    name: "التسويق والتواصل",  built: false },
      { id: "cust_service", name: "خدمة العملاء",      built: false },
    ],
  },
  {
    id: "legal", name: "القانونية والامتثال", icon: Scale, color: "#57534e",
    subs: [
      { id: "contracts",  name: "العقود",            built: false },
      { id: "compliance", name: "الامتثال والتراخيص", built: false },
      { id: "disputes",   name: "المنازعات",         built: false },
    ],
  },
  {
    id: "quality", name: "التميز والجودة", icon: Award, color: "#65a30d",
    subs: [
      { id: "audit",        name: "التدقيق الداخلي",   built: false },
      { id: "satisfaction", name: "رضا العملاء و NPS", built: false },
      { id: "improvement",  name: "تحسين العمليات",    built: false },
    ],
  },

  /* ===== أقسام المنصة (تُفعّل في مرحلة التسييل) ===== */
  {
    id: "subscriptions", name: "الاشتراكات", icon: CreditCard, color: "#d97706", platform: true,
    subs: [
      { id: "sub_status",  name: "حالة الاشتراك والباقة", built: false },
      { id: "sub_billing", name: "المدفوعات والفواتير",   built: false },
    ],
  },
  {
    id: "builder", name: "بناء النظام", icon: LayoutGrid, color: "#4f46e5", platform: true,
    subs: [
      { id: "build_pick",    name: "اختيار الإدارات والأقسام", built: false },
      { id: "build_upgrade", name: "الترقية والدفع",          built: false },
      { id: "build_request", name: "طلب قسم مخصّص",           built: false },
    ],
  },
];

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .cx-root{
    --bg:#f4f6f9; --panel:#ffffff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec; --hover:#f0f3f8; --active-bg:#f7f9fc;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink);
    height:100vh; display:flex; flex-direction:column; overflow:hidden;
    -webkit-font-smoothing:antialiased;
  }
  .cx-num{font-variant-numeric:tabular-nums}

  /* TOPBAR */
  .cx-top{height:62px; flex-shrink:0; background:var(--panel); border-bottom:1px solid var(--line);
    display:flex; align-items:center; gap:16px; padding:0 18px; z-index:30}
  .cx-logo{display:flex; align-items:center; gap:11px}
  .cx-logo-mark{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:linear-gradient(140deg,#1e293b,#334155); color:#fff; font-weight:800; font-size:20px}
  .cx-logo-txt b{font-size:18px; font-weight:700; letter-spacing:-.3px; display:block; line-height:1.1}
  .cx-logo-txt span{font-size:11.5px; color:var(--ink3); font-weight:500}
  .cx-search{flex:1; max-width:420px; position:relative; display:flex; align-items:center}
  .cx-search svg{position:absolute; right:12px; color:var(--ink3); pointer-events:none}
  .cx-search input{width:100%; height:40px; border:1px solid var(--line2); border-radius:10px;
    background:var(--bg); padding:0 40px 0 14px; font-family:inherit; font-size:13.5px; color:var(--ink); outline:none}
  .cx-search input:focus{border-color:#94a3b8; background:#fff}
  .cx-top-actions{display:flex; align-items:center; gap:6px; margin-right:auto}
  .cx-icon-btn{width:40px; height:40px; border-radius:10px; border:none; background:transparent; cursor:pointer;
    display:grid; place-items:center; color:var(--ink2); position:relative; transition:background .12s}
  .cx-icon-btn:hover{background:var(--hover)}
  .cx-icon-btn:focus-visible{outline:2px solid #6366f1; outline-offset:1px}
  .cx-dot{position:absolute; top:9px; left:10px; width:7px; height:7px; border-radius:50%; background:#ef4444; border:2px solid var(--panel)}
  .cx-lang{display:flex; align-items:center; gap:6px; height:40px; padding:0 12px; border-radius:10px;
    border:1px solid var(--line2); background:transparent; cursor:pointer; font-family:inherit; font-size:13px; font-weight:600; color:var(--ink2)}
  .cx-lang:hover{background:var(--hover)}
  .cx-user{display:flex; align-items:center; gap:9px; padding-right:6px; margin-right:4px; border-right:1px solid var(--line)}
  .cx-user-av{width:36px; height:36px; border-radius:50%; background:linear-gradient(140deg,#6366f1,#8b5cf6);
    color:#fff; display:grid; place-items:center; font-weight:700; font-size:14px}
  .cx-user-info b{font-size:13.5px; font-weight:600; display:block; line-height:1.2}
  .cx-user-info span{font-size:11.5px; color:var(--ink3)}
  .cx-burger{display:none}

  /* BODY */
  .cx-body{flex:1; display:flex; min-height:0}

  /* SIDEBAR */
  .cx-side{width:286px; flex-shrink:0; background:var(--panel); border-left:1px solid var(--line);
    display:flex; flex-direction:column; z-index:20}
  .cx-side-head{padding:16px 18px 10px; display:flex; align-items:center; justify-content:space-between}
  .cx-side-head .t{font-size:12px; font-weight:700; color:var(--ink3); letter-spacing:.6px}
  .cx-side-close{display:none}
  .cx-nav{flex:1; overflow-y:auto; padding:4px 10px 18px}
  .cx-nav::-webkit-scrollbar{width:8px}
  .cx-nav::-webkit-scrollbar-thumb{background:#d4dae5; border-radius:8px}
  .cx-nav-divider{display:flex; align-items:center; gap:8px; padding:15px 12px 7px; margin-top:8px;
    font-size:11px; font-weight:700; color:var(--ink3); letter-spacing:.6px; border-top:1px solid var(--line)}

  .cx-dept{margin-bottom:2px}
  .cx-dept-btn{width:100%; display:flex; align-items:center; gap:11px; padding:9px 10px; border:none;
    background:transparent; cursor:pointer; border-radius:10px; font-family:inherit; text-align:right; transition:background .12s}
  .cx-dept-btn:hover{background:var(--hover)}
  .cx-dept-btn:focus-visible{outline:2px solid #6366f1; outline-offset:-2px}
  .cx-dept-ic{width:32px; height:32px; border-radius:9px; display:grid; place-items:center; flex-shrink:0}
  .cx-dept-name{flex:1; font-size:14px; font-weight:600; color:var(--ink)}
  .cx-dept-meta{font-size:11px; font-weight:600; color:var(--ink3); background:var(--bg);
    padding:2px 7px; border-radius:6px; flex-shrink:0}
  .cx-dept-meta.full{color:#16a34a; background:#dcfce7}
  .cx-chev{color:var(--ink3); transition:transform .18s; flex-shrink:0}
  .cx-chev.open{transform:rotate(-90deg)}

  .cx-subs{overflow:hidden; padding:2px 0 4px}
  .cx-sub{width:100%; display:flex; align-items:center; gap:9px; padding:7px 10px 7px 12px; margin:1px 0;
    border:none; background:transparent; cursor:pointer; border-radius:8px; font-family:inherit; text-align:right; position:relative}
  .cx-sub-rail{position:absolute; right:25px; top:0; bottom:0; width:1px; background:var(--line2)}
  .cx-sub-ic{margin-right:30px; flex-shrink:0; display:grid; place-items:center}
  .cx-sub-name{font-size:13px; flex:1}
  .cx-sub.built .cx-sub-name{color:var(--ink2); font-weight:500}
  .cx-sub.built:hover{background:var(--hover)}
  .cx-sub.built:hover .cx-sub-name{color:var(--ink)}
  .cx-sub.planned{cursor:default}
  .cx-sub.planned .cx-sub-name{color:var(--ink3)}
  .cx-sub.planned .cx-tag{font-size:10px; color:var(--ink3); background:var(--bg); padding:2px 7px; border-radius:999px; font-weight:600}
  .cx-sub.active{background:var(--active-bg)}
  .cx-sub.active::before{content:""; position:absolute; right:0; top:7px; bottom:7px; width:3px; border-radius:3px; background:var(--accent)}
  .cx-sub.active .cx-sub-name{font-weight:700; color:var(--ink)}
  .cx-sub:focus-visible{outline:2px solid #6366f1; outline-offset:-2px}

  /* CONTENT */
  .cx-main{flex:1; overflow-y:auto; padding:28px 32px}
  .cx-crumb{display:flex; align-items:center; gap:8px; font-size:12.5px; color:var(--ink3); margin-bottom:18px; font-weight:500}
  .cx-crumb b{color:var(--ink2); font-weight:600}
  .cx-page-head{display:flex; align-items:center; gap:15px; margin-bottom:22px}
  .cx-page-ic{width:52px; height:52px; border-radius:13px; display:grid; place-items:center; flex-shrink:0}
  .cx-page-title{font-size:24px; font-weight:700; letter-spacing:-.4px}
  .cx-page-sub{font-size:13.5px; color:var(--ink2); margin-top:3px}
  .cx-status-pill{display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700;
    padding:5px 12px; border-radius:999px; margin-right:auto}
  .cx-status-pill.built{color:#15803d; background:#dcfce7}
  .cx-status-pill.planned{color:#92740a; background:#fef9c3}

  .cx-placeholder{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:50px 30px; text-align:center; margin-top:4px}
  .cx-ph-ic{width:64px; height:64px; border-radius:16px; display:grid; place-items:center; margin:0 auto 16px}
  .cx-ph-title{font-size:17px; font-weight:700; margin-bottom:7px}
  .cx-ph-text{font-size:13.5px; color:var(--ink2); max-width:440px; margin:0 auto; line-height:1.65}

  /* OVERLAY (mobile) */
  .cx-overlay{display:none}

  /* RESPONSIVE */
  @media(max-width:860px){
    .cx-search{display:none}
    .cx-user-info{display:none}
    .cx-burger{display:grid}
    .cx-side{position:fixed; top:0; right:0; bottom:0; width:300px; transform:translateX(100%);
      transition:transform .26s cubic-bezier(.4,0,.2,1); box-shadow:-8px 0 32px rgba(0,0,0,.16)}
    .cx-side.open{transform:translateX(0)}
    .cx-side-close{display:grid}
    .cx-overlay.show{display:block; position:fixed; inset:0; background:rgba(15,23,42,.45); z-index:15}
    .cx-main{padding:20px 18px}
    .cx-page-title{font-size:20px}
  }
`;

export default function CentralLayout() {
  const [active, setActive] = useState({ dept: "operations", sub: "scheduling" });
  const [open, setOpen] = useState({ operations: true });
  const [drawer, setDrawer] = useState(false);

  const toggleDept = (id) =>
    setOpen((p) => ({ ...p, [id]: !p[id] }));

  const pickSub = (deptId, sub) => {
    if (!sub.built) return;
    setActive({ dept: deptId, sub: sub.id });
    setDrawer(false);
  };

  const dept = DEPARTMENTS.find((d) => d.id === active.dept);
  const sub = dept?.subs.find((s) => s.id === active.sub);
  const builtCount = (d) => d.subs.filter((s) => s.built).length;

  const renderDept = (d) => {
    const Icon = d.icon;
    const total = d.subs.length;
    const built = builtCount(d);
    const isOpen = !!open[d.id];
    return (
      <div className="cx-dept" key={d.id}>
        <button className="cx-dept-btn" onClick={() => toggleDept(d.id)} aria-expanded={isOpen}>
          <span className="cx-dept-ic" style={{ background: d.color + "1a", color: d.color }}>
            <Icon size={18} />
          </span>
          <span className="cx-dept-name">{d.name}</span>
          <span className={`cx-dept-meta${built === total ? " full" : ""}`}>
            <span className="cx-num">{built}</span>/<span className="cx-num">{total}</span>
          </span>
          <ChevronLeft size={16} className={`cx-chev${isOpen ? " open" : ""}`} />
        </button>
        {isOpen && (
          <div className="cx-subs">
            {d.subs.map((s) => {
              const isActive = active.dept === d.id && active.sub === s.id;
              return (
                <button
                  key={s.id}
                  className={`cx-sub ${s.built ? "built" : "planned"}${isActive ? " active" : ""}`}
                  style={isActive ? { "--accent": d.color } : undefined}
                  onClick={() => pickSub(d.id, s)}
                  tabIndex={s.built ? 0 : -1}
                >
                  <span className="cx-sub-rail" />
                  <span className="cx-sub-ic">
                    {s.built
                      ? <CheckCircle2 size={15} style={{ color: d.color }} />
                      : <Circle size={14} style={{ color: "#cbd3e0" }} />}
                  </span>
                  <span className="cx-sub-name">{s.name}</span>
                  {!s.built && <span className="cx-tag">قريبًا</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="cx-root">
      <style>{STYLES}</style>

      {/* TOPBAR */}
      <header className="cx-top">
        <button className="cx-icon-btn cx-burger" onClick={() => setDrawer(true)} aria-label="فتح القائمة">
          <Menu size={22} />
        </button>
        <div className="cx-logo">
          <div className="cx-logo-mark">C</div>
          <div className="cx-logo-txt">
            <b>Central</b>
            <span>شركة الإسناد للخدمات</span>
          </div>
        </div>
        <div className="cx-search">
          <Search size={17} />
          <input placeholder="ابحث في النظام…" />
        </div>
        <div className="cx-top-actions">
          <button className="cx-lang"><Globe size={16} /> ع</button>
          <button className="cx-icon-btn" aria-label="الإشعارات">
            <Bell size={20} /><span className="cx-dot" />
          </button>
          <div className="cx-user">
            <div className="cx-user-av">ع</div>
            <div className="cx-user-info">
              <b>عبدالله</b>
              <span>المالك</span>
            </div>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="cx-body">

        {/* SIDEBAR */}
        <aside className={`cx-side${drawer ? " open" : ""}`}>
          <div className="cx-side-head">
            <span className="t">الأقسام</span>
            <button className="cx-icon-btn cx-side-close" onClick={() => setDrawer(false)} aria-label="إغلاق">
              <X size={20} />
            </button>
          </div>
          <nav className="cx-nav">
            {DEPARTMENTS.filter((d) => !d.platform).map(renderDept)}
            <div className="cx-nav-divider"><Layers size={13} /> إدارة المنصة</div>
            {DEPARTMENTS.filter((d) => d.platform).map(renderDept)}
          </nav>
        </aside>

        {/* CONTENT */}
        <main className="cx-main">
          <div className="cx-crumb">
            <span>الأقسام</span>
            <ChevronLeft size={13} />
            <b>{dept?.name}</b>
            <ChevronLeft size={13} />
            <b>{sub?.name}</b>
          </div>

          <div className="cx-page-head">
            <span className="cx-page-ic" style={{ background: dept.color + "1a", color: dept.color }}>
              {dept && React.createElement(dept.icon, { size: 26 })}
            </span>
            <div>
              <div className="cx-page-title">{sub?.name}</div>
              <div className="cx-page-sub">{dept?.name}</div>
            </div>
            {sub?.built
              ? <span className="cx-status-pill built"><CheckCircle2 size={14} /> مبني</span>
              : <span className="cx-status-pill planned"><Circle size={13} /> مخطّط</span>}
          </div>

          <div className="cx-placeholder">
            <div className="cx-ph-ic" style={{ background: dept.color + "14", color: dept.color }}>
              {dept && React.createElement(sub?.built ? PanelRightClose : Circle, { size: 30 })}
            </div>
            <div className="cx-ph-title">
              {sub?.built ? `محتوى «${sub?.name}»` : `«${sub?.name}» — قيد التخطيط`}
            </div>
            <p className="cx-ph-text">
              {sub?.built
                ? "هذا القسم مبني في النظام — يُربط محتواه الفعلي هنا ضمن الهيكل الجديد. اخترنا الترتيب الهرمي ليجمع الوحدات تحت إدارتها الصحيحة."
                : "هذا القسم ضمن الخطة ويُبنى لاحقًا قسمًا قسمًا بالترتيب. يظهر الآن في مكانه الصحيح داخل الهيكل ليكتمل تدريجيًا."}
            </p>
          </div>
        </main>
      </div>

      {/* MOBILE OVERLAY */}
      <div className={`cx-overlay${drawer ? " show" : ""}`} onClick={() => setDrawer(false)} />
    </div>
  );
}
