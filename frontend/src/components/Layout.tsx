import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const ROLE_LABEL = { admin: 'Administrador', financeiro: 'Financeiro', visualizador: 'Visualizador' };

interface NavItem { to: string; label: string; icon: string; adminOnly?: boolean }
const NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Visão geral', items: [{ to: '/', label: 'Dashboard', icon: '◧' }] },
  {
    section: 'Operações',
    items: [
      { to: '/contas-a-receber', label: 'Receitas / A receber', icon: '↓' },
      { to: '/contas-a-pagar', label: 'Despesas / A pagar', icon: '↑' },
      { to: '/fluxo-de-caixa', label: 'Fluxo de caixa', icon: '≋' },
    ],
  },
  {
    section: 'Relatórios',
    items: [
      { to: '/dre', label: 'DRE', icon: '≡' },
      { to: '/balanco', label: 'Balanço patrimonial', icon: '⚖' },
      { to: '/indicadores', label: 'Indicadores', icon: '◔' },
    ],
  },
  {
    section: 'Gestão complementar',
    items: [
      { to: '/contas-bancarias', label: 'Contas bancárias', icon: '▣' },
      { to: '/parceiros', label: 'Clientes e fornecedores', icon: '☺' },
      { to: '/plano-de-contas', label: 'Plano de contas', icon: '☰' },
      { to: '/centros-de-custo', label: 'Centros de custo', icon: '◇' },
      { to: '/orcamento', label: 'Orçamento', icon: '◎' },
      { to: '/lancamentos', label: 'Lançamentos contábeis', icon: '✎' },
    ],
  },
  {
    section: 'Segurança e administração',
    items: [
      { to: '/usuarios', label: 'Usuários e perfis', icon: '⚿', adminOnly: true },
      { to: '/auditoria', label: 'Auditoria', icon: '⌕', adminOnly: true },
      { to: '/configuracoes', label: 'Configurações', icon: '⚙', adminOnly: true },
    ],
  },
];

export function Layout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">R$</span> Finanças</div>
        <nav>
          {NAV.map((s) => {
            const items = s.items.filter((i) => !i.adminOnly || isAdmin);
            if (!items.length) return null;
            return (
              <div key={s.section}>
                <div className="nav-section">{s.section}</div>
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="nav-icon" aria-hidden>{i.icon}</span>
                    {i.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="text-2">Gestão financeira e contábil</span>
          <div className="user">
            <div className="right">
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{user?.name}</div>
              <div className="small">{user && ROLE_LABEL[user.role]}</div>
            </div>
            <Link to="/perfil" className="avatar" title="Meu perfil">{user?.name.charAt(0).toUpperCase()}</Link>
            <button className="btn sm" onClick={logout}>Sair</button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
