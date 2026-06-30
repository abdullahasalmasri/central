import React, { useState, useEffect } from "react";
import {
  Boxes, BookOpen, TrendingDown, RotateCcw, Truck, Home, Wrench,
  Calendar, ChevronDown
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   الإهلاك واسترداد رأس المال — قسم الأصول والمرافق
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// إعدادات البطاقات والفئات — البيانات تأتي من getDepreciation
const KPI_CONFIG = [
  { id: "cost", label: "إجمالي قيمة الأصول", icon: Boxes,        color: "#0e7490", key: "totalCost", unit: "ر.س" },
  { id: "book", label: "القيمة الدفترية",    icon: BookOpen,     color: "#2563eb", key: "totalBook", unit: "ر.س" },
  { id: "dep",  label: "الإهلاك السنوي",     icon: TrendingDown, color: "#ea580c", key: "annualDep", unit: "ر.س" },
  { id: "rec",  label: "نسبة الاسترداد",     icon: RotateCcw,    color: "#16a34a", key: "recoveryRate", suffix: "٪" },
];
const CAT_ICONS = { vehicle: Truck, housing: Home, equipment: Wrench, simple: Boxes, other: Boxes };
const CAT_COLORS = { vehicle: "#0e7490", housing: "#2563eb", equipment: "#7c3aed", simple: "#16a34a", other: "#64748b" };
const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .dep-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .dep-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .dep-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .dep-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#0e74901a; color:#0e7490; flex-shrink:0}
  .dep-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .dep-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .dep-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .dep-period svg:first-child{color:#0e7490}

  .dep-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .dep-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .dep-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .dep-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .dep-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .dep-kpi-val{font-size:24px; font-weight:700}
  .dep-kpi-val .u{font-size:13px; color:var(--ink3); font-weight:600; margin-right:3px}
  .dep-kpi-val .x{font-size:15px; color:var(--ink3); font-weight:600}

  .dep-row{display:grid; grid-template-columns:1.5fr 1fr; gap:16px; margin-bottom:16px; align-items:start}
  .dep-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .dep-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .dep-card-title{font-size:15.5px; font-weight:700}
  .dep-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* CATEGORIES */
  .dep-cats{display:flex; flex-direction:column; gap:15px}
  .dep-cat-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:7px}
  .dep-cat-name{display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600}
  .dep-cat-ic{width:26px; height:26px; border-radius:7px; display:grid; place-items:center; flex-shrink:0}
  .dep-cat-val{font-size:13px; font-weight:700; font-variant-numeric:tabular-nums}
  .dep-cat-bar{height:8px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .dep-cat-bar i{display:block; height:100%; border-radius:999px}

  /* RECOVERY */
  .dep-rec{text-align:center; padding:8px 0}
  .dep-rec-big{font-size:48px; font-weight:800; line-height:1; color:#16a34a}
  .dep-rec-big .p{font-size:26px}
  .dep-rec-cap{font-size:12.5px; color:var(--ink3); margin:8px 0 18px; line-height:1.5}
  .dep-rec-bar{height:11px; background:#eef1f6; border-radius:999px; overflow:hidden; margin-bottom:9px}
  .dep-rec-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#16a34a,#4ade80)}
  .dep-rec-vals{display:flex; justify-content:space-between; font-size:11.5px; color:var(--ink3); font-variant-numeric:tabular-nums}
  .dep-rec-vals b{color:var(--ink); font-weight:700}

  /* TABLE */
  .dep-tablewrap{overflow-x:auto}
  table.dep-table{width:100%; border-collapse:collapse; min-width:720px}
  .dep-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 12px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .dep-table th.n, .dep-table td.n{text-align:left}
  .dep-table td{padding:13px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .dep-table tr:last-child td{border-bottom:none}
  .dep-asset-name{font-weight:600; color:var(--ink); white-space:nowrap}
  .dep-asset-cat{font-size:11.5px; color:var(--ink2); white-space:nowrap}
  .dep-asset-life{color:var(--ink2); font-variant-numeric:tabular-nums; white-space:nowrap}
  .dep-asset-amt{font-variant-numeric:tabular-nums}
  .dep-asset-amt.book{font-weight:700; color:var(--ink)}
  .dep-rec-cell{display:flex; align-items:center; gap:8px; min-width:110px}
  .dep-rec-mini{flex:1; height:6px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .dep-rec-mini i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#0e7490,#22d3ee)}
  .dep-rec-pct{font-size:12px; font-weight:700; font-variant-numeric:tabular-nums; min-width:34px; text-align:left}

  @media(max-width:1000px){
    .dep-kpis{grid-template-columns:repeat(2,1fr)}
    .dep-row{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .dep-root{padding:18px 14px}
    .dep-kpis{grid-template-columns:1fr}
    .dep-title{font-size:19px}
  }
`;

export default function DepreciationView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) { setError("لم يتم تسجيل الدخول."); setLoading(false); return; }
        const userSnap = await getDoc(doc(db, "users", uid));
        if (!userSnap.exists() || !userSnap.data().tenantId) { setError("تعذّر تحديد المنشأة."); setLoading(false); return; }
        const fn = httpsCallable(functions, "getDepreciation");
        const res = await fn({});
        setData(res.data);
      } catch (e) {
        setError("تعذّر تحميل بيانات الإهلاك.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const kpis = data ? data.kpis : { totalCost: 0, totalBook: 0, annualDep: 0, recoveryRate: 0 };
  const categories = data ? data.categories : [];
  const assets = data ? data.assets : [];
  const maxCat = categories.length ? Math.max(...categories.map((c) => c.value), 1) : 1;
  const recovered = kpis.totalCost - kpis.totalBook;

  return (
    <div className="dep-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="dep-head">
        <div className="dep-head-ic"><TrendingDown size={24} /></div>
        <div>
          <div className="dep-title">الإهلاك واسترداد رأس المال</div>
          <div className="dep-sub">إهلاك الأصول المملوكة وقيمها الدفترية · الأصول والمرافق</div>
        </div>
        <button className="dep-period">
          <Calendar size={16} /> السنة المالية <ChevronDown size={15} />
        </button>
      </div>

      {loading ? (
        <p style={{ color: "#94a0b8", fontSize: 14 }}>جارٍ حساب الإهلاك...</p>
      ) : error ? (
        <div style={{ padding: "12px 16px", background: "#fee2e2", color: "#b91c1c", borderRadius: 10, fontSize: 14 }}>{error}</div>
      ) : assets.length === 0 ? (
        <div style={{ padding: 40, background: "#fff", border: "1px solid #e7ebf1", borderRadius: 16, textAlign: "center" }}>
          <Boxes size={40} style={{ color: "#94a0b8", marginBottom: 12 }} />
          <p style={{ fontSize: 17, fontWeight: 700, color: "#161b26", margin: "0 0 6px" }}>لا توجد أصول مملوكة قابلة للإهلاك</p>
          <p style={{ color: "#94a0b8", fontSize: 14, margin: 0 }}>أضف أصلًا مملوكًا (بقيمة شراء وعمر إنتاجي) من المركبات/الإسكان/المعدّات.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="dep-kpis">
            {KPI_CONFIG.map((k) => {
              const Icon = k.icon;
              const val = kpis[k.key] || 0;
              return (
                <div className="dep-kpi" key={k.id} style={{ "--c": k.color }}>
                  <div className="dep-kpi-ic"><Icon size={19} /></div>
                  <div className="dep-kpi-label">{k.label}</div>
                  <div className="dep-kpi-val dep-num">
                    {fmt(val)}
                    {k.unit && <span className="u">{k.unit}</span>}
                    {k.suffix && <span className="x">{k.suffix}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ROW: CATEGORIES + RECOVERY */}
          <div className="dep-row">
            <div className="dep-card" style={{ marginBottom: 0 }}>
              <div className="dep-card-head">
                <span className="dep-card-title">توزيع الإهلاك حسب الفئة</span>
                <span className="dep-card-hint">سنوي</span>
              </div>
              <div className="dep-cats">
                {categories.length === 0 ? <p style={{ color: "#94a0b8", fontSize: 13 }}>لا توجد بيانات.</p> : categories.map((c) => {
                  const Icon = CAT_ICONS[c.type] || Boxes;
                  const color = CAT_COLORS[c.type] || "#64748b";
                  return (
                    <div key={c.name}>
                      <div className="dep-cat-top">
                        <span className="dep-cat-name">
                          <span className="dep-cat-ic" style={{ background: color + "1a", color: color }}>
                            <Icon size={14} />
                          </span>
                          {c.name}
                        </span>
                        <span className="dep-cat-val dep-num">{fmt(c.value)}</span>
                      </div>
                      <div className="dep-cat-bar"><i style={{ width: `${(c.value / maxCat) * 100}%`, background: color }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="dep-card" style={{ marginBottom: 0 }}>
              <div className="dep-card-head">
                <span className="dep-card-title">استرداد رأس المال</span>
              </div>
              <div className="dep-rec">
                <div className="dep-rec-big dep-num">{Math.round(kpis.recoveryRate)}<span className="p">٪</span></div>
                <div className="dep-rec-cap">المستردّ من إجمالي تكلفة الأصول عبر الإهلاك المتراكم</div>
                <div className="dep-rec-bar"><i style={{ width: `${Math.min(100, kpis.recoveryRate)}%` }} /></div>
                <div className="dep-rec-vals">
                  <span>مستردّ <b>{fmt(recovered)}</b></span>
                  <span>متبقٍ <b>{fmt(kpis.totalBook)}</b></span>
                </div>
              </div>
            </div>
          </div>

          {/* TABLE */}
          <div className="dep-card">
            <div className="dep-card-head">
              <span className="dep-card-title">جدول إهلاك الأصول</span>
              <span className="dep-card-hint">{assets.length} أصل</span>
            </div>
            <div className="dep-tablewrap">
              <table className="dep-table">
                <thead>
                  <tr>
                    <th>الأصل</th>
                    <th>الفئة</th>
                    <th className="n">التكلفة</th>
                    <th className="n">العمر</th>
                    <th className="n">الإهلاك السنوي</th>
                    <th className="n">القيمة الدفترية</th>
                    <th>نسبة الاسترداد</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a, i) => (
                    <tr key={a.id || i}>
                      <td className="dep-asset-name">{a.name}</td>
                      <td className="dep-asset-cat">{a.cat}</td>
                      <td className="dep-asset-amt n dep-num">{fmt(a.cost)}</td>
                      <td className="dep-asset-life n">{a.life} سنوات</td>
                      <td className="dep-asset-amt n dep-num">{fmt(a.annual)}</td>
                      <td className="dep-asset-amt book n dep-num">{fmt(a.book)}</td>
                      <td>
                        <div className="dep-rec-cell">
                          <div className="dep-rec-mini"><i style={{ width: `${a.recovered}%` }} /></div>
                          <span className="dep-rec-pct dep-num">{a.recovered}٪</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
