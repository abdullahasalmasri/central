import { createUserWithEmailAndPassword } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";

// ينفّذ تدفّق التسجيل كاملاً ويُرجع نتيجة الدالة.
// يرمي خطأً بنصّ عربي واضح عند أي فشل، لتعرضه الواجهة.
export async function registerCompanyFlow({ email, password, companyName, ownerName }) {
  // (1) إنشاء حساب المصادقة
  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    throw new Error(mapAuthError(err));
  }

  // (2) استدعاء دالة الخادم لإنشاء الشركة + حساب المالك
  try {
    const fn = httpsCallable(functions, "registerCompany");
    const res = await fn({ name: companyName, ownerName });

    // (3) تحديث التوكن ليحمل tenantId + role الجديدين — خطوة حاسمة
    await cred.user.getIdToken(true);

    return res.data; // { tenantId, status }
  } catch (err) {
    // الحساب أُنشئ لكن إنشاء الشركة فشل — نحذف الحساب لتنظيف الحالة
    // فيقدر يعيد المحاولة بنفس البريد بدون "البريد مستخدم بالفعل".
    try {
      await cred.user.delete();
    } catch (_) {
      /* تجاهل: المهم إظهار الخطأ الأصلي */
    }
    throw new Error(err.message || "تعذّر إكمال التسجيل، حاول مرة أخرى.");
  }
}

// يحوّل أخطاء Firebase Auth إلى رسائل عربية مفهومة
function mapAuthError(err) {
  const code = err && err.code ? err.code : "";
  switch (code) {
    case "auth/email-already-in-use":
      return "هذا البريد مستخدم بالفعل. سجّل الدخول أو استخدم بريدًا آخر.";
    case "auth/invalid-email":
      return "صيغة البريد الإلكتروني غير صحيحة.";
    case "auth/weak-password":
      return "كلمة المرور ضعيفة (6 أحرف على الأقل).";
    default:
      return "تعذّر إنشاء الحساب، تأكّد من البيانات وحاول مجددًا.";
  }
}