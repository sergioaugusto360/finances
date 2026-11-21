import { Fragment, useState } from 'react';
import { useFetch } from '../lib/useFetch';
import { money, monthEndIso, monthName, pct, yearStartIso } from '../lib/format';
import type { CostCenter, DreSummary } from '../lib/types';
import { Alert, Field, Loading, Tabs } from '../components/ui';

interface DreLine {
  key: string; label: string; value: number; level: 'grupo' | 'total' | 'resultado'; sign: 1 | -1; percent_rl: number | null;
  accounts: { account_id: number; code: string; name: string; value: number }[];
}
interface Dre { period: { start: string; end: string }; summary: DreSummary; lines: DreLine[] }

const MONTHLY_ROWS: { key: keyof DreSummary; label: string; strong?: boolean }[] = [
  { key: 'receita_bruta', label: 'Receita bruta' },
  { key: 'deducoes', label: '(-) Deduções' },
  { key: 'receita_liquida', label: 'Receita líquida', strong: true },
  { key: 'custos', label: '(-) Custos' },
  { key: 'lucro_bruto', label: 'Lucro bruto', strong: true },
  { key: 'despesas_operacionais', label: '(-) Despesas operacionais' },
  { key: 'ebitda', label: 'EBITDA', strong: true },
  { key: 'depreciacao', label: '(-) Depreciação' },
  { key: 'resultado_financeiro', label: '(+/-) Resultado financeiro' },
  { key: 'impostos_lucro', label: '(-) IRPJ/CSLL' },
  { key: 'lucro_liquido', label: 'Lucro líquido', strong: true },
];

export function DrePage() {
  const [tab, setTab] = useState<'periodo' | 'mensal'>('periodo');
  const [p, setP] = useState({ start: yearStartIso(), end: monthEndIso(), cost_center_id: '' });
  const [year, setYear] = useState(new Date().getFullYear());
  const ccs = useFetch<CostCenter[]>('/cost-centers');
  const dre = useFetch<Dre>(tab === 'periodo' ? '/reports/dre' : null, p);
  const monthly = useFetch<(DreSummary & { month: number })[]>(tab === 'mensal' ? '/reports/dre-monthly' : null, { year, cost_center_id: p.cost_center_id });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <>
      <div className="page-header">
        <div><h1>Demonstração do Resultado do Exercício</h1><p>Regime de competência, estrutura conforme Lei 6.404/76</p></div>
        <button className="btn no-print" onClick={() => window.print()}>Imprimir</button>
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'periodo', label: 'Por período' }, { value: 'mensal', label: 'Comparativo mensal' }]} />
      <div className="toolbar">
        {tab === 'periodo' ? (
          <>
            <Field label="De"><input type="date" value={p.start} onChange={(e) => setP({ ...p, start: e.target.value })} /></Field>
            <Field label="Até"><input type="date" value={p.end} onChange={(e) => setP({ ...p, end: e.target.value })} /></Field>
          </>
        ) : (
          <Field label="Ano"><input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 110 }} /></Field>
        )}
        <Field label="Centro de custo">
          <select value={p.cost_center_id} onChange={(e) => setP({ ...p, cost_center_id: e.target.value })}>
            <option value="">Todos</option>
            {ccs.data?.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        </Field>
      </div>
      <Alert>{dre.error || monthly.error}</Alert>

      {tab === 'periodo' && (dre.loading || !dre.data ? <Loading /> : (
        <div className="card table-wrap">
          <table className="report-table">
            <thead><tr><th>Descrição</th><th className="num">Valor</th><th className="num">% Receita líquida</th></tr></thead>
            <tbody>
              {dre.data.lines.map((l) => (
                <Fragment key={l.key}>
                  <tr className={l.level === 'resultado' ? 'row-result' : l.level === 'total' ? 'row-total' : 'row-group'}
                    onClick={() => l.accounts.length && setOpen({ ...open, [l.key]: !open[l.key] })} style={{ cursor: l.accounts.length ? 'pointer' : undefined }}>
                    <td>{l.accounts.length ? (open[l.key] ? '▾ ' : '▸ ') : ''}{l.label}</td>
                    <td className={`num ${l.level !== 'grupo' && l.value < 0 ? 'neg' : ''}`}>{l.sign < 0 && l.value ? `(${money(l.value)})` : money(l.value)}</td>
                    <td className="num">{pct(l.percent_rl)}</td>
                  </tr>
                  {open[l.key] && l.accounts.map((a) => (
                    <tr className="row-account" key={a.account_id}><td>{a.code} {a.name}</td><td className="num">{money(a.value)}</td><td /></tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {tab === 'mensal' && (monthly.loading || !monthly.data ? <Loading /> : (
        <div className="card table-wrap">
          <table className="report-table">
            <thead>
              <tr><th>Linha</th>{monthly.data.map((m) => <th key={m.month} className="num">{monthName(m.month)}</th>)}<th className="num">Total</th></tr>
            </thead>
            <tbody>
              {MONTHLY_ROWS.map((r) => {
                const total = monthly.data!.reduce((s, m) => s + m[r.key], 0);
                return (
                  <tr key={r.key} className={r.key === 'lucro_liquido' ? 'row-result' : r.strong ? 'row-total' : ''}>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.label}</td>
                    {monthly.data!.map((m) => <td key={m.month} className={`num ${m[r.key] < 0 ? 'neg' : ''}`}>{money(m[r.key])}</td>)}
                    <td className={`num ${total < 0 ? 'neg' : ''}`}><b>{money(total)}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
