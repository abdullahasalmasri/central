import React from "react";
import {
  Eye, Heart, UserPlus, Wallet, Share2, Search, Users,
  Calendar, ChevronDown, Megaphone, Target
} from "lucide-react";

/* ============================================================
   التسويق والتواصل — قسم المبيعات والتسويق
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getMarketingSummary (دالة backend جديدة)
const KPIS = [
  { id: "reach",  label: "الوصول",            value: "48,500", icon: Eye,      color: "#db2777" },
  { id: "eng",    label: "معدل التفاعل",      value: "6.2", suffix: "%", icon: Heart,    color: "#e11d48" },
  { id: "leads",  label: "عملاء جدد",         value: "34", sub: "محتمل", icon: UserPlus, color: "#16a34a" },
  { id: "budget", label: "الميزانية المصروفة", value: "62,000", unit: "ر.س", icon: Wallet, color: "#ea580c" },
];

// 📢 الحملات التسويقية — مصدرها: getCampaigns
// status: active=نشطة · ended=منتهية
const CAMPAIGNS = [
  { name: "حملة LinkedIn B2B",   channel: "لينكدإن", status: "active", leads: 18, reach: 22000 },
  { name: "حملة جوجل للبحث",     channel: "جوجل",    status: "active", leads: 12, reach: 15000 },
  { name: "معرض التوظيف السنوي", channel: "فعالية",  status: "ended",  leads: 9,  reach: 5000  },
  { name: "رعاية مؤتمر صناعي",   channel: "رعاية",   status: "ended",  leads: 5,  reach: 6500  },
];

// 🎯 مصادر العملاء المحتملين — مصدرها: getLeadSources
const SOURCES = [
  { name: "لينكدإن",   value: 18, pct: 40, icon: Share2,   color: "#db2777" },
  { name: "جوجل",      value: 12, pct: 27, icon: Search,   color: "#2563eb" },
  { name: "الإحالات",  value: 8,  pct: 18, icon: Users,    color: "#16a34a" },
  { name: "الفعاليات", value: 7,  pct: 15, icon: Calendar, color: "#ea580c" },
];

// 📈 أداء القنوات (معدل التحويل) — مصدرها: getLeadSources
const CHANNELS = [
  { name: "الإحالات",  conv: 45 },
  { name: "لينكدإن",   conv: 32 },
  { name: "جوجل",      conv: 28 },
  { name: "الفعاليات", conv: 22 },
];

// 💰 ميزانية التسويق — مصدرها: getMarketingBudget
const BUDGET = { spent: 62000, planned: 90000 };

const STATUS = {
  active: { label: "نشطة",   cls: "active" },
  ended:  { label: "منتهية", cls: "ended"  },
};

const maxConv = Math.max(...CHANNELS.map((c) => c.conv));
const budgetPct = Math.round((BUDGET.spent / BUDGET.planned) * 100);
const fmt = (n) => n.toLocaleString("en-US");

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .mkt-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .mkt-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .mkt-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .mkt-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#db27771a; color:#db2777; flex-shrink:0}
  .mkt-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .mkt-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .mkt-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .mkt-period svg:first-child{color:#db2777}

  .mkt-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .mkt-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .mkt-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .mkt-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .mkt-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .mkt-kpi-val{font-size:24px; font-weight:700}
  .mkt-kpi-val .u{font-size:13px; color:var(--ink3); font-weight:600; margin-right:3px}
  .mkt-kpi-val .x{font-size:15px; color:var(--ink3); font-weight:600}
  .mkt-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  .mkt-row{display:grid; gap:16px; margin-bottom:16px; align-items:start}
  .mkt-row.a{grid-template-columns:1.6fr 1fr}
  .mkt-row.b{grid-template-columns:1.4fr 1fr}
  .mkt-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .mkt-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .mkt-card-title{font-size:15.5px; font-weight:700}
  .mkt-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* CAMPAIGNS */
  .mkt-camps{display:flex; flex-direction:column; gap:10px}
  .mkt-camp{display:flex; align-items:center; gap:13px; padding:13px 14px; border-radius:12px; background:var(--bg); border:1px solid var(--line)}
  .mkt-camp-ic{width:36px; height:36px; border-radius:10px; background:#db27771a; color:#db2777; display:grid; place-items:center; flex-shrink:0}
  .mkt-camp-info{flex:1; min-width:0}
  .mkt-camp-name{font-size:13.5px; font-weight:600}
  .mkt-camp-meta{font-size:11.5px; color:var(--ink3); margin-top:2px}
  .mkt-camp-stats{text-align:left; flex-shrink:0}
  .mkt-camp-leads{font-size:15px; font-weight:800; font-variant-numeric:tabular-nums}
  .mkt-camp-reach{font-size:11px; color:var(--ink3); font-variant-numeric:tabular-nums}
  .mkt-cpill{font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:999px; flex-shrink:0; white-space:nowrap}
  .mkt-cpill.active{background:#dcfce7; color:#15803d}
  .mkt-cpill.ended{background:#eef1f6; color:#64748b}

  /* BUDGET */
  .mkt-budget-cap{font-size:13px; color:var(--ink2); margin-bottom:8px; font-weight:500}
  .mkt-budget-bar{height:11px; background:#eef1f6; border-radius:999px; overflow:hidden; margin-bottom:9px}
  .mkt-budget-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#ea580c,#fb923c)}
  .mkt-budget-vals{display:flex; justify-content:space-between; font-size:12px; font-variant-numeric:tabular-nums}
  .mkt-budget-vals .l{color:var(--ink3)} .mkt-budget-vals b{color:var(--ink); font-weight:700}
  .mkt-divider{height:1px; background:var(--line); margin:18px 0}
  .mkt-cpl{display:flex; align-items:center; justify-content:space-between}
  .mkt-cpl-l{font-size:12.5px; color:var(--ink2); font-weight:600}
  .mkt-cpl-v{font-size:18px; font-weight:700; font-variant-numeric:tabular-nums}

  /* SOURCES */
  .mkt-srcs{display:flex; flex-direction:column; gap:14px}
  .mkt-src-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:7px}
  .mkt-src-name{display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600}
  .mkt-src-ic{width:26px; height:26px; border-radius:7px; display:grid; place-items:center; flex-shrink:0}
  .mkt-src-val{font-size:13px; font-weight:700; font-variant-numeric:tabular-nums}
  .mkt-src-val .p{font-size:11px; color:var(--ink3); font-weight:600; margin-right:5px}
  .mkt-src-bar{height:8px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .mkt-src-bar i{display:block; height:100%; border-radius:999px}

  /* CHANNELS */
  .mkt-chans{display:flex; flex-direction:column; gap:13px}
  .mkt-chan-top{display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:6px}
  .mkt-chan-name{color:var(--ink2); font-weight:600; display:flex; align-items:center; gap:6px}
  .mkt-chan-best{font-size:9.5px; font-weight:700; padding:1px 7px; border-radius:999px; background:#dcfce7; color:#15803d}
  .mkt-chan-val{font-weight:700; font-variant-numeric:tabular-nums}
  .mkt-chan-bar{height:7px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .mkt-chan-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#16a34a,#4ade80)}

  @media(max-width:1000px){
    .mkt-kpis{grid-template-columns:repeat(2,1fr)}
    .mkt-row.a,.mkt-row.b{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .mkt-root{padding:18px 14px}
    .mkt-kpis{grid-template-columns:1fr}
    .mkt-title{font-size:19px}
  }
`;

export default function MarketingView() {
  return (
    <div className="mkt-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="mkt-head">
        <div className="mkt-head-ic"><Megaphone size={24} /></div>
        <div>
          <div className="mkt-title">التسويق والتواصل</div>
          <div className="mkt-sub">الحملات والقنوات ومصادر العملاء · المبيعات والتسويق</div>
        </div>
        <button className="mkt-period">
          <Calendar size={16} /> هذا الشهر <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="mkt-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="mkt-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="mkt-kpi-ic"><Icon size={19} /></div>
              <div className="mkt-kpi-label">{k.label}</div>
              <div className="mkt-kpi-val mkt-num">
                {k.value}
                {k.unit && <span className="u">{k.unit}</span>}
                {k.suffix && <span className="x">{k.suffix}</span>}
                {k.sub && <span className="s">{k.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ROW A: CAMPAIGNS + BUDGET */}
      <div className="mkt-row a">

        <div className="mkt-card" style={{ marginBottom: 0 }}>
          <div className="mkt-card-head">
            <span className="mkt-card-title">الحملات التسويقية</span>
            <span className="mkt-card-hint">{CAMPAIGNS.length} حملة</span>
          </div>
          <div className="mkt-camps">
            {CAMPAIGNS.map((c, i) => {
              const st = STATUS[c.status];
              return (
                <div className="mkt-camp" key={i}>
                  <div className="mkt-camp-ic"><Megaphone size={16} /></div>
                  <div className="mkt-camp-info">
                    <div className="mkt-camp-name">{c.name}</div>
                    <div className="mkt-camp-meta">{c.channel}</div>
                  </div>
                  <span className={`mkt-cpill ${st.cls}`}>{st.label}</span>
                  <div className="mkt-camp-stats">
                    <div className="mkt-camp-leads">{c.leads}</div>
                    <div className="mkt-camp-reach">وصول {fmt(c.reach)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mkt-card" style={{ marginBottom: 0 }}>
          <div className="mkt-card-head">
            <span className="mkt-card-title">ميزانية التسويق</span>
          </div>
          <div className="mkt-budget-cap">المصروف من المخطّط ({budgetPct}٪)</div>
          <div className="mkt-budget-bar"><i style={{ width: `${budgetPct}%` }} /></div>
          <div className="mkt-budget-vals">
            <span className="l">مصروف <b>{fmt(BUDGET.spent)}</b></span>
            <span className="l">مخطّط <b>{fmt(BUDGET.planned)}</b></span>
          </div>
          <div className="mkt-divider" />
          <div className="mkt-cpl">
            <span className="mkt-cpl-l">تكلفة العميل المحتمل</span>
            <span className="mkt-cpl-v mkt-num">1,823 ر.س</span>
          </div>
        </div>

      </div>

      {/* ROW B: SOURCES + CHANNELS */}
      <div className="mkt-row b">

        <div className="mkt-card" style={{ marginBottom: 0 }}>
          <div className="mkt-card-head">
            <span className="mkt-card-title">مصادر العملاء المحتملين</span>
            <Target size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="mkt-srcs">
            {SOURCES.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.name}>
                  <div className="mkt-src-top">
                    <span className="mkt-src-name">
                      <span className="mkt-src-ic" style={{ background: s.color + "1a", color: s.color }}>
                        <Icon size={14} />
                      </span>
                      {s.name}
                    </span>
                    <span className="mkt-src-val mkt-num">{s.value}<span className="p">{s.pct}٪</span></span>
                  </div>
                  <div className="mkt-src-bar"><i style={{ width: `${s.pct}%`, background: s.color }} /></div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mkt-card" style={{ marginBottom: 0 }}>
          <div className="mkt-card-head">
            <span className="mkt-card-title">أداء القنوات</span>
            <span className="mkt-card-hint">معدل التحويل</span>
          </div>
          <div className="mkt-chans">
            {CHANNELS.map((c, i) => (
              <div key={c.name}>
                <div className="mkt-chan-top">
                  <span className="mkt-chan-name">
                    {c.name}
                    {i === 0 && <span className="mkt-chan-best">الأفضل</span>}
                  </span>
                  <span className="mkt-chan-val mkt-num">{c.conv}٪</span>
                </div>
                <div className="mkt-chan-bar"><i style={{ width: `${(c.conv / maxConv) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
