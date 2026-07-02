import React, { useState, useEffect } from "react";
import { LanguageProvider } from "./i18n";
import CentralShell from "./CentralShell";
import OwnerShell from "./OwnerShell";

/* ============================================================
   App.jsx — الملف الرئيسي الذي يوصّل الهيكل (Shell) بكل الواجهات.
   كل سطر import يجلب واجهة، وخريطة views تربط كل تفرّع بواجهته.
   ============================================================ */

// ── واجهات حقيقية مربوطة بقاعدة البيانات ──
import StaffView                from "./StaffView";                // hr_emp
import CustomersView            from "./CustomersView";            // fin_cust
import AccountingView           from "./AccountingView";           // fin_acc (دليل الحسابات + القيود)
import InvoicesView             from "./InvoicesView";             // fin_inv (الفوترة + ZATCA)
import FinancialStatementsView  from "./FinancialStatementsView";  // fin_fs

// ── واجهات العرض (تُربط بقاعدة البيانات لاحقًا) ──
import ExecutiveDashboard       from "./ExecutiveDashboard";
import OrgStructureView         from "./OrgStructureView";
import PermissionsView          from "./PermissionsView";
import CollectionsView          from "./CollectionsView";
import TreasuryView             from "./TreasuryView";
import FPAView                  from "./FPAView";
import ProcurementView          from "./ProcurementView";
import POSView                  from "./POSView";                 // fin_pos (نقاط البيع)
import CashierView              from "./CashierView";             // fin_cash (الكاشير)
import PayrollView              from "./PayrollView";
import RecruitmentView          from "./RecruitmentView";
import TrainingView             from "./TrainingView";
import EmployeeRelationsView    from "./EmployeeRelationsView";
import ProjectsView            from "./ProjectsView";
import PeopleView              from "./PeopleView";
import FacilitiesView          from "./FacilitiesView";
import MaterialsView           from "./MaterialsView";
import InventoryView           from "./InventoryView";           // ops_inv (المخزون)
import StockRequestsView       from "./StockRequestsView";       // ops_req (طلبات المخزون)
import ProcessesView           from "./ProcessesView";
import PlanningView            from "./PlanningView";
import QualitySafetyView        from "./QualitySafetyView";
import DepreciationView         from "./DepreciationView";
import AssetsView              from "./AssetsView";
import CostProfitabilityView   from "./CostProfitabilityView";
import CostOverviewView        from "./CostOverviewView";
import CostAllocationView      from "./CostAllocationView";
import SalesView                from "./SalesView";
import QuotesView               from "./QuotesView";
import PriceQuotesView          from "./PriceQuotesView";
import FinanceQuoteReviewView   from "./FinanceQuoteReviewView";
import OperationsDraftsView     from "./OperationsDraftsView";
import FinalApprovalView        from "./FinalApprovalView";
import ProjectContractsView     from "./ProjectContractsView";
import AssetBeneficiariesView   from "./AssetBeneficiariesView";
import ContractSignaturesView   from "./ContractSignaturesView";
import ContractTemplatesView    from "./ContractTemplatesView";
import CompanyProfileView       from "./CompanyProfileView";
import MarketingView            from "./MarketingView";
import CustomerServiceView      from "./CustomerServiceView";
import ContractsView            from "./ContractsView";
import ComplianceView           from "./ComplianceView";
import DisputesView             from "./DisputesView";
import InternalAuditView        from "./InternalAuditView";
import NPSView                  from "./NPSView";
import ProcessImprovementView   from "./ProcessImprovementView";
import SubscriptionView         from "./SubscriptionView";
import BuildSystemView          from "./BuildSystemView";
import SupportView              from "./SupportView";              // support (الدعم)

// ── خريطة الربط: معرّف التفرّع (نفس الموجود في الـ Shell) → الواجهة ──
const views = {
  // الإدارة العليا
  exec_kpi:      ExecutiveDashboard,
  exec_org:      OrgStructureView,
  exec_perm:     PermissionsView,
  exec_company:  CompanyProfileView,

  // المالية
  fin_acc:       AccountingView,
  fin_inv:       InvoicesView,
  fin_cust:      CustomersView,
  fin_fs:        FinancialStatementsView,
  fin_coll:      CollectionsView,
  fin_treas:     TreasuryView,
  fin_fpa:       FPAView,
  fin_proc:      ProcurementView,
  fin_pos:       POSView,
  fin_cash:      CashierView,
  fin_review:    FinanceQuoteReviewView,

  // الموارد البشرية
  hr_emp:        StaffView,
  hr_pay:        PayrollView,
  hr_rec:        RecruitmentView,
  hr_train:      TrainingView,
  hr_rel:        EmployeeRelationsView,

  // العمليات
  ops_proj:      ProjectsView,
  ops_people:    PeopleView,
  ops_facilities: FacilitiesView,
  ops_materials: MaterialsView,
  ops_inv:       InventoryView,
  ops_req:       StockRequestsView,
  ops_process:   ProcessesView,
  ops_planning:  PlanningView,
  ops_qs:        QualitySafetyView,
  ops_draft:     OperationsDraftsView,
  ops_approval:  FinalApprovalView,

  // الأصول والمرافق
  as_veh:        AssetsView,
  as_hous:       AssetsView,
  as_equ:        AssetsView,
  as_simple:     AssetsView,
  as_dep:        DepreciationView,
  as_ben:        AssetBeneficiariesView,
  cost_full:     CostOverviewView,
  cost_prof:     CostProfitabilityView,
  cost_alloc:    CostAllocationView,

  // المبيعات والتسويق
  sal_dir:       SalesView,
  sal_quote:     PriceQuotesView,
  sal_mkt:       MarketingView,
  sal_serv:      CustomerServiceView,

  // القانونية والامتثال
  leg_con:       ContractsView,
  leg_pcon:      ProjectContractsView,
  leg_sign:      ContractSignaturesView,
  leg_tpl:       ContractTemplatesView,
  leg_com:       ComplianceView,
  leg_dis:       DisputesView,

  // التميز والجودة
  qa_aud:        InternalAuditView,
  qa_nps:        NPSView,
  qa_imp:        ProcessImprovementView,

  // إدارة المنصة
  subscriptions: SubscriptionView,
  build:         BuildSystemView,
  support:       SupportView,
};

export default function App() {
  // التوجيه: #owner → منصة المالك (واجهة منفصلة، نفس Firebase)؛ غير ذلك → Central
  const [isOwnerRoute, setIsOwnerRoute] = useState(
    typeof window !== "undefined" && window.location.hash.startsWith("#owner")
  );
  useEffect(() => {
    const onHash = () => setIsOwnerRoute(window.location.hash.startsWith("#owner"));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (isOwnerRoute) return <LanguageProvider><OwnerShell /></LanguageProvider>;
  return <LanguageProvider><CentralShell views={views} /></LanguageProvider>;
}
