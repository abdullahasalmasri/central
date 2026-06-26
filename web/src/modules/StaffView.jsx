import React, { useState, useEffect } from "react";
import {
  Users, UserCheck, Shield, Mail, Briefcase, RefreshCw,
  AlertCircle, UserX, Inbox
} from "lucide-react";
import { getEmployees } from "./employeesService";

/* ============================================================
   شؤون الموظفين — قسم الموارد البشرية
   مربوطة بـ Firebase: تعرض موظفي الشركة الحالية من مجموعة users.
   ============================================================ */

const ROLE_LABEL = {
  owner: "مالك", manager: "مدير", admin: "مسؤول", staff: "موظف",
};
const STATUS = {
  active:    { label: "نشط",      cls: "active" },
  inactive:  { label: "غير نشط",  cls: "inactive" },
  pending:   { label: "معلّق",    cls: "pending" },
  suspended: { label: "موقوف",    cls: "suspended" },
};
const PERM_LABEL = {
  exec: "الإدارة العليا", finance: "المالية", hr: "الموارد البشرية",
  operations: "العمليات", assets: "الأصول", costs: "التكاليف",
  sales: "المبيعات", legal: "القانونية", quality: "الجودة",
};

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .stf-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec; --c:#2563eb;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .stf-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .stf-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .stf-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#2563eb1a; color:#2563eb; flex-shrink:0}
  .stf-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .stf-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .stf-refresh{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .stf-refresh:hover{background:var(--bg)}
  .stf-refresh svg{color:#2563eb}
  .stf-refresh.spin svg{animation:stf-rot 1s linear infinite}
  @keyframes stf-rot{to{transform:rotate(360deg)}}

  .stf-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .stf-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .stf-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--kc)}
  .stf-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--kc) 14%,transparent); color:var(--kc); margin-bottom:12px}
  .stf-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .stf-kpi-val{font-size:26px; font-weight:700}
  .stf-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  .stf-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .stf-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .stf-card-title{font-size:15.5px; font-weight:700}
  .stf-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  .stf-tablewrap{overflow-x:auto}
  table.stf-table{width:100%; border-collapse:collapse; min-width:620px}
  .stf-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 12px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .stf-table td{padding:13px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .stf-table tr:last-child td{border-bottom:none}
  .stf-emp-name{display:flex; align-items:center; gap:10px; font-weight:600; color:var(--ink); white-space:nowrap}
  .stf-emp-avatar{width:34px; height:34px; border-radius:50%; background:#2563eb1a; color:#2563eb;
    display:grid; place-items:center; font-weight:700; font-size:14px; flex-shrink:0}
  .stf-emp-email{display:flex; align-items:center; gap:6px; color:var(--ink2); white-space:nowrap}
  .stf-emp-email svg{color:var(--ink3); flex-shrink:0}
  .stf-role{display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; padding:4px 11px; border-radius:999px; white-space:nowrap;
    background:#eef2ff; color:#4338ca}
  .stf-role.owner{background:#fef3c7; color:#92740a}
  .stf-role.manager{background:#dbeafe; color:#1d4ed8}
  .stf-spill{display:inline-block; font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; white-space:nowrap}
  .stf-spill.active{background:#dcfce7; color:#15803d}
  .stf-spill.inactive{background:#eef1f6; color:#64748b}
  .stf-spill.pending{background:#ffedd5; color:#9a3412}
  .stf-spill.suspended{background:#fee2e2; color:#b91c1c}
  .stf-perms{display:flex; flex-wrap:wrap; gap:5px}
  .stf-perm{font-size:10.5px; font-weight:600; padding:3px 9px; border-radius:7px; background:#f1f5f9; color:#475569; white-space:nowrap}
  .stf-perm-none{font-size:11.5px; color:var(--ink3)}

  /* STATES */
  .stf-state{display:grid; place-items:center; padding:60px 20px; text-align:center}
  .stf-state-ic{width:64px; height:64px; border-radius:17px; display:grid; place-items:center; margin-bottom:16px}
  .stf-state-ic.load{background:#dbeafe; color:#2563eb}
  .stf-state-ic.empty{background:#eef1f6; color:#94a0b8}
  .stf-state-ic.err{background:#fee2e2; color:#dc2626}
  .stf-state-ic.load svg{animation:stf-rot 1s linear infinite}
  .stf-state-t{font-size:16px; font-weight:700; margin-bottom:6px}
  .stf-state-d{font-size:13px; color:var(--ink2); line-height:1.6; max-width:360px}

  @media(max-width:1000px){ .stf-kpis{grid-template-columns:repeat(2,1fr)} }
  @media(max-width:560px){
    .stf-root{padding:18px 14px}
    .stf-kpis{grid-template-columns:1fr}
    .stf-title{font-size:19px}
  }
`;

export default function StaffView() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getEmployees()
      .then((data) => { setEmployees(data); setLoading(false); })
      .catch((err) => { setError(err.message || "تعذّر تحميل الموظفين"); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  // حساب البطاقات من البيانات الفعلية
  const total = employees.length;
  const active = employees.filter((e) => e.status === "active").length;
  const managers = employees.filter((e) => e.role !== "staff").length;
  const staff = employees.filter((e) => e.role === "staff").length;

  const KPIS = [
    { label: "إجمالي الموظفين", value: total,    sub: "موظف",  icon: Users,     color: "#2563eb" },
    { label: "نشطون",          value: active,   sub: "نشط",   icon: UserCheck, color: "#16a34a" },
    { label: "مدراء ومشرفون",  value: managers, sub: "مدير",  icon: Shield,    color: "#7c3aed" },
    { label: "موظفون",         value: staff,    sub: "موظف",  icon: Briefcase, color: "#ea580c" },
  ];

  return (
    <div className="stf-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="stf-head">
        <div className="stf-head-ic"><Users size={24} /></div>
        <div>
          <div className="stf-title">شؤون الموظفين</div>
          <div className="stf-sub">قائمة موظفي الشركة وأدوارهم وصلاحياتهم · الموارد البشرية</div>
        </div>
        <button className={`stf-refresh ${loading ? "spin" : ""}`} onClick={load}>
          <RefreshCw size={16} /> تحديث
        </button>
      </div>

      {/* KPIs */}
      <div className="stf-kpis">
        {KPIS.map((k, i) => {
          const Icon = k.icon;
          return (
            <div className="stf-kpi" key={i} style={{ "--kc": k.color }}>
              <div className="stf-kpi-ic"><Icon size={19} /></div>
              <div className="stf-kpi-label">{k.label}</div>
              <div className="stf-kpi-val stf-num">
                {k.value}<span className="s">{k.sub}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* TABLE / STATES */}
      <div className="stf-card">
        <div className="stf-card-head">
          <span className="stf-card-title">قائمة الموظفين</span>
          {!loading && !error && <span className="stf-card-hint">{total} موظف</span>}
        </div>

        {loading ? (
          <div className="stf-state">
            <div className="stf-state-ic load"><RefreshCw size={28} /></div>
            <div className="stf-state-t">جاري تحميل الموظفين...</div>
            <div className="stf-state-d">نجلب بيانات موظفي شركتك من قاعدة البيانات.</div>
          </div>
        ) : error ? (
          <div className="stf-state">
            <div className="stf-state-ic err"><AlertCircle size={28} /></div>
            <div className="stf-state-t">تعذّر تحميل الموظفين</div>
            <div className="stf-state-d">{error}<br />تأكد من تسجيل الدخول واتصالك بالإنترنت، ثم اضغط تحديث.</div>
          </div>
        ) : total === 0 ? (
          <div className="stf-state">
            <div className="stf-state-ic empty"><Inbox size={28} /></div>
            <div className="stf-state-t">لا يوجد موظفون بعد</div>
            <div className="stf-state-d">لم نجد موظفين في شركتك. عند إضافة موظفين سيظهرون هنا تلقائيًا.</div>
          </div>
        ) : (
          <div className="stf-tablewrap">
            <table className="stf-table">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>البريد الإلكتروني</th>
                  <th>الدور</th>
                  <th>الحالة</th>
                  <th>الصلاحيات</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  const st = STATUS[e.status] || STATUS.active;
                  const roleLabel = ROLE_LABEL[e.role] || e.role;
                  const roleCls = e.role === "owner" ? "owner" : e.role === "manager" ? "manager" : "";
                  const initial = (e.name || "؟").trim().charAt(0);
                  return (
                    <tr key={e.id}>
                      <td>
                        <span className="stf-emp-name">
                          <span className="stf-emp-avatar">{initial}</span>
                          {e.name}
                        </span>
                      </td>
                      <td>
                        <span className="stf-emp-email"><Mail size={13} />{e.email}</span>
                      </td>
                      <td><span className={`stf-role ${roleCls}`}>{roleLabel}</span></td>
                      <td><span className={`stf-spill ${st.cls}`}>{st.label}</span></td>
                      <td>
                        {e.permissions && e.permissions.length > 0 ? (
                          <span className="stf-perms">
                            {e.permissions.map((p, idx) => (
                              <span className="stf-perm" key={idx}>{PERM_LABEL[p] || p}</span>
                            ))}
                          </span>
                        ) : (
                          <span className="stf-perm-none">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
