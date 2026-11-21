import { useState, type ReactNode } from 'react';
import { useFetch } from '../lib/useFetch';
import { money, monthEndIso, num, pct, yearStartIso } from '../lib/format';
import { Alert, Field, Loading } from '../components/ui';

interface Indicators {
  liquidez: { corrente: number | null; seca: number | null; imediata: number | null; geral: number | null };
  endividamento: { geral_pct: number | null; composicao_curto_prazo_pct: number | null; capital_terceiros_sobre_pl_pct: number | null };
  rentabilidade: { margem_bruta_pct: number | null; margem_ebitda_pct: number | null; margem_operacional_pct: number | null; margem_liquida_pct: number | null; roe_pct: number | null; roa_pct: number | null };
  atividade: { pmr_dias: number | null; pmp_dias: number | null; capital_circulante_liquido: number; inadimplencia_pct: number | null };
  orcado_vs_realizado: { account_id: number; code: string; name: string; type: string; orcado: number; realizado: number; variacao: number; atingimento_pct: number | null }[];
}

type Tone = 'good' | 'warning' | 'critical' | 'neutral';
const TONE_LABEL: Record<Tone, string> = { good: 'Saudável', warning: 'Atenção', critical: 'Crítico', neutral: 'Sem dados' };

function Indicator({ label, value, help, tone }: { label: string; value: ReactNode; help: string; tone: Tone }) {
  return (
    <div className="card kpi">
      <div className="row"><span className="kpi-label">{label}</span><span className="spacer" /><span className={`badge ${tone}`}>{TONE_LABEL[tone]}</span></div>
      <span className="kpi-value">{value}</span>
      <span className="kpi-foot">{help}</span>
    </div>
  );
}

/** Classifica um indicador: maior é melhor (higher) ou menor é melhor (lower). */
const grade = (v: number | null, good: number, warn: number, dir: 'higher' | 'lower' = 'higher'): Tone => {
  if (v == null) return 'neutral';
  if (dir === 'higher') return v >= good ? 'good' : v >= warn ? 'warning' : 'critical';
  return v <= good ? 'good' : v <= warn ? 'warning' : 'critical';
};

export function IndicatorsPage() {
  const [p, setP] = useState({ start: yearStartIso(), end: monthEndIso() });
  const { data, loading, error } = useFetch<Indicators>('/reports/indicators', p);

  return (
    <>
      <div className="page-header">
        <div><h1>Relatórios e indicadores financeiros</h1><p>Liquidez, endividamento, rentabilidade, prazos médios e orçamento</p></div>
        <div className="toolbar">
          <Field label="De"><input type="date" value={p.start} onChange={(e) => setP({ ...p, start: e.target.value })} /></Field>
          <Field label="Até"><input type="date" value={p.end} onChange={(e) => setP({ ...p, end: e.target.value })} /></Field>
        </div>
      </div>
      <Alert>{error}</Alert>
      {loading || !data ? <Loading /> : (
        <>
          <h2>Liquidez</h2>
          <div className="grid grid-4">
            <Indicator label="Liquidez corrente" value={num(data.liquidez.corrente)} help="Ativo circulante ÷ passivo circulante" tone={grade(data.liquidez.corrente, 1.5, 1)} />
            <Indicator label="Liquidez seca" value={num(data.liquidez.seca)} help="(AC − estoques) ÷ PC" tone={grade(data.liquidez.seca, 1, 0.7)} />
            <Indicator label="Liquidez imediata" value={num(data.liquidez.imediata)} help="Caixa e bancos ÷ PC" tone={grade(data.liquidez.imediata, 0.5, 0.2)} />
            <Indicator label="Liquidez geral" value={num(data.liquidez.geral)} help="Ativo total ÷ passivo exigível" tone={grade(data.liquidez.geral, 1.5, 1)} />
          </div>

          <h2>Rentabilidade</h2>
          <div className="grid grid-3">
            <Indicator label="Margem bruta" value={pct(data.rentabilidade.margem_bruta_pct)} help="Lucro bruto ÷ receita líquida" tone={grade(data.rentabilidade.margem_bruta_pct, 30, 15)} />
            <Indicator label="Margem EBITDA" value={pct(data.rentabilidade.margem_ebitda_pct)} help="EBITDA ÷ receita líquida" tone={grade(data.rentabilidade.margem_ebitda_pct, 15, 5)} />
            <Indicator label="Margem líquida" value={pct(data.rentabilidade.margem_liquida_pct)} help="Lucro líquido ÷ receita líquida" tone={grade(data.rentabilidade.margem_liquida_pct, 10, 0)} />
            <Indicator label="Margem operacional" value={pct(data.rentabilidade.margem_operacional_pct)} help="EBIT ÷ receita líquida" tone={grade(data.rentabilidade.margem_operacional_pct, 10, 0)} />
            <Indicator label="ROE" value={pct(data.rentabilidade.roe_pct)} help="Lucro líquido ÷ patrimônio líquido (período)" tone={grade(data.rentabilidade.roe_pct, 10, 0)} />
            <Indicator label="ROA" value={pct(data.rentabilidade.roa_pct)} help="Lucro líquido ÷ ativo total (período)" tone={grade(data.rentabilidade.roa_pct, 5, 0)} />
          </div>

          <h2>Endividamento e atividade</h2>
          <div className="grid grid-4">
            <Indicator label="Endividamento geral" value={pct(data.endividamento.geral_pct)} help="Passivo exigível ÷ ativo total" tone={grade(data.endividamento.geral_pct, 50, 70, 'lower')} />
            <Indicator label="Dívida de curto prazo" value={pct(data.endividamento.composicao_curto_prazo_pct)} help="PC ÷ passivo exigível" tone={grade(data.endividamento.composicao_curto_prazo_pct, 50, 75, 'lower')} />
            <Indicator label="Capital de terceiros / PL" value={pct(data.endividamento.capital_terceiros_sobre_pl_pct)} help="Passivo exigível ÷ PL" tone={grade(data.endividamento.capital_terceiros_sobre_pl_pct, 100, 200, 'lower')} />
            <Indicator label="Inadimplência" value={pct(data.atividade.inadimplencia_pct)} help="Recebíveis vencidos ÷ total a receber" tone={grade(data.atividade.inadimplencia_pct, 5, 15, 'lower')} />
            <Indicator label="Prazo médio de recebimento" value={data.atividade.pmr_dias == null ? '—' : `${num(data.atividade.pmr_dias, 0)} dias`} help="Clientes ÷ receita bruta diária" tone={grade(data.atividade.pmr_dias, 30, 60, 'lower')} />
            <Indicator label="Prazo médio de pagamento" value={data.atividade.pmp_dias == null ? '—' : `${num(data.atividade.pmp_dias, 0)} dias`} help="Fornecedores ÷ custos e despesas diários" tone={data.atividade.pmp_dias == null ? 'neutral' : 'good'} />
            <Indicator label="Capital circulante líquido" value={money(data.atividade.capital_circulante_liquido)} help="Ativo circulante − passivo circulante" tone={data.atividade.capital_circulante_liquido >= 0 ? 'good' : 'critical'} />
          </div>

          <div className="card">
            <div className="card-header"><div><h2>Orçado x realizado</h2><span className="card-sub">Contas com orçamento definido no período</span></div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Conta</th><th className="num">Orçado</th><th className="num">Realizado</th><th className="num">Variação</th><th className="num">Atingimento</th><th>Avaliação</th></tr></thead>
                <tbody>
                  {data.orcado_vs_realizado.map((b) => {
                    const isRevenue = b.type === 'RECEITA';
                    const okRatio = b.atingimento_pct == null ? null : isRevenue ? b.atingimento_pct >= 100 : b.atingimento_pct <= 100;
                    return (
                      <tr key={b.account_id}>
                        <td>{b.code} {b.name}</td>
                        <td className="num">{money(b.orcado)}</td>
                        <td className="num">{money(b.realizado)}</td>
                        <td className="num">{money(b.variacao)}</td>
                        <td className="num">{pct(b.atingimento_pct)}</td>
                        <td>{okRatio == null ? '—' : okRatio ? <span className="badge good">Dentro da meta</span> : <span className="badge critical">{isRevenue ? 'Abaixo da meta' : 'Acima do orçado'}</span>}</td>
                      </tr>
                    );
                  })}
                  {!data.orcado_vs_realizado.length && <tr><td colSpan={6} className="empty">Nenhum orçamento cadastrado para o período</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
