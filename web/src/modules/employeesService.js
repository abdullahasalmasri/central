// ═══════════════════════════════════════════════════════════════
// دوال الموظفين — تجلب البيانات من Firestore (مجموعة users)
// تراعي multi-tenant: تجيب فقط موظفي الشركة الحالية (نفس tenantId)
// ═══════════════════════════════════════════════════════════════
import { db, auth } from "../firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

/**
 * تجلب tenantId للمستخدم الحالي (الشركة التي ينتمي لها).
 * نقرأه من وثيقة المستخدم في مجموعة users.
 */
async function getCurrentTenantId() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const meSnap = await getDoc(doc(db, "users", uid));
  return meSnap.exists() ? (meSnap.data().tenantId || null) : null;
}

/**
 * تجلب كل موظفي الشركة الحالية.
 * @returns {Promise<Array>} قائمة الموظفين [{ id, name, email, role, status, permissions }]
 */
export async function getEmployees() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    console.warn("لا يوجد tenantId — تأكد أن المستخدم مسجّل الدخول");
    return [];
  }

  // اجلب فقط موظفي هذه الشركة
  const q = query(collection(db, "users"), where("tenantId", "==", tenantId));
  const snap = await getDocs(q);

  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      name: d.name || "—",
      email: d.email || "—",
      role: d.role || "staff",
      status: d.status || "active",
      permissions: d.permissions || [],
    };
  });
}
