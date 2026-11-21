import { useState } from 'react';
import { useFetch } from '../lib/useFetch';
import { date, money, todayIso } from '../lib/format';
import { Alert, Field, Kpi, Loading } from '../components/ui';

interface Row { id: number; code: string; name: string; balance: number }
interface Group { total: number; contas: Row[] }
interface Balance {
  as_of: string;
  ativo: { circulante: Group; nao_circulante: Group; total: number };
  passivo: { circulante: Group; nao_circulante: Group; total: number };
  patrimonio_liquido: Group;
  passivo_mais_pl: number;
  balanceado: boolean;
}

function Section({ title, group }: { title: string; group: Group }) {
  return (
    <>
      <tr className="row-group"><td>{title}</td><td className="num">{money(group.total)}</td></tr>
      {group.contas.map((c) => (
        <tr className="row-account" key={`${c.code}-${c.id}`}><td>{c.code} {c.name}</td><td className={`num ${c.balance < 0 ? 'neg' : ''}`}>{money(c.balance)}</td></tr>
      ))}
      {!group.contas.length && <tr className="row-account"><td className="muted">Sem saldo</td><td /></tr>}
    </>
  );
}

export function BalancePage() {
  const [asOf, setAsOf] = useState(todayIso());
  const { data, loading, error } = useFetch<Balance>('/reports/balance-sheet', { as_of: asOf });

  return (
    <>
      <div className="page-header">
        <div><h1>Balanço patrimonial</h1><p>Posição de ativos, passivos e patrimônio líquido</p></div>
        <div className="toolbar">
          <Field label="Posição em"><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
          <button className="btn no-print" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>
      <Alert>{error}</Alert>
      {loading || !data ? <Loading /> : (
        <>
          <div className="grid grid-4">
            <Kpi label="Ativo total" value={money(data.ativo.total)} />
            <Kpi label="Passivo total" value={money(data.passivo.total)} />
            <Kpi label="Patrimônio líquido" value={money(data.patrimonio_liquido.total)} tone={data.patrimonio_liquido.total < 0 ? 'neg' : undefined} />
            <Kpi label="Conferência" value={data.balanceado ? 'Balanceado' : 'Divergente'} tone={data.balanceado ? 'pos' : 'neg'}
              foot={data.balanceado ? <span className="badge good">Ativo = Passivo + PL</span> : <span className="badge critical">Diferença {money(data.ativo.total - data.passivo_mais_pl)}</span>} />
          </div>
          <div className="grid grid-2">
            <div className="card table-wrap">
              <div className="card-header"><h2>Ativo</h2><span className="card-sub">em {date(data.as_of)}</span></div>
              <table className="report-table">
                <tbody>
                  <Section title="Ativo circulante" group={data.ativo.circulante} />
                  <Section title="Ativo não circulante" group={data.ativo.nao_circulante} />
                  <tr className="row-result"><td>TOTAL DO ATIVO</td><td className="num">{money(data.ativo.total)}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="card table-wrap">
              <div className="card-header"><h2>Passivo e patrimônio líquido</h2><span className="card-sub">em {date(data.as_of)}</span></div>
              <table className="report-table">
                <tbody>
                  <Section title="Passivo circulante" group={data.passivo.circulante} />
                  <Section title="Passivo não circulante" group={data.passivo.nao_circulante} />
                  <Section title="Patrimônio líquido" group={data.patrimonio_liquido} />
                  <tr className="row-result"><td>TOTAL DO PASSIVO + PL</td><td className="num">{money(data.passivo_mais_pl)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
