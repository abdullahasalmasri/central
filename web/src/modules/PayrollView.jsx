import React from "react";
import {
  Wallet, Users, PlusCircle, MinusCircle, Building2,
  Calendar, ChevronDown, Archive, CheckCircle2
} from "lucide-react";

/* ============================================================
   الرواتب الداخلية — قسم الموارد البشرية (رواتب الموظفين الإداريين، غير العمّال)
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getPayroll (دالة backend جديدة)
const KPIS = [
  { id: "total",  label: "مسير هذا الشهر",   value: "487,000", unit: "ر.س", icon: Wallet,      color: "#2563eb" },
  { id: "count",  label: "عدد الموظفين",     value: "32",      sub: "موظف", icon: Users,       color: "#7c3aed" },
  { id: "allow",  label: "إجمالي البدلات",   value: "98,000",  unit: "ر.س", icon: PlusCircle,  color: "#16a34a" },
  { id: "deduct", label: "استقطاعات GOSI",   value: "44,000",  unit: "ر.س", icon: MinusCircle, color: "#ea580c" },
];

// 🏢 تكلفة الرواتب حسب الإدارة — مصدرها: getPayroll (تجميع حسب الإدارة)
const DEPTS = [
  { name: "المالية",         value: 142000 },
  { name: "العمليات",        value: 124000 },
  { name: "المبيعات",        value: 88000  },
  { name: "الموارد البشرية", value: 68000  },
  { name: "الإدارة العليا",  value: 65000  },
];

// 🗄️ أرشيف المسيرات — مصدرها: getPayrollHistory
const PAYRUNS = [
  { month: "مايو ٢٠٢٦",  total: "482,000", paid: true },
  { month: "أبريل ٢٠٢٦", total: "479,000", paid: true },
  { month: "مارس ٢٠٢٦",  total: "475,000", paid: true },
];

// 👤 تفاصيل رواتب الموظفين — مصدرها: getEmployeeSalaries + createEmployee (الموظفون موجودون)
const EMPLOYEES = [
  { name: "أحمد العتيبي",   dept: "المالية",         role: "مدير مالي",     basic: 22000, allow: 6000, deduct: 2800 },
  { name: "عبدالله الحربي", dept: "الإدارة العليا",  role: "مدير تنفيذي",   basic: 28000, allow: 8000, deduct: 3600 },
  { name: "خالد الشهري",    dept: "العمليات",        role: "مدير عمليات",   basic: 20000, allow: 5500, deduct: 2550 },
  { name: "سارة القحطاني",  dept: "المالية",         role: "محاسب",         basic: 12000, allow: 3000, deduct: 1500 },
  { name: "نورة الدوسري",   dept: "الموارد البشرية", role: "أخصائي موارد",  basic: 11000, allow: 2800, deduct: 1380 },
  { name: "فهد المطيري",    dept: "المبيعات",        role: "مندوب مبيعات",  basic: 9000,  allow: 2500, deduct: 1150 },
];

const maxDept = Math.max(...DEPTS.map((d) => d.value));
const fmt = (n) => n.toLocaleString("en-US");
const net = (e) => e.basic + e.allow - e.deduct;

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .pay-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .pay-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .pay-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .pay-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#2563eb1a; color:#2563eb; flex-shrink:0}
  .pay-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .pay-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .pay-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .pay-period svg:first-child{color:#2563eb}

  .pay-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .pay-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .pay-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .pay-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .pay-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .pay-kpi-val{font-size:24px; font-weight:700}
  .pay-kpi-val .u{font-size:13px; color:var(--ink3); font-weight:600; margin-right:3px}
  .pay-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  .pay-row{display:grid; grid-template-columns:1.5fr 1fr; gap:16px; margin-bottom:16px; align-items:start}
  .pay-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .pay-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .pay-card-title{font-size:15.5px; font-weight:700}
  .pay-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* DEPTS */
  .pay-depts{display:flex; flex-direction:column; gap:14px}
  .pay-dept-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:7px}
  .pay-dept-name{display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600}
  .pay-dept-ic{width:25px; height:25px; border-radius:7px; background:#2563eb14; color:#2563eb; display:grid; place-items:center; flex-shrink:0}
  .pay-dept-val{font-size:13px; font-weight:700; font-variant-numeric:tabular-nums}
  .pay-dept-bar{height:8px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .pay-dept-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#2563eb,#60a5fa)}

  /* PAYRUNS */
  .pay-runs{display:flex; flex-direction:column; gap:10px}
  .pay-run{display:flex; align-items:center; gap:11px; padding:12px 13px; border-radius:12px;
    background:var(--bg); border:1px solid var(--line)}
  .pay-run-ic{width:32px; height:32px; border-radius:9px; background:#dbeafe; color:#2563eb; display:grid; place-items:center; flex-shrink:0}
  .pay-run-info{flex:1; min-width:0}
  .pay-run-month{font-size:13px; font-weight:600}
  .pay-run-total{font-size:11.5px; color:var(--ink3); margin-top:1px; font-variant-numeric:tabular-nums}
  .pay-run-badge{display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:700; padding:4px 10px; border-radius:999px; background:#dcfce7; color:#15803d; flex-shrink:0}

  /* TABLE */
  .pay-tablewrap{overflow-x:auto}
  table.pay-table{width:100%; border-collapse:collapse; min-width:640px}
  .pay-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 12px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .pay-table th.n, .pay-table td.n{text-align:left}
  .pay-table td{padding:13px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .pay-table tr:last-child td{border-bottom:none}
  .pay-emp{display:flex; flex-direction:column}
  .pay-emp-name{font-weight:600; color:var(--ink); white-space:nowrap}
  .pay-emp-role{font-size:11px; color:var(--ink3)}
  .pay-dept-tag{font-size:11.5px; color:var(--ink2); white-space:nowrap}
  .pay-amt{font-variant-numeric:tabular-nums; text-align:left}
  .pay-amt.basic{color:var(--ink)}
  .pay-amt.allow{color:#15803d}
  .pay-amt.deduct{color:#b91c1c}
  .pay-amt.netv{font-weight:700; color:var(--ink); font-size:14px}

  @media(max-width:1000px){
    .pay-kpis{grid-template-columns:repeat(2,1fr)}
    .pay-row{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .pay-root{padding:18px 14px}
    .pay-kpis{grid-template-columns:1fr}
    .pay-title{font-size:19px}
  }
`;

export default function PayrollView() {
  return (
    <div className="pay-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="pay-head">
        <div className="pay-head-ic"><Wallet size={24} /></div>
        <div>
          <div className="pay-title">الرواتب الداخلية</div>
          <div className="pay-sub">مسير رواتب الموظفين الإداريين · الموارد البشرية</div>
        </div>
        <button className="pay-period">
          <Calendar size={16} /> يونيو ٢٠٢٦ <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="pay-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="pay-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="pay-kpi-ic"><Icon size={19} /></div>
              <div className="pay-kpi-label">{k.label}</div>
              <div className="pay-kpi-val pay-num">
                {k.value}
                {k.unit && <span className="u">{k.unit}</span>}
                {k.sub && <span className="s">{k.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ROW: DEPTS + PAYRUNS */}
      <div className="pay-row">

        <div className="pay-card">
          <div className="pay-card-head">
            <span className="pay-card-title">تكلفة الرواتب حسب الإدارة</span>
          </div>
          <div className="pay-depts">
            {DEPTS.map((d) => (
              <div key={d.name}>
                <div className="pay-dept-top">
                  <span className="pay-dept-name">
                    <span className="pay-dept-ic"><Building2 size={13} /></span>
                    {d.name}
                  </span>
                  <span className="pay-dept-val pay-num">{fmt(d.value)}</span>
                </div>
                <div className="pay-dept-bar"><i style={{ width: `${(d.value / maxDept) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="pay-card">
          <div className="pay-card-head">
            <span className="pay-card-title">أرشيف المسيرات</span>
            <Archive size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="pay-runs">
            {PAYRUNS.map((p, i) => (
              <div className="pay-run" key={i}>
                <div className="pay-run-ic"><Calendar size={15} /></div>
                <div className="pay-run-info">
                  <div className="pay-run-month">{p.month}</div>
                  <div className="pay-run-total">{p.total} ر.س</div>
                </div>
                <span className="pay-run-badge"><CheckCircle2 size={12} /> مدفوع</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* TABLE */}
      <div className="pay-card">
        <div className="pay-card-head">
          <span className="pay-card-title">تفاصيل رواتب الموظفين</span>
          <span className="pay-card-hint">{EMPLOYEES.length} موظف</span>
        </div>
        <div className="pay-tablewrap">
          <table className="pay-table">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>الإدارة</th>
                <th className="n">الأساسي</th>
                <th className="n">البدلات</th>
                <th className="n">الاستقطاعات</th>
                <th className="n">الصافي</th>
              </tr>
            </thead>
            <tbody>
              {EMPLOYEES.map((e, i) => (
                <tr key={i}>
                  <td>
                    <div className="pay-emp">
                      <span className="pay-emp-name">{e.name}</span>
                      <span className="pay-emp-role">{e.role}</span>
                    </div>
                  </td>
                  <td className="pay-dept-tag">{e.dept}</td>
                  <td className="pay-amt basic n pay-num">{fmt(e.basic)}</td>
                  <td className="pay-amt allow n pay-num">+{fmt(e.allow)}</td>
                  <td className="pay-amt deduct n pay-num">−{fmt(e.deduct)}</td>
                  <td className="pay-amt netv n pay-num">{fmt(net(e))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
