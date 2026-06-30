const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

// منطقة النشر: الدمام (me-central2) — قرب العملاء وسيادة البيانات داخل السعودية.
// لا أثر على المحاكي المحلي (يتجاهلها). maxInstances يحدّ التكلفة في Blaze.
setGlobalOptions({ region: "europe-west1", maxInstances: 10 });
const {
  COLLECTIONS,
  ROLES,
  MODULES,
  WEEKDAYS,
  RECORD_STATUS,
  ENTRY_STATUS,
  EXCEPTION_STATUS,
  ESCALATION_LEVEL,
  COST_STATUS,
  ACCOUNT_TYPES,
  JOURNAL_STATUS,
  INVOICE_ACCOUNT_CODES,
  DEFAULT_CHART_OF_ACCOUNTS,
  buildTenantDoc,
  buildUserDoc,
  buildEmployeeDoc,
  buildWorkerDoc,
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
  ALL_TICKET_CATEGORY,
  ALL_TICKET_PRIORITY,
  ALL_TICKET_STATUS,
  TICKET_STATUS,
  TICKET_PRIORITY,
  buildInteractionDoc,
  ALL_INTERACTION_TYPE,
  buildContractDoc,
  buildLicenseDoc,
  buildDisputeDoc,
  buildAuditDoc,
  ALL_AUDIT_STATUS,
  buildFindingDoc,
  buildRatingDoc,
  buildImprovementDoc,
  buildProductDoc,
  buildStockMovementDoc,
  buildSalesOrderDoc,
  ALL_PAYMENT_METHOD,
  PAYMENT_METHOD,
  POS_VAT_RATE,
  ALL_STOCK_MOVEMENT_TYPE,
  STOCK_MOVEMENT_TYPE,
  ALL_IMPROVEMENT_STATUS,
  ALL_FINDING_SEVERITY,
  ALL_FINDING_STATUS,
  ALL_DISPUTE_TYPE,
  ALL_DISPUTE_STATUS,
  ALL_DISPUTE_OUTCOME,
  ALL_CONTRACT_TYPE,
  ALL_CONTRACT_STATUS,
  CONTRACT_STATUS,
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
  computeInvoiceTotals,
  validatePermissions,
  isValidTime,
  validateBreaks,
  validateOffDays,
  isValidDate,
  validateDealTypes,
  validateAccountType,
  validateJournalLines,
  validateTaxConfig,
} = require("./schema");

admin.initializeApp();
const db = admin.firestore();

// كود حساب النقد/الخزينة (للفواتير النقدية والتحصيل لاحقًا)
const TREASURY_ACCOUNT_CODE = "1100";
// كود حساب الأرباح المُبقاة (لترحيل صافي الربح/الخسارة عند الإقفال)
const RETAINED_EARNINGS_CODE = "3200";
// أكواد حسابات الرواتب
const SALARY_EXPENSE_CODE = "5100"; // مصروف رواتب العمالة
const ACCRUED_SALARY_CODE = "2300"; // رواتب مستحقة الدفع

exports.ping = onCall(() => ({ ok: true, ts: Date.now() }));

async function requireModule(auth, moduleName) {
  if (!auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
  }
  const callerRole = auth.token.role;
  const callerTenantId = auth.token.tenantId;
  if (!callerTenantId) {
    throw new HttpsError("failed-precondition", "حسابك غير مرتبط بشركة.");
  }
  if (callerRole === ROLES.OWNER) {
    return callerTenantId;
  }
  if (callerRole === ROLES.STAFF) {
    const callerDoc = await db.collection(COLLECTIONS.USERS).doc(auth.uid).get();
    if (!callerDoc.exists) {
      throw new HttpsError("failed-precondition", "تعذّر التحقق من صلاحياتك.");
    }
    const perms = callerDoc.data().permissions || [];
    if (!perms.includes(moduleName)) {
      throw new HttpsError("permission-denied", "ليس لديك الصلاحية المطلوبة.");
    }
    return callerTenantId;
  }
  throw new HttpsError("permission-denied", "غير مخوّل لهذا الإجراء.");
}

async function wouldCreateCycle(employeeUid, managerUid) {
  let cursor = managerUid;
  let guard = 0;
  while (cursor && guard < 50) {
    if (cursor === employeeUid) return true;
    const doc = await db.collection(COLLECTIONS.USERS).doc(cursor).get();
    if (!doc.exists) break;
    cursor = doc.data().managerUid || null;
    guard++;
  }
  return false;
}

// ===== المرحلة ١: تسجيل شركة + حساب المالك =====
exports.registerCompany = onCall(async (request) => {
  try {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
    }
    const uid = auth.uid;
    const email = auth.token.email || null;

    const rawName = request.data && request.data.name;
    if (typeof rawName !== "string" || rawName.trim().length < 2) {
      throw new HttpsError("invalid-argument", "اسم الشركة مطلوب (حرفان على الأقل).");
    }
    const name = rawName.trim();
    if (name.length > 100) {
      throw new HttpsError("invalid-argument", "اسم الشركة طويل جدًا (100 حرف كحد أقصى).");
    }

    const rawOwnerName = request.data && request.data.ownerName;
    const ownerName =
      typeof rawOwnerName === "string" && rawOwnerName.trim().length > 0
        ? rawOwnerName.trim()
        : email || "مالك الشركة";

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc();
    const tenantId = tenantRef.id;
    const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
    const now = FieldValue.serverTimestamp();

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(userRef);
      if (existing.exists) {
        throw new HttpsError("already-exists", "هذا الحساب مرتبط بشركة بالفعل.");
      }
      tx.set(tenantRef, buildTenantDoc({ name, ownerUid: uid, createdAt: now }));
      tx.set(userRef, buildUserDoc({ tenantId, role: ROLES.OWNER, name: ownerName, email, createdAt: now }));
    });

    await admin.auth().setCustomUserClaims(uid, { tenantId: tenantId, role: ROLES.OWNER });
    return { tenantId: tenantId, status: "pending" };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("registerCompany failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الشركة، حاول مرة أخرى.");
  }
});

// ===== المرحلة ٣: إنشاء موظف إداري =====
exports.createEmployee = onCall(async (request) => {
  try {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
    }
    const callerRole = auth.token.role;
    const callerTenantId = auth.token.tenantId;
    if (!callerTenantId) {
      throw new HttpsError("failed-precondition", "حسابك غير مرتبط بشركة.");
    }

    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim() : "";
    const password = typeof data.password === "string" ? data.password : "";
    const permissions = data.permissions;
    const managerUid = typeof data.managerUid === "string" ? data.managerUid.trim() : "";

    if (name.length < 2) {
      throw new HttpsError("invalid-argument", "اسم الموظف مطلوب (حرفان على الأقل).");
    }
    if (!email.includes("@")) {
      throw new HttpsError("invalid-argument", "البريد الإلكتروني غير صحيح.");
    }
    if (password.length < 6) {
      throw new HttpsError("invalid-argument", "كلمة المرور المؤقتة 6 أحرف على الأقل.");
    }
    if (!validatePermissions(permissions)) {
      throw new HttpsError("invalid-argument", "صلاحيات غير صحيحة.");
    }
    if (permissions.length === 0) {
      throw new HttpsError("invalid-argument", "اختر صلاحية واحدة على الأقل.");
    }

    if (callerRole === ROLES.OWNER) {
      // يمنح أي صلاحيات
    } else if (callerRole === ROLES.STAFF) {
      const callerDoc = await db.collection(COLLECTIONS.USERS).doc(auth.uid).get();
      if (!callerDoc.exists) {
        throw new HttpsError("failed-precondition", "تعذّر التحقق من صلاحياتك.");
      }
      const callerPermissions = callerDoc.data().permissions || [];
      const notAllowed = permissions.filter((p) => !callerPermissions.includes(p));
      if (notAllowed.length > 0) {
        throw new HttpsError("permission-denied", "لا يمكنك منح صلاحيات لا تملكها: " + notAllowed.join("، "));
      }
    } else {
      throw new HttpsError("permission-denied", "غير مخوّل لإنشاء موظفين.");
    }

    // المدير المباشر: تحدّده الواجهة صراحةً. فارغ = تحت المالك مباشرة (جذر الشجرة، null)
    let finalManagerUid = null;
    if (managerUid) {
      const mgrDoc = await db.collection(COLLECTIONS.USERS).doc(managerUid).get();
      if (!mgrDoc.exists || mgrDoc.data().tenantId !== callerTenantId) {
        throw new HttpsError("invalid-argument", "المدير المحدّد غير صحيح.");
      }
      const mgrRole = mgrDoc.data().role;
      if (mgrRole !== ROLES.OWNER && mgrRole !== ROLES.STAFF) {
        throw new HttpsError("invalid-argument", "المدير يجب أن يكون موظفًا أو مالكًا.");
      }
      finalManagerUid = managerUid;
    }

    let userRecord;
    try {
      userRecord = await admin.auth().createUser({ email, password, displayName: name });
    } catch (err) {
      if (err && err.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "هذا البريد مستخدم بالفعل.");
      }
      throw err;
    }

    const newUid = userRecord.uid;
    try {
      await db.collection(COLLECTIONS.USERS).doc(newUid).set(
        buildEmployeeDoc({ tenantId: callerTenantId, name, email, permissions, managerUid: finalManagerUid, createdBy: auth.uid, createdAt: FieldValue.serverTimestamp() })
      );
      await admin.auth().setCustomUserClaims(newUid, { tenantId: callerTenantId, role: ROLES.STAFF });
    } catch (err) {
      await admin.auth().deleteUser(newUid).catch(() => {});
      throw err;
    }

    return { uid: newUid, email: email };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createEmployee failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الموظف، حاول مرة أخرى.");
  }
});

// ===== تعديل مدير موظف =====
exports.setManager = onCall(async (request) => {
  try {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
    }
    const callerRole = auth.token.role;
    const callerTenantId = auth.token.tenantId;
    if (!callerTenantId) {
      throw new HttpsError("failed-precondition", "حسابك غير مرتبط بشركة.");
    }
    if (callerRole !== ROLES.OWNER) {
      const callerDoc = await db.collection(COLLECTIONS.USERS).doc(auth.uid).get();
      const perms = callerDoc.exists ? (callerDoc.data().permissions || []) : [];
      if (!perms.includes(MODULES.HR)) {
        throw new HttpsError("permission-denied", "تحتاج صلاحية الموارد البشرية لتعديل الهيكل.");
      }
    }

    const data = request.data || {};
    const employeeUid = typeof data.employeeUid === "string" ? data.employeeUid.trim() : "";
    const newManagerUid = typeof data.managerUid === "string" ? data.managerUid.trim() : "";

    if (!employeeUid) {
      throw new HttpsError("invalid-argument", "يجب تحديد الموظف.");
    }

    const empDoc = await db.collection(COLLECTIONS.USERS).doc(employeeUid).get();
    if (!empDoc.exists || empDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الموظف غير صحيح.");
    }
    const empRole = empDoc.data().role;
    if (empRole !== ROLES.STAFF && empRole !== ROLES.WORKER) {
      throw new HttpsError("invalid-argument", "يمكن تحديد المدير للموظفين والعمّال فقط.");
    }
    // العامل يُخزّن مديره في حقل المشرف (supervisorUid)؛ الموظف الإداري في حقل المدير (managerUid)
    const isWorker = empRole === ROLES.WORKER;
    const managerField = isWorker ? "supervisorUid" : "managerUid";
    // العامل يجب أن يبقى له مشرف دائمًا (لا يُسمح بإزالته)
    if (isWorker && !newManagerUid) {
      throw new HttpsError("invalid-argument", "العامل يجب أن يكون له مشرف.");
    }

    let finalManagerUid = null;
    if (newManagerUid) {
      if (newManagerUid === employeeUid) {
        throw new HttpsError("invalid-argument", "لا يمكن أن يكون الموظف مديرًا لنفسه.");
      }
      const mgrDoc = await db.collection(COLLECTIONS.USERS).doc(newManagerUid).get();
      if (!mgrDoc.exists || mgrDoc.data().tenantId !== callerTenantId) {
        throw new HttpsError("invalid-argument", "المدير المحدّد غير صحيح.");
      }
      const mgrRole = mgrDoc.data().role;
      if (mgrRole !== ROLES.OWNER && mgrRole !== ROLES.STAFF) {
        throw new HttpsError("invalid-argument", "المدير يجب أن يكون موظفًا أو مالكًا.");
      }
      // فحص الحلقات للموظفين الإداريين فقط (العامل ورقة في الشجرة، لا يُنشئ حلقة)
      if (!isWorker) {
        const cycle = await wouldCreateCycle(employeeUid, newManagerUid);
        if (cycle) {
          throw new HttpsError("failed-precondition", "هذا التغيير يُنشئ حلقة في الهيكل التنظيمي.");
        }
      }
      finalManagerUid = newManagerUid;
    }

    await db.collection(COLLECTIONS.USERS).doc(employeeUid).update({ [managerField]: finalManagerUid });

    return { employeeUid: employeeUid, managerUid: finalManagerUid };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("setManager failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل المدير، حاول مرة أخرى.");
  }
});

// ===== المرحلة ٤أ: إنشاء عامل =====
exports.createWorker = onCall(async (request) => {
  try {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
    }
    const callerRole = auth.token.role;
    const callerTenantId = auth.token.tenantId;
    if (!callerTenantId) {
      throw new HttpsError("failed-precondition", "حسابك غير مرتبط بشركة.");
    }

    if (callerRole === ROLES.OWNER) {
      // يقدر دائمًا
    } else if (callerRole === ROLES.STAFF) {
      const callerDoc = await db.collection(COLLECTIONS.USERS).doc(auth.uid).get();
      if (!callerDoc.exists) {
        throw new HttpsError("failed-precondition", "تعذّر التحقق من صلاحياتك.");
      }
      const perms = callerDoc.data().permissions || [];
      if (!perms.includes(MODULES.HR) && !perms.includes(MODULES.ATTENDANCE)) {
        throw new HttpsError("permission-denied", "تحتاج صلاحية الموارد البشرية أو الحضور لإنشاء عمّال.");
      }
    } else {
      throw new HttpsError("permission-denied", "غير مخوّل لإنشاء عمّال.");
    }

    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim() : "";
    const password = typeof data.password === "string" ? data.password : "";
    const supervisorUid = typeof data.supervisorUid === "string" ? data.supervisorUid.trim() : "";
    const employeeNumber = typeof data.employeeNumber === "string" ? data.employeeNumber.trim() : "";
    const jobTitleId = typeof data.jobTitleId === "string" ? data.jobTitleId.trim() : "";

    if (name.length < 2) {
      throw new HttpsError("invalid-argument", "اسم العامل مطلوب (حرفان على الأقل).");
    }
    if (!email.includes("@")) {
      throw new HttpsError("invalid-argument", "البريد الإلكتروني غير صحيح.");
    }
    if (password.length < 6) {
      throw new HttpsError("invalid-argument", "كلمة المرور المؤقتة 6 أحرف على الأقل.");
    }
    // المشرف المباشر: إن لم يُحدّد، فالمُنشئ (المالك أو الموظف الإداري) هو المشرف تلقائيًّا
    const effectiveSupervisorUid = supervisorUid || auth.uid;
    const supervisorDoc = await db.collection(COLLECTIONS.USERS).doc(effectiveSupervisorUid).get();
    if (!supervisorDoc.exists || supervisorDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المشرف المحدّد غير صحيح.");
    }

    // المهنة (اختيارية لكن إن أُرسلت يجب أن تكون صحيحة)
    let jobTitleName = null;
    if (jobTitleId) {
      const jobDoc = await db.collection(COLLECTIONS.JOB_TITLES).doc(jobTitleId).get();
      if (!jobDoc.exists || jobDoc.data().tenantId !== callerTenantId) {
        throw new HttpsError("invalid-argument", "المهنة غير صحيحة.");
      }
      jobTitleName = jobDoc.data().name;
    }

    let userRecord;
    try {
      userRecord = await admin.auth().createUser({ email, password, displayName: name });
    } catch (err) {
      if (err && err.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "هذا البريد مستخدم بالفعل.");
      }
      throw err;
    }

    const newUid = userRecord.uid;
    try {
      await db.collection(COLLECTIONS.USERS).doc(newUid).set(
        buildWorkerDoc({ tenantId: callerTenantId, name, email, supervisorUid: effectiveSupervisorUid, employeeNumber, jobTitleId: jobTitleId || null, jobTitleName, createdBy: auth.uid, createdAt: FieldValue.serverTimestamp() })
      );
      await admin.auth().setCustomUserClaims(newUid, { tenantId: callerTenantId, role: ROLES.WORKER });
    } catch (err) {
      await admin.auth().deleteUser(newUid).catch(() => {});
      throw err;
    }

    return { uid: newUid, email: email };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createWorker failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء العامل، حاول مرة أخرى.");
  }
});

// ===== المرحلة ٤ب: تعريف شِفت =====
exports.createShift = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.ATTENDANCE);

    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const startTime = typeof data.startTime === "string" ? data.startTime.trim() : "";
    const durationHours = Number(data.durationHours);
    const breaks = data.breaks;
    const recordLeadMinutes = data.recordLeadMinutes !== undefined ? Number(data.recordLeadMinutes) : 60;
    const approvalDeadlineHours = data.approvalDeadlineHours !== undefined ? Number(data.approvalDeadlineHours) : 24;

    if (name.length < 2) {
      throw new HttpsError("invalid-argument", "اسم الشِفت مطلوب (حرفان على الأقل).");
    }
    if (!isValidTime(startTime)) {
      throw new HttpsError("invalid-argument", "وقت البداية غير صحيح (الصيغة HH:MM).");
    }
    if (!Number.isFinite(durationHours) || durationHours <= 0 || durationHours > 24) {
      throw new HttpsError("invalid-argument", "مدة الشِفت غير صحيحة (1 إلى 24 ساعة).");
    }
    if (!validateBreaks(breaks)) {
      throw new HttpsError("invalid-argument", "بيانات فترات الراحة غير صحيحة.");
    }
    if (!Number.isFinite(recordLeadMinutes) || recordLeadMinutes < 0 || recordLeadMinutes > 1440) {
      throw new HttpsError("invalid-argument", "وقت إصدار السجل غير صحيح.");
    }
    if (!Number.isFinite(approvalDeadlineHours) || approvalDeadlineHours <= 0 || approvalDeadlineHours > 168) {
      throw new HttpsError("invalid-argument", "مهلة الموافقة غير صحيحة.");
    }

    const shiftRef = db.collection(COLLECTIONS.SHIFTS).doc();
    await shiftRef.set(
      buildShiftDoc({ tenantId: callerTenantId, name, startTime, durationHours, breaks, recordLeadMinutes, approvalDeadlineHours, createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp() })
    );

    return { id: shiftRef.id, name: name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createShift failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الشِفت، حاول مرة أخرى.");
  }
});

// ===== المرحلة ٤ب: إسناد جدول لعامل =====
exports.assignSchedule = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.ATTENDANCE);

    const data = request.data || {};
    const workerUid = typeof data.workerUid === "string" ? data.workerUid.trim() : "";
    const rotationShifts = data.rotationShifts;
    const weeklyOffDays = data.weeklyOffDays;
    const rotationStartDate = typeof data.rotationStartDate === "string" ? data.rotationStartDate.trim() : "";

    if (!workerUid) {
      throw new HttpsError("invalid-argument", "يجب تحديد العامل.");
    }
    if (!Array.isArray(rotationShifts) || rotationShifts.length === 0) {
      throw new HttpsError("invalid-argument", "يجب اختيار شِفت واحد على الأقل.");
    }
    if (!validateOffDays(weeklyOffDays)) {
      throw new HttpsError("invalid-argument", "أيام الإجازة غير صحيحة.");
    }
    if (rotationStartDate && !isValidDate(rotationStartDate)) {
      throw new HttpsError("invalid-argument", "تاريخ بداية الدوران غير صحيح.");
    }

    const workerDoc = await db.collection(COLLECTIONS.USERS).doc(workerUid).get();
    if (!workerDoc.exists || workerDoc.data().tenantId !== callerTenantId || workerDoc.data().role !== ROLES.WORKER) {
      throw new HttpsError("invalid-argument", "العامل المحدّد غير صحيح.");
    }
    const supervisorUid = workerDoc.data().supervisorUid || null;

    for (const shiftId of rotationShifts) {
      if (typeof shiftId !== "string" || !shiftId) {
        throw new HttpsError("invalid-argument", "معرّف شِفت غير صحيح.");
      }
      const shiftDoc = await db.collection(COLLECTIONS.SHIFTS).doc(shiftId).get();
      if (!shiftDoc.exists || shiftDoc.data().tenantId !== callerTenantId) {
        throw new HttpsError("invalid-argument", "أحد الشِفتات المحدّدة غير صحيح.");
      }
    }

    const scheduleRef = db.collection(COLLECTIONS.SCHEDULES).doc(workerUid);
    await scheduleRef.set(
      buildScheduleDoc({ tenantId: callerTenantId, workerUid, supervisorUid, rotationShifts, rotationStartDate: rotationStartDate || null, weeklyOffDays: weeklyOffDays || [], createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp() })
    );

    return { scheduleId: scheduleRef.id, workerUid: workerUid };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("assignSchedule failed:", err);
    throw new HttpsError("internal", "تعذّر إسناد الجدول، حاول مرة أخرى.");
  }
});

// أداة مشتركة: تبني سجل شِفت لمشرف
async function buildRecordForShift(tenantId, supervisorUid, shiftId, shift, date, createdByUid) {
  const weekdayId = WEEKDAYS[new Date(date + "T00:00:00").getDay()];

  const schedSnap = await db
    .collection(COLLECTIONS.SCHEDULES)
    .where("tenantId", "==", tenantId)
    .where("supervisorUid", "==", supervisorUid)
    .get();

  const entries = [];
  for (const docSnap of schedSnap.docs) {
    const sched = docSnap.data();
    const inThisShift = Array.isArray(sched.rotationShifts) && sched.rotationShifts.includes(shiftId);
    const isOffToday = Array.isArray(sched.weeklyOffDays) && sched.weeklyOffDays.includes(weekdayId);
    if (!inThisShift || isOffToday) continue;

    const wDoc = await db.collection(COLLECTIONS.USERS).doc(sched.workerUid).get();
    const wName = wDoc.exists ? wDoc.data().name : null;
    entries.push(buildEntry({ workerUid: sched.workerUid, workerName: wName }));
  }

  if (entries.length === 0) {
    return { recordId: null, workersCount: 0, skipped: true };
  }

  const recordId = `${supervisorUid}_${shiftId}_${date}`;
  const recordRef = db.collection(COLLECTIONS.RECORDS).doc(recordId);

  const existing = await recordRef.get();
  if (existing.exists) {
    return { recordId: recordId, workersCount: entries.length, alreadyExists: true };
  }

  const deadlineMs = Date.now() + (shift.approvalDeadlineHours || 24) * 3600 * 1000;
  const deadline = admin.firestore.Timestamp.fromMillis(deadlineMs);

  await recordRef.set(
    buildShiftRecordDoc({ tenantId, supervisorUid, shiftId, shiftName: shift.name || null, date, entries, deadline, createdBy: createdByUid, createdAt: FieldValue.serverTimestamp() })
  );

  return { recordId: recordId, workersCount: entries.length };
}

// أداة مشتركة: تحسب وتكتب ملخّص شركة ليومٍ معيّن
async function computeSummaryForTenantDate(tenantId, date) {
  const recSnap = await db
    .collection(COLLECTIONS.RECORDS)
    .where("tenantId", "==", tenantId)
    .where("date", "==", date)
    .get();

  let totalRecords = 0, totalWorkers = 0, presentCount = 0, absentCount = 0, lateCount = 0, openRecords = 0, finalizedRecords = 0;

  for (const docSnap of recSnap.docs) {
    const rec = docSnap.data();
    totalRecords++;
    if (rec.status === RECORD_STATUS.FINALIZED) finalizedRecords++;
    else openRecords++;
    const entries = Array.isArray(rec.entries) ? rec.entries : [];
    for (const e of entries) {
      totalWorkers++;
      if (e.status === ENTRY_STATUS.ABSENT) absentCount++;
      else if (e.status === ENTRY_STATUS.LATE) lateCount++;
      else presentCount++;
    }
  }

  const exSnap = await db
    .collection(COLLECTIONS.EXCEPTIONS)
    .where("tenantId", "==", tenantId)
    .where("date", "==", date)
    .get();

  let pendingExceptions = 0, objectedExceptions = 0;
  for (const docSnap of exSnap.docs) {
    const ex = docSnap.data();
    if (ex.status === EXCEPTION_STATUS.PENDING_WORKER) pendingExceptions++;
    else if (ex.status === EXCEPTION_STATUS.OBJECTED) objectedExceptions++;
  }

  const summaryId = `${tenantId}_${date}`;
  await db.collection(COLLECTIONS.SUMMARIES).doc(summaryId).set(
    buildSummaryDoc({ tenantId, date, totalRecords, totalWorkers, presentCount, absentCount, lateCount, openRecords, finalizedRecords, pendingExceptions, objectedExceptions, updatedAt: FieldValue.serverTimestamp() })
  );

  return { summaryId, totalRecords, absentCount, objectedExceptions };
}

// ===== المرحلة ٤ج: توليد سجل شِفت (يدوي) =====
exports.generateShiftRecord = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.ATTENDANCE);
    const data = request.data || {};
    const supervisorUid = typeof data.supervisorUid === "string" ? data.supervisorUid.trim() : "";
    const shiftId = typeof data.shiftId === "string" ? data.shiftId.trim() : "";
    const date = typeof data.date === "string" ? data.date.trim() : "";

    if (!supervisorUid) throw new HttpsError("invalid-argument", "يجب تحديد المشرف.");
    if (!shiftId) throw new HttpsError("invalid-argument", "يجب تحديد الشِفت.");
    if (!isValidDate(date)) throw new HttpsError("invalid-argument", "التاريخ غير صحيح (YYYY-MM-DD).");

    const shiftDoc = await db.collection(COLLECTIONS.SHIFTS).doc(shiftId).get();
    if (!shiftDoc.exists || shiftDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الشِفت المحدّد غير صحيح.");
    }
    const shift = shiftDoc.data();
    const result = await buildRecordForShift(callerTenantId, supervisorUid, shiftId, shift, date, request.auth.uid);
    await computeSummaryForTenantDate(callerTenantId, date);
    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("generateShiftRecord failed:", err);
    throw new HttpsError("internal", "تعذّر توليد سجل الشِفت، حاول مرة أخرى.");
  }
});

// ===== المرحلة ٤ج: تغييب/تأخير عامل =====
exports.markAbsent = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.ATTENDANCE);
    const data = request.data || {};
    const recordId = typeof data.recordId === "string" ? data.recordId.trim() : "";
    const workerUid = typeof data.workerUid === "string" ? data.workerUid.trim() : "";
    const exceptionType = data.exceptionType === ENTRY_STATUS.LATE ? ENTRY_STATUS.LATE : ENTRY_STATUS.ABSENT;
    const supervisorNote = typeof data.supervisorNote === "string" ? data.supervisorNote.trim() : "";

    if (!recordId || !workerUid) throw new HttpsError("invalid-argument", "بيانات غير مكتملة.");

    const recordRef = db.collection(COLLECTIONS.RECORDS).doc(recordId);
    const recordSnap = await recordRef.get();
    if (!recordSnap.exists || recordSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "السجل غير صحيح.");
    }
    const record = recordSnap.data();
    if (record.status !== RECORD_STATUS.OPEN) {
      throw new HttpsError("failed-precondition", "هذا السجل مغلق ولا يمكن تعديله.");
    }

    const entries = Array.isArray(record.entries) ? record.entries : [];
    let found = false;
    let workerName = null;
    const updatedEntries = entries.map((e) => {
      if (e.workerUid === workerUid) {
        found = true;
        workerName = e.workerName || null;
        return { ...e, status: exceptionType, note: supervisorNote || null };
      }
      return e;
    });
    if (!found) throw new HttpsError("invalid-argument", "العامل غير موجود في هذا السجل.");

    const exDeadlineMs = Date.now() + 72 * 3600 * 1000;
    const exDeadline = admin.firestore.Timestamp.fromMillis(exDeadlineMs);
    const exceptionId = `${workerUid}_${recordId}`;
    const exceptionRef = db.collection(COLLECTIONS.EXCEPTIONS).doc(exceptionId);

    const batch = db.batch();
    batch.update(recordRef, { entries: updatedEntries });
    batch.set(
      exceptionRef,
      buildExceptionDoc({ tenantId: callerTenantId, subjectUid: workerUid, subjectName: workerName, supervisorUid: record.supervisorUid, recordId, shiftId: record.shiftId, date: record.date, exceptionType, supervisorNote: supervisorNote || null, deadline: exDeadline, createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp() })
    );
    await batch.commit();

    await computeSummaryForTenantDate(callerTenantId, record.date);
    return { exceptionId: exceptionId, workerUid: workerUid, type: exceptionType };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("markAbsent failed:", err);
    throw new HttpsError("internal", "تعذّر تسجيل الغياب، حاول مرة أخرى.");
  }
});

// ===== المرحلة ٤ج: رد العامل على الاستثناء =====
exports.respondToException = onCall(async (request) => {
  try {
    const auth = request.auth;
    if (!auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
    const data = request.data || {};
    const exceptionId = typeof data.exceptionId === "string" ? data.exceptionId.trim() : "";
    const action = data.action;
    const responseText = typeof data.responseText === "string" ? data.responseText.trim() : "";

    if (!exceptionId) throw new HttpsError("invalid-argument", "بيانات غير مكتملة.");
    if (action !== "accept" && action !== "object") throw new HttpsError("invalid-argument", "إجراء غير صحيح.");

    const exRef = db.collection(COLLECTIONS.EXCEPTIONS).doc(exceptionId);
    const exSnap = await exRef.get();
    if (!exSnap.exists) throw new HttpsError("not-found", "الاستثناء غير موجود.");
    const ex = exSnap.data();

    if (ex.subjectUid !== auth.uid) throw new HttpsError("permission-denied", "لا يمكنك الرد على استثناء ليس لك.");
    if (ex.status !== EXCEPTION_STATUS.PENDING_WORKER) throw new HttpsError("failed-precondition", "تم حسم هذا الاستثناء بالفعل.");

    const newStatus = action === "accept" ? EXCEPTION_STATUS.ACCEPTED : EXCEPTION_STATUS.OBJECTED;
    await exRef.update({
      status: newStatus,
      workerResponse: action === "object" ? (responseText || "اعتراض بدون تفاصيل") : null,
      resolvedAt: action === "accept" ? FieldValue.serverTimestamp() : null,
    });

    if (ex.tenantId && ex.date) await computeSummaryForTenantDate(ex.tenantId, ex.date);
    return { exceptionId: exceptionId, status: newStatus };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("respondToException failed:", err);
    throw new HttpsError("internal", "تعذّر إرسال ردّك، حاول مرة أخرى.");
  }
});

// ===== المرحلة ٤و: حسم/تصعيد الاعتراض =====
exports.resolveException = onCall(async (request) => {
  try {
    const auth = request.auth;
    if (!auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
    const callerTenantId = auth.token.tenantId;
    if (!callerTenantId) throw new HttpsError("failed-precondition", "حسابك غير مرتبط بشركة.");

    const data = request.data || {};
    const exceptionId = typeof data.exceptionId === "string" ? data.exceptionId.trim() : "";
    const action = data.action;
    const note = typeof data.note === "string" ? data.note.trim() : "";

    if (!exceptionId) throw new HttpsError("invalid-argument", "بيانات غير مكتملة.");
    if (!["accept_excuse", "confirm_absence", "escalate"].includes(action)) {
      throw new HttpsError("invalid-argument", "إجراء غير صحيح.");
    }

    const exRef = db.collection(COLLECTIONS.EXCEPTIONS).doc(exceptionId);
    const exSnap = await exRef.get();
    if (!exSnap.exists) throw new HttpsError("not-found", "الاعتراض غير موجود.");
    const ex = exSnap.data();

    if (ex.tenantId !== callerTenantId) throw new HttpsError("permission-denied", "غير مخوّل لهذا الإجراء.");
    if (ex.currentHandlerUid !== auth.uid) throw new HttpsError("permission-denied", "هذا الاعتراض ليس ضمن مهامك الحالية.");
    if (ex.status !== EXCEPTION_STATUS.OBJECTED) throw new HttpsError("failed-precondition", "هذا الاعتراض غير قابل للمعالجة الآن.");

    const handlerDoc = await db.collection(COLLECTIONS.USERS).doc(auth.uid).get();
    const handlerName = handlerDoc.exists ? handlerDoc.data().name : null;
    const now = admin.firestore.Timestamp.now();

    if (action === "escalate") {
      const managerUid = handlerDoc.exists ? (handlerDoc.data().managerUid || null) : null;
      if (!managerUid) throw new HttpsError("failed-precondition", "لا يوجد مستوى أعلى للتصعيد (أنت الإدارة العليا).");
      const step = buildEscalationEntry({ byUid: auth.uid, byName: handlerName, action: "escalated", note: note || null, toUid: managerUid, at: now });
      await exRef.update({
        currentHandlerUid: managerUid,
        escalationLevel: ESCALATION_LEVEL.ESCALATED,
        escalationHistory: FieldValue.arrayUnion(step),
      });
      return { exceptionId, action: "escalated", newHandlerUid: managerUid };
    }

    const resolution = action === "accept_excuse" ? "accepted_excuse" : "absence_confirmed";
    const step = buildEscalationEntry({ byUid: auth.uid, byName: handlerName, action: resolution, note: note || null, toUid: null, at: now });
    const exUpdate = {
      status: EXCEPTION_STATUS.ACCEPTED,
      escalationLevel: ESCALATION_LEVEL.RESOLVED,
      resolution: resolution,
      resolvedAt: FieldValue.serverTimestamp(),
      escalationHistory: FieldValue.arrayUnion(step),
    };

    if (action === "accept_excuse" && ex.recordId) {
      const recRef = db.collection(COLLECTIONS.RECORDS).doc(ex.recordId);
      const recSnap = await recRef.get();
      if (recSnap.exists) {
        const rec = recSnap.data();
        const entries = Array.isArray(rec.entries) ? rec.entries : [];
        const updatedEntries = entries.map((e) =>
          e.workerUid === ex.subjectUid ? { ...e, status: ENTRY_STATUS.PRESENT, note: null } : e
        );
        const batch = db.batch();
        batch.update(recRef, { entries: updatedEntries });
        batch.update(exRef, exUpdate);
        await batch.commit();
      } else {
        await exRef.update(exUpdate);
      }
    } else {
      await exRef.update(exUpdate);
    }

    if (ex.tenantId && ex.date) await computeSummaryForTenantDate(ex.tenantId, ex.date);
    return { exceptionId, action: resolution };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("resolveException failed:", err);
    throw new HttpsError("internal", "تعذّر معالجة الاعتراض، حاول مرة أخرى.");
  }
});

// ===== المرحلة ٤د: الاعتماد بالمهلة =====
exports.finalizeExpired = onCall(async (request) => {
  try {
    const auth = request.auth;
    if (!auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");

    const now = admin.firestore.Timestamp.now();
    let finalizedRecords = 0;
    let acceptedExceptions = 0;
    const affected = new Set();

    const recSnap = await db.collection(COLLECTIONS.RECORDS).where("status", "==", RECORD_STATUS.OPEN).where("deadline", "<=", now).get();
    for (const docSnap of recSnap.docs) {
      await docSnap.ref.update({ status: RECORD_STATUS.FINALIZED, finalizedAt: FieldValue.serverTimestamp() });
      finalizedRecords++;
      const r = docSnap.data();
      if (r.tenantId && r.date) affected.add(`${r.tenantId}|${r.date}`);
    }

    const exSnap = await db.collection(COLLECTIONS.EXCEPTIONS).where("status", "==", EXCEPTION_STATUS.PENDING_WORKER).where("deadline", "<=", now).get();
    for (const docSnap of exSnap.docs) {
      await docSnap.ref.update({ status: EXCEPTION_STATUS.ACCEPTED, resolvedAt: FieldValue.serverTimestamp(), autoAccepted: true });
      acceptedExceptions++;
      const e = docSnap.data();
      if (e.tenantId && e.date) affected.add(`${e.tenantId}|${e.date}`);
    }

    for (const key of affected) {
      const [tenantId, date] = key.split("|");
      await computeSummaryForTenantDate(tenantId, date);
    }

    return { finalizedRecords, acceptedExceptions, summariesUpdated: affected.size };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("finalizeExpired failed:", err);
    throw new HttpsError("internal", "تعذّر تنفيذ الاعتماد التلقائي.");
  }
});

// ===== المرحلة ٤د: التوليد التلقائي =====
exports.autoGenerateRecords = onCall(async (request) => {
  try {
    const auth = request.auth;
    if (!auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
    const data = request.data || {};
    const date = typeof data.date === "string" && isValidDate(data.date) ? data.date.trim() : null;
    if (!date) throw new HttpsError("invalid-argument", "يجب تمرير تاريخ صحيح (YYYY-MM-DD).");

    const weekdayId = WEEKDAYS[new Date(date + "T00:00:00").getDay()];
    const schedSnap = await db.collection(COLLECTIONS.SCHEDULES).where("status", "==", "active").get();

    const targets = new Map();
    for (const docSnap of schedSnap.docs) {
      const sched = docSnap.data();
      if (!sched.supervisorUid) continue;
      const isOffToday = Array.isArray(sched.weeklyOffDays) && sched.weeklyOffDays.includes(weekdayId);
      if (isOffToday) continue;
      const shiftsArr = Array.isArray(sched.rotationShifts) ? sched.rotationShifts : [];
      for (const shiftId of shiftsArr) {
        const key = `${sched.tenantId}|${sched.supervisorUid}|${shiftId}`;
        if (!targets.has(key)) {
          targets.set(key, { tenantId: sched.tenantId, supervisorUid: sched.supervisorUid, shiftId: shiftId });
        }
      }
    }

    let created = 0, skipped = 0;
    const affectedTenants = new Set();
    for (const t of targets.values()) {
      const shiftDoc = await db.collection(COLLECTIONS.SHIFTS).doc(t.shiftId).get();
      if (!shiftDoc.exists || shiftDoc.data().tenantId !== t.tenantId) { skipped++; continue; }
      const res = await buildRecordForShift(t.tenantId, t.supervisorUid, t.shiftId, shiftDoc.data(), date, "system-scheduler");
      if (res.recordId && !res.alreadyExists) created++;
      else skipped++;
      affectedTenants.add(t.tenantId);
    }

    for (const tenantId of affectedTenants) {
      await computeSummaryForTenantDate(tenantId, date);
    }

    return { date, targets: targets.size, created, skipped, summariesUpdated: affectedTenants.size };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("autoGenerateRecords failed:", err);
    throw new HttpsError("internal", "تعذّر التوليد التلقائي.");
  }
});

// ===== المرحلة ٤هـ: إعادة احتساب الملخّصات =====
exports.recomputeSummaries = onCall(async (request) => {
  try {
    const auth = request.auth;
    if (!auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
    const data = request.data || {};
    const date = typeof data.date === "string" && isValidDate(data.date) ? data.date.trim() : null;
    if (!date) throw new HttpsError("invalid-argument", "يجب تمرير تاريخ صحيح (YYYY-MM-DD).");

    const recSnap = await db.collection(COLLECTIONS.RECORDS).where("date", "==", date).get();
    const tenants = new Set();
    for (const docSnap of recSnap.docs) {
      const r = docSnap.data();
      if (r.tenantId) tenants.add(r.tenantId);
    }
    for (const tenantId of tenants) {
      await computeSummaryForTenantDate(tenantId, date);
    }
    return { date, tenantsUpdated: tenants.size };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("recomputeSummaries failed:", err);
    throw new HttpsError("internal", "تعذّر إعادة احتساب الملخّصات.");
  }
});

// ===== المشتريات: إنشاء مورّد =====
exports.createVendor = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROCUREMENT);
    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const vendorCode = typeof data.vendorCode === "string" ? data.vendorCode.trim() : "";
    const contactPerson = typeof data.contactPerson === "string" ? data.contactPerson.trim() : "";
    const phone = typeof data.phone === "string" ? data.phone.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim() : "";
    const taxNumber = typeof data.taxNumber === "string" ? data.taxNumber.trim() : "";
    const address = typeof data.address === "string" ? data.address.trim() : "";
    const paymentTerms = typeof data.paymentTerms === "string" ? data.paymentTerms.trim() : "";

    if (name.length < 2) {
      throw new HttpsError("invalid-argument", "اسم المورّد مطلوب (حرفان على الأقل).");
    }

    const vendorRef = db.collection(COLLECTIONS.VENDORS).doc();
    await vendorRef.set(
      buildVendorDoc({ tenantId: callerTenantId, name, vendorCode, contactPerson, phone, email, taxNumber, address, paymentTerms, createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp() })
    );
    return { id: vendorRef.id, name: name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createVendor failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء المورّد، حاول مرة أخرى.");
  }
});

// ===== المشتريات: إنشاء صنف =====
exports.createItem = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROCUREMENT);
    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const itemCode = typeof data.itemCode === "string" ? data.itemCode.trim() : "";
    const category = typeof data.category === "string" ? data.category.trim() : "";
    const unit = typeof data.unit === "string" ? data.unit.trim() : "";
    const dealTypes = data.dealTypes;
    const description = typeof data.description === "string" ? data.description.trim() : "";
    const preferredVendorId = typeof data.preferredVendorId === "string" ? data.preferredVendorId.trim() : "";
    const estimatedCost = data.estimatedCost !== undefined && data.estimatedCost !== null && data.estimatedCost !== ""
      ? Number(data.estimatedCost) : null;

    if (name.length < 2) {
      throw new HttpsError("invalid-argument", "اسم الصنف مطلوب (حرفان على الأقل).");
    }
    if (!validateDealTypes(dealTypes)) {
      throw new HttpsError("invalid-argument", "اختر نوع تعامل واحدًا على الأقل (بيع/تأجير/استهلاك).");
    }
    if (estimatedCost !== null && (!Number.isFinite(estimatedCost) || estimatedCost < 0)) {
      throw new HttpsError("invalid-argument", "التكلفة التقديرية غير صحيحة.");
    }

    if (preferredVendorId) {
      const vDoc = await db.collection(COLLECTIONS.VENDORS).doc(preferredVendorId).get();
      if (!vDoc.exists || vDoc.data().tenantId !== callerTenantId) {
        throw new HttpsError("invalid-argument", "المورّد المفضّل غير صحيح.");
      }
    }

    const itemRef = db.collection(COLLECTIONS.ITEMS).doc();
    await itemRef.set(
      buildItemDoc({ tenantId: callerTenantId, name, itemCode, category, unit, dealTypes, description, preferredVendorId: preferredVendorId || null, estimatedCost, createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp() })
    );
    return { id: itemRef.id, name: name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createItem failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الصنف، حاول مرة أخرى.");
  }
});

// ===== المشتريات: إرسال تكلفة الصنف للمالية =====
exports.submitItemCost = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROCUREMENT);
    const data = request.data || {};
    const itemId = typeof data.itemId === "string" ? data.itemId.trim() : "";
    const estimatedCost = Number(data.estimatedCost);

    if (!itemId) throw new HttpsError("invalid-argument", "يجب تحديد الصنف.");
    if (!Number.isFinite(estimatedCost) || estimatedCost < 0) {
      throw new HttpsError("invalid-argument", "التكلفة التقديرية غير صحيحة.");
    }

    const itemRef = db.collection(COLLECTIONS.ITEMS).doc(itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists || itemSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الصنف غير صحيح.");
    }
    const item = itemSnap.data();
    if (item.costStatus === COST_STATUS.PENDING_FINANCE) {
      throw new HttpsError("failed-precondition", "التكلفة قيد المراجعة من المالية بالفعل.");
    }

    await itemRef.update({ estimatedCost: estimatedCost, costStatus: COST_STATUS.PENDING_FINANCE });
    return { itemId: itemId, costStatus: COST_STATUS.PENDING_FINANCE };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("submitItemCost failed:", err);
    throw new HttpsError("internal", "تعذّر إرسال التكلفة، حاول مرة أخرى.");
  }
});

// ===== المالية: اعتماد أو رفض تكلفة الصنف (مع تحديد الضرائب) =====
exports.approveItemCost = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);
    const data = request.data || {};
    const itemId = typeof data.itemId === "string" ? data.itemId.trim() : "";
    const action = data.action;
    const approvedCost = data.approvedCost !== undefined && data.approvedCost !== null && data.approvedCost !== ""
      ? Number(data.approvedCost) : null;
    const taxConfigInput = data.taxConfig;

    if (!itemId) throw new HttpsError("invalid-argument", "يجب تحديد الصنف.");
    if (action !== "approve" && action !== "reject") {
      throw new HttpsError("invalid-argument", "إجراء غير صحيح.");
    }

    const itemRef = db.collection(COLLECTIONS.ITEMS).doc(itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists || itemSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الصنف غير صحيح.");
    }
    const item = itemSnap.data();
    if (item.costStatus !== COST_STATUS.PENDING_FINANCE) {
      throw new HttpsError("failed-precondition", "هذا الصنف ليس بانتظار اعتماد المالية.");
    }

    if (action === "reject") {
      await itemRef.update({ costStatus: COST_STATUS.REJECTED, approvedBy: request.auth.uid });
      return { itemId: itemId, costStatus: COST_STATUS.REJECTED };
    }

    const finalCost = approvedCost !== null ? approvedCost : item.estimatedCost;
    if (!Number.isFinite(finalCost) || finalCost < 0) {
      throw new HttpsError("invalid-argument", "التكلفة المعتمدة غير صحيحة.");
    }

    // بناء ضريبة الصنف (المالية تحدّدها عند الاعتماد)
    let taxConfig;
    if (taxConfigInput && typeof taxConfigInput === "object") {
      const candidate = buildTaxConfig({
        vatApplicable: taxConfigInput.vatApplicable === true,
        vatRate: Number(taxConfigInput.vatRate),
        exciseApplicable: taxConfigInput.exciseApplicable === true,
        exciseRate: Number(taxConfigInput.exciseRate),
      });
      if (!validateTaxConfig(candidate)) {
        throw new HttpsError("invalid-argument", "إعدادات الضريبة غير صحيحة.");
      }
      taxConfig = candidate;
    } else {
      // لم تُرسل ضريبة — اعتبره معفى افتراضيًا
      taxConfig = buildTaxConfig({ vatApplicable: false, vatRate: 15, exciseApplicable: false, exciseRate: 0 });
    }

    await itemRef.update({
      approvedCost: finalCost,
      costStatus: COST_STATUS.APPROVED,
      taxConfig: taxConfig,
      approvedBy: request.auth.uid,
    });
    return { itemId: itemId, costStatus: COST_STATUS.APPROVED, approvedCost: finalCost, taxConfig: taxConfig };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("approveItemCost failed:", err);
    throw new HttpsError("internal", "تعذّر اعتماد التكلفة، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== المالية (IFRS) — دليل الحسابات =====
// ═══════════════════════════════════════════════════════

exports.seedChartOfAccounts = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);

    const existing = await db.collection(COLLECTIONS.ACCOUNTS)
      .where("tenantId", "==", callerTenantId)
      .limit(1)
      .get();
    if (!existing.empty) {
      throw new HttpsError("already-exists", "دليل الحسابات موجود بالفعل لهذه الشركة.");
    }

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    let count = 0;
    for (const acc of DEFAULT_CHART_OF_ACCOUNTS) {
      const ref = db.collection(COLLECTIONS.ACCOUNTS).doc();
      batch.set(ref, buildAccountDoc({
        tenantId: callerTenantId,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        subtype: acc.subtype,
        parentId: null,
        isSystem: true,
        createdBy: request.auth.uid,
        createdAt: now,
      }));
      count++;
    }
    await batch.commit();

    return { seeded: count };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("seedChartOfAccounts failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء دليل الحسابات، حاول مرة أخرى.");
  }
});

exports.createAccount = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);

    const data = request.data || {};
    const code = typeof data.code === "string" ? data.code.trim() : "";
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const type = typeof data.type === "string" ? data.type.trim() : "";
    const subtype = typeof data.subtype === "string" ? data.subtype.trim() : "";

    if (!code) {
      throw new HttpsError("invalid-argument", "رقم الحساب مطلوب.");
    }
    if (!/^\d{3,6}$/.test(code)) {
      throw new HttpsError("invalid-argument", "رقم الحساب يجب أن يكون من 3 إلى 6 أرقام.");
    }
    if (name.length < 2) {
      throw new HttpsError("invalid-argument", "اسم الحساب مطلوب (حرفان على الأقل).");
    }
    if (!validateAccountType(type)) {
      throw new HttpsError("invalid-argument", "نوع الحساب غير صحيح.");
    }

    const dup = await db.collection(COLLECTIONS.ACCOUNTS)
      .where("tenantId", "==", callerTenantId)
      .where("code", "==", code)
      .limit(1)
      .get();
    if (!dup.empty) {
      throw new HttpsError("already-exists", "رقم الحساب مستخدم بالفعل.");
    }

    const accRef = db.collection(COLLECTIONS.ACCOUNTS).doc();
    await accRef.set(buildAccountDoc({
      tenantId: callerTenantId,
      code: code,
      name: name,
      type: type,
      subtype: subtype || null,
      parentId: null,
      isSystem: false,
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    }));

    return { id: accRef.id, code: code, name: name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createAccount failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الحساب، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== المالية: محرّك القيد المزدوج =====
// ═══════════════════════════════════════════════════════

exports.createJournalEntry = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);

    const data = request.data || {};
    const date = typeof data.date === "string" ? data.date.trim() : "";
    const description = typeof data.description === "string" ? data.description.trim() : "";
    const rawLines = data.lines;
    const source = typeof data.source === "string" ? data.source.trim() : "manual";
    const sourceRef = typeof data.sourceRef === "string" ? data.sourceRef.trim() : null;

    if (!isValidDate(date)) {
      throw new HttpsError("invalid-argument", "تاريخ القيد غير صحيح (YYYY-MM-DD).");
    }

    const check = validateJournalLines(rawLines);
    if (!check.valid) {
      throw new HttpsError("invalid-argument", check.error);
    }
    const { totalDebit, totalCredit, cleanLines } = check;

    const accountIds = [...new Set(cleanLines.map((l) => l.accountId))];

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const entryRef = db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc();

    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) {
        throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      }
      const lastNumber = tenantSnap.data().lastJournalNumber || 0;
      const nextNumber = lastNumber + 1;

      const accRefs = accountIds.map((id) => db.collection(COLLECTIONS.ACCOUNTS).doc(id));
      const accSnaps = await Promise.all(accRefs.map((ref) => tx.get(ref)));

      const accMap = {};
      for (let i = 0; i < accountIds.length; i++) {
        const snap = accSnaps[i];
        if (!snap.exists) {
          throw new HttpsError("invalid-argument", "أحد الحسابات غير موجود.");
        }
        const accData = snap.data();
        if (accData.tenantId !== callerTenantId) {
          throw new HttpsError("permission-denied", "أحد الحسابات لا يخصّ شركتك.");
        }
        if (accData.isActive === false) {
          throw new HttpsError("failed-precondition", `الحساب «${accData.name}» غير نشط.`);
        }
        accMap[accountIds[i]] = { ref: accRefs[i], data: accData };
      }

      const balanceDelta = {};
      const enrichedLines = [];
      for (const ln of cleanLines) {
        const acc = accMap[ln.accountId].data;
        const normalSide = acc.normalSide || "debit";
        let delta;
        if (normalSide === "debit") {
          delta = ln.debit - ln.credit;
        } else {
          delta = ln.credit - ln.debit;
        }
        balanceDelta[ln.accountId] = (balanceDelta[ln.accountId] || 0) + delta;

        enrichedLines.push({
          accountId: ln.accountId,
          accountCode: acc.code || null,
          accountName: acc.name || null,
          debit: ln.debit,
          credit: ln.credit,
          note: ln.note || null,
        });
      }

      const entryDoc = buildJournalEntryDoc({
        tenantId: callerTenantId,
        entryNumber: nextNumber,
        date: date,
        description: description || null,
        lines: enrichedLines,
        totalDebit: totalDebit,
        totalCredit: totalCredit,
        source: source,
        sourceRef: sourceRef,
        status: JOURNAL_STATUS.POSTED,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      entryDoc.postedAt = FieldValue.serverTimestamp();
      tx.set(entryRef, entryDoc);

      for (const accId of Object.keys(balanceDelta)) {
        const delta = balanceDelta[accId];
        if (delta !== 0) {
          tx.update(accMap[accId].ref, {
            balance: FieldValue.increment(delta),
          });
        }
      }

      tx.update(tenantRef, { lastJournalNumber: nextNumber });

      return { entryNumber: nextNumber };
    });

    return {
      id: entryRef.id,
      entryNumber: result.entryNumber,
      totalDebit: totalDebit,
      totalCredit: totalCredit,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createJournalEntry failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء القيد، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== المالية: العملاء (Customer Master) =====
// ═══════════════════════════════════════════════════════

// ===== إنشاء عميل =====
exports.createCustomer = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);

    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const customerCode = typeof data.customerCode === "string" ? data.customerCode.trim() : "";
    const taxNumber = typeof data.taxNumber === "string" ? data.taxNumber.trim() : "";
    const crNumber = typeof data.crNumber === "string" ? data.crNumber.trim() : "";
    const contactPerson = typeof data.contactPerson === "string" ? data.contactPerson.trim() : "";
    const phone = typeof data.phone === "string" ? data.phone.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim() : "";
    // العنوان الوطني
    const buildingNumber = typeof data.buildingNumber === "string" ? data.buildingNumber.trim() : "";
    const street = typeof data.street === "string" ? data.street.trim() : "";
    const district = typeof data.district === "string" ? data.district.trim() : "";
    const city = typeof data.city === "string" ? data.city.trim() : "";
    const postalCode = typeof data.postalCode === "string" ? data.postalCode.trim() : "";
    const additionalNumber = typeof data.additionalNumber === "string" ? data.additionalNumber.trim() : "";

    if (name.length < 2) {
      throw new HttpsError("invalid-argument", "اسم العميل مطلوب (حرفان على الأقل).");
    }
    // الرقم الضريبي السعودي: 15 رقمًا يبدأ وينتهي بـ 3 (إن أُدخل)
    if (taxNumber && !/^3\d{13}3$/.test(taxNumber)) {
      throw new HttpsError("invalid-argument", "الرقم الضريبي يجب أن يكون 15 رقمًا يبدأ وينتهي بالرقم 3.");
    }

    const customerRef = db.collection(COLLECTIONS.CUSTOMERS).doc();
    await customerRef.set(
      buildCustomerDoc({
        tenantId: callerTenantId,
        name, customerCode, taxNumber, crNumber,
        contactPerson, phone, email,
        buildingNumber, street, district, city, postalCode, additionalNumber,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      })
    );
    return { id: customerRef.id, name: name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createCustomer failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء العميل، حاول مرة أخرى.");
  }
});

// ===== تعديل عميل =====
exports.updateCustomer = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);

    const data = request.data || {};
    const customerId = typeof data.customerId === "string" ? data.customerId.trim() : "";
    if (!customerId) throw new HttpsError("invalid-argument", "يجب تحديد العميل.");

    const customerRef = db.collection(COLLECTIONS.CUSTOMERS).doc(customerId);
    const snap = await customerRef.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "العميل غير صحيح.");
    }

    const name = typeof data.name === "string" ? data.name.trim() : "";
    const taxNumber = typeof data.taxNumber === "string" ? data.taxNumber.trim() : "";
    if (name.length < 2) {
      throw new HttpsError("invalid-argument", "اسم العميل مطلوب (حرفان على الأقل).");
    }
    if (taxNumber && !/^3\d{13}3$/.test(taxNumber)) {
      throw new HttpsError("invalid-argument", "الرقم الضريبي يجب أن يكون 15 رقمًا يبدأ وينتهي بالرقم 3.");
    }

    const update = {
      name,
      customerCode: typeof data.customerCode === "string" ? data.customerCode.trim() || null : null,
      taxNumber: taxNumber || null,
      crNumber: typeof data.crNumber === "string" ? data.crNumber.trim() || null : null,
      contactPerson: typeof data.contactPerson === "string" ? data.contactPerson.trim() || null : null,
      phone: typeof data.phone === "string" ? data.phone.trim() || null : null,
      email: typeof data.email === "string" ? data.email.trim() || null : null,
      address: {
        buildingNumber: typeof data.buildingNumber === "string" ? data.buildingNumber.trim() || null : null,
        street: typeof data.street === "string" ? data.street.trim() || null : null,
        district: typeof data.district === "string" ? data.district.trim() || null : null,
        city: typeof data.city === "string" ? data.city.trim() || null : null,
        postalCode: typeof data.postalCode === "string" ? data.postalCode.trim() || null : null,
        additionalNumber: typeof data.additionalNumber === "string" ? data.additionalNumber.trim() || null : null,
      },
    };

    await customerRef.update(update);
    return { id: customerId, name: name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateCustomer failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل العميل، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== المالية: محرّك الفاتورة (مع القيد التلقائي) =====
// ═══════════════════════════════════════════════════════

// ===== إنشاء فاتورة قياسية + توليد قيدها المحاسبي (ذرّيًا) =====
// data: { date, customerId, revenueAccountId, lines:[...], notes? }
exports.createInvoice = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);

    const data = request.data || {};
    const date = typeof data.date === "string" ? data.date.trim() : "";
    const customerId = typeof data.customerId === "string" ? data.customerId.trim() : "";
    const revenueAccountId = typeof data.revenueAccountId === "string" ? data.revenueAccountId.trim() : "";
    const notes = typeof data.notes === "string" ? data.notes.trim() : "";
    const rawLines = data.lines;
    // طريقة الدفع: "cash" نقدي (القيد للخزينة) أو "credit" آجل (القيد للذمم المدينة)
    const paymentMethod = data.paymentMethod === "cash" ? "cash" : "credit";

    if (!isValidDate(date)) {
      throw new HttpsError("invalid-argument", "تاريخ الفاتورة غير صحيح (YYYY-MM-DD).");
    }
    if (!customerId) {
      throw new HttpsError("invalid-argument", "يجب اختيار العميل.");
    }
    if (!revenueAccountId) {
      throw new HttpsError("invalid-argument", "يجب اختيار حساب الإيراد.");
    }

    // احسب الضرائب والإجماليات (الانتقائية أولًا ثم القيمة المضافة)
    const calc = computeInvoiceTotals(rawLines);
    if (!calc.valid) {
      throw new HttpsError("invalid-argument", calc.error);
    }
    const { lines, subtotal, totalExcise, totalVat, total } = calc;

    if (total <= 0) {
      throw new HttpsError("invalid-argument", "إجمالي الفاتورة يجب أن يكون أكبر من صفر.");
    }

    // اقرأ العميل (للتحقق ولأخذ لقطة بياناته)
    const customerRef = db.collection(COLLECTIONS.CUSTOMERS).doc(customerId);
    const customerSnap = await customerRef.get();
    if (!customerSnap.exists || customerSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "العميل غير صحيح.");
    }
    const customerData = customerSnap.data();
    // لقطة بيانات العميل وقت الإصدار
    const customerSnapshot = {
      name: customerData.name || null,
      taxNumber: customerData.taxNumber || null,
      crNumber: customerData.crNumber || null,
      address: customerData.address || null,
      phone: customerData.phone || null,
    };

    // جهّز مراجع الحسابات المطلوبة للقيد
    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const invoiceRef = db.collection(COLLECTIONS.INVOICES).doc();
    const journalRef = db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc();

    // ابحث عن حسابات القيد بالأكواد المعيارية (ضمن الشركة)
    async function findAccountByCode(code) {
      const snap = await db.collection(COLLECTIONS.ACCOUNTS)
        .where("tenantId", "==", callerTenantId)
        .where("code", "==", code)
        .limit(1)
        .get();
      return snap.empty ? null : snap.docs[0];
    }

    const [receivableDoc, vatDoc, exciseDoc, treasuryDoc] = await Promise.all([
      findAccountByCode(INVOICE_ACCOUNT_CODES.RECEIVABLE),
      findAccountByCode(INVOICE_ACCOUNT_CODES.VAT_PAYABLE),
      findAccountByCode(INVOICE_ACCOUNT_CODES.EXCISE_PAYABLE),
      findAccountByCode(TREASURY_ACCOUNT_CODE),
    ]);

    // الطرف المدين يعتمد على طريقة الدفع: نقدي=الخزينة، آجل=الذمم المدينة
    if (paymentMethod === "cash" && !treasuryDoc) {
      throw new HttpsError("failed-precondition", `حساب النقد/الخزينة (${TREASURY_ACCOUNT_CODE}) غير موجود في دليل الحسابات.`);
    }
    if (paymentMethod === "credit" && !receivableDoc) {
      throw new HttpsError("failed-precondition", `حساب الذمم المدينة (${INVOICE_ACCOUNT_CODES.RECEIVABLE}) غير موجود في دليل الحسابات.`);
    }
    if (totalVat > 0 && !vatDoc) {
      throw new HttpsError("failed-precondition", `حساب ضريبة القيمة المضافة (${INVOICE_ACCOUNT_CODES.VAT_PAYABLE}) غير موجود في دليل الحسابات.`);
    }
    if (totalExcise > 0 && !exciseDoc) {
      throw new HttpsError("failed-precondition", `حساب الضريبة الانتقائية (${INVOICE_ACCOUNT_CODES.EXCISE_PAYABLE}) غير موجود في دليل الحسابات.`);
    }

    // تحقّق من حساب الإيراد المختار
    const revenueRef = db.collection(COLLECTIONS.ACCOUNTS).doc(revenueAccountId);

    // المعاملة الذرّية: ترقيم + كتابة الفاتورة + كتابة القيد + تحديث الأرصدة
    const result = await db.runTransaction(async (tx) => {
      // اقرأ الشركة (العدّادات)
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) {
        throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      }
      const tData = tenantSnap.data();
      const nextInvoiceNumber = (tData.lastInvoiceNumber || 0) + 1;
      const nextJournalNumber = (tData.lastJournalNumber || 0) + 1;

      // اقرأ حساب الإيراد وتحقّق
      const revenueSnap = await tx.get(revenueRef);
      if (!revenueSnap.exists) {
        throw new HttpsError("invalid-argument", "حساب الإيراد غير موجود.");
      }
      const revenueData = revenueSnap.data();
      if (revenueData.tenantId !== callerTenantId) {
        throw new HttpsError("permission-denied", "حساب الإيراد لا يخصّ شركتك.");
      }
      if (revenueData.type !== "revenue") {
        throw new HttpsError("invalid-argument", "الحساب المختار ليس حساب إيراد.");
      }
      if (revenueData.isActive === false) {
        throw new HttpsError("failed-precondition", "حساب الإيراد غير نشط.");
      }

      // الطرف المدين حسب طريقة الدفع: الخزينة (نقدي) أو الذمم المدينة (آجل)
      const debitDoc = paymentMethod === "cash" ? treasuryDoc : receivableDoc;
      const debitRef = debitDoc.ref;
      const debitSnapTx = await tx.get(debitRef);
      const debitBalance = debitSnapTx.data();

      let vatRef = null, exciseRef = null;
      if (totalVat > 0) {
        vatRef = vatDoc.ref;
        await tx.get(vatRef);
      }
      if (totalExcise > 0) {
        exciseRef = exciseDoc.ref;
        await tx.get(exciseRef);
      }

      // ===== بناء أطراف القيد =====
      // مدين: الذمم المدينة (الإجمالي)
      // دائن: الإيراد (الأساس) + VAT + الانتقائية
      const journalLines = [];
      // الطرف المدين: الخزينة (نقدي) أو العميل/الذمم (آجل)
      journalLines.push({
        accountId: debitRef.id,
        accountCode: debitBalance.code || null,
        accountName: debitBalance.name || null,
        debit: total,
        credit: 0,
        note: paymentMethod === "cash"
          ? `تحصيل نقدي — فاتورة ${customerSnapshot.name || ""}`.trim()
          : `فاتورة آجلة — ${customerSnapshot.name || ""}`.trim(),
      });
      // الطرف الدائن: الإيراد
      journalLines.push({
        accountId: revenueRef.id,
        accountCode: revenueData.code || null,
        accountName: revenueData.name || null,
        debit: 0,
        credit: subtotal,
        note: "إيراد",
      });
      // الطرف الدائن: القيمة المضافة (إن وُجدت)
      if (totalVat > 0) {
        journalLines.push({
          accountId: vatRef.id,
          accountCode: vatDoc.data().code || null,
          accountName: vatDoc.data().name || null,
          debit: 0,
          credit: totalVat,
          note: "ضريبة القيمة المضافة",
        });
      }
      // الطرف الدائن: الانتقائية (إن وُجدت)
      if (totalExcise > 0) {
        journalLines.push({
          accountId: exciseRef.id,
          accountCode: exciseDoc.data().code || null,
          accountName: exciseDoc.data().name || null,
          debit: 0,
          credit: totalExcise,
          note: "ضريبة انتقائية",
        });
      }

      // تحقّق التوازن (أمان إضافي)
      const check = validateJournalLines(journalLines);
      if (!check.valid) {
        throw new HttpsError("internal", "خطأ في توازن قيد الفاتورة: " + check.error);
      }

      // ===== اكتب القيد =====
      const entryDoc = buildJournalEntryDoc({
        tenantId: callerTenantId,
        entryNumber: nextJournalNumber,
        date: date,
        description: `قيد فاتورة رقم ${nextInvoiceNumber} — ${customerSnapshot.name || ""}`.trim(),
        lines: check.cleanLines,
        totalDebit: check.totalDebit,
        totalCredit: check.totalCredit,
        source: "invoice",
        sourceRef: invoiceRef.id,
        status: JOURNAL_STATUS.POSTED,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      entryDoc.postedAt = FieldValue.serverTimestamp();
      tx.set(journalRef, entryDoc);

      // ===== حدّث أرصدة الحسابات =====
      // الطرف المدين (خزينة أو ذمم — كلاهما أصل مدين الطبيعة): +total
      tx.update(debitRef, { balance: FieldValue.increment(total) });
      // الإيراد (دائن الطبيعة): +subtotal
      tx.update(revenueRef, { balance: FieldValue.increment(subtotal) });
      // VAT (خصم، دائن الطبيعة): +totalVat
      if (totalVat > 0) {
        tx.update(vatRef, { balance: FieldValue.increment(totalVat) });
      }
      // الانتقائية (خصم، دائن الطبيعة): +totalExcise
      if (totalExcise > 0) {
        tx.update(exciseRef, { balance: FieldValue.increment(totalExcise) });
      }

      // ===== اكتب الفاتورة =====
      const invoiceDoc = buildInvoiceDoc({
        tenantId: callerTenantId,
        invoiceNumber: nextInvoiceNumber,
        uuid: invoiceRef.id,  // UUID مؤقت (المعرّف نفسه) — يُستبدل بـ ZATCA UUID عند الربط
        date: date,
        customerId: customerId,
        customerSnapshot: customerSnapshot,
        revenueAccountId: revenueAccountId,
        lines: lines,
        subtotal: subtotal,
        totalExcise: totalExcise,
        totalVat: totalVat,
        total: total,
        journalEntryId: journalRef.id,
        notes: notes || null,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      // طريقة الدفع وحالة السداد (نقدي=مدفوعة بالكامل، آجل=بانتظار التحصيل)
      invoiceDoc.paymentMethod = paymentMethod;
      invoiceDoc.paymentStatus = paymentMethod === "cash" ? "paid" : "unpaid";
      invoiceDoc.paidAmount = paymentMethod === "cash" ? total : 0;
      invoiceDoc.remainingAmount = paymentMethod === "cash" ? 0 : total;
      tx.set(invoiceRef, invoiceDoc);

      // ===== زِد العدّادات =====
      tx.update(tenantRef, {
        lastInvoiceNumber: nextInvoiceNumber,
        lastJournalNumber: nextJournalNumber,
      });

      return { invoiceNumber: nextInvoiceNumber, journalNumber: nextJournalNumber };
    });

    return {
      id: invoiceRef.id,
      invoiceNumber: result.invoiceNumber,
      journalEntryId: journalRef.id,
      paymentMethod: paymentMethod,
      total: total,
      subtotal: subtotal,
      totalVat: totalVat,
      totalExcise: totalExcise,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createInvoice failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الفاتورة، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== المالية: التحصيل (سند قبض على فاتورة آجلة) =====
// ═══════════════════════════════════════════════════════

// ===== إنشاء سند قبض + قيده المحاسبي (مدين الخزينة / دائن الذمم) ذرّيًا =====
// data: { invoiceId, amount, date, method?, notes? }
exports.createReceipt = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);

    const data = request.data || {};
    const invoiceId = typeof data.invoiceId === "string" ? data.invoiceId.trim() : "";
    const date = typeof data.date === "string" ? data.date.trim() : "";
    const amount = Number(data.amount);
    const method = ["cash", "transfer", "cheque"].includes(data.method) ? data.method : "cash";
    const notes = typeof data.notes === "string" ? data.notes.trim() : "";

    if (!invoiceId) {
      throw new HttpsError("invalid-argument", "يجب تحديد الفاتورة.");
    }
    if (!isValidDate(date)) {
      throw new HttpsError("invalid-argument", "تاريخ التحصيل غير صحيح (YYYY-MM-DD).");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpsError("invalid-argument", "مبلغ التحصيل يجب أن يكون أكبر من صفر.");
    }

    // اقرأ الفاتورة
    const invoiceRef = db.collection(COLLECTIONS.INVOICES).doc(invoiceId);
    const invoiceSnap = await invoiceRef.get();
    if (!invoiceSnap.exists || invoiceSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الفاتورة غير صحيحة.");
    }
    const invoice = invoiceSnap.data();

    // التحصيل للفواتير الآجلة فقط (النقدية مدفوعة أصلاً)
    const payMethod = invoice.paymentMethod || "credit";
    if (payMethod === "cash") {
      throw new HttpsError("failed-precondition", "هذه فاتورة نقدية ومدفوعة بالكامل — لا تحتاج تحصيلًا.");
    }

    // المبالغ الحالية (مع توافق الفواتير القديمة التي لا تحمل الحقول)
    const currentRemaining = invoice.remainingAmount != null
      ? Number(invoice.remainingAmount)
      : Number(invoice.total) || 0;
    if (currentRemaining <= 0) {
      throw new HttpsError("failed-precondition", "هذه الفاتورة مسدّدة بالكامل.");
    }
    if (amount > currentRemaining + 0.01) {
      throw new HttpsError("invalid-argument", `مبلغ التحصيل (${amount}) يتجاوز المتبقّي على الفاتورة (${currentRemaining}).`);
    }

    // حسابات القيد: الخزينة (مدين) + الذمم المدينة (دائن)
    async function findAccountByCode(code) {
      const snap = await db.collection(COLLECTIONS.ACCOUNTS)
        .where("tenantId", "==", callerTenantId)
        .where("code", "==", code)
        .limit(1)
        .get();
      return snap.empty ? null : snap.docs[0];
    }
    const [treasuryDoc, receivableDoc] = await Promise.all([
      findAccountByCode(TREASURY_ACCOUNT_CODE),
      findAccountByCode(INVOICE_ACCOUNT_CODES.RECEIVABLE),
    ]);
    if (!treasuryDoc) {
      throw new HttpsError("failed-precondition", `حساب النقد/الخزينة (${TREASURY_ACCOUNT_CODE}) غير موجود في دليل الحسابات.`);
    }
    if (!receivableDoc) {
      throw new HttpsError("failed-precondition", `حساب الذمم المدينة (${INVOICE_ACCOUNT_CODES.RECEIVABLE}) غير موجود في دليل الحسابات.`);
    }

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const receiptRef = db.collection(COLLECTIONS.RECEIPTS).doc();
    const journalRef = db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc();

    // المعاملة الذرّية
    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) {
        throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      }
      const tData = tenantSnap.data();
      const nextReceiptNumber = (tData.lastReceiptNumber || 0) + 1;
      const nextJournalNumber = (tData.lastJournalNumber || 0) + 1;

      // اقرأ الحسابات داخل المعاملة
      const treasuryRef = treasuryDoc.ref;
      const receivableRef = receivableDoc.ref;
      const treasurySnapTx = await tx.get(treasuryRef);
      const receivableSnapTx = await tx.get(receivableRef);
      const treasuryData = treasurySnapTx.data();
      const receivableData = receivableSnapTx.data();

      // أعد قراءة الفاتورة داخل المعاملة (تفادي السباق)
      const invTx = await tx.get(invoiceRef);
      const invData = invTx.data();
      const paidTx = Number(invData.paidAmount) || 0;
      const remainingTx = invData.remainingAmount != null
        ? Number(invData.remainingAmount)
        : Number(invData.total) || 0;
      if (amount > remainingTx + 0.01) {
        throw new HttpsError("invalid-argument", "تغيّر المتبقّي على الفاتورة، أعد المحاولة.");
      }

      // ===== بناء القيد: مدين الخزينة / دائن الذمم =====
      const journalLines = [
        {
          accountId: treasuryRef.id,
          accountCode: treasuryData.code || null,
          accountName: treasuryData.name || null,
          debit: amount,
          credit: 0,
          note: `تحصيل فاتورة رقم ${invData.invoiceNumber || ""}`.trim(),
        },
        {
          accountId: receivableRef.id,
          accountCode: receivableData.code || null,
          accountName: receivableData.name || null,
          debit: 0,
          credit: amount,
          note: `سداد ${invoice.customerSnapshot ? (invoice.customerSnapshot.name || "") : ""}`.trim(),
        },
      ];

      const check = validateJournalLines(journalLines);
      if (!check.valid) {
        throw new HttpsError("internal", "خطأ في توازن قيد التحصيل: " + check.error);
      }

      // ===== اكتب القيد =====
      const entryDoc = buildJournalEntryDoc({
        tenantId: callerTenantId,
        entryNumber: nextJournalNumber,
        date: date,
        description: `قيد تحصيل سند رقم ${nextReceiptNumber} — فاتورة ${invData.invoiceNumber || ""}`.trim(),
        lines: check.cleanLines,
        totalDebit: check.totalDebit,
        totalCredit: check.totalCredit,
        source: "receipt",
        sourceRef: receiptRef.id,
        status: JOURNAL_STATUS.POSTED,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      entryDoc.postedAt = FieldValue.serverTimestamp();
      tx.set(journalRef, entryDoc);

      // ===== حدّث الأرصدة: خزينة +amount، ذمم -amount =====
      tx.update(treasuryRef, { balance: FieldValue.increment(amount) });
      tx.update(receivableRef, { balance: FieldValue.increment(-amount) });

      // ===== حدّث الفاتورة: المدفوع/المتبقّي/الحالة =====
      const newPaid = Math.round((paidTx + amount) * 100) / 100;
      const newRemainingRaw = Math.round((remainingTx - amount) * 100) / 100;
      const newRemaining = newRemainingRaw < 0 ? 0 : newRemainingRaw;
      const newStatus = newRemaining <= 0.01 ? "paid" : "partial";
      tx.update(invoiceRef, {
        paidAmount: newPaid,
        remainingAmount: newRemaining,
        paymentStatus: newStatus,
      });

      // ===== اكتب سند القبض =====
      const receiptDoc = buildReceiptDoc({
        tenantId: callerTenantId,
        receiptNumber: nextReceiptNumber,
        date: date,
        invoiceId: invoiceId,
        invoiceNumber: invData.invoiceNumber || null,
        customerId: invData.customerId || null,
        customerSnapshot: invData.customerSnapshot || null,
        amount: amount,
        method: method,
        journalEntryId: journalRef.id,
        notes: notes || null,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(receiptRef, receiptDoc);

      // ===== زِد العدّادات =====
      tx.update(tenantRef, {
        lastReceiptNumber: nextReceiptNumber,
        lastJournalNumber: nextJournalNumber,
      });

      return {
        receiptNumber: nextReceiptNumber,
        newPaid: newPaid,
        newRemaining: newRemaining,
        newStatus: newStatus,
      };
    });

    return {
      id: receiptRef.id,
      receiptNumber: result.receiptNumber,
      journalEntryId: journalRef.id,
      amount: amount,
      paidAmount: result.newPaid,
      remainingAmount: result.newRemaining,
      paymentStatus: result.newStatus,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createReceipt failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء سند القبض، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== المالية: الإقفال المحاسبي (إقفال الإيرادات والمصروفات) =====
// ═══════════════════════════════════════════════════════

// أداة مشتركة: تحسب صافي الإيرادات/المصروفات للفترة (من القيود المعتمدة، عدا قيود الإقفال)
async function computePeriodResult(callerTenantId, fromDate, toDate) {
  const accSnap = await db.collection(COLLECTIONS.ACCOUNTS).where("tenantId", "==", callerTenantId).get();
  const accounts = {};
  accSnap.docs.forEach((d) => { accounts[d.id] = { id: d.id, ...d.data() }; });

  const retained = Object.values(accounts).find((a) => a.code === RETAINED_EARNINGS_CODE) || null;

  const jeSnap = await db.collection(COLLECTIONS.JOURNAL_ENTRIES).where("tenantId", "==", callerTenantId).get();
  const periodNet = {}; // accountId -> (credit - debit) صافي ضمن الفترة
  for (const jeDoc of jeSnap.docs) {
    const je = jeDoc.data();
    if (je.status && je.status !== JOURNAL_STATUS.POSTED) continue;
    if (je.source === "closing" || je.source === "closing_reversal") continue;
    const d = je.date;
    if (!d || d < fromDate || d > toDate) continue;
    for (const ln of (je.lines || [])) {
      const acc = accounts[ln.accountId];
      if (!acc) continue;
      if (acc.type === ACCOUNT_TYPES.REVENUE || acc.type === ACCOUNT_TYPES.EXPENSE) {
        const net = (Number(ln.credit) || 0) - (Number(ln.debit) || 0);
        periodNet[ln.accountId] = (periodNet[ln.accountId] || 0) + net;
      }
    }
  }

  const r = (n) => Math.round(n * 100) / 100;
  const revenues = [], expenses = [];
  let totalRevenue = 0, totalExpense = 0;
  for (const [id, acc] of Object.entries(accounts)) {
    const net = periodNet[id] || 0;
    if (acc.type === ACCOUNT_TYPES.REVENUE) {
      const amt = r(net);                  // الإيراد: صافيه دائن
      if (amt !== 0) revenues.push({ accountId: id, code: acc.code, name: acc.name, amount: amt });
      totalRevenue += net;
    } else if (acc.type === ACCOUNT_TYPES.EXPENSE) {
      const amt = r(-net);                 // المصروف: صافيه مدين = -(credit-debit)
      if (amt !== 0) expenses.push({ accountId: id, code: acc.code, name: acc.name, amount: amt });
      totalExpense += -net;
    }
  }
  revenues.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
  expenses.sort((a, b) => (a.code || "").localeCompare(b.code || ""));

  return {
    accounts: accounts,
    retained: retained,
    revenues: revenues,
    expenses: expenses,
    periodNet: periodNet,
    totalRevenue: r(totalRevenue),
    totalExpense: r(totalExpense),
    netIncome: r(totalRevenue - totalExpense),
  };
}

// ===== معاينة الإقفال (لا تكتب شيئًا) =====
// data: { fromDate, toDate }
exports.getClosingPreview = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);
    const data = request.data || {};
    const fromDate = typeof data.fromDate === "string" ? data.fromDate.trim() : "";
    const toDate = typeof data.toDate === "string" ? data.toDate.trim() : "";
    if (!isValidDate(fromDate) || !isValidDate(toDate)) {
      throw new HttpsError("invalid-argument", "التواريخ غير صحيحة (YYYY-MM-DD).");
    }
    if (fromDate > toDate) throw new HttpsError("invalid-argument", "بداية الفترة بعد نهايتها.");

    const res = await computePeriodResult(callerTenantId, fromDate, toDate);

    // فحص التداخل مع إقفالات سابقة نشطة
    const closeSnap = await db.collection(COLLECTIONS.CLOSINGS).where("tenantId", "==", callerTenantId).get();
    let overlap = null;
    for (const cDoc of closeSnap.docs) {
      const c = cDoc.data();
      if (c.status !== "closed") continue;
      if (c.fromDate <= toDate && fromDate <= c.toDate) {
        overlap = { closingNumber: c.closingNumber, fromDate: c.fromDate, toDate: c.toDate };
        break;
      }
    }

    return {
      fromDate: fromDate,
      toDate: toDate,
      revenues: res.revenues,
      expenses: res.expenses,
      totalRevenue: res.totalRevenue,
      totalExpense: res.totalExpense,
      netIncome: res.netIncome,
      hasRetainedAccount: !!res.retained,
      retainedAccount: res.retained ? { code: res.retained.code, name: res.retained.name } : null,
      overlap: overlap,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getClosingPreview failed:", err);
    throw new HttpsError("internal", "تعذّر حساب معاينة الإقفال.");
  }
});

// ===== تنفيذ الإقفال (قيد إقفال + ترحيل للأرباح المُبقاة) ذرّيًا =====
// data: { fromDate, toDate }
exports.performClosing = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);
    const data = request.data || {};
    const fromDate = typeof data.fromDate === "string" ? data.fromDate.trim() : "";
    const toDate = typeof data.toDate === "string" ? data.toDate.trim() : "";
    if (!isValidDate(fromDate) || !isValidDate(toDate)) {
      throw new HttpsError("invalid-argument", "التواريخ غير صحيحة (YYYY-MM-DD).");
    }
    if (fromDate > toDate) throw new HttpsError("invalid-argument", "بداية الفترة بعد نهايتها.");

    const res = await computePeriodResult(callerTenantId, fromDate, toDate);
    if (!res.retained) {
      throw new HttpsError("failed-precondition", `حساب الأرباح المُبقاة (${RETAINED_EARNINGS_CODE}) غير موجود في دليل الحسابات.`);
    }

    // فحص التداخل مع إقفال سابق نشط
    const closeSnap = await db.collection(COLLECTIONS.CLOSINGS).where("tenantId", "==", callerTenantId).get();
    for (const cDoc of closeSnap.docs) {
      const c = cDoc.data();
      if (c.status === "closed" && c.fromDate <= toDate && fromDate <= c.toDate) {
        throw new HttpsError("failed-precondition", `الفترة تتداخل مع إقفال سابق رقم ${c.closingNumber} (${c.fromDate} إلى ${c.toDate}). ألغِه أولًا أو اختر فترة مختلفة.`);
      }
    }

    // بناء أطراف القيد: إقفال كل إيراد (مدين) وكل مصروف (دائن)
    const journalLines = [];
    for (const rev of res.revenues) {
      journalLines.push({ accountId: rev.accountId, accountCode: rev.code, accountName: rev.name, debit: rev.amount, credit: 0, note: "إقفال إيراد" });
    }
    for (const exp of res.expenses) {
      journalLines.push({ accountId: exp.accountId, accountCode: exp.code, accountName: exp.name, debit: 0, credit: exp.amount, note: "إقفال مصروف" });
    }
    if (journalLines.length === 0) {
      throw new HttpsError("failed-precondition", "لا توجد إيرادات أو مصروفات في هذه الفترة للإقفال.");
    }

    // طرف الأرباح المُبقاة (الموازن): ربح=دائن، خسارة=مدين
    const netIncome = res.netIncome;
    if (netIncome > 0.005) {
      journalLines.push({ accountId: res.retained.id, accountCode: res.retained.code, accountName: res.retained.name, debit: 0, credit: netIncome, note: "ترحيل صافي الربح" });
    } else if (netIncome < -0.005) {
      journalLines.push({ accountId: res.retained.id, accountCode: res.retained.code, accountName: res.retained.name, debit: -netIncome, credit: 0, note: "ترحيل صافي الخسارة" });
    }

    const check = validateJournalLines(journalLines);
    if (!check.valid) {
      throw new HttpsError("internal", "خطأ في توازن قيد الإقفال: " + check.error);
    }

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const journalRef = db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc();
    const closingRef = db.collection(COLLECTIONS.CLOSINGS).doc();
    const accountIds = [...new Set(check.cleanLines.map((l) => l.accountId))];

    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      const tData = tenantSnap.data();
      const nextJournalNumber = (tData.lastJournalNumber || 0) + 1;
      const nextClosingNumber = (tData.lastClosingNumber || 0) + 1;

      const accRefs = accountIds.map((id) => db.collection(COLLECTIONS.ACCOUNTS).doc(id));
      const accSnaps = await Promise.all(accRefs.map((ref) => tx.get(ref)));
      const accMap = {};
      for (let i = 0; i < accountIds.length; i++) {
        accMap[accountIds[i]] = { ref: accRefs[i], data: accSnaps[i].data() };
      }

      const entryDoc = buildJournalEntryDoc({
        tenantId: callerTenantId,
        entryNumber: nextJournalNumber,
        date: toDate,
        description: `قيد إقفال الفترة ${fromDate} إلى ${toDate}`,
        lines: check.cleanLines,
        totalDebit: check.totalDebit,
        totalCredit: check.totalCredit,
        source: "closing",
        sourceRef: closingRef.id,
        status: JOURNAL_STATUS.POSTED,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      entryDoc.postedAt = FieldValue.serverTimestamp();
      tx.set(journalRef, entryDoc);

      // تحديث الأرصدة (حسب طبيعة كل حساب)
      for (const ln of check.cleanLines) {
        const acc = accMap[ln.accountId].data;
        const normalSide = acc.normalSide || "debit";
        const delta = normalSide === "debit" ? (ln.debit - ln.credit) : (ln.credit - ln.debit);
        if (delta !== 0) tx.update(accMap[ln.accountId].ref, { balance: FieldValue.increment(delta) });
      }

      const closingDoc = buildClosingDoc({
        tenantId: callerTenantId,
        closingNumber: nextClosingNumber,
        fromDate: fromDate,
        toDate: toDate,
        totalRevenue: res.totalRevenue,
        totalExpense: res.totalExpense,
        netIncome: res.netIncome,
        journalEntryId: journalRef.id,
        linesSnapshot: check.cleanLines,
        status: "closed",
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(closingRef, closingDoc);

      tx.update(tenantRef, { lastJournalNumber: nextJournalNumber, lastClosingNumber: nextClosingNumber });

      return { closingNumber: nextClosingNumber, journalNumber: nextJournalNumber };
    });

    return {
      id: closingRef.id,
      closingNumber: result.closingNumber,
      journalEntryId: journalRef.id,
      totalRevenue: res.totalRevenue,
      totalExpense: res.totalExpense,
      netIncome: res.netIncome,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("performClosing failed:", err);
    throw new HttpsError("internal", "تعذّر تنفيذ الإقفال، حاول مرة أخرى.");
  }
});

// ===== إلغاء الإقفال (قيد عكسي يعيد الأرصدة) ذرّيًا =====
// data: { closingId }
exports.reverseClosing = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);
    const data = request.data || {};
    const closingId = typeof data.closingId === "string" ? data.closingId.trim() : "";
    if (!closingId) throw new HttpsError("invalid-argument", "يجب تحديد الإقفال.");

    const closingRef = db.collection(COLLECTIONS.CLOSINGS).doc(closingId);
    const closingSnap = await closingRef.get();
    if (!closingSnap.exists || closingSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الإقفال غير صحيح.");
    }
    const closing = closingSnap.data();
    if (closing.status !== "closed") {
      throw new HttpsError("failed-precondition", "هذا الإقفال ملغى بالفعل.");
    }

    const origLines = Array.isArray(closing.linesSnapshot) ? closing.linesSnapshot : [];
    if (origLines.length === 0) {
      throw new HttpsError("failed-precondition", "لا توجد بيانات لعكس هذا الإقفال.");
    }

    // أطراف عكسية (تبديل المدين والدائن)
    const reverseLines = origLines.map((ln) => ({
      accountId: ln.accountId,
      accountCode: ln.accountCode || null,
      accountName: ln.accountName || null,
      debit: Number(ln.credit) || 0,
      credit: Number(ln.debit) || 0,
      note: "عكس إقفال",
    }));

    const check = validateJournalLines(reverseLines);
    if (!check.valid) throw new HttpsError("internal", "خطأ في توازن قيد عكس الإقفال: " + check.error);

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const journalRef = db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc();
    const accountIds = [...new Set(check.cleanLines.map((l) => l.accountId))];

    await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      const nextJournalNumber = (tenantSnap.data().lastJournalNumber || 0) + 1;

      const accRefs = accountIds.map((id) => db.collection(COLLECTIONS.ACCOUNTS).doc(id));
      const accSnaps = await Promise.all(accRefs.map((ref) => tx.get(ref)));
      const accMap = {};
      for (let i = 0; i < accountIds.length; i++) {
        accMap[accountIds[i]] = { ref: accRefs[i], data: accSnaps[i].data() };
      }

      const entryDoc = buildJournalEntryDoc({
        tenantId: callerTenantId,
        entryNumber: nextJournalNumber,
        date: closing.toDate,
        description: `عكس إقفال رقم ${closing.closingNumber} (${closing.fromDate} إلى ${closing.toDate})`,
        lines: check.cleanLines,
        totalDebit: check.totalDebit,
        totalCredit: check.totalCredit,
        source: "closing_reversal",
        sourceRef: closingId,
        status: JOURNAL_STATUS.POSTED,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      entryDoc.postedAt = FieldValue.serverTimestamp();
      tx.set(journalRef, entryDoc);

      for (const ln of check.cleanLines) {
        const acc = accMap[ln.accountId].data;
        const normalSide = acc.normalSide || "debit";
        const delta = normalSide === "debit" ? (ln.debit - ln.credit) : (ln.credit - ln.debit);
        if (delta !== 0) tx.update(accMap[ln.accountId].ref, { balance: FieldValue.increment(delta) });
      }

      tx.update(closingRef, {
        status: "reversed",
        reversedJournalEntryId: journalRef.id,
        reversedAt: FieldValue.serverTimestamp(),
        reversedBy: request.auth.uid,
      });

      tx.update(tenantRef, { lastJournalNumber: nextJournalNumber });
    });

    return { id: closingId, status: "reversed", reversalJournalEntryId: journalRef.id };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("reverseClosing failed:", err);
    throw new HttpsError("internal", "تعذّر عكس الإقفال، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== المالية: الخزينة — سند صرف (مصروف نقدي) =====
// ═══════════════════════════════════════════════════════

// ===== إنشاء سند صرف + قيده (مدين المصروف / دائن الخزينة) ذرّيًا =====
// data: { date, expenseAccountId, amount, method?, beneficiary?, notes? }
exports.createPayment = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);
    const data = request.data || {};
    const date = typeof data.date === "string" ? data.date.trim() : "";
    const expenseAccountId = typeof data.expenseAccountId === "string" ? data.expenseAccountId.trim() : "";
    const amount = Number(data.amount);
    const method = ["cash", "transfer", "cheque"].includes(data.method) ? data.method : "cash";
    const beneficiary = typeof data.beneficiary === "string" ? data.beneficiary.trim() : "";
    const notes = typeof data.notes === "string" ? data.notes.trim() : "";

    if (!isValidDate(date)) {
      throw new HttpsError("invalid-argument", "تاريخ الصرف غير صحيح (YYYY-MM-DD).");
    }
    if (!expenseAccountId) {
      throw new HttpsError("invalid-argument", "يجب اختيار حساب المصروف.");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpsError("invalid-argument", "مبلغ الصرف يجب أن يكون أكبر من صفر.");
    }

    async function findAccountByCode(code) {
      const snap = await db.collection(COLLECTIONS.ACCOUNTS)
        .where("tenantId", "==", callerTenantId)
        .where("code", "==", code)
        .limit(1)
        .get();
      return snap.empty ? null : snap.docs[0];
    }
    const treasuryDoc = await findAccountByCode(TREASURY_ACCOUNT_CODE);
    if (!treasuryDoc) {
      throw new HttpsError("failed-precondition", `حساب النقد/الخزينة (${TREASURY_ACCOUNT_CODE}) غير موجود في دليل الحسابات.`);
    }

    const expenseRef = db.collection(COLLECTIONS.ACCOUNTS).doc(expenseAccountId);
    const expenseSnap = await expenseRef.get();
    if (!expenseSnap.exists || expenseSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "حساب المصروف غير صحيح.");
    }
    const expenseData = expenseSnap.data();
    if (expenseData.type !== "expense") {
      throw new HttpsError("invalid-argument", "الحساب المختار ليس حساب مصروف.");
    }
    if (expenseData.isActive === false) {
      throw new HttpsError("failed-precondition", "حساب المصروف غير نشط.");
    }

    // تحقّق رصيد الخزينة كافٍ (منع الرصيد السالب)
    const treasuryBalance = Number(treasuryDoc.data().balance) || 0;
    if (amount > treasuryBalance + 0.01) {
      throw new HttpsError("failed-precondition", `رصيد الخزينة (${treasuryBalance.toLocaleString()}) غير كافٍ لصرف ${amount.toLocaleString()}.`);
    }

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const paymentRef = db.collection(COLLECTIONS.PAYMENTS).doc();
    const journalRef = db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc();

    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      const tData = tenantSnap.data();
      const nextPaymentNumber = (tData.lastPaymentNumber || 0) + 1;
      const nextJournalNumber = (tData.lastJournalNumber || 0) + 1;

      const treasuryRef = treasuryDoc.ref;
      const treasurySnapTx = await tx.get(treasuryRef);
      const expenseSnapTx = await tx.get(expenseRef);
      const treasuryDataTx = treasurySnapTx.data();
      const expenseDataTx = expenseSnapTx.data();

      const balTx = Number(treasuryDataTx.balance) || 0;
      if (amount > balTx + 0.01) {
        throw new HttpsError("failed-precondition", "تغيّر رصيد الخزينة، أعد المحاولة.");
      }

      // ===== القيد: مدين المصروف / دائن الخزينة =====
      const journalLines = [
        {
          accountId: expenseRef.id,
          accountCode: expenseDataTx.code || null,
          accountName: expenseDataTx.name || null,
          debit: amount,
          credit: 0,
          note: beneficiary ? `صرف لـ ${beneficiary}` : "صرف نقدي",
        },
        {
          accountId: treasuryRef.id,
          accountCode: treasuryDataTx.code || null,
          accountName: treasuryDataTx.name || null,
          debit: 0,
          credit: amount,
          note: "سند صرف",
        },
      ];

      const check = validateJournalLines(journalLines);
      if (!check.valid) {
        throw new HttpsError("internal", "خطأ في توازن قيد الصرف: " + check.error);
      }

      const entryDoc = buildJournalEntryDoc({
        tenantId: callerTenantId,
        entryNumber: nextJournalNumber,
        date: date,
        description: `قيد صرف سند رقم ${nextPaymentNumber}${beneficiary ? " — " + beneficiary : ""}`,
        lines: check.cleanLines,
        totalDebit: check.totalDebit,
        totalCredit: check.totalCredit,
        source: "payment",
        sourceRef: paymentRef.id,
        status: JOURNAL_STATUS.POSTED,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      entryDoc.postedAt = FieldValue.serverTimestamp();
      tx.set(journalRef, entryDoc);

      // أرصدة: مصروف +amount، خزينة -amount
      tx.update(expenseRef, { balance: FieldValue.increment(amount) });
      tx.update(treasuryRef, { balance: FieldValue.increment(-amount) });

      const paymentDoc = buildPaymentDoc({
        tenantId: callerTenantId,
        paymentNumber: nextPaymentNumber,
        date: date,
        expenseAccountId: expenseAccountId,
        expenseAccountCode: expenseDataTx.code || null,
        expenseAccountName: expenseDataTx.name || null,
        amount: amount,
        method: method,
        beneficiary: beneficiary || null,
        journalEntryId: journalRef.id,
        notes: notes || null,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(paymentRef, paymentDoc);

      tx.update(tenantRef, { lastPaymentNumber: nextPaymentNumber, lastJournalNumber: nextJournalNumber });

      return { paymentNumber: nextPaymentNumber, journalNumber: nextJournalNumber };
    });

    return {
      id: paymentRef.id,
      paymentNumber: result.paymentNumber,
      journalEntryId: journalRef.id,
      amount: amount,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createPayment failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء سند الصرف، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== المالية: التخطيط والتحليل المالي (FP&A) =====
// ===== تحليل شامل: مؤشرات + اتجاهات + نِسب + تنبؤ + توصيات =====
// ═══════════════════════════════════════════════════════

// أدوات مساعدة للتحليل
function fpaLastNMonths(asOf, n) {
  const months = [];
  let cy = parseInt(asOf.slice(0, 4), 10);
  let cm = parseInt(asOf.slice(5, 7), 10);
  for (let i = 0; i < n; i++) {
    months.unshift(`${cy}-${String(cm).padStart(2, "0")}`);
    cm--; if (cm === 0) { cm = 12; cy--; }
  }
  return months;
}
function fpaLinearForecast(points) {
  // انحدار خطي least-squares: y = a + b*x. points = [{x,y}]
  const n = points.length;
  if (n < 2) return { a: n === 1 ? points[0].y : 0, b: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const p of points) { sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumXX += p.x * p.x; }
  const denom = n * sumXX - sumX * sumX;
  const b = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const a = (sumY - b * sumX) / n;
  return { a, b };
}

// data: { asOf? }  — تاريخ التحليل (افتراضي اليوم). يحلّل البيانات التراكمية + آخر 12 شهرًا.
exports.getFinancialAnalysis = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);
    const data = request.data || {};
    let asOf = typeof data.asOf === "string" && isValidDate(data.asOf) ? data.asOf : null;
    if (!asOf) {
      const now = new Date();
      asOf = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }

    const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const pct = (n) => Math.round((Number(n) || 0) * 1000) / 1000; // 3 منازل للنِسب

    // ===== جلب البيانات =====
    const [accSnap, jeSnap, invSnap] = await Promise.all([
      db.collection(COLLECTIONS.ACCOUNTS).where("tenantId", "==", callerTenantId).get(),
      db.collection(COLLECTIONS.JOURNAL_ENTRIES).where("tenantId", "==", callerTenantId).get(),
      db.collection(COLLECTIONS.INVOICES).where("tenantId", "==", callerTenantId).get(),
    ]);

    const accountsById = {};
    const accountsList = [];
    accSnap.docs.forEach((d) => { const a = d.data(); accountsById[d.id] = a; accountsList.push({ id: d.id, ...a }); });
    const journalEntries = jeSnap.docs.map((d) => d.data());
    const invoices = invSnap.docs.map((d) => d.data());

    const isPosted = (je) => je.status === JOURNAL_STATUS.POSTED;
    const isClosing = (je) => je.source === "closing" || je.source === "closing_reversal";
    const isCashCode = (code) => typeof code === "string" && code.startsWith("11");

    // ===== الاتجاهات الشهرية (آخر 12 شهرًا) =====
    const monthKeys = fpaLastNMonths(asOf, 12);
    const monthData = {};
    monthKeys.forEach((k) => { monthData[k] = { revenue: 0, expense: 0, cashIn: 0, cashOut: 0 }; });

    // ===== التراكمي الكلي (كل التاريخ، مع استثناء قيود الإقفال من الإيراد/المصروف) =====
    let totalRevenue = 0, totalExpense = 0;
    const revByAcc = {}, expByAcc = {};

    for (const je of journalEntries) {
      if (!isPosted(je)) continue;
      const skipRevExp = isClosing(je);
      const mk = (je.date || "").slice(0, 7);
      const inWindow = Object.prototype.hasOwnProperty.call(monthData, mk);
      for (const ln of (je.lines || [])) {
        const acc = accountsById[ln.accountId];
        if (!acc) continue;
        const debit = Number(ln.debit) || 0;
        const credit = Number(ln.credit) || 0;
        if (acc.type === ACCOUNT_TYPES.REVENUE && !skipRevExp) {
          const v = credit - debit;
          totalRevenue += v;
          if (inWindow) monthData[mk].revenue += v;
          const key = acc.code || "—";
          if (!revByAcc[key]) revByAcc[key] = { code: acc.code, name: acc.name, amount: 0 };
          revByAcc[key].amount += v;
        } else if (acc.type === ACCOUNT_TYPES.EXPENSE && !skipRevExp) {
          const v = debit - credit;
          totalExpense += v;
          if (inWindow) monthData[mk].expense += v;
          const key = acc.code || "—";
          if (!expByAcc[key]) expByAcc[key] = { code: acc.code, name: acc.name, amount: 0, subtype: acc.subtype };
          expByAcc[key].amount += v;
        }
        // التدفق النقدي الشهري
        if (acc.type === ACCOUNT_TYPES.ASSET && isCashCode(acc.code) && inWindow) {
          monthData[mk].cashIn += debit;
          monthData[mk].cashOut += credit;
        }
      }
    }

    const netProfit = r2(totalRevenue - totalExpense);
    totalRevenue = r2(totalRevenue);
    totalExpense = r2(totalExpense);

    const monthlyTrends = monthKeys.map((k) => ({
      month: k,
      revenue: r2(monthData[k].revenue),
      expense: r2(monthData[k].expense),
      netProfit: r2(monthData[k].revenue - monthData[k].expense),
      cashFlow: r2(monthData[k].cashIn - monthData[k].cashOut),
    }));

    // الشهر الحالي مقابل السابق
    const curM = monthData[monthKeys[monthKeys.length - 1]];
    const prevM = monthData[monthKeys[monthKeys.length - 2]];
    const currentMonthRevenue = r2(curM.revenue);
    const prevMonthRevenue = r2(prevM.revenue);
    const revenueGrowth = prevMonthRevenue > 0 ? pct((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) : null;

    // ===== الأرصدة الحالية (للنِسب) =====
    let cash = 0, currentAssets = 0, nonCurrentAssets = 0, currentLiab = 0, nonCurrentLiab = 0, receivablesBal = 0;
    for (const acc of accountsList) {
      const bal = Number(acc.balance) || 0;
      if (acc.type === ACCOUNT_TYPES.ASSET) {
        if (isCashCode(acc.code)) cash += bal;
        if (acc.code === "1200") receivablesBal += bal;
        if (acc.subtype === "non_current_asset") nonCurrentAssets += bal; else currentAssets += bal;
      } else if (acc.type === ACCOUNT_TYPES.LIABILITY) {
        const pos = -bal; // الخصوم دائنة (balance سالب)
        if (acc.subtype === "non_current_liability") nonCurrentLiab += pos; else currentLiab += pos;
      }
    }
    cash = r2(cash);
    currentAssets = r2(currentAssets);
    currentLiab = r2(currentLiab);
    receivablesBal = r2(receivablesBal);

    // ===== الذمم المدينة وأعمارها + التحصيل (من الفواتير الآجلة) =====
    let totalCredit = 0, totalCollected = 0;
    const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    const asOfMs = new Date(asOf + "T00:00:00").getTime();
    const overdueInvoices = [];
    for (const inv of invoices) {
      const method = inv.paymentMethod || "credit";
      const total = Number(inv.total) || 0;
      if (method !== "credit") continue;
      const remaining = inv.remainingAmount != null ? Number(inv.remainingAmount) : total;
      const paid = Number(inv.paidAmount) || 0;
      totalCredit += total;
      totalCollected += paid;
      if (remaining > 0.01) {
        const invMs = new Date((inv.date || asOf) + "T00:00:00").getTime();
        const days = Math.max(0, Math.floor((asOfMs - invMs) / 86400000));
        if (days <= 30) aging.d0_30 += remaining;
        else if (days <= 60) aging.d31_60 += remaining;
        else if (days <= 90) aging.d61_90 += remaining;
        else aging.d90plus += remaining;
        if (days > 60) {
          overdueInvoices.push({
            number: inv.invoiceNumber || null,
            customer: (inv.customerSnapshot && inv.customerSnapshot.name) || "—",
            remaining: r2(remaining),
            days,
          });
        }
      }
    }
    totalCredit = r2(totalCredit);
    totalCollected = r2(totalCollected);
    const collectionRate = totalCredit > 0 ? pct(totalCollected / totalCredit) : null;
    const totalReceivables = r2(aging.d0_30 + aging.d31_60 + aging.d61_90 + aging.d90plus);
    overdueInvoices.sort((a, b) => b.remaining - a.remaining);
    Object.keys(aging).forEach((k) => { aging[k] = r2(aging[k]); });

    // ===== تركيز العملاء =====
    const custMap = {};
    let allCustTotal = 0;
    for (const inv of invoices) {
      const name = (inv.customerSnapshot && inv.customerSnapshot.name) || "عميل غير محدد";
      const total = Number(inv.total) || 0;
      custMap[name] = (custMap[name] || 0) + total;
      allCustTotal += total;
    }
    const topCustomers = Object.entries(custMap)
      .map(([name, total]) => ({ name, total: r2(total), pct: allCustTotal > 0 ? pct(total / allCustTotal) : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // ===== تركيبة الإيراد/المصروف =====
    const revenueComposition = Object.values(revByAcc)
      .filter((x) => x.amount > 0.01)
      .map((x) => ({ code: x.code, name: x.name, amount: r2(x.amount), pct: totalRevenue > 0 ? pct(x.amount / totalRevenue) : 0 }))
      .sort((a, b) => b.amount - a.amount);
    const expenseComposition = Object.values(expByAcc)
      .filter((x) => x.amount > 0.01)
      .map((x) => ({ code: x.code, name: x.name, amount: r2(x.amount), pct: totalExpense > 0 ? pct(x.amount / totalExpense) : 0 }))
      .sort((a, b) => b.amount - a.amount);
    const biggestExpense = expenseComposition.length ? expenseComposition[0] : null;

    let opexTotal = 0, cogsTotal = 0;
    for (const x of Object.values(expByAcc)) {
      if (x.subtype === "operating_expense") opexTotal += x.amount;
      else if (x.subtype === "cogs") cogsTotal += x.amount;
    }
    opexTotal = r2(opexTotal);
    cogsTotal = r2(cogsTotal);

    // ===== النِسب المالية =====
    const netMargin = totalRevenue > 0 ? pct(netProfit / totalRevenue) : null;
    const grossProfit = r2(totalRevenue - cogsTotal);
    const grossMargin = totalRevenue > 0 ? pct(grossProfit / totalRevenue) : null;
    const currentRatio = currentLiab > 0 ? r2(currentAssets / currentLiab) : null;
    const cashRatio = currentLiab > 0 ? r2(cash / currentLiab) : null;
    const opexRatio = totalRevenue > 0 ? pct(opexTotal / totalRevenue) : null;
    const dso = totalRevenue > 0 ? Math.round((totalReceivables / totalRevenue) * 365) : null;

    const ratios = {
      netMargin, grossMargin, currentRatio, cashRatio, opexRatio, dso,
      grossProfit, opexTotal, cogsTotal,
    };

    // ===== التنبؤ (انحدار خطي على آخر 6 أشهر) =====
    const last6Rev = monthlyTrends.slice(-6).map((m, i) => ({ x: i, y: m.revenue }));
    const last6Exp = monthlyTrends.slice(-6).map((m, i) => ({ x: i, y: m.expense }));
    const revFit = fpaLinearForecast(last6Rev);
    const expFit = fpaLinearForecast(last6Exp);
    const nF = last6Rev.length;
    const forecastRevenue = [0, 1, 2].map((k) => Math.max(0, r2(revFit.a + revFit.b * (nF + k))));
    const forecastExpense = [0, 1, 2].map((k) => Math.max(0, r2(expFit.a + expFit.b * (nF + k))));
    const avgMonthlyExpense = r2(last6Exp.reduce((s, p) => s + p.y, 0) / (last6Exp.length || 1));
    const avgMonthlyRevenue = r2(last6Rev.reduce((s, p) => s + p.y, 0) / (last6Rev.length || 1));
    const breakEvenRevenue = avgMonthlyExpense; // الإيراد الشهري المطلوب لتغطية المصروفات
    const runwayMonths = avgMonthlyExpense > 0 ? r2(cash / avgMonthlyExpense) : null; // أشهر الأمان النقدي

    const forecast = {
      method: "انحدار خطي (آخر 6 أشهر)",
      nextMonths: monthKeys.slice(-1).concat([]), // placeholder، الواجهة تحسب الأسماء
      forecastRevenue,
      forecastExpense,
      forecastNetProfit: [0, 1, 2].map((k) => r2(forecastRevenue[k] - forecastExpense[k])),
      avgMonthlyRevenue,
      avgMonthlyExpense,
      breakEvenRevenue,
      runwayMonths,
    };

    // ===== مؤشر الصحة المالية (0-100) =====
    let score = 0;
    if (netMargin === null) score += 12;
    else if (netMargin >= 0.2) score += 30; else if (netMargin >= 0.1) score += 22; else if (netMargin >= 0) score += 12; else score += 0;
    if (currentRatio === null) score += 13;
    else if (currentRatio >= 2) score += 25; else if (currentRatio >= 1) score += 18; else if (currentRatio >= 0.5) score += 8; else score += 0;
    if (collectionRate === null) score += 18;
    else if (collectionRate >= 0.8) score += 25; else if (collectionRate >= 0.5) score += 15; else score += 5;
    if (revenueGrowth === null) score += 12;
    else if (revenueGrowth >= 0.1) score += 20; else if (revenueGrowth >= 0) score += 14; else if (revenueGrowth >= -0.1) score += 8; else score += 2;
    score = Math.round(score);
    const healthLabel = score >= 80 ? "ممتاز" : score >= 60 ? "جيد" : score >= 40 ? "مقبول" : "يحتاج تحسين";

    // ===== محرّك التوصيات =====
    const recommendations = [];
    const money = (v) => `${r2(v).toLocaleString()} ﷼`;

    // 1. خسارة
    if (netProfit < 0) {
      recommendations.push({
        priority: "high",
        area: "الربحية",
        observation: `المنشأة تحقّق خسارة صافية بمقدار ${money(Math.abs(netProfit))}.`,
        action: `أولوية قصوى لخفض المصروفات${biggestExpense ? ` (أكبر بند: ${biggestExpense.name} بـ ${money(biggestExpense.amount)})` : ""} أو رفع الإيراد.`,
        expectedOutcome: `الوصول لنقطة التعادل يتطلب إيرادًا شهريًا ~${money(breakEvenRevenue)} (متوسط مصروفك الحالي).`,
      });
    } else if (netMargin !== null && netMargin < 0.1) {
      // 2. هامش ربح منخفض
      recommendations.push({
        priority: "medium",
        area: "الربحية",
        observation: `هامش صافي الربح ${(netMargin * 100).toFixed(1)}% (أقل من 10%).`,
        action: `راجع أعلى بنود التكلفة${biggestExpense ? ` — أكبرها ${biggestExpense.name} (${(biggestExpense.pct * 100).toFixed(0)}% من المصروفات)` : ""}، وادرس رفع الأسعار.`,
        expectedOutcome: `خفض المصروفات 10% يرفع صافي الربح بـ ~${money(totalExpense * 0.1)}.`,
      });
    }

    // 3. تحصيل منخفض
    if (collectionRate !== null && collectionRate < 0.7 && totalReceivables > 0) {
      const recoverable = r2((aging.d31_60 + aging.d61_90 + aging.d90plus) * 0.5);
      recommendations.push({
        priority: aging.d90plus > 0 ? "high" : "medium",
        area: "التحصيل والذمم",
        observation: `معدّل التحصيل ${(collectionRate * 100).toFixed(0)}%، ولديك ${money(totalReceivables)} ذمم غير محصّلة.`,
        action: `كثّف متابعة العملاء، خاصة الذمم المتأخرة فوق 60 يومًا (${money(aging.d61_90 + aging.d90plus)}).`,
        expectedOutcome: `تحصيل 50% من المتأخر يضيف ~${money(recoverable)} نقدًا فوريًا ويحسّن السيولة.`,
      });
    }

    // 4. ذمم متقادمة جدًا
    if (aging.d90plus > 0.01) {
      recommendations.push({
        priority: "high",
        area: "جودة الذمم",
        observation: `لديك ${money(aging.d90plus)} ذمم متأخرة أكثر من 90 يومًا${overdueInvoices.length ? ` (أبرزها: ${overdueInvoices[0].customer})` : ""}.`,
        action: "راجع هذه الفواتير — قد تحتاج جدولة دفع أو تكوين مخصّص ديون مشكوك فيها.",
        expectedOutcome: "معالجتها تحسّن جودة الذمم وتقلّل مخاطر التعثّر والديون المعدومة.",
      });
    }

    // 5. سيولة منخفضة
    if (currentRatio !== null && currentRatio < 1) {
      recommendations.push({
        priority: "high",
        area: "السيولة",
        observation: `نسبة التداول ${currentRatio} (أقل من 1) — الخصوم المتداولة تتجاوز الأصول المتداولة.`,
        action: "سرّع التحصيل وأجّل المصروفات غير الضرورية لتحسين التدفق النقدي.",
        expectedOutcome: "رفع النسبة فوق 1 يقلّل مخاطر العسر المالي قصير الأجل.",
      });
    }

    // 6. احتياطي نقدي
    if (runwayMonths !== null && runwayMonths < 2 && avgMonthlyExpense > 0) {
      recommendations.push({
        priority: "medium",
        area: "الاحتياطي النقدي",
        observation: `النقد الحالي (${money(cash)}) يغطي ~${runwayMonths} شهر من المصروفات فقط.`,
        action: "ابنِ احتياطيًا نقديًا يغطّي 2-3 أشهر مصروفات على الأقل.",
        expectedOutcome: `احتياطي 3 أشهر يعني ~${money(avgMonthlyExpense * 3)} يحميك من تقلبات التدفق النقدي.`,
      });
    }

    // 7. تركيز العملاء
    if (topCustomers.length && topCustomers[0].pct > 0.4) {
      recommendations.push({
        priority: "medium",
        area: "مخاطر التركّز",
        observation: `العميل «${topCustomers[0].name}» يمثّل ${(topCustomers[0].pct * 100).toFixed(0)}% من إيراداتك.`,
        action: "نوّع قاعدة العملاء لتقليل الاعتماد على عميل واحد.",
        expectedOutcome: "تنويع المخاطر يحمي إيرادك إذا فقدت هذا العميل أو تأخّر في الدفع.",
      });
    }

    // 8. نمو سلبي
    if (revenueGrowth !== null && revenueGrowth < -0.05) {
      recommendations.push({
        priority: "medium",
        area: "النمو",
        observation: `الإيراد انخفض ${(Math.abs(revenueGrowth) * 100).toFixed(0)}% عن الشهر السابق (${money(currentMonthRevenue)} مقابل ${money(prevMonthRevenue)}).`,
        action: "راجع أسباب التراجع: عملاء فقدوا، تغيّر أسعار، أو موسمية الطلب.",
        expectedOutcome: "تحديد السبب مبكرًا يتيح تصحيح المسار قبل تفاقم الأثر.",
      });
    }

    // 9. نمو إيجابي قوي (إيجابية)
    if (revenueGrowth !== null && revenueGrowth > 0.15) {
      recommendations.push({
        priority: "low",
        area: "فرصة نمو",
        observation: `نمو إيراد ممتاز ${(revenueGrowth * 100).toFixed(0)}% عن الشهر السابق.`,
        action: "استثمر النمو: عزّز القدرة التشغيلية وخطّط للتوسّع المدروس.",
        expectedOutcome: `استمرار هذا النمو يرفع الإيراد المتوقع للشهر القادم إلى ~${money(forecastRevenue[0])}.`,
      });
    }

    // 10. DSO مرتفع
    if (dso !== null && dso > 60) {
      recommendations.push({
        priority: "low",
        area: "كفاءة التحصيل",
        observation: `متوسط فترة التحصيل (DSO) ${dso} يومًا (مرتفع).`,
        action: "قلّل مدة الائتمان الممنوحة أو حفّز الدفع المبكر بخصومات بسيطة.",
        expectedOutcome: "تقليل DSO يسرّع دوران النقد ويحسّن السيولة التشغيلية.",
      });
    }

    // إذا لا توجد ملاحظات سلبية
    if (recommendations.length === 0) {
      recommendations.push({
        priority: "low",
        area: "الوضع العام",
        observation: "المؤشرات المالية ضمن النطاقات الصحية ولا توجد إنذارات حرجة.",
        action: "حافظ على الانضباط المالي الحالي وراقب الاتجاهات شهريًا.",
        expectedOutcome: "الاستمرارية تدعم النمو المستدام والثقة لدى الممولين والشركاء.",
      });
    }

    const prioRank = { high: 0, medium: 1, low: 2 };
    recommendations.sort((a, b) => prioRank[a.priority] - prioRank[b.priority]);

    // ===== الناتج =====
    return {
      asOf,
      generatedAt: new Date().toISOString(),
      kpis: {
        totalRevenue, totalExpense, netProfit,
        netMargin, cash, totalReceivables,
        collectionRate, currentMonthRevenue, prevMonthRevenue, revenueGrowth,
      },
      health: { score, label: healthLabel },
      monthlyTrends,
      revenueComposition,
      expenseComposition,
      ratios,
      topCustomers,
      receivablesAging: aging,
      overdueInvoices: overdueInvoices.slice(0, 8),
      forecast,
      recommendations,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getFinancialAnalysis failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء التحليل المالي، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== الموارد البشرية: ملف الموظف الكامل =====
// ===== (منفصل عن حساب الدخول في users، يُربط به اختياريًا) =====
// ═══════════════════════════════════════════════════════

function extractEmployeeFields(data) {
  const str = (v) => typeof v === "string" ? v.trim() : "";
  const dateOrNull = (v) => { const s = str(v); return isValidDate(s) ? s : null; };
  return {
    employeeCode: str(data.employeeCode),
    name: str(data.name),
    nationality: str(data.nationality),
    phone: str(data.phone),
    birthDate: dateOrNull(data.birthDate),
    gender: ["male", "female"].includes(data.gender) ? data.gender : null,
    iqamaNumber: str(data.iqamaNumber), iqamaExpiry: dateOrNull(data.iqamaExpiry),
    passportNumber: str(data.passportNumber), passportExpiry: dateOrNull(data.passportExpiry),
    workPermitNumber: str(data.workPermitNumber), workPermitExpiry: dateOrNull(data.workPermitExpiry),
    healthCertNumber: str(data.healthCertNumber), healthCertExpiry: dateOrNull(data.healthCertExpiry),
    insuranceNumber: str(data.insuranceNumber), insuranceExpiry: dateOrNull(data.insuranceExpiry),
    jobTitle: str(data.jobTitle), department: str(data.department),
    hireDate: dateOrNull(data.hireDate), contractType: str(data.contractType),
    contractExpiry: dateOrNull(data.contractExpiry),
    basicSalary: Number(data.basicSalary) || 0,
    housingAllowance: Number(data.housingAllowance) || 0,
    transportAllowance: Number(data.transportAllowance) || 0,
    otherAllowance: Number(data.otherAllowance) || 0,
    governmentFees: Number(data.governmentFees) || 0,
    otHourlyRate: Number(data.otHourlyRate) || 0,
    defaultTargetProfit: Number(data.defaultTargetProfit) || 0,
    status: ["active", "on_leave", "terminated"].includes(data.status) ? data.status : "active",
    notes: str(data.notes),
  };
}

async function validateLinkedUser(linkedUserId, tenantId) {
  if (!linkedUserId) return null;
  const uDoc = await db.collection(COLLECTIONS.USERS).doc(linkedUserId).get();
  if (!uDoc.exists || uDoc.data().tenantId !== tenantId) {
    throw new HttpsError("invalid-argument", "حساب الدخول المرتبط غير صحيح.");
  }
  return linkedUserId;
}

// ===== إنشاء ملف موظف =====
exports.createEmployeeProfile = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const fields = extractEmployeeFields(data);
    const linkedUserId = typeof data.linkedUserId === "string" ? data.linkedUserId.trim() : "";

    if (fields.name.length < 2) {
      throw new HttpsError("invalid-argument", "اسم الموظف مطلوب (حرفان على الأقل).");
    }
    if (fields.basicSalary < 0) {
      throw new HttpsError("invalid-argument", "الراتب الأساسي غير صحيح.");
    }

    const finalLinkedUser = await validateLinkedUser(linkedUserId, callerTenantId);
    // منع ربط نفس الحساب بأكثر من ملف موظف
    if (finalLinkedUser) {
      const dup = await db.collection(COLLECTIONS.EMPLOYEES)
        .where("tenantId", "==", callerTenantId)
        .where("linkedUserId", "==", finalLinkedUser)
        .limit(1).get();
      if (!dup.empty) {
        throw new HttpsError("already-exists", "هذا الحساب مرتبط بملف موظف آخر بالفعل.");
      }
    }

    const empRef = db.collection(COLLECTIONS.EMPLOYEES).doc();
    await empRef.set(buildEmployeeProfileDoc({
      tenantId: callerTenantId,
      ...fields,
      linkedUserId: finalLinkedUser,
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    }));
    return { id: empRef.id, name: fields.name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createEmployeeProfile failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء ملف الموظف، حاول مرة أخرى.");
  }
});

// ===== تعديل ملف موظف =====
exports.updateEmployeeProfile = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const employeeId = typeof data.employeeId === "string" ? data.employeeId.trim() : "";
    if (!employeeId) throw new HttpsError("invalid-argument", "يجب تحديد الموظف.");

    const empRef = db.collection(COLLECTIONS.EMPLOYEES).doc(employeeId);
    const empSnap = await empRef.get();
    if (!empSnap.exists || empSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الموظف غير صحيح.");
    }

    const fields = extractEmployeeFields(data);
    const linkedUserId = typeof data.linkedUserId === "string" ? data.linkedUserId.trim() : "";
    if (fields.name.length < 2) {
      throw new HttpsError("invalid-argument", "اسم الموظف مطلوب (حرفان على الأقل).");
    }

    const finalLinkedUser = await validateLinkedUser(linkedUserId, callerTenantId);
    if (finalLinkedUser) {
      const dup = await db.collection(COLLECTIONS.EMPLOYEES)
        .where("tenantId", "==", callerTenantId)
        .where("linkedUserId", "==", finalLinkedUser)
        .limit(2).get();
      const conflict = dup.docs.some((d) => d.id !== employeeId);
      if (conflict) {
        throw new HttpsError("already-exists", "هذا الحساب مرتبط بملف موظف آخر بالفعل.");
      }
    }

    const updated = buildEmployeeProfileDoc({
      tenantId: callerTenantId,
      ...fields,
      linkedUserId: finalLinkedUser,
      createdBy: empSnap.data().createdBy || null,
      createdAt: empSnap.data().createdAt || FieldValue.serverTimestamp(),
    });
    updated.updatedBy = request.auth.uid;
    updated.updatedAt = FieldValue.serverTimestamp();
    await empRef.set(updated, { merge: true });
    return { id: employeeId, name: fields.name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateEmployeeProfile failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل ملف الموظف، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== الموارد البشرية: مسير الرواتب =====
// ═══════════════════════════════════════════════════════

// حساب صافي السطر الواحد
function computePayrollLine(ln) {
  const basic = Number(ln.basic) || 0;
  const allowances = Number(ln.allowances) || 0;
  const overtime = Number(ln.overtime) || 0;
  const deductions = Number(ln.deductions) || 0;
  const advances = Number(ln.advances) || 0;
  const gross = basic + allowances + overtime;
  const net = gross - deductions - advances;
  return { basic, allowances, overtime, deductions, advances, gross, net: Math.round(net * 100) / 100 };
}
function summarizePayroll(lines) {
  let totalGross = 0, totalDeductions = 0, totalNet = 0;
  for (const ln of lines) {
    totalGross += Number(ln.gross) || 0;
    totalDeductions += (Number(ln.deductions) || 0) + (Number(ln.advances) || 0);
    totalNet += Number(ln.net) || 0;
  }
  const r = (n) => Math.round(n * 100) / 100;
  return { totalGross: r(totalGross), totalDeductions: r(totalDeductions), totalNet: r(totalNet) };
}

// ===== إنشاء مسير رواتب لشهر (مسودة) من الموظفين النشطين =====
exports.createPayrollRun = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const year = parseInt(data.year, 10);
    const month = parseInt(data.month, 10);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      throw new HttpsError("invalid-argument", "السنة غير صحيحة.");
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      throw new HttpsError("invalid-argument", "الشهر غير صحيح.");
    }
    const period = `${year}-${String(month).padStart(2, "0")}`;

    // منع تكرار مسير لنفس الشهر
    const existing = await db.collection(COLLECTIONS.PAYROLL_RUNS)
      .where("tenantId", "==", callerTenantId)
      .where("period", "==", period)
      .limit(1).get();
    if (!existing.empty) {
      throw new HttpsError("already-exists", `يوجد مسير لشهر ${period} بالفعل.`);
    }

    // الموظفون النشطون
    const empSnap = await db.collection(COLLECTIONS.EMPLOYEES)
      .where("tenantId", "==", callerTenantId)
      .where("status", "==", "active").get();
    if (empSnap.empty) {
      throw new HttpsError("failed-precondition", "لا يوجد موظفون نشطون لإنشاء مسير.");
    }

    const lines = empSnap.docs.map((d) => {
      const emp = d.data();
      const sal = emp.salary || {};
      const basic = Number(sal.basic) || 0;
      const allowances = (Number(sal.housing) || 0) + (Number(sal.transport) || 0) + (Number(sal.other) || 0);
      const computed = computePayrollLine({ basic, allowances, overtime: 0, deductions: 0, advances: 0 });
      return {
        employeeId: d.id,
        employeeCode: emp.employeeCode || null,
        name: emp.name || "—",
        ...computed,
      };
    });
    const totals = summarizePayroll(lines);

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const payrollRef = db.collection(COLLECTIONS.PAYROLL_RUNS).doc();
    const nextNumber = await db.runTransaction(async (tx) => {
      const tSnap = await tx.get(tenantRef);
      const n = ((tSnap.data() || {}).lastPayrollNumber || 0) + 1;
      tx.set(payrollRef, buildPayrollRunDoc({
        tenantId: callerTenantId, payrollNumber: n, year, month,
        status: "draft", lines, ...totals,
        createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
      }));
      tx.update(tenantRef, { lastPayrollNumber: n });
      return n;
    });

    return { id: payrollRef.id, payrollNumber: nextNumber, period, employeeCount: lines.length, totalNet: totals.totalNet };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createPayrollRun failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء المسير، حاول مرة أخرى.");
  }
});

// ===== تحديث متغيرات المسير (إضافي/خصومات/سلف) — مسودة فقط =====
exports.updatePayrollLines = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const payrollId = typeof data.payrollId === "string" ? data.payrollId.trim() : "";
    const inputLines = Array.isArray(data.lines) ? data.lines : null;
    if (!payrollId) throw new HttpsError("invalid-argument", "يجب تحديد المسير.");
    if (!inputLines) throw new HttpsError("invalid-argument", "بيانات السطور غير صحيحة.");

    const payrollRef = db.collection(COLLECTIONS.PAYROLL_RUNS).doc(payrollId);
    const snap = await payrollRef.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المسير غير صحيح.");
    }
    if (snap.data().status !== "draft") {
      throw new HttpsError("failed-precondition", "لا يمكن تعديل مسير معتمد أو مدفوع.");
    }

    const existingLines = snap.data().lines || [];
    const byId = {};
    inputLines.forEach((l) => { if (l && l.employeeId) byId[l.employeeId] = l; });

    const updatedLines = existingLines.map((ln) => {
      const inp = byId[ln.employeeId] || {};
      const computed = computePayrollLine({
        basic: ln.basic, allowances: ln.allowances,
        overtime: inp.overtime !== undefined ? inp.overtime : ln.overtime,
        deductions: inp.deductions !== undefined ? inp.deductions : ln.deductions,
        advances: inp.advances !== undefined ? inp.advances : ln.advances,
      });
      return { employeeId: ln.employeeId, employeeCode: ln.employeeCode || null, name: ln.name, ...computed };
    });
    const totals = summarizePayroll(updatedLines);

    await payrollRef.update({ lines: updatedLines, ...totals, updatedAt: FieldValue.serverTimestamp() });
    return { id: payrollId, ...totals };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updatePayrollLines failed:", err);
    throw new HttpsError("internal", "تعذّر تحديث المسير، حاول مرة أخرى.");
  }
});

// ===== اعتماد المسير + توليد القيد (نقدي أو مستحق) =====
exports.approvePayrollRun = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const payrollId = typeof data.payrollId === "string" ? data.payrollId.trim() : "";
    const paymentMethod = data.paymentMethod === "cash" ? "cash" : data.paymentMethod === "accrued" ? "accrued" : null;
    if (!payrollId) throw new HttpsError("invalid-argument", "يجب تحديد المسير.");
    if (!paymentMethod) throw new HttpsError("invalid-argument", "اختر طريقة الصرف (نقدي أو مستحق).");

    async function findAccountByCode(code) {
      const s = await db.collection(COLLECTIONS.ACCOUNTS)
        .where("tenantId", "==", callerTenantId).where("code", "==", code).limit(1).get();
      return s.empty ? null : s.docs[0];
    }
    const salaryExpenseDoc = await findAccountByCode(SALARY_EXPENSE_CODE);
    if (!salaryExpenseDoc) throw new HttpsError("failed-precondition", `حساب مصروف الرواتب (${SALARY_EXPENSE_CODE}) غير موجود.`);
    const creditCode = paymentMethod === "cash" ? TREASURY_ACCOUNT_CODE : ACCRUED_SALARY_CODE;
    const creditDoc = await findAccountByCode(creditCode);
    if (!creditDoc) throw new HttpsError("failed-precondition", `الحساب الدائن (${creditCode}) غير موجود في دليل الحسابات.`);

    const payrollRef = db.collection(COLLECTIONS.PAYROLL_RUNS).doc(payrollId);
    const snap0 = await payrollRef.get();
    if (!snap0.exists || snap0.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المسير غير صحيح.");
    }
    if (snap0.data().status !== "draft") {
      throw new HttpsError("failed-precondition", "المسير معتمد بالفعل.");
    }
    const totalNet = Number(snap0.data().totalNet) || 0;
    if (totalNet <= 0) throw new HttpsError("failed-precondition", "إجمالي المسير صفر — لا يمكن اعتماده.");

    // تحقق رصيد الخزينة إن كان الصرف نقديًا
    if (paymentMethod === "cash") {
      const bal = Number(creditDoc.data().balance) || 0;
      if (totalNet > bal + 0.01) {
        throw new HttpsError("failed-precondition", `رصيد الخزينة (${bal.toLocaleString()}) غير كافٍ لصرف الرواتب (${totalNet.toLocaleString()}).`);
      }
    }

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const journalRef = db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc();

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(payrollRef);
      if (snap.data().status !== "draft") throw new HttpsError("failed-precondition", "المسير معتمد بالفعل.");
      const tSnap = await tx.get(tenantRef);
      const expRef = salaryExpenseDoc.ref;
      const crRef = creditDoc.ref;
      const expSnap = await tx.get(expRef);
      const crSnap = await tx.get(crRef);
      const expData = expSnap.data();
      const crData = crSnap.data();

      if (paymentMethod === "cash") {
        const bal = Number(crData.balance) || 0;
        if (totalNet > bal + 0.01) throw new HttpsError("failed-precondition", "تغيّر رصيد الخزينة، أعد المحاولة.");
      }

      const nextJournalNumber = ((tSnap.data() || {}).lastJournalNumber || 0) + 1;
      const period = snap.data().period;
      const journalLines = [
        { accountId: expRef.id, accountCode: expData.code || null, accountName: expData.name || null, debit: totalNet, credit: 0, note: `رواتب ${period}` },
        { accountId: crRef.id, accountCode: crData.code || null, accountName: crData.name || null, debit: 0, credit: totalNet, note: paymentMethod === "cash" ? "صرف رواتب نقدًا" : "رواتب مستحقة" },
      ];
      const check = validateJournalLines(journalLines);
      if (!check.valid) throw new HttpsError("internal", "خطأ في توازن قيد الرواتب: " + check.error);

      const entryDoc = buildJournalEntryDoc({
        tenantId: callerTenantId, entryNumber: nextJournalNumber, date: new Date().toISOString().slice(0, 10),
        description: `قيد رواتب ${period} (مسير رقم ${snap.data().payrollNumber})`,
        lines: check.cleanLines, totalDebit: check.totalDebit, totalCredit: check.totalCredit,
        source: "payroll", sourceRef: payrollId, status: JOURNAL_STATUS.POSTED,
        createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
      });
      entryDoc.postedAt = FieldValue.serverTimestamp();
      tx.set(journalRef, entryDoc);

      // أرصدة: مصروف +، (خزينة - نقدًا) أو (مستحق +)
      tx.update(expRef, { balance: FieldValue.increment(totalNet) });
      if (paymentMethod === "cash") {
        tx.update(crRef, { balance: FieldValue.increment(-totalNet) });
      } else {
        tx.update(crRef, { balance: FieldValue.increment(-totalNet) }); // الخصوم دائنة: balance يقل (أكثر دائنية)
      }

      tx.update(payrollRef, {
        status: paymentMethod === "cash" ? "paid" : "approved",
        paymentMethod, journalEntryId: journalRef.id,
        approvedBy: request.auth.uid, approvedAt: FieldValue.serverTimestamp(),
        ...(paymentMethod === "cash" ? { paidBy: request.auth.uid, paidAt: FieldValue.serverTimestamp() } : {}),
      });
      tx.update(tenantRef, { lastJournalNumber: nextJournalNumber });
    });

    return { id: payrollId, status: paymentMethod === "cash" ? "paid" : "approved", paymentMethod, journalEntryId: journalRef.id, totalNet };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("approvePayrollRun failed:", err);
    throw new HttpsError("internal", "تعذّر اعتماد المسير، حاول مرة أخرى.");
  }
});

// ===== صرف الرواتب المستحقة (للمسير المعتمد بطريقة مستحق) =====
exports.payAccruedPayroll = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const payrollId = typeof data.payrollId === "string" ? data.payrollId.trim() : "";
    if (!payrollId) throw new HttpsError("invalid-argument", "يجب تحديد المسير.");

    async function findAccountByCode(code) {
      const s = await db.collection(COLLECTIONS.ACCOUNTS)
        .where("tenantId", "==", callerTenantId).where("code", "==", code).limit(1).get();
      return s.empty ? null : s.docs[0];
    }
    const accruedDoc = await findAccountByCode(ACCRUED_SALARY_CODE);
    const treasuryDoc = await findAccountByCode(TREASURY_ACCOUNT_CODE);
    if (!accruedDoc || !treasuryDoc) {
      throw new HttpsError("failed-precondition", "حساب الرواتب المستحقة أو الخزينة غير موجود.");
    }

    const payrollRef = db.collection(COLLECTIONS.PAYROLL_RUNS).doc(payrollId);
    const snap0 = await payrollRef.get();
    if (!snap0.exists || snap0.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المسير غير صحيح.");
    }
    if (snap0.data().status !== "approved" || snap0.data().paymentMethod !== "accrued") {
      throw new HttpsError("failed-precondition", "هذا المسير ليس مستحقًا بانتظار الصرف.");
    }
    const totalNet = Number(snap0.data().totalNet) || 0;
    const treasuryBal = Number(treasuryDoc.data().balance) || 0;
    if (totalNet > treasuryBal + 0.01) {
      throw new HttpsError("failed-precondition", `رصيد الخزينة (${treasuryBal.toLocaleString()}) غير كافٍ لصرف ${totalNet.toLocaleString()}.`);
    }

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const journalRef = db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc();

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(payrollRef);
      if (snap.data().status !== "approved") throw new HttpsError("failed-precondition", "تغيّرت حالة المسير.");
      const tSnap = await tx.get(tenantRef);
      const accRef = accruedDoc.ref;
      const treaRef = treasuryDoc.ref;
      const accData = (await tx.get(accRef)).data();
      const treaData = (await tx.get(treaRef)).data();

      const balTx = Number(treaData.balance) || 0;
      if (totalNet > balTx + 0.01) throw new HttpsError("failed-precondition", "تغيّر رصيد الخزينة، أعد المحاولة.");

      const nextJournalNumber = ((tSnap.data() || {}).lastJournalNumber || 0) + 1;
      const period = snap.data().period;
      const journalLines = [
        { accountId: accRef.id, accountCode: accData.code || null, accountName: accData.name || null, debit: totalNet, credit: 0, note: `سداد رواتب ${period}` },
        { accountId: treaRef.id, accountCode: treaData.code || null, accountName: treaData.name || null, debit: 0, credit: totalNet, note: "صرف من الخزينة" },
      ];
      const check = validateJournalLines(journalLines);
      if (!check.valid) throw new HttpsError("internal", "خطأ في توازن قيد السداد: " + check.error);

      const entryDoc = buildJournalEntryDoc({
        tenantId: callerTenantId, entryNumber: nextJournalNumber, date: new Date().toISOString().slice(0, 10),
        description: `سداد رواتب مستحقة ${period} (مسير رقم ${snap.data().payrollNumber})`,
        lines: check.cleanLines, totalDebit: check.totalDebit, totalCredit: check.totalCredit,
        source: "payroll_payment", sourceRef: payrollId, status: JOURNAL_STATUS.POSTED,
        createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
      });
      entryDoc.postedAt = FieldValue.serverTimestamp();
      tx.set(journalRef, entryDoc);

      // أرصدة: مستحق يقل (debit على خصم: balance يزيد نحو الصفر)، خزينة تقل
      tx.update(accRef, { balance: FieldValue.increment(totalNet) });
      tx.update(treaRef, { balance: FieldValue.increment(-totalNet) });

      tx.update(payrollRef, {
        status: "paid", paymentJournalEntryId: journalRef.id,
        paidBy: request.auth.uid, paidAt: FieldValue.serverTimestamp(),
      });
      tx.update(tenantRef, { lastJournalNumber: nextJournalNumber });
    });

    return { id: payrollId, status: "paid", journalEntryId: journalRef.id, totalNet };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("payAccruedPayroll failed:", err);
    throw new HttpsError("internal", "تعذّر صرف الرواتب، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== الموارد البشرية: التوظيف (شواغر · متقدمون · مراحل) =====
// ═══════════════════════════════════════════════════════

const APPLICANT_STAGES = ["new", "screening", "interview", "offer", "hired", "rejected"];

// ===== إنشاء شاغر وظيفي =====
exports.createVacancy = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const title = typeof data.title === "string" ? data.title.trim() : "";
    const department = typeof data.department === "string" ? data.department.trim() : "";
    const employmentType = typeof data.employmentType === "string" ? data.employmentType.trim() : "";
    const description = typeof data.description === "string" ? data.description.trim() : "";
    const count = parseInt(data.count, 10);
    const salaryMin = data.salaryMin !== undefined && data.salaryMin !== null && data.salaryMin !== "" ? Number(data.salaryMin) : null;
    const salaryMax = data.salaryMax !== undefined && data.salaryMax !== null && data.salaryMax !== "" ? Number(data.salaryMax) : null;

    if (title.length < 2) throw new HttpsError("invalid-argument", "المسمى الوظيفي مطلوب (حرفان على الأقل).");
    if (salaryMin !== null && (!Number.isFinite(salaryMin) || salaryMin < 0)) throw new HttpsError("invalid-argument", "الحد الأدنى للراتب غير صحيح.");
    if (salaryMax !== null && (!Number.isFinite(salaryMax) || salaryMax < 0)) throw new HttpsError("invalid-argument", "الحد الأعلى للراتب غير صحيح.");

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const vacancyRef = db.collection(COLLECTIONS.VACANCIES).doc();
    const nextNumber = await db.runTransaction(async (tx) => {
      const tSnap = await tx.get(tenantRef);
      const n = ((tSnap.data() || {}).lastVacancyNumber || 0) + 1;
      tx.set(vacancyRef, buildVacancyDoc({
        tenantId: callerTenantId, vacancyNumber: n, title, department,
        count: Number.isFinite(count) ? count : 1, employmentType, description,
        salaryMin, salaryMax, status: "open",
        createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
      }));
      tx.update(tenantRef, { lastVacancyNumber: n });
      return n;
    });
    return { id: vacancyRef.id, vacancyNumber: nextNumber, title };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createVacancy failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الشاغر، حاول مرة أخرى.");
  }
});

// ===== تغيير حالة الشاغر (فتح/إغلاق) =====
exports.updateVacancyStatus = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const vacancyId = typeof data.vacancyId === "string" ? data.vacancyId.trim() : "";
    const status = data.status === "open" || data.status === "closed" ? data.status : null;
    if (!vacancyId) throw new HttpsError("invalid-argument", "يجب تحديد الشاغر.");
    if (!status) throw new HttpsError("invalid-argument", "حالة غير صحيحة.");

    const ref = db.collection(COLLECTIONS.VACANCIES).doc(vacancyId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الشاغر غير صحيح.");
    }
    await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
    return { id: vacancyId, status };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateVacancyStatus failed:", err);
    throw new HttpsError("internal", "تعذّر تحديث الشاغر، حاول مرة أخرى.");
  }
});

// ===== تسجيل متقدم على شاغر =====
exports.createApplicant = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const vacancyId = typeof data.vacancyId === "string" ? data.vacancyId.trim() : "";
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const phone = typeof data.phone === "string" ? data.phone.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim() : "";
    const nationality = typeof data.nationality === "string" ? data.nationality.trim() : "";
    const source = typeof data.source === "string" ? data.source.trim() : "";
    const notes = typeof data.notes === "string" ? data.notes.trim() : "";

    if (name.length < 2) throw new HttpsError("invalid-argument", "اسم المتقدم مطلوب (حرفان على الأقل).");
    if (!vacancyId) throw new HttpsError("invalid-argument", "يجب تحديد الشاغر.");

    const vacancySnap = await db.collection(COLLECTIONS.VACANCIES).doc(vacancyId).get();
    if (!vacancySnap.exists || vacancySnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الشاغر غير صحيح.");
    }

    const applicantRef = db.collection(COLLECTIONS.APPLICANTS).doc();
    await applicantRef.set(buildApplicantDoc({
      tenantId: callerTenantId, vacancyId, vacancyTitle: vacancySnap.data().title || null,
      name, phone, email, nationality, source, stage: "new", notes,
      createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
    }));
    return { id: applicantRef.id, name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createApplicant failed:", err);
    throw new HttpsError("internal", "تعذّر تسجيل المتقدم، حاول مرة أخرى.");
  }
});

// ===== نقل المتقدم بين المراحل =====
exports.moveApplicantStage = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const applicantId = typeof data.applicantId === "string" ? data.applicantId.trim() : "";
    const stage = APPLICANT_STAGES.includes(data.stage) ? data.stage : null;
    if (!applicantId) throw new HttpsError("invalid-argument", "يجب تحديد المتقدم.");
    if (!stage) throw new HttpsError("invalid-argument", "مرحلة غير صحيحة.");
    if (stage === "hired") {
      throw new HttpsError("invalid-argument", "لتعيين المتقدم استخدم زر التعيين كموظف.");
    }

    const ref = db.collection(COLLECTIONS.APPLICANTS).doc(applicantId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المتقدم غير صحيح.");
    }
    if (snap.data().stage === "hired") {
      throw new HttpsError("failed-precondition", "هذا المتقدم مُعيّن بالفعل.");
    }
    await ref.update({ stage, updatedAt: FieldValue.serverTimestamp() });
    return { id: applicantId, stage };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("moveApplicantStage failed:", err);
    throw new HttpsError("internal", "تعذّر نقل المتقدم، حاول مرة أخرى.");
  }
});

// ===== تعيين المتقدم كموظف (يُنشئ ملف موظف ويربطه) =====
exports.hireApplicant = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const applicantId = typeof data.applicantId === "string" ? data.applicantId.trim() : "";
    const jobTitle = typeof data.jobTitle === "string" ? data.jobTitle.trim() : "";
    const department = typeof data.department === "string" ? data.department.trim() : "";
    const hireDate = typeof data.hireDate === "string" && isValidDate(data.hireDate) ? data.hireDate : null;
    const basicSalary = Number(data.basicSalary) || 0;

    if (!applicantId) throw new HttpsError("invalid-argument", "يجب تحديد المتقدم.");

    const appRef = db.collection(COLLECTIONS.APPLICANTS).doc(applicantId);
    const appSnap = await appRef.get();
    if (!appSnap.exists || appSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المتقدم غير صحيح.");
    }
    const app = appSnap.data();
    if (app.stage === "hired" || app.linkedEmployeeId) {
      throw new HttpsError("failed-precondition", "هذا المتقدم مُعيّن بالفعل.");
    }

    // إنشاء ملف الموظف من بيانات المتقدم
    const empRef = db.collection(COLLECTIONS.EMPLOYEES).doc();
    await empRef.set(buildEmployeeProfileDoc({
      tenantId: callerTenantId,
      name: app.name,
      nationality: app.nationality || null,
      phone: app.phone || null,
      jobTitle: jobTitle || app.vacancyTitle || null,
      department: department || null,
      hireDate: hireDate,
      basicSalary: basicSalary,
      status: "active",
      notes: `معيّن عبر التوظيف${app.vacancyTitle ? " — شاغر: " + app.vacancyTitle : ""}`,
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    }));

    // تحديث المتقدم
    await appRef.update({
      stage: "hired",
      linkedEmployeeId: empRef.id,
      hiredAt: FieldValue.serverTimestamp(),
    });

    return { applicantId, employeeId: empRef.id, name: app.name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("hireApplicant failed:", err);
    throw new HttpsError("internal", "تعذّر تعيين المتقدم، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== الموارد البشرية: التدريب (برامج · تسجيلات · شهادات) =====
// ═══════════════════════════════════════════════════════

const ENROLLMENT_STATUSES = ["registered", "attending", "completed", "dropped"];

// ===== إنشاء برنامج تدريبي =====
exports.createTrainingProgram = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const title = typeof data.title === "string" ? data.title.trim() : "";
    const category = typeof data.category === "string" ? data.category.trim() : "";
    const provider = typeof data.provider === "string" ? data.provider.trim() : "";
    const description = typeof data.description === "string" ? data.description.trim() : "";
    const mode = data.mode === "online" ? "online" : data.mode === "onsite" ? "onsite" : null;
    const startDate = typeof data.startDate === "string" && isValidDate(data.startDate) ? data.startDate : null;
    const endDate = typeof data.endDate === "string" && isValidDate(data.endDate) ? data.endDate : null;
    const durationHours = data.durationHours !== undefined && data.durationHours !== null && data.durationHours !== "" ? Number(data.durationHours) : null;
    const cost = data.cost !== undefined && data.cost !== null && data.cost !== "" ? Number(data.cost) : null;

    if (title.length < 2) throw new HttpsError("invalid-argument", "اسم البرنامج مطلوب (حرفان على الأقل).");
    if (durationHours !== null && (!Number.isFinite(durationHours) || durationHours < 0)) throw new HttpsError("invalid-argument", "عدد الساعات غير صحيح.");
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) throw new HttpsError("invalid-argument", "التكلفة غير صحيحة.");

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const programRef = db.collection(COLLECTIONS.TRAINING_PROGRAMS).doc();
    const nextNumber = await db.runTransaction(async (tx) => {
      const tSnap = await tx.get(tenantRef);
      const n = ((tSnap.data() || {}).lastProgramNumber || 0) + 1;
      tx.set(programRef, buildTrainingProgramDoc({
        tenantId: callerTenantId, programNumber: n, title, category, provider, description,
        startDate, endDate, durationHours, mode, cost, status: "planned",
        createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
      }));
      tx.update(tenantRef, { lastProgramNumber: n });
      return n;
    });
    return { id: programRef.id, programNumber: nextNumber, title };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createTrainingProgram failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء البرنامج، حاول مرة أخرى.");
  }
});

// ===== تغيير حالة البرنامج =====
exports.updateProgramStatus = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const programId = typeof data.programId === "string" ? data.programId.trim() : "";
    const status = ["planned", "active", "completed", "cancelled"].includes(data.status) ? data.status : null;
    if (!programId) throw new HttpsError("invalid-argument", "يجب تحديد البرنامج.");
    if (!status) throw new HttpsError("invalid-argument", "حالة غير صحيحة.");

    const ref = db.collection(COLLECTIONS.TRAINING_PROGRAMS).doc(programId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "البرنامج غير صحيح.");
    }
    await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
    return { id: programId, status };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateProgramStatus failed:", err);
    throw new HttpsError("internal", "تعذّر تحديث البرنامج، حاول مرة أخرى.");
  }
});

// ===== تسجيل موظف في برنامج =====
exports.enrollEmployee = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const programId = typeof data.programId === "string" ? data.programId.trim() : "";
    const employeeId = typeof data.employeeId === "string" ? data.employeeId.trim() : "";
    if (!programId) throw new HttpsError("invalid-argument", "يجب تحديد البرنامج.");
    if (!employeeId) throw new HttpsError("invalid-argument", "يجب تحديد الموظف.");

    const programSnap = await db.collection(COLLECTIONS.TRAINING_PROGRAMS).doc(programId).get();
    if (!programSnap.exists || programSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "البرنامج غير صحيح.");
    }
    const empSnap = await db.collection(COLLECTIONS.EMPLOYEES).doc(employeeId).get();
    if (!empSnap.exists || empSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الموظف غير صحيح.");
    }

    // منع التسجيل المكرر
    const dup = await db.collection(COLLECTIONS.TRAINING_ENROLLMENTS)
      .where("tenantId", "==", callerTenantId)
      .where("programId", "==", programId)
      .where("employeeId", "==", employeeId)
      .limit(1).get();
    if (!dup.empty) {
      throw new HttpsError("already-exists", "هذا الموظف مسجّل في البرنامج بالفعل.");
    }

    const emp = empSnap.data();
    const enrollRef = db.collection(COLLECTIONS.TRAINING_ENROLLMENTS).doc();
    await enrollRef.set(buildEnrollmentDoc({
      tenantId: callerTenantId, programId, programTitle: programSnap.data().title || null,
      employeeId, employeeName: emp.name || null, employeeCode: emp.employeeCode || null,
      status: "registered", enrolledDate: new Date().toISOString().slice(0, 10),
      createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
    }));
    return { id: enrollRef.id, employeeName: emp.name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("enrollEmployee failed:", err);
    throw new HttpsError("internal", "تعذّر تسجيل الموظف، حاول مرة أخرى.");
  }
});

// ===== تحديث حالة المشارك =====
exports.updateEnrollmentStatus = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const enrollmentId = typeof data.enrollmentId === "string" ? data.enrollmentId.trim() : "";
    const status = ENROLLMENT_STATUSES.includes(data.status) ? data.status : null;
    const score = data.score !== undefined && data.score !== null && data.score !== "" ? Number(data.score) : null;
    if (!enrollmentId) throw new HttpsError("invalid-argument", "يجب تحديد التسجيل.");
    if (!status) throw new HttpsError("invalid-argument", "حالة غير صحيحة.");
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
      throw new HttpsError("invalid-argument", "الدرجة يجب أن تكون بين 0 و100.");
    }

    const ref = db.collection(COLLECTIONS.TRAINING_ENROLLMENTS).doc(enrollmentId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "التسجيل غير صحيح.");
    }

    const update = { status, updatedAt: FieldValue.serverTimestamp() };
    if (score !== null) update.score = score;
    if (status === "completed") {
      update.completedDate = snap.data().completedDate || new Date().toISOString().slice(0, 10);
    }
    await ref.update(update);
    return { id: enrollmentId, status };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateEnrollmentStatus failed:", err);
    throw new HttpsError("internal", "تعذّر تحديث الحالة، حاول مرة أخرى.");
  }
});

// ===== إصدار شهادة (للمشارك المكتمل) =====
exports.issueCertificate = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const enrollmentId = typeof data.enrollmentId === "string" ? data.enrollmentId.trim() : "";
    if (!enrollmentId) throw new HttpsError("invalid-argument", "يجب تحديد التسجيل.");

    const ref = db.collection(COLLECTIONS.TRAINING_ENROLLMENTS).doc(enrollmentId);
    const snap0 = await ref.get();
    if (!snap0.exists || snap0.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "التسجيل غير صحيح.");
    }
    if (snap0.data().status !== "completed") {
      throw new HttpsError("failed-precondition", "لا يمكن إصدار شهادة إلا بعد إكمال البرنامج.");
    }
    if (snap0.data().certificateNumber) {
      throw new HttpsError("already-exists", "الشهادة صادرة بالفعل.");
    }

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const certNumber = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.data().certificateNumber) throw new HttpsError("already-exists", "الشهادة صادرة بالفعل.");
      const tSnap = await tx.get(tenantRef);
      const n = ((tSnap.data() || {}).lastCertificateNumber || 0) + 1;
      tx.update(ref, {
        certificateNumber: n,
        certificateIssueDate: new Date().toISOString().slice(0, 10),
      });
      tx.update(tenantRef, { lastCertificateNumber: n });
      return n;
    });
    return { id: enrollmentId, certificateNumber: certNumber };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("issueCertificate failed:", err);
    throw new HttpsError("internal", "تعذّر إصدار الشهادة، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== الموارد البشرية: علاقات الموظفين =====
// ===== (إجازات · جزاءات · تقييم أداء) =====
// ═══════════════════════════════════════════════════════

const LEAVE_TYPES = ["annual", "sick", "unpaid", "emergency", "other"];
const PENALTY_TYPES = ["warning", "deduction", "suspension", "other"];

async function fetchEmployeeForHR(employeeId, tenantId) {
  const snap = await db.collection(COLLECTIONS.EMPLOYEES).doc(employeeId).get();
  if (!snap.exists || snap.data().tenantId !== tenantId) {
    throw new HttpsError("invalid-argument", "الموظف غير صحيح.");
  }
  return snap.data();
}

// ===== طلب إجازة =====
exports.createLeaveRequest = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const employeeId = typeof data.employeeId === "string" ? data.employeeId.trim() : "";
    const type = LEAVE_TYPES.includes(data.type) ? data.type : "annual";
    const startDate = typeof data.startDate === "string" && isValidDate(data.startDate) ? data.startDate : null;
    const endDate = typeof data.endDate === "string" && isValidDate(data.endDate) ? data.endDate : null;
    const reason = typeof data.reason === "string" ? data.reason.trim() : "";

    if (!employeeId) throw new HttpsError("invalid-argument", "يجب تحديد الموظف.");
    if (!startDate || !endDate) throw new HttpsError("invalid-argument", "تواريخ الإجازة مطلوبة.");
    if (endDate < startDate) throw new HttpsError("invalid-argument", "تاريخ النهاية قبل البداية.");

    const days = Math.floor((new Date(endDate + "T00:00:00").getTime() - new Date(startDate + "T00:00:00").getTime()) / 86400000) + 1;

    const emp = await fetchEmployeeForHR(employeeId, callerTenantId);
    const ref = db.collection(COLLECTIONS.LEAVE_REQUESTS).doc();
    await ref.set(buildLeaveRequestDoc({
      tenantId: callerTenantId, employeeId, employeeName: emp.name || null, employeeCode: emp.employeeCode || null,
      type, startDate, endDate, days, reason, status: "pending",
      createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
    }));
    return { id: ref.id, days };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createLeaveRequest failed:", err);
    throw new HttpsError("internal", "تعذّر تسجيل الطلب، حاول مرة أخرى.");
  }
});

// ===== اعتماد/رفض إجازة =====
exports.updateLeaveStatus = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const leaveId = typeof data.leaveId === "string" ? data.leaveId.trim() : "";
    const action = data.action === "approve" ? "approved" : data.action === "reject" ? "rejected" : null;
    if (!leaveId) throw new HttpsError("invalid-argument", "يجب تحديد الطلب.");
    if (!action) throw new HttpsError("invalid-argument", "إجراء غير صحيح.");

    const ref = db.collection(COLLECTIONS.LEAVE_REQUESTS).doc(leaveId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الطلب غير صحيح.");
    }
    if (snap.data().status !== "pending") {
      throw new HttpsError("failed-precondition", "تمّت مراجعة هذا الطلب بالفعل.");
    }
    await ref.update({ status: action, reviewedBy: request.auth.uid, reviewedAt: FieldValue.serverTimestamp() });
    return { id: leaveId, status: action };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateLeaveStatus failed:", err);
    throw new HttpsError("internal", "تعذّر تحديث الطلب، حاول مرة أخرى.");
  }
});

// ===== تسجيل جزاء/مخالفة =====
exports.createPenalty = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const employeeId = typeof data.employeeId === "string" ? data.employeeId.trim() : "";
    const type = PENALTY_TYPES.includes(data.type) ? data.type : "warning";
    const date = typeof data.date === "string" && isValidDate(data.date) ? data.date : null;
    const reason = typeof data.reason === "string" ? data.reason.trim() : "";
    const amount = data.amount !== undefined && data.amount !== null && data.amount !== "" ? Number(data.amount) : null;

    if (!employeeId) throw new HttpsError("invalid-argument", "يجب تحديد الموظف.");
    if (!date) throw new HttpsError("invalid-argument", "تاريخ الجزاء مطلوب.");
    if (reason.length < 2) throw new HttpsError("invalid-argument", "سبب الجزاء مطلوب.");
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw new HttpsError("invalid-argument", "مبلغ الخصم غير صحيح.");

    const emp = await fetchEmployeeForHR(employeeId, callerTenantId);
    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const ref = db.collection(COLLECTIONS.PENALTIES).doc();
    const nextNumber = await db.runTransaction(async (tx) => {
      const tSnap = await tx.get(tenantRef);
      const n = ((tSnap.data() || {}).lastPenaltyNumber || 0) + 1;
      tx.set(ref, buildPenaltyDoc({
        tenantId: callerTenantId, penaltyNumber: n, employeeId,
        employeeName: emp.name || null, employeeCode: emp.employeeCode || null,
        type, date, amount, reason,
        createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
      }));
      tx.update(tenantRef, { lastPenaltyNumber: n });
      return n;
    });
    return { id: ref.id, penaltyNumber: nextNumber };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createPenalty failed:", err);
    throw new HttpsError("internal", "تعذّر تسجيل الجزاء، حاول مرة أخرى.");
  }
});

// ===== تقييم أداء =====
exports.createEvaluation = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const data = request.data || {};
    const employeeId = typeof data.employeeId === "string" ? data.employeeId.trim() : "";
    const period = typeof data.period === "string" ? data.period.trim() : "";
    const date = typeof data.date === "string" && isValidDate(data.date) ? data.date : new Date().toISOString().slice(0, 10);
    const strengths = typeof data.strengths === "string" ? data.strengths.trim() : "";
    const improvements = typeof data.improvements === "string" ? data.improvements.trim() : "";
    const notes = typeof data.notes === "string" ? data.notes.trim() : "";
    const rawCriteria = data.criteria && typeof data.criteria === "object" ? data.criteria : {};

    if (!employeeId) throw new HttpsError("invalid-argument", "يجب تحديد الموظف.");
    if (!period) throw new HttpsError("invalid-argument", "فترة التقييم مطلوبة.");

    // تنظيف المعايير (كل درجة 1-5) وحساب المتوسط
    const allowedKeys = ["quality", "commitment", "teamwork", "productivity", "initiative"];
    const criteria = {};
    let sum = 0, count = 0;
    for (const k of allowedKeys) {
      const v = Number(rawCriteria[k]);
      if (Number.isFinite(v) && v >= 1 && v <= 5) {
        criteria[k] = v;
        sum += v; count += 1;
      }
    }
    if (count === 0) throw new HttpsError("invalid-argument", "أدخل درجات التقييم.");
    const overallScore = Math.round((sum / count) * 100) / 100;

    const emp = await fetchEmployeeForHR(employeeId, callerTenantId);
    const ref = db.collection(COLLECTIONS.EVALUATIONS).doc();
    await ref.set(buildEvaluationDoc({
      tenantId: callerTenantId, employeeId, employeeName: emp.name || null, employeeCode: emp.employeeCode || null,
      period, date, criteria, overallScore, strengths, improvements, notes,
      createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
    }));
    return { id: ref.id, overallScore };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createEvaluation failed:", err);
    throw new HttpsError("internal", "تعذّر حفظ التقييم، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== العمليات: الإسناد الموحّد (موظف ← مشروع) =====
// ===== المرحلة 1: إسناد ملف الموظف مباشرة + عرض إسناداته =====
// ═══════════════════════════════════════════════════════

// ===== إسناد موظف لمشروع =====
exports.assignEmployeeToProject = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const projectId = typeof data.projectId === "string" ? data.projectId.trim() : "";
    const employeeId = typeof data.employeeId === "string" ? data.employeeId.trim() : "";
    const rentalPeriod = data.rentalPeriod === "daily" ? "daily" : "monthly";
    const rentalPrice = Number(data.rentalPrice) || 0;
    const monthlyCost = Number(data.monthlyCost) || 0;
    const hoursPerDay = Number(data.hoursPerDay) || 0;
    const daysPerWeek = Number(data.daysPerWeek) || 0;
    const monthlyHours = Math.round(hoursPerDay * daysPerWeek * 4.33 * 100) / 100; // ساعات شهرية تقديرية
    const targetProfit = Number(data.targetProfit) || 0;
    const startDate = typeof data.startDate === "string" && isValidDate(data.startDate) ? data.startDate : null;
    const endDate = typeof data.endDate === "string" && isValidDate(data.endDate) ? data.endDate : null;
    const notes = typeof data.notes === "string" ? data.notes.trim() : "";

    if (!projectId) throw new HttpsError("invalid-argument", "يجب تحديد المشروع.");
    if (!employeeId) throw new HttpsError("invalid-argument", "يجب تحديد الموظف.");
    if (rentalPrice < 0) throw new HttpsError("invalid-argument", "سعر التأجير غير صحيح.");
    if (monthlyCost < 0) throw new HttpsError("invalid-argument", "التكلفة غير صحيحة.");
    if (startDate && endDate && endDate < startDate) throw new HttpsError("invalid-argument", "تاريخ النهاية قبل البداية.");

    // التحقق من المشروع
    const projSnap = await db.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
    if (!projSnap.exists || projSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المشروع غير صحيح.");
    }
    const proj = projSnap.data();
    // التحقق من الموظف
    const empSnap = await db.collection(COLLECTIONS.EMPLOYEES).doc(employeeId).get();
    if (!empSnap.exists || empSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الموظف غير صحيح.");
    }
    const emp = empSnap.data();

    // منع إسناد نفس الموظف لنفس المشروع مرتين (نشط)
    const dup = await db.collection(COLLECTIONS.EMPLOYEE_ASSIGNMENTS)
      .where("tenantId", "==", callerTenantId)
      .where("employeeId", "==", employeeId)
      .where("projectId", "==", projectId)
      .where("status", "==", "active")
      .limit(1).get();
    if (!dup.empty) {
      throw new HttpsError("already-exists", "هذا الموظف مُسند لهذا المشروع بالفعل.");
    }

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const assignRef = db.collection(COLLECTIONS.EMPLOYEE_ASSIGNMENTS).doc();
    const nextNumber = await db.runTransaction(async (tx) => {
      const tSnap = await tx.get(tenantRef);
      const n = ((tSnap.data() || {}).lastEmpAssignmentNumber || 0) + 1;
      tx.set(assignRef, buildEmployeeAssignmentDoc({
        tenantId: callerTenantId, assignmentNumber: n,
        employeeId, employeeName: emp.name || null, employeeCode: emp.employeeCode || null,
        employeeJobTitle: (emp.job && emp.job.title) || null,
        projectId, projectName: proj.name || null, projectNumber: proj.projectNumber || null,
        rentalPrice, rentalPeriod, monthlyCost,
        hoursPerDay, daysPerWeek, monthlyHours, targetProfit,
        startDate, endDate, status: "active", notes,
        createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
      }));
      tx.update(tenantRef, { lastEmpAssignmentNumber: n });
      return n;
    });

    return { id: assignRef.id, assignmentNumber: nextNumber, employeeName: emp.name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("assignEmployeeToProject failed:", err);
    throw new HttpsError("internal", "تعذّر إسناد الموظف، حاول مرة أخرى.");
  }
});

// ===== جلب إسنادات موظف معيّن (لعرض «مسند في مشروع أ») =====
exports.getEmployeeAssignments = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const employeeId = typeof data.employeeId === "string" ? data.employeeId.trim() : "";
    if (!employeeId) throw new HttpsError("invalid-argument", "يجب تحديد الموظف.");

    const snap = await db.collection(COLLECTIONS.EMPLOYEE_ASSIGNMENTS)
      .where("tenantId", "==", callerTenantId)
      .where("employeeId", "==", employeeId)
      .where("status", "==", "active").get();

    const assignments = snap.docs.map((d) => {
      const a = d.data();
      return {
        id: d.id, projectId: a.projectId, projectName: a.projectName, projectNumber: a.projectNumber,
        rentalPrice: a.rentalPrice, rentalPeriod: a.rentalPeriod, monthlyCost: a.monthlyCost,
        startDate: a.startDate, endDate: a.endDate,
      };
    });
    const totalMonthlyCost = assignments.reduce((s, a) => s + (Number(a.monthlyCost) || 0), 0);
    return { employeeId, count: assignments.length, assignments, totalMonthlyCost };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getEmployeeAssignments failed:", err);
    throw new HttpsError("internal", "تعذّر جلب الإسنادات، حاول مرة أخرى.");
  }
});

// ===== إزالة إسناد =====
exports.removeAssignment = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const assignmentId = typeof data.assignmentId === "string" ? data.assignmentId.trim() : "";
    if (!assignmentId) throw new HttpsError("invalid-argument", "يجب تحديد الإسناد.");

    const ref = db.collection(COLLECTIONS.EMPLOYEE_ASSIGNMENTS).doc(assignmentId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الإسناد غير صحيح.");
    }
    await ref.update({ status: "removed", removedBy: request.auth.uid, removedAt: FieldValue.serverTimestamp() });
    return { id: assignmentId, status: "removed" };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("removeAssignment failed:", err);
    throw new HttpsError("internal", "تعذّر إزالة الإسناد، حاول مرة أخرى.");
  }
});

// ===== حساب توزيع التكاليف و Overtime (مشاركة الموارد) =====
// المنطق: موظف في عدة مشاريع → التكلفة الأساسية + الرسوم تتشارك بالتساوي،
// الربح ثابت لكل مشروع، والـ OT (إجمالي ساعات شهرية > السقف) يتشارك بالتساوي.
exports.getOperationsCosting = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const filterProjectId = typeof data.projectId === "string" ? data.projectId.trim() : "";

    const DAYS_PER_MONTH = 26;
    const STANDARD_HOURS_PER_DAY = 8;
    const monthlyCapHours = STANDARD_HOURS_PER_DAY * DAYS_PER_MONTH; // 208 ساعة شهريًا
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

    // كل الإسنادات النشطة
    const assignSnap = await db.collection(COLLECTIONS.EMPLOYEE_ASSIGNMENTS)
      .where("tenantId", "==", callerTenantId)
      .where("status", "==", "active").get();
    const allAssignments = assignSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // تجميع حسب الموظف (لحساب المشاركة عبر كل مشاريعه)
    const byEmployee = new Map();
    for (const a of allAssignments) {
      if (!byEmployee.has(a.employeeId)) byEmployee.set(a.employeeId, []);
      byEmployee.get(a.employeeId).push(a);
    }

    // جلب ملفات الموظفين (للتكلفة من الراتب والرسوم ومعدل OT)
    const empData = new Map();
    for (const eid of byEmployee.keys()) {
      const eSnap = await db.collection(COLLECTIONS.EMPLOYEES).doc(eid).get();
      if (eSnap.exists && eSnap.data().tenantId === callerTenantId) empData.set(eid, eSnap.data());
    }

    // حساب التوزيع لكل إسناد
    const results = [];
    for (const [eid, list] of byEmployee.entries()) {
      const emp = empData.get(eid) || {};
      const baseCost = (emp.salary && emp.salary.total) || 0;        // الراتب الأساسي (يتشارك)
      const govFees = (emp.costing && emp.costing.governmentFees) || 0; // رسوم حكومية/إدارية (تتشارك)
      const otRate = (emp.costing && emp.costing.otHourlyRate) || 0;    // معدل ساعة OT
      const N = list.length;                                         // عدد مشاريع الموظف
      const totalMonthlyHours = list.reduce((s, a) => s + (Number(a.monthlyHours) || 0), 0);
      const otHours = Math.max(0, totalMonthlyHours - monthlyCapHours); // الزيادة عن السقف الشهري
      const otCost = round2(otHours * otRate);

      for (const a of list) {
        const baseShare = round2(baseCost / N);   // نصيب هذا المشروع من الراتب
        const govShare = round2(govFees / N);     // نصيب هذا المشروع من الرسوم
        const otShare = round2(otCost / N);       // نصيب هذا المشروع من OT
        const profit = Number(a.targetProfit) || 0; // الربح المستهدف (ثابت — كامل لكل مشروع)
        const totalCost = round2(baseShare + govShare + otShare + profit);
        const revenue = Number(a.rentalPrice) || 0;
        const netProfit = round2(revenue - totalCost);
        results.push({
          assignmentId: a.id, employeeId: eid, employeeName: a.employeeName || null,
          employeeCode: a.employeeCode || null, employeeJobTitle: a.employeeJobTitle || null,
          projectId: a.projectId, projectName: a.projectName || null, projectNumber: a.projectNumber || null,
          projectsCount: N, isShared: N > 1,
          totalMonthlyHours: round2(totalMonthlyHours), monthlyCapHours,
          otHours: round2(otHours), hasOT: otHours > 0,
          baseShare, govShare, otShare, profit, totalCost, revenue, netProfit,
          rentalPeriod: a.rentalPeriod || "monthly",
        });
      }
    }

    const filtered = filterProjectId ? results.filter((r) => r.projectId === filterProjectId) : results;
    const summary = {
      totalRevenue: round2(filtered.reduce((s, r) => s + r.revenue, 0)),
      totalCost: round2(filtered.reduce((s, r) => s + r.totalCost, 0)),
      totalNetProfit: round2(filtered.reduce((s, r) => s + r.netProfit, 0)),
      count: filtered.length,
    };
    return { assignments: filtered, summary, monthlyCapHours };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getOperationsCosting failed:", err);
    throw new HttpsError("internal", "تعذّر حساب التكاليف، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== العمليات: المرافق (إسناد الأصول للمشاريع) =====
// ===== تكامل مع قسم الأصول — التكلفة تتوزّع عند المشاركة =====
// ═══════════════════════════════════════════════════════

// ===== إسناد أصل لمشروع =====
exports.assignAssetToProject = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const projectId = typeof data.projectId === "string" ? data.projectId.trim() : "";
    const assetId = typeof data.assetId === "string" ? data.assetId.trim() : "";
    const rentalPeriod = data.rentalPeriod === "daily" ? "daily" : "monthly";
    const rentalPrice = Number(data.rentalPrice) || 0;
    const monthlyCost = Number(data.monthlyCost) || 0;
    const startDate = typeof data.startDate === "string" && isValidDate(data.startDate) ? data.startDate : null;
    const endDate = typeof data.endDate === "string" && isValidDate(data.endDate) ? data.endDate : null;
    const notes = typeof data.notes === "string" ? data.notes.trim() : "";

    if (!projectId) throw new HttpsError("invalid-argument", "يجب تحديد المشروع.");
    if (!assetId) throw new HttpsError("invalid-argument", "يجب تحديد الأصل.");
    if (rentalPrice < 0) throw new HttpsError("invalid-argument", "سعر التأجير غير صحيح.");
    if (startDate && endDate && endDate < startDate) throw new HttpsError("invalid-argument", "تاريخ النهاية قبل البداية.");

    const projSnap = await db.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
    if (!projSnap.exists || projSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المشروع غير صحيح.");
    }
    const proj = projSnap.data();
    const assetSnap = await db.collection(COLLECTIONS.ASSETS).doc(assetId).get();
    if (!assetSnap.exists || assetSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الأصل غير صحيح.");
    }
    const asset = assetSnap.data();

    // منع إسناد نفس الأصل لنفس المشروع مرتين (نشط)
    const dup = await db.collection(COLLECTIONS.ASSET_ASSIGNMENTS)
      .where("tenantId", "==", callerTenantId)
      .where("assetId", "==", assetId)
      .where("projectId", "==", projectId)
      .where("status", "==", "active")
      .limit(1).get();
    if (!dup.empty) {
      throw new HttpsError("already-exists", "هذا الأصل مُسند لهذا المشروع بالفعل.");
    }

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const assignRef = db.collection(COLLECTIONS.ASSET_ASSIGNMENTS).doc();
    const nextNumber = await db.runTransaction(async (tx) => {
      const tSnap = await tx.get(tenantRef);
      const n = ((tSnap.data() || {}).lastAssetAssignmentNumber || 0) + 1;
      tx.set(assignRef, buildAssetAssignmentDoc({
        tenantId: callerTenantId, assignmentNumber: n,
        assetId, assetName: asset.name || null, assetCode: asset.assetNumber || null,
        assetType: asset.type || null, assetTypeName: asset.typeName || null,
        projectId, projectName: proj.name || null, projectNumber: proj.projectNumber || null,
        rentalPrice, rentalPeriod, monthlyCost,
        startDate, endDate, status: "active", notes,
        createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
      }));
      tx.update(tenantRef, { lastAssetAssignmentNumber: n });
      return n;
    });

    return { id: assignRef.id, assignmentNumber: nextNumber, assetName: asset.name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("assignAssetToProject failed:", err);
    throw new HttpsError("internal", "تعذّر إسناد الأصل، حاول مرة أخرى.");
  }
});

// ===== جلب إسنادات أصل معيّن =====
exports.getAssetAssignments = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const assetId = typeof data.assetId === "string" ? data.assetId.trim() : "";
    if (!assetId) throw new HttpsError("invalid-argument", "يجب تحديد الأصل.");

    const snap = await db.collection(COLLECTIONS.ASSET_ASSIGNMENTS)
      .where("tenantId", "==", callerTenantId)
      .where("assetId", "==", assetId)
      .where("status", "==", "active").get();
    const assignments = snap.docs.map((d) => {
      const a = d.data();
      return {
        id: d.id, projectId: a.projectId, projectName: a.projectName, projectNumber: a.projectNumber,
        rentalPrice: a.rentalPrice, monthlyCost: a.monthlyCost,
      };
    });
    return { assetId, count: assignments.length, assignments };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getAssetAssignments failed:", err);
    throw new HttpsError("internal", "تعذّر جلب الإسنادات، حاول مرة أخرى.");
  }
});

// ===== إزالة إسناد أصل =====
exports.removeAssetAssignment = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const assignmentId = typeof data.assignmentId === "string" ? data.assignmentId.trim() : "";
    if (!assignmentId) throw new HttpsError("invalid-argument", "يجب تحديد الإسناد.");

    const ref = db.collection(COLLECTIONS.ASSET_ASSIGNMENTS).doc(assignmentId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الإسناد غير صحيح.");
    }
    await ref.update({ status: "removed", removedBy: request.auth.uid, removedAt: FieldValue.serverTimestamp() });
    return { id: assignmentId, status: "removed" };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("removeAssetAssignment failed:", err);
    throw new HttpsError("internal", "تعذّر إزالة الإسناد، حاول مرة أخرى.");
  }
});

// ===== حساب توزيع تكاليف الأصول (مشاركة المرافق بين المشاريع) =====
exports.getAssetsCosting = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const filterProjectId = typeof data.projectId === "string" ? data.projectId.trim() : "";
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

    const assignSnap = await db.collection(COLLECTIONS.ASSET_ASSIGNMENTS)
      .where("tenantId", "==", callerTenantId)
      .where("status", "==", "active").get();
    const allAssignments = assignSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // تجميع حسب الأصل (لحساب المشاركة عبر مشاريعه)
    const byAsset = new Map();
    for (const a of allAssignments) {
      if (!byAsset.has(a.assetId)) byAsset.set(a.assetId, []);
      byAsset.get(a.assetId).push(a);
    }

    const results = [];
    for (const [, list] of byAsset.entries()) {
      const N = list.length;
      for (const a of list) {
        const costShare = round2((Number(a.monthlyCost) || 0) / N);
        const revenue = Number(a.rentalPrice) || 0;
        const netProfit = round2(revenue - costShare);
        results.push({
          assignmentId: a.id, assetId: a.assetId, assetName: a.assetName || null,
          assetCode: a.assetCode || null, assetType: a.assetType || null, assetTypeName: a.assetTypeName || null,
          projectId: a.projectId, projectName: a.projectName || null, projectNumber: a.projectNumber || null,
          projectsCount: N, isShared: N > 1,
          fullCost: round2(Number(a.monthlyCost) || 0), costShare, revenue, netProfit,
          rentalPeriod: a.rentalPeriod || "monthly",
        });
      }
    }

    const filtered = filterProjectId ? results.filter((r) => r.projectId === filterProjectId) : results;
    const summary = {
      totalRevenue: round2(filtered.reduce((s, r) => s + r.revenue, 0)),
      totalCost: round2(filtered.reduce((s, r) => s + r.costShare, 0)),
      totalNetProfit: round2(filtered.reduce((s, r) => s + r.netProfit, 0)),
      count: filtered.length,
    };
    return { assignments: filtered, summary };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getAssetsCosting failed:", err);
    throw new HttpsError("internal", "تعذّر حساب التكاليف، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== العمليات: المواد (تخصيص الأصناف للمشاريع) =====
// ===== تكامل مع المشتريات — استهلاك بكمية (لا توزيع) =====
// ═══════════════════════════════════════════════════════

// ===== تخصيص مادة لمشروع =====
exports.allocateMaterialToProject = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const projectId = typeof data.projectId === "string" ? data.projectId.trim() : "";
    const itemId = typeof data.itemId === "string" ? data.itemId.trim() : "";
    const quantity = Number(data.quantity) || 0;
    const unitCost = Number(data.unitCost) || 0;
    const unitSellPrice = Number(data.unitSellPrice) || 0;
    const notes = typeof data.notes === "string" ? data.notes.trim() : "";

    if (!projectId) throw new HttpsError("invalid-argument", "يجب تحديد المشروع.");
    if (!itemId) throw new HttpsError("invalid-argument", "يجب تحديد الصنف.");
    if (quantity <= 0) throw new HttpsError("invalid-argument", "الكمية يجب أن تكون أكبر من صفر.");
    if (unitCost < 0 || unitSellPrice < 0) throw new HttpsError("invalid-argument", "السعر غير صحيح.");

    const projSnap = await db.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
    if (!projSnap.exists || projSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المشروع غير صحيح.");
    }
    const proj = projSnap.data();
    const itemSnap = await db.collection(COLLECTIONS.ITEMS).doc(itemId).get();
    if (!itemSnap.exists || itemSnap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الصنف غير صحيح.");
    }
    const item = itemSnap.data();

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const allocRef = db.collection(COLLECTIONS.MATERIAL_ALLOCATIONS).doc();
    const nextNumber = await db.runTransaction(async (tx) => {
      const tSnap = await tx.get(tenantRef);
      const n = ((tSnap.data() || {}).lastMaterialAllocationNumber || 0) + 1;
      tx.set(allocRef, buildMaterialAllocationDoc({
        tenantId: callerTenantId, allocationNumber: n,
        itemId, itemName: item.name || null, itemCode: item.itemCode || null, unit: item.unit || null,
        projectId, projectName: proj.name || null, projectNumber: proj.projectNumber || null,
        quantity, unitCost, unitSellPrice,
        status: "active", notes,
        createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
      }));
      tx.update(tenantRef, { lastMaterialAllocationNumber: n });
      return n;
    });

    return { id: allocRef.id, allocationNumber: nextNumber, itemName: item.name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("allocateMaterialToProject failed:", err);
    throw new HttpsError("internal", "تعذّر تخصيص المادة، حاول مرة أخرى.");
  }
});

// ===== إزالة تخصيص مادة =====
exports.removeMaterialAllocation = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const allocationId = typeof data.allocationId === "string" ? data.allocationId.trim() : "";
    if (!allocationId) throw new HttpsError("invalid-argument", "يجب تحديد التخصيص.");

    const ref = db.collection(COLLECTIONS.MATERIAL_ALLOCATIONS).doc(allocationId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "التخصيص غير صحيح.");
    }
    await ref.update({ status: "removed", removedBy: request.auth.uid, removedAt: FieldValue.serverTimestamp() });
    return { id: allocationId, status: "removed" };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("removeMaterialAllocation failed:", err);
    throw new HttpsError("internal", "تعذّر إزالة التخصيص، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== العمليات التشغيلية (مهام · جدولة · جودة) =====
// ═══════════════════════════════════════════════════════

const TASK_PRIORITIES = ["low", "normal", "high", "urgent"];
const TASK_STATUSES = ["todo", "in_progress", "done", "cancelled"];
const MILESTONE_STATUSES = ["planned", "in_progress", "completed", "delayed"];
const INSPECTION_RESULTS = ["pass", "fail", "conditional"];

async function fetchProjectForOps(projectId, tenantId) {
  const snap = await db.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
  if (!snap.exists || snap.data().tenantId !== tenantId) {
    throw new HttpsError("invalid-argument", "المشروع غير صحيح.");
  }
  return snap.data();
}
async function nextCounter(tenantRef, field) {
  return db.runTransaction(async (tx) => {
    const tSnap = await tx.get(tenantRef);
    const n = ((tSnap.data() || {})[field] || 0) + 1;
    tx.update(tenantRef, { [field]: n });
    return n;
  });
}

// ---------- المهام ----------
exports.createTask = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const projectId = typeof data.projectId === "string" ? data.projectId.trim() : "";
    const title = typeof data.title === "string" ? data.title.trim() : "";
    const description = typeof data.description === "string" ? data.description.trim() : "";
    const assigneeId = typeof data.assigneeId === "string" ? data.assigneeId.trim() : "";
    const priority = TASK_PRIORITIES.includes(data.priority) ? data.priority : "normal";
    const dueDate = typeof data.dueDate === "string" && isValidDate(data.dueDate) ? data.dueDate : null;

    if (!projectId) throw new HttpsError("invalid-argument", "يجب تحديد المشروع.");
    if (title.length < 2) throw new HttpsError("invalid-argument", "عنوان المهمة مطلوب.");

    const proj = await fetchProjectForOps(projectId, callerTenantId);
    let assigneeName = null;
    if (assigneeId) {
      const eSnap = await db.collection(COLLECTIONS.EMPLOYEES).doc(assigneeId).get();
      if (eSnap.exists && eSnap.data().tenantId === callerTenantId) assigneeName = eSnap.data().name || null;
    }
    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const n = await nextCounter(tenantRef, "lastTaskNumber");
    const ref = db.collection(COLLECTIONS.OPERATION_TASKS).doc();
    await ref.set(buildOperationTaskDoc({
      tenantId: callerTenantId, taskNumber: n, projectId,
      projectName: proj.name || null, projectNumber: proj.projectNumber || null,
      title, description, assigneeId: assigneeId || null, assigneeName,
      priority, status: "todo", dueDate,
      createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
    }));
    return { id: ref.id, taskNumber: n };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createTask failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء المهمة، حاول مرة أخرى.");
  }
});

exports.updateTaskStatus = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const taskId = typeof data.taskId === "string" ? data.taskId.trim() : "";
    const status = TASK_STATUSES.includes(data.status) ? data.status : null;
    if (!taskId) throw new HttpsError("invalid-argument", "يجب تحديد المهمة.");
    if (!status) throw new HttpsError("invalid-argument", "حالة غير صحيحة.");

    const ref = db.collection(COLLECTIONS.OPERATION_TASKS).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "المهمة غير صحيحة.");
    await ref.update({ status, updatedBy: request.auth.uid, updatedAt: FieldValue.serverTimestamp() });
    return { id: taskId, status };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateTaskStatus failed:", err);
    throw new HttpsError("internal", "تعذّر تحديث المهمة، حاول مرة أخرى.");
  }
});

exports.deleteTask = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const taskId = typeof data.taskId === "string" ? data.taskId.trim() : "";
    if (!taskId) throw new HttpsError("invalid-argument", "يجب تحديد المهمة.");
    const ref = db.collection(COLLECTIONS.OPERATION_TASKS).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "المهمة غير صحيحة.");
    await ref.delete();
    return { id: taskId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteTask failed:", err);
    throw new HttpsError("internal", "تعذّر حذف المهمة، حاول مرة أخرى.");
  }
});

// ---------- المراحل (الجدولة) ----------
exports.createMilestone = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const projectId = typeof data.projectId === "string" ? data.projectId.trim() : "";
    const title = typeof data.title === "string" ? data.title.trim() : "";
    const description = typeof data.description === "string" ? data.description.trim() : "";
    const startDate = typeof data.startDate === "string" && isValidDate(data.startDate) ? data.startDate : null;
    const endDate = typeof data.endDate === "string" && isValidDate(data.endDate) ? data.endDate : null;
    const progress = Number(data.progress) || 0;
    const status = MILESTONE_STATUSES.includes(data.status) ? data.status : "planned";

    if (!projectId) throw new HttpsError("invalid-argument", "يجب تحديد المشروع.");
    if (title.length < 2) throw new HttpsError("invalid-argument", "عنوان المرحلة مطلوب.");
    if (startDate && endDate && endDate < startDate) throw new HttpsError("invalid-argument", "تاريخ النهاية قبل البداية.");

    const proj = await fetchProjectForOps(projectId, callerTenantId);
    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const n = await nextCounter(tenantRef, "lastMilestoneNumber");
    const ref = db.collection(COLLECTIONS.PROJECT_MILESTONES).doc();
    await ref.set(buildMilestoneDoc({
      tenantId: callerTenantId, milestoneNumber: n, projectId,
      projectName: proj.name || null, projectNumber: proj.projectNumber || null,
      title, description, startDate, endDate, progress, status,
      createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
    }));
    return { id: ref.id, milestoneNumber: n };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createMilestone failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء المرحلة، حاول مرة أخرى.");
  }
});

exports.updateMilestone = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const milestoneId = typeof data.milestoneId === "string" ? data.milestoneId.trim() : "";
    if (!milestoneId) throw new HttpsError("invalid-argument", "يجب تحديد المرحلة.");
    const ref = db.collection(COLLECTIONS.PROJECT_MILESTONES).doc(milestoneId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "المرحلة غير صحيحة.");

    const updates = { updatedBy: request.auth.uid, updatedAt: FieldValue.serverTimestamp() };
    if (data.progress !== undefined) {
      let p = Number(data.progress); if (!Number.isFinite(p) || p < 0) p = 0; if (p > 100) p = 100;
      updates.progress = p;
    }
    if (MILESTONE_STATUSES.includes(data.status)) updates.status = data.status;
    if (typeof data.title === "string" && data.title.trim().length >= 2) updates.title = data.title.trim();
    if (typeof data.startDate === "string" && isValidDate(data.startDate)) updates.startDate = data.startDate;
    if (typeof data.endDate === "string" && isValidDate(data.endDate)) updates.endDate = data.endDate;
    await ref.update(updates);
    return { id: milestoneId, updated: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateMilestone failed:", err);
    throw new HttpsError("internal", "تعذّر تحديث المرحلة، حاول مرة أخرى.");
  }
});

exports.deleteMilestone = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const milestoneId = typeof data.milestoneId === "string" ? data.milestoneId.trim() : "";
    if (!milestoneId) throw new HttpsError("invalid-argument", "يجب تحديد المرحلة.");
    const ref = db.collection(COLLECTIONS.PROJECT_MILESTONES).doc(milestoneId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "المرحلة غير صحيحة.");
    await ref.delete();
    return { id: milestoneId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteMilestone failed:", err);
    throw new HttpsError("internal", "تعذّر حذف المرحلة، حاول مرة أخرى.");
  }
});

// ---------- فحوصات الجودة ----------
exports.createInspection = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const projectId = typeof data.projectId === "string" ? data.projectId.trim() : "";
    const title = typeof data.title === "string" ? data.title.trim() : "";
    const inspectionDate = typeof data.inspectionDate === "string" && isValidDate(data.inspectionDate) ? data.inspectionDate : null;
    const result = INSPECTION_RESULTS.includes(data.result) ? data.result : "pass";
    const inspectorName = typeof data.inspectorName === "string" ? data.inspectorName.trim() : "";
    const findings = typeof data.findings === "string" ? data.findings.trim() : "";
    const notes = typeof data.notes === "string" ? data.notes.trim() : "";

    if (!projectId) throw new HttpsError("invalid-argument", "يجب تحديد المشروع.");
    if (title.length < 2) throw new HttpsError("invalid-argument", "عنوان الفحص مطلوب.");
    if (!inspectionDate) throw new HttpsError("invalid-argument", "تاريخ الفحص مطلوب.");

    const proj = await fetchProjectForOps(projectId, callerTenantId);
    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const n = await nextCounter(tenantRef, "lastInspectionNumber");
    const ref = db.collection(COLLECTIONS.QUALITY_INSPECTIONS).doc();
    await ref.set(buildInspectionDoc({
      tenantId: callerTenantId, inspectionNumber: n, projectId,
      projectName: proj.name || null, projectNumber: proj.projectNumber || null,
      title, inspectionDate, result, inspectorName, findings, notes,
      createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
    }));
    return { id: ref.id, inspectionNumber: n };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createInspection failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الفحص، حاول مرة أخرى.");
  }
});

exports.deleteInspection = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const inspectionId = typeof data.inspectionId === "string" ? data.inspectionId.trim() : "";
    if (!inspectionId) throw new HttpsError("invalid-argument", "يجب تحديد الفحص.");
    const ref = db.collection(COLLECTIONS.QUALITY_INSPECTIONS).doc(inspectionId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "الفحص غير صحيح.");
    await ref.delete();
    return { id: inspectionId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteInspection failed:", err);
    throw new HttpsError("internal", "تعذّر حذف الفحص، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== التخطيط والرقابة (ربحية المشروع + الموازنة) =====
// ═══════════════════════════════════════════════════════

// helper داخلي: تكاليف وإيرادات الأفراد لكل مشروع (مع التوزيع و OT)
async function computePeopleByProject(tenantId) {
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const cap = 26 * 8; // السقف الشهري
  const snap = await db.collection(COLLECTIONS.EMPLOYEE_ASSIGNMENTS)
    .where("tenantId", "==", tenantId).where("status", "==", "active").get();
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const byEmp = new Map();
  for (const a of all) { if (!byEmp.has(a.employeeId)) byEmp.set(a.employeeId, []); byEmp.get(a.employeeId).push(a); }
  const empData = new Map();
  for (const eid of byEmp.keys()) {
    const e = await db.collection(COLLECTIONS.EMPLOYEES).doc(eid).get();
    if (e.exists && e.data().tenantId === tenantId) empData.set(eid, e.data());
  }
  const byProject = {};
  for (const [eid, list] of byEmp.entries()) {
    const emp = empData.get(eid) || {};
    const baseCost = (emp.salary && emp.salary.total) || 0;
    const govFees = (emp.costing && emp.costing.governmentFees) || 0;
    const otRate = (emp.costing && emp.costing.otHourlyRate) || 0;
    const N = list.length;
    const totalHours = list.reduce((s, a) => s + (Number(a.monthlyHours) || 0), 0);
    const otCost = Math.max(0, totalHours - cap) * otRate;
    for (const a of list) {
      const cost = baseCost / N + govFees / N + otCost / N + (Number(a.targetProfit) || 0);
      if (!byProject[a.projectId]) byProject[a.projectId] = { cost: 0, revenue: 0 };
      byProject[a.projectId].cost += cost;
      byProject[a.projectId].revenue += Number(a.rentalPrice) || 0;
    }
  }
  for (const k in byProject) { byProject[k].cost = round2(byProject[k].cost); byProject[k].revenue = round2(byProject[k].revenue); }
  return byProject;
}

// helper داخلي: تكاليف وإيرادات المرافق لكل مشروع (مع التوزيع)
async function computeAssetsByProject(tenantId) {
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const snap = await db.collection(COLLECTIONS.ASSET_ASSIGNMENTS)
    .where("tenantId", "==", tenantId).where("status", "==", "active").get();
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const byAsset = new Map();
  for (const a of all) { if (!byAsset.has(a.assetId)) byAsset.set(a.assetId, []); byAsset.get(a.assetId).push(a); }
  const byProject = {};
  for (const [, list] of byAsset.entries()) {
    const N = list.length;
    for (const a of list) {
      if (!byProject[a.projectId]) byProject[a.projectId] = { cost: 0, revenue: 0 };
      byProject[a.projectId].cost += (Number(a.monthlyCost) || 0) / N;
      byProject[a.projectId].revenue += Number(a.rentalPrice) || 0;
    }
  }
  for (const k in byProject) { byProject[k].cost = round2(byProject[k].cost); byProject[k].revenue = round2(byProject[k].revenue); }
  return byProject;
}

// ===== حفظ/تحديث موازنة مشروع =====
exports.setBudget = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const projectId = typeof data.projectId === "string" ? data.projectId.trim() : "";
    if (!projectId) throw new HttpsError("invalid-argument", "يجب تحديد المشروع.");
    const proj = await db.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
    if (!proj.exists || proj.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "المشروع غير صحيح.");

    const ref = db.collection(COLLECTIONS.PROJECT_BUDGETS).doc(projectId);
    await ref.set(buildBudgetDoc({
      tenantId: callerTenantId, projectId,
      budgetPeople: data.budgetPeople, budgetFacilities: data.budgetFacilities,
      budgetMaterials: data.budgetMaterials, targetRevenue: data.targetRevenue,
      updatedBy: request.auth.uid, updatedAt: FieldValue.serverTimestamp(),
    }));
    return { projectId, saved: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("setBudget failed:", err);
    throw new HttpsError("internal", "تعذّر حفظ الموازنة، حاول مرة أخرى.");
  }
});

// ===== ربحية المشروع: الفعلي (تلقائي) + الموازنة + الانحراف =====
// ربحية المشروع الإجمالية (تراكمية، مع موازنة) — تُستخدم في لوحة التخطيط
exports.getProjectProfitabilityTotal = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);
    const data = request.data || {};
    const projectId = typeof data.projectId === "string" ? data.projectId.trim() : "";
    if (!projectId) throw new HttpsError("invalid-argument", "يجب تحديد المشروع.");
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

    // الفعلي (تلقائي من الأفراد + المرافق + المواد)
    const [peopleMap, assetsMap] = await Promise.all([
      computePeopleByProject(callerTenantId),
      computeAssetsByProject(callerTenantId),
    ]);
    const people = peopleMap[projectId] || { cost: 0, revenue: 0 };
    const facilities = assetsMap[projectId] || { cost: 0, revenue: 0 };

    const matSnap = await db.collection(COLLECTIONS.MATERIAL_ALLOCATIONS)
      .where("tenantId", "==", callerTenantId).where("projectId", "==", projectId).where("status", "==", "active").get();
    let matCost = 0, matRev = 0;
    matSnap.docs.forEach((d) => { const m = d.data(); matCost += Number(m.totalCost) || 0; matRev += Number(m.totalSell) || 0; });
    matCost = round2(matCost); matRev = round2(matRev);

    const actual = {
      people: people.cost, facilities: facilities.cost, materials: matCost,
      totalCost: round2(people.cost + facilities.cost + matCost),
      peopleRev: people.revenue, facilitiesRev: facilities.revenue, materialsRev: matRev,
      totalRevenue: round2(people.revenue + facilities.revenue + matRev),
    };
    actual.netProfit = round2(actual.totalRevenue - actual.totalCost);
    actual.margin = actual.totalRevenue > 0 ? round2((actual.netProfit / actual.totalRevenue) * 100) : 0;

    // الموازنة المخطّطة
    const budSnap = await db.collection(COLLECTIONS.PROJECT_BUDGETS).doc(projectId).get();
    const b = budSnap.exists ? budSnap.data() : {};
    const bp = Number(b.budgetPeople) || 0, bf = Number(b.budgetFacilities) || 0, bm = Number(b.budgetMaterials) || 0, tr = Number(b.targetRevenue) || 0;
    const budgetTotalCost = round2(bp + bf + bm);

    return {
      projectId,
      actual,
      budget: { people: bp, facilities: bf, materials: bm, totalCost: budgetTotalCost, targetRevenue: tr, hasBudget: budSnap.exists },
      variance: {
        people: round2(bp - actual.people),           // موجب = تحت الميزانية (جيد)
        facilities: round2(bf - actual.facilities),
        materials: round2(bm - actual.materials),
        totalCost: round2(budgetTotalCost - actual.totalCost),
        revenue: round2(actual.totalRevenue - tr),     // موجب = فوق المستهدف (جيد)
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getProjectProfitability failed:", err);
    throw new HttpsError("internal", "تعذّر حساب الربحية، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== إعدادات الشركة (بيانات البائع + إعدادات التكلفة) =====
// ═══════════════════════════════════════════════════════

// ===== تحديث بيانات الشركة الضريبية والعنوان وإعدادات التوحيد (المالك أو المالية) =====
exports.updateCompanyProfile = onCall(async (request) => {
  try {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
    }
    const callerTenantId = auth.token.tenantId;
    if (!callerTenantId) {
      throw new HttpsError("failed-precondition", "حسابك غير مرتبط بشركة.");
    }

    const callerRole = auth.token.role;
    if (callerRole !== ROLES.OWNER) {
      const callerDoc = await db.collection(COLLECTIONS.USERS).doc(auth.uid).get();
      const perms = callerDoc.exists ? (callerDoc.data().permissions || []) : [];
      if (!perms.includes(MODULES.FINANCE)) {
        throw new HttpsError("permission-denied", "تحتاج صلاحية المالية لتعديل بيانات الشركة.");
      }
    }

    const data = request.data || {};
    const taxNumber = typeof data.taxNumber === "string" ? data.taxNumber.trim() : "";
    const crNumber = typeof data.crNumber === "string" ? data.crNumber.trim() : "";

    if (taxNumber && !/^3\d{13}3$/.test(taxNumber)) {
      throw new HttpsError("invalid-argument", "الرقم الضريبي يجب أن يكون 15 رقمًا يبدأ وينتهي بالرقم 3.");
    }

    // إعدادات التوحيد (أساس حساب التكلفة)
    const update = {
      taxNumber: taxNumber || null,
      crNumber: crNumber || null,
      address: {
        buildingNumber: typeof data.buildingNumber === "string" ? data.buildingNumber.trim() || null : null,
        street: typeof data.street === "string" ? data.street.trim() || null : null,
        district: typeof data.district === "string" ? data.district.trim() || null : null,
        city: typeof data.city === "string" ? data.city.trim() || null : null,
        postalCode: typeof data.postalCode === "string" ? data.postalCode.trim() || null : null,
        additionalNumber: typeof data.additionalNumber === "string" ? data.additionalNumber.trim() || null : null,
      },
    };

    // أيام العمل الشهرية وساعات اليوم (إن أُرسلت)
    if (data.workDaysPerMonth !== undefined) {
      const wd = Number(data.workDaysPerMonth);
      if (!Number.isFinite(wd) || wd < 1 || wd > 31) {
        throw new HttpsError("invalid-argument", "أيام العمل الشهرية يجب أن تكون بين 1 و31.");
      }
      update.workDaysPerMonth = wd;
    }
    if (data.workHoursPerDay !== undefined) {
      const wh = Number(data.workHoursPerDay);
      if (!Number.isFinite(wh) || wh < 1 || wh > 24) {
        throw new HttpsError("invalid-argument", "ساعات العمل اليومية يجب أن تكون بين 1 و24.");
      }
      update.workHoursPerDay = wh;
    }

    await db.collection(COLLECTIONS.TENANTS).doc(callerTenantId).update(update);
    return { tenantId: callerTenantId, taxNumber: taxNumber || null };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateCompanyProfile failed:", err);
    throw new HttpsError("internal", "تعذّر تحديث بيانات الشركة، حاول مرة أخرى.");
  }
});


// ═══════════════════════════════════════════════════════
// ===== المشاريع =====
// ═══════════════════════════════════════════════════════

const {
  DEFAULT_PROJECT_TYPES,
  PROJECT_STATUS,
  buildProjectTypeDoc,
  buildProjectDoc,
  validateProjectStatus,
} = require("./schema");

// ===== زرع أنواع المشاريع الافتراضية =====
exports.seedProjectTypes = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);

    const existing = await db.collection(COLLECTIONS.PROJECT_TYPES)
      .where("tenantId", "==", callerTenantId)
      .limit(1)
      .get();
    if (!existing.empty) {
      throw new HttpsError("already-exists", "أنواع المشاريع موجودة بالفعل لهذه الشركة.");
    }

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    let count = 0;
    for (const t of DEFAULT_PROJECT_TYPES) {
      const ref = db.collection(COLLECTIONS.PROJECT_TYPES).doc();
      batch.set(ref, buildProjectTypeDoc({
        tenantId: callerTenantId,
        name: t.name,
        code: t.code,
        description: t.description,
        isSystem: true,
        createdBy: request.auth.uid,
        createdAt: now,
      }));
      count++;
    }
    await batch.commit();

    return { seeded: count };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("seedProjectTypes failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء أنواع المشاريع، حاول مرة أخرى.");
  }
});

// ===== إنشاء نوع مشروع =====
exports.createProjectType = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);

    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const description = typeof data.description === "string" ? data.description.trim() : "";

    if (name.length < 2) {
      throw new HttpsError("invalid-argument", "اسم النوع مطلوب (حرفان على الأقل).");
    }

    const typeRef = db.collection(COLLECTIONS.PROJECT_TYPES).doc();
    await typeRef.set(buildProjectTypeDoc({
      tenantId: callerTenantId,
      name: name,
      code: null,
      description: description || null,
      isSystem: false,
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    }));

    return { id: typeRef.id, name: name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createProjectType failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء النوع، حاول مرة أخرى.");
  }
});

// ===== إنشاء مشروع =====
// data: { name, customerId, typeIds:[], contractNumber, city, location, startDate, endDate, description }
exports.createProject = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);

    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const customerId = typeof data.customerId === "string" ? data.customerId.trim() : "";
    const typeIds = Array.isArray(data.typeIds) ? data.typeIds : [];
    const contractNumber = typeof data.contractNumber === "string" ? data.contractNumber.trim() : "";
    const city = typeof data.city === "string" ? data.city.trim() : "";
    const location = typeof data.location === "string" ? data.location.trim() : "";
    const startDate = typeof data.startDate === "string" ? data.startDate.trim() : "";
    const endDate = typeof data.endDate === "string" ? data.endDate.trim() : "";
    const description = typeof data.description === "string" ? data.description.trim() : "";

    if (name.length < 2) {
      throw new HttpsError("invalid-argument", "اسم المشروع مطلوب (حرفان على الأقل).");
    }
    if (!customerId) {
      throw new HttpsError("invalid-argument", "يجب اختيار العميل.");
    }
    if (startDate && !isValidDate(startDate)) {
      throw new HttpsError("invalid-argument", "تاريخ البداية غير صحيح (YYYY-MM-DD).");
    }
    if (endDate && !isValidDate(endDate)) {
      throw new HttpsError("invalid-argument", "تاريخ النهاية غير صحيح (YYYY-MM-DD).");
    }
    if (startDate && endDate && endDate < startDate) {
      throw new HttpsError("invalid-argument", "تاريخ النهاية يجب أن يكون بعد البداية.");
    }

    // تحقّق من العميل
    const customerDoc = await db.collection(COLLECTIONS.CUSTOMERS).doc(customerId).get();
    if (!customerDoc.exists || customerDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "العميل غير صحيح.");
    }
    const customerName = customerDoc.data().name || null;

    // تحقّق من الأنواع وجلب أسمائها
    const typeNames = [];
    const validTypeIds = [];
    for (const typeId of typeIds) {
      if (typeof typeId !== "string" || !typeId) continue;
      const typeDoc = await db.collection(COLLECTIONS.PROJECT_TYPES).doc(typeId).get();
      if (typeDoc.exists && typeDoc.data().tenantId === callerTenantId) {
        validTypeIds.push(typeId);
        typeNames.push(typeDoc.data().name);
      }
    }
    if (validTypeIds.length === 0) {
      throw new HttpsError("invalid-argument", "يجب اختيار نوع مشروع واحد على الأقل.");
    }

    // ترقيم تسلسلي ذرّي
    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const projectRef = db.collection(COLLECTIONS.PROJECTS).doc();

    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) {
        throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      }
      const nextNumber = (tenantSnap.data().lastProjectNumber || 0) + 1;

      const projectDoc = buildProjectDoc({
        tenantId: callerTenantId,
        projectNumber: nextNumber,
        name: name,
        customerId: customerId,
        customerName: customerName,
        typeIds: validTypeIds,
        typeNames: typeNames,
        contractNumber: contractNumber || null,
        city: city || null,
        location: location || null,
        startDate: startDate || null,
        endDate: endDate || null,
        status: PROJECT_STATUS.PLANNED,
        description: description || null,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(projectRef, projectDoc);
      tx.update(tenantRef, { lastProjectNumber: nextNumber });

      return { projectNumber: nextNumber };
    });

    return { id: projectRef.id, projectNumber: result.projectNumber, name: name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createProject failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء المشروع، حاول مرة أخرى.");
  }
});

// ===== تعديل مشروع =====
// data: { projectId, name, typeIds, contractNumber, city, location, startDate, endDate, status, description }
exports.updateProject = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);

    const data = request.data || {};
    const projectId = typeof data.projectId === "string" ? data.projectId.trim() : "";
    if (!projectId) {
      throw new HttpsError("invalid-argument", "يجب تحديد المشروع.");
    }

    const projectRef = db.collection(COLLECTIONS.PROJECTS).doc(projectId);
    const snap = await projectRef.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المشروع غير صحيح.");
    }

    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (name.length < 2) {
      throw new HttpsError("invalid-argument", "اسم المشروع مطلوب (حرفان على الأقل).");
    }

    const startDate = typeof data.startDate === "string" ? data.startDate.trim() : "";
    const endDate = typeof data.endDate === "string" ? data.endDate.trim() : "";
    if (startDate && !isValidDate(startDate)) {
      throw new HttpsError("invalid-argument", "تاريخ البداية غير صحيح.");
    }
    if (endDate && !isValidDate(endDate)) {
      throw new HttpsError("invalid-argument", "تاريخ النهاية غير صحيح.");
    }
    if (startDate && endDate && endDate < startDate) {
      throw new HttpsError("invalid-argument", "تاريخ النهاية يجب أن يكون بعد البداية.");
    }

    const status = typeof data.status === "string" ? data.status.trim() : "";
    if (status && !validateProjectStatus(status)) {
      throw new HttpsError("invalid-argument", "حالة المشروع غير صحيحة.");
    }

    // الأنواع (إن أُرسلت)
    const update = {
      name: name,
      contractNumber: typeof data.contractNumber === "string" ? data.contractNumber.trim() || null : null,
      city: typeof data.city === "string" ? data.city.trim() || null : null,
      location: typeof data.location === "string" ? data.location.trim() || null : null,
      startDate: startDate || null,
      endDate: endDate || null,
      description: typeof data.description === "string" ? data.description.trim() || null : null,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (status) update.status = status;

    if (Array.isArray(data.typeIds)) {
      const typeNames = [];
      const validTypeIds = [];
      for (const typeId of data.typeIds) {
        if (typeof typeId !== "string" || !typeId) continue;
        const typeDoc = await db.collection(COLLECTIONS.PROJECT_TYPES).doc(typeId).get();
        if (typeDoc.exists && typeDoc.data().tenantId === callerTenantId) {
          validTypeIds.push(typeId);
          typeNames.push(typeDoc.data().name);
        }
      }
      if (validTypeIds.length === 0) {
        throw new HttpsError("invalid-argument", "يجب اختيار نوع مشروع واحد على الأقل.");
      }
      update.typeIds = validTypeIds;
      update.typeNames = typeNames;
    }

    await projectRef.update(update);
    return { id: projectId, name: name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateProject failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل المشروع، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== المهن (الموارد البشرية) =====
// ═══════════════════════════════════════════════════════

const {
  buildJobTitleDoc,
  buildResourceRequestDoc,
  validateRequestStatus,
  REQUEST_STATUS,
  RESOURCE_TYPES,
  REQUEST_PRIORITY,
} = require("./schema");

// ===== إنشاء مهنة =====
exports.createJobTitle = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);

    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const description = typeof data.description === "string" ? data.description.trim() : "";

    if (name.length < 2) {
      throw new HttpsError("invalid-argument", "اسم المهنة مطلوب (حرفان على الأقل).");
    }

    // منع التكرار
    const dup = await db.collection(COLLECTIONS.JOB_TITLES)
      .where("tenantId", "==", callerTenantId)
      .where("name", "==", name)
      .limit(1)
      .get();
    if (!dup.empty) {
      throw new HttpsError("already-exists", "هذه المهنة موجودة بالفعل.");
    }

    const ref = db.collection(COLLECTIONS.JOB_TITLES).doc();
    await ref.set(buildJobTitleDoc({
      tenantId: callerTenantId,
      name: name,
      description: description || null,
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    }));

    return { id: ref.id, name: name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createJobTitle failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء المهنة، حاول مرة أخرى.");
  }
});

// ===== تعديل/تعطيل مهنة =====
exports.updateJobTitle = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);

    const data = request.data || {};
    const jobTitleId = typeof data.jobTitleId === "string" ? data.jobTitleId.trim() : "";
    if (!jobTitleId) {
      throw new HttpsError("invalid-argument", "يجب تحديد المهنة.");
    }

    const ref = db.collection(COLLECTIONS.JOB_TITLES).doc(jobTitleId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المهنة غير صحيحة.");
    }

    const update = {};
    if (typeof data.name === "string") {
      const name = data.name.trim();
      if (name.length < 2) {
        throw new HttpsError("invalid-argument", "اسم المهنة مطلوب (حرفان على الأقل).");
      }
      update.name = name;
    }
    if (typeof data.description === "string") {
      update.description = data.description.trim() || null;
    }
    if (typeof data.isActive === "boolean") {
      update.isActive = data.isActive;
    }

    await ref.update(update);
    return { id: jobTitleId };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateJobTitle failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل المهنة، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== طلب الموارد (المشاريع ← العمليات) =====
// ═══════════════════════════════════════════════════════

// ===== إنشاء طلب موارد (المشاريع) =====
// data: { projectId, resourceType, jobTitleId, quantity, shiftId, city, specifications, startDate, endDate, priority }
exports.createResourceRequest = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);

    const data = request.data || {};
    const projectId = typeof data.projectId === "string" ? data.projectId.trim() : "";
    const resourceType = data.resourceType === RESOURCE_TYPES.EQUIPMENT ? RESOURCE_TYPES.EQUIPMENT : RESOURCE_TYPES.LABOR;
    const jobTitleId = typeof data.jobTitleId === "string" ? data.jobTitleId.trim() : "";
    const quantity = Number(data.quantity);
    const shiftId = typeof data.shiftId === "string" ? data.shiftId.trim() : "";
    const city = typeof data.city === "string" ? data.city.trim() : "";
    const specifications = typeof data.specifications === "string" ? data.specifications.trim() : "";
    const startDate = typeof data.startDate === "string" ? data.startDate.trim() : "";
    const endDate = typeof data.endDate === "string" ? data.endDate.trim() : "";
    const priority = data.priority === REQUEST_PRIORITY.URGENT ? REQUEST_PRIORITY.URGENT : REQUEST_PRIORITY.NORMAL;

    if (!projectId) {
      throw new HttpsError("invalid-argument", "يجب تحديد المشروع.");
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new HttpsError("invalid-argument", "الكمية المطلوبة غير صحيحة.");
    }
    if (startDate && !isValidDate(startDate)) {
      throw new HttpsError("invalid-argument", "تاريخ البداية غير صحيح.");
    }
    if (endDate && !isValidDate(endDate)) {
      throw new HttpsError("invalid-argument", "تاريخ النهاية غير صحيح.");
    }
    if (startDate && endDate && endDate < startDate) {
      throw new HttpsError("invalid-argument", "تاريخ النهاية يجب أن يكون بعد البداية.");
    }

    // تحقّق من المشروع
    const projectDoc = await db.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
    if (!projectDoc.exists || projectDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المشروع غير صحيح.");
    }
    const project = projectDoc.data();

    // للعمالة: المهنة مطلوبة
    let jobTitleName = null;
    if (resourceType === RESOURCE_TYPES.LABOR) {
      if (!jobTitleId) {
        throw new HttpsError("invalid-argument", "يجب تحديد المهنة المطلوبة.");
      }
      const jobDoc = await db.collection(COLLECTIONS.JOB_TITLES).doc(jobTitleId).get();
      if (!jobDoc.exists || jobDoc.data().tenantId !== callerTenantId) {
        throw new HttpsError("invalid-argument", "المهنة غير صحيحة.");
      }
      jobTitleName = jobDoc.data().name;
    }

    // الشِفت (اختياري لكن إن أُرسل يجب أن يكون صحيحًا)
    let shiftName = null;
    if (shiftId) {
      const shiftDoc = await db.collection(COLLECTIONS.SHIFTS).doc(shiftId).get();
      if (!shiftDoc.exists || shiftDoc.data().tenantId !== callerTenantId) {
        throw new HttpsError("invalid-argument", "الشِفت غير صحيح.");
      }
      shiftName = shiftDoc.data().name;
    }

    // ترقيم تسلسلي ذرّي
    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const reqRef = db.collection(COLLECTIONS.RESOURCE_REQUESTS).doc();

    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) {
        throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      }
      const nextNumber = (tenantSnap.data().lastRequestNumber || 0) + 1;

      const reqDoc = buildResourceRequestDoc({
        tenantId: callerTenantId,
        requestNumber: nextNumber,
        projectId: projectId,
        projectName: project.name || null,
        projectNumber: project.projectNumber || null,
        resourceType: resourceType,
        jobTitleId: resourceType === RESOURCE_TYPES.LABOR ? jobTitleId : null,
        jobTitleName: jobTitleName,
        quantity: quantity,
        shiftId: shiftId || null,
        shiftName: shiftName,
        city: city || project.city || null,
        specifications: specifications || null,
        startDate: startDate || null,
        endDate: endDate || null,
        priority: priority,
        status: REQUEST_STATUS.PENDING,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(reqRef, reqDoc);
      tx.update(tenantRef, { lastRequestNumber: nextNumber });

      return { requestNumber: nextNumber };
    });

    return { id: reqRef.id, requestNumber: result.requestNumber };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createResourceRequest failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الطلب، حاول مرة أخرى.");
  }
});

// ===== تعديل طلب موارد (المشاريع) =====
exports.updateResourceRequest = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.PROJECTS);

    const data = request.data || {};
    const requestId = typeof data.requestId === "string" ? data.requestId.trim() : "";
    if (!requestId) {
      throw new HttpsError("invalid-argument", "يجب تحديد الطلب.");
    }

    const reqRef = db.collection(COLLECTIONS.RESOURCE_REQUESTS).doc(requestId);
    const snap = await reqRef.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الطلب غير صحيح.");
    }
    const current = snap.data();

    // لا يُعدّل الطلب المكتمل أو الملغى
    if (current.status === REQUEST_STATUS.FULFILLED || current.status === REQUEST_STATUS.CANCELLED) {
      throw new HttpsError("failed-precondition", "لا يمكن تعديل طلب مكتمل أو ملغى.");
    }

    const update = { updatedAt: FieldValue.serverTimestamp() };

    if (data.quantity !== undefined) {
      const quantity = Number(data.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new HttpsError("invalid-argument", "الكمية المطلوبة غير صحيحة.");
      }
      update.quantity = quantity;
    }
    if (typeof data.specifications === "string") {
      update.specifications = data.specifications.trim() || null;
    }
    if (typeof data.city === "string") {
      update.city = data.city.trim() || null;
    }
    if (data.priority !== undefined) {
      update.priority = data.priority === REQUEST_PRIORITY.URGENT ? REQUEST_PRIORITY.URGENT : REQUEST_PRIORITY.NORMAL;
    }
    if (typeof data.startDate === "string" && data.startDate.trim()) {
      if (!isValidDate(data.startDate.trim())) {
        throw new HttpsError("invalid-argument", "تاريخ البداية غير صحيح.");
      }
      update.startDate = data.startDate.trim();
    }
    if (typeof data.endDate === "string") {
      const ed = data.endDate.trim();
      if (ed && !isValidDate(ed)) {
        throw new HttpsError("invalid-argument", "تاريخ النهاية غير صحيح.");
      }
      update.endDate = ed || null;
    }
    if (typeof data.shiftId === "string") {
      const shiftId = data.shiftId.trim();
      if (shiftId) {
        const shiftDoc = await db.collection(COLLECTIONS.SHIFTS).doc(shiftId).get();
        if (!shiftDoc.exists || shiftDoc.data().tenantId !== callerTenantId) {
          throw new HttpsError("invalid-argument", "الشِفت غير صحيح.");
        }
        update.shiftId = shiftId;
        update.shiftName = shiftDoc.data().name;
      } else {
        update.shiftId = null;
        update.shiftName = null;
      }
    }

    await reqRef.update(update);
    return { id: requestId };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateResourceRequest failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل الطلب، حاول مرة أخرى.");
  }
});

// ===== تحديث حالة الطلب (المشاريع تلغي، العمليات تحدّث التقدّم) =====
exports.setRequestStatus = onCall(async (request) => {
  try {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
    }
    const callerTenantId = auth.token.tenantId;
    if (!callerTenantId) {
      throw new HttpsError("failed-precondition", "حسابك غير مرتبط بشركة.");
    }

    const data = request.data || {};
    const requestId = typeof data.requestId === "string" ? data.requestId.trim() : "";
    const newStatus = typeof data.status === "string" ? data.status.trim() : "";

    if (!requestId) {
      throw new HttpsError("invalid-argument", "يجب تحديد الطلب.");
    }
    if (!validateRequestStatus(newStatus)) {
      throw new HttpsError("invalid-argument", "حالة غير صحيحة.");
    }

    // الصلاحية: المشاريع أو العمليات
    const callerRole = auth.token.role;
    if (callerRole !== ROLES.OWNER) {
      const callerDoc = await db.collection(COLLECTIONS.USERS).doc(auth.uid).get();
      const perms = callerDoc.exists ? (callerDoc.data().permissions || []) : [];
      if (!perms.includes(MODULES.PROJECTS) && !perms.includes(MODULES.OPERATIONS)) {
        throw new HttpsError("permission-denied", "تحتاج صلاحية المشاريع أو العمليات.");
      }
    }

    const reqRef = db.collection(COLLECTIONS.RESOURCE_REQUESTS).doc(requestId);
    const snap = await reqRef.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الطلب غير صحيح.");
    }

    await reqRef.update({ status: newStatus, updatedAt: FieldValue.serverTimestamp() });
    return { id: requestId, status: newStatus };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("setRequestStatus failed:", err);
    throw new HttpsError("internal", "تعذّر تحديث الحالة، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== إسناد العمالة للمشاريع (العمليات) =====
// ═══════════════════════════════════════════════════════

const {
  buildWorkerAssignmentDoc,
  validateAssignmentStatus,
  ASSIGNMENT_STATUS,
  shiftsOverlap,
  dateRangesOverlap,
} = require("./schema");

// ===== إنشاء إسناد عامل (العمليات) =====
// data: { requestId, workerUid, rentalPrice, rentalPeriod, startDate, endDate, notes, ignoreConflict }
exports.createWorkerAssignment = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.OPERATIONS);

    const data = request.data || {};
    const requestId = typeof data.requestId === "string" ? data.requestId.trim() : "";
    const workerUid = typeof data.workerUid === "string" ? data.workerUid.trim() : "";
    const rentalPrice = Number(data.rentalPrice);
    const rentalPeriod = typeof data.rentalPeriod === "string" ? data.rentalPeriod.trim() : "daily";
    const startDate = typeof data.startDate === "string" ? data.startDate.trim() : "";
    const endDate = typeof data.endDate === "string" ? data.endDate.trim() : "";
    const notes = typeof data.notes === "string" ? data.notes.trim() : "";

    if (!requestId) {
      throw new HttpsError("invalid-argument", "يجب تحديد الطلب.");
    }
    if (!workerUid) {
      throw new HttpsError("invalid-argument", "يجب تحديد العامل.");
    }
    if (!Number.isFinite(rentalPrice) || rentalPrice < 0) {
      throw new HttpsError("invalid-argument", "سعر التأجير غير صحيح.");
    }
    if (!["hourly", "daily", "monthly", "yearly"].includes(rentalPeriod)) {
      throw new HttpsError("invalid-argument", "دورية السعر غير صحيحة.");
    }
    if (startDate && !isValidDate(startDate)) {
      throw new HttpsError("invalid-argument", "تاريخ البداية غير صحيح.");
    }
    if (endDate && !isValidDate(endDate)) {
      throw new HttpsError("invalid-argument", "تاريخ النهاية غير صحيح.");
    }
    if (startDate && endDate && endDate < startDate) {
      throw new HttpsError("invalid-argument", "تاريخ النهاية يجب أن يكون بعد البداية.");
    }

    // جلب الطلب
    const reqDoc = await db.collection(COLLECTIONS.RESOURCE_REQUESTS).doc(requestId).get();
    if (!reqDoc.exists || reqDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الطلب غير صحيح.");
    }
    const req = reqDoc.data();
    if (req.status === REQUEST_STATUS.CANCELLED) {
      throw new HttpsError("failed-precondition", "لا يمكن الإسناد لطلب ملغى.");
    }

    // جلب العامل
    const workerDoc = await db.collection(COLLECTIONS.USERS).doc(workerUid).get();
    if (!workerDoc.exists || workerDoc.data().tenantId !== callerTenantId ||
        ![ROLES.WORKER, ROLES.STAFF, ROLES.OWNER].includes(workerDoc.data().role)) {
      throw new HttpsError("invalid-argument", "الشخص غير صحيح.");
    }
    const worker = workerDoc.data();

    // جلب بيانات الشِفت (من الطلب) للقطة وقت البدء والمدة
    let shiftStartTime = null;
    let shiftDurationHours = null;
    let shiftName = req.shiftName || null;
    if (req.shiftId) {
      const shiftDoc = await db.collection(COLLECTIONS.SHIFTS).doc(req.shiftId).get();
      if (shiftDoc.exists && shiftDoc.data().tenantId === callerTenantId) {
        shiftStartTime = shiftDoc.data().startTime || null;
        shiftDurationHours = shiftDoc.data().durationHours != null ? shiftDoc.data().durationHours : null;
        shiftName = shiftDoc.data().name || shiftName;
      }
    }

    // منع التكرار: نفس العامل في نفس الطلب وهو نشط
    const dupSnap = await db.collection(COLLECTIONS.WORKER_ASSIGNMENTS)
      .where("tenantId", "==", callerTenantId)
      .where("requestId", "==", requestId)
      .where("workerUid", "==", workerUid)
      .where("status", "==", ASSIGNMENT_STATUS.ACTIVE)
      .limit(1)
      .get();
    if (!dupSnap.empty) {
      throw new HttpsError("already-exists", "هذا العامل مُسنَد لهذا الطلب بالفعل.");
    }

    // ترقيم تسلسلي ذرّي + تحديث fulfilledQuantity
    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const reqRef = db.collection(COLLECTIONS.RESOURCE_REQUESTS).doc(requestId);
    const assignRef = db.collection(COLLECTIONS.WORKER_ASSIGNMENTS).doc();

    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      const reqSnap = await tx.get(reqRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      if (!reqSnap.exists) throw new HttpsError("failed-precondition", "الطلب غير موجود.");

      const nextNumber = (tenantSnap.data().lastAssignmentNumber || 0) + 1;
      const currentFulfilled = reqSnap.data().fulfilledQuantity || 0;
      const requestedQty = reqSnap.data().quantity || 0;
      const newFulfilled = currentFulfilled + 1;

      const assignDoc = buildWorkerAssignmentDoc({
        tenantId: callerTenantId,
        assignmentNumber: nextNumber,
        workerUid: workerUid,
        workerName: worker.name || null,
        workerJobTitle: worker.jobTitleName || null,
        projectId: req.projectId || null,
        projectName: req.projectName || null,
        projectNumber: req.projectNumber || null,
        requestId: requestId,
        requestNumber: req.requestNumber || null,
        rentalPrice: rentalPrice,
        rentalPeriod: rentalPeriod,
        shiftId: req.shiftId || null,
        shiftName: shiftName,
        shiftStartTime: shiftStartTime,
        shiftDurationHours: shiftDurationHours,
        startDate: startDate || req.startDate || null,
        endDate: endDate || req.endDate || null,
        status: ASSIGNMENT_STATUS.ACTIVE,
        notes: notes || null,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(assignRef, assignDoc);

      // تحديث الطلب: الكمية المُوفّرة + الحالة
      const reqUpdate = {
        fulfilledQuantity: newFulfilled,
        updatedAt: FieldValue.serverTimestamp(),
      };
      // إن وصل المطلوب، الحالة fulfilled؛ وإلا in_progress
      if (newFulfilled >= requestedQty) {
        reqUpdate.status = REQUEST_STATUS.FULFILLED;
      } else if (reqSnap.data().status === REQUEST_STATUS.PENDING) {
        reqUpdate.status = REQUEST_STATUS.IN_PROGRESS;
      }
      tx.update(reqRef, reqUpdate);

      tx.update(tenantRef, { lastAssignmentNumber: nextNumber });

      return { assignmentNumber: nextNumber, fulfilledQuantity: newFulfilled };
    });

    return { id: assignRef.id, assignmentNumber: result.assignmentNumber, fulfilledQuantity: result.fulfilledQuantity };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createWorkerAssignment failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الإسناد، حاول مرة أخرى.");
  }
});

// ===== استبعاد عامل من إسناد (العمليات) =====
exports.removeWorkerAssignment = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.OPERATIONS);

    const data = request.data || {};
    const assignmentId = typeof data.assignmentId === "string" ? data.assignmentId.trim() : "";
    if (!assignmentId) {
      throw new HttpsError("invalid-argument", "يجب تحديد الإسناد.");
    }

    const assignRef = db.collection(COLLECTIONS.WORKER_ASSIGNMENTS).doc(assignmentId);
    const snap = await assignRef.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الإسناد غير صحيح.");
    }
    const assignment = snap.data();
    if (assignment.status !== ASSIGNMENT_STATUS.ACTIVE) {
      throw new HttpsError("failed-precondition", "هذا الإسناد غير نشط.");
    }

    // عند الاستبعاد: ينقص fulfilledQuantity في الطلب
    const reqRef = assignment.requestId ? db.collection(COLLECTIONS.RESOURCE_REQUESTS).doc(assignment.requestId) : null;

    await db.runTransaction(async (tx) => {
      let reqSnap = null;
      if (reqRef) {
        reqSnap = await tx.get(reqRef);
      }

      tx.update(assignRef, {
        status: ASSIGNMENT_STATUS.REMOVED,
        endedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (reqSnap && reqSnap.exists) {
        const currentFulfilled = reqSnap.data().fulfilledQuantity || 0;
        const newFulfilled = Math.max(0, currentFulfilled - 1);
        const requestedQty = reqSnap.data().quantity || 0;
        const reqUpdate = {
          fulfilledQuantity: newFulfilled,
          updatedAt: FieldValue.serverTimestamp(),
        };
        // لو كان مكتملًا ونقص، يرجع قيد التنفيذ
        if (reqSnap.data().status === REQUEST_STATUS.FULFILLED && newFulfilled < requestedQty) {
          reqUpdate.status = REQUEST_STATUS.IN_PROGRESS;
        }
        tx.update(reqRef, reqUpdate);
      }
    });

    return { id: assignmentId };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("removeWorkerAssignment failed:", err);
    throw new HttpsError("internal", "تعذّر استبعاد العامل، حاول مرة أخرى.");
  }
});

// ===== فحص تعارض عامل (قبل الإسناد) =====
// data: { workerUid, shiftStartTime, shiftDurationHours, startDate, endDate }
// يرجّع قائمة الإسنادات المتعارضة (تداخل تواريخ + تداخل ساعات الشِفت)
exports.checkWorkerConflicts = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.OPERATIONS);

    const data = request.data || {};
    const workerUid = typeof data.workerUid === "string" ? data.workerUid.trim() : "";
    const shiftStartTime = data.shiftStartTime || null;
    const shiftDurationHours = data.shiftDurationHours != null ? Number(data.shiftDurationHours) : null;
    const startDate = typeof data.startDate === "string" ? data.startDate.trim() : "";
    const endDate = typeof data.endDate === "string" ? data.endDate.trim() : "";

    if (!workerUid) {
      throw new HttpsError("invalid-argument", "يجب تحديد العامل.");
    }

    // جلب كل إسنادات العامل النشطة
    const snap = await db.collection(COLLECTIONS.WORKER_ASSIGNMENTS)
      .where("tenantId", "==", callerTenantId)
      .where("workerUid", "==", workerUid)
      .where("status", "==", ASSIGNMENT_STATUS.ACTIVE)
      .get();

    const conflicts = [];
    const allActive = [];

    for (const d of snap.docs) {
      const a = d.data();
      allActive.push({
        id: d.id,
        projectName: a.projectName,
        projectNumber: a.projectNumber,
        shiftName: a.shiftName,
        startDate: a.startDate,
        endDate: a.endDate,
      });

      // تداخل التواريخ
      const dateOverlap = dateRangesOverlap(startDate || null, endDate || null, a.startDate || null, a.endDate || null);
      if (!dateOverlap) continue;

      // تداخل ساعات الشِفت (لو كلاهما له شِفت محدد)
      let shiftOverlap = false;
      if (shiftStartTime && shiftDurationHours && a.shiftStartTime && a.shiftDurationHours) {
        shiftOverlap = shiftsOverlap(shiftStartTime, shiftDurationHours, a.shiftStartTime, a.shiftDurationHours);
      } else {
        // لو أحدهما بلا شِفت محدد، نعتبره تداخلًا محتملًا (تحذير احترازي)
        shiftOverlap = true;
      }

      if (shiftOverlap) {
        conflicts.push({
          id: d.id,
          projectName: a.projectName,
          projectNumber: a.projectNumber,
          shiftName: a.shiftName,
          startDate: a.startDate,
          endDate: a.endDate,
        });
      }
    }

    return { conflicts: conflicts, activeCount: allActive.length, allActive: allActive };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("checkWorkerConflicts failed:", err);
    throw new HttpsError("internal", "تعذّر فحص التعارض، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== منظومة تكلفة العامل (الموارد البشرية) =====
// ===== الوحدة 1: الراتب والبدلات | الوحدة 2: الحكومية والتأمينات | الوحدة 3: الإدارية =====
// ═══════════════════════════════════════════════════════

const {
  buildAllowance,
  buildWorkerCostBase,
  computeWorkerBaseCost,
  buildGovItem,
  buildGovernmentCosts,
  computeGovernmentCosts,
  AMORTIZATION_METHODS,
  buildSocialInsurance,
  validateSocialInsurance,
  computeSocialInsurance,
  computeWorkerMonthlyCost,
} = require("./schema");

// أداة مشتركة: التحقّق من أن الشخص عامل/موظف/مالك ضمن الشركة
function isCostablePerson(docData, tenantId) {
  return docData && docData.tenantId === tenantId &&
    [ROLES.WORKER, ROLES.STAFF, ROLES.OWNER].includes(docData.role);
}

// ===== إعادة حساب التكلفة الإدارية للشركة (الوحدة 3) =====
// تجمع تكاليف كل الموظفين (staff) + المالك (owner) = إجمالي الإدارة
// تعد العمال النشطين، تخزّن النتيجة في وثيقة الشركة
async function recomputeAdminCost(tenantId) {
  const usersSnap = await db.collection(COLLECTIONS.USERS)
    .where("tenantId", "==", tenantId)
    .get();

  let adminCostTotal = 0;
  let workersCount = 0;
  let adminStaffCount = 0;

  for (const doc of usersSnap.docs) {
    const u = doc.data();
    if (u.status === "inactive" || u.status === "resigned") continue;

    if (u.role === ROLES.WORKER) {
      workersCount += 1;
    } else if (u.role === ROLES.STAFF || u.role === ROLES.OWNER) {
      if (u.costBase && Number(u.costBase.basicSalary) > 0) {
        const monthly = computeWorkerMonthlyCost(u.costBase);
        adminCostTotal += monthly.monthlyTotal;
        adminStaffCount += 1;
      } else {
        adminStaffCount += 1;
      }
    }
  }

  const adminCostPerWorker = workersCount > 0 ? adminCostTotal / workersCount : 0;
  const r = (n) => Math.round(n * 100) / 100;

  await db.collection(COLLECTIONS.TENANTS).doc(tenantId).update({
    adminCostTotal: r(adminCostTotal),
    workersCount: workersCount,
    adminStaffCount: adminStaffCount,
    adminCostPerWorker: r(adminCostPerWorker),
    adminCostUpdatedAt: FieldValue.serverTimestamp(),
  });

  return {
    adminCostTotal: r(adminCostTotal),
    workersCount: workersCount,
    adminStaffCount: adminStaffCount,
    adminCostPerWorker: r(adminCostPerWorker),
  };
}

// ===== الوحدة 1: حفظ/تحديث تكلفة أساسية (راتب + بدلات + عقد) =====
// data: { workerUid, basicSalary, workDaysPerMonth, workHoursPerDay,
//         allowances:[{name, amount, deductOnAbsence}],
//         contractStartDate, contractDurationYears, iqamaNumber, passportNumber }
exports.saveWorkerCostBase = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);

    const data = request.data || {};
    const workerUid = typeof data.workerUid === "string" ? data.workerUid.trim() : "";
    if (!workerUid) {
      throw new HttpsError("invalid-argument", "يجب تحديد الشخص.");
    }

    const workerRef = db.collection(COLLECTIONS.USERS).doc(workerUid);
    const workerDoc = await workerRef.get();
    if (!workerDoc.exists || !isCostablePerson(workerDoc.data(), callerTenantId)) {
      throw new HttpsError("invalid-argument", "الشخص غير صحيح.");
    }
    const personRole = workerDoc.data().role;

    const basicSalary = Number(data.basicSalary);
    if (!Number.isFinite(basicSalary) || basicSalary < 0) {
      throw new HttpsError("invalid-argument", "الراتب الأساسي غير صحيح.");
    }
    const workDaysPerMonth = Number(data.workDaysPerMonth);
    if (!Number.isFinite(workDaysPerMonth) || workDaysPerMonth <= 0 || workDaysPerMonth > 31) {
      throw new HttpsError("invalid-argument", "عدد أيام العمل غير صحيح (1-31).");
    }
    const workHoursPerDay = Number(data.workHoursPerDay);
    if (!Number.isFinite(workHoursPerDay) || workHoursPerDay <= 0 || workHoursPerDay > 24) {
      throw new HttpsError("invalid-argument", "عدد ساعات العمل غير صحيح (1-24).");
    }
    const contractDurationYears = Number(data.contractDurationYears);
    if (!Number.isFinite(contractDurationYears) || contractDurationYears <= 0 || contractDurationYears > 10) {
      throw new HttpsError("invalid-argument", "مدة العقد غير صحيحة (1-10 سنوات).");
    }
    const contractStartDate = typeof data.contractStartDate === "string" ? data.contractStartDate.trim() : "";
    if (contractStartDate && !isValidDate(contractStartDate)) {
      throw new HttpsError("invalid-argument", "تاريخ بدء العقد غير صحيح.");
    }

    // بناء البدلات
    const rawAllowances = Array.isArray(data.allowances) ? data.allowances : [];
    const allowances = [];
    for (const raw of rawAllowances) {
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      const amount = Number(raw.amount);
      if (!name) continue;
      if (!Number.isFinite(amount) || amount < 0) {
        throw new HttpsError("invalid-argument", `قيمة البدل «${name}» غير صحيحة.`);
      }
      allowances.push(buildAllowance({
        name: name,
        amount: amount,
        deductOnAbsence: raw.deductOnAbsence === true,
      }));
    }

    const costBase = buildWorkerCostBase({
      basicSalary: basicSalary,
      workDaysPerMonth: workDaysPerMonth,
      workHoursPerDay: workHoursPerDay,
      allowances: allowances,
      contractStartDate: contractStartDate || null,
      contractDurationYears: contractDurationYears,
      iqamaNumber: typeof data.iqamaNumber === "string" ? data.iqamaNumber.trim() || null : null,
      passportNumber: typeof data.passportNumber === "string" ? data.passportNumber.trim() || null : null,
    });

    // الحفاظ على الحقول المحجوزة لو كانت موجودة
    const existingCostBase = workerDoc.data().costBase;
    if (existingCostBase && typeof existingCostBase === "object") {
      costBase.governmentCosts = existingCostBase.governmentCosts || null;
      costBase.socialInsurance = existingCostBase.socialInsurance || null;
    }

    await workerRef.update({ costBase: costBase });

    // لو موظف/مالك، أعد حساب التكلفة الإدارية
    if (personRole === ROLES.STAFF || personRole === ROLES.OWNER) {
      try { await recomputeAdminCost(callerTenantId); } catch (e) { console.error("recompute after costBase:", e); }
    }

    const computed = computeWorkerBaseCost(costBase);

    return { workerUid: workerUid, computed: computed };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("saveWorkerCostBase failed:", err);
    throw new HttpsError("internal", "تعذّر حفظ التكلفة، حاول مرة أخرى.");
  }
});

// ===== الوحدة 2-أ: حفظ/تحديث التكاليف الحكومية =====
// data: { workerUid, items:[{key,name,amount,year,isManual}],
//         includeEndOfService, includeLeaveBalance, annualLeaveDays,
//         amortizationMethod, totalMonths, year1Months, year2Months }
exports.saveWorkerGovernmentCosts = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);

    const data = request.data || {};
    const workerUid = typeof data.workerUid === "string" ? data.workerUid.trim() : "";
    if (!workerUid) {
      throw new HttpsError("invalid-argument", "يجب تحديد الشخص.");
    }

    const workerRef = db.collection(COLLECTIONS.USERS).doc(workerUid);
    const workerDoc = await workerRef.get();
    if (!workerDoc.exists || !isCostablePerson(workerDoc.data(), callerTenantId)) {
      throw new HttpsError("invalid-argument", "الشخص غير صحيح.");
    }
    const workerData = workerDoc.data();

    // يجب أن تكون التكلفة الأساسية موجودة (الراتب لازم لنهاية الخدمة ورصيد الإجازات)
    if (!workerData.costBase || !(Number(workerData.costBase.basicSalary) > 0)) {
      throw new HttpsError("failed-precondition", "يجب تحديد الراتب الأساسي أولاً (التكلفة الأساسية).");
    }

    // بناء البنود
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const items = [];
    for (const raw of rawItems) {
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      const amount = Number(raw.amount);
      if (!name) continue;
      if (!Number.isFinite(amount) || amount < 0) {
        throw new HttpsError("invalid-argument", `قيمة البند «${name}» غير صحيحة.`);
      }
      // نتجاهل البنود الصفرية غير اليدوية (لتقليل الضوضاء)، ونبقي اليدوية ولو صفر
      if (amount === 0 && raw.isManual !== true) continue;
      items.push(buildGovItem({
        key: raw.key || null,
        name: name,
        amount: amount,
        year: Number(raw.year) === 2 ? 2 : 1,
        isManual: raw.isManual === true,
      }));
    }

    // التحقّق من آلية الإطفاء
    const method = typeof data.amortizationMethod === "string" ? data.amortizationMethod : "total";
    if (!Object.values(AMORTIZATION_METHODS).includes(method)) {
      throw new HttpsError("invalid-argument", "آلية الإطفاء غير صحيحة.");
    }

    const totalMonths = Number(data.totalMonths) || 24;
    if (method === AMORTIZATION_METHODS.TOTAL && (totalMonths < 1 || totalMonths > 24)) {
      throw new HttpsError("invalid-argument", "عدد أشهر الإطفاء يجب أن يكون 1-24.");
    }
    const year1Months = Number(data.year1Months) || 12;
    const year2Months = Number(data.year2Months) || 12;
    if (method === AMORTIZATION_METHODS.CUSTOM) {
      if (year1Months < 1 || year1Months > 12 || year2Months < 1 || year2Months > 12) {
        throw new HttpsError("invalid-argument", "أشهر السنة يجب أن تكون 1-12.");
      }
    }

    const annualLeaveDays = Number(data.annualLeaveDays) || 21;
    if (annualLeaveDays < 0 || annualLeaveDays > 90) {
      throw new HttpsError("invalid-argument", "أيام الإجازة السنوية غير صحيحة (0-90).");
    }

    // بناء البنية
    const govCosts = buildGovernmentCosts({
      items: items,
      includeEndOfService: data.includeEndOfService !== false,
      includeLeaveBalance: data.includeLeaveBalance !== false,
      annualLeaveDays: annualLeaveDays,
      amortizationMethod: method,
      totalMonths: totalMonths,
      year1Months: year1Months,
      year2Months: year2Months,
    });

    // الحفظ داخل costBase.governmentCosts
    const newCostBase = { ...workerData.costBase, governmentCosts: govCosts };
    await workerRef.update({ costBase: newCostBase });

    // لو موظف/مالك، أعد حساب التكلفة الإدارية
    if (workerData.role === ROLES.STAFF || workerData.role === ROLES.OWNER) {
      try { await recomputeAdminCost(callerTenantId); } catch (e) { console.error("recompute after gov:", e); }
    }

    const computed = computeGovernmentCosts(newCostBase, govCosts);

    return { workerUid: workerUid, computed: computed };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("saveWorkerGovernmentCosts failed:", err);
    throw new HttpsError("internal", "تعذّر حفظ التكاليف الحكومية، حاول مرة أخرى.");
  }
});

// ===== الوحدة 2-ب: حفظ/تحديث التأمينات الاجتماعية =====
// data: { workerUid, enabled, totalRate, bearer, companyRate, workerRate }
exports.saveWorkerSocialInsurance = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);

    const data = request.data || {};
    const workerUid = typeof data.workerUid === "string" ? data.workerUid.trim() : "";
    if (!workerUid) {
      throw new HttpsError("invalid-argument", "يجب تحديد الشخص.");
    }

    const workerRef = db.collection(COLLECTIONS.USERS).doc(workerUid);
    const workerDoc = await workerRef.get();
    if (!workerDoc.exists || !isCostablePerson(workerDoc.data(), callerTenantId)) {
      throw new HttpsError("invalid-argument", "الشخص غير صحيح.");
    }
    const workerData = workerDoc.data();

    if (!workerData.costBase || !(Number(workerData.costBase.basicSalary) > 0)) {
      throw new HttpsError("failed-precondition", "يجب تحديد الراتب الأساسي أولاً.");
    }

    // بناء البنية
    const insurance = buildSocialInsurance({
      enabled: data.enabled === true,
      totalRate: Number(data.totalRate) || 0,
      bearer: typeof data.bearer === "string" ? data.bearer : "company",
      companyRate: Number(data.companyRate) || 0,
      workerRate: Number(data.workerRate) || 0,
    });

    // التحقّق
    const validation = validateSocialInsurance(insurance);
    if (!validation.valid) {
      throw new HttpsError("invalid-argument", validation.error);
    }

    // الحفظ داخل costBase.socialInsurance
    const newCostBase = { ...workerData.costBase, socialInsurance: insurance };
    await workerRef.update({ costBase: newCostBase });

    // لو موظف/مالك، أعد حساب التكلفة الإدارية
    if (workerData.role === ROLES.STAFF || workerData.role === ROLES.OWNER) {
      try { await recomputeAdminCost(callerTenantId); } catch (e) { console.error("recompute after insurance:", e); }
    }

    const computed = computeSocialInsurance(newCostBase);

    return { workerUid: workerUid, computed: computed };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("saveWorkerSocialInsurance failed:", err);
    throw new HttpsError("internal", "تعذّر حفظ التأمينات، حاول مرة أخرى.");
  }
});

// ===== الوحدة 3: استدعاء يدوي لإعادة حساب التكلفة الإدارية =====
exports.recomputeAdminCostManual = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);
    const result = await recomputeAdminCost(callerTenantId);
    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("recomputeAdminCostManual failed:", err);
    throw new HttpsError("internal", "تعذّر حساب التكلفة الإدارية.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== الوحدة 4: التكلفة الشاملة الموحّدة =====
// ═══════════════════════════════════════════════════════

// ===== حساب التكلفة الشاملة لعامل (تجمع كل الطبقات) =====
// الطبقات ①②③ من computeWorkerMonthlyCost (نفس دالة حساب التكلفة الإدارية)
// + الطبقة ④ نصيب التكلفة الإدارية من وثيقة الشركة
// data: { workerUid }
exports.getWorkerFullCost = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.HR);

    const data = request.data || {};
    const workerUid = typeof data.workerUid === "string" ? data.workerUid.trim() : "";
    if (!workerUid) {
      throw new HttpsError("invalid-argument", "يجب تحديد الشخص.");
    }

    const workerDoc = await db.collection(COLLECTIONS.USERS).doc(workerUid).get();
    if (!workerDoc.exists || !isCostablePerson(workerDoc.data(), callerTenantId)) {
      throw new HttpsError("invalid-argument", "الشخص غير صحيح.");
    }
    const worker = workerDoc.data();
    const costBase = worker.costBase || null;

    // الطبقات ①②③ (نفس منطق التكلفة الإدارية)
    const base = computeWorkerBaseCost(costBase);
    const gov = computeGovernmentCosts(costBase, costBase ? costBase.governmentCosts : null);
    const ins = computeSocialInsurance(costBase);
    const monthly = computeWorkerMonthlyCost(costBase);

    // الطبقة ④ نصيب التكلفة الإدارية (من وثيقة الشركة)
    const tenantDoc = await db.collection(COLLECTIONS.TENANTS).doc(callerTenantId).get();
    const adminCostPerWorker = tenantDoc.exists ? (Number(tenantDoc.data().adminCostPerWorker) || 0) : 0;

    const r = (n) => Math.round((Number(n) || 0) * 100) / 100;

    // الموظف الإداري/المالك جزء من التكلفة الإدارية أصلًا → لا يُضاف له نصيب (تجنّب التكرار)
    const isAdmin = worker.role === ROLES.STAFF || worker.role === ROLES.OWNER;
    const adminShare = isAdmin ? 0 : adminCostPerWorker;

    const fullMonthlyTotal = monthly.monthlyTotal + adminShare;
    const workDays = costBase && Number(costBase.workDaysPerMonth) > 0 ? Number(costBase.workDaysPerMonth) : 0;
    const workHours = costBase && Number(costBase.workHoursPerDay) > 0 ? Number(costBase.workHoursPerDay) : 0;
    const fullDailyCost = workDays > 0 ? fullMonthlyTotal / workDays : 0;
    const fullHourlyCost = (workDays > 0 && workHours > 0) ? fullDailyCost / workHours : 0;

    return {
      workerUid: workerUid,
      workerName: worker.name || null,
      role: worker.role,
      isAdmin: isAdmin,
      hasCostBase: !!(costBase && Number(costBase.basicSalary) > 0),

      // تفاصيل الطبقات
      layer1: {
        basicSalary: base.basicSalary,
        totalAllowances: base.totalAllowances,
        fixedAllowances: base.fixedAllowances,
        variableAllowances: base.variableAllowances,
        dailySalary: base.dailySalary,
        hourlySalary: base.hourlySalary,
        overtimeHourlyRate: base.overtimeHourlyRate,
        monthlyTotal: base.monthlyTotal,
      },
      layer2gov: {
        grandTotal: gov.grandTotal,
        monthlyAmortized: gov.monthlyAmortized,
        endOfService: gov.endOfService,
        leaveBalance: gov.leaveBalance,
      },
      layer2ins: {
        enabled: !!(costBase && costBase.socialInsurance && costBase.socialInsurance.enabled),
        totalAmount: ins.totalAmount,
        companyAmount: ins.companyAmount,
        workerAmount: ins.workerAmount,
        netSalary: ins.netSalary,
      },
      layer3admin: {
        adminCostPerWorker: r(adminCostPerWorker),
        applied: r(adminShare),
      },

      // المجاميع الشهرية
      monthlyBase: monthly.monthlyBase,             // ① راتب + بدلات
      monthlyGov: monthly.monthlyGov,               // ② حكومية مُطفأة
      monthlyInsCompany: monthly.monthlyInsCompany, // ③ تأمينات (حصة الشركة)
      subtotalBeforeAdmin: monthly.monthlyTotal,    // مجموع ①②③ (التكلفة الذاتية)
      adminShare: r(adminShare),                    // ④ نصيب الإدارة
      fullMonthlyTotal: r(fullMonthlyTotal),        // الإجمالي الشامل

      // للربحية لاحقًا
      fullDailyCost: r(fullDailyCost),
      fullHourlyCost: r(fullHourlyCost),
      netSalary: ins.netSalary,                     // صافي راتب العامل (بعد خصم حصته من التأمين)
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getWorkerFullCost failed:", err);
    throw new HttpsError("internal", "تعذّر حساب التكلفة الشاملة.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== محرّك الربحية =====
// ═══════════════════════════════════════════════════════

const {
  MONTHLY_DEDUCTIONS_COLLECTION,
  normalizeRentalToMonthly,
  computeAssignmentProfitability,
  buildMonthlyDeductionDoc,
  SHARED_ALLOCATIONS_COLLECTION,
  ALLOCATION_STATUS,
  computeSharedAllocation,
  buildSharedAllocationDoc,
} = require("./profitability");

// أداة: عدّ أيام غياب عامل في شهر (من سجلات الحضور)
// month: "YYYY-MM"
async function countWorkerAbsenceInMonth(tenantId, workerUid, month) {
  const startDate = `${month}-01`;
  const endDate = `${month}-31`;  // حدّ أعلى آمن للمقارنة النصية

  const recSnap = await db.collection(COLLECTIONS.RECORDS)
    .where("tenantId", "==", tenantId)
    .where("date", ">=", startDate)
    .where("date", "<=", endDate)
    .get();

  const absentDays = new Set();
  const lateDays = new Set();
  for (const doc of recSnap.docs) {
    const rec = doc.data();
    const entries = Array.isArray(rec.entries) ? rec.entries : [];
    for (const e of entries) {
      if (e.workerUid === workerUid) {
        if (e.status === ENTRY_STATUS.ABSENT) absentDays.add(rec.date);
        else if (e.status === ENTRY_STATUS.LATE) lateDays.add(rec.date);
      }
    }
  }
  return { absentDays: absentDays.size, lateDays: lateDays.size };
}

// ═══ دوال مساعدة مشتركة للربحية والتقارير ═══

// التحقّق من صلاحية عرض الربحية (المالية أو المشاريع أو المالك) → يُرجّع tenantId
async function requireProfitabilityView(auth) {
  if (!auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
  const callerTenantId = auth.token.tenantId;
  if (!callerTenantId) throw new HttpsError("failed-precondition", "حسابك غير مرتبط بشركة.");
  if (auth.token.role !== ROLES.OWNER) {
    const callerDoc = await db.collection(COLLECTIONS.USERS).doc(auth.uid).get();
    const perms = callerDoc.exists ? (callerDoc.data().permissions || []) : [];
    if (!perms.includes(MODULES.FINANCE) && !perms.includes(MODULES.PROJECTS)) {
      throw new HttpsError("permission-denied", "تحتاج صلاحية المالية أو المشاريع.");
    }
  }
  return callerTenantId;
}

// بناء معلومات أيام الشهر التقويمية (للتناسب)
function buildMonthDaysInfo(month) {
  const [yr, mo] = month.split("-").map(Number);
  const daysInMonth = new Date(yr, mo, 0).getDate();
  return {
    daysInMonth: daysInMonth,
    monthStart: `${month}-01`,
    monthEnd: `${month}-31`,                                        // حدّ أعلى آمن للمقارنة النصية
    monthStartDate: `${month}-01`,
    monthEndDate: `${month}-${String(daysInMonth).padStart(2, "0")}`,
    daysInclusive: (startStr, endStr) => {
      const s = new Date(startStr + "T00:00:00");
      const e = new Date(endStr + "T00:00:00");
      const diff = Math.round((e - s) / 86400000) + 1;
      return diff > 0 ? diff : 0;
    },
  };
}

// توليد قائمة أشهر "YYYY-MM" من fromMonth إلى toMonth (شامل الطرفين)
function enumerateMonths(fromMonth, toMonth) {
  const [fy, fm] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  const result = [];
  let y = fy, m = fm, guard = 0;
  while ((y < ty || (y === ty && m <= tm)) && guard < 240) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
    guard++;
  }
  return result;
}

// نصيب العامل من الأصول لشهر = Σ (تكلفة الأصل الشهرية ÷ عدد مستفيديه) للأصول الفعّالة التي هو مستفيد منها
// تكلفة الأصل = الإيجار الثابت + فواتير الشهر. (نصيب ثابت — يُضاف لثابت العامل ويُقسّم في التوزيع المشترك)
async function computeWorkerAssetShare(callerTenantId, workerUid, month) {
  const assetsSnap = await db.collection(COLLECTIONS.ASSETS)
    .where("tenantId", "==", callerTenantId)
    .where("beneficiaries", "array-contains", workerUid)
    .get();

  let totalShare = 0;
  for (const aDoc of assetsSnap.docs) {
    const asset = aDoc.data();
    if (asset.status === "inactive") continue;  // تجاهل الأصل المعطّل
    const beneficiaries = Array.isArray(asset.beneficiaries) ? asset.beneficiaries : [];
    const count = beneficiaries.length;
    if (count === 0) continue;

    // فواتير الشهر لهذا الأصل
    const expSnap = await db.collection(COLLECTIONS.ASSET_EXPENSES)
      .where("tenantId", "==", callerTenantId)
      .where("assetId", "==", aDoc.id)
      .where("month", "==", month)
      .get();
    const variable = expSnap.docs.reduce((s, d) => s + (Number(d.data().amount) || 0), 0);
    const monthlyTotal = (Number(asset.monthlyRent) || 0) + variable;
    totalShare += monthlyTotal / count;
  }
  return Math.round(totalShare * 100) / 100;
}

// بناء سطر ربحية إسناد واحد لشهر (يجلب العامل، يحسب التناسب والخصومات والربح)
// يُرجّع السطر، أو null إذا لا تداخل مع الشهر أو العامل غير موجود
async function buildAssignmentProfitLine(callerTenantId, aDoc, month, daysInfo, adminCostPerWorker) {
  const a = aDoc.data();
  const { daysInMonth, monthStart, monthEnd, monthStartDate, monthEndDate, daysInclusive } = daysInfo;

  // هل الإسناد نشط في هذا الشهر؟ (تداخل تواريخ الإسناد مع الشهر)
  const aStart = a.startDate || "0000-01-01";
  const aEnd = a.endDate || "9999-12-31";
  if (!(aStart <= monthEnd && monthStart <= aEnd)) return null;

  // فترة التداخل ونسبة التناسب التقويمي
  const overlapStart = aStart > monthStartDate ? aStart : monthStartDate;
  const overlapEnd = aEnd < monthEndDate ? aEnd : monthEndDate;
  const overlapDays = daysInclusive(overlapStart, overlapEnd);
  const prorationRatio = daysInMonth > 0 ? overlapDays / daysInMonth : 1;

  const wDoc = await db.collection(COLLECTIONS.USERS).doc(a.workerUid).get();
  if (!wDoc.exists) return null;
  const worker = wDoc.data();
  const costBase = worker.costBase || null;

  // عامل بلا تكلفة محددة → يُدرج كتنبيه
  if (!costBase || !(Number(costBase.basicSalary) > 0)) {
    return {
      assignmentId: aDoc.id,
      assignmentNumber: a.assignmentNumber || null,
      workerUid: a.workerUid,
      workerName: a.workerName || worker.name || null,
      workerJobTitle: a.workerJobTitle || null,
      projectId: a.projectId || null,
      projectName: a.projectName || null,
      projectNumber: a.projectNumber || null,
      missingCost: true,
      revenueMonthly: 0, revenueProrated: 0, netRevenue: 0, actualCost: 0, profit: 0, margin: 0,
    };
  }

  // التكلفة (نفس منطق النظام)
  const monthly = computeWorkerMonthlyCost(costBase);
  const isAdmin = worker.role === ROLES.STAFF || worker.role === ROLES.OWNER;
  const adminShare = isAdmin ? 0 : adminCostPerWorker;
  const assetShare = await computeWorkerAssetShare(callerTenantId, a.workerUid, month);  // نصيب الأصول (سكن/مركبات)
  const monthlyVariable = monthly.monthlyVariable;
  const monthlyFixed = monthly.monthlyFixed + adminShare + assetShare;  // الثابت يشمل نصيب الإدارة + الأصول

  // الإيراد (تطبيع)
  const wd = Number(costBase.workDaysPerMonth) > 0 ? Number(costBase.workDaysPerMonth) : 26;
  const wh = Number(costBase.workHoursPerDay) > 0 ? Number(costBase.workHoursPerDay) : 8;
  const revenueMonthly = normalizeRentalToMonthly(a.rentalPrice, a.rentalPeriod, wd, wh);

  // توزيع زمني معتمد؟ → استخدم نصيب هذا المشروع (ثابت موزّع + متغيّر فعلي) بدل الحساب الكامل/الغياب/التناسب
  // (التوزيع اليدوي يتضمّن الأيام الفعلية، فلا غياب تلقائي ولا تناسب)
  const allocDoc = await db.collection(SHARED_ALLOCATIONS_COLLECTION).doc(`${a.workerUid}_${month}`).get();
  if (allocDoc.exists && allocDoc.data().status === ALLOCATION_STATUS.APPROVED) {
    const alloc = allocDoc.data();
    const allocItems = Array.isArray(alloc.items) ? alloc.items : [];
    const myItem = allocItems.find((it) => it.assignmentId === aDoc.id);
    if (myItem) {
      // احسب توزيع كل البنود (لضمان نسب الثابت الصحيحة)، ثم خذ نصيب هذا الإسناد
      const sharedItems = allocItems.map((it) => ({
        assignmentId: it.assignmentId,
        revenueMonthly: it.assignmentId === aDoc.id ? revenueMonthly : 0,
        regularDays: it.regularDays,
        overtimeHours: it.overtimeHours,
        fixedShareRatio: it.fixedShareRatio,
      }));
      const computed = computeSharedAllocation({
        monthlyVariable: monthlyVariable,
        monthlyFixed: monthlyFixed,
        workDaysPerMonth: wd,
        workHoursPerDay: wh,
        items: sharedItems,
      });
      const myLine = computed.items.find((x) => x.assignmentId === aDoc.id) || {};
      const rr = (n) => Math.round((Number(n) || 0) * 100) / 100;

      return {
        assignmentId: aDoc.id,
        assignmentNumber: a.assignmentNumber || null,
        workerUid: a.workerUid,
        workerName: a.workerName || worker.name || null,
        workerJobTitle: a.workerJobTitle || null,
        projectId: a.projectId || null,
        projectName: a.projectName || null,
        projectNumber: a.projectNumber || null,
        rentalPrice: a.rentalPrice,
        rentalPeriod: a.rentalPeriod,
        workDaysPerMonth: wd,
        startDate: a.startDate || null,
        endDate: a.endDate || null,
        overlapStart: overlapStart,
        overlapEnd: overlapEnd,
        overlapDays: overlapDays,
        daysInMonth: daysInMonth,
        missingCost: false,
        // علامات التوزيع الزمني
        isShared: true,
        allocationStatus: ALLOCATION_STATUS.APPROVED,
        regularDays: Number(myItem.regularDays) || 0,
        overtimeHours: Number(myItem.overtimeHours) || 0,
        fixedShareRatio: Number(myItem.fixedShareRatio) || 0,
        fixedSharePct: myLine.fixedSharePct || 0,
        assetShare: assetShare,
        overtimeHourlyRate: computed.overtimeHourlyRate,
        // الحقول المالية (متوافقة مع التجميع — لا غياب/تناسب)
        revenueMonthly: rr(myLine.revenue),
        revenueProrated: rr(myLine.revenue),
        netRevenue: rr(myLine.revenue),
        monthlyVariable: rr(monthlyVariable),
        variableProrated: rr(myLine.variableCost),
        actualVariable: rr(myLine.variableCost),
        monthlyFixed: rr(monthlyFixed),
        fixedProrated: rr(myLine.fixedShare),
        actualCost: rr(myLine.totalCost),
        fullCost: rr(myLine.totalCost),
        grossProfit: rr(myLine.profit),
        profit: rr(myLine.profit),
        margin: rr(myLine.margin),
        prorationRatio: 1,
        hasManualDeduction: false,
        actualAbsenceDays: 0,
        clientDeductionDays: 0,
        workerDeductionDays: 0,
        clientDeduction: 0,
        workerSaving: 0,
        clientDailyRate: wd > 0 ? rr(revenueMonthly / wd) : 0,
        variableDailyCost: computed.dailyVariable,
      };
    }
  }

  // الغياب: التعديل اليدوي إن وُجد، وإلا الغياب الفعلي من الحضور (لكليهما)
  const dedDoc = await db.collection(MONTHLY_DEDUCTIONS_COLLECTION).doc(`${aDoc.id}_${month}`).get();
  let clientDeductionDays, workerDeductionDays, actualAbsenceDays, hasManual;
  if (dedDoc.exists) {
    const d = dedDoc.data();
    clientDeductionDays = Number(d.clientDeductionDays) || 0;
    workerDeductionDays = Number(d.workerDeductionDays) || 0;
    actualAbsenceDays = Number(d.actualAbsenceDays) || 0;
    hasManual = true;
  } else {
    const absence = await countWorkerAbsenceInMonth(callerTenantId, a.workerUid, month);
    actualAbsenceDays = absence.absentDays;
    clientDeductionDays = absence.absentDays;
    workerDeductionDays = absence.absentDays;
    hasManual = false;
  }

  // الربحية (مع التناسب)
  const p = computeAssignmentProfitability({
    revenueMonthly: revenueMonthly,
    monthlyVariable: monthlyVariable,
    monthlyFixed: monthlyFixed,
    workDaysPerMonth: wd,
    clientDeductionDays: clientDeductionDays,
    workerDeductionDays: workerDeductionDays,
    prorationRatio: prorationRatio,
  });

  return {
    assignmentId: aDoc.id,
    assignmentNumber: a.assignmentNumber || null,
    workerUid: a.workerUid,
    workerName: a.workerName || worker.name || null,
    workerJobTitle: a.workerJobTitle || null,
    projectId: a.projectId || null,
    projectName: a.projectName || null,
    projectNumber: a.projectNumber || null,
    rentalPrice: a.rentalPrice,
    rentalPeriod: a.rentalPeriod,
    workDaysPerMonth: wd,
    startDate: a.startDate || null,
    endDate: a.endDate || null,
    overlapStart: overlapStart,
    overlapEnd: overlapEnd,
    overlapDays: overlapDays,
    daysInMonth: daysInMonth,
    missingCost: false,
    hasManualDeduction: hasManual,
    assetShare: assetShare,
    actualAbsenceDays: actualAbsenceDays,
    ...p,
  };
}

// القلب الحسابي لربحية مشروع في شهر (يجمع كل الإسنادات النشطة المتداخلة)
// يُرجّع { workersCount, lines, totals } — لا يتحقق من الصلاحيات (المستدعي يتحقق)
async function computeProjectMonthCore(callerTenantId, projectId, month, adminCostPerWorker) {
  const daysInfo = buildMonthDaysInfo(month);

  const assignSnap = await db.collection(COLLECTIONS.WORKER_ASSIGNMENTS)
    .where("tenantId", "==", callerTenantId)
    .where("projectId", "==", projectId)
    .where("status", "==", ASSIGNMENT_STATUS.ACTIVE)
    .get();

  const lines = [];
  let totalRevenue = 0, totalNetRevenue = 0, totalCost = 0, totalProfit = 0, totalGrossProfit = 0;

  for (const aDoc of assignSnap.docs) {
    const line = await buildAssignmentProfitLine(callerTenantId, aDoc, month, daysInfo, adminCostPerWorker);
    if (!line) continue;
    lines.push(line);
    if (!line.missingCost) {
      totalRevenue += line.revenueProrated;
      totalNetRevenue += line.netRevenue;
      totalCost += line.actualCost;
      totalProfit += line.profit;
      totalGrossProfit += line.grossProfit;
    }
  }

  const r = (n) => Math.round(n * 100) / 100;
  const totalMargin = totalNetRevenue > 0 ? (totalProfit / totalNetRevenue) * 100 : 0;
  return {
    workersCount: lines.filter((l) => !l.missingCost).length,
    lines: lines,
    totals: {
      revenue: r(totalRevenue),
      netRevenue: r(totalNetRevenue),
      cost: r(totalCost),
      grossProfit: r(totalGrossProfit),
      profit: r(totalProfit),
      margin: r(totalMargin),
    },
  };
}

// ===== حفظ تعديل شهري (خصم العميل/العامل) لإسناد =====
// data: { assignmentId, month, clientDeductionDays, workerDeductionDays, notes }
exports.saveMonthlyDeduction = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);

    const data = request.data || {};
    const assignmentId = typeof data.assignmentId === "string" ? data.assignmentId.trim() : "";
    const month = typeof data.month === "string" ? data.month.trim() : "";
    if (!assignmentId) throw new HttpsError("invalid-argument", "يجب تحديد الإسناد.");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpsError("invalid-argument", "الشهر غير صحيح (YYYY-MM).");

    const clientDeductionDays = Number(data.clientDeductionDays) || 0;
    const workerDeductionDays = Number(data.workerDeductionDays) || 0;
    if (clientDeductionDays < 0 || clientDeductionDays > 31) {
      throw new HttpsError("invalid-argument", "أيام خصم العميل غير صحيحة (0-31).");
    }
    if (workerDeductionDays < 0 || workerDeductionDays > 31) {
      throw new HttpsError("invalid-argument", "أيام خصم العامل غير صحيحة (0-31).");
    }

    const assignDoc = await db.collection(COLLECTIONS.WORKER_ASSIGNMENTS).doc(assignmentId).get();
    if (!assignDoc.exists || assignDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الإسناد غير صحيح.");
    }
    const assignment = assignDoc.data();

    // الغياب الفعلي من الحضور (للمرجع)
    const absence = await countWorkerAbsenceInMonth(callerTenantId, assignment.workerUid, month);

    const docId = `${assignmentId}_${month}`;
    const ref = db.collection(MONTHLY_DEDUCTIONS_COLLECTION).doc(docId);
    await ref.set(buildMonthlyDeductionDoc({
      tenantId: callerTenantId,
      assignmentId: assignmentId,
      projectId: assignment.projectId || null,
      workerUid: assignment.workerUid || null,
      month: month,
      clientDeductionDays: clientDeductionDays,
      workerDeductionDays: workerDeductionDays,
      actualAbsenceDays: absence.absentDays,
      notes: typeof data.notes === "string" ? data.notes.trim() || null : null,
      updatedBy: request.auth.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }));

    return { id: docId, clientDeductionDays, workerDeductionDays, actualAbsenceDays: absence.absentDays };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("saveMonthlyDeduction failed:", err);
    throw new HttpsError("internal", "تعذّر حفظ التعديل، حاول مرة أخرى.");
  }
});

// ===== حساب ربحية مشروع لشهر محدّد =====
// data: { projectId, month }
// يجمع كل إسنادات المشروع النشطة في الشهر، يطبّق معادلة الغياب الكاملة
exports.getProjectProfitability = onCall(async (request) => {
  try {
    const callerTenantId = await requireProfitabilityView(request.auth);

    const data = request.data || {};
    const projectId = typeof data.projectId === "string" ? data.projectId.trim() : "";
    const month = typeof data.month === "string" ? data.month.trim() : "";
    if (!projectId) throw new HttpsError("invalid-argument", "يجب تحديد المشروع.");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpsError("invalid-argument", "الشهر غير صحيح (YYYY-MM).");

    const projectDoc = await db.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
    if (!projectDoc.exists || projectDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المشروع غير صحيح.");
    }
    const project = projectDoc.data();

    // نصيب الإدارة (من وثيقة الشركة)
    const tenantDoc = await db.collection(COLLECTIONS.TENANTS).doc(callerTenantId).get();
    const adminCostPerWorker = tenantDoc.exists ? (Number(tenantDoc.data().adminCostPerWorker) || 0) : 0;

    const core = await computeProjectMonthCore(callerTenantId, projectId, month, adminCostPerWorker);

    const r = (n) => Math.round(n * 100) / 100;
    return {
      projectId: projectId,
      projectName: project.name || null,
      projectNumber: project.projectNumber || null,
      month: month,
      adminCostPerWorker: r(adminCostPerWorker),
      workersCount: core.workersCount,
      lines: core.lines,
      totals: core.totals,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getProjectProfitability failed:", err);
    throw new HttpsError("internal", "تعذّر حساب الربحية.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== تقارير الربحية الشاملة =====
// ═══════════════════════════════════════════════════════

// ===== تقرير المنشأة: كل المشاريع مجمّعة لشهر (يغطّي أيضًا المقارنة بالترتيب) =====
// data: { month }
exports.getEnterpriseProfitability = onCall(async (request) => {
  try {
    const callerTenantId = await requireProfitabilityView(request.auth);

    const data = request.data || {};
    const month = typeof data.month === "string" ? data.month.trim() : "";
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpsError("invalid-argument", "الشهر غير صحيح (YYYY-MM).");

    const tenantDoc = await db.collection(COLLECTIONS.TENANTS).doc(callerTenantId).get();
    const adminCostPerWorker = tenantDoc.exists ? (Number(tenantDoc.data().adminCostPerWorker) || 0) : 0;

    const projSnap = await db.collection(COLLECTIONS.PROJECTS)
      .where("tenantId", "==", callerTenantId)
      .get();

    const projects = [];
    let gRevenue = 0, gNetRevenue = 0, gCost = 0, gProfit = 0, gWorkers = 0, gMissing = 0;

    for (const pDoc of projSnap.docs) {
      const project = pDoc.data();
      const core = await computeProjectMonthCore(callerTenantId, pDoc.id, month, adminCostPerWorker);

      // تجاهل المشاريع بلا أي نشاط في الشهر
      if (core.lines.length === 0) continue;

      const missingInProject = core.lines.filter((l) => l.missingCost).length;
      projects.push({
        projectId: pDoc.id,
        projectName: project.name || null,
        projectNumber: project.projectNumber || null,
        status: project.status || null,
        workersCount: core.workersCount,
        missingCostCount: missingInProject,
        revenue: core.totals.revenue,
        netRevenue: core.totals.netRevenue,
        cost: core.totals.cost,
        profit: core.totals.profit,
        margin: core.totals.margin,
      });

      gRevenue += core.totals.revenue;
      gNetRevenue += core.totals.netRevenue;
      gCost += core.totals.cost;
      gProfit += core.totals.profit;
      gWorkers += core.workersCount;
      gMissing += missingInProject;
    }

    // ترتيب تنازلي بالربح (للمقارنة)
    projects.sort((a, b) => b.profit - a.profit);

    const r = (n) => Math.round(n * 100) / 100;
    const gMargin = gNetRevenue > 0 ? (gProfit / gNetRevenue) * 100 : 0;

    return {
      month: month,
      adminCostPerWorker: r(adminCostPerWorker),
      projectsCount: projects.length,
      workersCount: gWorkers,
      missingCostCount: gMissing,
      projects: projects,
      totals: {
        revenue: r(gRevenue),
        netRevenue: r(gNetRevenue),
        cost: r(gCost),
        profit: r(gProfit),
        margin: r(gMargin),
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getEnterpriseProfitability failed:", err);
    throw new HttpsError("internal", "تعذّر حساب ربحية المنشأة.");
  }
});

// ===== تقرير المنشأة عبر فترة: اتجاه الإيراد/التكلفة/الربح شهريًا =====
// data: { fromMonth, toMonth }
exports.getEnterpriseProfitabilityRange = onCall(async (request) => {
  try {
    const callerTenantId = await requireProfitabilityView(request.auth);
    const data = request.data || {};
    const fromMonth = typeof data.fromMonth === "string" ? data.fromMonth.trim() : "";
    const toMonth = typeof data.toMonth === "string" ? data.toMonth.trim() : "";
    if (!/^\d{4}-\d{2}$/.test(fromMonth)) throw new HttpsError("invalid-argument", "شهر البداية غير صحيح (YYYY-MM).");
    if (!/^\d{4}-\d{2}$/.test(toMonth)) throw new HttpsError("invalid-argument", "شهر النهاية غير صحيح (YYYY-MM).");
    if (fromMonth > toMonth) throw new HttpsError("invalid-argument", "شهر البداية يجب أن يسبق شهر النهاية.");

    const months = enumerateMonths(fromMonth, toMonth);
    if (months.length > 24) throw new HttpsError("invalid-argument", "النطاق كبير جدًا (24 شهرًا كحد أقصى).");

    const tenantDoc = await db.collection(COLLECTIONS.TENANTS).doc(callerTenantId).get();
    const adminCostPerWorker = tenantDoc.exists ? (Number(tenantDoc.data().adminCostPerWorker) || 0) : 0;

    const projSnap = await db.collection(COLLECTIONS.PROJECTS).where("tenantId", "==", callerTenantId).get();
    const r = (n) => Math.round(n * 100) / 100;

    const monthly = [];
    let gRevenue = 0, gNetRevenue = 0, gCost = 0, gProfit = 0;
    for (const m of months) {
      let mRevenue = 0, mNetRevenue = 0, mCost = 0, mProfit = 0, mWorkers = 0;
      for (const pDoc of projSnap.docs) {
        const core = await computeProjectMonthCore(callerTenantId, pDoc.id, m, adminCostPerWorker);
        if (core.lines.length === 0) continue;
        mRevenue += core.totals.revenue;
        mNetRevenue += core.totals.netRevenue;
        mCost += core.totals.cost;
        mProfit += core.totals.profit;
        mWorkers += core.workersCount;
      }
      monthly.push({
        month: m,
        revenue: r(mRevenue), netRevenue: r(mNetRevenue), cost: r(mCost), profit: r(mProfit),
        workersCount: mWorkers,
        margin: mNetRevenue > 0 ? r((mProfit / mNetRevenue) * 100) : 0,
      });
      gRevenue += mRevenue; gNetRevenue += mNetRevenue; gCost += mCost; gProfit += mProfit;
    }

    return {
      fromMonth, toMonth,
      monthsCount: months.length,
      monthly,
      totals: {
        revenue: r(gRevenue), netRevenue: r(gNetRevenue), cost: r(gCost), profit: r(gProfit),
        margin: gNetRevenue > 0 ? r((gProfit / gNetRevenue) * 100) : 0,
        avgMonthlyCost: months.length > 0 ? r(gCost / months.length) : 0,
        avgMonthlyProfit: months.length > 0 ? r(gProfit / months.length) : 0,
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getEnterpriseProfitabilityRange failed:", err);
    throw new HttpsError("internal", "تعذّر حساب اتجاه الربحية.");
  }
});

// ===== توزيع الموارد: العمالة + الأصول على المشاريع لشهر =====
// data: { month }
exports.getResourceAllocation = onCall(async (request) => {
  try {
    const callerTenantId = await requireProfitabilityView(request.auth);
    const data = request.data || {};
    const month = typeof data.month === "string" ? data.month.trim() : "";
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpsError("invalid-argument", "الشهر غير صحيح (YYYY-MM).");
    const r = (n) => Math.round(n * 100) / 100;

    const tenantDoc = await db.collection(COLLECTIONS.TENANTS).doc(callerTenantId).get();
    const adminCostPerWorker = tenantDoc.exists ? (Number(tenantDoc.data().adminCostPerWorker) || 0) : 0;

    // الأصول لكل مشروع (التكلفة موزّعة على المشاريع المشتركة)
    const assetsByProject = await computeAssetsByProject(callerTenantId);
    const assetCountSnap = await db.collection(COLLECTIONS.ASSET_ASSIGNMENTS)
      .where("tenantId", "==", callerTenantId).where("status", "==", "active").get();
    const assetCount = {};
    assetCountSnap.docs.forEach((d) => { const pid = d.data().projectId; if (pid) assetCount[pid] = (assetCount[pid] || 0) + 1; });

    // المشاريع
    const projSnap = await db.collection(COLLECTIONS.PROJECTS).where("tenantId", "==", callerTenantId).get();
    const projects = [];
    let gWorkers = 0, gWorkerCost = 0, gAssets = 0, gAssetCost = 0;

    for (const pDoc of projSnap.docs) {
      const project = pDoc.data();
      const core = await computeProjectMonthCore(callerTenantId, pDoc.id, month, adminCostPerWorker);
      const wCount = core.workersCount;
      const wCost = core.totals.cost;
      const aCost = assetsByProject[pDoc.id] ? assetsByProject[pDoc.id].cost : 0;
      const aCount = assetCount[pDoc.id] || 0;
      if (wCount === 0 && aCount === 0) continue; // تجاهل المشاريع بلا موارد

      projects.push({
        projectId: pDoc.id, projectName: project.name || null, projectNumber: project.projectNumber || null,
        status: project.status || null,
        workersCount: wCount, workerCost: r(wCost),
        assetsCount: aCount, assetCost: r(aCost),
        totalCost: r(wCost + aCost),
      });
      gWorkers += wCount; gWorkerCost += wCost; gAssets += aCount; gAssetCost += aCost;
    }

    const gTotal = gWorkerCost + gAssetCost;
    projects.sort((a, b) => b.totalCost - a.totalCost);
    projects.forEach((p) => { p.share = gTotal > 0 ? r((p.totalCost / gTotal) * 100) : 0; });

    return {
      month,
      projectsCount: projects.length,
      projects,
      totals: {
        workersCount: gWorkers, workerCost: r(gWorkerCost),
        assetsCount: gAssets, assetCost: r(gAssetCost),
        totalCost: r(gTotal),
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getResourceAllocation failed:", err);
    throw new HttpsError("internal", "تعذّر حساب توزيع الموارد.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== الهيكل التنظيمي (تفعيل الأقسام + مديروها) =====
// ═══════════════════════════════════════════════════════

// قراءة هيكل الأقسام: { [sectionId]: { active, manager } }
exports.getOrgStructure = onCall(async (request) => {
  try {
    const callerTenantId = await requireProfitabilityView(request.auth);
    const tenantDoc = await db.collection(COLLECTIONS.TENANTS).doc(callerTenantId).get();
    const org = (tenantDoc.exists && tenantDoc.data().orgStructure) || {};
    return { orgStructure: org, canManage: request.auth.token.role === ROLES.OWNER };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getOrgStructure failed:", err);
    throw new HttpsError("internal", "تعذّر تحميل الهيكل التنظيمي.");
  }
});

// تحديث قسم: تفعيل/تعطيل + تعيين مدير (المالك فقط)
// data: { sectionId, active?, manager? }
exports.updateOrgSection = onCall(async (request) => {
  try {
    if (!request.auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
    if (request.auth.token.role !== ROLES.OWNER) throw new HttpsError("permission-denied", "هذا الإجراء متاح للمالك فقط.");
    const callerTenantId = request.auth.token.tenantId;
    if (!callerTenantId) throw new HttpsError("failed-precondition", "حسابك غير مرتبط بشركة.");

    const data = request.data || {};
    const sectionId = typeof data.sectionId === "string" ? data.sectionId.trim() : "";
    if (!sectionId || !/^[a-z][a-z_]{1,30}$/.test(sectionId)) throw new HttpsError("invalid-argument", "معرّف القسم غير صحيح.");

    const update = {};
    if (data.active !== undefined) update[`orgStructure.${sectionId}.active`] = !!data.active;
    if (data.manager !== undefined) {
      const m = typeof data.manager === "string" ? data.manager.trim() : "";
      update[`orgStructure.${sectionId}.manager`] = m || null;
    }
    if (Object.keys(update).length === 0) throw new HttpsError("invalid-argument", "لا تغييرات.");

    await db.collection(COLLECTIONS.TENANTS).doc(callerTenantId).update(update);
    return { sectionId, updated: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateOrgSection failed:", err);
    throw new HttpsError("internal", "تعذّر تحديث القسم، حاول مرة أخرى.");
  }
});

// ===== تعديل صلاحيات موظف (المالك فقط) =====
// data: { uid, permissions: [...] }
exports.setUserPermissions = onCall(async (request) => {
  try {
    if (!request.auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
    if (request.auth.token.role !== ROLES.OWNER) throw new HttpsError("permission-denied", "إدارة الصلاحيات متاحة للمالك فقط.");
    const callerTenantId = request.auth.token.tenantId;
    if (!callerTenantId) throw new HttpsError("failed-precondition", "حسابك غير مرتبط بشركة.");

    const data = request.data || {};
    const targetUid = typeof data.uid === "string" ? data.uid.trim() : "";
    const permissions = data.permissions;
    if (!targetUid) throw new HttpsError("invalid-argument", "يجب تحديد الموظف.");
    if (!validatePermissions(permissions)) throw new HttpsError("invalid-argument", "صلاحيات غير صحيحة.");

    const targetRef = db.collection(COLLECTIONS.USERS).doc(targetUid);
    const targetDoc = await targetRef.get();
    if (!targetDoc.exists || targetDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الموظف غير موجود.");
    }
    if (targetDoc.data().role === ROLES.OWNER) {
      throw new HttpsError("invalid-argument", "لا يمكن تعديل صلاحيات المالك (يملك صلاحية كاملة).");
    }

    await targetRef.update({ permissions: permissions });
    return { uid: targetUid, updated: true, count: permissions.length };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("setUserPermissions failed:", err);
    throw new HttpsError("internal", "تعذّر تحديث الصلاحيات، حاول مرة أخرى.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== المبيعات (الصفقات / خط الأنابيب) =====
// ═══════════════════════════════════════════════════════

// إنشاء صفقة
exports.createDeal = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (name.length < 2) throw new HttpsError("invalid-argument", "اسم الصفقة مطلوب (حرفان على الأقل).");
    const value = Number(data.value) || 0;
    if (value < 0) throw new HttpsError("invalid-argument", "القيمة غير صحيحة.");

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const dealRef = db.collection(COLLECTIONS.DEALS).doc();
    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      const nextNumber = (tenantSnap.data().lastDealNumber || 0) + 1;
      const dealDoc = buildDealDoc({
        tenantId: callerTenantId,
        dealNumber: nextNumber,
        name: name,
        customerName: typeof data.customerName === "string" ? data.customerName.trim() : null,
        contactPerson: typeof data.contactPerson === "string" ? data.contactPerson.trim() : null,
        contactPhone: typeof data.contactPhone === "string" ? data.contactPhone.trim() : null,
        value: value,
        stage: data.stage,
        rep: typeof data.rep === "string" ? data.rep.trim() : null,
        source: data.source,
        expectedCloseDate: typeof data.expectedCloseDate === "string" && isValidDate(data.expectedCloseDate) ? data.expectedCloseDate : null,
        notes: typeof data.notes === "string" ? data.notes.trim() : null,
        status: DEAL_STATUS.ACTIVE,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(dealRef, dealDoc);
      tx.update(tenantRef, { lastDealNumber: nextNumber });
      return { dealNumber: nextNumber };
    });
    return { id: dealRef.id, dealNumber: result.dealNumber, name: name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createDeal failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الصفقة.");
  }
});

// تعديل صفقة (المرحلة، الحالة، البيانات)
exports.updateDeal = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const data = request.data || {};
    const dealId = typeof data.dealId === "string" ? data.dealId.trim() : "";
    if (!dealId) throw new HttpsError("invalid-argument", "يجب تحديد الصفقة.");

    const ref = db.collection(COLLECTIONS.DEALS).doc(dealId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "الصفقة غير موجودة.");

    const update = {};
    if (typeof data.name === "string") {
      const n = data.name.trim();
      if (n.length < 2) throw new HttpsError("invalid-argument", "اسم الصفقة قصير.");
      update.name = n;
    }
    if (typeof data.customerName === "string") update.customerName = data.customerName.trim() || null;
    if (typeof data.contactPerson === "string") update.contactPerson = data.contactPerson.trim() || null;
    if (typeof data.contactPhone === "string") update.contactPhone = data.contactPhone.trim() || null;
    if (data.value !== undefined) {
      const v = Number(data.value);
      if (!(v >= 0)) throw new HttpsError("invalid-argument", "القيمة غير صحيحة.");
      update.value = v;
    }
    if (typeof data.stage === "string") {
      if (!ALL_DEAL_STAGES.includes(data.stage)) throw new HttpsError("invalid-argument", "مرحلة غير صحيحة.");
      update.stage = data.stage;
    }
    if (typeof data.status === "string") {
      if (!ALL_DEAL_STATUS.includes(data.status)) throw new HttpsError("invalid-argument", "حالة غير صحيحة.");
      update.status = data.status;
    }
    if (typeof data.rep === "string") update.rep = data.rep.trim() || null;
    if (typeof data.notes === "string") update.notes = data.notes.trim() || null;
    if (typeof data.expectedCloseDate === "string") {
      update.expectedCloseDate = isValidDate(data.expectedCloseDate) ? data.expectedCloseDate : null;
    }

    if (Object.keys(update).length === 0) throw new HttpsError("invalid-argument", "لا تغييرات.");
    update.updatedBy = request.auth.uid;
    update.updatedAt = FieldValue.serverTimestamp();
    await ref.update(update);
    return { id: dealId, updated: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateDeal failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل الصفقة.");
  }
});

// حذف صفقة
exports.deleteDeal = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const data = request.data || {};
    const dealId = typeof data.dealId === "string" ? data.dealId.trim() : "";
    if (!dealId) throw new HttpsError("invalid-argument", "يجب تحديد الصفقة.");
    const ref = db.collection(COLLECTIONS.DEALS).doc(dealId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "الصفقة غير موجودة.");
    await ref.delete();
    return { id: dealId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteDeal failed:", err);
    throw new HttpsError("internal", "تعذّر حذف الصفقة.");
  }
});

// بيانات المبيعات: الصفقات + خط الأنابيب + الملخّص + المندوبون
exports.getSalesData = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

    const snap = await db.collection(COLLECTIONS.DEALS).where("tenantId", "==", callerTenantId).get();
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const active = all.filter((d) => d.status === "active");
    const won = all.filter((d) => d.status === "won");
    const lost = all.filter((d) => d.status === "lost");

    // خط الأنابيب: تجميع الصفقات النشطة حسب المرحلة
    const stageOrder = ["contact", "proposal", "negotiation", "closing"];
    const pipeline = stageOrder.map((stage) => {
      const inStage = active.filter((d) => d.stage === stage);
      return { stage, value: round2(inStage.reduce((s, d) => s + (Number(d.value) || 0), 0)), count: inStage.length };
    });

    // المندوبون: تجميع القيمة النشطة حسب المندوب
    const repMap = {};
    active.forEach((d) => { if (d.rep) repMap[d.rep] = (repMap[d.rep] || 0) + (Number(d.value) || 0); });
    const reps = Object.entries(repMap).map(([name, value]) => ({ name, value: round2(value) })).sort((a, b) => b.value - a.value);

    const pipelineValue = round2(active.reduce((s, d) => s + (Number(d.value) || 0), 0));
    const wonValue = round2(won.reduce((s, d) => s + (Number(d.value) || 0), 0));
    const totalClosed = won.length + lost.length;
    const conversionRate = totalClosed > 0 ? round2((won.length / totalClosed) * 100) : 0;

    return {
      deals: active.sort((a, b) => (b.value || 0) - (a.value || 0)),
      pipeline,
      reps,
      summary: {
        pipelineValue,
        activeCount: active.length,
        wonCount: won.length,
        wonValue,
        lostCount: lost.length,
        conversionRate,
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getSalesData failed:", err);
    throw new HttpsError("internal", "تعذّر تحميل بيانات المبيعات.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== عروض الأسعار =====
// ═══════════════════════════════════════════════════════

// إنشاء عرض سعر (رقم تلقائي + تاريخ ووقت الإصدار)
exports.createQuote = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const data = request.data || {};
    const description = typeof data.description === "string" ? data.description.trim() : "";
    if (description.length < 2) throw new HttpsError("invalid-argument", "وصف العرض مطلوب (حرفان على الأقل).");
    const amount = Number(data.amount) || 0;
    if (amount <= 0) throw new HttpsError("invalid-argument", "المبلغ يجب أن يكون أكبر من صفر.");

    // التحقق من الصفقة المرتبطة (اختياري)
    let dealId = null;
    if (typeof data.dealId === "string" && data.dealId.trim()) {
      const dealSnap = await db.collection(COLLECTIONS.DEALS).doc(data.dealId.trim()).get();
      if (!dealSnap.exists || dealSnap.data().tenantId !== callerTenantId) {
        throw new HttpsError("invalid-argument", "الصفقة المرتبطة غير موجودة.");
      }
      dealId = data.dealId.trim();
    }

    const vatRate = data.vatRate !== undefined ? Number(data.vatRate) : QUOTE_VAT_RATE;
    const totals = computeQuoteTotals(amount, vatRate);

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const quoteRef = db.collection(COLLECTIONS.QUOTES).doc();
    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      const nextNumber = (tenantSnap.data().lastQuoteNumber || 0) + 1;
      const quoteDoc = buildQuoteDoc({
        tenantId: callerTenantId,
        quoteNumber: nextNumber,
        dealId: dealId,
        customerName: typeof data.customerName === "string" ? data.customerName.trim() : null,
        description: description,
        amount: totals.amount,
        vatRate: totals.vatRate,
        vatAmount: totals.vatAmount,
        totalWithVat: totals.totalWithVat,
        validUntil: typeof data.validUntil === "string" && isValidDate(data.validUntil) ? data.validUntil : null,
        status: QUOTE_STATUS.DRAFT,
        notes: typeof data.notes === "string" ? data.notes.trim() : null,
        issuedAt: FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(quoteRef, quoteDoc);
      tx.update(tenantRef, { lastQuoteNumber: nextNumber });
      return { quoteNumber: nextNumber };
    });
    return { id: quoteRef.id, quoteNumber: result.quoteNumber };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createQuote failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء عرض السعر.");
  }
});

// تعديل عرض سعر
exports.updateQuote = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const data = request.data || {};
    const quoteId = typeof data.quoteId === "string" ? data.quoteId.trim() : "";
    if (!quoteId) throw new HttpsError("invalid-argument", "يجب تحديد العرض.");

    const ref = db.collection(COLLECTIONS.QUOTES).doc(quoteId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "العرض غير موجود.");

    const update = {};
    if (typeof data.description === "string") {
      const d = data.description.trim();
      if (d.length < 2) throw new HttpsError("invalid-argument", "وصف العرض قصير.");
      update.description = d;
    }
    if (typeof data.customerName === "string") update.customerName = data.customerName.trim() || null;
    // إعادة حساب الضريبة عند تغيير المبلغ أو النسبة
    if (data.amount !== undefined || data.vatRate !== undefined) {
      const newAmount = data.amount !== undefined ? Number(data.amount) : doc.data().amount;
      const newRate = data.vatRate !== undefined ? Number(data.vatRate) : doc.data().vatRate;
      if (!(newAmount > 0)) throw new HttpsError("invalid-argument", "المبلغ يجب أن يكون أكبر من صفر.");
      const totals = computeQuoteTotals(newAmount, newRate);
      update.amount = totals.amount;
      update.vatRate = totals.vatRate;
      update.vatAmount = totals.vatAmount;
      update.totalWithVat = totals.totalWithVat;
    }
    if (typeof data.status === "string") {
      if (!ALL_QUOTE_STATUS.includes(data.status)) throw new HttpsError("invalid-argument", "حالة غير صحيحة.");
      update.status = data.status;
    }
    if (typeof data.validUntil === "string") update.validUntil = isValidDate(data.validUntil) ? data.validUntil : null;
    if (typeof data.notes === "string") update.notes = data.notes.trim() || null;

    if (Object.keys(update).length === 0) throw new HttpsError("invalid-argument", "لا تغييرات.");
    update.updatedBy = request.auth.uid;
    update.updatedAt = FieldValue.serverTimestamp();
    await ref.update(update);
    return { id: quoteId, updated: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateQuote failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل العرض.");
  }
});

// حذف عرض سعر
exports.deleteQuote = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const data = request.data || {};
    const quoteId = typeof data.quoteId === "string" ? data.quoteId.trim() : "";
    if (!quoteId) throw new HttpsError("invalid-argument", "يجب تحديد العرض.");
    const ref = db.collection(COLLECTIONS.QUOTES).doc(quoteId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "العرض غير موجود.");
    await ref.delete();
    return { id: quoteId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteQuote failed:", err);
    throw new HttpsError("internal", "تعذّر حذف العرض.");
  }
});

// قائمة عروض الأسعار + ملخّص
exports.getQuotes = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const snap = await db.collection(COLLECTIONS.QUOTES).where("tenantId", "==", callerTenantId).get();
    const quotes = snap.docs.map((d) => {
      const q = d.data();
      const issued = q.issuedAt && q.issuedAt.toMillis ? q.issuedAt.toMillis() : null;
      return { id: d.id, ...q, issuedAt: issued };
    });
    quotes.sort((a, b) => (b.quoteNumber || 0) - (a.quoteNumber || 0));

    const accepted = quotes.filter((q) => q.status === "accepted");
    const summary = {
      total: quotes.length,
      totalValue: round2(quotes.reduce((s, q) => s + (Number(q.totalWithVat) || 0), 0)),
      acceptedCount: accepted.length,
      acceptedValue: round2(accepted.reduce((s, q) => s + (Number(q.totalWithVat) || 0), 0)),
    };
    return { quotes, summary };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getQuotes failed:", err);
    throw new HttpsError("internal", "تعذّر تحميل عروض الأسعار.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== التسويق (الحملات) =====
// ═══════════════════════════════════════════════════════

// إنشاء حملة
exports.createCampaign = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (name.length < 2) throw new HttpsError("invalid-argument", "اسم الحملة مطلوب (حرفان على الأقل).");

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const campRef = db.collection(COLLECTIONS.CAMPAIGNS).doc();
    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      const nextNumber = (tenantSnap.data().lastCampaignNumber || 0) + 1;
      const campDoc = buildCampaignDoc({
        tenantId: callerTenantId,
        campaignNumber: nextNumber,
        name: name,
        channel: typeof data.channel === "string" ? data.channel.trim() : null,
        status: data.status,
        budget: Number(data.budget) || 0,
        spent: Number(data.spent) || 0,
        leads: Number(data.leads) || 0,
        reach: Number(data.reach) || 0,
        startDate: typeof data.startDate === "string" && isValidDate(data.startDate) ? data.startDate : null,
        endDate: typeof data.endDate === "string" && isValidDate(data.endDate) ? data.endDate : null,
        notes: typeof data.notes === "string" ? data.notes.trim() : null,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(campRef, campDoc);
      tx.update(tenantRef, { lastCampaignNumber: nextNumber });
      return { campaignNumber: nextNumber };
    });
    return { id: campRef.id, campaignNumber: result.campaignNumber };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createCampaign failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الحملة.");
  }
});

// تعديل حملة
exports.updateCampaign = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const data = request.data || {};
    const campaignId = typeof data.campaignId === "string" ? data.campaignId.trim() : "";
    if (!campaignId) throw new HttpsError("invalid-argument", "يجب تحديد الحملة.");

    const ref = db.collection(COLLECTIONS.CAMPAIGNS).doc(campaignId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "الحملة غير موجودة.");

    const update = {};
    if (typeof data.name === "string") {
      const n = data.name.trim();
      if (n.length < 2) throw new HttpsError("invalid-argument", "اسم الحملة قصير.");
      update.name = n;
    }
    if (typeof data.channel === "string") update.channel = data.channel.trim() || null;
    if (typeof data.status === "string") {
      if (!ALL_CAMPAIGN_STATUS.includes(data.status)) throw new HttpsError("invalid-argument", "حالة غير صحيحة.");
      update.status = data.status;
    }
    ["budget", "spent", "leads", "reach"].forEach((k) => {
      if (data[k] !== undefined) {
        const v = Number(data[k]);
        if (!(v >= 0)) throw new HttpsError("invalid-argument", `قيمة غير صحيحة (${k}).`);
        update[k] = v;
      }
    });
    if (typeof data.startDate === "string") update.startDate = isValidDate(data.startDate) ? data.startDate : null;
    if (typeof data.endDate === "string") update.endDate = isValidDate(data.endDate) ? data.endDate : null;
    if (typeof data.notes === "string") update.notes = data.notes.trim() || null;

    if (Object.keys(update).length === 0) throw new HttpsError("invalid-argument", "لا تغييرات.");
    update.updatedBy = request.auth.uid;
    update.updatedAt = FieldValue.serverTimestamp();
    await ref.update(update);
    return { id: campaignId, updated: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateCampaign failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل الحملة.");
  }
});

// حذف حملة
exports.deleteCampaign = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const data = request.data || {};
    const campaignId = typeof data.campaignId === "string" ? data.campaignId.trim() : "";
    if (!campaignId) throw new HttpsError("invalid-argument", "يجب تحديد الحملة.");
    const ref = db.collection(COLLECTIONS.CAMPAIGNS).doc(campaignId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "الحملة غير موجودة.");
    await ref.delete();
    return { id: campaignId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteCampaign failed:", err);
    throw new HttpsError("internal", "تعذّر حذف الحملة.");
  }
});

// بيانات التسويق: الحملات + الملخّص + تجميع القنوات + الميزانية
exports.getMarketingData = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const snap = await db.collection(COLLECTIONS.CAMPAIGNS).where("tenantId", "==", callerTenantId).get();
    const campaigns = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    let totalReach = 0, totalLeads = 0, totalBudget = 0, totalSpent = 0, activeCount = 0;
    const channelMap = {};
    campaigns.forEach((c) => {
      totalReach += Number(c.reach) || 0;
      totalLeads += Number(c.leads) || 0;
      totalBudget += Number(c.budget) || 0;
      totalSpent += Number(c.spent) || 0;
      if (c.status === "active") activeCount += 1;
      const ch = c.channel || "غير محدّد";
      if (!channelMap[ch]) channelMap[ch] = { channel: ch, leads: 0, reach: 0, spent: 0, count: 0 };
      channelMap[ch].leads += Number(c.leads) || 0;
      channelMap[ch].reach += Number(c.reach) || 0;
      channelMap[ch].spent += Number(c.spent) || 0;
      channelMap[ch].count += 1;
    });

    const byChannel = Object.values(channelMap).map((ch) => ({
      channel: ch.channel,
      leads: ch.leads,
      reach: round2(ch.reach),
      spent: round2(ch.spent),
      count: ch.count,
      costPerLead: ch.leads > 0 ? round2(ch.spent / ch.leads) : 0,
      sharePct: totalLeads > 0 ? round2((ch.leads / totalLeads) * 100) : 0,
    })).sort((a, b) => b.leads - a.leads);

    campaigns.sort((a, b) => (b.campaignNumber || 0) - (a.campaignNumber || 0));

    return {
      campaigns,
      byChannel,
      summary: {
        totalReach: round2(totalReach),
        totalLeads,
        totalSpent: round2(totalSpent),
        totalBudget: round2(totalBudget),
        activeCount,
        costPerLead: totalLeads > 0 ? round2(totalSpent / totalLeads) : 0,
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getMarketingData failed:", err);
    throw new HttpsError("internal", "تعذّر تحميل بيانات التسويق.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== خدمة العملاء و CRM =====
// ═══════════════════════════════════════════════════════

// --- التذاكر ---

// إنشاء تذكرة
exports.createTicket = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const data = request.data || {};
    const subject = typeof data.subject === "string" ? data.subject.trim() : "";
    if (subject.length < 2) throw new HttpsError("invalid-argument", "موضوع التذكرة مطلوب (حرفان على الأقل).");

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const ticketRef = db.collection(COLLECTIONS.TICKETS).doc();
    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      const nextNumber = (tenantSnap.data().lastTicketNumber || 0) + 1;
      const ticketDoc = buildTicketDoc({
        tenantId: callerTenantId,
        ticketNumber: nextNumber,
        subject: subject,
        customerName: typeof data.customerName === "string" ? data.customerName.trim() : null,
        contactPerson: typeof data.contactPerson === "string" ? data.contactPerson.trim() : null,
        contactPhone: typeof data.contactPhone === "string" ? data.contactPhone.trim() : null,
        category: data.category,
        priority: data.priority,
        status: TICKET_STATUS.OPEN,
        assignedTo: typeof data.assignedTo === "string" ? data.assignedTo.trim() : null,
        description: typeof data.description === "string" ? data.description.trim() : null,
        replies: [],
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(ticketRef, ticketDoc);
      tx.update(tenantRef, { lastTicketNumber: nextNumber });
      return { ticketNumber: nextNumber };
    });
    return { id: ticketRef.id, ticketNumber: result.ticketNumber };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createTicket failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء التذكرة.");
  }
});

// تعديل تذكرة (حالة، أولوية، تعيين، حل، رضا)
exports.updateTicket = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const data = request.data || {};
    const ticketId = typeof data.ticketId === "string" ? data.ticketId.trim() : "";
    if (!ticketId) throw new HttpsError("invalid-argument", "يجب تحديد التذكرة.");

    const ref = db.collection(COLLECTIONS.TICKETS).doc(ticketId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "التذكرة غير موجودة.");

    const update = {};
    if (typeof data.subject === "string") {
      const sub = data.subject.trim();
      if (sub.length < 2) throw new HttpsError("invalid-argument", "موضوع التذكرة قصير.");
      update.subject = sub;
    }
    if (typeof data.customerName === "string") update.customerName = data.customerName.trim() || null;
    if (typeof data.contactPerson === "string") update.contactPerson = data.contactPerson.trim() || null;
    if (typeof data.contactPhone === "string") update.contactPhone = data.contactPhone.trim() || null;
    if (typeof data.description === "string") update.description = data.description.trim() || null;
    if (typeof data.assignedTo === "string") update.assignedTo = data.assignedTo.trim() || null;
    if (typeof data.resolution === "string") update.resolution = data.resolution.trim() || null;
    if (typeof data.category === "string") {
      if (!ALL_TICKET_CATEGORY.includes(data.category)) throw new HttpsError("invalid-argument", "فئة غير صحيحة.");
      update.category = data.category;
    }
    if (typeof data.priority === "string") {
      if (!ALL_TICKET_PRIORITY.includes(data.priority)) throw new HttpsError("invalid-argument", "أولوية غير صحيحة.");
      update.priority = data.priority;
    }
    if (typeof data.status === "string") {
      if (!ALL_TICKET_STATUS.includes(data.status)) throw new HttpsError("invalid-argument", "حالة غير صحيحة.");
      update.status = data.status;
      // ختم وقت الحل عند الانتقال لمحلولة/مغلقة
      if ((data.status === "resolved" || data.status === "closed") && !doc.data().resolvedAt) {
        update.resolvedAt = FieldValue.serverTimestamp();
      }
    }
    if (data.satisfaction !== undefined) {
      const sat = Number(data.satisfaction);
      if (data.satisfaction === null) update.satisfaction = null;
      else if (Number.isFinite(sat) && sat >= 1 && sat <= 5) update.satisfaction = sat;
      else throw new HttpsError("invalid-argument", "تقييم الرضا من 1 إلى 5.");
    }

    if (Object.keys(update).length === 0) throw new HttpsError("invalid-argument", "لا تغييرات.");
    update.updatedBy = request.auth.uid;
    update.updatedAt = FieldValue.serverTimestamp();
    await ref.update(update);
    return { id: ticketId, updated: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateTicket failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل التذكرة.");
  }
});

// إضافة رد/تحديث على تذكرة
exports.addTicketReply = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const data = request.data || {};
    const ticketId = typeof data.ticketId === "string" ? data.ticketId.trim() : "";
    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (!ticketId) throw new HttpsError("invalid-argument", "يجب تحديد التذكرة.");
    if (text.length < 1) throw new HttpsError("invalid-argument", "نص الرد مطلوب.");

    const ref = db.collection(COLLECTIONS.TICKETS).doc(ticketId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "التذكرة غير موجودة.");

    // اسم المُجيب
    let byName = null;
    try {
      const userDoc = await db.collection(COLLECTIONS.USERS).doc(request.auth.uid).get();
      byName = userDoc.exists ? (userDoc.data().name || null) : null;
    } catch (e) { byName = null; }

    const reply = {
      text: text,
      by: request.auth.uid,
      byName: byName,
      at: admin.firestore.Timestamp.now(),
    };
    await ref.update({ replies: FieldValue.arrayUnion(reply), updatedAt: FieldValue.serverTimestamp() });
    return { id: ticketId, added: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("addTicketReply failed:", err);
    throw new HttpsError("internal", "تعذّر إضافة الرد.");
  }
});

// حذف تذكرة
exports.deleteTicket = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const data = request.data || {};
    const ticketId = typeof data.ticketId === "string" ? data.ticketId.trim() : "";
    if (!ticketId) throw new HttpsError("invalid-argument", "يجب تحديد التذكرة.");
    const ref = db.collection(COLLECTIONS.TICKETS).doc(ticketId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "التذكرة غير موجودة.");
    await ref.delete();
    return { id: ticketId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteTicket failed:", err);
    throw new HttpsError("internal", "تعذّر حذف التذكرة.");
  }
});

// --- التفاعلات (CRM) ---

// تسجيل تفاعل مع عميل
exports.createInteraction = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const data = request.data || {};
    const customerName = typeof data.customerName === "string" ? data.customerName.trim() : "";
    if (customerName.length < 2) throw new HttpsError("invalid-argument", "اسم العميل مطلوب.");
    if (typeof data.type === "string" && !ALL_INTERACTION_TYPE.includes(data.type)) {
      throw new HttpsError("invalid-argument", "نوع التفاعل غير صحيح.");
    }

    const docRef = db.collection(COLLECTIONS.INTERACTIONS).doc();
    await docRef.set(buildInteractionDoc({
      tenantId: callerTenantId,
      type: data.type,
      customerName: customerName,
      contactPerson: typeof data.contactPerson === "string" ? data.contactPerson.trim() : null,
      subject: typeof data.subject === "string" ? data.subject.trim() : null,
      summary: typeof data.summary === "string" ? data.summary.trim() : null,
      outcome: typeof data.outcome === "string" ? data.outcome.trim() : null,
      date: typeof data.date === "string" && isValidDate(data.date) ? data.date : null,
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    }));
    return { id: docRef.id, created: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createInteraction failed:", err);
    throw new HttpsError("internal", "تعذّر تسجيل التفاعل.");
  }
});

// حذف تفاعل
exports.deleteInteraction = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const data = request.data || {};
    const interactionId = typeof data.interactionId === "string" ? data.interactionId.trim() : "";
    if (!interactionId) throw new HttpsError("invalid-argument", "يجب تحديد التفاعل.");
    const ref = db.collection(COLLECTIONS.INTERACTIONS).doc(interactionId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "التفاعل غير موجود.");
    await ref.delete();
    return { id: interactionId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteInteraction failed:", err);
    throw new HttpsError("internal", "تعذّر حذف التفاعل.");
  }
});

// بيانات خدمة العملاء: التذاكر + التفاعلات + الملخّص + التصنيف + الفريق
exports.getServiceData = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.SALES);
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const toMs = (ts) => (ts && ts.toMillis ? ts.toMillis() : null);

    const [ticketSnap, interSnap] = await Promise.all([
      db.collection(COLLECTIONS.TICKETS).where("tenantId", "==", callerTenantId).get(),
      db.collection(COLLECTIONS.INTERACTIONS).where("tenantId", "==", callerTenantId).get(),
    ]);

    const tickets = ticketSnap.docs.map((d) => {
      const t = d.data();
      const replies = Array.isArray(t.replies) ? t.replies.map((r) => ({ text: r.text, byName: r.byName || null, at: toMs(r.at) })) : [];
      return {
        id: d.id, ...t,
        replies: replies,
        repliesCount: replies.length,
        createdAt: toMs(t.createdAt),
        resolvedAt: toMs(t.resolvedAt),
      };
    });
    tickets.sort((a, b) => (b.ticketNumber || 0) - (a.ticketNumber || 0));

    const interactions = interSnap.docs.map((d) => {
      const it = d.data();
      return { id: d.id, ...it, createdAt: toMs(it.createdAt) };
    });
    interactions.sort((a, b) => {
      const ad = a.date || ""; const bd = b.date || "";
      if (ad !== bd) return bd.localeCompare(ad);
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    // ملخّص
    const openLike = tickets.filter((t) => t.status === "open" || t.status === "in_progress" || t.status === "pending");
    const resolvedLike = tickets.filter((t) => t.status === "resolved" || t.status === "closed");
    const resolutionRate = tickets.length > 0 ? round2((resolvedLike.length / tickets.length) * 100) : 0;
    const satRatings = tickets.filter((t) => t.satisfaction != null).map((t) => t.satisfaction);
    const avgSatisfaction = satRatings.length > 0 ? round2(satRatings.reduce((s, v) => s + v, 0) / satRatings.length) : null;

    // التصنيف (حسب الفئة)
    const catMap = {};
    tickets.forEach((t) => { const c = t.category || "other"; catMap[c] = (catMap[c] || 0) + 1; });
    const byCategory = Object.entries(catMap).map(([category, count]) => ({
      category, count, pct: tickets.length > 0 ? round2((count / tickets.length) * 100) : 0,
    })).sort((a, b) => b.count - a.count);

    // أداء الفريق (التذاكر المحلولة حسب المسؤول)
    const teamMap = {};
    resolvedLike.forEach((t) => { if (t.assignedTo) teamMap[t.assignedTo] = (teamMap[t.assignedTo] || 0) + 1; });
    const team = Object.entries(teamMap).map(([name, resolved]) => ({ name, resolved })).sort((a, b) => b.resolved - a.resolved);

    return {
      tickets,
      interactions,
      byCategory,
      team,
      summary: {
        openCount: openLike.length,
        totalCount: tickets.length,
        resolvedCount: resolvedLike.length,
        resolutionRate: resolutionRate,
        avgSatisfaction: avgSatisfaction,
        interactionsCount: interactions.length,
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getServiceData failed:", err);
    throw new HttpsError("internal", "تعذّر تحميل بيانات خدمة العملاء.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== القانونية: العقود =====
// ═══════════════════════════════════════════════════════

// إنشاء عقد
exports.createContract = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.LEGAL);
    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (name.length < 2) throw new HttpsError("invalid-argument", "اسم العقد مطلوب (حرفان على الأقل).");
    const value = Number(data.value) || 0;
    if (value < 0) throw new HttpsError("invalid-argument", "القيمة غير صحيحة.");

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const contractRef = db.collection(COLLECTIONS.CONTRACTS).doc();
    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      const nextNumber = (tenantSnap.data().lastContractNumber || 0) + 1;
      const contractDoc = buildContractDoc({
        tenantId: callerTenantId,
        contractNumber: nextNumber,
        name: name,
        party: typeof data.party === "string" ? data.party.trim() : null,
        type: data.type,
        value: value,
        startDate: typeof data.startDate === "string" && isValidDate(data.startDate) ? data.startDate : null,
        endDate: typeof data.endDate === "string" && isValidDate(data.endDate) ? data.endDate : null,
        status: data.status,
        autoRenew: data.autoRenew,
        notes: typeof data.notes === "string" ? data.notes.trim() : null,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(contractRef, contractDoc);
      tx.update(tenantRef, { lastContractNumber: nextNumber });
      return { contractNumber: nextNumber };
    });
    return { id: contractRef.id, contractNumber: result.contractNumber };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createContract failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء العقد.");
  }
});

// تعديل عقد
exports.updateContract = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.LEGAL);
    const data = request.data || {};
    const contractId = typeof data.contractId === "string" ? data.contractId.trim() : "";
    if (!contractId) throw new HttpsError("invalid-argument", "يجب تحديد العقد.");

    const ref = db.collection(COLLECTIONS.CONTRACTS).doc(contractId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "العقد غير موجود.");

    const update = {};
    if (typeof data.name === "string") {
      const n = data.name.trim();
      if (n.length < 2) throw new HttpsError("invalid-argument", "اسم العقد قصير.");
      update.name = n;
    }
    if (typeof data.party === "string") update.party = data.party.trim() || null;
    if (typeof data.type === "string") {
      if (!ALL_CONTRACT_TYPE.includes(data.type)) throw new HttpsError("invalid-argument", "نوع غير صحيح.");
      update.type = data.type;
    }
    if (typeof data.status === "string") {
      if (!ALL_CONTRACT_STATUS.includes(data.status)) throw new HttpsError("invalid-argument", "حالة غير صحيحة.");
      update.status = data.status;
    }
    if (data.value !== undefined) {
      const v = Number(data.value);
      if (!(v >= 0)) throw new HttpsError("invalid-argument", "القيمة غير صحيحة.");
      update.value = v;
    }
    if (data.autoRenew !== undefined) update.autoRenew = !!data.autoRenew;
    if (typeof data.startDate === "string") update.startDate = isValidDate(data.startDate) ? data.startDate : null;
    if (typeof data.endDate === "string") update.endDate = isValidDate(data.endDate) ? data.endDate : null;
    if (typeof data.notes === "string") update.notes = data.notes.trim() || null;

    if (Object.keys(update).length === 0) throw new HttpsError("invalid-argument", "لا تغييرات.");
    update.updatedBy = request.auth.uid;
    update.updatedAt = FieldValue.serverTimestamp();
    await ref.update(update);
    return { id: contractId, updated: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateContract failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل العقد.");
  }
});

// حذف عقد
exports.deleteContract = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.LEGAL);
    const data = request.data || {};
    const contractId = typeof data.contractId === "string" ? data.contractId.trim() : "";
    if (!contractId) throw new HttpsError("invalid-argument", "يجب تحديد العقد.");
    const ref = db.collection(COLLECTIONS.CONTRACTS).doc(contractId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "العقد غير موجود.");
    await ref.delete();
    return { id: contractId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteContract failed:", err);
    throw new HttpsError("internal", "تعذّر حذف العقد.");
  }
});

// قائمة العقود + الملخّص + الأنواع + متابعة التجديد
exports.getContracts = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.LEGAL);
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const todayStr = new Date().toISOString().slice(0, 10);
    const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));

    const snap = await db.collection(COLLECTIONS.CONTRACTS).where("tenantId", "==", callerTenantId).get();
    const contracts = snap.docs.map((d) => {
      const c = d.data();
      // حساب الحالة الزمنية
      let daysToEnd = null;
      let computedStatus = c.status;
      if (c.endDate && (c.status === "active" || c.status === "renewing")) {
        daysToEnd = daysBetween(todayStr, c.endDate);
        if (daysToEnd < 0) computedStatus = "expired";
        else if (daysToEnd <= 30) computedStatus = "expiring";
      }
      return { id: d.id, ...c, daysToEnd, computedStatus };
    });
    contracts.sort((a, b) => (b.contractNumber || 0) - (a.contractNumber || 0));

    // الملخّص
    const activeLike = contracts.filter((c) => c.status === "active" || c.status === "renewing");
    const expiringSoon = contracts.filter((c) => c.computedStatus === "expiring");
    const renewing = contracts.filter((c) => c.status === "renewing");
    const totalValue = round2(activeLike.reduce((s, c) => s + (Number(c.value) || 0), 0));

    // الأنواع
    const typeMap = {};
    activeLike.forEach((c) => { const t = c.type || "other"; typeMap[t] = (typeMap[t] || 0) + 1; });
    const byType = Object.entries(typeMap).map(([type, count]) => ({
      type, count, pct: activeLike.length > 0 ? round2((count / activeLike.length) * 100) : 0,
    })).sort((a, b) => b.count - a.count);

    // متابعة التجديد (القريبة الانتهاء مرتّبة بالأيام)
    const renewals = expiringSoon
      .map((c) => ({ id: c.id, name: c.name, party: c.party, days: c.daysToEnd, value: c.value }))
      .sort((a, b) => (a.days || 0) - (b.days || 0));

    return {
      contracts,
      byType,
      renewals,
      summary: {
        activeCount: activeLike.length,
        totalValue: totalValue,
        expiringCount: expiringSoon.length,
        renewingCount: renewing.length,
        totalCount: contracts.length,
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getContracts failed:", err);
    throw new HttpsError("internal", "تعذّر تحميل العقود.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== القانونية: الامتثال والتراخيص =====
// ═══════════════════════════════════════════════════════

// إنشاء ترخيص
exports.createLicense = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.LEGAL);
    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (name.length < 2) throw new HttpsError("invalid-argument", "اسم الترخيص مطلوب (حرفان على الأقل).");

    const docRef = db.collection(COLLECTIONS.LICENSES).doc();
    await docRef.set(buildLicenseDoc({
      tenantId: callerTenantId,
      licenseNumber: typeof data.licenseNumber === "string" ? data.licenseNumber.trim() : null,
      name: name,
      authority: typeof data.authority === "string" ? data.authority.trim() : null,
      issueDate: typeof data.issueDate === "string" && isValidDate(data.issueDate) ? data.issueDate : null,
      endDate: typeof data.endDate === "string" && isValidDate(data.endDate) ? data.endDate : null,
      notes: typeof data.notes === "string" ? data.notes.trim() : null,
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    }));
    return { id: docRef.id, created: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createLicense failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الترخيص.");
  }
});

// تعديل ترخيص
exports.updateLicense = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.LEGAL);
    const data = request.data || {};
    const licenseId = typeof data.licenseId === "string" ? data.licenseId.trim() : "";
    if (!licenseId) throw new HttpsError("invalid-argument", "يجب تحديد الترخيص.");

    const ref = db.collection(COLLECTIONS.LICENSES).doc(licenseId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "الترخيص غير موجود.");

    const update = {};
    if (typeof data.name === "string") {
      const n = data.name.trim();
      if (n.length < 2) throw new HttpsError("invalid-argument", "اسم الترخيص قصير.");
      update.name = n;
    }
    if (typeof data.licenseNumber === "string") update.licenseNumber = data.licenseNumber.trim() || null;
    if (typeof data.authority === "string") update.authority = data.authority.trim() || null;
    if (typeof data.issueDate === "string") update.issueDate = isValidDate(data.issueDate) ? data.issueDate : null;
    if (typeof data.endDate === "string") update.endDate = isValidDate(data.endDate) ? data.endDate : null;
    if (typeof data.notes === "string") update.notes = data.notes.trim() || null;

    if (Object.keys(update).length === 0) throw new HttpsError("invalid-argument", "لا تغييرات.");
    update.updatedBy = request.auth.uid;
    update.updatedAt = FieldValue.serverTimestamp();
    await ref.update(update);
    return { id: licenseId, updated: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateLicense failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل الترخيص.");
  }
});

// حذف ترخيص
exports.deleteLicense = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.LEGAL);
    const data = request.data || {};
    const licenseId = typeof data.licenseId === "string" ? data.licenseId.trim() : "";
    if (!licenseId) throw new HttpsError("invalid-argument", "يجب تحديد الترخيص.");
    const ref = db.collection(COLLECTIONS.LICENSES).doc(licenseId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "الترخيص غير موجود.");
    await ref.delete();
    return { id: licenseId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteLicense failed:", err);
    throw new HttpsError("internal", "تعذّر حذف الترخيص.");
  }
});

// تحديث حالة متطلب امتثال (يُخزّن في وثيقة الشركة)
// data: { key, ok, note? }
exports.setComplianceItem = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.LEGAL);
    const data = request.data || {};
    const key = typeof data.key === "string" ? data.key.trim() : "";
    if (!key || !/^[a-z][a-z_]{1,30}$/.test(key)) throw new HttpsError("invalid-argument", "معرّف المتطلب غير صحيح.");

    const update = {};
    if (data.ok !== undefined) update[`complianceStatus.${key}.ok`] = !!data.ok;
    if (data.note !== undefined) {
      const note = typeof data.note === "string" ? data.note.trim() : "";
      update[`complianceStatus.${key}.note`] = note || null;
    }
    if (Object.keys(update).length === 0) throw new HttpsError("invalid-argument", "لا تغييرات.");

    await db.collection(COLLECTIONS.TENANTS).doc(callerTenantId).update(update);
    return { key, updated: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("setComplianceItem failed:", err);
    throw new HttpsError("internal", "تعذّر تحديث المتطلب.");
  }
});

// بيانات الامتثال: التراخيص + حالة المتطلبات + الملخّص
exports.getCompliance = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.LEGAL);
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const todayStr = new Date().toISOString().slice(0, 10);
    const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));

    const [licenseSnap, tenantDoc] = await Promise.all([
      db.collection(COLLECTIONS.LICENSES).where("tenantId", "==", callerTenantId).get(),
      db.collection(COLLECTIONS.TENANTS).doc(callerTenantId).get(),
    ]);

    const licenses = licenseSnap.docs.map((d) => {
      const l = d.data();
      let daysToEnd = null;
      let computedStatus = "valid";
      if (l.endDate) {
        daysToEnd = daysBetween(todayStr, l.endDate);
        if (daysToEnd < 0) computedStatus = "expired";
        else if (daysToEnd <= 30) computedStatus = "expiring";
      } else {
        computedStatus = "valid";
      }
      return { id: d.id, ...l, daysToEnd, computedStatus };
    });
    licenses.sort((a, b) => {
      const ae = a.endDate || "9999"; const be = b.endDate || "9999";
      return ae.localeCompare(be);
    });

    const complianceStatus = (tenantDoc.exists && tenantDoc.data().complianceStatus) || {};

    const validCount = licenses.filter((l) => l.computedStatus === "valid").length;
    const expiringSoon = licenses.filter((l) => l.computedStatus === "expiring");
    const expiredCount = licenses.filter((l) => l.computedStatus === "expired").length;

    const renewals = expiringSoon
      .map((l) => ({ id: l.id, name: l.name, authority: l.authority, days: l.daysToEnd }))
      .sort((a, b) => (a.days || 0) - (b.days || 0));

    return {
      licenses,
      complianceStatus,
      renewals,
      summary: {
        validCount,
        expiringCount: expiringSoon.length,
        expiredCount,
        totalCount: licenses.length,
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getCompliance failed:", err);
    throw new HttpsError("internal", "تعذّر تحميل بيانات الامتثال.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== القانونية: المنازعات =====
// ═══════════════════════════════════════════════════════

// إنشاء منازعة
exports.createDispute = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.LEGAL);
    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (name.length < 2) throw new HttpsError("invalid-argument", "اسم القضية مطلوب (حرفان على الأقل).");
    const value = Number(data.value) || 0;
    if (value < 0) throw new HttpsError("invalid-argument", "القيمة غير صحيحة.");

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const dispRef = db.collection(COLLECTIONS.DISPUTES).doc();
    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      const nextNumber = (tenantSnap.data().lastDisputeNumber || 0) + 1;
      const dispDoc = buildDisputeDoc({
        tenantId: callerTenantId,
        disputeNumber: nextNumber,
        name: name,
        party: typeof data.party === "string" ? data.party.trim() : null,
        type: data.type,
        value: value,
        status: data.status,
        outcome: data.outcome,
        provision: Number(data.provision) || 0,
        notes: typeof data.notes === "string" ? data.notes.trim() : null,
        openDate: typeof data.openDate === "string" && isValidDate(data.openDate) ? data.openDate : null,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(dispRef, dispDoc);
      tx.update(tenantRef, { lastDisputeNumber: nextNumber });
      return { disputeNumber: nextNumber };
    });
    return { id: dispRef.id, disputeNumber: result.disputeNumber };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createDispute failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء القضية.");
  }
});

// تعديل منازعة
exports.updateDispute = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.LEGAL);
    const data = request.data || {};
    const disputeId = typeof data.disputeId === "string" ? data.disputeId.trim() : "";
    if (!disputeId) throw new HttpsError("invalid-argument", "يجب تحديد القضية.");

    const ref = db.collection(COLLECTIONS.DISPUTES).doc(disputeId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "القضية غير موجودة.");

    const update = {};
    if (typeof data.name === "string") {
      const n = data.name.trim();
      if (n.length < 2) throw new HttpsError("invalid-argument", "اسم القضية قصير.");
      update.name = n;
    }
    if (typeof data.party === "string") update.party = data.party.trim() || null;
    if (typeof data.type === "string") {
      if (!ALL_DISPUTE_TYPE.includes(data.type)) throw new HttpsError("invalid-argument", "نوع غير صحيح.");
      update.type = data.type;
    }
    if (typeof data.status === "string") {
      if (!ALL_DISPUTE_STATUS.includes(data.status)) throw new HttpsError("invalid-argument", "حالة غير صحيحة.");
      update.status = data.status;
    }
    if (data.outcome !== undefined) {
      if (data.outcome === null || data.outcome === "") update.outcome = null;
      else if (ALL_DISPUTE_OUTCOME.includes(data.outcome)) update.outcome = data.outcome;
      else throw new HttpsError("invalid-argument", "نتيجة غير صحيحة.");
    }
    ["value", "provision"].forEach((k) => {
      if (data[k] !== undefined) {
        const v = Number(data[k]);
        if (!(v >= 0)) throw new HttpsError("invalid-argument", `قيمة غير صحيحة (${k}).`);
        update[k] = v;
      }
    });
    if (typeof data.openDate === "string") update.openDate = isValidDate(data.openDate) ? data.openDate : null;
    if (typeof data.notes === "string") update.notes = data.notes.trim() || null;

    if (Object.keys(update).length === 0) throw new HttpsError("invalid-argument", "لا تغييرات.");
    update.updatedBy = request.auth.uid;
    update.updatedAt = FieldValue.serverTimestamp();
    await ref.update(update);
    return { id: disputeId, updated: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateDispute failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل القضية.");
  }
});

// حذف منازعة
exports.deleteDispute = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.LEGAL);
    const data = request.data || {};
    const disputeId = typeof data.disputeId === "string" ? data.disputeId.trim() : "";
    if (!disputeId) throw new HttpsError("invalid-argument", "يجب تحديد القضية.");
    const ref = db.collection(COLLECTIONS.DISPUTES).doc(disputeId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "القضية غير موجودة.");
    await ref.delete();
    return { id: disputeId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteDispute failed:", err);
    throw new HttpsError("internal", "تعذّر حذف القضية.");
  }
});

// بيانات المنازعات: القضايا + الملخّص + التجميع
exports.getDisputes = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.LEGAL);
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const snap = await db.collection(COLLECTIONS.DISPUTES).where("tenantId", "==", callerTenantId).get();
    const disputes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    disputes.sort((a, b) => (b.disputeNumber || 0) - (a.disputeNumber || 0));

    const openLike = disputes.filter((d) => d.status !== "closed");
    const closed = disputes.filter((d) => d.status === "closed");
    const won = closed.filter((d) => d.outcome === "won");
    const lost = closed.filter((d) => d.outcome === "lost");

    const valueAtRisk = round2(openLike.reduce((s, d) => s + (Number(d.value) || 0), 0));
    const provisions = round2(openLike.reduce((s, d) => s + (Number(d.provision) || 0), 0));
    const decided = won.length + lost.length;
    const winRate = decided > 0 ? round2((won.length / decided) * 100) : 0;

    // التجميع حسب الحالة
    const statusMap = {};
    disputes.forEach((d) => { const st = d.status || "review"; statusMap[st] = (statusMap[st] || 0) + 1; });
    const byStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

    // التجميع حسب النوع
    const typeMap = {};
    disputes.forEach((d) => { const t = d.type || "other"; typeMap[t] = (typeMap[t] || 0) + 1; });
    const byType = Object.entries(typeMap).map(([type, count]) => ({
      type, count, pct: disputes.length > 0 ? round2((count / disputes.length) * 100) : 0,
    })).sort((a, b) => b.count - a.count);

    return {
      disputes,
      byStatus,
      byType,
      summary: {
        openCount: openLike.length,
        totalCount: disputes.length,
        valueAtRisk: valueAtRisk,
        provisions: provisions,
        winRate: winRate,
        wonCount: won.length,
        lostCount: lost.length,
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getDisputes failed:", err);
    throw new HttpsError("internal", "تعذّر تحميل المنازعات.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== التميز والجودة: التدقيق الداخلي =====
// ═══════════════════════════════════════════════════════

// --- التدقيقات ---

// إنشاء تدقيق
exports.createAudit = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.QUALITY);
    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (name.length < 2) throw new HttpsError("invalid-argument", "اسم التدقيق مطلوب (حرفان على الأقل).");

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const auditRef = db.collection(COLLECTIONS.AUDITS).doc();
    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      const nextNumber = (tenantSnap.data().lastAuditNumber || 0) + 1;
      const auditDoc = buildAuditDoc({
        tenantId: callerTenantId,
        auditNumber: nextNumber,
        name: name,
        department: typeof data.department === "string" ? data.department.trim() : null,
        status: data.status,
        auditDate: typeof data.auditDate === "string" && isValidDate(data.auditDate) ? data.auditDate : null,
        auditor: typeof data.auditor === "string" ? data.auditor.trim() : null,
        scope: typeof data.scope === "string" ? data.scope.trim() : null,
        notes: typeof data.notes === "string" ? data.notes.trim() : null,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(auditRef, auditDoc);
      tx.update(tenantRef, { lastAuditNumber: nextNumber });
      return { auditNumber: nextNumber };
    });
    return { id: auditRef.id, auditNumber: result.auditNumber };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createAudit failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء التدقيق.");
  }
});

// تعديل تدقيق
exports.updateAudit = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.QUALITY);
    const data = request.data || {};
    const auditId = typeof data.auditId === "string" ? data.auditId.trim() : "";
    if (!auditId) throw new HttpsError("invalid-argument", "يجب تحديد التدقيق.");

    const ref = db.collection(COLLECTIONS.AUDITS).doc(auditId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "التدقيق غير موجود.");

    const update = {};
    if (typeof data.name === "string") {
      const n = data.name.trim();
      if (n.length < 2) throw new HttpsError("invalid-argument", "اسم التدقيق قصير.");
      update.name = n;
    }
    if (typeof data.department === "string") update.department = data.department.trim() || null;
    if (typeof data.status === "string") {
      if (!ALL_AUDIT_STATUS.includes(data.status)) throw new HttpsError("invalid-argument", "حالة غير صحيحة.");
      update.status = data.status;
    }
    if (typeof data.auditor === "string") update.auditor = data.auditor.trim() || null;
    if (typeof data.scope === "string") update.scope = data.scope.trim() || null;
    if (typeof data.auditDate === "string") update.auditDate = isValidDate(data.auditDate) ? data.auditDate : null;
    if (typeof data.notes === "string") update.notes = data.notes.trim() || null;

    if (Object.keys(update).length === 0) throw new HttpsError("invalid-argument", "لا تغييرات.");
    update.updatedBy = request.auth.uid;
    update.updatedAt = FieldValue.serverTimestamp();
    await ref.update(update);
    return { id: auditId, updated: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateAudit failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل التدقيق.");
  }
});

// حذف تدقيق (مع ملاحظاته)
exports.deleteAudit = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.QUALITY);
    const data = request.data || {};
    const auditId = typeof data.auditId === "string" ? data.auditId.trim() : "";
    if (!auditId) throw new HttpsError("invalid-argument", "يجب تحديد التدقيق.");
    const ref = db.collection(COLLECTIONS.AUDITS).doc(auditId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "التدقيق غير موجود.");

    // فكّ ربط الملاحظات المرتبطة (لا تُحذف، تصبح مستقلّة)
    const linkedSnap = await db.collection(COLLECTIONS.FINDINGS).where("tenantId", "==", callerTenantId).where("auditId", "==", auditId).get();
    const batch = db.batch();
    linkedSnap.docs.forEach((d) => batch.update(d.ref, { auditId: null }));
    batch.delete(ref);
    await batch.commit();
    return { id: auditId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteAudit failed:", err);
    throw new HttpsError("internal", "تعذّر حذف التدقيق.");
  }
});

// --- الملاحظات ---

// إنشاء ملاحظة
exports.createFinding = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.QUALITY);
    const data = request.data || {};
    const title = typeof data.title === "string" ? data.title.trim() : "";
    if (title.length < 2) throw new HttpsError("invalid-argument", "عنوان الملاحظة مطلوب (حرفان على الأقل).");

    // التحقق من التدقيق المرتبط (اختياري)
    let auditId = null;
    if (typeof data.auditId === "string" && data.auditId.trim()) {
      const auditSnap = await db.collection(COLLECTIONS.AUDITS).doc(data.auditId.trim()).get();
      if (!auditSnap.exists || auditSnap.data().tenantId !== callerTenantId) {
        throw new HttpsError("invalid-argument", "التدقيق المرتبط غير موجود.");
      }
      auditId = data.auditId.trim();
    }

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const findingRef = db.collection(COLLECTIONS.FINDINGS).doc();
    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      const nextNumber = (tenantSnap.data().lastFindingNumber || 0) + 1;
      const findingDoc = buildFindingDoc({
        tenantId: callerTenantId,
        findingNumber: nextNumber,
        title: title,
        auditId: auditId,
        severity: data.severity,
        status: data.status,
        correctiveAction: typeof data.correctiveAction === "string" ? data.correctiveAction.trim() : null,
        responsible: typeof data.responsible === "string" ? data.responsible.trim() : null,
        dueDate: typeof data.dueDate === "string" && isValidDate(data.dueDate) ? data.dueDate : null,
        notes: typeof data.notes === "string" ? data.notes.trim() : null,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(findingRef, findingDoc);
      tx.update(tenantRef, { lastFindingNumber: nextNumber });
      return { findingNumber: nextNumber };
    });
    return { id: findingRef.id, findingNumber: result.findingNumber };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createFinding failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الملاحظة.");
  }
});

// تعديل ملاحظة
exports.updateFinding = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.QUALITY);
    const data = request.data || {};
    const findingId = typeof data.findingId === "string" ? data.findingId.trim() : "";
    if (!findingId) throw new HttpsError("invalid-argument", "يجب تحديد الملاحظة.");

    const ref = db.collection(COLLECTIONS.FINDINGS).doc(findingId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "الملاحظة غير موجودة.");

    const update = {};
    if (typeof data.title === "string") {
      const t = data.title.trim();
      if (t.length < 2) throw new HttpsError("invalid-argument", "عنوان الملاحظة قصير.");
      update.title = t;
    }
    if (typeof data.severity === "string") {
      if (!ALL_FINDING_SEVERITY.includes(data.severity)) throw new HttpsError("invalid-argument", "خطورة غير صحيحة.");
      update.severity = data.severity;
    }
    if (typeof data.status === "string") {
      if (!ALL_FINDING_STATUS.includes(data.status)) throw new HttpsError("invalid-argument", "حالة غير صحيحة.");
      update.status = data.status;
    }
    if (typeof data.correctiveAction === "string") update.correctiveAction = data.correctiveAction.trim() || null;
    if (typeof data.responsible === "string") update.responsible = data.responsible.trim() || null;
    if (typeof data.dueDate === "string") update.dueDate = isValidDate(data.dueDate) ? data.dueDate : null;
    if (typeof data.notes === "string") update.notes = data.notes.trim() || null;
    if (data.auditId !== undefined) {
      if (data.auditId === null || data.auditId === "") update.auditId = null;
      else {
        const auditSnap = await db.collection(COLLECTIONS.AUDITS).doc(data.auditId).get();
        if (!auditSnap.exists || auditSnap.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "التدقيق المرتبط غير موجود.");
        update.auditId = data.auditId;
      }
    }

    if (Object.keys(update).length === 0) throw new HttpsError("invalid-argument", "لا تغييرات.");
    update.updatedBy = request.auth.uid;
    update.updatedAt = FieldValue.serverTimestamp();
    await ref.update(update);
    return { id: findingId, updated: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateFinding failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل الملاحظة.");
  }
});

// حذف ملاحظة
exports.deleteFinding = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.QUALITY);
    const data = request.data || {};
    const findingId = typeof data.findingId === "string" ? data.findingId.trim() : "";
    if (!findingId) throw new HttpsError("invalid-argument", "يجب تحديد الملاحظة.");
    const ref = db.collection(COLLECTIONS.FINDINGS).doc(findingId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "الملاحظة غير موجودة.");
    await ref.delete();
    return { id: findingId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteFinding failed:", err);
    throw new HttpsError("internal", "تعذّر حذف الملاحظة.");
  }
});

// بيانات التدقيق: التدقيقات + الملاحظات + الملخّص
exports.getAuditData = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.QUALITY);
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

    const [auditSnap, findingSnap] = await Promise.all([
      db.collection(COLLECTIONS.AUDITS).where("tenantId", "==", callerTenantId).get(),
      db.collection(COLLECTIONS.FINDINGS).where("tenantId", "==", callerTenantId).get(),
    ]);

    const audits = auditSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    audits.sort((a, b) => (b.auditNumber || 0) - (a.auditNumber || 0));
    const auditNames = {};
    audits.forEach((a) => { auditNames[a.id] = a.name; });

    const findings = findingSnap.docs.map((d) => {
      const f = d.data();
      return { id: d.id, ...f, auditName: f.auditId ? (auditNames[f.auditId] || null) : null };
    });
    findings.sort((a, b) => (b.findingNumber || 0) - (a.findingNumber || 0));

    // الملخّص
    const doneAudits = audits.filter((a) => a.status === "done");
    const openFindings = findings.filter((f) => f.status === "open" || f.status === "progress");
    const resolvedFindings = findings.filter((f) => f.status === "resolved");
    const pendingActions = findings.filter((f) => (f.status === "open" || f.status === "progress") && f.correctiveAction);
    const complianceRate = findings.length > 0 ? round2((resolvedFindings.length / findings.length) * 100) : 100;

    // تجميع الملاحظات بالخطورة
    const sevMap = { high: 0, medium: 0, low: 0 };
    openFindings.forEach((f) => { const sv = f.severity || "medium"; sevMap[sv] = (sevMap[sv] || 0) + 1; });

    return {
      audits,
      findings,
      summary: {
        doneCount: doneAudits.length,
        totalAudits: audits.length,
        openFindings: openFindings.length,
        resolvedFindings: resolvedFindings.length,
        pendingActions: pendingActions.length,
        complianceRate: complianceRate,
        severityBreakdown: sevMap,
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getAuditData failed:", err);
    throw new HttpsError("internal", "تعذّر تحميل بيانات التدقيق.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== التميز والجودة: رضا العملاء (NPS) =====
// ═══════════════════════════════════════════════════════

// تسجيل تقييم عميل
exports.createRating = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.QUALITY);
    const data = request.data || {};
    const score = Number(data.score);
    if (!Number.isFinite(score) || score < 0 || score > 10) throw new HttpsError("invalid-argument", "الدرجة من 0 إلى 10.");

    const docRef = db.collection(COLLECTIONS.RATINGS).doc();
    await docRef.set(buildRatingDoc({
      tenantId: callerTenantId,
      customerName: typeof data.customerName === "string" ? data.customerName.trim() : null,
      score: Math.round(score),
      comment: typeof data.comment === "string" ? data.comment.trim() : null,
      surveyName: typeof data.surveyName === "string" ? data.surveyName.trim() : null,
      date: typeof data.date === "string" && isValidDate(data.date) ? data.date : new Date().toISOString().slice(0, 10),
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    }));
    return { id: docRef.id, created: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createRating failed:", err);
    throw new HttpsError("internal", "تعذّر تسجيل التقييم.");
  }
});

// حذف تقييم
exports.deleteRating = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.QUALITY);
    const data = request.data || {};
    const ratingId = typeof data.ratingId === "string" ? data.ratingId.trim() : "";
    if (!ratingId) throw new HttpsError("invalid-argument", "يجب تحديد التقييم.");
    const ref = db.collection(COLLECTIONS.RATINGS).doc(ratingId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "التقييم غير موجود.");
    await ref.delete();
    return { id: ratingId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteRating failed:", err);
    throw new HttpsError("internal", "تعذّر حذف التقييم.");
  }
});

// بيانات رضا العملاء: NPS + التوزيع + CSAT + حسب العميل + الاتجاه
exports.getNPSData = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.QUALITY);
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

    const snap = await db.collection(COLLECTIONS.RATINGS).where("tenantId", "==", callerTenantId).get();
    const ratings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    ratings.sort((a, b) => {
      const ad = a.date || ""; const bd = b.date || "";
      return bd.localeCompare(ad);
    });

    const total = ratings.length;
    const promoters = ratings.filter((r) => r.score >= 9).length;
    const passives = ratings.filter((r) => r.score >= 7 && r.score <= 8).length;
    const detractors = ratings.filter((r) => r.score <= 6).length;

    // NPS = %مروّجين − %منتقدين (من -100 إلى +100)
    const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;
    // CSAT = متوسط الدرجات على مقياس 100
    const avgScore = total > 0 ? ratings.reduce((s, r) => s + (Number(r.score) || 0), 0) / total : 0;
    const csat = round2(avgScore * 10);

    const distribution = {
      promoters: { count: promoters, pct: total > 0 ? round2((promoters / total) * 100) : 0 },
      passives: { count: passives, pct: total > 0 ? round2((passives / total) * 100) : 0 },
      detractors: { count: detractors, pct: total > 0 ? round2((detractors / total) * 100) : 0 },
    };

    // حسب العميل (متوسط الدرجة)
    const custMap = {};
    ratings.forEach((r) => {
      if (!r.customerName) return;
      if (!custMap[r.customerName]) custMap[r.customerName] = { sum: 0, count: 0 };
      custMap[r.customerName].sum += Number(r.score) || 0;
      custMap[r.customerName].count += 1;
    });
    const byCustomer = Object.entries(custMap).map(([name, v]) => ({
      name, avgScore: round2(v.sum / v.count), count: v.count, score100: round2((v.sum / v.count) * 10),
    })).sort((a, b) => b.avgScore - a.avgScore);

    // الاتجاه الشهري (متوسط CSAT لكل شهر، آخر 6 أشهر بترتيب زمني)
    const monthMap = {};
    ratings.forEach((r) => {
      if (!r.date) return;
      const m = r.date.slice(0, 7);
      if (!monthMap[m]) monthMap[m] = { sum: 0, count: 0 };
      monthMap[m].sum += Number(r.score) || 0;
      monthMap[m].count += 1;
    });
    const trend = Object.entries(monthMap)
      .map(([month, v]) => ({ month, csat: round2((v.sum / v.count) * 10), count: v.count }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);

    // الاتجاه (فرق آخر شهرين)
    let trendDelta = 0;
    if (trend.length >= 2) trendDelta = round2(trend[trend.length - 1].csat - trend[trend.length - 2].csat);

    return {
      ratings: ratings.slice(0, 50),
      distribution,
      byCustomer,
      trend,
      summary: {
        nps,
        csat,
        total,
        trendDelta,
        promoters,
        detractors,
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getNPSData failed:", err);
    throw new HttpsError("internal", "تعذّر تحميل بيانات رضا العملاء.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== التميز والجودة: تحسين العمليات =====
// ═══════════════════════════════════════════════════════

// إنشاء مبادرة تحسين
exports.createImprovement = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.QUALITY);
    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (name.length < 2) throw new HttpsError("invalid-argument", "اسم المبادرة مطلوب (حرفان على الأقل).");

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const impRef = db.collection(COLLECTIONS.IMPROVEMENTS).doc();
    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      const nextNumber = (tenantSnap.data().lastImprovementNumber || 0) + 1;
      const impDoc = buildImprovementDoc({
        tenantId: callerTenantId,
        improvementNumber: nextNumber,
        name: name,
        department: typeof data.department === "string" ? data.department.trim() : null,
        progress: data.progress,
        status: data.status,
        savings: Number(data.savings) || 0,
        timeSavedHours: Number(data.timeSavedHours) || 0,
        beforeMetric: typeof data.beforeMetric === "string" ? data.beforeMetric.trim() : null,
        afterMetric: typeof data.afterMetric === "string" ? data.afterMetric.trim() : null,
        notes: typeof data.notes === "string" ? data.notes.trim() : null,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(impRef, impDoc);
      tx.update(tenantRef, { lastImprovementNumber: nextNumber });
      return { improvementNumber: nextNumber };
    });
    return { id: impRef.id, improvementNumber: result.improvementNumber };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createImprovement failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء المبادرة.");
  }
});

// تعديل مبادرة تحسين
exports.updateImprovement = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.QUALITY);
    const data = request.data || {};
    const improvementId = typeof data.improvementId === "string" ? data.improvementId.trim() : "";
    if (!improvementId) throw new HttpsError("invalid-argument", "يجب تحديد المبادرة.");

    const ref = db.collection(COLLECTIONS.IMPROVEMENTS).doc(improvementId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "المبادرة غير موجودة.");

    const update = {};
    if (typeof data.name === "string") {
      const n = data.name.trim();
      if (n.length < 2) throw new HttpsError("invalid-argument", "اسم المبادرة قصير.");
      update.name = n;
    }
    if (typeof data.department === "string") update.department = data.department.trim() || null;
    if (typeof data.status === "string") {
      if (!ALL_IMPROVEMENT_STATUS.includes(data.status)) throw new HttpsError("invalid-argument", "حالة غير صحيحة.");
      update.status = data.status;
    }
    if (data.progress !== undefined) {
      let p = Number(data.progress);
      if (!Number.isFinite(p)) throw new HttpsError("invalid-argument", "نسبة التقدّم غير صحيحة.");
      if (p < 0) p = 0; if (p > 100) p = 100;
      update.progress = Math.round(p);
    }
    ["savings", "timeSavedHours"].forEach((k) => {
      if (data[k] !== undefined) {
        const v = Number(data[k]);
        if (!(v >= 0)) throw new HttpsError("invalid-argument", `قيمة غير صحيحة (${k}).`);
        update[k] = v;
      }
    });
    if (typeof data.beforeMetric === "string") update.beforeMetric = data.beforeMetric.trim() || null;
    if (typeof data.afterMetric === "string") update.afterMetric = data.afterMetric.trim() || null;
    if (typeof data.notes === "string") update.notes = data.notes.trim() || null;

    if (Object.keys(update).length === 0) throw new HttpsError("invalid-argument", "لا تغييرات.");
    update.updatedBy = request.auth.uid;
    update.updatedAt = FieldValue.serverTimestamp();
    await ref.update(update);
    return { id: improvementId, updated: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateImprovement failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل المبادرة.");
  }
});

// حذف مبادرة تحسين
exports.deleteImprovement = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.QUALITY);
    const data = request.data || {};
    const improvementId = typeof data.improvementId === "string" ? data.improvementId.trim() : "";
    if (!improvementId) throw new HttpsError("invalid-argument", "يجب تحديد المبادرة.");
    const ref = db.collection(COLLECTIONS.IMPROVEMENTS).doc(improvementId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "المبادرة غير موجودة.");
    await ref.delete();
    return { id: improvementId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteImprovement failed:", err);
    throw new HttpsError("internal", "تعذّر حذف المبادرة.");
  }
});

// بيانات تحسين العمليات: المبادرات + التجميع + الملخّص
exports.getImprovementData = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.QUALITY);
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

    const snap = await db.collection(COLLECTIONS.IMPROVEMENTS).where("tenantId", "==", callerTenantId).get();
    const improvements = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    improvements.sort((a, b) => (b.improvementNumber || 0) - (a.improvementNumber || 0));

    const active = improvements.filter((i) => i.status === "active");
    const done = improvements.filter((i) => i.status === "done");
    const planned = improvements.filter((i) => i.status === "planned");

    const totalSavings = round2(improvements.reduce((s, i) => s + (Number(i.savings) || 0), 0));
    const totalTimeSaved = round2(improvements.reduce((s, i) => s + (Number(i.timeSavedHours) || 0), 0));
    const activeProgressList = active.map((i) => Number(i.progress) || 0);
    const avgProgress = activeProgressList.length > 0 ? Math.round(activeProgressList.reduce((s, v) => s + v, 0) / activeProgressList.length) : 0;

    // مؤشرات الكفاءة (المبادرات التي لها قبل/بعد)
    const efficiency = improvements
      .filter((i) => i.beforeMetric && i.afterMetric)
      .map((i) => ({ name: i.name, before: i.beforeMetric, after: i.afterMetric }));

    // التجميع حسب القسم
    const deptMap = {};
    improvements.forEach((i) => { if (i.department) deptMap[i.department] = (deptMap[i.department] || 0) + 1; });
    const byDept = Object.entries(deptMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    return {
      improvements,
      efficiency,
      byDept,
      summary: {
        activeCount: active.length,
        doneCount: done.length,
        plannedCount: planned.length,
        totalCount: improvements.length,
        totalSavings: totalSavings,
        totalTimeSaved: totalTimeSaved,
        avgProgress: avgProgress,
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getImprovementData failed:", err);
    throw new HttpsError("internal", "تعذّر تحميل بيانات التحسين.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== المخزون =====
// ═══════════════════════════════════════════════════════

// إنشاء صنف
exports.createProduct = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.INVENTORY);
    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (name.length < 2) throw new HttpsError("invalid-argument", "اسم الصنف مطلوب (حرفان على الأقل).");
    const salePrice = Number(data.salePrice) || 0;
    if (salePrice < 0) throw new HttpsError("invalid-argument", "سعر البيع غير صحيح.");
    const isService = !!data.isService;
    const initialQty = isService ? 0 : (Number(data.quantity) || 0);
    if (initialQty < 0) throw new HttpsError("invalid-argument", "الكمية غير صحيحة.");

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const productRef = db.collection(COLLECTIONS.PRODUCTS).doc();
    const movementRef = db.collection(COLLECTIONS.STOCK_MOVEMENTS).doc();
    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      const nextNumber = (tenantSnap.data().lastProductNumber || 0) + 1;
      const productDoc = buildProductDoc({
        tenantId: callerTenantId,
        productNumber: nextNumber,
        sku: typeof data.sku === "string" ? data.sku.trim() : null,
        name: name,
        category: typeof data.category === "string" ? data.category.trim() : null,
        unit: typeof data.unit === "string" ? data.unit.trim() : null,
        salePrice: salePrice,
        cost: Number(data.cost) || 0,
        quantity: initialQty,
        minQuantity: Number(data.minQuantity) || 0,
        isService: isService,
        active: true,
        notes: typeof data.notes === "string" ? data.notes.trim() : null,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(productRef, productDoc);
      tx.update(tenantRef, { lastProductNumber: nextNumber });
      // حركة افتتاحية للكمية الأولية (للمنتجات فقط)
      if (!isService && initialQty > 0) {
        tx.set(movementRef, buildStockMovementDoc({
          tenantId: callerTenantId,
          productId: productRef.id,
          productName: name,
          type: STOCK_MOVEMENT_TYPE.IN,
          quantity: initialQty,
          balanceAfter: initialQty,
          reason: "رصيد افتتاحي",
          source: "manual",
          note: null,
          createdBy: request.auth.uid,
          createdAt: FieldValue.serverTimestamp(),
        }));
      }
      return { productNumber: nextNumber };
    });
    return { id: productRef.id, productNumber: result.productNumber };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createProduct failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الصنف.");
  }
});

// تعديل صنف (بدون تعديل الكمية مباشرة — الكمية عبر addStockMovement)
exports.updateProduct = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.INVENTORY);
    const data = request.data || {};
    const productId = typeof data.productId === "string" ? data.productId.trim() : "";
    if (!productId) throw new HttpsError("invalid-argument", "يجب تحديد الصنف.");

    const ref = db.collection(COLLECTIONS.PRODUCTS).doc(productId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "الصنف غير موجود.");

    const update = {};
    if (typeof data.name === "string") {
      const n = data.name.trim();
      if (n.length < 2) throw new HttpsError("invalid-argument", "اسم الصنف قصير.");
      update.name = n;
    }
    if (typeof data.sku === "string") update.sku = data.sku.trim() || null;
    if (typeof data.category === "string") update.category = data.category.trim() || null;
    if (typeof data.unit === "string") update.unit = data.unit.trim() || "قطعة";
    if (typeof data.notes === "string") update.notes = data.notes.trim() || null;
    if (data.active !== undefined) update.active = !!data.active;
    ["salePrice", "cost", "minQuantity"].forEach((k) => {
      if (data[k] !== undefined) {
        const v = Number(data[k]);
        if (!(v >= 0)) throw new HttpsError("invalid-argument", `قيمة غير صحيحة (${k}).`);
        update[k] = v;
      }
    });

    if (Object.keys(update).length === 0) throw new HttpsError("invalid-argument", "لا تغييرات.");
    update.updatedBy = request.auth.uid;
    update.updatedAt = FieldValue.serverTimestamp();
    await ref.update(update);
    return { id: productId, updated: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateProduct failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل الصنف.");
  }
});

// حذف صنف
exports.deleteProduct = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.INVENTORY);
    const data = request.data || {};
    const productId = typeof data.productId === "string" ? data.productId.trim() : "";
    if (!productId) throw new HttpsError("invalid-argument", "يجب تحديد الصنف.");
    const ref = db.collection(COLLECTIONS.PRODUCTS).doc(productId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "الصنف غير موجود.");
    await ref.delete();
    return { id: productId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteProduct failed:", err);
    throw new HttpsError("internal", "تعذّر حذف الصنف.");
  }
});

// حركة مخزون (وارد/صادر/تسوية) — تحدّث الكمية
exports.addStockMovement = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.INVENTORY);
    const data = request.data || {};
    const productId = typeof data.productId === "string" ? data.productId.trim() : "";
    if (!productId) throw new HttpsError("invalid-argument", "يجب تحديد الصنف.");
    const type = data.type;
    if (!ALL_STOCK_MOVEMENT_TYPE.includes(type)) throw new HttpsError("invalid-argument", "نوع الحركة غير صحيح.");
    const qty = Number(data.quantity);
    if (!Number.isFinite(qty) || qty <= 0) throw new HttpsError("invalid-argument", "الكمية يجب أن تكون أكبر من صفر.");

    const productRef = db.collection(COLLECTIONS.PRODUCTS).doc(productId);
    const movementRef = db.collection(COLLECTIONS.STOCK_MOVEMENTS).doc();
    const result = await db.runTransaction(async (tx) => {
      const pSnap = await tx.get(productRef);
      if (!pSnap.exists || pSnap.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "الصنف غير موجود.");
      const p = pSnap.data();
      if (p.isService) throw new HttpsError("failed-precondition", "الخدمات ليس لها مخزون.");
      const current = Number(p.quantity) || 0;

      let balanceAfter;
      if (type === "in") balanceAfter = current + qty;
      else if (type === "out") {
        if (qty > current) throw new HttpsError("failed-precondition", `الكمية المطلوبة (${qty}) أكبر من المتوفّر (${current}).`);
        balanceAfter = current - qty;
      } else { // adjust = تعيين الرصيد الفعلي
        balanceAfter = qty;
      }

      tx.update(productRef, { quantity: balanceAfter, updatedAt: FieldValue.serverTimestamp() });
      tx.set(movementRef, buildStockMovementDoc({
        tenantId: callerTenantId,
        productId: productId,
        productName: p.name,
        type: type,
        quantity: type === "adjust" ? balanceAfter : qty,
        balanceAfter: balanceAfter,
        reason: typeof data.reason === "string" ? data.reason.trim() : null,
        source: "manual",
        note: typeof data.note === "string" ? data.note.trim() : null,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      }));
      return { balanceAfter };
    });
    return { id: movementRef.id, balanceAfter: result.balanceAfter };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("addStockMovement failed:", err);
    throw new HttpsError("internal", "تعذّر تسجيل الحركة.");
  }
});

// بيانات المخزون: الأصناف + الملخّص + آخر الحركات
exports.getInventory = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.INVENTORY);
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const toMs = (ts) => (ts && ts.toMillis ? ts.toMillis() : null);

    const [productSnap, moveSnap] = await Promise.all([
      db.collection(COLLECTIONS.PRODUCTS).where("tenantId", "==", callerTenantId).get(),
      db.collection(COLLECTIONS.STOCK_MOVEMENTS).where("tenantId", "==", callerTenantId).get(),
    ]);

    const products = productSnap.docs.map((d) => {
      const p = d.data();
      const lowStock = !p.isService && (Number(p.quantity) || 0) <= (Number(p.minQuantity) || 0) && (Number(p.minQuantity) || 0) > 0;
      return { id: d.id, ...p, lowStock };
    });
    products.sort((a, b) => (b.productNumber || 0) - (a.productNumber || 0));

    const movements = moveSnap.docs.map((d) => {
      const m = d.data();
      return { id: d.id, ...m, createdAt: toMs(m.createdAt) };
    });
    movements.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const stockProducts = products.filter((p) => !p.isService);
    const totalStockValue = round2(stockProducts.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.cost) || 0), 0));
    const totalRetailValue = round2(stockProducts.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.salePrice) || 0), 0));
    const lowStockCount = products.filter((p) => p.lowStock).length;

    // الفئات
    const catMap = {};
    products.forEach((p) => { const c = p.category || "غير مصنّف"; catMap[c] = (catMap[c] || 0) + 1; });
    const categories = Object.entries(catMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    return {
      products,
      movements: movements.slice(0, 30),
      categories,
      summary: {
        totalProducts: products.length,
        serviceCount: products.filter((p) => p.isService).length,
        totalStockValue: totalStockValue,
        totalRetailValue: totalRetailValue,
        lowStockCount: lowStockCount,
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getInventory failed:", err);
    throw new HttpsError("internal", "تعذّر تحميل بيانات المخزون.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== نقاط البيع (POS) =====
// ═══════════════════════════════════════════════════════

// تنفيذ بيع: يخصم من المخزون وينشئ أمر بيع
// data: { items:[{productId, qty}], discount, paymentMethod, amountPaid, customerName }
exports.createSale = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.POS);
    const data = request.data || {};
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

    const rawItems = Array.isArray(data.items) ? data.items : [];
    if (rawItems.length === 0) throw new HttpsError("invalid-argument", "السلّة فارغة.");
    if (rawItems.length > 100) throw new HttpsError("invalid-argument", "عدد الأصناف كبير جدًا.");

    // تجميع الكميات حسب الصنف (لو تكرّر)
    const qtyByProduct = {};
    for (const it of rawItems) {
      const pid = typeof it.productId === "string" ? it.productId.trim() : "";
      const qty = Number(it.qty);
      if (!pid) throw new HttpsError("invalid-argument", "صنف غير صالح في السلّة.");
      if (!Number.isFinite(qty) || qty <= 0) throw new HttpsError("invalid-argument", "كمية غير صحيحة في السلّة.");
      qtyByProduct[pid] = (qtyByProduct[pid] || 0) + qty;
    }
    const productIds = Object.keys(qtyByProduct);

    const discount = Number(data.discount) || 0;
    if (discount < 0) throw new HttpsError("invalid-argument", "الخصم غير صحيح.");
    const paymentMethod = ALL_PAYMENT_METHOD.includes(data.paymentMethod) ? data.paymentMethod : PAYMENT_METHOD.CASH;

    // اسم الكاشير
    let cashierName = null;
    try {
      const userDoc = await db.collection(COLLECTIONS.USERS).doc(request.auth.uid).get();
      cashierName = userDoc.exists ? (userDoc.data().name || null) : null;
    } catch (e) { cashierName = null; }

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const orderRef = db.collection(COLLECTIONS.SALES_ORDERS).doc();

    const result = await db.runTransaction(async (tx) => {
      // === كل القراءات أولًا ===
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");

      const productRefs = productIds.map((id) => db.collection(COLLECTIONS.PRODUCTS).doc(id));
      const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));

      const lineItems = [];
      let subtotal = 0;
      const stockUpdates = []; // {ref, newQty, name, qty}

      for (let i = 0; i < productIds.length; i++) {
        const snap = productSnaps[i];
        const pid = productIds[i];
        const qty = qtyByProduct[pid];
        if (!snap.exists || snap.data().tenantId !== callerTenantId) throw new HttpsError("invalid-argument", "أحد الأصناف غير موجود.");
        const p = snap.data();
        if (p.active === false) throw new HttpsError("failed-precondition", `الصنف «${p.name}» غير متاح للبيع.`);

        const unitPrice = Number(p.salePrice) || 0;
        const lineTotal = round2(unitPrice * qty);
        subtotal = round2(subtotal + lineTotal);
        lineItems.push({ productId: pid, name: p.name, qty: qty, unitPrice: unitPrice, lineTotal: lineTotal, isService: !!p.isService });

        // المنتجات تُخصم من المخزون (الخدمات لا)
        if (!p.isService) {
          const current = Number(p.quantity) || 0;
          if (qty > current) throw new HttpsError("failed-precondition", `الكمية المطلوبة من «${p.name}» (${qty}) أكبر من المتوفّر (${current}).`);
          stockUpdates.push({ ref: productRefs[i], newQty: round2(current - qty), name: p.name, qty: qty });
        }
      }

      if (discount > subtotal) throw new HttpsError("invalid-argument", "الخصم أكبر من الإجمالي.");
      const taxable = round2(subtotal - discount);
      const vatAmount = round2(taxable * (POS_VAT_RATE / 100));
      const total = round2(taxable + vatAmount);
      const amountPaid = data.amountPaid != null ? Number(data.amountPaid) : total;
      if (!Number.isFinite(amountPaid) || amountPaid < 0) throw new HttpsError("invalid-argument", "المبلغ المدفوع غير صحيح.");
      const change = round2(Math.max(0, amountPaid - total));

      const nextNumber = (tenantSnap.data().lastSaleNumber || 0) + 1;

      // === كل الكتابات ===
      tx.set(orderRef, buildSalesOrderDoc({
        tenantId: callerTenantId,
        orderNumber: nextNumber,
        items: lineItems,
        subtotal: subtotal,
        discount: discount,
        vatRate: POS_VAT_RATE,
        vatAmount: vatAmount,
        total: total,
        paymentMethod: paymentMethod,
        amountPaid: amountPaid,
        change: change,
        customerName: typeof data.customerName === "string" ? data.customerName : null,
        cashierName: cashierName,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      }));
      tx.update(tenantRef, { lastSaleNumber: nextNumber });

      // خصم المخزون + حركات
      for (const su of stockUpdates) {
        tx.update(su.ref, { quantity: su.newQty, updatedAt: FieldValue.serverTimestamp() });
        const mvRef = db.collection(COLLECTIONS.STOCK_MOVEMENTS).doc();
        tx.set(mvRef, buildStockMovementDoc({
          tenantId: callerTenantId,
          productId: su.ref.id,
          productName: su.name,
          type: STOCK_MOVEMENT_TYPE.OUT,
          quantity: su.qty,
          balanceAfter: su.newQty,
          reason: `بيع #${nextNumber}`,
          source: "pos",
          note: null,
          createdBy: request.auth.uid,
          createdAt: FieldValue.serverTimestamp(),
        }));
      }

      return { orderNumber: nextNumber, total: total, change: change, vatAmount: vatAmount, subtotal: subtotal };
    });

    return { id: orderRef.id, ...result };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createSale failed:", err);
    throw new HttpsError("internal", "تعذّر إتمام البيع.");
  }
});

// بيانات POS: الأصناف المتاحة للبيع + مبيعات اليوم + الملخّص
exports.getPOSData = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.POS);
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const toMs = (ts) => (ts && ts.toMillis ? ts.toMillis() : null);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const [productSnap, orderSnap] = await Promise.all([
      db.collection(COLLECTIONS.PRODUCTS).where("tenantId", "==", callerTenantId).get(),
      db.collection(COLLECTIONS.SALES_ORDERS).where("tenantId", "==", callerTenantId).get(),
    ]);

    // الأصناف المتاحة للبيع (نشطة)
    const products = productSnap.docs
      .map((d) => {
        const p = d.data();
        return { id: d.id, name: p.name, sku: p.sku, category: p.category, unit: p.unit, salePrice: Number(p.salePrice) || 0, quantity: Number(p.quantity) || 0, isService: !!p.isService, active: p.active !== false };
      })
      .filter((p) => p.active)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const orders = orderSnap.docs.map((d) => {
      const o = d.data();
      return { id: d.id, ...o, createdAt: toMs(o.createdAt) };
    });
    orders.sort((a, b) => (b.orderNumber || 0) - (a.orderNumber || 0));

    // مبيعات اليوم
    const todayOrders = orders.filter((o) => o.createdAt && o.createdAt >= todayMs);
    const todaySales = round2(todayOrders.reduce((s, o) => s + (Number(o.total) || 0), 0));
    const todayVat = round2(todayOrders.reduce((s, o) => s + (Number(o.vatAmount) || 0), 0));

    return {
      products,
      recentOrders: orders.slice(0, 20),
      summary: {
        todayCount: todayOrders.length,
        todaySales: todaySales,
        todayVat: todayVat,
        totalOrders: orders.length,
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getPOSData failed:", err);
    throw new HttpsError("internal", "تعذّر تحميل بيانات نقاط البيع.");
  }
});

// ===== تقرير المشروع عبر فترة (عدة أشهر) =====
// data: { projectId, fromMonth, toMonth }
exports.getProjectProfitabilityRange = onCall(async (request) => {
  try {
    const callerTenantId = await requireProfitabilityView(request.auth);

    const data = request.data || {};
    const projectId = typeof data.projectId === "string" ? data.projectId.trim() : "";
    const fromMonth = typeof data.fromMonth === "string" ? data.fromMonth.trim() : "";
    const toMonth = typeof data.toMonth === "string" ? data.toMonth.trim() : "";
    if (!projectId) throw new HttpsError("invalid-argument", "يجب تحديد المشروع.");
    if (!/^\d{4}-\d{2}$/.test(fromMonth)) throw new HttpsError("invalid-argument", "شهر البداية غير صحيح (YYYY-MM).");
    if (!/^\d{4}-\d{2}$/.test(toMonth)) throw new HttpsError("invalid-argument", "شهر النهاية غير صحيح (YYYY-MM).");
    if (fromMonth > toMonth) throw new HttpsError("invalid-argument", "شهر البداية يجب أن يسبق شهر النهاية.");

    const months = enumerateMonths(fromMonth, toMonth);
    if (months.length === 0) throw new HttpsError("invalid-argument", "نطاق الأشهر غير صحيح.");
    if (months.length > 24) throw new HttpsError("invalid-argument", "النطاق كبير جدًا (24 شهرًا كحدّ أقصى).");

    const projectDoc = await db.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
    if (!projectDoc.exists || projectDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المشروع غير صحيح.");
    }
    const project = projectDoc.data();

    const tenantDoc = await db.collection(COLLECTIONS.TENANTS).doc(callerTenantId).get();
    const adminCostPerWorker = tenantDoc.exists ? (Number(tenantDoc.data().adminCostPerWorker) || 0) : 0;

    const monthsData = [];
    let tRevenue = 0, tNetRevenue = 0, tCost = 0, tProfit = 0;

    for (const m of months) {
      const core = await computeProjectMonthCore(callerTenantId, projectId, m, adminCostPerWorker);
      monthsData.push({
        month: m,
        workersCount: core.workersCount,
        revenue: core.totals.revenue,
        netRevenue: core.totals.netRevenue,
        cost: core.totals.cost,
        profit: core.totals.profit,
        margin: core.totals.margin,
      });
      tRevenue += core.totals.revenue;
      tNetRevenue += core.totals.netRevenue;
      tCost += core.totals.cost;
      tProfit += core.totals.profit;
    }

    const r = (n) => Math.round(n * 100) / 100;
    const tMargin = tNetRevenue > 0 ? (tProfit / tNetRevenue) * 100 : 0;
    const activeMonths = monthsData.filter((m) => m.workersCount > 0).length;

    return {
      projectId: projectId,
      projectName: project.name || null,
      projectNumber: project.projectNumber || null,
      fromMonth: fromMonth,
      toMonth: toMonth,
      monthsCount: months.length,
      activeMonths: activeMonths,
      months: monthsData,
      totals: {
        revenue: r(tRevenue),
        netRevenue: r(tNetRevenue),
        cost: r(tCost),
        profit: r(tProfit),
        margin: r(tMargin),
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getProjectProfitabilityRange failed:", err);
    throw new HttpsError("internal", "تعذّر حساب ربحية الفترة.");
  }
});

// ===== تقرير العامل: ربحيته عبر كل مشاريعه في شهر =====
// data: { workerUid, month }
exports.getWorkerProfitabilityByMonth = onCall(async (request) => {
  try {
    const callerTenantId = await requireProfitabilityView(request.auth);

    const data = request.data || {};
    const workerUid = typeof data.workerUid === "string" ? data.workerUid.trim() : "";
    const month = typeof data.month === "string" ? data.month.trim() : "";
    if (!workerUid) throw new HttpsError("invalid-argument", "يجب تحديد العامل.");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpsError("invalid-argument", "الشهر غير صحيح (YYYY-MM).");

    const wDoc = await db.collection(COLLECTIONS.USERS).doc(workerUid).get();
    if (!wDoc.exists || wDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "العامل غير صحيح.");
    }
    const worker = wDoc.data();

    const tenantDoc = await db.collection(COLLECTIONS.TENANTS).doc(callerTenantId).get();
    const adminCostPerWorker = tenantDoc.exists ? (Number(tenantDoc.data().adminCostPerWorker) || 0) : 0;

    const daysInfo = buildMonthDaysInfo(month);

    // كل إسنادات العامل النشطة
    const assignSnap = await db.collection(COLLECTIONS.WORKER_ASSIGNMENTS)
      .where("tenantId", "==", callerTenantId)
      .where("workerUid", "==", workerUid)
      .where("status", "==", ASSIGNMENT_STATUS.ACTIVE)
      .get();

    const lines = [];
    let tRevenue = 0, tNetRevenue = 0, tCost = 0, tProfit = 0;

    for (const aDoc of assignSnap.docs) {
      const line = await buildAssignmentProfitLine(callerTenantId, aDoc, month, daysInfo, adminCostPerWorker);
      if (!line) continue;
      lines.push(line);
      if (!line.missingCost) {
        tRevenue += line.revenueProrated;
        tNetRevenue += line.netRevenue;
        tCost += line.actualCost;
        tProfit += line.profit;
      }
    }

    const r = (n) => Math.round(n * 100) / 100;
    const tMargin = tNetRevenue > 0 ? (tProfit / tNetRevenue) * 100 : 0;

    return {
      workerUid: workerUid,
      workerName: worker.name || null,
      workerJobTitle: worker.jobTitleName || null,
      month: month,
      assignmentsCount: lines.filter((l) => !l.missingCost).length,
      missingCost: lines.some((l) => l.missingCost),
      adminCostPerWorker: r(adminCostPerWorker),
      lines: lines,
      totals: {
        revenue: r(tRevenue),
        netRevenue: r(tNetRevenue),
        cost: r(tCost),
        profit: r(tProfit),
        margin: r(tMargin),
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getWorkerProfitabilityByMonth failed:", err);
    throw new HttpsError("internal", "تعذّر حساب ربحية العامل.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== التوزيع الزمني للموارد المشتركة =====
// ═══════════════════════════════════════════════════════

// التحقّق من صلاحية عرض الموارد المشتركة (عمليات/مشاريع/مالية/مالك)
async function requireSharedView(auth) {
  if (!auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
  const tid = auth.token.tenantId;
  if (!tid) throw new HttpsError("failed-precondition", "حسابك غير مرتبط بشركة.");
  if (auth.token.role !== ROLES.OWNER) {
    const d = await db.collection(COLLECTIONS.USERS).doc(auth.uid).get();
    const perms = d.exists ? (d.data().permissions || []) : [];
    if (!perms.includes(MODULES.OPERATIONS) && !perms.includes(MODULES.PROJECTS) && !perms.includes(MODULES.FINANCE)) {
      throw new HttpsError("permission-denied", "تحتاج صلاحية العمليات أو المشاريع أو المالية.");
    }
  }
  return tid;
}

// كشف العمّال المشتركين: إسنادات نشطة متعددة متداخلة مع الشهر عبر مشاريع مختلفة
async function detectSharedWorkers(callerTenantId, month, daysInfo) {
  const { monthStart, monthEnd } = daysInfo;
  const assignSnap = await db.collection(COLLECTIONS.WORKER_ASSIGNMENTS)
    .where("tenantId", "==", callerTenantId)
    .where("status", "==", ASSIGNMENT_STATUS.ACTIVE)
    .get();

  const byWorker = new Map();
  for (const aDoc of assignSnap.docs) {
    const a = aDoc.data();
    const aStart = a.startDate || "0000-01-01";
    const aEnd = a.endDate || "9999-12-31";
    if (!(aStart <= monthEnd && monthStart <= aEnd)) continue;  // لا تداخل مع الشهر
    if (!byWorker.has(a.workerUid)) {
      byWorker.set(a.workerUid, { workerUid: a.workerUid, workerName: a.workerName || null, assignments: [] });
    }
    byWorker.get(a.workerUid).assignments.push({
      assignmentId: aDoc.id,
      projectId: a.projectId || null,
      projectName: a.projectName || null,
      projectNumber: a.projectNumber || null,
      rentalPrice: a.rentalPrice,
      rentalPeriod: a.rentalPeriod,
      startDate: a.startDate || null,
      endDate: a.endDate || null,
    });
  }

  // فقط العمّال ذوو إسنادين فأكثر في مشاريع مختلفة
  const shared = [];
  for (const entry of byWorker.values()) {
    const distinctProjects = new Set(entry.assignments.map((x) => x.projectId));
    if (entry.assignments.length >= 2 && distinctProjects.size >= 2) {
      shared.push(entry);
    }
  }
  return shared;
}

// قائمة الموارد المشتركة في شهر + حالة توزيع كل عامل
// data: { month }
exports.getSharedResources = onCall(async (request) => {
  try {
    const callerTenantId = await requireSharedView(request.auth);
    const data = request.data || {};
    const month = typeof data.month === "string" ? data.month.trim() : "";
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpsError("invalid-argument", "الشهر غير صحيح (YYYY-MM).");

    const daysInfo = buildMonthDaysInfo(month);
    const shared = await detectSharedWorkers(callerTenantId, month, daysInfo);

    const workers = [];
    for (const entry of shared) {
      const docId = `${entry.workerUid}_${month}`;
      const allocDoc = await db.collection(SHARED_ALLOCATIONS_COLLECTION).doc(docId).get();
      const status = allocDoc.exists ? (allocDoc.data().status || null) : null;
      workers.push({
        workerUid: entry.workerUid,
        workerName: entry.workerName,
        projectsCount: new Set(entry.assignments.map((a) => a.projectId)).size,
        assignmentsCount: entry.assignments.length,
        projects: entry.assignments.map((a) => ({ projectName: a.projectName, projectNumber: a.projectNumber })),
        allocationStatus: status,  // null = لم يُوزّع بعد
      });
    }

    return { month: month, count: workers.length, workers: workers };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getSharedResources failed:", err);
    throw new HttpsError("internal", "تعذّر جلب الموارد المشتركة.");
  }
});

// جلب توزيع عامل لشهر (المحفوظ أو افتراضي) + تكلفته + حساب مبدئي
// data: { workerUid, month }
exports.getSharedAllocation = onCall(async (request) => {
  try {
    const callerTenantId = await requireSharedView(request.auth);
    const data = request.data || {};
    const workerUid = typeof data.workerUid === "string" ? data.workerUid.trim() : "";
    const month = typeof data.month === "string" ? data.month.trim() : "";
    if (!workerUid) throw new HttpsError("invalid-argument", "يجب تحديد العامل.");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpsError("invalid-argument", "الشهر غير صحيح (YYYY-MM).");

    const wDoc = await db.collection(COLLECTIONS.USERS).doc(workerUid).get();
    if (!wDoc.exists || wDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "العامل غير صحيح.");
    }
    const worker = wDoc.data();
    const costBase = worker.costBase || null;
    if (!costBase || !(Number(costBase.basicSalary) > 0)) {
      throw new HttpsError("failed-precondition", "العامل بلا تكلفة محددة. حدّد تكلفته من الموارد البشرية أولاً.");
    }

    const monthly = computeWorkerMonthlyCost(costBase);
    const tenantDoc = await db.collection(COLLECTIONS.TENANTS).doc(callerTenantId).get();
    const adminCostPerWorker = tenantDoc.exists ? (Number(tenantDoc.data().adminCostPerWorker) || 0) : 0;
    const isAdmin = worker.role === ROLES.STAFF || worker.role === ROLES.OWNER;
    const adminShare = isAdmin ? 0 : adminCostPerWorker;
    const monthlyVariable = monthly.monthlyVariable;
    const monthlyFixed = monthly.monthlyFixed + adminShare;
    const wd = Number(costBase.workDaysPerMonth) > 0 ? Number(costBase.workDaysPerMonth) : 26;
    const wh = Number(costBase.workHoursPerDay) > 0 ? Number(costBase.workHoursPerDay) : 8;

    // الإسنادات النشطة المتداخلة
    const daysInfo = buildMonthDaysInfo(month);
    const assignSnap = await db.collection(COLLECTIONS.WORKER_ASSIGNMENTS)
      .where("tenantId", "==", callerTenantId)
      .where("workerUid", "==", workerUid)
      .where("status", "==", ASSIGNMENT_STATUS.ACTIVE)
      .get();

    const assignments = [];
    for (const aDoc of assignSnap.docs) {
      const a = aDoc.data();
      const aStart = a.startDate || "0000-01-01";
      const aEnd = a.endDate || "9999-12-31";
      if (!(aStart <= daysInfo.monthEnd && daysInfo.monthStart <= aEnd)) continue;
      assignments.push({
        assignmentId: aDoc.id,
        projectId: a.projectId || null,
        projectName: a.projectName || null,
        projectNumber: a.projectNumber || null,
        rentalPrice: a.rentalPrice,
        rentalPeriod: a.rentalPeriod,
        revenueMonthly: normalizeRentalToMonthly(a.rentalPrice, a.rentalPeriod, wd, wh),
      });
    }

    // التوزيع المحفوظ (إن وُجد)
    const docId = `${workerUid}_${month}`;
    const allocDoc = await db.collection(SHARED_ALLOCATIONS_COLLECTION).doc(docId).get();
    const saved = allocDoc.exists ? allocDoc.data() : null;

    // بناء البنود: دمج المحفوظ مع الإسنادات الحالية، أو افتراضي
    const savedItems = saved && Array.isArray(saved.items) ? saved.items : [];
    const items = assignments.map((asn) => {
      const m = savedItems.find((s) => s.assignmentId === asn.assignmentId);
      return {
        ...asn,
        regularDays: m ? Number(m.regularDays) || 0 : 0,
        overtimeHours: m ? Number(m.overtimeHours) || 0 : 0,
        fixedShareRatio: m ? Number(m.fixedShareRatio) || 0 : 1,  // افتراضي بالتساوي
      };
    });

    const computed = computeSharedAllocation({
      monthlyVariable: monthlyVariable,
      monthlyFixed: monthlyFixed,
      workDaysPerMonth: wd,
      workHoursPerDay: wh,
      items: items,
    });

    const r = (n) => Math.round(n * 100) / 100;
    return {
      workerUid: workerUid,
      workerName: worker.name || null,
      workerJobTitle: worker.jobTitleName || null,
      month: month,
      monthlyVariable: r(monthlyVariable),
      monthlyFixed: r(monthlyFixed),
      workDaysPerMonth: wd,
      workHoursPerDay: wh,
      adminCostPerWorker: r(adminCostPerWorker),
      assignmentsCount: assignments.length,
      status: saved ? (saved.status || null) : null,
      rejectionReason: saved ? (saved.rejectionReason || null) : null,
      computed: computed,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getSharedAllocation failed:", err);
    throw new HttpsError("internal", "تعذّر جلب التوزيع.");
  }
});

// حفظ توزيع عامل (العمليات تُدخل/تعدّل) — مسودة أو إرسال للمالية
// data: { workerUid, month, items:[{assignmentId, regularDays, overtimeHours, fixedShareRatio}], submit }
exports.saveSharedAllocation = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.OPERATIONS);
    const data = request.data || {};
    const workerUid = typeof data.workerUid === "string" ? data.workerUid.trim() : "";
    const month = typeof data.month === "string" ? data.month.trim() : "";
    const submit = !!data.submit;
    const items = Array.isArray(data.items) ? data.items : [];
    if (!workerUid) throw new HttpsError("invalid-argument", "يجب تحديد العامل.");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpsError("invalid-argument", "الشهر غير صحيح (YYYY-MM).");
    if (items.length === 0) throw new HttpsError("invalid-argument", "لا توجد بنود توزيع.");

    const wDoc = await db.collection(COLLECTIONS.USERS).doc(workerUid).get();
    if (!wDoc.exists || wDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "العامل غير صحيح.");
    }

    // التحقّق من البنود وأنها تخصّ إسنادات هذا العامل
    const assignSnap = await db.collection(COLLECTIONS.WORKER_ASSIGNMENTS)
      .where("tenantId", "==", callerTenantId)
      .where("workerUid", "==", workerUid)
      .where("status", "==", ASSIGNMENT_STATUS.ACTIVE)
      .get();
    const validIds = new Set(assignSnap.docs.map((d) => d.id));
    const assignById = new Map(assignSnap.docs.map((d) => [d.id, d.data()]));

    for (const it of items) {
      if (!validIds.has(it.assignmentId)) {
        throw new HttpsError("invalid-argument", "بند توزيع لإسناد غير صحيح.");
      }
      const rd = Number(it.regularDays);
      const oh = Number(it.overtimeHours);
      const fr = Number(it.fixedShareRatio);
      if (!Number.isFinite(rd) || rd < 0 || rd > 31) throw new HttpsError("invalid-argument", "أيام العمل غير صحيحة (0-31).");
      if (!Number.isFinite(oh) || oh < 0 || oh > 744) throw new HttpsError("invalid-argument", "ساعات الأوفرتايم غير صحيحة.");
      if (!Number.isFinite(fr) || fr < 0) throw new HttpsError("invalid-argument", "نسبة الثابت غير صحيحة.");
    }
    if (items.every((it) => (Number(it.fixedShareRatio) || 0) === 0)) {
      throw new HttpsError("invalid-argument", "يجب تحديد نسبة توزيع الثابت لمشروع واحد على الأقل.");
    }

    // إثراء البنود ببيانات المشروع (لقطة)
    const enriched = items.map((it) => {
      const a = assignById.get(it.assignmentId) || {};
      return {
        assignmentId: it.assignmentId,
        projectId: a.projectId || null,
        projectName: a.projectName || null,
        projectNumber: a.projectNumber || null,
        regularDays: Number(it.regularDays) || 0,
        overtimeHours: Number(it.overtimeHours) || 0,
        fixedShareRatio: Number(it.fixedShareRatio) || 0,
      };
    });

    const docId = `${workerUid}_${month}`;
    const ref = db.collection(SHARED_ALLOCATIONS_COLLECTION).doc(docId);
    const existing = await ref.get();
    const status = submit ? ALLOCATION_STATUS.PENDING_FINANCE : ALLOCATION_STATUS.DRAFT;

    await ref.set(buildSharedAllocationDoc({
      tenantId: callerTenantId,
      workerUid: workerUid,
      workerName: wDoc.data().name || null,
      month: month,
      items: enriched,
      status: status,
      rejectionReason: null,  // مسح أي رفض سابق عند إعادة الإدخال/الإرسال
      createdBy: existing.exists ? (existing.data().createdBy || request.auth.uid) : request.auth.uid,
      updatedBy: request.auth.uid,
      updatedAt: FieldValue.serverTimestamp(),
      approvedBy: null,
      approvedAt: null,
    }));

    return { id: docId, status: status };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("saveSharedAllocation failed:", err);
    throw new HttpsError("internal", "تعذّر حفظ التوزيع.");
  }
});

// اعتماد/رفض/إعادة فتح توزيع (المالية)
// data: { workerUid, month, action: "approve"|"reject"|"reopen", rejectionReason }
exports.setSharedAllocationStatus = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);
    const data = request.data || {};
    const workerUid = typeof data.workerUid === "string" ? data.workerUid.trim() : "";
    const month = typeof data.month === "string" ? data.month.trim() : "";
    const action = typeof data.action === "string" ? data.action.trim() : "";
    if (!workerUid) throw new HttpsError("invalid-argument", "يجب تحديد العامل.");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpsError("invalid-argument", "الشهر غير صحيح (YYYY-MM).");

    const docId = `${workerUid}_${month}`;
    const ref = db.collection(SHARED_ALLOCATIONS_COLLECTION).doc(docId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "التوزيع غير موجود.");
    }

    let update;
    if (action === "approve") {
      update = { status: ALLOCATION_STATUS.APPROVED, approvedBy: request.auth.uid, approvedAt: FieldValue.serverTimestamp(), rejectionReason: null };
    } else if (action === "reject") {
      const reason = typeof data.rejectionReason === "string" ? data.rejectionReason.trim() : "";
      if (!reason) throw new HttpsError("invalid-argument", "يجب ذكر سبب الرفض.");
      update = { status: ALLOCATION_STATUS.REJECTED, rejectionReason: reason, approvedBy: null, approvedAt: null };
    } else if (action === "reopen") {
      update = { status: ALLOCATION_STATUS.DRAFT, approvedBy: null, approvedAt: null, rejectionReason: null };
    } else {
      throw new HttpsError("invalid-argument", "إجراء غير صحيح.");
    }
    update.updatedBy = request.auth.uid;
    update.updatedAt = FieldValue.serverTimestamp();

    await ref.update(update);
    return { id: docId, status: update.status };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("setSharedAllocationStatus failed:", err);
    throw new HttpsError("internal", "تعذّر تحديث حالة التوزيع.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== قسم الأصول (سكن/مركبات/معدات) + مصاريفها =====
// ═══════════════════════════════════════════════════════
const {
  ASSET_TYPES,
  ALL_ASSET_TYPES,
  ASSET_STATUS,
  ALL_ASSET_STATUS,
  ALL_ASSET_EXPENSE_TYPES,
  ASSET_EXPENSE_TYPES,
  buildAssetDoc,
  buildAssetExpenseDoc,
} = require("./schema");

// إنشاء أصل (رقم تسلسلي عبر معاملة)
// استخراج حقول الملكية/التمويل/الإهلاك/الأشخاص (مشترك بين الإنشاء والتعديل)
function extractAssetFields(data) {
  return {
    ownership: data.ownership === "owned" ? "owned" : "rented",
    paymentMethod: data.paymentMethod === "financed" ? "financed" : "cash",
    itemValue: Number(data.itemValue) || 0,
    taxAmount: Number(data.taxAmount) || 0,
    downPayment: Number(data.downPayment) || 0,
    financeMonths: Number(data.financeMonths) || 0,
    apr: Number(data.apr) || 0,
    usefulLifeYears: Number(data.usefulLifeYears) || 0,
    salvageValue: Number(data.salvageValue) || 0,
    purchaseDate: typeof data.purchaseDate === "string" && isValidDate(data.purchaseDate) ? data.purchaseDate : null,
    supervisorName: typeof data.supervisorName === "string" ? data.supervisorName.trim() : "",
    custodianName: typeof data.custodianName === "string" ? data.custodianName.trim() : "",
  };
}

exports.createAsset = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.ASSETS);
    const data = request.data || {};
    const type = typeof data.type === "string" ? data.type.trim() : "";
    const typeName = typeof data.typeName === "string" ? data.typeName.trim() : "";
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const location = typeof data.location === "string" ? data.location.trim() : "";
    const capacity = Number(data.capacity) || 0;
    const monthlyRent = Number(data.monthlyRent) || 0;
    const notes = typeof data.notes === "string" ? data.notes.trim() : "";

    if (name.length < 2) throw new HttpsError("invalid-argument", "اسم الأصل مطلوب (حرفان على الأقل).");
    if (!ALL_ASSET_TYPES.includes(type)) throw new HttpsError("invalid-argument", "نوع الأصل غير صحيح.");
    if (type === ASSET_TYPES.OTHER && !typeName) throw new HttpsError("invalid-argument", "حدّد اسم النوع المخصّص.");
    if (capacity < 0) throw new HttpsError("invalid-argument", "السعة غير صحيحة.");
    if (monthlyRent < 0) throw new HttpsError("invalid-argument", "الإيجار غير صحيح.");

    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const assetRef = db.collection(COLLECTIONS.ASSETS).doc();
    const result = await db.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new HttpsError("failed-precondition", "الشركة غير موجودة.");
      const nextNumber = (tenantSnap.data().lastAssetNumber || 0) + 1;
      const assetDoc = buildAssetDoc({
        tenantId: callerTenantId,
        assetNumber: nextNumber,
        type: type,
        typeName: type === ASSET_TYPES.OTHER ? typeName : null,
        name: name,
        location: location,
        capacity: capacity,
        monthlyRent: monthlyRent,
        notes: notes,
        beneficiaries: [],
        status: ASSET_STATUS.ACTIVE,
        ...extractAssetFields(data),
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(assetRef, assetDoc);
      tx.update(tenantRef, { lastAssetNumber: nextNumber });
      return { assetNumber: nextNumber };
    });
    return { id: assetRef.id, assetNumber: result.assetNumber, name: name };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("createAsset failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء الأصل.");
  }
});

// تعديل أصل
exports.updateAsset = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.ASSETS);
    const data = request.data || {};
    const assetId = typeof data.assetId === "string" ? data.assetId.trim() : "";
    if (!assetId) throw new HttpsError("invalid-argument", "يجب تحديد الأصل.");

    const ref = db.collection(COLLECTIONS.ASSETS).doc(assetId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الأصل غير موجود.");
    }

    const update = {};
    if (typeof data.name === "string") {
      const n = data.name.trim();
      if (n.length < 2) throw new HttpsError("invalid-argument", "اسم الأصل قصير.");
      update.name = n;
    }
    if (typeof data.type === "string") {
      if (!ALL_ASSET_TYPES.includes(data.type)) throw new HttpsError("invalid-argument", "نوع غير صحيح.");
      update.type = data.type;
      update.typeName = data.type === ASSET_TYPES.OTHER ? (typeof data.typeName === "string" ? data.typeName.trim() : null) : null;
    }
    if (typeof data.location === "string") update.location = data.location.trim() || null;
    if (data.capacity !== undefined) {
      const c = Number(data.capacity);
      if (!(c >= 0)) throw new HttpsError("invalid-argument", "السعة غير صحيحة.");
      update.capacity = c;
    }
    if (data.monthlyRent !== undefined) {
      const m = Number(data.monthlyRent);
      if (!(m >= 0)) throw new HttpsError("invalid-argument", "الإيجار غير صحيح.");
      update.monthlyRent = m;
    }
    if (typeof data.notes === "string") update.notes = data.notes.trim() || null;
    if (typeof data.status === "string") {
      if (!ALL_ASSET_STATUS.includes(data.status)) throw new HttpsError("invalid-argument", "الحالة غير صحيحة.");
      update.status = data.status;
    }

    // إن أُرسلت حقول الملكية، أعد حساب كل الحقول المالية والإهلاك والأشخاص
    if (data.ownership !== undefined) {
      const ex = extractAssetFields(data);
      const cur = doc.data();
      const rebuilt = buildAssetDoc({
        tenantId: callerTenantId,
        assetNumber: cur.assetNumber,
        type: update.type || cur.type,
        typeName: update.typeName !== undefined ? update.typeName : cur.typeName,
        name: update.name || cur.name,
        location: update.location !== undefined ? update.location : cur.location,
        capacity: update.capacity !== undefined ? update.capacity : cur.capacity,
        monthlyRent: update.monthlyRent !== undefined ? update.monthlyRent : cur.monthlyRent,
        status: update.status || cur.status,
        notes: update.notes !== undefined ? update.notes : cur.notes,
        beneficiaries: cur.beneficiaries,
        ...ex,
        createdBy: cur.createdBy, createdAt: cur.createdAt,
      });
      const financialKeys = ["ownership", "paymentMethod", "itemValue", "taxAmount", "totalWithTax", "downPayment", "financeMonths", "apr", "financedAmount", "monthlyInstallment", "totalInterest", "totalAmount", "flatRate", "purchaseValue", "usefulLifeYears", "salvageValue", "purchaseDate", "supervisorName", "custodianName"];
      for (const k of financialKeys) update[k] = rebuilt[k];
    }

    if (Object.keys(update).length === 0) throw new HttpsError("invalid-argument", "لا تغييرات.");
    update.updatedBy = request.auth.uid;
    update.updatedAt = FieldValue.serverTimestamp();
    await ref.update(update);
    return { id: assetId, updated: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("updateAsset failed:", err);
    throw new HttpsError("internal", "تعذّر تعديل الأصل.");
  }
});

// ===== حساب الإهلاك واسترداد رأس المال (للأصول المملوكة) =====
exports.getDepreciation = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.ASSETS);
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const snap = await db.collection(COLLECTIONS.ASSETS)
      .where("tenantId", "==", callerTenantId).where("ownership", "==", "owned").get();

    const now = new Date();
    const catLabels = { vehicle: "المركبات", housing: "الإسكان", equipment: "المعدّات", simple: "أصول بسيطة", other: "أخرى" };
    const assets = [];
    const catMap = {};
    let totalCost = 0, totalBook = 0, totalAnnual = 0, totalAccum = 0;

    snap.docs.forEach((d) => {
      const a = d.data();
      const cost = Number(a.purchaseValue) || 0;
      const salvage = Number(a.salvageValue) || 0;
      const life = Number(a.usefulLifeYears) || 0;
      if (cost <= 0 || life <= 0) return; // غير قابل للإهلاك (ناقص بيانات)
      const depreciable = Math.max(0, cost - salvage);
      const annual = round2(depreciable / life);
      let elapsedYears = 0;
      if (a.purchaseDate) {
        const pd = new Date(a.purchaseDate);
        if (!isNaN(pd.getTime())) elapsedYears = Math.max(0, (now - pd) / (365.25 * 24 * 3600 * 1000));
      }
      const accum = round2(Math.min(depreciable, annual * elapsedYears));
      const book = round2(cost - accum);
      const recovered = cost > 0 ? round2((accum / cost) * 100) : 0;
      assets.push({
        id: d.id, name: a.name || "—", cat: catLabels[a.type] || a.typeName || "أخرى",
        cost: round2(cost), life, annual, book, recovered,
      });
      catMap[a.type] = (catMap[a.type] || 0) + annual;
      totalCost += cost; totalBook += book; totalAccum += accum;
      if (elapsedYears < life) totalAnnual += annual; // إهلاك العام (للأصول التي لم ينتهِ عمرها)
    });

    const categories = Object.entries(catMap).map(([type, value]) => ({
      name: catLabels[type] || "أخرى", value: round2(value), type,
    })).sort((a, b) => b.value - a.value);

    return {
      kpis: {
        totalCost: round2(totalCost), totalBook: round2(totalBook),
        annualDep: round2(totalAnnual),
        recoveryRate: totalCost > 0 ? round2((totalAccum / totalCost) * 100) : 0,
      },
      categories,
      assets: assets.sort((a, b) => b.cost - a.cost),
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getDepreciation failed:", err);
    throw new HttpsError("internal", "تعذّر حساب الإهلاك، حاول مرة أخرى.");
  }
});

// تعيين مستفيدي أصل (الساكنون/المستخدمون)
exports.setAssetBeneficiaries = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.ASSETS);
    const data = request.data || {};
    const assetId = typeof data.assetId === "string" ? data.assetId.trim() : "";
    const beneficiaries = Array.isArray(data.beneficiaries) ? data.beneficiaries.filter((x) => typeof x === "string") : [];
    if (!assetId) throw new HttpsError("invalid-argument", "يجب تحديد الأصل.");

    const ref = db.collection(COLLECTIONS.ASSETS).doc(assetId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الأصل غير موجود.");
    }

    const uniq = [...new Set(beneficiaries)];
    // تحقّق أن كل مستفيد ينتمي للشركة
    for (const uid of uniq) {
      const u = await db.collection(COLLECTIONS.USERS).doc(uid).get();
      if (!u.exists || u.data().tenantId !== callerTenantId) {
        throw new HttpsError("invalid-argument", "أحد المستفيدين غير صحيح.");
      }
    }
    // تحقّق السعة
    const cap = Number(doc.data().capacity) || 0;
    if (cap > 0 && uniq.length > cap) {
      throw new HttpsError("failed-precondition", `عدد المستفيدين (${uniq.length}) يتجاوز سعة الأصل (${cap}).`);
    }

    await ref.update({ beneficiaries: uniq, updatedBy: request.auth.uid, updatedAt: FieldValue.serverTimestamp() });
    return { id: assetId, count: uniq.length };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("setAssetBeneficiaries failed:", err);
    throw new HttpsError("internal", "تعذّر تحديث المستفيدين.");
  }
});

// حذف أصل (مع مصاريفه)
exports.deleteAsset = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.ASSETS);
    const data = request.data || {};
    const assetId = typeof data.assetId === "string" ? data.assetId.trim() : "";
    if (!assetId) throw new HttpsError("invalid-argument", "يجب تحديد الأصل.");

    const ref = db.collection(COLLECTIONS.ASSETS).doc(assetId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الأصل غير موجود.");
    }

    const expSnap = await db.collection(COLLECTIONS.ASSET_EXPENSES)
      .where("tenantId", "==", callerTenantId)
      .where("assetId", "==", assetId)
      .get();
    const batch = db.batch();
    expSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();
    return { id: assetId, deleted: true, expensesDeleted: expSnap.size };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteAsset failed:", err);
    throw new HttpsError("internal", "تعذّر حذف الأصل.");
  }
});

// إضافة مصروف/فاتورة على أصل لشهر
exports.addAssetExpense = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.ASSETS);
    const data = request.data || {};
    const assetId = typeof data.assetId === "string" ? data.assetId.trim() : "";
    const month = typeof data.month === "string" ? data.month.trim() : "";
    const expenseType = typeof data.expenseType === "string" ? data.expenseType.trim() : "";
    const expenseTypeName = typeof data.expenseTypeName === "string" ? data.expenseTypeName.trim() : "";
    const amount = Number(data.amount) || 0;
    const description = typeof data.description === "string" ? data.description.trim() : "";
    const expenseDate = typeof data.expenseDate === "string" ? data.expenseDate.trim() : "";

    if (!assetId) throw new HttpsError("invalid-argument", "يجب تحديد الأصل.");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpsError("invalid-argument", "الشهر غير صحيح (YYYY-MM).");
    if (!ALL_ASSET_EXPENSE_TYPES.includes(expenseType)) throw new HttpsError("invalid-argument", "نوع المصروف غير صحيح.");
    if (expenseType === ASSET_EXPENSE_TYPES.OTHER && !expenseTypeName) throw new HttpsError("invalid-argument", "حدّد اسم نوع المصروف.");
    if (!(amount > 0)) throw new HttpsError("invalid-argument", "مبلغ المصروف غير صحيح.");
    if (expenseDate && !isValidDate(expenseDate)) throw new HttpsError("invalid-argument", "تاريخ الفاتورة غير صحيح.");

    const assetDoc = await db.collection(COLLECTIONS.ASSETS).doc(assetId).get();
    if (!assetDoc.exists || assetDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الأصل غير موجود.");
    }

    const expRef = db.collection(COLLECTIONS.ASSET_EXPENSES).doc();
    await expRef.set(buildAssetExpenseDoc({
      tenantId: callerTenantId,
      assetId: assetId,
      assetName: assetDoc.data().name || null,
      month: month,
      expenseType: expenseType,
      expenseTypeName: expenseType === ASSET_EXPENSE_TYPES.OTHER ? expenseTypeName : null,
      amount: amount,
      description: description,
      expenseDate: expenseDate || null,
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    }));
    return { id: expRef.id, amount: amount };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("addAssetExpense failed:", err);
    throw new HttpsError("internal", "تعذّر إضافة المصروف.");
  }
});

// حذف مصروف
exports.deleteAssetExpense = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.ASSETS);
    const data = request.data || {};
    const expenseId = typeof data.expenseId === "string" ? data.expenseId.trim() : "";
    if (!expenseId) throw new HttpsError("invalid-argument", "يجب تحديد المصروف.");

    const ref = db.collection(COLLECTIONS.ASSET_EXPENSES).doc(expenseId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المصروف غير موجود.");
    }
    await ref.delete();
    return { id: expenseId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteAssetExpense failed:", err);
    throw new HttpsError("internal", "تعذّر حذف المصروف.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== الموافقة المالية الشاملة على المشاريع =====
// ═══════════════════════════════════════════════════════
const {
  FINANCE_APPROVAL_STATUS,
  APPROVAL_SCOPE,
  buildFinanceApprovalDoc,
} = require("./schema");

// مراجعة مالية لمشروع: ربحية الشهر الكاملة + ربحية الفترة + حالات الموافقة + حالة المشروع
// data: { projectId, month, fromMonth, toMonth }
exports.getProjectFinanceReview = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);
    const data = request.data || {};
    const projectId = typeof data.projectId === "string" ? data.projectId.trim() : "";
    const month = typeof data.month === "string" ? data.month.trim() : "";
    const fromMonth = typeof data.fromMonth === "string" ? data.fromMonth.trim() : "";
    const toMonth = typeof data.toMonth === "string" ? data.toMonth.trim() : "";
    if (!projectId) throw new HttpsError("invalid-argument", "يجب تحديد المشروع.");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpsError("invalid-argument", "الشهر غير صحيح (YYYY-MM).");
    if (!/^\d{4}-\d{2}$/.test(fromMonth) || !/^\d{4}-\d{2}$/.test(toMonth)) throw new HttpsError("invalid-argument", "نطاق الفترة غير صحيح.");
    if (fromMonth > toMonth) throw new HttpsError("invalid-argument", "بداية الفترة بعد نهايتها.");

    const projDoc = await db.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
    if (!projDoc.exists || projDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المشروع غير موجود.");
    }
    const project = projDoc.data();

    const tenantDoc = await db.collection(COLLECTIONS.TENANTS).doc(callerTenantId).get();
    const adminCostPerWorker = tenantDoc.exists ? (Number(tenantDoc.data().adminCostPerWorker) || 0) : 0;

    // ربحية الشهر المحدّد (كاملة: عمالة + أصول)
    const monthCore = await computeProjectMonthCore(callerTenantId, projectId, month, adminCostPerWorker);

    // ربحية الفترة (شهرًا شهرًا)
    const months = enumerateMonths(fromMonth, toMonth);
    const monthlyResults = [];
    let pR = 0, pNR = 0, pC = 0, pP = 0;
    for (const m of months) {
      const core = await computeProjectMonthCore(callerTenantId, projectId, m, adminCostPerWorker);
      const apprSnap = await db.collection(COLLECTIONS.FINANCE_APPROVALS).doc(`${projectId}_${m}`).get();
      const appr = apprSnap.exists ? apprSnap.data() : null;
      monthlyResults.push({
        month: m,
        workersCount: core.workersCount,
        revenue: core.totals.revenue,
        netRevenue: core.totals.netRevenue,
        cost: core.totals.cost,
        profit: core.totals.profit,
        margin: core.totals.margin,
        approvalStatus: appr ? appr.status : null,
        rejectionReason: appr ? appr.rejectionReason : null,
      });
      pR += core.totals.revenue; pNR += core.totals.netRevenue; pC += core.totals.cost; pP += core.totals.profit;
    }
    const r = (n) => Math.round(n * 100) / 100;
    const pMargin = pNR > 0 ? r((pP / pNR) * 100) : 0;

    // حالات الموافقة (الشهر المحدّد + الإجمالية)
    const monthApprSnap = await db.collection(COLLECTIONS.FINANCE_APPROVALS).doc(`${projectId}_${month}`).get();
    const overallApprSnap = await db.collection(COLLECTIONS.FINANCE_APPROVALS).doc(`${projectId}_overall`).get();

    return {
      projectId: projectId,
      projectName: project.name || null,
      projectNumber: project.projectNumber || null,
      projectStatus: project.status || null,
      month: month,
      monthProfit: monthCore.totals,
      monthWorkers: monthCore.workersCount,
      monthLines: monthCore.lines,
      monthApproval: monthApprSnap.exists ? {
        status: monthApprSnap.data().status,
        rejectionReason: monthApprSnap.data().rejectionReason,
        snapshot: monthApprSnap.data().snapshot,
      } : null,
      overallApproval: overallApprSnap.exists ? {
        status: overallApprSnap.data().status,
        rejectionReason: overallApprSnap.data().rejectionReason,
        snapshot: overallApprSnap.data().snapshot,
      } : null,
      range: {
        fromMonth: fromMonth,
        toMonth: toMonth,
        months: monthlyResults,
        totals: { revenue: r(pR), netRevenue: r(pNR), cost: r(pC), profit: r(pP), margin: pMargin },
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getProjectFinanceReview failed:", err);
    throw new HttpsError("internal", "تعذّر جلب المراجعة المالية.");
  }
});

// اعتماد/رفض مالي لمشروع (شهري أو إجمالي). الرفض → حالة المشروع "قيد المراجعة"
// data: { projectId, scope: "month"|"project", month, action: "approve"|"reject", rejectionReason, fromMonth, toMonth }
exports.setProjectFinanceApproval = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);
    const data = request.data || {};
    const projectId = typeof data.projectId === "string" ? data.projectId.trim() : "";
    const scope = data.scope === APPROVAL_SCOPE.PROJECT ? APPROVAL_SCOPE.PROJECT : APPROVAL_SCOPE.MONTH;
    const month = typeof data.month === "string" ? data.month.trim() : "";
    const action = typeof data.action === "string" ? data.action.trim() : "";
    const rejectionReason = typeof data.rejectionReason === "string" ? data.rejectionReason.trim() : "";
    if (!projectId) throw new HttpsError("invalid-argument", "يجب تحديد المشروع.");
    if (scope === APPROVAL_SCOPE.MONTH && !/^\d{4}-\d{2}$/.test(month)) {
      throw new HttpsError("invalid-argument", "الشهر غير صحيح للموافقة الشهرية.");
    }
    if (action !== "approve" && action !== "reject") throw new HttpsError("invalid-argument", "إجراء غير صحيح.");
    if (action === "reject" && !rejectionReason) throw new HttpsError("invalid-argument", "يجب ذكر سبب الرفض.");

    const projDoc = await db.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
    if (!projDoc.exists || projDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "المشروع غير موجود.");
    }
    const project = projDoc.data();

    // لقطة الربحية
    const tenantDoc = await db.collection(COLLECTIONS.TENANTS).doc(callerTenantId).get();
    const adminCostPerWorker = tenantDoc.exists ? (Number(tenantDoc.data().adminCostPerWorker) || 0) : 0;
    let snapshot = null;
    if (scope === APPROVAL_SCOPE.MONTH) {
      const core = await computeProjectMonthCore(callerTenantId, projectId, month, adminCostPerWorker);
      snapshot = core.totals;
    } else {
      // إجمالي: إن مُرّر نطاق، نحسب اللقطة الإجمالية
      const fromMonth = typeof data.fromMonth === "string" ? data.fromMonth.trim() : "";
      const toMonth = typeof data.toMonth === "string" ? data.toMonth.trim() : "";
      if (/^\d{4}-\d{2}$/.test(fromMonth) && /^\d{4}-\d{2}$/.test(toMonth) && fromMonth <= toMonth) {
        const months = enumerateMonths(fromMonth, toMonth);
        let pR = 0, pNR = 0, pC = 0, pP = 0;
        for (const m of months) {
          const core = await computeProjectMonthCore(callerTenantId, projectId, m, adminCostPerWorker);
          pR += core.totals.revenue; pNR += core.totals.netRevenue; pC += core.totals.cost; pP += core.totals.profit;
        }
        const r = (n) => Math.round(n * 100) / 100;
        snapshot = { revenue: r(pR), netRevenue: r(pNR), cost: r(pC), profit: r(pP), margin: pNR > 0 ? r((pP / pNR) * 100) : 0 };
      }
    }

    const status = action === "approve" ? FINANCE_APPROVAL_STATUS.APPROVED : FINANCE_APPROVAL_STATUS.REJECTED;
    const docId = scope === APPROVAL_SCOPE.PROJECT ? `${projectId}_overall` : `${projectId}_${month}`;

    await db.collection(COLLECTIONS.FINANCE_APPROVALS).doc(docId).set(buildFinanceApprovalDoc({
      tenantId: callerTenantId,
      projectId: projectId,
      projectName: project.name || null,
      scope: scope,
      month: month,
      status: status,
      rejectionReason: action === "reject" ? rejectionReason : null,
      snapshot: snapshot,
      reviewedBy: request.auth.uid,
      reviewedAt: FieldValue.serverTimestamp(),
    }));

    // أثر على حالة المشروع
    let newProjectStatus = project.status;
    if (action === "reject") {
      // الرفض → قيد المراجعة (يعود للمشاريع، مخفي عن العمليات)
      newProjectStatus = PROJECT_STATUS.UNDER_REVIEW;
      await db.collection(COLLECTIONS.PROJECTS).doc(projectId).update({
        status: PROJECT_STATUS.UNDER_REVIEW,
        updatedBy: request.auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (action === "approve" && project.status === PROJECT_STATUS.UNDER_REVIEW) {
      // الاعتماد يرفع المراجعة → يعود نشطًا
      newProjectStatus = PROJECT_STATUS.ACTIVE;
      await db.collection(COLLECTIONS.PROJECTS).doc(projectId).update({
        status: PROJECT_STATUS.ACTIVE,
        updatedBy: request.auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return { id: docId, status: status, projectStatus: newProjectStatus };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("setProjectFinanceApproval failed:", err);
    throw new HttpsError("internal", "تعذّر تنفيذ الموافقة.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== القوائم المالية (قائمة الدخل + الميزانية العمومية) =====
// ═══════════════════════════════════════════════════════
// تُحسب من القيود المعتمدة (posted). قائمة الدخل لحركات الفترة [from,to]؛
// الميزانية أرصدة تراكمية حتى toDate + الأرباح المحتجزة (صافي الدخل التراكمي).
// طبيعة الأرصدة: أصول/مصروفات مدينة (debit−credit)؛ خصوم/حقوق/إيرادات دائنة (credit−debit).
exports.getFinancialStatements = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);
    const data = request.data || {};
    const fromDate = typeof data.fromDate === "string" ? data.fromDate.trim() : "";
    const toDate = typeof data.toDate === "string" ? data.toDate.trim() : "";
    if (!isValidDate(fromDate) || !isValidDate(toDate)) {
      throw new HttpsError("invalid-argument", "التواريخ غير صحيحة (YYYY-MM-DD).");
    }
    if (fromDate > toDate) throw new HttpsError("invalid-argument", "بداية الفترة بعد نهايتها.");

    // الحسابات
    const accSnap = await db.collection(COLLECTIONS.ACCOUNTS).where("tenantId", "==", callerTenantId).get();
    const accounts = {};
    accSnap.docs.forEach((d) => { accounts[d.id] = d.data(); });

    // القيود
    const jeSnap = await db.collection(COLLECTIONS.JOURNAL_ENTRIES).where("tenantId", "==", callerTenantId).get();

    // أرصدة خام: تراكمي حتى toDate + الفترة [from,to]
    const cumRaw = {};
    const periodRaw = {};
    for (const jeDoc of jeSnap.docs) {
      const je = jeDoc.data();
      if (je.status !== JOURNAL_STATUS.POSTED) continue;
      const d = je.date;
      if (!d || d > toDate) continue;
      const inPeriod = d >= fromDate && d <= toDate;
      for (const ln of (je.lines || [])) {
        const delta = (Number(ln.debit) || 0) - (Number(ln.credit) || 0);
        cumRaw[ln.accountId] = (cumRaw[ln.accountId] || 0) + delta;
        if (inPeriod) periodRaw[ln.accountId] = (periodRaw[ln.accountId] || 0) + delta;
      }
    }

    const r = (n) => Math.round(n * 100) / 100;
    const revenues = [], expenses = [];
    let totalRevenue = 0, totalExpense = 0;
    const assetsCurrent = [], assetsNonCurrent = [], liabCurrent = [], liabNonCurrent = [], equityItems = [];
    let totalAssets = 0, totalLiab = 0, totalEquity = 0;
    let cumRevenue = 0, cumExpense = 0;

    for (const [id, acc] of Object.entries(accounts)) {
      const type = acc.type;
      const sub = acc.subtype;
      const cum = cumRaw[id] || 0;
      const per = periodRaw[id] || 0;

      if (type === ACCOUNT_TYPES.REVENUE) {
        const amt = r(-per);
        if (amt !== 0) revenues.push({ code: acc.code, name: acc.name, amount: amt });
        totalRevenue += -per;
        cumRevenue += -cum;
      } else if (type === ACCOUNT_TYPES.EXPENSE) {
        const amt = r(per);
        if (amt !== 0) expenses.push({ code: acc.code, name: acc.name, amount: amt });
        totalExpense += per;
        cumExpense += cum;
      } else if (type === ACCOUNT_TYPES.ASSET) {
        const bal = r(cum);
        const item = { code: acc.code, name: acc.name, amount: bal };
        if (bal !== 0) (sub === "non_current_asset" ? assetsNonCurrent : assetsCurrent).push(item);
        totalAssets += cum;
      } else if (type === ACCOUNT_TYPES.LIABILITY) {
        const bal = r(-cum);
        const item = { code: acc.code, name: acc.name, amount: bal };
        if (bal !== 0) (sub === "non_current_liability" ? liabNonCurrent : liabCurrent).push(item);
        totalLiab += -cum;
      } else if (type === ACCOUNT_TYPES.EQUITY) {
        const bal = r(-cum);
        if (bal !== 0) equityItems.push({ code: acc.code, name: acc.name, amount: bal });
        totalEquity += -cum;
      }
    }

    const netIncome = r(totalRevenue - totalExpense);
    const retainedEarnings = r(cumRevenue - cumExpense);
    const totalEquityWithRE = r(totalEquity + retainedEarnings);
    const totalLiabAndEquity = r(totalLiab + totalEquityWithRE);
    const totalAssetsR = r(totalAssets);

    const byCode = (a, b) => (a.code || "").localeCompare(b.code || "");
    revenues.sort(byCode); expenses.sort(byCode);
    assetsCurrent.sort(byCode); assetsNonCurrent.sort(byCode);
    liabCurrent.sort(byCode); liabNonCurrent.sort(byCode); equityItems.sort(byCode);

    // ═══ الأرصدة الافتتاحية (قبل بداية الفترة) ═══
    const openingRaw = {};
    const allIds = new Set([...Object.keys(cumRaw), ...Object.keys(periodRaw)]);
    for (const id of allIds) {
      openingRaw[id] = (cumRaw[id] || 0) - (periodRaw[id] || 0);
    }

    // ═══ (3) قائمة الدخل الشامل ═══
    // الدخل الشامل = صافي الدخل + بنود الدخل الشامل الأخرى (OCI). لا توجد بنود OCI حاليًا.
    const comprehensiveIncome = {
      netIncome: netIncome,
      ociItems: [],
      totalOci: 0,
      totalComprehensiveIncome: netIncome,
    };

    // ═══ (4) قائمة التغير في حقوق الملكية ═══
    const openingRevenueVal = cumRevenue - totalRevenue;   // الإيراد المتراكم قبل الفترة
    const openingExpenseVal = cumExpense - totalExpense;   // المصروف المتراكم قبل الفترة
    const openingRetainedExtra = openingRevenueVal - openingExpenseVal;  // دخل غير مُقفل قبل الفترة
    const closingRetainedExtra = cumRevenue - cumExpense;  // = retainedEarnings (دخل غير مُقفل تراكمي)

    const equityComponents = [];
    let openingEquitySum = 0;
    for (const [id, acc] of Object.entries(accounts)) {
      if (acc.type !== ACCOUNT_TYPES.EQUITY) continue;
      const cum = cumRaw[id] || 0;
      const opn = openingRaw[id] || 0;
      let opening = -opn;       // حقوق الملكية دائنة الطبيعة
      let closing = -cum;
      // الأرباح المُبقاة: تشمل الدخل غير المُقفل (لتطابق الميزانية)
      if (acc.code === RETAINED_EARNINGS_CODE) {
        opening += openingRetainedExtra;
        closing += closingRetainedExtra;
      }
      equityComponents.push({ code: acc.code, name: acc.name, opening: r(opening), closing: r(closing) });
      openingEquitySum += opening;
    }
    equityComponents.sort(byCode);
    const openingEquityTotal = r(openingEquitySum);
    const closingEquityTotal = totalEquityWithRE;
    const capitalMovement = r(closingEquityTotal - openingEquityTotal - netIncome);  // حركات رأس المال/توزيعات

    const equityStatement = {
      components: equityComponents,
      openingTotal: openingEquityTotal,
      netIncome: netIncome,
      capitalMovement: capitalMovement,
      closingTotal: closingEquityTotal,
    };

    // ═══ (5) قائمة التدفقات النقدية (طريقة مباشرة) ═══
    // حسابات النقد وما في حكمه: أصول كودها يبدأ بـ "11"
    const cashIds = new Set();
    for (const [id, acc] of Object.entries(accounts)) {
      if (acc.type === ACCOUNT_TYPES.ASSET && typeof acc.code === "string" && acc.code.startsWith("11")) {
        cashIds.add(id);
      }
    }
    let openingCash = 0, closingCash = 0;
    for (const id of cashIds) {
      openingCash += (openingRaw[id] || 0);
      closingCash += (cumRaw[id] || 0);
    }
    openingCash = r(openingCash);
    closingCash = r(closingCash);

    // تصنيف الحركات النقدية ضمن الفترة حسب الطرف المقابل الأكبر
    let cfOperating = 0, cfInvesting = 0, cfFinancing = 0;
    const cfOpItems = [], cfInvItems = [], cfFinItems = [];
    for (const jeDoc of jeSnap.docs) {
      const je = jeDoc.data();
      if (je.status !== JOURNAL_STATUS.POSTED) continue;
      const d = je.date;
      if (!d || d < fromDate || d > toDate) continue;
      const lines = je.lines || [];
      let cashDelta = 0, hasCash = false;
      for (const ln of lines) {
        if (cashIds.has(ln.accountId)) {
          cashDelta += (Number(ln.debit) || 0) - (Number(ln.credit) || 0);
          hasCash = true;
        }
      }
      if (!hasCash || Math.abs(cashDelta) < 0.005) continue;
      // الطرف المقابل الأكبر (غير نقدي)
      let bestType = null, bestSub = null, bestAmt = -1;
      for (const ln of lines) {
        if (cashIds.has(ln.accountId)) continue;
        const acc = accounts[ln.accountId];
        if (!acc) continue;
        const amt = Math.abs((Number(ln.debit) || 0) - (Number(ln.credit) || 0));
        if (amt > bestAmt) { bestAmt = amt; bestType = acc.type; bestSub = acc.subtype; }
      }
      let category = "operating";
      if (bestType === ACCOUNT_TYPES.ASSET && bestSub === "non_current_asset") category = "investing";
      else if (bestType === ACCOUNT_TYPES.EQUITY) category = "financing";
      else if (bestType === ACCOUNT_TYPES.LIABILITY && bestSub === "non_current_liability") category = "financing";

      const item = { description: je.description || "حركة نقدية", amount: r(cashDelta), date: d };
      if (category === "operating") { cfOperating += cashDelta; cfOpItems.push(item); }
      else if (category === "investing") { cfInvesting += cashDelta; cfInvItems.push(item); }
      else { cfFinancing += cashDelta; cfFinItems.push(item); }
    }
    cfOperating = r(cfOperating); cfInvesting = r(cfInvesting); cfFinancing = r(cfFinancing);
    const cfNetChange = r(cfOperating + cfInvesting + cfFinancing);

    const cashFlow = {
      operating: { items: cfOpItems, total: cfOperating },
      investing: { items: cfInvItems, total: cfInvesting },
      financing: { items: cfFinItems, total: cfFinancing },
      netChange: cfNetChange,
      openingCash: openingCash,
      closingCash: closingCash,
      reconciles: Math.abs((openingCash + cfNetChange) - closingCash) < 0.01,
    };

    return {
      fromDate: fromDate,
      toDate: toDate,
      incomeStatement: {
        revenues: revenues,
        totalRevenue: r(totalRevenue),
        expenses: expenses,
        totalExpense: r(totalExpense),
        netIncome: netIncome,
      },
      comprehensiveIncome: comprehensiveIncome,
      balanceSheet: {
        asOf: toDate,
        assets: { current: assetsCurrent, nonCurrent: assetsNonCurrent, total: totalAssetsR },
        liabilities: { current: liabCurrent, nonCurrent: liabNonCurrent, total: r(totalLiab) },
        equity: { items: equityItems, retainedEarnings: retainedEarnings, total: totalEquityWithRE },
        totalLiabilitiesAndEquity: totalLiabAndEquity,
        balanced: Math.abs(totalAssetsR - totalLiabAndEquity) < 0.01,
      },
      equityStatement: equityStatement,
      cashFlow: cashFlow,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("getFinancialStatements failed:", err);
    throw new HttpsError("internal", "تعذّر إنشاء القوائم المالية.");
  }
});

// ═══════════════════════════════════════════════════════
// ===== ZATCA المرحلة الثانية: توليد فاتورة موقّعة =====
// ═══════════════════════════════════════════════════════
const zatca = require("./zatca");

// يولّد UBL XML + تجزئة + توقيع ECDSA + QR (9 حقول) ويخزّنها في الفاتورة.
// مفتاح التطوير يُولّد ويُخزّن في الشركة مرة. (الإنتاج: شهادة CSID من الهيئة).
exports.generateZatcaInvoice = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);
    const data = request.data || {};
    const invoiceId = typeof data.invoiceId === "string" ? data.invoiceId.trim() : "";
    if (!invoiceId) throw new HttpsError("invalid-argument", "يجب تحديد الفاتورة.");

    const invRef = db.collection(COLLECTIONS.INVOICES).doc(invoiceId);
    const invDoc = await invRef.get();
    if (!invDoc.exists || invDoc.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "الفاتورة غير موجودة.");
    }
    const invoice = invDoc.data();

    // الشركة (البائع)
    const tenantRef = db.collection(COLLECTIONS.TENANTS).doc(callerTenantId);
    const tenantDoc = await tenantRef.get();
    const tenant = tenantDoc.data() || {};
    if (!tenant.taxNumber) {
      throw new HttpsError("failed-precondition", "الرقم الضريبي للشركة غير مُسجّل — أضِفه من إعدادات الشركة أولًا.");
    }
    const seller = {
      name: tenant.name || "", taxNumber: tenant.taxNumber, crNumber: tenant.crNumber || "",
      address: tenant.address || "", buildingNumber: tenant.buildingNumber || "",
      district: tenant.district || "", city: tenant.city || "", postalCode: tenant.postalCode || "",
    };
    const customer = invoice.customerSnapshot || {};

    // مفتاح التطوير (يُولّد ويُخزّن مرة واحدة في الشركة)
    let privateKey = tenant.zatcaDevPrivateKey;
    let publicKey = tenant.zatcaDevPublicKey;
    if (!privateKey || !publicKey) {
      const kp = zatca.generateKeyPair();
      privateKey = kp.privateKey;
      publicKey = kp.publicKey;
      await tenantRef.update({ zatcaDevPrivateKey: privateKey, zatcaDevPublicKey: publicKey });
    }

    // PIH: تجزئة آخر فاتورة موقّعة (سلسلة الفواتير) — "0" للأولى
    const allSnap = await db.collection(COLLECTIONS.INVOICES).where("tenantId", "==", callerTenantId).get();
    let pih = "0";
    let latestTime = "";
    allSnap.docs.forEach((d) => {
      const dd = d.data();
      if (d.id !== invoiceId && dd.zatcaSigned === true && dd.zatcaHash && dd.zatcaTimestamp && dd.zatcaTimestamp > latestTime) {
        latestTime = dd.zatcaTimestamp;
        pih = dd.zatcaHash;
      }
    });

    // التوليد
    const issueTime = invoice.issueTime || "00:00:00";
    const timestamp = `${invoice.date}T${issueTime}Z`;
    const xml = zatca.generateInvoiceXML({ invoice: invoice, seller: seller, customer: customer, pih: pih });
    const hash = zatca.computeInvoiceHash(xml);
    const signature = zatca.signHash(hash, privateKey);
    const publicKeyBase64 = zatca.publicKeyToBase64(publicKey);
    const qr = zatca.buildQRCode({
      sellerName: seller.name, taxNumber: seller.taxNumber, timestamp: timestamp,
      total: invoice.total, vatTotal: invoice.totalVat, invoiceHash: hash,
      signatureBase64: signature, publicKeyBase64: publicKeyBase64,
    });

    await invRef.update({
      zatcaSigned: true,
      zatcaPhase: 2,
      zatcaXml: xml,
      zatcaHash: hash,
      zatcaSignature: signature,
      zatcaQR: qr,
      zatcaPih: pih,
      zatcaTimestamp: timestamp,
      zatcaSignedAt: FieldValue.serverTimestamp(),
      zatcaSignedBy: request.auth.uid,
    });

    return { id: invoiceId, hash: hash, qr: qr, pih: pih, signed: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("generateZatcaInvoice failed:", err);
    throw new HttpsError("internal", "تعذّر توليد فاتورة ZATCA.");
  }
});
