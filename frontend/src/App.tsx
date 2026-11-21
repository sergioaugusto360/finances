import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { TitlesPage } from './pages/TitlesPage';
import { CashFlowPage } from './pages/CashFlowPage';
import { DrePage } from './pages/DrePage';
import { BalancePage } from './pages/BalancePage';
import { IndicatorsPage } from './pages/IndicatorsPage';
import { AccountsPage } from './pages/registry/AccountsPage';
import { BankAccountsPage } from './pages/registry/BankAccountsPage';
import { PartnersPage } from './pages/registry/PartnersPage';
import { CostCentersPage } from './pages/registry/CostCentersPage';
import { BudgetPage } from './pages/registry/BudgetPage';
import { JournalPage } from './pages/registry/JournalPage';
import { UsersPage } from './pages/admin/UsersPage';
import { AuditPage } from './pages/admin/AuditPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { ProfilePage } from './pages/admin/ProfilePage';

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  const admin = user.role === 'admin';
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="contas-a-receber" element={<TitlesPage kind="RECEBER" key="receber" />} />
        <Route path="contas-a-pagar" element={<TitlesPage kind="PAGAR" key="pagar" />} />
        <Route path="fluxo-de-caixa" element={<CashFlowPage />} />
        <Route path="dre" element={<DrePage />} />
        <Route path="balanco" element={<BalancePage />} />
        <Route path="indicadores" element={<IndicatorsPage />} />
        <Route path="contas-bancarias" element={<BankAccountsPage />} />
        <Route path="parceiros" element={<PartnersPage />} />
        <Route path="plano-de-contas" element={<AccountsPage />} />
        <Route path="centros-de-custo" element={<CostCentersPage />} />
        <Route path="orcamento" element={<BudgetPage />} />
        <Route path="lancamentos" element={<JournalPage />} />
        <Route path="perfil" element={<ProfilePage />} />
        {admin && <Route path="usuarios" element={<UsersPage />} />}
        {admin && <Route path="auditoria" element={<AuditPage />} />}
        {admin && <Route path="configuracoes" element={<SettingsPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
