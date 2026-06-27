// ═══════════════════════════════════════════════════════════════
// دوال العملاء — تتعامل مع Firestore (مجموعة customers)
// تراعي multi-tenant: كل عميل مرتبط بـ tenantId للشركة الحالية
// ═══════════════════════════════════════════════════════════════
import { db, auth } from "../firebase";
import {
  doc, getDoc, addDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp,
} from "firebase/firestore";

/** يجلب tenantId للمستخدم الحالي من وثيقته في users */
async function getCurrentTenantId() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const meSnap = await getDoc(doc(db, "users", uid));
  return meSnap.exists() ? (meSnap.data().tenantId || null) : null;
}

/**
 * يجلب كل عملاء الشركة الحالية.
 * @returns {Promise<Array>} قائمة العملاء
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
 * يضيف عميلًا جديدًا للشركة الحالية.
 * @param {Object} customer بيانات العميل (name, phone, locations[], contacts[], ...)
 * @returns {Promise<string>} معرّف العميل الجديد
 */
export async function addCustomer(customer) {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) throw new Error("لا يمكن إضافة عميل بدون تسجيل دخول");

  const ref = await addDoc(collection(db, "customers"), {
    ...customer,
    tenantId,
    createdBy: auth.currentUser?.uid || null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * يحذف عميلًا.
 * @param {string} customerId معرّف العميل
 */
export async function deleteCustomer(customerId) {
  await deleteDoc(doc(db, "customers", customerId));
}
