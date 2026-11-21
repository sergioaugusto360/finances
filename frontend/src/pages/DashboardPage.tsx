import { Link } from 'react-router-dom';
import { useFetch } from '../lib/useFetch';
import { date, money, monthLabel } from '../lib/format';
import type { DreSummary } from '../lib/types';
import { Alert, Kpi, Loading } from '../components/ui';
import { BarList, CashFlowChart, COLORS, GroupedBars, Legend } from '../components/charts';

interface TitleSum { proximos_30: number; vencido: number; qtd_vencidos: number; total_aberto: number }
interface Dashboard {
  saldo_bancario_total: number;
  contas_bancarias: { id: number; name: string; bank: string | null; saldo: number }[];
  receber: TitleSum;
  pagar: TitleSum;
  mes_atual: DreSummary;
  receitas_despesas_12m: { month: string; receitas: number; despesas: number; resultado: number }[];
  fluxo_caixa_12m: { month: string; entradas: number; saidas: number; saldo: number }[];
  top_despesas_mes: { name: string; valor: number }[];
  proximos_vencimentos: { id: number; kind: 'PAGAR' | 'RECEBER'; description: string; due_date: string; saldo: number; partner_name: string | null }[];
}

export function DashboardPage() {
  const { data, loading, error } = useFetch<Dashboard>('/reports/dashboard');
  if (loading) return <Loading />;
  if (error || !data) return <Alert>{error}</Alert>;

  const m = data.mes_atual;
  const margem = m.receita_liquida ? (m.lucro_liquido / m.receita_liquida) * 100 : null;
  const series = [
    { key: 'receitas', label: 'Receitas', color: COLORS.receitas },
    { key: 'despesas', label: 'Custos e despesas', color: COLORS.despesas },
  ];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Visão consolidada do caixa, resultado e compromissos</p>
        </div>
      </div>

      <div className="grid grid-4">
        <Kpi label="Saldo em bancos" value={money(data.saldo_bancario_total)} tone={data.saldo_bancario_total < 0 ? 'neg' : undefined}
          foot={`${data.contas_bancarias.length} conta(s) ativa(s)`} />
        <Kpi label="A receber (30 dias)" value={money(data.receber.proximos_30)}
          foot={data.receber.vencido > 0 ? <span className="badge critical">{money(data.receber.vencido)} vencido</span> : 'Nenhum título vencido'} />
        <Kpi label="A pagar (30 dias)" value={money(data.pagar.proximos_30)}
          foot={data.pagar.vencido > 0 ? <span className="badge critical">{money(data.pagar.vencido)} vencido</span> : 'Nenhum título vencido'} />
        <Kpi label="Resultado do mês" value={money(m.lucro_liquido)} tone={m.lucro_liquido < 0 ? 'neg' : 'pos'}
          foot={margem != null ? `Margem líquida ${margem.toFixed(1)}%` : 'Sem receitas no mês'} />
      </div>

      <div className="grid grid-3">
        <div className="card span-2">
          <div className="card-header">
            <div><h2>Receitas x custos e despesas</h2><span className="card-sub">Regime de competência — últimos 12 meses</span></div>
            <Legend series={series} />
          </div>
          <GroupedBars data={data.receitas_despesas_12m} xKey="month" series={series} xFormatter={monthLabel} />
        </div>
        <div className="card">
          <div className="card-header"><div><h2>Maiores despesas do mês</h2><span className="card-sub">Por conta contábil</span></div></div>
          <BarList items={data.top_despesas_mes.map((d) => ({ label: d.name, value: d.valor }))} />
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card span-2">
          <div className="card-header"><div><h2>Fluxo de caixa realizado</h2><span className="card-sub">Entradas, saídas e saldo ao fim de cada mês</span></div>
            <Link to="/fluxo-de-caixa" className="btn sm">Detalhar</Link></div>
          <CashFlowChart data={data.fluxo_caixa_12m} xFormatter={monthLabel} />
        </div>
        <div className="card">
          <div className="card-header"><h2>Saldos por conta</h2></div>
          <div className="list">
            {data.contas_bancarias.map((b) => (
              <div className="list-item" key={b.id}>
                <div><div style={{ fontWeight: 600 }}>{b.name}</div><div className="small muted">{b.bank ?? '—'}</div></div>
                <b className={b.saldo < 0 ? 'neg' : ''}>{money(b.saldo)}</b>
              </div>
            ))}
            {!data.contas_bancarias.length && <div className="empty">Cadastre uma conta bancária</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-header"><h2>Resumo do mês (DRE)</h2><Link to="/dre" className="btn sm">Ver DRE</Link></div>
          <table>
            <tbody>
              <tr><td>Receita líquida</td><td className="num">{money(m.receita_liquida)}</td></tr>
              <tr><td>Lucro bruto</td><td className="num">{money(m.lucro_bruto)}</td></tr>
              <tr><td>EBITDA</td><td className="num">{money(m.ebitda)}</td></tr>
              <tr><td>Resultado financeiro</td><td className={`num ${m.resultado_financeiro < 0 ? 'neg' : ''}`}>{money(m.resultado_financeiro)}</td></tr>
              <tr><td><b>Lucro líquido</b></td><td className={`num ${m.lucro_liquido < 0 ? 'neg' : 'pos'}`}><b>{money(m.lucro_liquido)}</b></td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-header"><div><h2>Próximos vencimentos</h2><span className="card-sub">Vencidos e próximos 15 dias</span></div></div>
          <div className="list">
            {data.proximos_vencimentos.map((t) => (
              <div className="list-item" key={t.id}>
                <div>
                  <div style={{ fontWeight: 600 }}>{t.description}</div>
                  <div className="small muted">{t.partner_name ?? '—'} · {date(t.due_date)}</div>
                </div>
                <div className="right">
                  <div><b>{money(t.saldo)}</b></div>
                  <span className={`badge ${t.due_date < today ? 'critical' : t.kind === 'PAGAR' ? 'warning' : 'info'}`}>
                    {t.due_date < today ? 'Vencido' : t.kind === 'PAGAR' ? 'A pagar' : 'A receber'}
                  </span>
                </div>
              </div>
            ))}
            {!data.proximos_vencimentos.length && <div className="empty">Nada a vencer nos próximos 15 dias</div>}
          </div>
        </div>
      </div>
    </>
  );
}
