import { useState } from "react";
import { useAuth } from "./useAuth";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";
import PendingScreen from "./PendingScreen";
import OwnerDashboard from "./OwnerDashboard";
import StaffDashboard from "./StaffDashboard";
import WorkerDashboard from "./WorkerDashboard";

export default function App() {
  const { user, claims, loading } = useAuth();
  // عند عدم وجود مستخدم: نتنقّل بين الدخول والتسجيل
  const [showRegister, setShowRegister] = useState(false);
  // بعد تسجيل شركة جديدة: نعرض صفحة الانتظار
  const [justRegistered, setJustRegistered] = useState(null);

  // (1) لحظة التحقّق الأولى من حالة المصادقة
  if (loading) {
    return <CenterMessage text="جارٍ التحميل..." />;
  }

  // (2) سجّل شركة للتو → صفحة الانتظار
  if (justRegistered) {
    return <PendingScreen tenantId={justRegistered.tenantId} />;
  }

  // (3) لا يوجد مستخدم مسجّل → دخول أو تسجيل
  if (!user) {
    if (showRegister) {
      return (
        <RegisterForm
          onSuccess={(result) => setJustRegistered(result)}
        />
      );
    }
    return <LoginForm onSwitchToRegister={() => setShowRegister(true)} />;
  }

  // (4) يوجد مستخدم، لكن التوكن لم يحمل tenantId بعد
  //     (يحدث لحظة قصيرة بعد التسجيل قبل تحديث التوكن)
  if (!claims || !claims.tenantId) {
    return <CenterMessage text="جارٍ تجهيز الحساب..." />;
  }

  // (5) مستخدم مسجّل بدور مالك → لوحة المالك
  if (claims.role === "owner") {
    return <OwnerDashboard user={user} claims={claims} />;
  }

  // (6) موظف إداري → لوحة الموظف
  if (claims.role === "staff") {
    return <StaffDashboard user={user} claims={claims} />;
  }

  // (7) عامل → لوحة العامل
  if (claims.role === "worker") {
    return <WorkerDashboard user={user} />;
  }

  // احتياط: دور غير معروف
  return (
    <CenterMessage text={`مرحبًا ${user.email} — لا توجد لوحة مخصّصة لحسابك.`} />
  );
}

function CenterMessage({ text }) {
  return (
    <div style={styles.center}>
      <p style={styles.text}>{text}</p>
    </div>
  );
}

const styles = {
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
    direction: "rtl",
    background: "#f8fafc",
  },
  text: { fontSize: 16, color: "#475569" },
};