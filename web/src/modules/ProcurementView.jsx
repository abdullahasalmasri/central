import React from "react";
import {
  ShoppingCart, ClipboardList, Truck, CalendarClock,
  Calendar, ChevronDown, PieChart, FileText
} from "lucide-react";

/* ============================================================
   المشتريات المالية — قسم المالية (مشتريات الأصول والخدمات، غير العمالة)
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getProcurementSummary (دالة backend جديدة)
const KPIS = [
  { id: "total",     label: "مشتريات الشهر",      value: "348,000", unit: "ر.س",        icon: ShoppingCart,  color: "#059669" },
  { id: "open",      label: "أوامر مفتوحة",        value: "7",       sub: "أمر",          icon: ClipboardList, color: "#2563eb" },
  { id: "suppliers", label: "موردون نشطون",        value: "18",      sub: "مورد",         icon: Truck,         color: "#7c3aed" },
  { id: "expiring",  label: "عقود تنتهي قريبًا",   value: "3",       sub: "خلال ٣٠ يوم",  icon: CalendarClock, color: "#ea580c" },
];

// 🗂️ الإنفاق حسب الفئة — مصدرها: getProcurementSummary
const CATEGORIES = [
  { name: "مركبات وأسطول",    value: 142000, pct: 41, color: "#059669" },
  { name: "صيانة وإصلاح",     value: 88000,  pct: 25, color: "#2563eb" },
  { name: "مكتبية وتجهيزات",  value: 64000,  pct: 18, color: "#7c3aed" },
  { name: "خدمات وتأمين",     value: 54000,  pct: 16, color: "#ea580c" },
];

// 🚚 الموردون — مصدرها: getSuppliers
const SUPPLIERS = [
  { name: "شركة الأسطول للسيارات",  spend: 142000 },
  { name: "مؤسسة الصيانة الفنية",   spend: 88000  },
  { name: "مكتبة الأعمال التجارية", spend: 64000  },
  { name: "شركة التأمين الوطنية",   spend: 54000  },
];

// 📋 أوامر الشراء — مصدرها: getPurchaseOrders
// status: open = مفتوح · received = مستلم · closed = مغلق
const ORDERS = [
  { id: "PO-1042", supplier: "شركة الأسطول",  cat: "مركبات",  value: 85000, status: "open"     },
  { id: "PO-1041", supplier: "مؤسسة الصيانة", cat: "صيانة",   value: 32000, status: "received" },
  { id: "PO-1040", supplier: "مكتبة الأعمال", cat: "مكتبية",  value: 18000, status: "closed"   },
  { id: "PO-1039", supplier: "شركة التأمين",  cat: "خدمات",   value: 54000, status: "open"     },
  { id: "PO-1038", supplier: "شركة الأسطول",  cat: "مركبات",  value: 57000, status: "received" },
];

// 📄 عقود الموردين — مصدرها: getSupplierContracts
const CONTRACTS = [
  { name: "شركة الأسطول للسيارات", value: "1,200,000", renew: "١٥ يوليو", soon: false },
  { name: "مؤسسة الصيانة الفنية",  value: "540,000",   renew: "٨ يوليو",  soon: true  },
  { name: "شركة التأمين الوطنية",  value: "720,000",   renew: "٣٠ يونيو", soon: true  },
];

const STATUS = {
  open:     { label: "مفتوح",  cls: "open"     },
  received: { label: "مستلم",  cls: "received" },
  closed:   { label: "مغلق",   cls: "closed"   },
};

const maxSpend = Math.max(...SUPPLIERS.map((s) => s.spend));
const fmt = (n) => n.toLocaleString("en-US");

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .prc-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .prc-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .prc-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .prc-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#0596691a; color:#059669; flex-shrink:0}
  .prc-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .prc-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .prc-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .prc-period svg:first-child{color:#059669}

  .prc-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .prc-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .prc-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .prc-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .prc-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .prc-kpi-val{font-size:24px; font-weight:700}
  .prc-kpi-val .u{font-size:13px; color:var(--ink3); font-weight:600; margin-right:3px}
  .prc-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  .prc-row{display:grid; gap:16px; margin-bottom:16px; align-items:start}
  .prc-row.a{grid-template-columns:1.5fr 1fr}
  .prc-row.b{grid-template-columns:1.6fr 1fr}
  .prc-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .prc-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .prc-card-title{font-size:15.5px; font-weight:700}
  .prc-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* CATEGORIES */
  .prc-cats{display:flex; flex-direction:column; gap:15px}
  .prc-cat-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:7px}
  .prc-cat-name{display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600}
  .prc-cat-dot{width:9px; height:9px; border-radius:3px; flex-shrink:0}
  .prc-cat-val{font-size:13px; font-weight:700; font-variant-numeric:tabular-nums}
  .prc-cat-val .p{font-size:11px; color:var(--ink3); font-weight:600; margin-right:5px}
  .prc-cat-bar{height:8px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .prc-cat-bar i{display:block; height:100%; border-radius:999px}

  /* CONTRACTS */
  .prc-contracts{display:flex; flex-direction:column; gap:10px}
  .prc-contract{display:flex; align-items:center; gap:11px; padding:12px 13px; border-radius:12px;
    background:var(--bg); border:1px solid var(--line)}
  .prc-ct-info{flex:1; min-width:0}
  .prc-ct-name{font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .prc-ct-meta{font-size:11.5px; color:var(--ink3); margin-top:2px}
  .prc-ct-badge{font-size:10.5px; font-weight:700; padding:4px 10px; border-radius:999px; flex-shrink:0; white-space:nowrap}
  .prc-ct-badge.active{background:#dcfce7; color:#15803d}
  .prc-ct-badge.soon{background:#ffedd5; color:#9a3412}

  /* ORDERS TABLE */
  .prc-tablewrap{overflow-x:auto}
  table.prc-table{width:100%; border-collapse:collapse; min-width:480px}
  .prc-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 10px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .prc-table td{padding:12px 10px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .prc-table tr:last-child td{border-bottom:none}
  .prc-po{font-weight:700; color:var(--ink); font-variant-numeric:tabular-nums; white-space:nowrap}
  .prc-osup{color:var(--ink); white-space:nowrap}
  .prc-ocat{color:var(--ink2); font-size:12px}
  .prc-oval{font-weight:700; font-variant-numeric:tabular-nums}
  .prc-pill{display:inline-block; font-size:11px; font-weight:700; padding:4px 11px; border-radius:999px; white-space:nowrap}
  .prc-pill.open{background:#dbeafe; color:#1d4ed8}
  .prc-pill.received{background:#dcfce7; color:#15803d}
  .prc-pill.closed{background:#eef1f6; color:#64748b}

  /* SUPPLIERS */
  .prc-sups{display:flex; flex-direction:column; gap:14px}
  .prc-sup-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:7px}
  .prc-sup-name{display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:600; min-width:0}
  .prc-sup-ic{width:26px; height:26px; border-radius:7px; background:#7c3aed1a; color:#7c3aed; display:grid; place-items:center; flex-shrink:0}
  .prc-sup-nm{white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .prc-sup-val{font-size:12.5px; font-weight:700; font-variant-numeric:tabular-nums; white-space:nowrap}
  .prc-sup-bar{height:7px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .prc-sup-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#7c3aed,#a78bfa)}

  @media(max-width:1000px){
    .prc-kpis{grid-template-columns:repeat(2,1fr)}
    .prc-row.a,.prc-row.b{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .prc-root{padding:18px 14px}
    .prc-kpis{grid-template-columns:1fr}
    .prc-title{font-size:19px}
  }
`;

export default function ProcurementView() {
  return (
    <div className="prc-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="prc-head">
        <div className="prc-head-ic"><ShoppingCart size={24} /></div>
        <div>
          <div className="prc-title">المشتريات المالية</div>
          <div className="prc-sub">مشتريات الأصول والخدمات وعقود الموردين · المالية</div>
        </div>
        <button className="prc-period">
          <Calendar size={16} /> هذا الشهر <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="prc-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="prc-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="prc-kpi-ic"><Icon size={19} /></div>
              <div className="prc-kpi-label">{k.label}</div>
              <div className="prc-kpi-val prc-num">
                {k.value}
                {k.unit && <span className="u">{k.unit}</span>}
                {k.sub && <span className="s">{k.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ROW A: CATEGORIES + CONTRACTS */}
      <div className="prc-row a">

        <div className="prc-card">
          <div className="prc-card-head">
            <span className="prc-card-title">الإنفاق حسب الفئة</span>
            <PieChart size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="prc-cats">
            {CATEGORIES.map((c) => (
              <div key={c.name}>
                <div className="prc-cat-top">
                  <span className="prc-cat-name">
                    <span className="prc-cat-dot" style={{ background: c.color }} />
                    {c.name}
                  </span>
                  <span className="prc-cat-val prc-num">
                    {fmt(c.value)}<span className="p">{c.pct}٪</span>
                  </span>
                </div>
                <div className="prc-cat-bar"><i style={{ width: `${c.pct}%`, background: c.color }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="prc-card">
          <div className="prc-card-head">
            <span className="prc-card-title">عقود الموردين</span>
            <FileText size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="prc-contracts">
            {CONTRACTS.map((c, i) => (
              <div className="prc-contract" key={i}>
                <div className="prc-ct-info">
                  <div className="prc-ct-name">{c.name}</div>
                  <div className="prc-ct-meta">تجديد {c.renew} · {c.value}/سنة</div>
                </div>
                <span className={`prc-ct-badge ${c.soon ? "soon" : "active"}`}>
                  {c.soon ? "ينتهي قريبًا" : "نشط"}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ROW B: ORDERS + SUPPLIERS */}
      <div className="prc-row b">

        <div className="prc-card">
          <div className="prc-card-head">
            <span className="prc-card-title">أوامر الشراء</span>
            <span className="prc-card-hint">{ORDERS.length} أمر</span>
          </div>
          <div className="prc-tablewrap">
            <table className="prc-table">
              <thead>
                <tr>
                  <th>الأمر</th>
                  <th>المورد</th>
                  <th>الفئة</th>
                  <th>القيمة</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {ORDERS.map((o, i) => {
                  const st = STATUS[o.status];
                  return (
                    <tr key={i}>
                      <td className="prc-po">{o.id}</td>
                      <td className="prc-osup">{o.supplier}</td>
                      <td className="prc-ocat">{o.cat}</td>
                      <td className="prc-oval prc-num">{fmt(o.value)}</td>
                      <td><span className={`prc-pill ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="prc-card">
          <div className="prc-card-head">
            <span className="prc-card-title">أعلى الموردين إنفاقًا</span>
          </div>
          <div className="prc-sups">
            {SUPPLIERS.map((s, i) => (
              <div key={i}>
                <div className="prc-sup-top">
                  <span className="prc-sup-name">
                    <span className="prc-sup-ic"><Truck size={13} /></span>
                    <span className="prc-sup-nm">{s.name}</span>
                  </span>
                  <span className="prc-sup-val prc-num">{fmt(s.spend)}</span>
                </div>
                <div className="prc-sup-bar"><i style={{ width: `${(s.spend / maxSpend) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
