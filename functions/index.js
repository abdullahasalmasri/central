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
// ===== إنشاء عميل (مع مواقع ومخوّلين متعددين) =====
exports.createCustomer = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);

    const data = request.data || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const type = data.type === "individual" ? "individual" : "company";
    const phone = typeof data.phone === "string" ? data.phone.trim() : "";
    const taxNumber = typeof data.taxNumber === "string" ? data.taxNumber.trim() : "";
    const crNumber = typeof data.crNumber === "string" ? data.crNumber.trim() : "";
    const licenseNumber = typeof data.licenseNumber === "string" ? data.licenseNumber.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim() : "";
    const website = typeof data.website === "string" ? data.website.trim() : "";

    if (name.length < 2) {
      throw new HttpsError("invalid-argument", "اسم العميل مطلوب (حرفان على الأقل).");
    }
    if (!phone) {
      throw new HttpsError("invalid-argument", "رقم التواصل الرسمي مطلوب.");
    }
    // الرقم الضريبي السعودي: 15 رقمًا يبدأ وينتهي بـ 3 (إن أُدخل)
    if (taxNumber && !/^3\d{13}3$/.test(taxNumber)) {
      throw new HttpsError("invalid-argument", "الرقم الضريبي يجب أن يكون 15 رقمًا يبدأ وينتهي بالرقم 3.");
    }

    // تنظيف المواقع (نحذف الفارغة تمامًا)
    const rawLocations = Array.isArray(data.locations) ? data.locations : [];
    const locations = [];
    for (const loc of rawLocations) {
      const label = loc && typeof loc.label === "string" ? loc.label.trim() : "";
      const mapLink = loc && typeof loc.mapLink === "string" ? loc.mapLink.trim() : "";
      const address = loc && typeof loc.address === "string" ? loc.address.trim() : "";
      if (!label && !mapLink && !address) continue;
      locations.push({ label: label || null, mapLink: mapLink || null, address: address || null });
    }
    if (locations.length === 0) {
      throw new HttpsError("invalid-argument", "العنوان الوطني مطلوب (موقع واحد على الأقل).");
    }

    // تنظيف المخوّلين (نحذف الفارغة تمامًا)
    const rawContacts = Array.isArray(data.contacts) ? data.contacts : [];
    const contacts = [];
    for (const con of rawContacts) {
      const cn = con && typeof con.name === "string" ? con.name.trim() : "";
      const cp = con && typeof con.phone === "string" ? con.phone.trim() : "";
      if (!cn && !cp) continue;
      contacts.push({ name: cn || null, phone: cp || null });
    }

    // أول مخوّل يُستخدم كـ contactPerson للتوافق مع الفواتير
    const contactPerson = contacts.length > 0 ? contacts[0].name : null;

    const customerRef = db.collection(COLLECTIONS.CUSTOMERS).doc();
    await customerRef.set(
      buildCustomerDoc({
        tenantId: callerTenantId,
        name, type, taxNumber, crNumber, licenseNumber,
        contactPerson, phone, email, website,
        locations, contacts,
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

// ===== حذف عميل =====
exports.deleteCustomer = onCall(async (request) => {
  try {
    const callerTenantId = await requireModule(request.auth, MODULES.FINANCE);
    const data = request.data || {};
    const customerId = typeof data.customerId === "string" ? data.customerId.trim() : "";
    if (!customerId) {
      throw new HttpsError("invalid-argument", "يجب تحديد العميل.");
    }
    const ref = db.collection(COLLECTIONS.CUSTOMERS).doc(customerId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().tenantId !== callerTenantId) {
      throw new HttpsError("invalid-argument", "العميل غير صحيح.");
    }
    await ref.delete();
    return { id: customerId, deleted: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("deleteCustomer failed:", err);
    throw new HttpsError("internal", "تعذّر حذف العميل، حاول مرة أخرى.");
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

    const [receivableDoc, vatDoc, exciseDoc] = await Promise.all([
      findAccountByCode(INVOICE_ACCOUNT_CODES.RECEIVABLE),
      findAccountByCode(INVOICE_ACCOUNT_CODES.VAT_PAYABLE),
      findAccountByCode(INVOICE_ACCOUNT_CODES.EXCISE_PAYABLE),
    ]);

    if (!receivableDoc) {
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

      // اقرأ حسابات الضرائب والذمم داخل المعاملة (لتحديث أرصدتها)
      const receivableRef = receivableDoc.ref;
      const receivableSnapTx = await tx.get(receivableRef);
      const receivableBalance = receivableSnapTx.data();

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
      // الطرف المدين: العميل
      journalLines.push({
        accountId: receivableRef.id,
        accountCode: receivableBalance.code || null,
        accountName: receivableBalance.name || null,
        debit: total,
        credit: 0,
        note: `فاتورة ${customerSnapshot.name || ""}`.trim(),
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
      // الذمم (أصل، مدين الطبيعة): +total
      tx.update(receivableRef, { balance: FieldValue.increment(total) });
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
      balanceSheet: {
        asOf: toDate,
        assets: { current: assetsCurrent, nonCurrent: assetsNonCurrent, total: totalAssetsR },
        liabilities: { current: liabCurrent, nonCurrent: liabNonCurrent, total: r(totalLiab) },
        equity: { items: equityItems, retainedEarnings: retainedEarnings, total: totalEquityWithRE },
        totalLiabilitiesAndEquity: totalLiabAndEquity,
        balanced: Math.abs(totalAssetsR - totalLiabAndEquity) < 0.01,
      },
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
