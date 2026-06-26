import React from "react";
import {
  BookOpen, Users, Clock, Wallet, GraduationCap, Award,
  Calendar, ChevronDown, TrendingUp
} from "lucide-react";

/* ============================================================
   التدريب والتطوير — قسم الموارد البشرية
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getTrainingSummary (دالة backend جديدة)
const KPIS = [
  { id: "prog",   label: "برامج نشطة",          value: "5",      sub: "برنامج", icon: BookOpen, color: "#2563eb" },
  { id: "part",   label: "مشاركون",             value: "38",     sub: "موظف",   icon: Users,    color: "#7c3aed" },
  { id: "hours",  label: "ساعات التدريب",       value: "640",    sub: "ساعة",   icon: Clock,    color: "#16a34a" },
  { id: "budget", label: "الميزانية المصروفة",  value: "84,000", unit: "ر.س",   icon: Wallet,   color: "#ea580c" },
];

// 📚 البرامج التدريبية — مصدرها: getTrainingPrograms
const PROGRAMS = [
  { name: "أساسيات المحاسبة المتقدمة", type: "تقني",   participants: 12, progress: 75, status: "active"   },
  { name: "السلامة المهنية (HSE)",     type: "إلزامي", participants: 24, progress: 90, status: "active"   },
  { name: "مهارات القيادة",            type: "إداري",  participants: 8,  progress: 60, status: "active"   },
  { name: "خدمة العملاء المتميزة",     type: "مهارات", participants: 10, progress: 40, status: "active"   },
  { name: "الأمن السيبراني للموظفين",  type: "توعية",  participants: 0,  progress: 0,  status: "upcoming" },
];

// 💰 الميزانية التدريبية — مصدرها: getTrainingBudget
const BUDGET = { spent: 84000, planned: 120000 };
const avgHours = 20;

// 🏅 المهارات والشهادات المكتسبة — مصدرها: getEmployeeSkills
const SKILLS = [
  { name: "محاسب إداري معتمد (CMA)", count: 3  },
  { name: "إدارة المشاريع (PMP)",   count: 2  },
  { name: "السلامة المهنية",        count: 24 },
  { name: "خدمة العملاء",           count: 10 },
  { name: "تحليل البيانات",         count: 5  },
];

const budgetPct = Math.round((BUDGET.spent / BUDGET.planned) * 100);
const fmt = (n) => n.toLocaleString("en-US");

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .trn-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .trn-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .trn-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .trn-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#2563eb1a; color:#2563eb; flex-shrink:0}
  .trn-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .trn-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .trn-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .trn-period svg:first-child{color:#2563eb}

  .trn-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .trn-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .trn-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .trn-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .trn-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .trn-kpi-val{font-size:24px; font-weight:700}
  .trn-kpi-val .u, .trn-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  .trn-row{display:grid; grid-template-columns:1.6fr 1fr; gap:16px; margin-bottom:16px; align-items:start}
  .trn-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .trn-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .trn-card-title{font-size:15.5px; font-weight:700}
  .trn-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* PROGRAMS */
  .trn-progs{display:flex; flex-direction:column; gap:14px}
  .trn-prog-top{display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:9px}
  .trn-prog-info{min-width:0}
  .trn-prog-name{font-size:13.5px; font-weight:600}
  .trn-prog-meta{font-size:11.5px; color:var(--ink3); margin-top:2px}
  .trn-prog-badge{font-size:10.5px; font-weight:700; padding:4px 10px; border-radius:999px; flex-shrink:0; white-space:nowrap}
  .trn-prog-badge.active{background:#dcfce7; color:#15803d}
  .trn-prog-badge.upcoming{background:#fef9c3; color:#92740a}
  .trn-prog-barrow{display:flex; align-items:center; gap:10px}
  .trn-prog-bar{flex:1; height:7px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .trn-prog-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#2563eb,#60a5fa)}
  .trn-prog-pct{font-size:12px; font-weight:700; color:var(--ink2); font-variant-numeric:tabular-nums; min-width:38px; text-align:left}

  /* BUDGET side */
  .trn-budget-big{font-size:13px; color:var(--ink2); margin-bottom:7px; font-weight:500}
  .trn-budget-bar{height:11px; background:#eef1f6; border-radius:999px; overflow:hidden; margin-bottom:9px}
  .trn-budget-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#ea580c,#fb923c)}
  .trn-budget-vals{display:flex; justify-content:space-between; font-size:12px; font-variant-numeric:tabular-nums}
  .trn-budget-vals .l{color:var(--ink3)} .trn-budget-vals b{color:var(--ink); font-weight:700}
  .trn-divider{height:1px; background:var(--line); margin:18px 0}
  .trn-stat{display:flex; align-items:center; gap:12px}
  .trn-stat-ic{width:42px; height:42px; border-radius:11px; background:#16a34a14; color:#16a34a; display:grid; place-items:center; flex-shrink:0}
  .trn-stat-v{font-size:22px; font-weight:700; line-height:1}
  .trn-stat-l{font-size:12px; color:var(--ink2); margin-top:3px}

  /* SKILLS */
  .trn-skills{display:grid; grid-template-columns:repeat(5,1fr); gap:12px}
  .trn-skill{padding:15px 14px; border-radius:13px; background:var(--bg); border:1px solid var(--line); text-align:center}
  .trn-skill-ic{width:38px; height:38px; border-radius:10px; background:#7c3aed14; color:#7c3aed; display:grid; place-items:center; margin:0 auto 10px}
  .trn-skill-count{font-size:22px; font-weight:800; line-height:1}
  .trn-skill-name{font-size:11.5px; color:var(--ink2); margin-top:6px; line-height:1.35; font-weight:500}

  @media(max-width:1000px){
    .trn-kpis{grid-template-columns:repeat(2,1fr)}
    .trn-row{grid-template-columns:1fr}
    .trn-skills{grid-template-columns:repeat(3,1fr)}
  }
  @media(max-width:560px){
    .trn-root{padding:18px 14px}
    .trn-kpis{grid-template-columns:1fr}
    .trn-skills{grid-template-columns:repeat(2,1fr)}
    .trn-title{font-size:19px}
  }
`;

export default function TrainingView() {
  return (
    <div className="trn-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="trn-head">
        <div className="trn-head-ic"><GraduationCap size={25} /></div>
        <div>
          <div className="trn-title">التدريب والتطوير</div>
          <div className="trn-sub">البرامج التدريبية وتطوير المهارات · الموارد البشرية</div>
        </div>
        <button className="trn-period">
          <Calendar size={16} /> هذا الربع <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="trn-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="trn-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="trn-kpi-ic"><Icon size={19} /></div>
              <div className="trn-kpi-label">{k.label}</div>
              <div className="trn-kpi-val trn-num">
                {k.value}
                {k.unit && <span className="u">{k.unit}</span>}
                {k.sub && <span className="s">{k.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ROW: PROGRAMS + BUDGET */}
      <div className="trn-row">

        <div className="trn-card" style={{ marginBottom: 0 }}>
          <div className="trn-card-head">
            <span className="trn-card-title">البرامج التدريبية</span>
            <span className="trn-card-hint">{PROGRAMS.length} برنامج</span>
          </div>
          <div className="trn-progs">
            {PROGRAMS.map((p, i) => (
              <div key={i}>
                <div className="trn-prog-top">
                  <div className="trn-prog-info">
                    <div className="trn-prog-name">{p.name}</div>
                    <div className="trn-prog-meta">{p.type} · {p.participants} مشارك</div>
                  </div>
                  <span className={`trn-prog-badge ${p.status}`}>
                    {p.status === "active" ? "نشط" : "قادم"}
                  </span>
                </div>
                <div className="trn-prog-barrow">
                  <div className="trn-prog-bar"><i style={{ width: `${p.progress}%` }} /></div>
                  <span className="trn-prog-pct">{p.progress}٪</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="trn-card" style={{ marginBottom: 0 }}>
          <div className="trn-card-head">
            <span className="trn-card-title">الميزانية التدريبية</span>
          </div>
          <div className="trn-budget-big">المصروف من المخطّط ({budgetPct}٪)</div>
          <div className="trn-budget-bar"><i style={{ width: `${budgetPct}%` }} /></div>
          <div className="trn-budget-vals">
            <span className="l">مصروف <b>{fmt(BUDGET.spent)}</b></span>
            <span className="l">مخطّط <b>{fmt(BUDGET.planned)}</b></span>
          </div>
          <div className="trn-divider" />
          <div className="trn-stat">
            <div className="trn-stat-ic"><TrendingUp size={20} /></div>
            <div>
              <div className="trn-stat-v trn-num">{avgHours} ساعة</div>
              <div className="trn-stat-l">متوسط التدريب لكل موظف</div>
            </div>
          </div>
        </div>

      </div>

      {/* SKILLS */}
      <div className="trn-card">
        <div className="trn-card-head">
          <span className="trn-card-title">المهارات والشهادات المكتسبة</span>
          <Award size={17} style={{ color: "#94a0b8" }} />
        </div>
        <div className="trn-skills">
          {SKILLS.map((s, i) => (
            <div className="trn-skill" key={i}>
              <div className="trn-skill-ic"><Award size={18} /></div>
              <div className="trn-skill-count trn-num">{s.count}</div>
              <div className="trn-skill-name">{s.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
