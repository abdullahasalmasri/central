import React from "react";
import {
  ClipboardCheck, ShieldCheck, FileWarning, Wrench, SearchCheck,
  Calendar, ChevronDown, ShieldAlert, AlertTriangle
} from "lucide-react";

/* ============================================================
   التدقيق الداخلي — قسم التميز والجودة
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getAuditSummary (دالة backend جديدة)
const KPIS = [
  { id: "done",   label: "تدقيقات منجزة",  value: "8",  sub: "تدقيق",  icon: ClipboardCheck, color: "#65a30d" },
  { id: "comp",   label: "نسبة الالتزام",  value: "87", suffix: "%",   icon: ShieldCheck,    color: "#16a34a" },
  { id: "find",   label: "ملاحظات مفتوحة", value: "6",  sub: "ملاحظة", icon: FileWarning,    color: "#ea580c" },
  { id: "action", label: "إجراءات معلّقة", value: "3",  sub: "إجراء",  icon: Wrench,         color: "#dc2626" },
];

// 🔍 عمليات التدقيق — مصدرها: getAudits
// status: done=مكتمل · active=جاري · scheduled=مجدول
const AUDITS = [
  { name: "تدقيق المشتريات",      dept: "المالية",          status: "done"      },
  { name: "تدقيق الرواتب",        dept: "الموارد البشرية",  status: "done"      },
  { name: "تدقيق الأصول",         dept: "الأصول والمرافق",  status: "done"      },
  { name: "تدقيق سلامة المواقع",  dept: "العمليات",         status: "active"    },
  { name: "تدقيق العقود",         dept: "القانونية",        status: "scheduled" },
];

// ⚠️ تقييم المخاطر — مصدرها: getRiskAssessment
// level: high=عالي · medium=متوسط · low=منخفض
const RISKS = [
  { name: "إدارة النقد والسيولة", level: "high"   },
  { name: "الالتزام التنظيمي",    level: "medium" },
  { name: "سلامة المواقع",        level: "medium" },
  { name: "أمن البيانات",         level: "low"    },
];

// 📝 الملاحظات والتوصيات — مصدرها: getFindings
// severity: high=عالية · medium=متوسطة · low=منخفضة | status: progress=قيد المعالجة · open=مفتوحة · resolved=تمت معالجتها
const FINDINGS = [
  { text: "ضعف في توثيق أوامر الشراء",        severity: "high",   status: "progress" },
  { text: "تأخير في تحديث رخصة مكتب العمل",   severity: "high",   status: "progress" },
  { text: "نقص في سجلات تدريب السلامة",       severity: "medium", status: "open"     },
  { text: "عدم تطابق في جرد المعدّات",        severity: "medium", status: "resolved" },
  { text: "بطء في إغلاق الذمم المدينة",       severity: "low",    status: "open"     },
];

const AUDIT_STATUS = {
  done:      { label: "مكتمل", cls: "done"      },
  active:    { label: "جاري",  cls: "active"    },
  scheduled: { label: "مجدول", cls: "scheduled" },
};
const LEVEL = {
  high:   { label: "عالي",   cls: "high"   },
  medium: { label: "متوسط",  cls: "medium" },
  low:    { label: "منخفض",  cls: "low"    },
};
const SEV = {
  high:   { label: "عالية",  cls: "high"   },
  medium: { label: "متوسطة", cls: "medium" },
  low:    { label: "منخفضة", cls: "low"    },
};
const FSTATUS = {
  progress: { label: "قيد المعالجة", cls: "progress" },
  open:     { label: "مفتوحة",       cls: "open"     },
  resolved: { label: "تمت معالجتها", cls: "resolved" },
};

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .aud-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .aud-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .aud-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .aud-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#65a30d1a; color:#65a30d; flex-shrink:0}
  .aud-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .aud-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .aud-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .aud-period svg:first-child{color:#65a30d}

  .aud-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .aud-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .aud-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .aud-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .aud-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .aud-kpi-val{font-size:24px; font-weight:700}
  .aud-kpi-val .x{font-size:15px; color:var(--ink3); font-weight:600}
  .aud-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  .aud-row{display:grid; grid-template-columns:1.5fr 1fr; gap:16px; margin-bottom:16px; align-items:start}
  .aud-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .aud-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .aud-card-title{font-size:15.5px; font-weight:700}
  .aud-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* AUDITS */
  .aud-list{display:flex; flex-direction:column; gap:10px}
  .aud-item{display:flex; align-items:center; gap:12px; padding:12px 13px; border-radius:12px; background:var(--bg); border:1px solid var(--line)}
  .aud-item-ic{width:34px; height:34px; border-radius:9px; background:#65a30d14; color:#65a30d; display:grid; place-items:center; flex-shrink:0}
  .aud-item-info{flex:1; min-width:0}
  .aud-item-name{font-size:13px; font-weight:600}
  .aud-item-dept{font-size:11.5px; color:var(--ink3); margin-top:1px}
  .aud-apill{font-size:10.5px; font-weight:700; padding:4px 10px; border-radius:999px; flex-shrink:0; white-space:nowrap}
  .aud-apill.done{background:#dcfce7; color:#15803d}
  .aud-apill.active{background:#dbeafe; color:#1d4ed8}
  .aud-apill.scheduled{background:#eef1f6; color:#64748b}

  /* RISKS */
  .aud-risks{display:flex; flex-direction:column; gap:11px}
  .aud-risk{display:flex; align-items:center; justify-content:space-between; padding:12px 13px; border-radius:11px; background:var(--bg); border:1px solid var(--line)}
  .aud-risk-name{font-size:12.5px; font-weight:600; display:flex; align-items:center; gap:8px}
  .aud-risk-dot{width:9px; height:9px; border-radius:50%; flex-shrink:0}
  .aud-lpill{font-size:10.5px; font-weight:700; padding:3px 10px; border-radius:999px; white-space:nowrap}
  .aud-lpill.high{background:#fee2e2; color:#b91c1c}
  .aud-lpill.medium{background:#ffedd5; color:#9a3412}
  .aud-lpill.low{background:#dcfce7; color:#15803d}

  /* FINDINGS */
  .aud-tablewrap{overflow-x:auto}
  table.aud-table{width:100%; border-collapse:collapse; min-width:480px}
  .aud-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 12px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .aud-table td{padding:13px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .aud-table tr:last-child td{border-bottom:none}
  .aud-find-text{font-weight:600; color:var(--ink)}
  .aud-spill{display:inline-block; font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; white-space:nowrap}
  .aud-spill.high{background:#fee2e2; color:#b91c1c}
  .aud-spill.medium{background:#ffedd5; color:#9a3412}
  .aud-spill.low{background:#eef1f6; color:#64748b}
  .aud-fst{font-size:11px; font-weight:700; white-space:nowrap}
  .aud-fst.progress{color:#1d4ed8} .aud-fst.open{color:#9a3412} .aud-fst.resolved{color:#15803d}

  @media(max-width:1000px){
    .aud-kpis{grid-template-columns:repeat(2,1fr)}
    .aud-row{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .aud-root{padding:18px 14px}
    .aud-kpis{grid-template-columns:1fr}
    .aud-title{font-size:19px}
  }
`;

export default function InternalAuditView() {
  return (
    <div className="aud-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="aud-head">
        <div className="aud-head-ic"><SearchCheck size={24} /></div>
        <div>
          <div className="aud-title">التدقيق الداخلي</div>
          <div className="aud-sub">المراجعة الداخلية وتقييم المخاطر · التميز والجودة</div>
        </div>
        <button className="aud-period">
          <Calendar size={16} /> هذا العام <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="aud-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="aud-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="aud-kpi-ic"><Icon size={19} /></div>
              <div className="aud-kpi-label">{k.label}</div>
              <div className="aud-kpi-val aud-num">
                {k.value}
                {k.suffix && <span className="x">{k.suffix}</span>}
                {k.sub && <span className="s">{k.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ROW: AUDITS + RISKS */}
      <div className="aud-row">

        <div className="aud-card" style={{ marginBottom: 0 }}>
          <div className="aud-card-head">
            <span className="aud-card-title">عمليات التدقيق</span>
            <span className="aud-card-hint">{AUDITS.length} عملية</span>
          </div>
          <div className="aud-list">
            {AUDITS.map((a, i) => {
              const st = AUDIT_STATUS[a.status];
              return (
                <div className="aud-item" key={i}>
                  <div className="aud-item-ic"><ClipboardCheck size={16} /></div>
                  <div className="aud-item-info">
                    <div className="aud-item-name">{a.name}</div>
                    <div className="aud-item-dept">{a.dept}</div>
                  </div>
                  <span className={`aud-apill ${st.cls}`}>{st.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="aud-card" style={{ marginBottom: 0 }}>
          <div className="aud-card-head">
            <span className="aud-card-title">تقييم المخاطر</span>
            <ShieldAlert size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="aud-risks">
            {RISKS.map((r) => {
              const lv = LEVEL[r.level];
              const dot = r.level === "high" ? "#dc2626" : r.level === "medium" ? "#ea580c" : "#16a34a";
              return (
                <div className="aud-risk" key={r.name}>
                  <span className="aud-risk-name">
                    <span className="aud-risk-dot" style={{ background: dot }} />
                    {r.name}
                  </span>
                  <span className={`aud-lpill ${lv.cls}`}>{lv.label}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* FINDINGS */}
      <div className="aud-card">
        <div className="aud-card-head">
          <span className="aud-card-title">الملاحظات والتوصيات</span>
          <span className="aud-card-hint">متابعة الإجراءات التصحيحية</span>
        </div>
        <div className="aud-tablewrap">
          <table className="aud-table">
            <thead>
              <tr>
                <th>الملاحظة</th>
                <th>الخطورة</th>
                <th>حالة المعالجة</th>
              </tr>
            </thead>
            <tbody>
              {FINDINGS.map((f, i) => {
                const sv = SEV[f.severity];
                const fs = FSTATUS[f.status];
                return (
                  <tr key={i}>
                    <td className="aud-find-text">{f.text}</td>
                    <td><span className={`aud-spill ${sv.cls}`}>{sv.label}</span></td>
                    <td><span className={`aud-fst ${fs.cls}`}>{fs.label}</span></td>
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
