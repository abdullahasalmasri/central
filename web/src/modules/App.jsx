import React from "react";
import CentralShell from "./CentralShell";
import StaffView from "./StaffView";
import CustomersView from "./CustomersView";

/* ============================================================
   App.jsx — الملف الرئيسي الذي يوصّل الهيكل (Shell) بكل الواجهات.
   كل سطر import يجلب واجهة، وخريطة views تربط كل تفرّع بواجهته.
   ============================================================ */

// ── استيراد الواجهات المبنية ──
import ExecutiveDashboard     from "./ExecutiveDashboard";
import CollectionsView        from "./CollectionsView";
import TreasuryView           from "./TreasuryView";
import FPAView                from "./FPAView";
import ProcurementView        from "./ProcurementView";
import PayrollView            from "./PayrollView";
import RecruitmentView        from "./RecruitmentView";
import TrainingView           from "./TrainingView";
import EmployeeRelationsView  from "./EmployeeRelationsView";
import QualitySafetyView      from "./QualitySafetyView";
import DepreciationView       from "./DepreciationView";
import SalesView              from "./SalesView";
import MarketingView          from "./MarketingView";
import CustomerServiceView    from "./CustomerServiceView";
import ContractsView          from "./ContractsView";
import ComplianceView         from "./ComplianceView";
import DisputesView           from "./DisputesView";
import InternalAuditView      from "./InternalAuditView";
import NPSView                from "./NPSView";
import ProcessImprovementView from "./ProcessImprovementView";
import SubscriptionView       from "./SubscriptionView";
import BuildSystemView        from "./BuildSystemView";

// ── خريطة الربط: معرّف التفرّع (نفس الموجود في الـ Shell) → الواجهة ──
const views = {
  exec_kpi:      ExecutiveDashboard,
  fin_coll:      CollectionsView,
  fin_treas:     TreasuryView,
  fin_fpa:       FPAView,
  fin_proc:      ProcurementView,
  fin_cust: CustomersView,
  hr_pay:        PayrollView,
  hr_emp: StaffView,
  hr_rec:        RecruitmentView,
  hr_train:      TrainingView,
  hr_rel:        EmployeeRelationsView,
  ops_qs:        QualitySafetyView,
  as_dep:        DepreciationView,
  sal_dir:       SalesView,
  sal_mkt:       MarketingView,
  sal_serv:      CustomerServiceView,
  leg_con:       ContractsView,
  leg_com:       ComplianceView,
  leg_dis:       DisputesView,
  qa_aud:        InternalAuditView,
  qa_nps:        NPSView,
  qa_imp:        ProcessImprovementView,
  subscriptions: SubscriptionView,
  build:         BuildSystemView,
};

export default function App() {
  return <CentralShell views={views} />;
}
