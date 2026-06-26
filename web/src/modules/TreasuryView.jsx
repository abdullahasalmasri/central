import React from "react";
import {
  Wallet, ArrowDownToLine, ArrowUpFromLine, Activity, Landmark,
  AlertTriangle, ArrowDownLeft, ArrowUpRight, Calendar, ChevronDown
} from "lucide-react";

/* ============================================================
   الخزينة — قسم المالية
   البيانات تجريبية. دوال backend المطلوبة مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getFinancialStatements + حركات الصندوق
const KPIS = [
  { id: "liq", label: "إجمالي السيولة", value: "2,340,000", unit: "ر.س", icon: Wallet,          color: "#059669" },
  { id: "in",  label: "داخل هذا الشهر", value: "1,180,000", unit: "ر.س", icon: ArrowDownToLine,  color: "#16a34a" },
  { id: "out", label: "خارج هذا الشهر", value: "890,000",   unit: "ر.س", icon: ArrowUpFromLine,  color: "#dc2626" },
  { id: "net", label: "صافي التدفق",    value: "+290,000",  unit: "ر.س", icon: Activity,         color: "#2563eb" },
];

// 🏦 أرصدة الحسابات البنكية — مصدرها: getFinancialStatements (حسابات النقد)
const BANKS = [
  { name: "مصرف الراجحي", value: 1420000, pct: 61 },
  { name: "البنك الأهلي", value: 580000,  pct: 25 },
  { name: "بنك الرياض",   value: 240000,  pct: 10 },
  { name: "نقد بالصندوق", value: 100000,  pct: 4  },
];

// 📅 التنبؤ بالتدفق (بالألف) — مصدرها: getCashForecast (دالة backend جديدة)
const FORECAST = [
  { m: "يوليو",   in: 1250, out: 920  },
  { m: "أغسطس",  in: 1100, out: 980  },
  { m: "سبتمبر", in: 1350, out: 1050 },
  { m: "أكتوبر",  in: 1200, out: 1100 },
];

// 🔄 آخر الحركات — مصدرها: قيود/معاملات النقد
const MOVES = [
  { desc: "تحصيل — عقد أرامكو",   date: "٢٤ يونيو", amount: 180000  },
  { desc: "رواتب الموظفين",       date: "٢٣ يونيو", amount: -420000 },
  { desc: "تحصيل — مشروع نيوم",   date: "٢٢ يونيو", amount: 95000   },
  { desc: "إيجار سكن العمّال",    date: "٢١ يونيو", amount: -68000  },
  { desc: "وقود الأسطول",         date: "٢٠ يونيو", amount: -34000  },
];

const fmt = (n) => Math.abs(n).toLocaleString("en-US");
const fMax = Math.max(...FORECAST.flatMap((f) => [f.in, f.out]));

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .trs-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .trs-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .trs-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .trs-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#0596691a; color:#059669; flex-shrink:0}
  .trs-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .trs-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .trs-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .trs-period svg:first-child{color:#059669}

  .trs-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .trs-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .trs-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .trs-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .trs-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .trs-kpi-val{font-size:24px; font-weight:700}
  .trs-kpi-val .u{font-size:13px; color:var(--ink3); font-weight:600; margin-right:3px}

  .trs-row{display:grid; gap:16px; margin-bottom:16px; align-items:start}
  .trs-row.a{grid-template-columns:1.6fr 1fr}
  .trs-row.b{grid-template-columns:1.6fr 1fr}
  .trs-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .trs-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .trs-card-title{font-size:15.5px; font-weight:700}
  .trs-legend{display:flex; gap:13px}
  .trs-leg{display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--ink2); font-weight:500}
  .trs-leg b{width:9px; height:9px; border-radius:2px; display:block}

  /* FORECAST bars */
  .trs-fc{display:flex; align-items:flex-end; justify-content:space-around; gap:12px; height:170px; padding-top:8px}
  .trs-fc-m{flex:1; display:flex; flex-direction:column; align-items:center; gap:9px; height:100%}
  .trs-fc-bars{flex:1; display:flex; align-items:flex-end; gap:6px; width:100%; justify-content:center}
  .trs-fc-bar{width:26px; border-radius:6px 6px 0 0; position:relative; transition:height .3s}
  .trs-fc-bar.in{background:linear-gradient(180deg,#22c55e,#16a34a)}
  .trs-fc-bar.out{background:linear-gradient(180deg,#f87171,#dc2626)}
  .trs-fc-label{font-size:12px; color:var(--ink2); font-weight:600}

  /* BANKS */
  .trs-banks{display:flex; flex-direction:column; gap:15px}
  .trs-bank-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:7px}
  .trs-bank-name{display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600}
  .trs-bank-ic{width:26px; height:26px; border-radius:7px; background:#0596691a; color:#059669; display:grid; place-items:center; flex-shrink:0}
  .trs-bank-val{font-size:13px; font-weight:700; font-variant-numeric:tabular-nums}
  .trs-bank-bar{height:7px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .trs-bank-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#059669,#34d399)}

  /* MOVES */
  .trs-moves{display:flex; flex-direction:column}
  .trs-move{display:flex; align-items:center; gap:12px; padding:11px 4px; border-bottom:1px solid var(--line)}
  .trs-move:last-child{border-bottom:none}
  .trs-move-ic{width:34px; height:34px; border-radius:9px; display:grid; place-items:center; flex-shrink:0}
  .trs-move-ic.in{background:#dcfce7; color:#16a34a}
  .trs-move-ic.out{background:#fee2e2; color:#dc2626}
  .trs-move-info{flex:1; min-width:0}
  .trs-move-desc{font-size:13px; font-weight:600; color:var(--ink)}
  .trs-move-date{font-size:11.5px; color:var(--ink3)}
  .trs-move-amt{font-size:13.5px; font-weight:700; font-variant-numeric:tabular-nums; white-space:nowrap}
  .trs-move-amt.in{color:#15803d} .trs-move-amt.out{color:#b91c1c}

  /* ALERTS */
  .trs-alerts{display:flex; flex-direction:column; gap:10px}
  .trs-alert{display:flex; gap:11px; align-items:flex-start; padding:13px 14px; border-radius:12px;
    background:#fffbeb; border:1px solid #fde68a}
  .trs-alert-ic{width:30px; height:30px; border-radius:8px; display:grid; place-items:center; flex-shrink:0;
    background:#fef3c7; color:#d97706}
  .trs-alert-t{font-size:13px; font-weight:700; margin-bottom:2px}
  .trs-alert-v{font-size:12px; color:var(--ink2); line-height:1.5}

  @media(max-width:1000px){
    .trs-kpis{grid-template-columns:repeat(2,1fr)}
    .trs-row.a,.trs-row.b{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .trs-root{padding:18px 14px}
    .trs-kpis{grid-template-columns:1fr}
    .trs-title{font-size:19px}
    .trs-fc-bar{width:18px}
  }
`;

export default function TreasuryView() {
  return (
    <div className="trs-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="trs-head">
        <div className="trs-head-ic"><Landmark size={24} /></div>
        <div>
          <div className="trs-title">الخزينة</div>
          <div className="trs-sub">إدارة النقد والسيولة والتنبؤ بالتدفقات · المالية</div>
        </div>
        <button className="trs-period">
          <Calendar size={16} /> هذا الشهر <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="trs-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="trs-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="trs-kpi-ic"><Icon size={19} /></div>
              <div className="trs-kpi-label">{k.label}</div>
              <div className="trs-kpi-val trs-num">
                {k.value}<span className="u">{k.unit}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ROW A: FORECAST + BANKS */}
      <div className="trs-row a">

        <div className="trs-card">
          <div className="trs-card-head">
            <span className="trs-card-title">التنبؤ بالتدفق النقدي — ٤ أشهر قادمة</span>
            <div className="trs-legend">
              <span className="trs-leg"><b style={{ background: "#16a34a" }} /> متوقّع داخل</span>
              <span className="trs-leg"><b style={{ background: "#dc2626" }} /> متوقّع خارج</span>
            </div>
          </div>
          <div className="trs-fc">
            {FORECAST.map((f) => (
              <div className="trs-fc-m" key={f.m}>
                <div className="trs-fc-bars">
                  <div className="trs-fc-bar in"  style={{ height: `${(f.in / fMax) * 100}%` }} title={`داخل ${f.in} ألف`} />
                  <div className="trs-fc-bar out" style={{ height: `${(f.out / fMax) * 100}%` }} title={`خارج ${f.out} ألف`} />
                </div>
                <div className="trs-fc-label">{f.m}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="trs-card">
          <div className="trs-card-head">
            <span className="trs-card-title">أرصدة الحسابات</span>
          </div>
          <div className="trs-banks">
            {BANKS.map((b) => (
              <div key={b.name}>
                <div className="trs-bank-top">
                  <span className="trs-bank-name">
                    <span className="trs-bank-ic"><Landmark size={14} /></span>
                    {b.name}
                  </span>
                  <span className="trs-bank-val trs-num">{fmt(b.value)}</span>
                </div>
                <div className="trs-bank-bar"><i style={{ width: `${b.pct}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ROW B: MOVES + ALERTS */}
      <div className="trs-row b">

        <div className="trs-card">
          <div className="trs-card-head">
            <span className="trs-card-title">آخر الحركات النقدية</span>
          </div>
          <div className="trs-moves">
            {MOVES.map((m, i) => {
              const dir = m.amount >= 0 ? "in" : "out";
              return (
                <div className="trs-move" key={i}>
                  <div className={`trs-move-ic ${dir}`}>
                    {dir === "in" ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                  </div>
                  <div className="trs-move-info">
                    <div className="trs-move-desc">{m.desc}</div>
                    <div className="trs-move-date">{m.date}</div>
                  </div>
                  <div className={`trs-move-amt ${dir}`}>
                    {m.amount >= 0 ? "+" : "−"}{fmt(m.amount)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="trs-card">
          <div className="trs-card-head">
            <span className="trs-card-title">تنبيهات السيولة</span>
            <AlertTriangle size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="trs-alerts">
            <div className="trs-alert">
              <div className="trs-alert-ic"><AlertTriangle size={16} /></div>
              <div>
                <div className="trs-alert-t">هامش أغسطس ضيق</div>
                <div className="trs-alert-v">صافي التدفق المتوقّع +١٢٠ ألف فقط — راقب التحصيل قبل المصروفات الكبيرة.</div>
              </div>
            </div>
            <div className="trs-alert">
              <div className="trs-alert-ic"><AlertTriangle size={16} /></div>
              <div>
                <div className="trs-alert-t">نقد الصندوق منخفض</div>
                <div className="trs-alert-v">رصيد الصندوق ١٠٠ ألف — يكفي للمصروفات النثرية فقط.</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
