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
  notifications: { ar: "الإشعارات", en: "Notifications", ur: "اطلاعات", tl: "Mga Abiso" },
  noNotifications: { ar: "لا توجد إشعارات", en: "No notifications", ur: "کوئی اطلاع نہیں", tl: "Walang abiso" },
  markAllRead: { ar: "تعليم الكل كمقروء", en: "Mark all read", ur: "سب پڑھا ہوا نشان زد کریں", tl: "Markahan lahat" },

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
  fin_review: { ar: "مراجعة عروض الأسعار", en: "Quote Review", ur: "قیمت کا جائزہ", tl: "Pagsusuri ng Quote" },
  ops_draft: { ar: "مسودات العمليات", en: "Ops Drafts", ur: "آپریشنز ڈرافٹس", tl: "Mga Draft ng Operasyon" },
  ops_approval: { ar: "الموافقة النهائية", en: "Final Approval", ur: "حتمی منظوری", tl: "Panghuling Pag-apruba" },
  leg_pcon: { ar: "عقود المشاريع", en: "Project Contracts", ur: "پروجیکٹ معاہدے", tl: "Mga Kontrata ng Proyekto" },
  as_ben: { ar: "ربط السكن والمواصلات", en: "Housing & Transport Links", ur: "رہائش اور ٹرانسپورٹ لنکس", tl: "Mga Link sa Tirahan at Transportasyon" },
  leg_sign: { ar: "توقيعات العقود", en: "Contract Signatures", ur: "معاہدے کے دستخط", tl: "Mga Lagda ng Kontrata" },
  leg_tpl: { ar: "قوالب العقود", en: "Contract Templates", ur: "معاہدے کے ٹیمپلیٹس", tl: "Mga Template ng Kontrata" },

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

  // ===== بناء النظام =====
  build_sub: { ar: "اختر الأقسام التي تحتاجها فقط، وادفع مقابلها. النظام يبدأ بما تختاره ويكبر معك.", en: "Choose only the departments you need and pay for them. The system starts with what you pick and grows with you.", ur: "صرف وہی شعبے منتخب کریں جن کی آپ کو ضرورت ہے۔ نظام آپ کے انتخاب سے شروع ہوتا ہے۔", tl: "Piliin lang ang mga departamentong kailangan mo at bayaran ang mga ito. Magsisimula ang sistema sa pinili mo." },
  build_adminUsers: { ar: "عدد المستخدمين الإداريين", en: "Admin users count", ur: "انتظامی صارفین کی تعداد", tl: "Bilang ng admin users" },
  build_workers: { ar: "عدد العمالة", en: "Workers count", ur: "کارکنوں کی تعداد", tl: "Bilang ng manggagawa" },
  build_workersNote: { ar: "(للأقسام المرتبطة بالعمالة)", en: "(for labor-linked departments)", ur: "(مزدور سے منسلک شعبوں کے لیے)", tl: "(para sa mga departamentong nakaugnay sa manggagawa)" },
  build_monthlySub: { ar: "الاشتراك الشهري", en: "Monthly subscription", ur: "ماہانہ سبسکرپشن", tl: "Buwanang subscription" },
  build_perMonth: { ar: "ر.س / شهر", en: "SAR / month", ur: "ریال / ماہ", tl: "SAR / buwan" },
  build_users: { ar: "المستخدمون", en: "Users", ur: "صارفین", tl: "Mga user" },
  build_fixedDepts: { ar: "الأقسام الثابتة", en: "Fixed departments", ur: "مقررہ شعبے", tl: "Nakapirming departamento" },
  build_workersCost: { ar: "العمالة", en: "Labor", ur: "مزدوری", tl: "Manggagawa" },
  build_ownerOnly: { ar: "التعديل والدفع متاحان لمالك الحساب فقط. يمكنك تصفّح الأقسام والأسعار.", en: "Editing and payment are for the account owner only. You can browse departments and prices.", ur: "ترمیم اور ادائیگی صرف اکاؤنٹ مالک کے لیے ہے۔ آپ شعبے اور قیمتیں دیکھ سکتے ہیں۔", tl: "Ang pag-edit at pagbabayad ay para lang sa may-ari ng account. Maaari mong tingnan ang mga departamento at presyo." },
  build_selectOne: { ar: "اختر قسمًا واحدًا على الأقل.", en: "Select at least one department.", ur: "کم از کم ایک شعبہ منتخب کریں۔", tl: "Pumili ng hindi bababa sa isang departamento." },
  build_specifyWorkers: { ar: "حدّد عدد العمالة (اخترت أقسامًا تُسعّر بالعامل).", en: "Specify workers count (you selected labor-priced departments).", ur: "کارکنوں کی تعداد بتائیں (آپ نے مزدور کے حساب سے قیمت والے شعبے منتخب کیے)۔", tl: "Tukuyin ang bilang ng manggagawa (pumili ka ng batay-manggagawang departamento)." },
  build_saveActivate: { ar: "حفظ وتفعيل", en: "Save & activate", ur: "محفوظ اور فعال کریں", tl: "I-save at i-activate" },
  build_saving: { ar: "جارٍ الحفظ...", en: "Saving...", ur: "محفوظ ہو رہا ہے...", tl: "Sine-save..." },
  build_loadErr: { ar: "تعذّر تحميل البيانات.", en: "Failed to load data.", ur: "ڈیٹا لوڈ نہیں ہو سکا۔", tl: "Hindi ma-load ang data." },
  build_saveErr: { ar: "تعذّر الحفظ.", en: "Failed to save.", ur: "محفوظ نہیں ہو سکا۔", tl: "Hindi ma-save." },
  build_selected: { ar: "قسم مختار", en: "selected", ur: "منتخب شعبے", tl: "napili" },
  build_perWorker: { ar: "× عامل", en: "× worker", ur: "× کارکن", tl: "× manggagawa" },
  build_riyalMonth: { ar: "ر.س/شهر", en: "SAR/mo", ur: "ریال/ماہ", tl: "SAR/buwan" },
  build_savedPrefix: { ar: "تم الحفظ والتفعيل. اشتراكك الشهري:", en: "Saved and activated. Your monthly subscription:", ur: "محفوظ اور فعال ہو گیا۔ آپ کی ماہانہ سبسکرپشن:", tl: "Na-save at na-activate. Ang iyong buwanang subscription:" },
  build_sectionWord: { ar: "قسم", en: "dept", ur: "شعبہ", tl: "dept" },
  build_riyal: { ar: "ر.س", en: "SAR", ur: "ریال", tl: "SAR" },

  // ===== الامتثال والتراخيص =====
  comp_subtitle: { ar: "متابعة التراخيص ومتطلبات الامتثال النظامية.", en: "Track licenses and regulatory compliance requirements.", ur: "لائسنس اور ریگولیٹری تعمیل کے تقاضوں کی نگرانی۔", tl: "Subaybayan ang mga lisensya at regulatory compliance." },
  comp_addLicense: { ar: "+ ترخيص جديد", en: "+ New license", ur: "+ نیا لائسنس", tl: "+ Bagong lisensya" },
  comp_newLicense: { ar: "ترخيص جديد", en: "New license", ur: "نیا لائسنس", tl: "Bagong lisensya" },
  comp_editLicense: { ar: "تعديل الترخيص", en: "Edit license", ur: "لائسنس میں ترمیم", tl: "I-edit ang lisensya" },
  comp_licName: { ar: "اسم الترخيص *", en: "License name *", ur: "لائسنس کا نام *", tl: "Pangalan ng lisensya *" },
  comp_licNameReq: { ar: "اسم الترخيص مطلوب.", en: "License name is required.", ur: "لائسنس کا نام لازمی ہے۔", tl: "Kailangan ang pangalan ng lisensya." },
  comp_licNumber: { ar: "رقم الترخيص", en: "License number", ur: "لائسنس نمبر", tl: "Numero ng lisensya" },
  comp_issuer: { ar: "الجهة المصدرة", en: "Issuing authority", ur: "جاری کرنے والا ادارہ", tl: "Nag-isyu na awtoridad" },
  comp_issueDate: { ar: "تاريخ الإصدار", en: "Issue date", ur: "جاری کرنے کی تاریخ", tl: "Petsa ng pag-isyu" },
  comp_expiryDate: { ar: "تاريخ الانتهاء", en: "Expiry date", ur: "اختتام کی تاریخ", tl: "Petsa ng pag-expire" },
  comp_notes: { ar: "ملاحظات", en: "Notes", ur: "نوٹس", tl: "Mga tala" },
  comp_expiresPrefix: { ar: "ينتهي: ", en: "Expires: ", ur: "ختم: ", tl: "Mag-e-expire: " },
  comp_noLicenses: { ar: "لا توجد تراخيص. أضف ترخيصًا جديدًا.", en: "No licenses. Add a new one.", ur: "کوئی لائسنس نہیں۔ نیا شامل کریں۔", tl: "Walang lisensya. Magdagdag ng bago." },
  comp_validLicenses: { ar: "تراخيص سارية", en: "Valid licenses", ur: "فعال لائسنس", tl: "Balidong lisensya" },
  comp_expiringSoonTitle: { ar: "تنتهي قريبًا", en: "Expiring soon", ur: "جلد ختم ہونے والے", tl: "Malapit nang mag-expire" },
  comp_expiredTitle: { ar: "منتهية", en: "Expired", ur: "ختم شدہ", tl: "Nag-expire na" },
  comp_valid: { ar: "ساري المفعول", en: "Valid", ur: "مؤثر", tl: "Balido" },
  comp_validShort: { ar: "ساري", en: "Valid", ur: "فعال", tl: "Balido" },
  comp_expired: { ar: "منتهٍ", en: "Expired", ur: "ختم", tl: "Nag-expire" },
  comp_expiringSoon: { ar: "ينتهي قريبًا", en: "Expiring soon", ur: "جلد ختم", tl: "Malapit nang mag-expire" },
  comp_complianceReqs: { ar: "متطلبات الامتثال", en: "Compliance requirements", ur: "تعمیل کے تقاضے", tl: "Mga kinakailangan sa pagsunod" },
  comp_complianceRate: { ar: "نسبة الامتثال", en: "Compliance rate", ur: "تعمیل کی شرح", tl: "Rate ng pagsunod" },
  comp_clickReq: { ar: "اضغط على المتطلب لتغيير حالته", en: "Click a requirement to change its status", ur: "حالت تبدیل کرنے کے لیے تقاضے پر کلک کریں", tl: "I-click ang kinakailangan para baguhin ang status" },
  comp_saving: { ar: "جارٍ الحفظ...", en: "Saving...", ur: "محفوظ ہو رہا ہے...", tl: "Sine-save..." },
  comp_saveErr: { ar: "تعذّر الحفظ.", en: "Failed to save.", ur: "محفوظ نہیں ہو سکا۔", tl: "Hindi ma-save." },
  comp_updateErr: { ar: "تعذّر التحديث.", en: "Failed to update.", ur: "اپ ڈیٹ نہیں ہو سکا۔", tl: "Hindi ma-update." },
  comp_deleteErr: { ar: "تعذّر الحذف.", en: "Failed to delete.", ur: "حذف نہیں ہو سکا۔", tl: "Hindi mabura." },
  comp_loadErr: { ar: "تعذّر تحميل البيانات.", en: "Failed to load data.", ur: "ڈیٹا لوڈ نہیں ہو سکا۔", tl: "Hindi ma-load ang data." },
  comp_noTenant: { ar: "تعذّر تحديد المنشأة.", en: "Could not identify the organization.", ur: "ادارے کی شناخت نہیں ہو سکی۔", tl: "Hindi matukoy ang organisasyon." },
  comp_userErr: { ar: "تعذّر تحميل بيانات المستخدم.", en: "Failed to load user data.", ur: "صارف کا ڈیٹا لوڈ نہیں ہوا۔", tl: "Hindi ma-load ang user data." },
  comp_notLoggedIn: { ar: "لم يتم تسجيل الدخول.", en: "Not logged in.", ur: "لاگ ان نہیں ہیں۔", tl: "Hindi naka-login." },
  // متطلبات الامتثال السعودية
  comp_commerce: { ar: "وزارة التجارة", en: "Ministry of Commerce", ur: "وزارت تجارت", tl: "Ministri ng Komersyo" },
  comp_cr: { ar: "السجل التجاري", en: "Commercial Registration", ur: "کمرشل رجسٹریشن", tl: "Commercial Registration" },
  comp_gosi: { ar: "التأمينات (GOSI)", en: "Social Insurance (GOSI)", ur: "سماجی بیمہ (GOSI)", tl: "Social Insurance (GOSI)" },
  comp_wps: { ar: "حماية الأجور (WPS)", en: "Wage Protection (WPS)", ur: "اجرت تحفظ (WPS)", tl: "Wage Protection (WPS)" },
  comp_zatca: { ar: "فوترة ZATCA", en: "ZATCA Invoicing", ur: "ZATCA انوائسنگ", tl: "ZATCA Invoicing" },
  comp_vat: { ar: "ضريبة القيمة المضافة", en: "Value Added Tax", ur: "ویلیو ایڈڈ ٹیکس", tl: "Value Added Tax" },
  comp_nitaqat: { ar: "نطاقات — السعودة", en: "Nitaqat — Saudization", ur: "نطاقات — سعودائزیشن", tl: "Nitaqat — Saudization" },
  comp_laborLicense: { ar: "رخصة مكتب العمل", en: "Labor Office License", ur: "لیبر آفس لائسنس", tl: "Labor Office License" },
  comp_civilDefense: { ar: "الدفاع المدني", en: "Civil Defense", ur: "سول ڈیفنس", tl: "Civil Defense" },
  comp_safety: { ar: "اشتراطات السلامة", en: "Safety requirements", ur: "حفاظتی تقاضے", tl: "Mga kinakailangan sa kaligtasan" },
  comp_regularDecl: { ar: "إقرارات منتظمة", en: "Regular declarations", ur: "باقاعدہ اقرارنامے", tl: "Regular na deklarasyon" },
  comp_updatedSubs: { ar: "اشتراكات محدّثة", en: "Updated subscriptions", ur: "اپ ڈیٹ سبسکرپشنز", tl: "Na-update na subscription" },
  comp_payrollSystem: { ar: "الرواتب عبر النظام", en: "Payroll via system", ur: "نظام کے ذریعے تنخواہ", tl: "Payroll sa sistema" },
  comp_greenZone: { ar: "النطاق الأخضر", en: "Green zone", ur: "گرین زون", tl: "Green zone" },
  comp_validUpdated: { ar: "سارية ومحدّثة", en: "Valid and updated", ur: "فعال اور اپ ڈیٹ", tl: "Balido at updated" },
  comp_eInvoice: { ar: "فوترة إلكترونية معتمدة", en: "Approved e-invoicing", ur: "منظور شدہ ای انوائسنگ", tl: "Aprubadong e-invoicing" },
  comp_day: { ar: "يوم", en: "days", ur: "دن", tl: "araw" },
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
