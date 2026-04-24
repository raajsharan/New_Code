import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ConfigProvider } from './context/ConfigContext';
import { BrandingProvider } from './context/BrandingContext';
import { DeleteConfirmProvider } from './context/DeleteConfirmContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import AssetListCombinedPage from './pages/AssetListCombinedPage';
import ExtAssetListCombinedPage from './pages/ExtAssetListCombinedPage';
import ConfigurationPage from './pages/ConfigurationPage';
import UsersPage from './pages/UsersPage';
import PasswordControlPage from './pages/PasswordControlPage';
import BrandingPage from './pages/BrandingPage';
import CustomFieldsPage from './pages/CustomFieldsPage';
import ProfilePage from './pages/ProfilePage';
import PhysicalAssetPage from './pages/PhysicalAssetPage';
import PhysicalServerListPage from './pages/PhysicalServerListPage';
import PhysicalAssetCustomFieldsPage from './pages/PhysicalAssetCustomFieldsPage';
import PhysicalServerModelsPage from './pages/PhysicalServerModelsPage';
import ExtendedCustomFieldsPage from './pages/ExtendedCustomFieldsPage';
import TransferToInventoryPage from './pages/TransferToInventoryPage';
import DeptRangeManagementPage from './pages/DeptRangeManagementPage';
import DashboardIconsPage from './pages/DashboardIconsPage';
import DashboardComplianceConfigPage from './pages/DashboardComplianceConfigPage';
import CopyrightPage from './pages/CopyrightPage';
import BackupPage from './pages/BackupPage';
import AssetDetailPage from './pages/AssetDetailPage';
import ExtAssetDetailPage from './pages/ExtAssetDetailPage';
import EmailNotificationsPage from './pages/EmailNotificationsPage';
import ColumnConfigPage from './pages/ColumnConfigPage';
import ReportBuilderPage from './pages/ReportBuilderPage';
import AuditExplorerPage from './pages/AuditExplorerPage';
import NewAssetImportPage from './pages/NewAssetImportPage';
import ExcelSmartImportPage from './pages/ExcelSmartImportPage';
import ImportAuditReportPage from './pages/ImportAuditReportPage';
import SoftwareDeploymentPage from './pages/SoftwareDeploymentPage';
import TenableReportPage from './pages/TenableReportPage';
import TenableImportPage from './pages/TenableImportPage';
import BeijingAssetCombinedPage from './pages/BeijingAssetCombinedPage';
import BeijingAssetDetailPage from './pages/BeijingAssetDetailPage';
import BeijingAssetFieldsPage from './pages/BeijingAssetFieldsPage';

function FullPageLoader({ label = 'Loading' }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-16 h-16">
          <span className="absolute inset-0 rounded-full border-4 border-blue-200" />
          <span className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-700 animate-spin" />
          <span className="absolute inset-2 rounded-full border-4 border-transparent border-t-indigo-500 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.4s' }} />
        </div>
        <p className="text-sm font-medium text-slate-600 animate-pulse">{label}...</p>
      </div>
    </div>
  );
}

function Guard({ children, pageKey, adminOnly }) {
  const { user, loading, canViewPage, isAdmin } = useAuth();
  if (loading) return <FullPageLoader label="Loading" />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Blocked msg="Admin access required" />;
  if (pageKey && !canViewPage(pageKey)) return <Blocked msg="You don't have permission to view this page." />;
  return children;
}

function Blocked({ msg }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <div className="text-5xl">�</div>
      <p className="text-lg font-semibold text-gray-700">Access Restricted</p>
      <p className="text-sm text-gray-500">{msg}</p>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader label="Starting" />;
  return (
    <Routes>
      <Route path="/login"    element={!user ? <LoginPage />    : <Navigate to="/dashboard" replace />} />
      <Route path="/register" element={!user ? <RegisterPage /> : <Navigate to="/dashboard" replace />} />
      <Route path="/copyright" element={<CopyrightPage />} />
      <Route path="/" element={<Guard><Layout /></Guard>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"        element={<Guard pageKey="dashboard"><DashboardPage /></Guard>} />
        {/* Combined pages */}
        <Route path="asset-list"       element={<Guard pageKey="asset-list"><AssetListCombinedPage /></Guard>} />
        <Route path="ext-asset-list"   element={<Guard pageKey="extended-inventory"><ExtAssetListCombinedPage /></Guard>} />
        {/* Legacy routes � redirect to combined pages */}
        <Route path="add-asset"              element={<Navigate to="/asset-list?tab=add" replace />} />
        <Route path="add-extended-inventory" element={<Navigate to="/ext-asset-list?tab=add" replace />} />
        <Route path="extended-inventory"     element={<Navigate to="/ext-asset-list?tab=list" replace />} />
        {/* Physical assets */}
        <Route path="physical-assets"       element={<Guard pageKey="physical-assets"><PhysicalAssetPage /></Guard>} />
        <Route path="physical-server-list"  element={<Guard pageKey="physical-assets"><PhysicalServerListPage /></Guard>} />
        <Route path="physical-server-models" element={<Guard pageKey="physical-assets"><PhysicalServerModelsPage /></Guard>} />
        {/* Settings */}
        <Route path="configuration"    element={<Guard pageKey="configuration"><ConfigurationPage /></Guard>} />
        <Route path="new-asset-import" element={<Guard adminOnly pageKey="new-asset-import"><NewAssetImportPage /></Guard>} />
        <Route path="excel-smart-import" element={<Guard adminOnly pageKey="excel-smart-import"><ExcelSmartImportPage /></Guard>} />
        <Route path="import-audit-report" element={<Guard adminOnly pageKey="import-audit-report"><ImportAuditReportPage /></Guard>} />
        <Route path="profile"          element={<Guard><ProfilePage /></Guard>} />
        {/* Admin */}
        <Route path="users"            element={<Guard adminOnly pageKey="users"><UsersPage /></Guard>} />
        <Route path="password-control" element={<Guard adminOnly pageKey="password-control"><PasswordControlPage /></Guard>} />
        <Route path="branding"         element={<Guard adminOnly pageKey="branding"><BrandingPage /></Guard>} />
        <Route path="custom-fields"    element={<Guard adminOnly pageKey="custom-fields"><CustomFieldsPage /></Guard>} />
        <Route path="physical-asset-custom-fields" element={<Guard adminOnly pageKey="physical-asset-custom-fields"><PhysicalAssetCustomFieldsPage /></Guard>} />
        <Route path="extended-custom-fields"       element={<Guard adminOnly pageKey="extended-custom-fields"><ExtendedCustomFieldsPage /></Guard>} />
        <Route path="transfer-to-inventory"        element={<Guard adminOnly pageKey="transfer-to-inventory"><TransferToInventoryPage /></Guard>} />
        <Route path="dept-range-management"         element={<Guard adminOnly pageKey="dept-range-management"><DeptRangeManagementPage /></Guard>} />
        <Route path="dashboard-icons"               element={<Guard adminOnly pageKey="dashboard-icons"><DashboardIconsPage /></Guard>} />
        <Route path="dashboard-compliance-config"   element={<Guard adminOnly pageKey="dashboard-compliance-config"><DashboardComplianceConfigPage /></Guard>} />
        <Route path="backup"                         element={<Guard adminOnly pageKey="backup"><BackupPage /></Guard>} />
        <Route path="email-notifications"            element={<Guard adminOnly pageKey="email-notifications"><EmailNotificationsPage /></Guard>} />
        <Route path="audit-explorer"                  element={<Guard adminOnly pageKey="audit-explorer"><AuditExplorerPage /></Guard>} />
        <Route path="column-config"                    element={<Guard adminOnly pageKey="column-config"><ColumnConfigPage /></Guard>} />
        <Route path="report-builder"                   element={<Guard pageKey="report-builder"><ReportBuilderPage /></Guard>} />
        <Route path="software-deployment"              element={<Guard adminOnly pageKey="software-deployment"><SoftwareDeploymentPage /></Guard>} />
        <Route path="tenable-report" element={<Guard pageKey="tenable-report"><TenableReportPage /></Guard>} />
        <Route path="tenable-import" element={<Guard adminOnly pageKey="tenable-import"><TenableImportPage /></Guard>} />
        <Route path="beijing-asset-list" element={<Guard pageKey="beijing-asset-list"><BeijingAssetCombinedPage /></Guard>} />
        <Route path="beijing-asset/:id" element={<Guard pageKey="beijing-asset-list"><BeijingAssetDetailPage /></Guard>} />
        <Route path="beijing-asset-fields" element={<Guard adminOnly pageKey="beijing-asset-fields"><BeijingAssetFieldsPage /></Guard>} />
        <Route path="assets/:id"                     element={<Guard pageKey="asset-list"><AssetDetailPage /></Guard>} />
        <Route path="ext-assets/:id"                 element={<Guard pageKey="extended-inventory"><ExtAssetDetailPage /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrandingProvider>
          <ConfigProvider>
            <BrowserRouter>
              <DeleteConfirmProvider>
                <Toaster position="top-right" toastOptions={{ duration: 4000, style: { fontSize: '13px' } }} />
                <AppRoutes />
              </DeleteConfirmProvider>
            </BrowserRouter>
          </ConfigProvider>
        </BrandingProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
