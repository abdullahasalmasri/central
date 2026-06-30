// ===== التعريف المركزي لبنية البيانات =====

const COLLECTIONS = {
  TENANTS: "tenants",
  USERS: "users",
  SHIFTS: "shifts",
  SCHEDULES: "schedules",
  RECORDS: "records",
  EXCEPTIONS: "attendanceExceptions",
  SUMMARIES: "summaries",
  VENDORS: "vendors",
  ITEMS: "items",
  ACCOUNTS: "accounts",
  JOURNAL_ENTRIES: "journalEntries",
  CUSTOMERS: "customers",
  INVOICES: "invoices",
  PROJECT_TYPES: "projectTypes",
  PROJECTS: "projects",
  JOB_TITLES: "jobTitles",
  RESOURCE_REQUESTS: "resourceRequests",
  WORKER_ASSIGNMENTS: "workerAssignments",
  ASSETS: "assets",
  ASSET_EXPENSES: "assetExpenses",
  FINANCE_APPROVALS: "financeApprovals",
  RECEIPTS: "receipts",
  CLOSINGS: "closings",
  PAYMENTS: "payments",
  EMPLOYEES: "employees",
  PAYROLL_RUNS: "payrollRuns",
  VACANCIES: "vacancies",
  APPLICANTS: "applicants",
  TRAINING_PROGRAMS: "trainingPrograms",
  TRAINING_ENROLLMENTS: "trainingEnrollments",
  LEAVE_REQUESTS: "leaveRequests",
  PENALTIES: "penalties",
  EVALUATIONS: "evaluations",
  EMPLOYEE_ASSIGNMENTS: "employeeAssignments",
  ASSET_ASSIGNMENTS: "assetAssignments",
  MATERIAL_ALLOCATIONS: "materialAllocations",
  OPERATION_TASKS: "operationTasks",
  PROJECT_MILESTONES: "projectMilestones",
  QUALITY_INSPECTIONS: "qualityInspections",
  PROJECT_BUDGETS: "projectBudgets",
  DEALS: "deals",
  QUOTES: "quotes",
  CAMPAIGNS: "campaigns",
  TICKETS: "tickets",
  INTERACTIONS: "interactions",
  CONTRACTS: "contracts",
  LICENSES: "licenses",
  DISPUTES: "disputes",
  AUDITS: "audits",
  FINDINGS: "findings",
  RATINGS: "ratings",
  IMPROVEMENTS: "improvements",
  PRODUCTS: "products",
  STOCK_MOVEMENTS: "stockMovements",
  SALES_ORDERS: "salesOrders",
  CASHIER_SESSIONS: "cashierSessions",
  SALES_RETURNS: "salesReturns",
  SAFETY_INCIDENTS: "safetyIncidents",
  SAFETY_INSPECTIONS: "safetyInspections",
};

const ROLES = {
  OWNER: "owner",
  STAFF: "staff",
  WORKER: "worker",
};

const MODULES = {
  HR: "hr",
  FINANCE: "finance",
  ATTENDANCE: "attendance",
  REVIEWS: "reviews",
  PROCUREMENT: "procurement",
  PROJECTS: "projects",
  OPERATIONS: "operations",
  ASSETS: "assets",
  SALES: "sales",
  LEGAL: "legal",
  QUALITY: "quality",
  INVENTORY: "inventory",
  POS: "pos",
};

const ALL_MODULES = Object.values(MODULES);

const SUBSCRIPTION_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  SUSPENDED: "suspended",
};

const DEFAULTS = {
  PLAN: "free",
  MAX_USERS: 5,
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const RECORD_STATUS = {
  OPEN: "open",
  FINALIZED: "finalized",
};

const ENTRY_STATUS = {
  PRESENT: "present",
  ABSENT: "absent",
  LATE: "late",
};

const EXCEPTION_STATUS = {
  PENDING_WORKER: "pending_worker",
  ACCEPTED: "accepted",
  OBJECTED: "objected",
};

const ESCALATION_LEVEL = {
  SUPERVISOR: "supervisor",
  ESCALATED: "escalated",
  HR: "hr",
  RESOLVED: "resolved",
};

const DEAL_TYPES = {
  SALE: "sale",
  RENTAL: "rental",
  CONSUMABLE: "consumable",
};
const ALL_DEAL_TYPES = Object.values(DEAL_TYPES);

const COST_STATUS = {
  DRAFT: "draft",
  PENDING_FINANCE: "pending_finance",
  APPROVED: "approved",
  REJECTED: "rejected",
};

const ACCOUNT_TYPES = {
  ASSET: "asset",
  LIABILITY: "liability",
  EQUITY: "equity",
  REVENUE: "revenue",
  EXPENSE: "expense",
};
const ALL_ACCOUNT_TYPES = Object.values(ACCOUNT_TYPES);

const ACCOUNT_NORMAL_SIDE = {
  asset: "debit",
  expense: "debit",
  liability: "credit",
  equity: "credit",
  revenue: "credit",
};

const JOURNAL_STATUS = {
  DRAFT: "draft",
  POSTED: "posted",
};

const INVOICE_STATUS = {
  ISSUED: "issued",
  PAID: "paid",
  CANCELLED: "cancelled",
};

const INVOICE_ACCOUNT_CODES = {
  RECEIVABLE: "1200",
  VAT_PAYABLE: "2200",
  EXCISE_PAYABLE: "2210",
};

const COST_PERIODS = {
  HOURLY: "hourly",
  DAILY: "daily",
  MONTHLY: "monthly",
  YEARLY: "yearly",
};
const ALL_COST_PERIODS = Object.values(COST_PERIODS);

const PROJECT_STATUS = {
  PLANNED: "planned",
  ACTIVE: "active",
  ON_HOLD: "on_hold",
  UNDER_REVIEW: "under_review",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const DEFAULT_PROJECT_TYPES = [
  { name: "تأجير عمالة", code: "labor_rental", description: "تأجير عمالة لمدة محددة، يعود العامل بعدها" },
  { name: "نقل كفالة", code: "labor_transfer", description: "توريد عمالة مع نقل الكفالة للعميل" },
  { name: "تأجير معدات", code: "equipment_rental", description: "تأجير معدات وآليات" },
  { name: "بيع مواد ومعدات", code: "sales", description: "شراء وبيع المواد والمعدات للعميل" },
  { name: "عقد صيانة", code: "maintenance", description: "صيانة دورية أو شاملة (ترميم/سباكة/كهرباء)" },
];

const REQUEST_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  FULFILLED: "fulfilled",
  CANCELLED: "cancelled",
};

const RESOURCE_TYPES = {
  LABOR: "labor",
  EQUIPMENT: "equipment",
};

const REQUEST_PRIORITY = {
  NORMAL: "normal",
  URGENT: "urgent",
};

const ASSIGNMENT_STATUS = {
  ACTIVE: "active",
  ENDED: "ended",
  REMOVED: "removed",
};

const DEFAULT_CHART_OF_ACCOUNTS = [
  { code: "1100", name: "النقد وما في حكمه", type: "asset", subtype: "current_asset" },
  { code: "1200", name: "الذمم المدينة (العملاء)", type: "asset", subtype: "current_asset" },
  { code: "1300", name: "المخزون", type: "asset", subtype: "current_asset" },
  { code: "1500", name: "الأصول الثابتة", type: "asset", subtype: "non_current_asset" },
  { code: "1510", name: "المعدّات المؤجّرة", type: "asset", subtype: "non_current_asset" },
  { code: "2100", name: "الذمم الدائنة (الموردون)", type: "liability", subtype: "current_liability" },
  { code: "2200", name: "ضريبة القيمة المضافة المستحقة", type: "liability", subtype: "current_liability" },
  { code: "2210", name: "الضريبة الانتقائية المستحقة", type: "liability", subtype: "current_liability" },
  { code: "2300", name: "رواتب مستحقة الدفع", type: "liability", subtype: "current_liability" },
  { code: "3100", name: "رأس المال", type: "equity", subtype: "equity" },
  { code: "3200", name: "الأرباح المُبقاة", type: "equity", subtype: "equity" },
  { code: "4100", name: "إيرادات خدمات العمالة", type: "revenue", subtype: "operating_revenue" },
  { code: "4200", name: "إيرادات بيع المنتجات", type: "revenue", subtype: "operating_revenue" },
  { code: "4300", name: "إيرادات تأجير المعدّات", type: "revenue", subtype: "operating_revenue" },
  { code: "5100", name: "تكلفة المبيعات — رواتب العمالة", type: "expense", subtype: "cogs" },
  { code: "5200", name: "تكلفة المبيعات — تكاليف حكومية", type: "expense", subtype: "cogs" },
  { code: "5300", name: "المصروفات الإدارية", type: "expense", subtype: "operating_expense" },
  { code: "5400", name: "مصروفات تشغيلية أخرى", type: "expense", subtype: "operating_expense" },
];

function buildTenantDoc({ name, ownerUid, createdAt }) {
  return {
    name,
    ownerUid,
    subscriptionStatus: SUBSCRIPTION_STATUS.PENDING,
    plan: DEFAULTS.PLAN,
    maxUsers: DEFAULTS.MAX_USERS,
    workDaysPerMonth: 30,
    workHoursPerDay: 8,
    createdAt,
  };
}

function buildUserDoc({ tenantId, role, name, email, createdAt, permissions = [] }) {
  return { tenantId, role, name, email, permissions, createdAt };
}

function buildEmployeeDoc({ tenantId, name, email, permissions, managerUid, createdBy, createdAt }) {
  return {
    tenantId,
    role: ROLES.STAFF,
    name,
    email,
    permissions: permissions || [],
    managerUid: managerUid || null,
    status: "active",
    mustChangePassword: true,
    createdBy,
    createdAt,
  };
}

// بناء بدل (أساسي أو يدوي)
function buildAllowance({ name, amount, deductOnAbsence }) {
  return {
    name: name,
    amount: Number(amount) || 0,
    deductOnAbsence: deductOnAbsence === true,  // افتراضيًا ثابت (false)
  };
}

// بناء بنية تكلفة العامل الأساسية (الوحدة 1: راتب + بدلات + عقد)
function buildWorkerCostBase({
  basicSalary, workDaysPerMonth, workHoursPerDay,
  allowances, contractStartDate, contractDurationYears,
  iqamaNumber, passportNumber,
}) {
  return {
    basicSalary: Number(basicSalary) || 0,             // الراتب الأساسي (متغيّر)
    workDaysPerMonth: Number(workDaysPerMonth) || 26,  // أيام العمل الشهرية
    workHoursPerDay: Number(workHoursPerDay) || 8,     // ساعات العمل اليومية
    allowances: Array.isArray(allowances) ? allowances : [],  // البدلات (ثابتة عادةً)
    contractStartDate: contractStartDate || null,      // تاريخ بدء العقد
    contractDurationYears: Number(contractDurationYears) || 2, // مدة العقد (سنوات)
    iqamaNumber: iqamaNumber || null,
    passportNumber: passportNumber || null,
    // أماكن محجوزة للوحدات القادمة:
    governmentCosts: null,   // الوحدة 2
    socialInsurance: null,   // الوحدة 2
    // (الإدارية تُحسب على مستوى المنشأة، لا هنا)
  };
}

function buildWorkerDoc({
  tenantId, name, email, supervisorUid, employeeNumber,
  jobTitleId, jobTitleName, costBase, createdBy, createdAt,
}) {
  return {
    tenantId,
    role: ROLES.WORKER,
    name,
    email,
    permissions: [],
    supervisorUid: supervisorUid || null,
    employeeNumber: employeeNumber || null,
    jobTitleId: jobTitleId || null,
    jobTitleName: jobTitleName || null,
    costBase: costBase || null,   // بنية التكلفة الأساسية (الوحدة 1)
    status: "active",
    mustChangePassword: true,
    createdBy,
    createdAt,
  };
}

// ═══════════════════════════════════════════════════════
// ===== التكاليف الحكومية (الوحدة 2) =====
// ═══════════════════════════════════════════════════════

// البنود الحكومية الثابتة (الأسماء)
const GOV_COST_ITEMS_YEAR1 = [
  { key: "recruitment", name: "تكلفة الاستقدام" },
  { key: "visa", name: "تكلفة الفيزا" },
  { key: "embassy_stamp", name: "ختم السفارة" },
  { key: "medical_before", name: "الفحص الطبي" },
  { key: "visa_issue", name: "التفييز" },
  { key: "arrival_ticket", name: "تذكرة القدوم" },
  { key: "medical_after", name: "الفحص الطبي عند الوصول" },
  { key: "medical_insurance", name: "التأمين الطبي" },
  { key: "work_permit", name: "كرت العمل" },
  { key: "labor_fee", name: "المقابل المالي" },
  { key: "iqama", name: "الإقامة" },
];

const GOV_COST_ITEMS_YEAR2 = [
  { key: "medical_insurance", name: "التأمين الطبي" },
  { key: "work_permit", name: "كرت العمل" },
  { key: "labor_fee", name: "المقابل المالي" },
  { key: "iqama", name: "الإقامة" },
];

// آليات الإطفاء
const AMORTIZATION_METHODS = {
  TOTAL: "total",         // إجمالي على عدد أشهر (1-24)
  PER_YEAR: "per_year",   // كل سنة على حدة (÷12 لكل)
  CUSTOM: "custom",       // مخصّص: سنة1 على N1، سنة2 على N2
};

// بناء بند حكومي
function buildGovItem({ key, name, amount, year, isManual }) {
  return {
    key: key || null,
    name: name,
    amount: Number(amount) || 0,
    year: Number(year) === 2 ? 2 : 1,   // 1 أو 2
    isManual: isManual === true,
  };
}

// بناء بنية التكاليف الحكومية
function buildGovernmentCosts({
  items, includeEndOfService, includeLeaveBalance,
  annualLeaveDays, amortizationMethod, totalMonths,
  year1Months, year2Months,
}) {
  return {
    items: Array.isArray(items) ? items : [],   // البنود (سنة 1 و2 + يدوية)
    includeEndOfService: includeEndOfService !== false,  // نهاية الخدمة (افتراضي نعم)
    includeLeaveBalance: includeLeaveBalance !== false,  // رصيد الإجازات (افتراضي نعم)
    annualLeaveDays: Number(annualLeaveDays) || 21,      // أيام الإجازة السنوية
    amortizationMethod: Object.values(AMORTIZATION_METHODS).includes(amortizationMethod)
      ? amortizationMethod : AMORTIZATION_METHODS.TOTAL,
    totalMonths: Number(totalMonths) || 24,    // لطريقة total
    year1Months: Number(year1Months) || 12,    // لطريقة custom
    year2Months: Number(year2Months) || 12,    // لطريقة custom
  };
}

// ===== التأمينات الاجتماعية (الوحدة 2-ب) =====

const INSURANCE_BEARER = {
  COMPANY: "company",   // الشركة بالكامل
  WORKER: "worker",     // العامل بالكامل
  SHARED: "shared",     // مشتركة
};

// بناء بنية التأمينات الاجتماعية
function buildSocialInsurance({
  enabled, totalRate, bearer, companyRate, workerRate,
}) {
  return {
    enabled: enabled === true,
    totalRate: Number(totalRate) || 0,        // النسبة الإجمالية (%)
    bearer: Object.values(INSURANCE_BEARER).includes(bearer) ? bearer : INSURANCE_BEARER.COMPANY,
    companyRate: Number(companyRate) || 0,    // نسبة الشركة (% للمشتركة)
    workerRate: Number(workerRate) || 0,      // نسبة العامل (% للمشتركة)
  };
}

// التحقّق من بنية التأمينات
function validateSocialInsurance(ins) {
  if (!ins || ins.enabled !== true) return { valid: true }; // غير مفعّلة = صحيحة

  const total = Number(ins.totalRate);
  if (!Number.isFinite(total) || total < 0 || total > 100) {
    return { valid: false, error: "النسبة الإجمالية غير صحيحة (0-100)." };
  }

  if (ins.bearer === INSURANCE_BEARER.SHARED) {
    const c = Number(ins.companyRate);
    const w = Number(ins.workerRate);
    if (!Number.isFinite(c) || c < 0 || !Number.isFinite(w) || w < 0) {
      return { valid: false, error: "نسب التحمّل غير صحيحة." };
    }
    // يجب أن يساوي مجموعهما الإجمالي (بهامش تقريب)
    if (Math.abs((c + w) - total) > 0.01) {
      return { valid: false, error: `مجموع نسبتي الشركة والعامل (${c + w}%) يجب أن يساوي النسبة الإجمالية (${total}%).` };
    }
  }

  return { valid: true };
}

// حساب التأمينات (الأثر المزدوج)
function computeSocialInsurance(costBase) {
  const empty = { totalAmount: 0, companyAmount: 0, workerAmount: 0, netSalary: 0 };
  if (!costBase) return empty;

  const basicSalary = Number(costBase.basicSalary) || 0;
  const ins = costBase.socialInsurance;
  if (!ins || ins.enabled !== true) {
    return { totalAmount: 0, companyAmount: 0, workerAmount: 0, netSalary: basicSalary };
  }

  const totalRate = Number(ins.totalRate) || 0;
  const totalAmount = basicSalary * (totalRate / 100);

  let companyAmount = 0;
  let workerAmount = 0;

  if (ins.bearer === INSURANCE_BEARER.COMPANY) {
    companyAmount = totalAmount;
    workerAmount = 0;
  } else if (ins.bearer === INSURANCE_BEARER.WORKER) {
    companyAmount = 0;
    workerAmount = totalAmount;
  } else if (ins.bearer === INSURANCE_BEARER.SHARED) {
    companyAmount = basicSalary * (Number(ins.companyRate) || 0) / 100;
    workerAmount = basicSalary * (Number(ins.workerRate) || 0) / 100;
  }

  const netSalary = basicSalary - workerAmount;

  const r = (n) => Math.round(n * 100) / 100;
  return {
    totalAmount: r(totalAmount),       // إجمالي التأمينات
    companyAmount: r(companyAmount),   // تتحمّله الشركة (تكلفة)
    workerAmount: r(workerAmount),     // يُخصم من العامل
    netSalary: r(netSalary),           // صافي راتب العامل
  };
}

// ===== حساب التكاليف الحكومية المُطفأة =====
// costBase: بنية العامل (للراتب ومدة العقد)
// govCosts: بنية التكاليف الحكومية
function computeGovernmentCosts(costBase, govCosts) {
  const empty = {
    year1Total: 0, year2Total: 0, endOfService: 0, leaveBalance: 0,
    grandTotal: 0, monthlyAmortized: 0, breakdown: [],
    year1Monthly: 0, year2Monthly: 0,
  };
  if (!costBase || !govCosts) return empty;

  const basicSalary = Number(costBase.basicSalary) || 0;
  const durationYears = Number(costBase.contractDurationYears) || 2;

  // مجاميع البنود حسب السنة
  let year1Items = 0;
  let year2Items = 0;
  const breakdown = [];
  for (const it of (govCosts.items || [])) {
    const amt = Number(it.amount) || 0;
    if (Number(it.year) === 2) {
      year2Items += amt;
    } else {
      year1Items += amt;
    }
    breakdown.push({ name: it.name, amount: amt, year: Number(it.year) === 2 ? 2 : 1, isManual: it.isManual === true });
  }

  // نهاية الخدمة = (راتب ÷ 2) × عدد السنوات
  let endOfService = 0;
  if (govCosts.includeEndOfService !== false) {
    endOfService = (basicSalary / 2) * durationYears;
  }

  // رصيد الإجازات = (راتب ÷ 30) × (أيام الإجازة × السنوات)
  let leaveBalance = 0;
  if (govCosts.includeLeaveBalance !== false) {
    const annualLeaveDays = Number(govCosts.annualLeaveDays) || 21;
    leaveBalance = (basicSalary / 30) * (annualLeaveDays * durationYears);
  }

  // نهاية الخدمة ورصيد الإجازات يُنسبان للإجمالي (يخصّان كامل المدة)
  const year1Total = year1Items;
  const year2Total = year2Items;
  const grandTotal = year1Total + year2Total + endOfService + leaveBalance;

  // الإطفاء
  const method = govCosts.amortizationMethod || AMORTIZATION_METHODS.TOTAL;
  let monthlyAmortized = 0;
  let year1Monthly = 0;
  let year2Monthly = 0;

  const r = (n) => Math.round(n * 100) / 100;

  if (method === AMORTIZATION_METHODS.TOTAL) {
    const months = Number(govCosts.totalMonths) || 24;
    monthlyAmortized = months > 0 ? grandTotal / months : 0;
  } else if (method === AMORTIZATION_METHODS.PER_YEAR) {
    // نهاية الخدمة ورصيد الإجازات تُوزّع على كامل المدة، نضيف حصّتها لكل سنة بالتساوي
    const extraPerYear = durationYears > 0 ? (endOfService + leaveBalance) / durationYears : 0;
    year1Monthly = (year1Total + extraPerYear) / 12;
    year2Monthly = durationYears >= 2 ? (year2Total + extraPerYear) / 12 : 0;
    monthlyAmortized = year1Monthly; // العرض الأساسي للسنة الأولى
  } else if (method === AMORTIZATION_METHODS.CUSTOM) {
    const y1m = Number(govCosts.year1Months) || 12;
    const y2m = Number(govCosts.year2Months) || 12;
    const extraPerYear = durationYears > 0 ? (endOfService + leaveBalance) / durationYears : 0;
    year1Monthly = y1m > 0 ? (year1Total + extraPerYear) / y1m : 0;
    year2Monthly = (durationYears >= 2 && y2m > 0) ? (year2Total + extraPerYear) / y2m : 0;
    monthlyAmortized = year1Monthly;
  }

  return {
    year1Total: r(year1Total),
    year2Total: r(year2Total),
    endOfService: r(endOfService),
    leaveBalance: r(leaveBalance),
    grandTotal: r(grandTotal),
    monthlyAmortized: r(monthlyAmortized),
    year1Monthly: r(year1Monthly),
    year2Monthly: r(year2Monthly),
    breakdown: breakdown,
  };
}

// ===== حساب تكلفة العامل الأساسية (الوحدة 1) =====
// يرجّع: الراتب اليومي/الساعي، إجمالي البدلات، التكلفة الشهرية الأساسية، تمييز ثابت/متغيّر
function computeWorkerBaseCost(costBase) {
  if (!costBase) {
    return {
      basicSalary: 0, dailySalary: 0, hourlySalary: 0,
      totalAllowances: 0, fixedAllowances: 0, variableAllowances: 0,
      monthlyVariable: 0, monthlyFixed: 0, monthlyTotal: 0,
      overtimeHourlyRate: 0,
    };
  }

  const basicSalary = Number(costBase.basicSalary) || 0;
  const workDays = Number(costBase.workDaysPerMonth) || 26;
  const workHours = Number(costBase.workHoursPerDay) || 8;

  // الراتب اليومي والساعي
  const dailySalary = workDays > 0 ? basicSalary / workDays : 0;
  const hourlySalary = workHours > 0 ? dailySalary / workHours : 0;
  const overtimeHourlyRate = hourlySalary * 1.5;  // الأوفر تايم × 1.5

  // البدلات (مفصولة ثابت/متغيّر)
  let fixedAllowances = 0;
  let variableAllowances = 0;
  for (const a of (costBase.allowances || [])) {
    const amt = Number(a.amount) || 0;
    if (a.deductOnAbsence === true) {
      variableAllowances += amt;
    } else {
      fixedAllowances += amt;
    }
  }
  const totalAllowances = fixedAllowances + variableAllowances;

  // الراتب الأساسي متغيّر (يُخصم بالغياب)
  const monthlyVariable = basicSalary + variableAllowances;
  const monthlyFixed = fixedAllowances;
  const monthlyTotal = monthlyVariable + monthlyFixed;

  const r = (n) => Math.round(n * 100) / 100;
  return {
    basicSalary: r(basicSalary),
    dailySalary: r(dailySalary),
    hourlySalary: r(hourlySalary),
    overtimeHourlyRate: r(overtimeHourlyRate),
    totalAllowances: r(totalAllowances),
    fixedAllowances: r(fixedAllowances),
    variableAllowances: r(variableAllowances),
    monthlyVariable: r(monthlyVariable),
    monthlyFixed: r(monthlyFixed),
    monthlyTotal: r(monthlyTotal),
  };
}

// ===== التكلفة الشهرية الكاملة (تجمع الطبقات) =====
// تُستخدم لحساب التكلفة الإدارية وفي الربحية لاحقًا
// تشمل: الأساسية (راتب+بدلات) + الحكومية المُطفأة + نصيب الشركة من التأمينات
function computeWorkerMonthlyCost(costBase) {
  const base = computeWorkerBaseCost(costBase);
  const gov = computeGovernmentCosts(costBase, costBase ? costBase.governmentCosts : null);
  const ins = computeSocialInsurance(costBase);

  // المكوّنات الشهرية
  const monthlyBase = base.monthlyTotal;                    // راتب + بدلات
  const monthlyGov = gov.monthlyAmortized || 0;            // الحكومية المُطفأة (السنة 1 كأساس)
  const monthlyInsCompany = ins.companyAmount || 0;        // نصيب الشركة من التأمينات

  const monthlyTotal = monthlyBase + monthlyGov + monthlyInsCompany;

  const r = (n) => Math.round(n * 100) / 100;
  return {
    monthlyBase: r(monthlyBase),
    monthlyGov: r(monthlyGov),
    monthlyInsCompany: r(monthlyInsCompany),
    monthlyTotal: r(monthlyTotal),
    // تفاصيل إضافية للعرض
    monthlyVariable: base.monthlyVariable,   // متغيّر (راتب + بدلات متغيّرة)
    monthlyFixed: r(base.monthlyFixed + monthlyGov + monthlyInsCompany), // ثابت (بدلات ثابتة + حكومية + تأمينات)
    netSalary: ins.netSalary,
  };
}

function validatePermissions(permissions) {
  if (!Array.isArray(permissions)) return false;
  return permissions.every((p) => ALL_MODULES.includes(p));
}

function buildShiftDoc({
  tenantId, name, startTime, durationHours, breaks,
  recordLeadMinutes, approvalDeadlineHours, createdBy, createdAt,
}) {
  return {
    tenantId, name, startTime,
    durationHours: durationHours,
    breaks: Array.isArray(breaks) ? breaks : [],
    recordLeadMinutes: recordLeadMinutes || 60,
    approvalDeadlineHours: approvalDeadlineHours || 24,
    status: "active", createdBy, createdAt,
  };
}

function isValidTime(t) {
  if (typeof t !== "string") return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

function validateBreaks(breaks) {
  if (breaks === undefined || breaks === null) return true;
  if (!Array.isArray(breaks)) return false;
  return breaks.every(
    (b) => b && isValidTime(b.start) && typeof b.durationMinutes === "number" && b.durationMinutes > 0 && b.durationMinutes <= 480
  );
}

function buildScheduleDoc({
  tenantId, workerUid, supervisorUid, rotationShifts,
  rotationStartDate, weeklyOffDays, createdBy, createdAt,
}) {
  return {
    tenantId, workerUid,
    supervisorUid: supervisorUid || null,
    rotationShifts: Array.isArray(rotationShifts) ? rotationShifts : [],
    rotationStartDate: rotationStartDate || null,
    weeklyOffDays: Array.isArray(weeklyOffDays) ? weeklyOffDays : [],
    status: "active", createdBy, createdAt,
  };
}

function validateOffDays(days) {
  if (days === undefined || days === null) return true;
  if (!Array.isArray(days)) return false;
  return days.every((d) => WEEKDAYS.includes(d));
}

function isValidDate(d) {
  if (typeof d !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function buildShiftRecordDoc({
  tenantId, supervisorUid, shiftId, shiftName, date,
  entries, deadline, createdBy, createdAt,
}) {
  return {
    tenantId, type: "attendance", module: MODULES.ATTENDANCE,
    supervisorUid, shiftId, shiftName: shiftName || null, date,
    status: RECORD_STATUS.OPEN, deadline: deadline || null,
    entries: Array.isArray(entries) ? entries : [],
    createdBy, createdAt, finalizedAt: null,
  };
}

function buildEntry({ workerUid, workerName }) {
  return { workerUid, workerName: workerName || null, status: ENTRY_STATUS.PRESENT, note: null };
}

function buildExceptionDoc({
  tenantId, subjectUid, subjectName, supervisorUid, recordId,
  shiftId, date, exceptionType, supervisorNote, deadline, createdBy, createdAt,
}) {
  return {
    tenantId, subjectUid, subjectName: subjectName || null, supervisorUid,
    recordId: recordId || null, shiftId: shiftId || null, date,
    exceptionType: exceptionType, supervisorNote: supervisorNote || null,
    status: EXCEPTION_STATUS.PENDING_WORKER, deadline: deadline || null,
    workerResponse: null,
    escalationLevel: ESCALATION_LEVEL.SUPERVISOR,
    currentHandlerUid: supervisorUid || null,
    escalationHistory: [], resolution: null,
    createdBy, createdAt, resolvedAt: null,
  };
}

function buildEscalationEntry({ byUid, byName, action, note, toUid, at }) {
  return { byUid, byName: byName || null, action, note: note || null, toUid: toUid || null, at };
}

function buildSummaryDoc({
  tenantId, date, totalRecords, totalWorkers,
  presentCount, absentCount, lateCount,
  openRecords, finalizedRecords,
  pendingExceptions, objectedExceptions, updatedAt,
}) {
  return {
    tenantId, date,
    totalRecords: totalRecords || 0, totalWorkers: totalWorkers || 0,
    presentCount: presentCount || 0, absentCount: absentCount || 0, lateCount: lateCount || 0,
    openRecords: openRecords || 0, finalizedRecords: finalizedRecords || 0,
    pendingExceptions: pendingExceptions || 0, objectedExceptions: objectedExceptions || 0,
    updatedAt: updatedAt || null,
  };
}

function buildVendorDoc({
  tenantId, name, vendorCode, contactPerson, phone, email,
  taxNumber, address, paymentTerms, createdBy, createdAt,
}) {
  return {
    tenantId, name,
    vendorCode: vendorCode || null,
    contactPerson: contactPerson || null,
    phone: phone || null,
    email: email || null,
    taxNumber: taxNumber || null,
    address: address || null,
    paymentTerms: paymentTerms || null,
    status: "active",
    createdBy, createdAt,
  };
}

function buildTaxConfig({ vatApplicable, vatRate, exciseApplicable, exciseRate }) {
  return {
    vatApplicable: vatApplicable === true,
    vatRate: typeof vatRate === "number" && vatRate >= 0 ? vatRate : 15,
    exciseApplicable: exciseApplicable === true,
    exciseRate: typeof exciseRate === "number" && exciseRate >= 0 ? exciseRate : 0,
  };
}

function validateTaxConfig(tax) {
  if (!tax || typeof tax !== "object") return false;
  if (typeof tax.vatApplicable !== "boolean") return false;
  if (typeof tax.exciseApplicable !== "boolean") return false;
  const vr = Number(tax.vatRate);
  const er = Number(tax.exciseRate);
  if (!Number.isFinite(vr) || vr < 0 || vr > 100) return false;
  if (!Number.isFinite(er) || er < 0 || er > 1000) return false;
  return true;
}

function buildItemDoc({
  tenantId, name, itemCode, category, unit, dealTypes, description,
  preferredVendorId, estimatedCost, createdBy, createdAt,
}) {
  return {
    tenantId, name,
    itemCode: itemCode || null,
    category: category || null,
    unit: unit || null,
    dealTypes: Array.isArray(dealTypes) ? dealTypes : [],
    description: description || null,
    preferredVendorId: preferredVendorId || null,
    estimatedCost: typeof estimatedCost === "number" ? estimatedCost : null,
    approvedCost: null,
    costStatus: COST_STATUS.DRAFT,
    taxConfig: buildTaxConfig({ vatApplicable: false, vatRate: 15, exciseApplicable: false, exciseRate: 0 }),
    sellingPrice: null,
    rentalPrice: null,
    status: "active",
    createdBy,
    approvedBy: null,
    createdAt,
  };
}

function validateDealTypes(types) {
  if (!Array.isArray(types) || types.length === 0) return false;
  return types.every((t) => ALL_DEAL_TYPES.includes(t));
}

function buildAccountDoc({
  tenantId, code, name, type, subtype, parentId, isSystem, createdBy, createdAt,
}) {
  return {
    tenantId,
    code: code,
    name: name,
    type: type,
    subtype: subtype || null,
    normalSide: ACCOUNT_NORMAL_SIDE[type] || "debit",
    parentId: parentId || null,
    isSystem: isSystem === true,
    isActive: true,
    balance: 0,
    createdBy: createdBy || null,
    createdAt,
  };
}

function validateAccountType(type) {
  return ALL_ACCOUNT_TYPES.includes(type);
}

function buildJournalEntryDoc({
  tenantId, entryNumber, date, description, lines,
  totalDebit, totalCredit, source, sourceRef, status, createdBy, createdAt,
}) {
  return {
    tenantId,
    entryNumber: entryNumber || null,
    date: date,
    description: description || null,
    lines: Array.isArray(lines) ? lines : [],
    totalDebit: totalDebit || 0,
    totalCredit: totalCredit || 0,
    source: source || "manual",
    sourceRef: sourceRef || null,
    status: status || JOURNAL_STATUS.POSTED,
    createdBy: createdBy || null,
    createdAt,
    postedAt: null,
  };
}

function validateJournalLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) {
    return { valid: false, error: "القيد يحتاج طرفين على الأقل." };
  }
  let totalDebit = 0;
  let totalCredit = 0;
  const cleanLines = [];
  for (const ln of lines) {
    const debit = Number(ln.debit) || 0;
    const credit = Number(ln.credit) || 0;
    if (debit < 0 || credit < 0) {
      return { valid: false, error: "لا يجوز قيم سالبة في القيد." };
    }
    if (debit > 0 && credit > 0) {
      return { valid: false, error: "الطرف الواحد إمّا مدين أو دائن، لا الاثنين." };
    }
    if (debit === 0 && credit === 0) {
      return { valid: false, error: "كل طرف يجب أن يحمل قيمة مدينة أو دائنة." };
    }
    if (!ln.accountId) {
      return { valid: false, error: "كل طرف يجب أن يرتبط بحساب." };
    }
    totalDebit += debit;
    totalCredit += credit;
    cleanLines.push({
      accountId: ln.accountId,
      accountCode: ln.accountCode || null,
      accountName: ln.accountName || null,
      debit: debit,
      credit: credit,
      note: ln.note || null,
    });
  }
  const dr = Math.round(totalDebit * 100) / 100;
  const cr = Math.round(totalCredit * 100) / 100;
  if (dr !== cr) {
    return { valid: false, error: `القيد غير متوازن: المدين ${dr} ≠ الدائن ${cr}.` };
  }
  return { valid: true, totalDebit: dr, totalCredit: cr, cleanLines };
}

function buildCustomerDoc({
  tenantId, name, customerCode, taxNumber, crNumber,
  contactPerson, phone, email,
  buildingNumber, street, district, city, postalCode, additionalNumber,
  createdBy, createdAt,
}) {
  return {
    tenantId,
    name: name,
    customerCode: customerCode || null,
    taxNumber: taxNumber || null,
    crNumber: crNumber || null,
    contactPerson: contactPerson || null,
    phone: phone || null,
    email: email || null,
    address: {
      buildingNumber: buildingNumber || null,
      street: street || null,
      district: district || null,
      city: city || null,
      postalCode: postalCode || null,
      additionalNumber: additionalNumber || null,
    },
    status: "active",
    createdBy: createdBy || null,
    createdAt,
  };
}

function computeInvoiceTotals(rawLines) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return { valid: false, error: "الفاتورة تحتاج بندًا واحدًا على الأقل." };
  }

  const lines = [];
  let subtotal = 0;
  let totalExcise = 0;
  let totalVat = 0;

  for (const ln of rawLines) {
    const description = typeof ln.description === "string" ? ln.description.trim() : "";
    const quantity = Number(ln.quantity);
    const unitPrice = Number(ln.unitPrice);

    if (description.length < 1) {
      return { valid: false, error: "كل بند يجب أن يحمل وصفًا." };
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { valid: false, error: `كمية غير صحيحة في البند «${description}».` };
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { valid: false, error: `سعر غير صحيح في البند «${description}».` };
    }

    const vatApplicable = ln.vatApplicable === true;
    const exciseApplicable = ln.exciseApplicable === true;
    const vatRate = vatApplicable ? Number(ln.vatRate) : 0;
    const exciseRate = exciseApplicable ? Number(ln.exciseRate) : 0;

    if (vatApplicable && (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100)) {
      return { valid: false, error: `نسبة قيمة مضافة غير صحيحة في البند «${description}».` };
    }
    if (exciseApplicable && (!Number.isFinite(exciseRate) || exciseRate < 0 || exciseRate > 1000)) {
      return { valid: false, error: `نسبة انتقائية غير صحيحة في البند «${description}».` };
    }

    const base = quantity * unitPrice;
    const exciseAmount = exciseApplicable ? base * (exciseRate / 100) : 0;
    const vatBase = base + exciseAmount;
    const vatAmount = vatApplicable ? vatBase * (vatRate / 100) : 0;
    const lineTotal = base + exciseAmount + vatAmount;

    const r = (n) => Math.round(n * 100) / 100;

    lines.push({
      description: description,
      itemId: ln.itemId || null,
      quantity: quantity,
      unitPrice: r(unitPrice),
      base: r(base),
      vatApplicable: vatApplicable,
      vatRate: vatRate,
      vatAmount: r(vatAmount),
      exciseApplicable: exciseApplicable,
      exciseRate: exciseRate,
      exciseAmount: r(exciseAmount),
      lineTotal: r(lineTotal),
    });

    subtotal += base;
    totalExcise += exciseAmount;
    totalVat += vatAmount;
  }

  const r = (n) => Math.round(n * 100) / 100;
  const total = subtotal + totalExcise + totalVat;

  return {
    valid: true,
    lines: lines,
    subtotal: r(subtotal),
    totalExcise: r(totalExcise),
    totalVat: r(totalVat),
    total: r(total),
  };
}

function buildInvoiceDoc({
  tenantId, invoiceNumber, uuid, date, customerId, customerSnapshot,
  revenueAccountId, lines, subtotal, totalExcise, totalVat, total,
  journalEntryId, notes, createdBy, createdAt,
}) {
  return {
    tenantId,
    invoiceNumber: invoiceNumber || null,
    uuid: uuid || null,
    date: date,
    invoiceType: "standard",
    customerId: customerId || null,
    customerSnapshot: customerSnapshot || null,
    revenueAccountId: revenueAccountId || null,
    lines: Array.isArray(lines) ? lines : [],
    subtotal: subtotal || 0,
    totalExcise: totalExcise || 0,
    totalVat: totalVat || 0,
    total: total || 0,
    status: INVOICE_STATUS.ISSUED,
    journalEntryId: journalEntryId || null,
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// سند قبض: تحصيل دفعة (كاملة أو جزئية) على فاتورة آجلة
function buildReceiptDoc({
  tenantId, receiptNumber, date, invoiceId, invoiceNumber,
  customerId, customerSnapshot, amount, method,
  journalEntryId, notes, createdBy, createdAt,
}) {
  return {
    tenantId,
    receiptNumber: receiptNumber || null,
    date: date,
    invoiceId: invoiceId || null,
    invoiceNumber: invoiceNumber || null,
    customerId: customerId || null,
    customerSnapshot: customerSnapshot || null,
    amount: amount || 0,
    method: method || "cash",
    journalEntryId: journalEntryId || null,
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// سجل إقفال محاسبي لفترة: يقفل الإيرادات والمصروفات ويرحّل الصافي للأرباح المُبقاة
function buildClosingDoc({
  tenantId, closingNumber, fromDate, toDate,
  totalRevenue, totalExpense, netIncome,
  journalEntryId, linesSnapshot, status, createdBy, createdAt,
}) {
  return {
    tenantId,
    closingNumber: closingNumber || null,
    fromDate: fromDate,
    toDate: toDate,
    totalRevenue: totalRevenue || 0,
    totalExpense: totalExpense || 0,
    netIncome: netIncome || 0,
    journalEntryId: journalEntryId || null,
    linesSnapshot: Array.isArray(linesSnapshot) ? linesSnapshot : [],
    status: status || "closed",
    reversedJournalEntryId: null,
    reversedAt: null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// سند صرف: مصروف نقدي (مدين مصروف / دائن خزينة)
function buildPaymentDoc({
  tenantId, paymentNumber, date, expenseAccountId, expenseAccountCode, expenseAccountName,
  amount, method, beneficiary, journalEntryId, notes, createdBy, createdAt,
}) {
  return {
    tenantId,
    paymentNumber: paymentNumber || null,
    date: date,
    expenseAccountId: expenseAccountId || null,
    expenseAccountCode: expenseAccountCode || null,
    expenseAccountName: expenseAccountName || null,
    amount: amount || 0,
    method: method || "cash",
    beneficiary: beneficiary || null,
    journalEntryId: journalEntryId || null,
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// ملف الموارد البشرية للموظف (منفصل عن حساب الدخول في users)
function buildEmployeeProfileDoc({
  tenantId, employeeCode, name, nationality, phone, birthDate, gender,
  iqamaNumber, iqamaExpiry, passportNumber, passportExpiry,
  workPermitNumber, workPermitExpiry, healthCertNumber, healthCertExpiry,
  insuranceNumber, insuranceExpiry,
  jobTitle, department, hireDate, contractType, contractExpiry,
  basicSalary, housingAllowance, transportAllowance, otherAllowance,
  governmentFees, otHourlyRate, defaultTargetProfit,
  linkedUserId, status, notes, createdBy, createdAt,
}) {
  const basic = Number(basicSalary) || 0;
  const housing = Number(housingAllowance) || 0;
  const transport = Number(transportAllowance) || 0;
  const other = Number(otherAllowance) || 0;
  return {
    tenantId,
    employeeCode: employeeCode || null,
    name: name,
    nationality: nationality || null,
    phone: phone || null,
    birthDate: birthDate || null,
    gender: gender || null,
    documents: {
      iqama: { number: iqamaNumber || null, expiry: iqamaExpiry || null },
      passport: { number: passportNumber || null, expiry: passportExpiry || null },
      workPermit: { number: workPermitNumber || null, expiry: workPermitExpiry || null },
      healthCert: { number: healthCertNumber || null, expiry: healthCertExpiry || null },
      insurance: { number: insuranceNumber || null, expiry: insuranceExpiry || null },
    },
    job: {
      title: jobTitle || null,
      department: department || null,
      hireDate: hireDate || null,
      contractType: contractType || null,
      contractExpiry: contractExpiry || null,
    },
    salary: {
      basic: basic,
      housing: housing,
      transport: transport,
      other: other,
      total: basic + housing + transport + other,
    },
    // مكوّنات التكلفة التشغيلية (لتوزيع التكاليف و Overtime في العمليات)
    costing: {
      governmentFees: Number(governmentFees) || 0,   // رسوم حكومية + إدارية شهرية (تتشارك بين المشاريع)
      otHourlyRate: Number(otHourlyRate) || 0,        // معدل ساعة الـ Overtime
      defaultTargetProfit: Number(defaultTargetProfit) || 0, // ربح مستهدف افتراضي يُقترح عند الإسناد
    },
    linkedUserId: linkedUserId || null,
    status: status || "active",
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// مسير رواتب شهري: يجمع الموظفين، يحسب صافي كل واحد، ويُربط بقيد محاسبي
function buildPayrollRunDoc({
  tenantId, payrollNumber, year, month, status, paymentMethod,
  lines, totalGross, totalDeductions, totalNet,
  journalEntryId, paymentJournalEntryId, createdBy, createdAt,
}) {
  return {
    tenantId,
    payrollNumber: payrollNumber || null,
    year: year,
    month: month,
    period: `${year}-${String(month).padStart(2, "0")}`,
    status: status || "draft", // draft | approved | paid
    paymentMethod: paymentMethod || null, // cash | accrued
    lines: Array.isArray(lines) ? lines : [],
    totalGross: totalGross || 0,
    totalDeductions: totalDeductions || 0,
    totalNet: totalNet || 0,
    journalEntryId: journalEntryId || null,
    paymentJournalEntryId: paymentJournalEntryId || null,
    approvedBy: null,
    approvedAt: null,
    paidBy: null,
    paidAt: null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// شاغر وظيفي
function buildVacancyDoc({
  tenantId, vacancyNumber, title, department, count, employmentType,
  description, salaryMin, salaryMax, status, createdBy, createdAt,
}) {
  return {
    tenantId,
    vacancyNumber: vacancyNumber || null,
    title: title,
    department: department || null,
    count: typeof count === "number" && count > 0 ? count : 1,
    employmentType: employmentType || null,
    description: description || null,
    salaryMin: typeof salaryMin === "number" ? salaryMin : null,
    salaryMax: typeof salaryMax === "number" ? salaryMax : null,
    status: status || "open", // open | closed
    createdBy: createdBy || null,
    createdAt,
  };
}

// متقدم على شاغر
function buildApplicantDoc({
  tenantId, vacancyId, vacancyTitle, name, phone, email, nationality,
  source, stage, rating, notes, linkedEmployeeId, createdBy, createdAt,
}) {
  return {
    tenantId,
    vacancyId: vacancyId || null,
    vacancyTitle: vacancyTitle || null,
    name: name,
    phone: phone || null,
    email: email || null,
    nationality: nationality || null,
    source: source || null,
    stage: stage || "new", // new | screening | interview | offer | hired | rejected
    rating: typeof rating === "number" ? rating : null,
    notes: notes || null,
    linkedEmployeeId: linkedEmployeeId || null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// برنامج تدريبي
function buildTrainingProgramDoc({
  tenantId, programNumber, title, category, provider, description,
  startDate, endDate, durationHours, mode, cost, status, createdBy, createdAt,
}) {
  return {
    tenantId,
    programNumber: programNumber || null,
    title: title,
    category: category || null,
    provider: provider || null,
    description: description || null,
    startDate: startDate || null,
    endDate: endDate || null,
    durationHours: typeof durationHours === "number" ? durationHours : null,
    mode: mode || null, // onsite | online
    cost: typeof cost === "number" ? cost : null,
    status: status || "planned", // planned | active | completed | cancelled
    createdBy: createdBy || null,
    createdAt,
  };
}

// تسجيل موظف في برنامج تدريبي
function buildEnrollmentDoc({
  tenantId, programId, programTitle, employeeId, employeeName, employeeCode,
  status, enrolledDate, completedDate, score,
  certificateNumber, certificateIssueDate, createdBy, createdAt,
}) {
  return {
    tenantId,
    programId: programId,
    programTitle: programTitle || null,
    employeeId: employeeId,
    employeeName: employeeName || null,
    employeeCode: employeeCode || null,
    status: status || "registered", // registered | attending | completed | dropped
    enrolledDate: enrolledDate || null,
    completedDate: completedDate || null,
    score: typeof score === "number" ? score : null,
    certificateNumber: certificateNumber || null,
    certificateIssueDate: certificateIssueDate || null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// طلب إجازة
function buildLeaveRequestDoc({
  tenantId, employeeId, employeeName, employeeCode, type,
  startDate, endDate, days, reason, status, createdBy, createdAt,
}) {
  return {
    tenantId,
    employeeId: employeeId,
    employeeName: employeeName || null,
    employeeCode: employeeCode || null,
    type: type || "annual", // annual | sick | unpaid | emergency | other
    startDate: startDate || null,
    endDate: endDate || null,
    days: typeof days === "number" ? days : 0,
    reason: reason || null,
    status: status || "pending", // pending | approved | rejected
    reviewedBy: null,
    reviewedAt: null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// جزاء/مخالفة
function buildPenaltyDoc({
  tenantId, penaltyNumber, employeeId, employeeName, employeeCode,
  type, date, amount, reason, createdBy, createdAt,
}) {
  return {
    tenantId,
    penaltyNumber: penaltyNumber || null,
    employeeId: employeeId,
    employeeName: employeeName || null,
    employeeCode: employeeCode || null,
    type: type || "warning", // warning | deduction | suspension | other
    date: date || null,
    amount: typeof amount === "number" ? amount : null,
    reason: reason || null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// تقييم أداء
function buildEvaluationDoc({
  tenantId, employeeId, employeeName, employeeCode, period, date,
  criteria, overallScore, strengths, improvements, notes, createdBy, createdAt,
}) {
  return {
    tenantId,
    employeeId: employeeId,
    employeeName: employeeName || null,
    employeeCode: employeeCode || null,
    period: period || null,
    date: date || null,
    criteria: criteria && typeof criteria === "object" ? criteria : {},
    overallScore: typeof overallScore === "number" ? overallScore : 0,
    strengths: strengths || null,
    improvements: improvements || null,
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// إسناد موظف لمشروع (موحّد — يربط ملف الموظف مباشرة بدل حساب user)
function buildEmployeeAssignmentDoc({
  tenantId, assignmentNumber, employeeId, employeeName, employeeCode, employeeJobTitle,
  projectId, projectName, projectNumber,
  rentalPrice, rentalPeriod, monthlyCost,
  hoursPerDay, daysPerWeek, monthlyHours, targetProfit,
  startDate, endDate, status, notes, createdBy, createdAt,
}) {
  return {
    tenantId,
    assignmentNumber: assignmentNumber || null,
    employeeId: employeeId,
    employeeName: employeeName || null,
    employeeCode: employeeCode || null,
    employeeJobTitle: employeeJobTitle || null,
    projectId: projectId,
    projectName: projectName || null,
    projectNumber: projectNumber || null,
    rentalPrice: Number(rentalPrice) || 0,
    rentalPeriod: rentalPeriod === "daily" ? "daily" : "monthly",
    monthlyCost: Number(monthlyCost) || 0,
    // ساعات العمل (لحساب Overtime على أساس شهري)
    hoursPerDay: Number(hoursPerDay) || 0,
    daysPerWeek: Number(daysPerWeek) || 0,
    monthlyHours: Number(monthlyHours) || 0,
    targetProfit: Number(targetProfit) || 0, // الربح المستهدف لهذا المشروع (ثابت — لا يُقسّم)
    startDate: startDate || null,
    endDate: endDate || null,
    status: status || "active", // active | ended | removed
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// إسناد أصل/مرفق لمشروع (تكامل مع قسم الأصول)
function buildAssetAssignmentDoc({
  tenantId, assignmentNumber, assetId, assetName, assetCode, assetType, assetTypeName,
  projectId, projectName, projectNumber,
  rentalPrice, rentalPeriod, monthlyCost,
  startDate, endDate, status, notes, createdBy, createdAt,
}) {
  return {
    tenantId,
    assignmentNumber: assignmentNumber || null,
    assetId: assetId,
    assetName: assetName || null,
    assetCode: assetCode || null,
    assetType: assetType || null,
    assetTypeName: assetTypeName || null,
    projectId: projectId,
    projectName: projectName || null,
    projectNumber: projectNumber || null,
    rentalPrice: Number(rentalPrice) || 0,    // الإيراد من العميل
    rentalPeriod: rentalPeriod === "daily" ? "daily" : "monthly",
    monthlyCost: Number(monthlyCost) || 0,    // تكلفة الأصل الشهرية (تتوزّع لو مشترك)
    startDate: startDate || null,
    endDate: endDate || null,
    status: status || "active", // active | ended | removed
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// تخصيص مادة/صنف لمشروع (تكامل مع المشتريات) — استهلاك بكمية (لا توزيع)
function buildMaterialAllocationDoc({
  tenantId, allocationNumber, itemId, itemName, itemCode, unit,
  projectId, projectName, projectNumber,
  quantity, unitCost, totalCost, unitSellPrice, totalSell,
  status, notes, createdBy, createdAt,
}) {
  const qty = Number(quantity) || 0;
  const uCost = Number(unitCost) || 0;
  const uSell = Number(unitSellPrice) || 0;
  return {
    tenantId,
    allocationNumber: allocationNumber || null,
    itemId: itemId,
    itemName: itemName || null,
    itemCode: itemCode || null,
    unit: unit || null,
    projectId: projectId,
    projectName: projectName || null,
    projectNumber: projectNumber || null,
    quantity: qty,
    unitCost: uCost,
    totalCost: typeof totalCost === "number" ? totalCost : Math.round(qty * uCost * 100) / 100,
    unitSellPrice: uSell,
    totalSell: typeof totalSell === "number" ? totalSell : Math.round(qty * uSell * 100) / 100,
    status: status || "active", // active | removed
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// ===== العمليات التشغيلية: مهمة =====
function buildOperationTaskDoc({
  tenantId, taskNumber, projectId, projectName, projectNumber,
  title, description, assigneeId, assigneeName, priority, status, dueDate,
  createdBy, createdAt,
}) {
  return {
    tenantId,
    taskNumber: taskNumber || null,
    projectId: projectId,
    projectName: projectName || null,
    projectNumber: projectNumber || null,
    title: title,
    description: description || null,
    assigneeId: assigneeId || null,
    assigneeName: assigneeName || null,
    priority: priority || "normal", // low | normal | high | urgent
    status: status || "todo",       // todo | in_progress | done | cancelled
    dueDate: dueDate || null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// ===== العمليات التشغيلية: مرحلة (جدولة زمنية) =====
function buildMilestoneDoc({
  tenantId, milestoneNumber, projectId, projectName, projectNumber,
  title, description, startDate, endDate, progress, status,
  createdBy, createdAt,
}) {
  let p = Number(progress);
  if (!Number.isFinite(p) || p < 0) p = 0;
  if (p > 100) p = 100;
  return {
    tenantId,
    milestoneNumber: milestoneNumber || null,
    projectId: projectId,
    projectName: projectName || null,
    projectNumber: projectNumber || null,
    title: title,
    description: description || null,
    startDate: startDate || null,
    endDate: endDate || null,
    progress: p,
    status: status || "planned", // planned | in_progress | completed | delayed
    createdBy: createdBy || null,
    createdAt,
  };
}

// ===== العمليات التشغيلية: فحص جودة =====
function buildInspectionDoc({
  tenantId, inspectionNumber, projectId, projectName, projectNumber,
  title, inspectionDate, result, inspectorName, findings, notes,
  createdBy, createdAt,
}) {
  return {
    tenantId,
    inspectionNumber: inspectionNumber || null,
    projectId: projectId,
    projectName: projectName || null,
    projectNumber: projectNumber || null,
    title: title,
    inspectionDate: inspectionDate || null,
    result: result || "pass", // pass | fail | conditional
    inspectorName: inspectorName || null,
    findings: findings || null,
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt,
  };
}

// ===== موازنة المشروع المخطّطة (مفصّلة لكل بند) =====
function buildBudgetDoc({
  tenantId, projectId, budgetPeople, budgetFacilities, budgetMaterials, targetRevenue,
  updatedBy, updatedAt,
}) {
  return {
    tenantId,
    projectId: projectId,
    budgetPeople: Number(budgetPeople) || 0,        // ميزانية الأفراد
    budgetFacilities: Number(budgetFacilities) || 0, // ميزانية المرافق
    budgetMaterials: Number(budgetMaterials) || 0,   // ميزانية المواد
    targetRevenue: Number(targetRevenue) || 0,       // الإيراد المستهدف
    updatedBy: updatedBy || null,
    updatedAt,
  };
}

function buildProjectTypeDoc({ tenantId, name, code, description, isSystem, createdBy, createdAt }) {
  return {
    tenantId,
    name: name,
    code: code || null,
    description: description || null,
    isSystem: isSystem === true,
    isActive: true,
    createdBy: createdBy || null,
    createdAt,
  };
}

function buildProjectDoc({
  tenantId, projectNumber, name, customerId, customerName,
  typeIds, typeNames, contractNumber, city, location,
  startDate, endDate, status, description, createdBy, createdAt,
}) {
  return {
    tenantId,
    projectNumber: projectNumber || null,
    name: name,
    customerId: customerId || null,
    customerName: customerName || null,
    typeIds: Array.isArray(typeIds) ? typeIds : [],
    typeNames: Array.isArray(typeNames) ? typeNames : [],
    contractNumber: contractNumber || null,
    city: city || null,
    location: location || null,
    startDate: startDate || null,
    endDate: endDate || null,
    status: status || PROJECT_STATUS.PLANNED,
    description: description || null,
    createdBy: createdBy || null,
    createdAt,
    updatedAt: createdAt,
  };
}

function validateProjectStatus(status) {
  return Object.values(PROJECT_STATUS).includes(status);
}

function buildJobTitleDoc({ tenantId, name, description, createdBy, createdAt }) {
  return {
    tenantId,
    name: name,
    description: description || null,
    isActive: true,
    createdBy: createdBy || null,
    createdAt,
  };
}

function buildResourceRequestDoc({
  tenantId, requestNumber, projectId, projectName, projectNumber,
  resourceType, jobTitleId, jobTitleName, quantity,
  shiftId, shiftName, city, specifications,
  startDate, endDate, priority, status, createdBy, createdAt,
}) {
  return {
    tenantId,
    requestNumber: requestNumber || null,
    projectId: projectId || null,
    projectName: projectName || null,
    projectNumber: projectNumber || null,
    resourceType: resourceType || RESOURCE_TYPES.LABOR,
    jobTitleId: jobTitleId || null,
    jobTitleName: jobTitleName || null,
    quantity: Number(quantity) || 0,
    shiftId: shiftId || null,
    shiftName: shiftName || null,
    city: city || null,
    specifications: specifications || null,
    startDate: startDate || null,
    endDate: endDate || null,
    priority: priority || REQUEST_PRIORITY.NORMAL,
    status: status || REQUEST_STATUS.PENDING,
    fulfilledQuantity: 0,
    createdBy: createdBy || null,
    createdAt,
    updatedAt: createdAt,
  };
}

function validateRequestStatus(status) {
  return Object.values(REQUEST_STATUS).includes(status);
}

function buildWorkerAssignmentDoc({
  tenantId, assignmentNumber, workerUid, workerName, workerJobTitle,
  projectId, projectName, projectNumber, requestId, requestNumber,
  rentalPrice, rentalPeriod, shiftId, shiftName, shiftStartTime, shiftDurationHours,
  startDate, endDate, status, notes, createdBy, createdAt,
}) {
  return {
    tenantId,
    assignmentNumber: assignmentNumber || null,
    workerUid: workerUid || null,
    workerName: workerName || null,
    workerJobTitle: workerJobTitle || null,
    projectId: projectId || null,
    projectName: projectName || null,
    projectNumber: projectNumber || null,
    requestId: requestId || null,
    requestNumber: requestNumber || null,
    rentalPrice: Number(rentalPrice) || 0,
    rentalPeriod: ALL_COST_PERIODS.includes(rentalPeriod) ? rentalPeriod : COST_PERIODS.DAILY,
    shiftId: shiftId || null,
    shiftName: shiftName || null,
    shiftStartTime: shiftStartTime || null,
    shiftDurationHours: shiftDurationHours != null ? Number(shiftDurationHours) : null,
    startDate: startDate || null,
    endDate: endDate || null,
    status: status || ASSIGNMENT_STATUS.ACTIVE,
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt,
    updatedAt: createdAt,
    endedAt: null,
  };
}

function validateAssignmentStatus(status) {
  return Object.values(ASSIGNMENT_STATUS).includes(status);
}

function timeToMinutes(t) {
  if (!isValidTime(t)) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function shiftWindow(startTime, durationHours) {
  const start = timeToMinutes(startTime);
  if (start === null) return null;
  const dur = Number(durationHours);
  if (!Number.isFinite(dur) || dur <= 0) return null;
  const end = start + dur * 60;
  return { start, end };
}

function shiftsOverlap(startA, durA, startB, durB) {
  const a = shiftWindow(startA, durA);
  const b = shiftWindow(startB, durB);
  if (!a || !b) return false;

  const segs = (w) => {
    if (w.end <= 1440) return [[w.start, w.end]];
    return [[w.start, 1440], [0, w.end - 1440]];
  };
  const segsA = segs(a);
  const segsB = segs(b);
  for (const [s1, e1] of segsA) {
    for (const [s2, e2] of segsB) {
      if (s1 < e2 && s2 < e1) return true;
    }
  }
  return false;
}

function dateRangesOverlap(startA, endA, startB, endB) {
  const sA = startA || "0000-00-00";
  const eA = endA || "9999-12-31";
  const sB = startB || "0000-00-00";
  const eB = endB || "9999-12-31";
  return sA <= eB && sB <= eA;
}

// ═══════════════════════════════════════════════════════════════
// ===== قسم الأصول (سكن/مركبات/معدات) + مصاريفها =====
// ═══════════════════════════════════════════════════════════════
// الأصل: مرفق مشترك (سكن، سيارة...) له سعة ومستفيدون.
// تكلفته الشهرية = إيجار/قسط ثابت + فواتير متغيّرة (كهرباء/صيانة...) تُسجّل عليه.
// تُوزّع على مستفيديه فقط (نصيب العامل = تكلفة الأصل ÷ عدد مستفيديه).

const ASSET_TYPES = {
  HOUSING: "housing",     // سكن
  VEHICLE: "vehicle",     // مركبة
  EQUIPMENT: "equipment", // معدة
  SIMPLE: "simple",       // أصول بسيطة (تلفاز، تكييف، أثاث، أسرّة)
  OTHER: "other",         // أخرى (نوع مخصّص)
};
const ALL_ASSET_TYPES = Object.values(ASSET_TYPES);

// نوع الملكية وطريقة السداد
const ASSET_OWNERSHIP = { OWNED: "owned", RENTED: "rented" };
const ALL_ASSET_OWNERSHIP = Object.values(ASSET_OWNERSHIP);
const ASSET_PAYMENT = { CASH: "cash", FINANCED: "financed" };
const ALL_ASSET_PAYMENT = Object.values(ASSET_PAYMENT);

// حاسبة التمويل (طريقة القسط الثابت — مطابقة لأنظمة البنوك/ساما)
// تحسب القسط الشهري والإجمالي من قيمة السلعة + الضريبة + الدفعة المقدمة + المدة + APR
function computeFinancing({ itemValue, taxAmount, downPayment, financeMonths, apr }) {
  const value = Number(itemValue) || 0;
  const tax = Number(taxAmount) || 0;
  const down = Number(downPayment) || 0;
  const n = Math.round(Number(financeMonths) || 0);
  const rate = Number(apr) || 0;
  const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

  const totalWithTax = round2(value + tax);
  const financedAmount = round2(Math.max(0, totalWithTax - down)); // المبلغ الممول
  let monthlyInstallment = 0, totalPayments = 0, totalInterest = 0;
  if (n > 0) {
    const r = rate / 100 / 12; // معدل شهري
    if (r > 0) {
      monthlyInstallment = financedAmount * r / (1 - Math.pow(1 + r, -n));
    } else {
      monthlyInstallment = financedAmount / n;
    }
    monthlyInstallment = round2(monthlyInstallment);
    totalPayments = round2(monthlyInstallment * n);
    totalInterest = round2(totalPayments - financedAmount);
  }
  const grandTotal = round2(totalPayments + down); // الإجمالي المدفوع (أقساط + دفعة مقدمة)
  // نسبة التمويل (flat) التقريبية = الفائدة ÷ الممول ÷ السنوات
  const years = n / 12;
  const flatRate = financedAmount > 0 && years > 0 ? round2((totalInterest / financedAmount / years) * 100) : 0;

  return { totalWithTax, financedAmount, monthlyInstallment, totalPayments, totalInterest, grandTotal, flatRate };
}

const ASSET_STATUS = {
  ACTIVE: "active",       // فعّال (يُحتسب)
  INACTIVE: "inactive",   // معطّل
};
const ALL_ASSET_STATUS = Object.values(ASSET_STATUS);

// أنواع المصاريف الشائعة (مرنة — يمكن إضافة نوع مخصّص)
const ASSET_EXPENSE_TYPES = {
  ELECTRICITY: "electricity", // كهرباء
  WATER: "water",             // ماء
  MAINTENANCE: "maintenance", // صيانة
  FUEL: "fuel",               // وقود
  INSURANCE: "insurance",     // تأمين
  CLEANING: "cleaning",       // نظافة
  OTHER: "other",             // أخرى
};
const ALL_ASSET_EXPENSE_TYPES = Object.values(ASSET_EXPENSE_TYPES);

// بناء وثيقة أصل
function buildAssetDoc({
  tenantId, assetNumber, type, typeName, name, location,
  capacity, monthlyRent, status, notes, beneficiaries,
  ownership, paymentMethod,
  itemValue, taxAmount, downPayment, financeMonths, apr,
  usefulLifeYears, salvageValue, purchaseDate,
  supervisorName, custodianName,
  createdBy, createdAt,
}) {
  const own = ALL_ASSET_OWNERSHIP.includes(ownership) ? ownership : ASSET_OWNERSHIP.RENTED;
  const pay = ALL_ASSET_PAYMENT.includes(paymentMethod) ? paymentMethod : ASSET_PAYMENT.CASH;
  const isOwned = own === ASSET_OWNERSHIP.OWNED;
  const val = Number(itemValue) || 0;
  const tax = Number(taxAmount) || 0;
  // حساب التمويل (يُعاد حسابه دائمًا للدقة)
  const fin = isOwned && pay === ASSET_PAYMENT.FINANCED
    ? computeFinancing({ itemValue: val, taxAmount: tax, downPayment, financeMonths, apr })
    : null;

  return {
    tenantId: tenantId,
    assetNumber: Number(assetNumber) || 0,
    type: ALL_ASSET_TYPES.includes(type) ? type : ASSET_TYPES.OTHER,
    typeName: typeName || null,             // اسم النوع المخصّص عند "أخرى"
    name: (name || "").trim(),              // "سكن الدمام"، "هايلكس ٢٠٢٣"
    location: location || null,             // المدينة/الموقع
    capacity: Number(capacity) || 0,        // سعة الاستيعاب (كم مستفيد)
    monthlyRent: Number(monthlyRent) || 0,  // الإيجار الشهري (للمؤجّر)
    status: ALL_ASSET_STATUS.includes(status) ? status : ASSET_STATUS.ACTIVE,
    notes: notes || null,
    beneficiaries: Array.isArray(beneficiaries) ? beneficiaries.filter((x) => typeof x === "string") : [],

    // الملكية والسداد
    ownership: own,                          // owned | rented
    paymentMethod: isOwned ? pay : null,     // cash | financed (للمملوك)

    // حاسبة الشراء/التمويل (للمملوك)
    itemValue: val,                          // قيمة السلعة (قبل الضريبة)
    taxAmount: tax,                          // الضريبة
    totalWithTax: isOwned ? (Math.round((val + tax) * 100) / 100) : 0,
    downPayment: isOwned && pay === ASSET_PAYMENT.FINANCED ? (Number(downPayment) || 0) : 0,
    financeMonths: fin ? (Math.round(Number(financeMonths) || 0)) : 0,
    apr: fin ? (Number(apr) || 0) : 0,
    financedAmount: fin ? fin.financedAmount : 0,
    monthlyInstallment: fin ? fin.monthlyInstallment : 0,
    totalInterest: fin ? fin.totalInterest : 0,
    totalAmount: fin ? fin.grandTotal : (isOwned ? (Math.round((val + tax) * 100) / 100) : 0),
    flatRate: fin ? fin.flatRate : 0,

    // الإهلاك (للمملوك فقط) — على قيمة السلعة الأصلية بدون فوائد
    purchaseValue: isOwned ? val : 0,        // أساس الإهلاك = قيمة السلعة
    usefulLifeYears: isOwned ? (Number(usefulLifeYears) || 0) : 0,
    salvageValue: isOwned ? (Number(salvageValue) || 0) : 0,
    purchaseDate: isOwned ? (purchaseDate || null) : null,

    // الأشخاص المسؤولون
    supervisorName: supervisorName || null,  // المشرف المسؤول
    custodianName: custodianName || null,    // المستفيد الفعلي (تحت عهدته)

    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// بناء وثيقة مصروف على أصل (فاتورة لشهر محدّد)
function buildAssetExpenseDoc({
  tenantId, assetId, assetName, month, expenseType, expenseTypeName,
  amount, description, expenseDate, createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    assetId: assetId,
    assetName: assetName || null,
    month: month,  // YYYY-MM — الشهر الذي تُحتسب فيه التكلفة
    expenseType: ALL_ASSET_EXPENSE_TYPES.includes(expenseType) ? expenseType : ASSET_EXPENSE_TYPES.OTHER,
    expenseTypeName: expenseTypeName || null,  // اسم النوع المخصّص عند "أخرى"
    amount: Number(amount) || 0,
    description: description || null,
    expenseDate: expenseDate || null,  // تاريخ الفاتورة الفعلي (اختياري)
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// تكلفة الأصل الشهرية = الإيجار الثابت + مجموع الفواتير المتغيّرة للشهر
function computeAssetMonthlyCost(monthlyRent, expenses) {
  const r = (n) => Math.round(n * 100) / 100;
  const rent = Number(monthlyRent) || 0;
  const variable = (Array.isArray(expenses) ? expenses : []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return { rent: r(rent), variable: r(variable), total: r(rent + variable) };
}

// نصيب المستفيد الواحد = تكلفة الأصل ÷ عدد المستفيدين
function computeAssetSharePerBeneficiary(assetMonthlyTotal, beneficiaryCount) {
  const n = Number(beneficiaryCount) || 0;
  if (n <= 0) return 0;
  return Math.round(((Number(assetMonthlyTotal) || 0) / n) * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════
// ===== الموافقة المالية الشاملة على المشاريع =====
// ═══════════════════════════════════════════════════════════════
// المالية تراجع ربحية المشروع الكاملة (عمالة + أصول) وتعتمد/ترفض.
// على مستويين: شهري (ربحية شهر) + كامل المشروع (إجمالي الفترة).
// الرفض → حالة المشروع "قيد المراجعة" تعود للمشاريع، مخفية عن العمليات.

const FINANCE_APPROVAL_STATUS = {
  APPROVED: "approved",
  REJECTED: "rejected",
};
const ALL_FINANCE_APPROVAL_STATUS = Object.values(FINANCE_APPROVAL_STATUS);

const APPROVAL_SCOPE = {
  MONTH: "month",      // موافقة على ربحية شهر محدّد
  PROJECT: "project",  // موافقة على المشروع ككل
};
const ALL_APPROVAL_SCOPE = Object.values(APPROVAL_SCOPE);

function buildFinanceApprovalDoc({
  tenantId, projectId, projectName, scope, month,
  status, rejectionReason, snapshot, reviewedBy, reviewedAt,
}) {
  return {
    tenantId: tenantId,
    projectId: projectId,
    projectName: projectName || null,
    scope: scope === APPROVAL_SCOPE.PROJECT ? APPROVAL_SCOPE.PROJECT : APPROVAL_SCOPE.MONTH,
    month: scope === APPROVAL_SCOPE.PROJECT ? null : (month || null),  // YYYY-MM للشهري فقط
    status: ALL_FINANCE_APPROVAL_STATUS.includes(status) ? status : FINANCE_APPROVAL_STATUS.APPROVED,
    rejectionReason: rejectionReason || null,
    snapshot: snapshot || null,  // لقطة الربحية وقت المراجعة {revenue, cost, profit, margin}
    reviewedBy: reviewedBy || null,
    reviewedAt: reviewedAt,
  };
}

// ===== المبيعات: الصفقات (خط الأنابيب) =====
const DEAL_STAGES = {
  CONTACT: "contact",         // تواصل أولي
  PROPOSAL: "proposal",       // عرض
  NEGOTIATION: "negotiation", // تفاوض
  CLOSING: "closing",         // إغلاق
};
const ALL_DEAL_STAGES = Object.values(DEAL_STAGES);

const DEAL_STATUS = {
  ACTIVE: "active", // قيد العمل
  WON: "won",       // فوز (تحوّل لعقد)
  LOST: "lost",     // خسارة
};
const ALL_DEAL_STATUS = Object.values(DEAL_STATUS);

const DEAL_SOURCES = {
  REFERRAL: "referral",     // توصية
  WEBSITE: "website",       // الموقع
  CAMPAIGN: "campaign",     // حملة تسويقية
  COLD: "cold",             // تواصل بارد
  EXISTING: "existing",     // عميل حالي
  OTHER: "other",
};
const ALL_DEAL_SOURCES = Object.values(DEAL_SOURCES);

// بناء وثيقة صفقة (عميل محتمل في خط الأنابيب)
function buildDealDoc({
  tenantId, dealNumber, name, customerName, contactPerson, contactPhone,
  value, stage, rep, source, expectedCloseDate, notes, status,
  createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    dealNumber: Number(dealNumber) || 0,
    name: (name || "").trim(),                  // "توريد عمالة — نيوم"
    customerName: customerName || null,         // اسم العميل/الشركة المحتملة
    contactPerson: contactPerson || null,       // الشخص المسؤول
    contactPhone: contactPhone || null,
    value: Number(value) || 0,                  // القيمة المتوقّعة
    stage: ALL_DEAL_STAGES.includes(stage) ? stage : DEAL_STAGES.CONTACT,
    rep: rep || null,                           // المندوب المسؤول
    source: ALL_DEAL_SOURCES.includes(source) ? source : DEAL_SOURCES.OTHER,
    expectedCloseDate: expectedCloseDate || null,
    notes: notes || null,
    status: ALL_DEAL_STATUS.includes(status) ? status : DEAL_STATUS.ACTIVE,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// ===== المبيعات: عروض الأسعار =====
const QUOTE_VAT_RATE = 15; // ضريبة القيمة المضافة القياسية

const QUOTE_STATUS = {
  DRAFT: "draft",       // مسودّة
  SENT: "sent",         // مُرسل للعميل
  ACCEPTED: "accepted", // مقبول
  REJECTED: "rejected", // مرفوض
  EXPIRED: "expired",   // منتهي الصلاحية
};
const ALL_QUOTE_STATUS = Object.values(QUOTE_STATUS);

// حساب إجماليات عرض السعر (مبلغ واحد + ضريبة 15%)
function computeQuoteTotals(amount, vatRate) {
  const base = Number(amount) || 0;
  const rate = Number.isFinite(Number(vatRate)) ? Number(vatRate) : QUOTE_VAT_RATE;
  const r = (n) => Math.round(n * 100) / 100;
  const vatAmount = r(base * (rate / 100));
  return { amount: r(base), vatRate: rate, vatAmount: vatAmount, totalWithVat: r(base + vatAmount) };
}

// بناء وثيقة عرض سعر (يصدر برقم تلقائي + طابع زمني)
function buildQuoteDoc({
  tenantId, quoteNumber, dealId, customerName, description,
  amount, vatRate, vatAmount, totalWithVat, validUntil, status, notes,
  issuedAt, createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    quoteNumber: Number(quoteNumber) || 0,     // الرقم التلقائي
    dealId: dealId || null,                     // مرتبط بصفقة (اختياري)
    customerName: (customerName || "").trim() || null,
    description: (description || "").trim(),     // الوصف العام للعرض
    amount: Number(amount) || 0,                // المبلغ قبل الضريبة
    vatRate: Number(vatRate) || 0,              // نسبة الضريبة
    vatAmount: Number(vatAmount) || 0,          // قيمة الضريبة
    totalWithVat: Number(totalWithVat) || 0,    // الإجمالي شامل الضريبة
    validUntil: validUntil || null,             // صالح حتى
    status: ALL_QUOTE_STATUS.includes(status) ? status : QUOTE_STATUS.DRAFT,
    notes: notes || null,
    issuedAt: issuedAt || null,                 // تاريخ ووقت الإصدار (serverTimestamp)
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// ===== التسويق: الحملات =====
const CAMPAIGN_STATUS = {
  PLANNED: "planned", // مخطّطة
  ACTIVE: "active",   // نشطة
  ENDED: "ended",     // منتهية
};
const ALL_CAMPAIGN_STATUS = Object.values(CAMPAIGN_STATUS);

// بناء وثيقة حملة تسويقية
function buildCampaignDoc({
  tenantId, campaignNumber, name, channel, status,
  budget, spent, leads, reach, startDate, endDate, notes,
  createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    campaignNumber: Number(campaignNumber) || 0,
    name: (name || "").trim(),
    channel: (channel || "").trim() || null,   // القناة: لينكدإن، جوجل، فعالية...
    status: ALL_CAMPAIGN_STATUS.includes(status) ? status : CAMPAIGN_STATUS.PLANNED,
    budget: Number(budget) || 0,               // الميزانية المخصّصة
    spent: Number(spent) || 0,                 // المصروف فعليًا
    leads: Number(leads) || 0,                 // عملاء محتملون مكتسبون
    reach: Number(reach) || 0,                 // الوصول
    startDate: startDate || null,
    endDate: endDate || null,
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// ═══════════════════════════════════════════════════════
// ===== خدمة العملاء و CRM =====
// ═══════════════════════════════════════════════════════

// --- التذاكر ---
const TICKET_CATEGORY = {
  COMPLAINT: "complaint",             // شكوى
  INQUIRY: "inquiry",                 // استفسار
  SERVICE_REQUEST: "service_request", // طلب خدمة
  TECHNICAL: "technical",             // دعم فني
  BILLING: "billing",                 // فوترة/مالي
  OTHER: "other",
};
const ALL_TICKET_CATEGORY = Object.values(TICKET_CATEGORY);

const TICKET_PRIORITY = {
  URGENT: "urgent", // عاجلة
  HIGH: "high",     // عالية
  MEDIUM: "medium", // متوسطة
  LOW: "low",       // منخفضة
};
const ALL_TICKET_PRIORITY = Object.values(TICKET_PRIORITY);

const TICKET_STATUS = {
  OPEN: "open",               // مفتوحة
  IN_PROGRESS: "in_progress", // قيد المعالجة
  PENDING: "pending",         // معلّقة (بانتظار العميل)
  RESOLVED: "resolved",       // محلولة
  CLOSED: "closed",           // مغلقة
};
const ALL_TICKET_STATUS = Object.values(TICKET_STATUS);

// بناء وثيقة تذكرة دعم
function buildTicketDoc({
  tenantId, ticketNumber, subject, customerName, contactPerson, contactPhone,
  category, priority, status, assignedTo, description, resolution, satisfaction,
  replies, createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    ticketNumber: Number(ticketNumber) || 0,
    subject: (subject || "").trim(),
    customerName: (customerName || "").trim() || null,
    contactPerson: contactPerson || null,
    contactPhone: contactPhone || null,
    category: ALL_TICKET_CATEGORY.includes(category) ? category : TICKET_CATEGORY.OTHER,
    priority: ALL_TICKET_PRIORITY.includes(priority) ? priority : TICKET_PRIORITY.MEDIUM,
    status: ALL_TICKET_STATUS.includes(status) ? status : TICKET_STATUS.OPEN,
    assignedTo: assignedTo || null,
    description: (description || "").trim() || null,
    resolution: resolution || null,
    satisfaction: satisfaction != null && Number.isFinite(Number(satisfaction)) ? Number(satisfaction) : null, // 1-5
    replies: Array.isArray(replies) ? replies : [],
    createdBy: createdBy || null,
    createdAt: createdAt,
    resolvedAt: null,
  };
}

// --- التفاعلات (سجل تواصل CRM) ---
const INTERACTION_TYPE = {
  CALL: "call",       // مكالمة
  MEETING: "meeting", // اجتماع
  EMAIL: "email",     // بريد
  VISIT: "visit",     // زيارة
  MESSAGE: "message", // رسالة
};
const ALL_INTERACTION_TYPE = Object.values(INTERACTION_TYPE);

// بناء وثيقة تفاعل مع عميل
function buildInteractionDoc({
  tenantId, type, customerName, contactPerson, subject, summary, outcome, date,
  createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    type: ALL_INTERACTION_TYPE.includes(type) ? type : INTERACTION_TYPE.CALL,
    customerName: (customerName || "").trim() || null,
    contactPerson: contactPerson || null,
    subject: (subject || "").trim() || null,
    summary: (summary || "").trim() || null,
    outcome: outcome || null,
    date: date || null,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// ═══════════════════════════════════════════════════════
// ===== القانونية والامتثال =====
// ═══════════════════════════════════════════════════════

// --- العقود ---
const CONTRACT_TYPE = {
  SUPPLY: "supply",   // توريد عمالة
  SERVICE: "service", // خدمة
  RENT: "rent",       // إيجار
  OTHER: "other",
};
const ALL_CONTRACT_TYPE = Object.values(CONTRACT_TYPE);

const CONTRACT_STATUS = {
  DRAFT: "draft",         // مسودّة
  ACTIVE: "active",       // نشط
  RENEWING: "renewing",   // قيد التجديد
  EXPIRED: "expired",     // منتهٍ
  CANCELLED: "cancelled", // ملغى
};
const ALL_CONTRACT_STATUS = Object.values(CONTRACT_STATUS);

// بناء وثيقة عقد
function buildContractDoc({
  tenantId, contractNumber, name, party, type, value,
  startDate, endDate, status, autoRenew, notes, createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    contractNumber: Number(contractNumber) || 0,
    name: (name || "").trim(),
    party: (party || "").trim() || null,       // الطرف الآخر
    type: ALL_CONTRACT_TYPE.includes(type) ? type : CONTRACT_TYPE.OTHER,
    value: Number(value) || 0,
    startDate: startDate || null,
    endDate: endDate || null,
    status: ALL_CONTRACT_STATUS.includes(status) ? status : CONTRACT_STATUS.DRAFT,
    autoRenew: !!autoRenew,
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// --- التراخيص (الامتثال) ---
// رقم الترخيص نصّي (يحتوي حروف/رموز) — ليس تسلسليًا
function buildLicenseDoc({
  tenantId, licenseNumber, name, authority, issueDate, endDate, notes,
  createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    licenseNumber: (licenseNumber || "").trim() || null,
    name: (name || "").trim(),
    authority: (authority || "").trim() || null, // الجهة المصدرة
    issueDate: issueDate || null,
    endDate: endDate || null,
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// --- المنازعات (القضايا) ---
const DISPUTE_TYPE = {
  LABOR: "labor",             // عمالية
  COMMERCIAL: "commercial",   // تجارية
  CONTRACTUAL: "contractual", // تعاقدية
  OTHER: "other",
};
const ALL_DISPUTE_TYPE = Object.values(DISPUTE_TYPE);

const DISPUTE_STATUS = {
  REVIEW: "review",         // قيد النظر
  SETTLEMENT: "settlement", // تسوية
  RULING: "ruling",         // حكم
  CLOSED: "closed",         // مغلقة
};
const ALL_DISPUTE_STATUS = Object.values(DISPUTE_STATUS);

const DISPUTE_OUTCOME = {
  WON: "won",         // كسب
  LOST: "lost",       // خسارة
  SETTLED: "settled", // تسوية ودّية
};
const ALL_DISPUTE_OUTCOME = Object.values(DISPUTE_OUTCOME);

// بناء وثيقة منازعة/قضية
function buildDisputeDoc({
  tenantId, disputeNumber, name, party, type, value, status, outcome,
  provision, notes, openDate, createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    disputeNumber: Number(disputeNumber) || 0,
    name: (name || "").trim(),
    party: (party || "").trim() || null,       // الطرف الآخر
    type: ALL_DISPUTE_TYPE.includes(type) ? type : DISPUTE_TYPE.OTHER,
    value: Number(value) || 0,                  // القيمة المعرّضة للخطر
    status: ALL_DISPUTE_STATUS.includes(status) ? status : DISPUTE_STATUS.REVIEW,
    outcome: ALL_DISPUTE_OUTCOME.includes(outcome) ? outcome : null, // للمغلقة
    provision: Number(provision) || 0,          // المخصّص القانوني
    notes: notes || null,
    openDate: openDate || null,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// ═══════════════════════════════════════════════════════
// ===== التميز والجودة: التدقيق الداخلي =====
// ═══════════════════════════════════════════════════════

// --- التدقيقات ---
const AUDIT_STATUS = {
  SCHEDULED: "scheduled", // مجدول
  ACTIVE: "active",       // جارٍ
  DONE: "done",           // مكتمل
};
const ALL_AUDIT_STATUS = Object.values(AUDIT_STATUS);

// بناء وثيقة تدقيق
function buildAuditDoc({
  tenantId, auditNumber, name, department, status, auditDate, auditor, scope, notes,
  createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    auditNumber: Number(auditNumber) || 0,
    name: (name || "").trim(),
    department: (department || "").trim() || null,
    status: ALL_AUDIT_STATUS.includes(status) ? status : AUDIT_STATUS.SCHEDULED,
    auditDate: auditDate || null,
    auditor: auditor || null,         // المدقّق
    scope: scope || null,             // نطاق التدقيق
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// --- الملاحظات (نتائج التدقيق) ---
const FINDING_SEVERITY = {
  HIGH: "high",     // عالية
  MEDIUM: "medium", // متوسطة
  LOW: "low",       // منخفضة
};
const ALL_FINDING_SEVERITY = Object.values(FINDING_SEVERITY);

const FINDING_STATUS = {
  OPEN: "open",         // مفتوحة
  PROGRESS: "progress", // قيد المعالجة
  RESOLVED: "resolved", // تمت معالجتها
};
const ALL_FINDING_STATUS = Object.values(FINDING_STATUS);

// بناء وثيقة ملاحظة تدقيق
function buildFindingDoc({
  tenantId, findingNumber, title, auditId, severity, status,
  correctiveAction, responsible, dueDate, notes, createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    findingNumber: Number(findingNumber) || 0,
    title: (title || "").trim(),
    auditId: auditId || null,                       // مرتبطة بتدقيق (اختياري)
    severity: ALL_FINDING_SEVERITY.includes(severity) ? severity : FINDING_SEVERITY.MEDIUM,
    status: ALL_FINDING_STATUS.includes(status) ? status : FINDING_STATUS.OPEN,
    correctiveAction: (correctiveAction || "").trim() || null, // الإجراء التصحيحي
    responsible: responsible || null,               // المسؤول عن المعالجة
    dueDate: dueDate || null,                       // تاريخ الاستحقاق
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// --- تقييمات رضا العملاء (NPS) ---
// score من 0 إلى 10 (مقياس NPS): 9-10 مروّج · 7-8 محايد · 0-6 منتقد
function buildRatingDoc({
  tenantId, customerName, score, comment, surveyName, date, createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    customerName: (customerName || "").trim() || null,
    score: Number(score),                       // 0-10
    comment: (comment || "").trim() || null,
    surveyName: (surveyName || "").trim() || null, // اسم الاستطلاع (اختياري)
    date: date || null,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// --- مبادرات تحسين العمليات ---
const IMPROVEMENT_STATUS = {
  PLANNED: "planned", // مخطّطة
  ACTIVE: "active",   // نشطة
  DONE: "done",       // مكتملة
};
const ALL_IMPROVEMENT_STATUS = Object.values(IMPROVEMENT_STATUS);

// بناء وثيقة مبادرة تحسين
function buildImprovementDoc({
  tenantId, improvementNumber, name, department, progress, status, savings,
  timeSavedHours, beforeMetric, afterMetric, notes, createdBy, createdAt,
}) {
  let prog = Number(progress) || 0;
  if (prog < 0) prog = 0; if (prog > 100) prog = 100;
  return {
    tenantId: tenantId,
    improvementNumber: Number(improvementNumber) || 0,
    name: (name || "").trim(),
    department: (department || "").trim() || null,
    progress: Math.round(prog),                  // 0-100
    status: ALL_IMPROVEMENT_STATUS.includes(status) ? status : IMPROVEMENT_STATUS.ACTIVE,
    savings: Number(savings) || 0,               // الوفورات (ر.س)
    timeSavedHours: Number(timeSavedHours) || 0, // الوقت الموفّر (ساعات)
    beforeMetric: (beforeMetric || "").trim() || null, // المؤشر قبل
    afterMetric: (afterMetric || "").trim() || null,   // المؤشر بعد
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// ═══════════════════════════════════════════════════════
// ===== المخزون ونقاط البيع =====
// ═══════════════════════════════════════════════════════

// --- الأصناف (منتجات/خدمات) ---
// المنتج له مخزون (quantity) يُخصم عند البيع. الخدمة (isService) لا تُخصم.
function buildProductDoc({
  tenantId, productNumber, sku, name, category, unit, salePrice, cost,
  quantity, minQuantity, isService, active, notes, createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    productNumber: Number(productNumber) || 0,
    sku: (sku || "").trim() || null,            // رمز الصنف (باركود اختياري)
    name: (name || "").trim(),
    category: (category || "").trim() || null,
    unit: (unit || "").trim() || "قطعة",
    salePrice: Number(salePrice) || 0,          // سعر البيع
    cost: Number(cost) || 0,                    // التكلفة
    quantity: Number(quantity) || 0,            // الكمية الحالية
    minQuantity: Number(minQuantity) || 0,      // حد التنبيه
    isService: !!isService,                     // خدمة (بدون مخزون)
    active: active !== false,
    notes: notes || null,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// --- حركة المخزون ---
const STOCK_MOVEMENT_TYPE = {
  IN: "in",         // وارد (شراء/إضافة)
  OUT: "out",       // صادر (بيع/صرف)
  ADJUST: "adjust", // تسوية جرد
};
const ALL_STOCK_MOVEMENT_TYPE = Object.values(STOCK_MOVEMENT_TYPE);

function buildStockMovementDoc({
  tenantId, productId, productName, type, quantity, balanceAfter,
  reason, source, note, createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    productId: productId,
    productName: productName || null,           // لقطة من الاسم
    type: ALL_STOCK_MOVEMENT_TYPE.includes(type) ? type : STOCK_MOVEMENT_TYPE.IN,
    quantity: Number(quantity) || 0,
    balanceAfter: Number(balanceAfter) || 0,    // الرصيد بعد الحركة
    reason: reason || null,
    source: source || "manual",                 // manual / pos / purchase
    note: note || null,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// --- أوامر البيع (POS) ---
const PAYMENT_METHOD = {
  CASH: "cash",         // نقدي
  CARD: "card",         // شبكة/بطاقة
  TRANSFER: "transfer", // تحويل
};
const ALL_PAYMENT_METHOD = Object.values(PAYMENT_METHOD);
const POS_VAT_RATE = 15; // ضريبة القيمة المضافة

// بناء وثيقة أمر بيع
function buildSalesOrderDoc({
  tenantId, orderNumber, sessionId, items, subtotal, discount, vatRate, vatAmount, total,
  paymentMethod, amountPaid, change, customerName, cashierName, createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    orderNumber: Number(orderNumber) || 0,
    sessionId: sessionId || null,             // جلسة الكاشير المرتبطة
    items: Array.isArray(items) ? items : [], // [{productId, name, qty, unitPrice, lineTotal, isService}]
    subtotal: Number(subtotal) || 0,
    discount: Number(discount) || 0,
    vatRate: Number(vatRate) || 0,
    vatAmount: Number(vatAmount) || 0,
    total: Number(total) || 0,
    paymentMethod: ALL_PAYMENT_METHOD.includes(paymentMethod) ? paymentMethod : PAYMENT_METHOD.CASH,
    amountPaid: Number(amountPaid) || 0,
    change: Number(change) || 0,
    customerName: (customerName || "").trim() || null,
    cashierName: cashierName || null,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// ═══════════════════════════════════════════════════════
// ===== الكاشير: جلسات الوردية والمرتجعات =====
// ═══════════════════════════════════════════════════════

const SESSION_STATUS = {
  OPEN: "open",     // مفتوحة
  CLOSED: "closed", // مغلقة
};
const ALL_SESSION_STATUS = Object.values(SESSION_STATUS);

// بناء وثيقة جلسة كاشير (وردية)
function buildCashierSessionDoc({
  tenantId, sessionNumber, openingBalance, cashierName, openedBy, openedAt,
}) {
  return {
    tenantId: tenantId,
    sessionNumber: Number(sessionNumber) || 0,
    openingBalance: Number(openingBalance) || 0, // رصيد بداية الدرج
    status: SESSION_STATUS.OPEN,
    cashierName: cashierName || null,
    openedBy: openedBy || null,
    openedAt: openedAt,
    // تُملأ عند الإغلاق:
    closedAt: null,
    closedBy: null,
    countedCash: null,     // النقد المعدود فعليًا
    expectedCash: null,    // المتوقّع = الرصيد + مبيعات نقدية − مرتجعات نقدية
    difference: null,      // الفرق (زيادة/عجز)
    salesCount: null,
    salesTotal: null,
    cashTotal: null,
    cardTotal: null,
    transferTotal: null,
    returnsTotal: null,
    closingNotes: null,
  };
}

// بناء وثيقة مرتجع
function buildSalesReturnDoc({
  tenantId, returnNumber, sessionId, originalOrderNumber, items, total,
  reason, cashierName, createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    returnNumber: Number(returnNumber) || 0,
    sessionId: sessionId || null,
    originalOrderNumber: originalOrderNumber || null, // رقم الفاتورة الأصلية (اختياري)
    items: Array.isArray(items) ? items : [],         // [{productId, name, qty, unitPrice, lineTotal, isService}]
    total: Number(total) || 0,                        // مبلغ الإرجاع
    reason: reason || null,
    cashierName: cashierName || null,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// ═══════════════════════════════════════════════════════
// ===== الجودة والسلامة المهنية =====
// ═══════════════════════════════════════════════════════

// --- حوادث السلامة ---
const INCIDENT_SEVERITY = {
  NEARMISS: "nearmiss", // شبه حادث
  MINOR: "minor",       // بسيطة
  MODERATE: "moderate", // متوسطة
  MAJOR: "major",       // خطيرة
};
const ALL_INCIDENT_SEVERITY = Object.values(INCIDENT_SEVERITY);

const INCIDENT_STATUS = {
  OPEN: "open",         // مفتوحة
  REVIEW: "review",     // قيد المراجعة
  CLOSED: "closed",     // مغلقة
};
const ALL_INCIDENT_STATUS = Object.values(INCIDENT_STATUS);

// بناء وثيقة حادث سلامة
function buildIncidentDoc({
  tenantId, incidentNumber, type, site, severity, status, incidentDate,
  description, correctiveAction, reportedBy, createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    incidentNumber: Number(incidentNumber) || 0,
    type: (type || "").trim(),                  // نوع الحادث
    site: (site || "").trim() || null,          // الموقع
    severity: ALL_INCIDENT_SEVERITY.includes(severity) ? severity : INCIDENT_SEVERITY.MINOR,
    status: ALL_INCIDENT_STATUS.includes(status) ? status : INCIDENT_STATUS.OPEN,
    incidentDate: incidentDate || null,
    description: (description || "").trim() || null,
    correctiveAction: (correctiveAction || "").trim() || null, // الإجراء التصحيحي
    reportedBy: reportedBy || null,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

// --- جولات التفتيش ---
const INSPECTION_RESULT = {
  PASS: "pass",     // مطابق
  NOTES: "notes",   // ملاحظات
  ACTION: "action", // يحتاج إجراء
};
const ALL_INSPECTION_RESULT = Object.values(INSPECTION_RESULT);

// بناء وثيقة جولة تفتيش
function buildSafetyInspectionDoc({
  tenantId, inspectionNumber, site, inspectionDate, result, inspector, notes,
  createdBy, createdAt,
}) {
  return {
    tenantId: tenantId,
    inspectionNumber: Number(inspectionNumber) || 0,
    site: (site || "").trim() || null,
    inspectionDate: inspectionDate || null,
    result: ALL_INSPECTION_RESULT.includes(result) ? result : INSPECTION_RESULT.PASS,
    inspector: (inspector || "").trim() || null, // المفتّش
    notes: (notes || "").trim() || null,
    createdBy: createdBy || null,
    createdAt: createdAt,
  };
}

module.exports = {
  COLLECTIONS,
  ROLES,
  SUBSCRIPTION_STATUS,
  DEFAULTS,
  MODULES,
  ALL_MODULES,
  WEEKDAYS,
  RECORD_STATUS,
  ENTRY_STATUS,
  EXCEPTION_STATUS,
  ESCALATION_LEVEL,
  DEAL_TYPES,
  ALL_DEAL_TYPES,
  COST_STATUS,
  ACCOUNT_TYPES,
  ALL_ACCOUNT_TYPES,
  ACCOUNT_NORMAL_SIDE,
  JOURNAL_STATUS,
  INVOICE_STATUS,
  INVOICE_ACCOUNT_CODES,
  COST_PERIODS,
  ALL_COST_PERIODS,
  PROJECT_STATUS,
  DEFAULT_PROJECT_TYPES,
  REQUEST_STATUS,
  RESOURCE_TYPES,
  REQUEST_PRIORITY,
  ASSIGNMENT_STATUS,
  ASSET_TYPES,
  ALL_ASSET_TYPES,
  ASSET_OWNERSHIP,
  ASSET_PAYMENT,
  computeFinancing,
  ASSET_STATUS,
  ALL_ASSET_STATUS,
  ASSET_EXPENSE_TYPES,
  ALL_ASSET_EXPENSE_TYPES,
  DEFAULT_CHART_OF_ACCOUNTS,
  buildTenantDoc,
  buildUserDoc,
  buildEmployeeDoc,
  buildAllowance,
  buildWorkerCostBase,
  buildWorkerDoc,
  computeWorkerBaseCost,
  GOV_COST_ITEMS_YEAR1,
  GOV_COST_ITEMS_YEAR2,
  AMORTIZATION_METHODS,
  buildGovItem,
  buildGovernmentCosts,
  computeGovernmentCosts,
  INSURANCE_BEARER,
  buildSocialInsurance,
  validateSocialInsurance,
  computeSocialInsurance,
  computeWorkerMonthlyCost,
  buildShiftDoc,
  buildScheduleDoc,
  buildShiftRecordDoc,
  buildEntry,
  buildExceptionDoc,
  buildEscalationEntry,
  buildSummaryDoc,
  buildVendorDoc,
  buildItemDoc,
  buildAccountDoc,
  buildJournalEntryDoc,
  buildTaxConfig,
  buildCustomerDoc,
  buildInvoiceDoc,
  buildReceiptDoc,
  buildClosingDoc,
  buildPaymentDoc,
  buildEmployeeProfileDoc,
  buildPayrollRunDoc,
  buildVacancyDoc,
  buildApplicantDoc,
  buildTrainingProgramDoc,
  buildEnrollmentDoc,
  buildLeaveRequestDoc,
  buildPenaltyDoc,
  buildEvaluationDoc,
  buildEmployeeAssignmentDoc,
  buildAssetAssignmentDoc,
  buildMaterialAllocationDoc,
  buildOperationTaskDoc,
  buildMilestoneDoc,
  buildInspectionDoc,
  buildBudgetDoc,
  buildDealDoc,
  buildQuoteDoc,
  buildCampaignDoc,
  buildTicketDoc,
  TICKET_CATEGORY,
  ALL_TICKET_CATEGORY,
  TICKET_PRIORITY,
  ALL_TICKET_PRIORITY,
  TICKET_STATUS,
  ALL_TICKET_STATUS,
  buildInteractionDoc,
  buildContractDoc,
  buildLicenseDoc,
  buildDisputeDoc,
  buildAuditDoc,
  AUDIT_STATUS,
  ALL_AUDIT_STATUS,
  buildFindingDoc,
  buildRatingDoc,
  buildImprovementDoc,
  buildProductDoc,
  buildStockMovementDoc,
  buildSalesOrderDoc,
  buildCashierSessionDoc,
  SESSION_STATUS,
  ALL_SESSION_STATUS,
  buildSalesReturnDoc,
  buildIncidentDoc,
  INCIDENT_SEVERITY,
  ALL_INCIDENT_SEVERITY,
  INCIDENT_STATUS,
  ALL_INCIDENT_STATUS,
  buildSafetyInspectionDoc,
  INSPECTION_RESULT,
  ALL_INSPECTION_RESULT,
  PAYMENT_METHOD,
  ALL_PAYMENT_METHOD,
  POS_VAT_RATE,
  STOCK_MOVEMENT_TYPE,
  ALL_STOCK_MOVEMENT_TYPE,
  IMPROVEMENT_STATUS,
  ALL_IMPROVEMENT_STATUS,
  FINDING_SEVERITY,
  ALL_FINDING_SEVERITY,
  FINDING_STATUS,
  ALL_FINDING_STATUS,
  DISPUTE_TYPE,
  ALL_DISPUTE_TYPE,
  DISPUTE_STATUS,
  ALL_DISPUTE_STATUS,
  DISPUTE_OUTCOME,
  ALL_DISPUTE_OUTCOME,
  CONTRACT_TYPE,
  ALL_CONTRACT_TYPE,
  CONTRACT_STATUS,
  ALL_CONTRACT_STATUS,
  INTERACTION_TYPE,
  ALL_INTERACTION_TYPE,
  CAMPAIGN_STATUS,
  ALL_CAMPAIGN_STATUS,
  computeQuoteTotals,
  QUOTE_STATUS,
  ALL_QUOTE_STATUS,
  QUOTE_VAT_RATE,
  DEAL_STAGES,
  ALL_DEAL_STAGES,
  DEAL_STATUS,
  ALL_DEAL_STATUS,
  DEAL_SOURCES,
  computeInvoiceTotals,
  buildProjectTypeDoc,
  buildProjectDoc,
  validateProjectStatus,
  buildJobTitleDoc,
  buildResourceRequestDoc,
  validateRequestStatus,
  buildWorkerAssignmentDoc,
  validateAssignmentStatus,
  buildAssetDoc,
  buildAssetExpenseDoc,
  computeAssetMonthlyCost,
  computeAssetSharePerBeneficiary,
  FINANCE_APPROVAL_STATUS,
  ALL_FINANCE_APPROVAL_STATUS,
  APPROVAL_SCOPE,
  ALL_APPROVAL_SCOPE,
  buildFinanceApprovalDoc,
  timeToMinutes,
  shiftWindow,
  shiftsOverlap,
  dateRangesOverlap,
  validatePermissions,
  isValidTime,
  validateBreaks,
  validateOffDays,
  isValidDate,
  validateDealTypes,
  validateAccountType,
  validateJournalLines,
  validateTaxConfig,
};
