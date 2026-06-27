// ═══════════════════════════════════════════════════════════════
// دوال العملاء — القراءة مباشرة من Firestore، والكتابة عبر Cloud Functions.
// (قواعد الأمان تمنع الكتابة المباشرة؛ كل كتابة تمرّ عبر دوال السيرفر الآمنة)
// ═══════════════════════════════════════════════════════════════
import { db, auth, functions } from "../firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

/** يجلب tenantId للمستخدم الحالي من وثيقته في users */
async function getCurrentTenantId() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const meSnap = await getDoc(doc(db, "users", uid));
  return meSnap.exists() ? (meSnap.data().tenantId || null) : null;
}

/**
 * يجلب كل عملاء الشركة الحالية (قراءة مباشرة — مسموحة بقواعد الأمان).
 */
export async function getCustomers() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    console.warn("لا يوجد tenantId — تأكد أن المستخدم مسجّل الدخول");
    return [];
  }
  const q = query(collection(db, "customers"), where("tenantId", "==", tenantId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * يضيف عميلًا جديدًا عبر Cloud Function createCustomer.
 * @param {Object} form بيانات النموذج (من الواجهة)
 * @returns {Promise<string>} معرّف العميل الجديد
 */
export async function addCustomer(form) {
  // ننسّق البيانات بالأسماء التي تتوقّعها الدالة (vatNumber → taxNumber)
  const payload = {
    name: form.name,
    type: form.type,
    phone: form.phone,
    crNumber: form.crNumber,
    taxNumber: form.vatNumber,
    licenseNumber: form.licenseNumber,
    email: form.email,
    website: form.website,
    locations: form.locations,
    contacts: form.contacts,
  };
  const fn = httpsCallable(functions, "createCustomer");
  const res = await fn(payload);
  return res.data.id;
}

/**
 * يحذف عميلًا عبر Cloud Function deleteCustomer.
 * @param {string} customerId معرّف العميل
 */
export async function deleteCustomer(customerId) {
  const fn = httpsCallable(functions, "deleteCustomer");
  await fn({ customerId });
}
