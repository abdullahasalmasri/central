import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

// يجلب كل مستخدمي الشركة الحالية (المالك + الموظفين).
// القاعدة تضمن أنه يرى شركته فقط — العزل مفروض على الخادم.
export async function fetchEmployees(tenantId) {
  const q = query(
    collection(db, "users"),
    where("tenantId", "==", tenantId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ينشئ موظفًا جديدًا عبر دالة الخادم createEmployee.
export async function createEmployee({ name, email, password, permissions }) {
  const fn = httpsCallable(functions, "createEmployee");
  const res = await fn({ name, email, password, permissions });
  return res.data; // { uid, email }
}

// يجلب مستند مستخدم واحد بمعرّفه (لقراءة صلاحياته مثلاً)
export async function fetchUserDoc(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}