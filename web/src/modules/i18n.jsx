import { createContext, useContext, useState, useEffect } from "react";

/* ============================================================
   نظام الترجمة (i18n) — عربي / إنجليزي / أردو / فلبيني
   - LanguageProvider: يحفظ اللغة الحالية + الاتجاه (RTL/LTR)
   - useT(): hook يرجّع { t, lang, setLang, dir, langs }
   - t(key): يرجّع الترجمة باللغة الحالية (fallback للعربية ثم المفتاح)
   ============================================================ */

export const LANGS = {
  ar: { name: "العربية", dir: "rtl", flag: "🇸🇦" },
  en: { name: "English", dir: "ltr", flag: "🇬🇧" },
  ur: { name: "اردو", dir: "rtl", flag: "🇵🇰" },
  tl: { name: "Filipino", dir: "ltr", flag: "🇵🇭" },
};

// الترجمات: مفتاح → { لغة: نص }
const T = {
  // ===== مشترك (أزرار وعناوين عامة) =====
  appName: { ar: "Central", en: "Central", ur: "Central", tl: "Central" },
  save: { ar: "حفظ", en: "Save", ur: "محفوظ کریں", tl: "I-save" },
  cancel: { ar: "إلغاء", en: "Cancel", ur: "منسوخ کریں", tl: "Kanselahin" },
  edit: { ar: "تعديل", en: "Edit", ur: "ترمیم", tl: "I-edit" },
  delete: { ar: "حذف", en: "Delete", ur: "حذف کریں", tl: "Burahin" },
  add: { ar: "إضافة", en: "Add", ur: "شامل کریں", tl: "Magdagdag" },
  search: { ar: "بحث", en: "Search", ur: "تلاش کریں", tl: "Maghanap" },
  refresh: { ar: "تحديث", en: "Refresh", ur: "تازہ کریں", tl: "I-refresh" },
  back: { ar: "رجوع", en: "Back", ur: "واپس", tl: "Bumalik" },
  logout: { ar: "خروج", en: "Logout", ur: "لاگ آؤٹ", tl: "Mag-logout" },
  login: { ar: "دخول", en: "Login", ur: "لاگ ان", tl: "Mag-login" },
  loading: { ar: "جارٍ التحميل...", en: "Loading...", ur: "لوڈ ہو رہا ہے...", tl: "Naglo-load..." },
  close: { ar: "إغلاق", en: "Close", ur: "بند کریں", tl: "Isara" },
  confirm: { ar: "تأكيد", en: "Confirm", ur: "تصدیق", tl: "Kumpirmahin" },
  total: { ar: "الإجمالي", en: "Total", ur: "کل", tl: "Kabuuan" },
  status: { ar: "الحالة", en: "Status", ur: "حالت", tl: "Katayuan" },
  date: { ar: "التاريخ", en: "Date", ur: "تاریخ", tl: "Petsa" },
  name: { ar: "الاسم", en: "Name", ur: "نام", tl: "Pangalan" },
  email: { ar: "البريد الإلكتروني", en: "Email", ur: "ای میل", tl: "Email" },
  phone: { ar: "الجوال", en: "Phone", ur: "فون", tl: "Telepono" },
  actions: { ar: "إجراءات", en: "Actions", ur: "اعمال", tl: "Mga Aksyon" },
  details: { ar: "تفاصيل", en: "Details", ur: "تفصیلات", tl: "Mga Detalye" },
  all: { ar: "الكل", en: "All", ur: "سب", tl: "Lahat" },
  active: { ar: "نشط", en: "Active", ur: "فعال", tl: "Aktibo" },
  yes: { ar: "نعم", en: "Yes", ur: "ہاں", tl: "Oo" },
  no: { ar: "لا", en: "No", ur: "نہیں", tl: "Hindi" },
  required: { ar: "مطلوب", en: "Required", ur: "لازمی", tl: "Kailangan" },
  amount: { ar: "المبلغ", en: "Amount", ur: "رقم", tl: "Halaga" },
  noData: { ar: "لا توجد بيانات", en: "No data", ur: "کوئی ڈیٹا نہیں", tl: "Walang data" },
  language: { ar: "اللغة", en: "Language", ur: "زبان", tl: "Wika" },

  // ===== الإدارات (الأقسام الرئيسية التسعة) =====
  exec: { ar: "الإدارة العليا", en: "Executive", ur: "اعلیٰ انتظامیہ", tl: "Ehekutibo" },
  fin: { ar: "المالية", en: "Finance", ur: "مالیات", tl: "Pananalapi" },
  hr: { ar: "الموارد البشرية", en: "Human Resources", ur: "انسانی وسائل", tl: "Human Resources" },
  ops: { ar: "العمليات", en: "Operations", ur: "آپریشنز", tl: "Operasyon" },
  assets: { ar: "الأصول والمرافق", en: "Assets & Facilities", ur: "اثاثے اور سہولیات", tl: "Mga Ari-arian" },
  cost: { ar: "التكاليف والربحية", en: "Cost & Profitability", ur: "لاگت اور منافع", tl: "Gastos at Kita" },
  sales: { ar: "المبيعات والتسويق", en: "Sales & Marketing", ur: "فروخت اور مارکیٹنگ", tl: "Benta at Marketing" },
  legal: { ar: "القانونية والامتثال", en: "Legal & Compliance", ur: "قانونی اور تعمیل", tl: "Legal at Pagsunod" },
  quality: { ar: "التميز والجودة", en: "Quality & Excellence", ur: "معیار اور عمدگی", tl: "Kalidad at Kahusayan" },

  // ===== عناصر التنقّل الثابتة =====
  subscriptions: { ar: "الاشتراكات", en: "Subscriptions", ur: "سبسکرپشنز", tl: "Mga Subscription" },
  build: { ar: "بناء النظام", en: "Build System", ur: "سسٹم بنائیں", tl: "Bumuo ng Sistema" },
  support: { ar: "الدعم", en: "Support", ur: "معاونت", tl: "Suporta" },
  platformAdmin: { ar: "إدارة المنصة", en: "Platform Admin", ur: "پلیٹ فارم انتظام", tl: "Platform Admin" },

  // ===== أقسام الإدارة العليا =====
  exec_kpi: { ar: "لوحة المؤشرات", en: "KPI Dashboard", ur: "کے پی آئی ڈیش بورڈ", tl: "KPI Dashboard" },
  exec_org: { ar: "الهيكل التنظيمي", en: "Org Structure", ur: "تنظیمی ڈھانچہ", tl: "Istraktura" },
  exec_perm: { ar: "الصلاحيات", en: "Permissions", ur: "اختیارات", tl: "Mga Pahintulot" },

  // ===== أقسام المالية =====
  fin_acc: { ar: "المحاسبة", en: "Accounting", ur: "اکاؤنٹنگ", tl: "Accounting" },
  fin_inv: { ar: "الفوترة و ZATCA", en: "Invoicing & ZATCA", ur: "انوائسنگ و زکاۃ", tl: "Invoicing & ZATCA" },
  fin_cust: { ar: "العملاء", en: "Customers", ur: "گاہک", tl: "Mga Kliyente" },
  fin_fs: { ar: "القوائم المالية", en: "Financial Statements", ur: "مالی گوشوارے", tl: "Financial Statements" },
  fin_coll: { ar: "التحصيل", en: "Collections", ur: "وصولی", tl: "Koleksyon" },
  fin_treas: { ar: "الخزينة", en: "Treasury", ur: "خزانہ", tl: "Treasury" },
  fin_fpa: { ar: "التخطيط والتحليل", en: "Planning & Analysis", ur: "منصوبہ بندی و تجزیہ", tl: "Pagpaplano" },
  fin_proc: { ar: "المشتريات", en: "Procurement", ur: "خریداری", tl: "Pagbili" },
  fin_pos: { ar: "نقاط البيع", en: "Point of Sale", ur: "پوائنٹ آف سیل", tl: "Point of Sale" },
  fin_cash: { ar: "الكاشير", en: "Cashier", ur: "کیشیئر", tl: "Cashier" },

  // ===== أقسام الموارد البشرية =====
  hr_emp: { ar: "شؤون الموظفين", en: "Employees", ur: "ملازمین", tl: "Mga Empleyado" },
  hr_pay: { ar: "الرواتب", en: "Payroll", ur: "تنخواہ", tl: "Payroll" },
  hr_rec: { ar: "التوظيف", en: "Recruitment", ur: "بھرتی", tl: "Recruitment" },
  hr_train: { ar: "التدريب", en: "Training", ur: "تربیت", tl: "Pagsasanay" },
  hr_rel: { ar: "علاقات الموظفين", en: "Employee Relations", ur: "ملازمین کے تعلقات", tl: "Employee Relations" },

  // ===== أقسام العمليات =====
  ops_proj: { ar: "المشاريع", en: "Projects", ur: "منصوبے", tl: "Mga Proyekto" },
  ops_people: { ar: "الأفراد", en: "People", ur: "افراد", tl: "Mga Tao" },
  ops_facilities: { ar: "المرافق", en: "Facilities", ur: "سہولیات", tl: "Mga Pasilidad" },
  ops_materials: { ar: "المواد", en: "Materials", ur: "مواد", tl: "Mga Materyales" },
  ops_inv: { ar: "المخزون", en: "Inventory", ur: "انوینٹری", tl: "Imbentaryo" },
  ops_req: { ar: "طلبات المخزون", en: "Stock Requests", ur: "اسٹاک درخواستیں", tl: "Stock Requests" },
  ops_process: { ar: "العمليات التشغيلية", en: "Processes", ur: "عملیات", tl: "Mga Proseso" },
  ops_planning: { ar: "التخطيط والرقابة", en: "Planning & Control", ur: "منصوبہ بندی و کنٹرول", tl: "Pagpaplano" },
  ops_qs: { ar: "الجودة والسلامة", en: "Quality & Safety", ur: "معیار و حفاظت", tl: "Kalidad at Kaligtasan" },

  // ===== أقسام الأصول =====
  as_veh: { ar: "المركبات", en: "Vehicles", ur: "گاڑیاں", tl: "Mga Sasakyan" },
  as_hous: { ar: "الإسكان", en: "Housing", ur: "رہائش", tl: "Pabahay" },
  as_equ: { ar: "المعدّات", en: "Equipment", ur: "آلات", tl: "Kagamitan" },
  as_simple: { ar: "الأصول البسيطة", en: "Simple Assets", ur: "سادہ اثاثے", tl: "Simpleng Ari-arian" },
  as_dep: { ar: "الإهلاك", en: "Depreciation", ur: "فرسودگی", tl: "Depreciation" },

  // ===== أقسام التكاليف =====
  cost_full: { ar: "التكلفة الشاملة", en: "Full Costing", ur: "مکمل لاگت", tl: "Buong Gastos" },
  cost_prof: { ar: "تقارير الربحية", en: "Profitability", ur: "منافع رپورٹس", tl: "Kita Reports" },
  cost_alloc: { ar: "توزيع الموارد", en: "Cost Allocation", ur: "وسائل کی تقسیم", tl: "Cost Allocation" },

  // ===== أقسام المبيعات =====
  sal_dir: { ar: "المبيعات المباشرة", en: "Direct Sales", ur: "براہ راست فروخت", tl: "Direktang Benta" },
  sal_quote: { ar: "عروض الأسعار", en: "Quotations", ur: "قیمت کی پیشکش", tl: "Mga Quote" },
  sal_mkt: { ar: "التسويق والتواصل", en: "Marketing", ur: "مارکیٹنگ", tl: "Marketing" },
  sal_serv: { ar: "خدمة العملاء", en: "Customer Service", ur: "کسٹمر سروس", tl: "Customer Service" },

  // ===== أقسام القانونية =====
  leg_con: { ar: "العقود", en: "Contracts", ur: "معاہدے", tl: "Mga Kontrata" },
  leg_com: { ar: "الامتثال والتراخيص", en: "Compliance & Licenses", ur: "تعمیل و لائسنس", tl: "Pagsunod" },
  leg_dis: { ar: "المنازعات", en: "Disputes", ur: "تنازعات", tl: "Mga Alitan" },

  // ===== أقسام الجودة =====
  qa_aud: { ar: "التدقيق الداخلي", en: "Internal Audit", ur: "داخلی آڈٹ", tl: "Internal Audit" },
  qa_nps: { ar: "رضا العملاء و NPS", en: "NPS & Satisfaction", ur: "این پی ایس", tl: "NPS" },
  qa_imp: { ar: "تحسين العمليات", en: "Process Improvement", ur: "عمل کی بہتری", tl: "Pagpapabuti" },
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem("central_lang") || "ar"; } catch (e) { return "ar"; }
  });

  const setLang = (l) => {
    if (!LANGS[l]) return;
    setLangState(l);
    try { localStorage.setItem("central_lang", l); } catch (e) { /* تجاهل */ }
  };

  const dir = (LANGS[lang] && LANGS[lang].dir) || "rtl";

  useEffect(() => {
    try {
      document.documentElement.dir = dir;
      document.documentElement.lang = lang;
    } catch (e) { /* تجاهل */ }
  }, [dir, lang]);

  const t = (key) => {
    const entry = T[key];
    if (!entry) return key;
    return entry[lang] || entry.ar || key;
  };

  return (
    <LanguageContext.Provider value={{ t, lang, setLang, dir, langs: LANGS }}>
      {children}
    </LanguageContext.Provider>
  );
}

// hook للاستخدام في أي مكوّن
export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // fallback آمن لو استُخدم خارج المزوّد
    return {
      t: (k) => { const e = T[k]; return e ? (e.ar || k) : k; },
      lang: "ar", setLang: () => {}, dir: "rtl", langs: LANGS,
    };
  }
  return ctx;
}
