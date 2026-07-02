import { useState, useEffect } from "react";

/* ============================================================
   useIsMobile — كشف حجم الشاشة لتكييف الصفحات على الجوال.
   يُستخدم في الصفحات ذات الجداول/النماذج لتحويلها لتخطيط
   عمودي مناسب للجوال. الإطار (السايدبار) متجاوب عبر CSS أصلاً.
   ============================================================ */

export function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.innerWidth < breakpoint
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}
