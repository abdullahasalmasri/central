import { useState, useEffect } from "react";
import { onAuthStateChanged, getIdTokenResult } from "firebase/auth";
import { auth } from "./firebase";

// يتابع حالة المصادقة ويُرجع المستخدم الحالي مع بياناته من التوكن.
// loading=true حتى يتأكّد من الحالة أول مرة (نتفادى وميض الشاشة الخطأ).
export function useAuth() {
  const [user, setUser] = useState(null);
  const [claims, setClaims] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // اقرأ الصلاحيات (tenantId, role) من التوكن
        const tokenResult = await getIdTokenResult(firebaseUser);
        setUser(firebaseUser);
        setClaims(tokenResult.claims);
      } else {
        setUser(null);
        setClaims(null);
      }
      setLoading(false);
    });
    return () => unsubscribe(); // تنظيف عند الخروج
  }, []);

  return { user, claims, loading };
}