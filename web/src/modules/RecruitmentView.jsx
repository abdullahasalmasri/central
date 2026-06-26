import React from "react";
import {
  Briefcase, Users, CalendarCheck, Timer, Filter, MessageSquare,
  FileCheck, UserCheck, Calendar, ChevronDown, Clock
} from "lucide-react";

/* ============================================================
   التوظيف والاستقطاب — قسم الموارد البشرية
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getRecruitmentSummary (دالة backend جديدة)
const KPIS = [
  { id: "vac",  label: "وظائف شاغرة",         value: "8",  sub: "وظيفة", icon: Briefcase,     color: "#2563eb" },
  { id: "app",  label: "متقدمون",             value: "47", sub: "متقدم", icon: Users,         color: "#7c3aed" },
  { id: "int",  label: "مقابلات هذا الأسبوع", value: "6",  sub: "مقابلة",icon: CalendarCheck, color: "#16a34a" },
  { id: "time", label: "متوسط وقت التوظيف",   value: "24", sub: "يوم",   icon: Timer,         color: "#ea580c" },
];

// 🔀 مسار التوظيف — مصدرها: getApplicants (تجميع حسب المرحلة)
const PIPELINE = [
  { stage: "فرز أولي", count: 23, icon: Filter,        color: "#60a5fa" },
  { stage: "مقابلة",   count: 12, icon: MessageSquare, color: "#818cf8" },
  { stage: "عرض",      count: 5,  icon: FileCheck,     color: "#fb923c" },
  { stage: "توظيف",    count: 3,  icon: UserCheck,     color: "#34d399" },
];

// 💼 الوظائف الشاغرة — مصدرها: getVacancies
const VACANCIES = [
  { title: "محاسب أول",          dept: "المالية",         applicants: 9  },
  { title: "أخصائي تسويق",       dept: "المبيعات",        applicants: 12 },
  { title: "مدير مبيعات",        dept: "المبيعات",        applicants: 7  },
  { title: "أخصائي موارد بشرية", dept: "الموارد البشرية", applicants: 8  },
  { title: "منسّق عمليات",       dept: "العمليات",        applicants: 6  },
];

// 📅 المقابلات المجدولة — مصدرها: getInterviews
const INTERVIEWS = [
  { name: "سعد الغامدي",     role: "محاسب أول",     when: "الأحد · ١٠ ص" },
  { name: "منى العتيبي",     role: "أخصائي تسويق",  when: "الاثنين · ١١ ص" },
  { name: "فيصل القحطاني",   role: "مدير مبيعات",   when: "الثلاثاء · ١ م" },
];

// 👤 المتقدمون — مصدرها: getApplicants
const APPLICANTS = [
  { name: "فيصل القحطاني",    role: "مدير مبيعات",   stage: "offer",     date: "١٥ يونيو" },
  { name: "سعد الغامدي",      role: "محاسب أول",     stage: "interview", date: "١٨ يونيو" },
  { name: "رنا الشهري",       role: "منسّق عمليات",  stage: "interview", date: "١٩ يونيو" },
  { name: "منى العتيبي",      role: "أخصائي تسويق",  stage: "screening", date: "٢٠ يونيو" },
  { name: "عبدالعزيز النفيعي", role: "محاسب أول",     stage: "screening", date: "٢١ يونيو" },
  { name: "لمى الزهراني",     role: "أخصائي موارد",  stage: "hired",     date: "١٢ يونيو" },
];

const STAGE = {
  screening: { label: "فرز",    cls: "screening" },
  interview: { label: "مقابلة", cls: "interview" },
  offer:     { label: "عرض",    cls: "offer"     },
  hired:     { label: "توظيف",  cls: "hired"     },
};

const maxPipe = Math.max(...PIPELINE.map((p) => p.count));

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .rec-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .rec-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .rec-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .rec-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#2563eb1a; color:#2563eb; flex-shrink:0}
  .rec-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .rec-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .rec-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .rec-period svg:first-child{color:#2563eb}

  .rec-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .rec-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .rec-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .rec-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .rec-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .rec-kpi-val{font-size:24px; font-weight:700}
  .rec-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  .rec-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; margin-bottom:16px}
  .rec-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .rec-card-title{font-size:15.5px; font-weight:700}
  .rec-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* PIPELINE */
  .rec-pipe{display:grid; grid-template-columns:repeat(4,1fr); gap:12px}
  .rec-stage{padding:16px; border-radius:13px; background:var(--bg); border:1px solid var(--line)}
  .rec-stage-top{display:flex; align-items:center; gap:9px; margin-bottom:12px}
  .rec-stage-ic{width:32px; height:32px; border-radius:9px; display:grid; place-items:center; flex-shrink:0}
  .rec-stage-name{font-size:12.5px; color:var(--ink2); font-weight:600}
  .rec-stage-count{font-size:28px; font-weight:800; font-variant-numeric:tabular-nums; line-height:1}
  .rec-stage-bar{height:6px; background:#eef1f6; border-radius:999px; overflow:hidden; margin-top:11px}
  .rec-stage-bar i{display:block; height:100%; border-radius:999px}

  .rec-row{display:grid; grid-template-columns:1.5fr 1fr; gap:16px; margin-bottom:16px; align-items:start}

  /* VACANCIES */
  .rec-vacs{display:flex; flex-direction:column; gap:9px}
  .rec-vac{display:flex; align-items:center; gap:12px; padding:12px 13px; border-radius:12px; background:var(--bg); border:1px solid var(--line)}
  .rec-vac-ic{width:34px; height:34px; border-radius:9px; background:#dbeafe; color:#2563eb; display:grid; place-items:center; flex-shrink:0}
  .rec-vac-info{flex:1; min-width:0}
  .rec-vac-title{font-size:13.5px; font-weight:600}
  .rec-vac-dept{font-size:11.5px; color:var(--ink3); margin-top:1px}
  .rec-vac-count{font-size:12px; font-weight:700; color:#2563eb; background:#dbeafe; padding:5px 11px; border-radius:999px; flex-shrink:0; white-space:nowrap}

  /* INTERVIEWS */
  .rec-ints{display:flex; flex-direction:column; gap:10px}
  .rec-int{display:flex; align-items:center; gap:11px; padding:12px 13px; border-radius:12px; background:var(--bg); border:1px solid var(--line)}
  .rec-int-ic{width:32px; height:32px; border-radius:9px; background:#dcfce7; color:#16a34a; display:grid; place-items:center; flex-shrink:0}
  .rec-int-info{flex:1; min-width:0}
  .rec-int-name{font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .rec-int-role{font-size:11.5px; color:var(--ink3)}
  .rec-int-when{font-size:11.5px; font-weight:600; color:var(--ink2); display:flex; align-items:center; gap:4px; flex-shrink:0; white-space:nowrap}

  /* TABLE */
  .rec-tablewrap{overflow-x:auto}
  table.rec-table{width:100%; border-collapse:collapse; min-width:520px}
  .rec-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 12px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .rec-table td{padding:13px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .rec-table tr:last-child td{border-bottom:none}
  .rec-app-name{font-weight:600; color:var(--ink); white-space:nowrap}
  .rec-app-role{color:var(--ink2); white-space:nowrap}
  .rec-app-date{color:var(--ink3); font-size:12px; white-space:nowrap}
  .rec-spill{display:inline-block; font-size:11px; font-weight:700; padding:4px 11px; border-radius:999px; white-space:nowrap}
  .rec-spill.screening{background:#dbeafe; color:#1d4ed8}
  .rec-spill.interview{background:#ede9fe; color:#6d28d9}
  .rec-spill.offer{background:#ffedd5; color:#9a3412}
  .rec-spill.hired{background:#dcfce7; color:#15803d}

  @media(max-width:1000px){
    .rec-kpis,.rec-pipe{grid-template-columns:repeat(2,1fr)}
    .rec-row{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .rec-root{padding:18px 14px}
    .rec-kpis,.rec-pipe{grid-template-columns:1fr}
    .rec-title{font-size:19px}
  }
`;

export default function RecruitmentView() {
  return (
    <div className="rec-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="rec-head">
        <div className="rec-head-ic"><Briefcase size={24} /></div>
        <div>
          <div className="rec-title">التوظيف والاستقطاب</div>
          <div className="rec-sub">الوظائف الشاغرة ومسار المرشحين · الموارد البشرية</div>
        </div>
        <button className="rec-period">
          <Calendar size={16} /> هذا الشهر <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="rec-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="rec-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="rec-kpi-ic"><Icon size={19} /></div>
              <div className="rec-kpi-label">{k.label}</div>
              <div className="rec-kpi-val rec-num">
                {k.value}<span className="s">{k.sub}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* PIPELINE */}
      <div className="rec-card">
        <div className="rec-card-head">
          <span className="rec-card-title">مسار التوظيف</span>
          <span className="rec-card-hint">من الفرز حتى التوظيف</span>
        </div>
        <div className="rec-pipe">
          {PIPELINE.map((p) => {
            const Icon = p.icon;
            return (
              <div className="rec-stage" key={p.stage}>
                <div className="rec-stage-top">
                  <span className="rec-stage-ic" style={{ background: p.color + "22", color: p.color }}>
                    <Icon size={17} />
                  </span>
                  <span className="rec-stage-name">{p.stage}</span>
                </div>
                <div className="rec-stage-count">{p.count}</div>
                <div className="rec-stage-bar">
                  <i style={{ width: `${(p.count / maxPipe) * 100}%`, background: p.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ROW: VACANCIES + INTERVIEWS */}
      <div className="rec-row">

        <div className="rec-card" style={{ marginBottom: 0 }}>
          <div className="rec-card-head">
            <span className="rec-card-title">الوظائف الشاغرة</span>
            <span className="rec-card-hint">{VACANCIES.length} وظيفة</span>
          </div>
          <div className="rec-vacs">
            {VACANCIES.map((v, i) => (
              <div className="rec-vac" key={i}>
                <div className="rec-vac-ic"><Briefcase size={16} /></div>
                <div className="rec-vac-info">
                  <div className="rec-vac-title">{v.title}</div>
                  <div className="rec-vac-dept">{v.dept}</div>
                </div>
                <span className="rec-vac-count">{v.applicants} متقدم</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rec-card" style={{ marginBottom: 0 }}>
          <div className="rec-card-head">
            <span className="rec-card-title">المقابلات المجدولة</span>
            <CalendarCheck size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="rec-ints">
            {INTERVIEWS.map((it, i) => (
              <div className="rec-int" key={i}>
                <div className="rec-int-ic"><MessageSquare size={15} /></div>
                <div className="rec-int-info">
                  <div className="rec-int-name">{it.name}</div>
                  <div className="rec-int-role">{it.role}</div>
                </div>
                <span className="rec-int-when"><Clock size={12} />{it.when}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* TABLE */}
      <div className="rec-card">
        <div className="rec-card-head">
          <span className="rec-card-title">المتقدمون</span>
          <span className="rec-card-hint">{APPLICANTS.length} متقدم</span>
        </div>
        <div className="rec-tablewrap">
          <table className="rec-table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الوظيفة</th>
                <th>المرحلة</th>
                <th>تاريخ التقديم</th>
              </tr>
            </thead>
            <tbody>
              {APPLICANTS.map((a, i) => {
                const st = STAGE[a.stage];
                return (
                  <tr key={i}>
                    <td className="rec-app-name">{a.name}</td>
                    <td className="rec-app-role">{a.role}</td>
                    <td><span className={`rec-spill ${st.cls}`}>{st.label}</span></td>
                    <td className="rec-app-date">{a.date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
