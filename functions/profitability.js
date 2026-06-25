// ═══════════════════════════════════════════════════════
// ===== محرّك الربحية (منطق معزول) =====
// يُستورد في index.js — يحتوي الحسابات النقية القابلة للاختبار
// ═══════════════════════════════════════════════════════

const MONTHLY_DEDUCTIONS_COLLECTION = "monthlyDeductions";

// ===== تطبيع سعر التأجير إلى قيمة شهرية =====
// rentalPeriod: hourly | daily | monthly | yearly
// يستخدم أيام/ساعات عمل العامل (نفس أساس حساب التكلفة)
function normalizeRentalToMonthly(rentalPrice, rentalPeriod, workDaysPerMonth, workHoursPerDay) {
  const price = Number(rentalPrice) || 0;
  const wd = Number(workDaysPerMonth) > 0 ? Number(workDaysPerMonth) : 26;
  const wh = Number(workHoursPerDay) > 0 ? Number(workHoursPerDay) : 8;
  switch (rentalPeriod) {
    case "hourly": return price * wh * wd;
    case "daily": return price * wd;
    case "monthly": return price;
    case "yearly": return price / 12;
    default: return price;
  }
}

// ===== حساب ربحية إسناد واحد لشهر (المعادلة الكاملة مع منطق الغياب + التناسب) =====
// القاعدة: الثابت لا يتأثر بالغياب؛ المتغيّر يتأثر بخصم العامل؛ الإيراد يتأثر بخصم العميل
// التناسب (proration): الإيراد والتكلفة تُناسَب تقويمياً حسب أيام تداخل الإسناد مع الشهر
// الأسعار اليومية للخصم تبقى من القيم الشهرية الكاملة (سعر اليوم ثابت)
function computeAssignmentProfitability({
  revenueMonthly, monthlyVariable, monthlyFixed,
  workDaysPerMonth, clientDeductionDays, workerDeductionDays,
  prorationRatio,
}) {
  const wd = Number(workDaysPerMonth) > 0 ? Number(workDaysPerMonth) : 26;
  const rev = Number(revenueMonthly) || 0;
  const varCost = Number(monthlyVariable) || 0;
  const fixCost = Number(monthlyFixed) || 0;
  const clientDays = Number(clientDeductionDays) || 0;
  const workerDays = Number(workerDeductionDays) || 0;
  const ratio = (prorationRatio === undefined || prorationRatio === null) ? 1 : Math.max(0, Number(prorationRatio));
  const r = (n) => Math.round(n * 100) / 100;

  // الأسعار اليومية (من القيم الشهرية الكاملة — ثابتة لا تتأثر بالتناسب)
  const clientDailyRate = rev / wd;          // سعر اليوم للعميل
  const variableDailyCost = varCost / wd;     // تكلفة اليوم المتغيرة

  // القيم المُناسَبة تقويمياً
  const revenueProrated = rev * ratio;
  const variableProrated = varCost * ratio;
  const fixedProrated = fixCost * ratio;

  // الخصومات (بالأيام الفعلية × السعر اليومي الكامل)
  const clientDeduction = clientDays * clientDailyRate;   // يُخصم من فاتورة العميل
  const workerSaving = workerDays * variableDailyCost;     // توفّره الشركة من راتب الغائب

  // الإيراد والتكلفة الفعليان
  const netRevenue = revenueProrated - clientDeduction;
  const actualVariable = Math.max(0, variableProrated - workerSaving);
  const actualCost = fixedProrated + actualVariable;       // الثابت المُناسَب + المتغيّر الفعلي

  // الأرباح
  const fullCost = fixedProrated + variableProrated;       // التكلفة المُناسَبة بلا غياب
  const grossProfit = revenueProrated - fullCost;          // الربح المُناسَب بلا غياب
  const profit = netRevenue - actualCost;                  // الربح الفعلي
  const margin = netRevenue > 0 ? (profit / netRevenue) * 100 : 0;

  return {
    prorationRatio: r(ratio),
    revenueMonthly: r(rev),                // الإيراد الشهري الكامل (مرجع)
    revenueProrated: r(revenueProrated),   // الإيراد المُناسَب (الفعلي)
    fullCost: r(fullCost),
    grossProfit: r(grossProfit),
    clientDailyRate: r(clientDailyRate),
    variableDailyCost: r(variableDailyCost),
    clientDeductionDays: clientDays,
    workerDeductionDays: workerDays,
    clientDeduction: r(clientDeduction),
    workerSaving: r(workerSaving),
    netRevenue: r(netRevenue),
    monthlyVariable: r(varCost),           // المتغيّر الكامل (مرجع)
    variableProrated: r(variableProrated), // المتغيّر المُناسَب
    actualVariable: r(actualVariable),
    monthlyFixed: r(fixCost),              // الثابت الكامل (مرجع)
    fixedProrated: r(fixedProrated),       // الثابت المُناسَب
    actualCost: r(actualCost),
    profit: r(profit),
    margin: r(margin),
  };
}

// ===== بناء وثيقة التعديل الشهري (خصم العميل/العامل) =====
function buildMonthlyDeductionDoc({
  tenantId, assignmentId, projectId, workerUid, month,
  clientDeductionDays, workerDeductionDays, actualAbsenceDays,
  notes, updatedBy, updatedAt,
}) {
  return {
    tenantId: tenantId,
    assignmentId: assignmentId || null,
    projectId: projectId || null,
    workerUid: workerUid || null,
    month: month,  // YYYY-MM
    clientDeductionDays: Number(clientDeductionDays) || 0,
    workerDeductionDays: Number(workerDeductionDays) || 0,
    actualAbsenceDays: Number(actualAbsenceDays) || 0,  // من الحضور (مرجع)
    notes: notes || null,
    updatedBy: updatedBy || null,
    updatedAt: updatedAt,
  };
}

// ═══════════════════════════════════════════════════════════════
// ===== محرّك التوزيع الزمني للموارد المشتركة (عامل بين عدة مشاريع) =====
// ═══════════════════════════════════════════════════════════════
// المبدأ (شرح Abdullah الدقيق):
//   • الثابت (حكومي + إداري + بدلات ثابتة): إجمالي واحد، يُقسّم بين المشاريع بنسب fixedShareRatio
//     (الافتراضي بالتساوي). مشروعان = نصفين.
//   • المتغيّر (راتب أساسي + بدلات متغيّرة): لكل مشروع حسب عمله الفعلي =
//        regularDays × التكلفة اليومية المتغيّرة + overtimeHours × سعر ساعة الأوفرتايم.
//     سعر ساعة الأوفرتايم = (اليومي المتغيّر ÷ ساعات اليوم) × 1.5.
//   • الإيراد لكل مشروع مستقل (من سعر إيجار إسناده).
//   • الربح لكل مشروع = إيراده − (نصيبه الثابت + متغيّره الفعلي). كل عقد له ربحه.

const SHARED_ALLOCATIONS_COLLECTION = "sharedAllocations";

// حالات اعتماد التوزيع
const ALLOCATION_STATUS = {
  DRAFT: "draft",                    // مسودة (العمليات تُدخل)
  PENDING_FINANCE: "pending_finance", // بانتظار اعتماد المالية
  APPROVED: "approved",              // معتمد (يُطبّق على الربحية)
  REJECTED: "rejected",              // مرفوض (يعود للعمليات)
};
const ALL_ALLOCATION_STATUS = [
  ALLOCATION_STATUS.DRAFT,
  ALLOCATION_STATUS.PENDING_FINANCE,
  ALLOCATION_STATUS.APPROVED,
  ALLOCATION_STATUS.REJECTED,
];

// حساب توزيع تكلفة عامل مشترك بين عدة مشاريع لشهر
// inputs:
//   monthlyVariable, monthlyFixed  : التكلفة الشهرية الكاملة للعامل (متغيّر/ثابت)
//   workDaysPerMonth, workHoursPerDay : أساس الحساب (للأيام والأوفرتايم)
//   items: [{ assignmentId, projectId, projectName, projectNumber, revenueMonthly,
//             regularDays, overtimeHours, fixedShareRatio }]
// returns: { dailyVariable, overtimeHourlyRate, items:[{ ...input, fixedShare, variableCost,
//             totalCost, revenue, profit, margin }], totals }
function computeSharedAllocation({
  monthlyVariable, monthlyFixed, workDaysPerMonth, workHoursPerDay, items,
}) {
  const wd = Number(workDaysPerMonth) > 0 ? Number(workDaysPerMonth) : 26;
  const wh = Number(workHoursPerDay) > 0 ? Number(workHoursPerDay) : 8;
  const varM = Number(monthlyVariable) || 0;
  const fixM = Number(monthlyFixed) || 0;
  const list = Array.isArray(items) ? items : [];
  const r = (n) => Math.round(n * 100) / 100;

  const dailyVariable = varM / wd;                       // التكلفة اليومية المتغيّرة
  const overtimeHourlyRate = (dailyVariable / wh) * 1.5;  // سعر ساعة الأوفرتايم (×1.5)

  // مجموع نسب الثابت (للتطبيع؛ الافتراضي بالتساوي عند غياب النسب)
  const totalRatio = list.reduce((s, it) => s + (Number(it.fixedShareRatio) || 0), 0);
  const n = list.length || 1;

  const outItems = list.map((it) => {
    const regularDays = Number(it.regularDays) || 0;
    const overtimeHours = Number(it.overtimeHours) || 0;
    const ratio = totalRatio > 0 ? (Number(it.fixedShareRatio) || 0) / totalRatio : 1 / n;

    const fixedShare = fixM * ratio;                                          // نصيبه من الثابت
    const variableCost = regularDays * dailyVariable + overtimeHours * overtimeHourlyRate; // متغيّره الفعلي
    const totalCost = fixedShare + variableCost;
    const revenue = Number(it.revenueMonthly) || 0;
    const profit = revenue - totalCost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return {
      assignmentId: it.assignmentId || null,
      projectId: it.projectId || null,
      projectName: it.projectName || null,
      projectNumber: it.projectNumber || null,
      regularDays: regularDays,
      overtimeHours: overtimeHours,
      fixedShareRatio: Number(it.fixedShareRatio) || 0,
      fixedSharePct: r(ratio * 100),
      fixedShare: r(fixedShare),
      variableCost: r(variableCost),
      totalCost: r(totalCost),
      revenue: r(revenue),
      profit: r(profit),
      margin: r(margin),
    };
  });

  const totals = outItems.reduce((acc, it) => {
    acc.revenue += it.revenue;
    acc.fixedShare += it.fixedShare;
    acc.variableCost += it.variableCost;
    acc.totalCost += it.totalCost;
    acc.profit += it.profit;
    return acc;
  }, { revenue: 0, fixedShare: 0, variableCost: 0, totalCost: 0, profit: 0 });
  Object.keys(totals).forEach((k) => { totals[k] = r(totals[k]); });
  totals.margin = totals.revenue > 0 ? r((totals.profit / totals.revenue) * 100) : 0;

  return {
    dailyVariable: r(dailyVariable),
    overtimeHourlyRate: r(overtimeHourlyRate),
    monthlyVariable: r(varM),
    monthlyFixed: r(fixM),
    items: outItems,
    totals: totals,
  };
}

// بناء وثيقة توزيع مشترك (عامل + شهر)
function buildSharedAllocationDoc({
  tenantId, workerUid, workerName, month, items,
  status, rejectionReason, createdBy, updatedBy, updatedAt, approvedBy, approvedAt,
}) {
  return {
    tenantId: tenantId,
    workerUid: workerUid,
    workerName: workerName || null,
    month: month,  // YYYY-MM
    status: ALL_ALLOCATION_STATUS.includes(status) ? status : ALLOCATION_STATUS.DRAFT,
    items: (Array.isArray(items) ? items : []).map((it) => ({
      assignmentId: it.assignmentId || null,
      projectId: it.projectId || null,
      projectName: it.projectName || null,
      projectNumber: it.projectNumber || null,
      regularDays: Number(it.regularDays) || 0,
      overtimeHours: Number(it.overtimeHours) || 0,
      fixedShareRatio: Number(it.fixedShareRatio) || 0,
    })),
    rejectionReason: rejectionReason || null,
    createdBy: createdBy || null,
    updatedBy: updatedBy || null,
    updatedAt: updatedAt,
    approvedBy: approvedBy || null,
    approvedAt: approvedAt || null,
  };
}

module.exports = {
  MONTHLY_DEDUCTIONS_COLLECTION,
  normalizeRentalToMonthly,
  computeAssignmentProfitability,
  buildMonthlyDeductionDoc,
  SHARED_ALLOCATIONS_COLLECTION,
  ALLOCATION_STATUS,
  ALL_ALLOCATION_STATUS,
  computeSharedAllocation,
  buildSharedAllocationDoc,
};
