import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { date, money, monthLabel, todayIso, yearStartIso, monthEndIso } from '../lib/format';
import type { Account, BankAccount, CostCenter } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { Alert, Field, Kpi, Loading, Modal, Tabs } from '../components/ui';
import { BalanceLine, CashFlowChart } from '../components/charts';

interface Flow { entradas: number; saidas: number; liquido: number }
interface CashFlow {
  saldo_inicial: number; saldo_final: number; variacao_liquida: number;
  atividades: { operacional: Flow; investimento: Flow; financiamento: Flow; saldos_iniciais: Flow; transferencias: Flow };
  mensal: { month: string; entradas: number; saidas: number; liquido: number; saldo: number }[];
  movimentos: { id: number; tx_date: string; direction: 'ENTRADA' | 'SAIDA'; amount: number; description: string; activity: string; source: string; bank_name: string }[];
}
interface Projection {
  saldo_atual: number; total_entradas: number; total_saidas: number; saldo_projetado: number; menor_saldo: number;
  serie: { day: string; entradas: number; saidas: number; saldo: number }[];
}

const ACT_LABEL: Record<string, string> = {
  OPERACIONAL: 'Operacional', INVESTIMENTO: 'Investimento', FINANCIAMENTO: 'Financiamento', TRANSFERENCIA: 'Transferência', SALDO_INICIAL: 'Saldo inicial',
};

export function CashFlowPage() {
  const { canWrite } = useAuth();
  const [tab, setTab] = useState<'realizado' | 'projetado'>('realizado');
  const [p, setP] = useState({ start: yearStartIso(), end: monthEndIso(), bank_account_id: '' });
  const [days, setDays] = useState(90);
  const banks = useFetch<BankAccount[]>('/bank-accounts');
  const cf = useFetch<CashFlow>(tab === 'realizado' ? '/reports/cash-flow' : null, p);
  const proj = useFetch<Projection>(tab === 'projetado' ? '/reports/cash-projection' : null, { days });
  const [modal, setModal] = useState<'mov' | 'transf' | null>(null);
  const [msg, setMsg] = useState('');

  return (
    <>
      <div className="page-header">
        <div><h1>Fluxo de caixa</h1><p>Demonstração do fluxo de caixa (método direto) e projeção por vencimentos</p></div>
        {canWrite && (
          <div className="row">
            <button className="btn" onClick={() => setModal('transf')}>Transferência</button>
            <button className="btn primary" onClick={() => setModal('mov')}>+ Movimento avulso</button>
          </div>
        )}
      </div>
      <Alert kind="success">{msg}</Alert>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'realizado', label: 'Realizado (DFC)' }, { value: 'projetado', label: 'Projetado' }]} />

      {tab === 'realizado' && (
        <>
          <div className="toolbar">
            <Field label="De"><input type="date" value={p.start} onChange={(e) => setP({ ...p, start: e.target.value })} /></Field>
            <Field label="Até"><input type="date" value={p.end} onChange={(e) => setP({ ...p, end: e.target.value })} /></Field>
            <Field label="Conta bancária">
              <select value={p.bank_account_id} onChange={(e) => setP({ ...p, bank_account_id: e.target.value })}>
                <option value="">Todas (consolidado)</option>
                {banks.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <button className="btn no-print" onClick={() => window.print()}>Imprimir</button>
          </div>
          <Alert>{cf.error}</Alert>
          {cf.loading || !cf.data ? <Loading /> : (
            <>
              <div className="grid grid-4">
                <Kpi label="Saldo inicial" value={money(cf.data.saldo_inicial)} />
                <Kpi label="Entradas operacionais" value={money(cf.data.atividades.operacional.entradas)} />
                <Kpi label="Saídas operacionais" value={money(cf.data.atividades.operacional.saidas)} />
                <Kpi label="Saldo final" value={money(cf.data.saldo_final)} tone={cf.data.saldo_final < 0 ? 'neg' : undefined}
                  foot={`Variação ${money(cf.data.variacao_liquida)}`} />
              </div>
              <div className="grid grid-3">
                <div className="card span-2">
                  <div className="card-header"><h2>Evolução mensal</h2></div>
                  <CashFlowChart data={cf.data.mensal} xFormatter={monthLabel} />
                </div>
                <div className="card">
                  <div className="card-header"><h2>DFC — método direto</h2></div>
                  <table className="report-table">
                    <tbody>
                      <tr className="row-group"><td>Saldo inicial de caixa</td><td className="num">{money(cf.data.saldo_inicial)}</td></tr>
                      {([['Atividades operacionais', cf.data.atividades.operacional], ['Atividades de investimento', cf.data.atividades.investimento], ['Atividades de financiamento', cf.data.atividades.financiamento]] as const).map(([label, f]) => (
                        <FlowRows key={label} label={label} f={f} />
                      ))}
                      {cf.data.atividades.saldos_iniciais.liquido !== 0 && <tr><td>Saldos de implantação</td><td className="num">{money(cf.data.atividades.saldos_iniciais.liquido)}</td></tr>}
                      <tr className="row-total"><td>Variação líquida de caixa</td><td className="num">{money(cf.data.variacao_liquida)}</td></tr>
                      <tr className="row-result"><td>Saldo final de caixa</td><td className="num">{money(cf.data.saldo_final)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><h2>Movimentações</h2><span className="card-sub">Últimas 500 no período</span></div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Data</th><th>Descrição</th><th>Conta</th><th>Atividade</th><th className="num">Entrada</th><th className="num">Saída</th></tr></thead>
                    <tbody>
                      {cf.data.movimentos.map((m) => (
                        <tr key={m.id}>
                          <td>{date(m.tx_date)}</td><td>{m.description}</td><td>{m.bank_name}</td>
                          <td><span className="badge neutral">{ACT_LABEL[m.activity]}</span></td>
                          <td className="num pos">{m.direction === 'ENTRADA' ? money(m.amount) : ''}</td>
                          <td className="num neg">{m.direction === 'SAIDA' ? money(m.amount) : ''}</td>
                        </tr>
                      ))}
                      {!cf.data.movimentos.length && <tr><td colSpan={6} className="empty">Sem movimentações</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'projetado' && (
        <>
          <div className="toolbar">
            <Field label="Horizonte">
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} dias</option>)}
              </select>
            </Field>
          </div>
          {proj.loading || !proj.data ? <Loading /> : (
            <>
              <div className="grid grid-4">
                <Kpi label="Saldo atual" value={money(proj.data.saldo_atual)} />
                <Kpi label="Entradas previstas" value={money(proj.data.total_entradas)} foot="Contas a receber em aberto" />
                <Kpi label="Saídas previstas" value={money(proj.data.total_saidas)} foot="Contas a pagar em aberto" />
                <Kpi label="Saldo projetado" value={money(proj.data.saldo_projetado)} tone={proj.data.saldo_projetado < 0 ? 'neg' : 'pos'}
                  foot={proj.data.menor_saldo < 0 ? <span className="badge critical">Saldo negativo previsto: {money(proj.data.menor_saldo)}</span> : `Menor saldo: ${money(proj.data.menor_saldo)}`} />
              </div>
              <div className="card">
                <div className="card-header"><div><h2>Saldo projetado</h2><span className="card-sub">Títulos vencidos considerados na data de hoje</span></div></div>
                <BalanceLine data={proj.data.serie} xKey="day" yKey="saldo" label="Saldo projetado" xFormatter={date} />
              </div>
              <div className="card table-wrap">
                <table>
                  <thead><tr><th>Data</th><th className="num">Entradas</th><th className="num">Saídas</th><th className="num">Saldo projetado</th></tr></thead>
                  <tbody>
                    {proj.data.serie.map((d) => (
                      <tr key={d.day}><td>{date(d.day)}</td><td className="num">{money(d.entradas)}</td><td className="num">{money(d.saidas)}</td>
                        <td className={`num ${d.saldo < 0 ? 'neg' : ''}`}><b>{money(d.saldo)}</b></td></tr>
                    ))}
                    {!proj.data.serie.length && <tr><td colSpan={4} className="empty">Nenhum título em aberto no horizonte</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {modal === 'mov' && <ManualTxForm banks={banks.data ?? []} onClose={() => setModal(null)} onSaved={() => { setModal(null); setMsg('Movimento registrado'); cf.reload(); banks.reload(); }} />}
      {modal === 'transf' && <TransferForm banks={banks.data ?? []} onClose={() => setModal(null)} onSaved={() => { setModal(null); setMsg('Transferência registrada'); cf.reload(); banks.reload(); }} />}
    </>
  );
}

function FlowRows({ label, f }: { label: string; f: Flow }) {
  return (
    <>
      <tr className="row-section"><td colSpan={2}>{label}</td></tr>
      <tr className="row-account"><td>Recebimentos</td><td className="num">{money(f.entradas)}</td></tr>
      <tr className="row-account"><td>Pagamentos</td><td className="num">({money(f.saidas)})</td></tr>
      <tr className="row-group"><td>Caixa líquido</td><td className={`num ${f.liquido < 0 ? 'neg' : ''}`}>{money(f.liquido)}</td></tr>
    </>
  );
}

function ManualTxForm({ banks, onClose, onSaved }: { banks: BankAccount[]; onClose: () => void; onSaved: () => void }) {
  const accounts = useFetch<Account[]>('/accounts');
  const ccs = useFetch<CostCenter[]>('/cost-centers');
  const [f, setF] = useState({ bank_account_id: '', tx_date: todayIso(), direction: 'SAIDA', amount: '', description: '', activity: 'OPERACIONAL', counterpart_account_id: '', cost_center_id: '' });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/bank-transactions', { ...f, amount: Number(f.amount.replace(',', '.')), cost_center_id: f.cost_center_id || null });
      onSaved();
    } catch (e2) { setErr((e2 as Error).message); }
  };
  const options = (accounts.data ?? []).filter((a) => a.accepts_entries && a.active && !a.code.startsWith('1.1.1.'));
  return (
    <Modal title="Movimento bancário avulso" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" form="mtx">Salvar</button></>}>
      <div className="alert info">Use para tarifas, rendimentos, aportes, empréstimos, compra de imobilizado etc. A contrapartida contábil é obrigatória.</div>
      <form id="mtx" className="form-grid" onSubmit={submit}>
        <Alert>{err}</Alert>
        <Field label="Conta bancária"><select value={f.bank_account_id} onChange={set('bank_account_id')} required><option value="">Selecione…</option>{banks.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Data"><input type="date" value={f.tx_date} onChange={set('tx_date')} required /></Field>
        <Field label="Tipo"><select value={f.direction} onChange={set('direction')}><option value="ENTRADA">Entrada</option><option value="SAIDA">Saída</option></select></Field>
        <Field label="Valor (R$)"><input inputMode="decimal" value={f.amount} onChange={set('amount')} required /></Field>
        <Field label="Descrição" full><input value={f.description} onChange={set('description')} required /></Field>
        <Field label="Atividade (DFC)"><select value={f.activity} onChange={set('activity')}><option value="OPERACIONAL">Operacional</option><option value="INVESTIMENTO">Investimento</option><option value="FINANCIAMENTO">Financiamento</option></select></Field>
        <Field label="Centro de custo"><select value={f.cost_center_id} onChange={set('cost_center_id')}><option value="">— Nenhum —</option>{ccs.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Contrapartida contábil" full>
          <select value={f.counterpart_account_id} onChange={set('counterpart_account_id')} required>
            <option value="">Selecione…</option>
            {options.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
        </Field>
      </form>
    </Modal>
  );
}

function TransferForm({ banks, onClose, onSaved }: { banks: BankAccount[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ from_id: '', to_id: '', amount: '', tx_date: todayIso(), description: '' });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try { await api.post('/transfers', { ...f, amount: Number(f.amount.replace(',', '.')) }); onSaved(); } catch (e2) { setErr((e2 as Error).message); }
  };
  const active = banks.filter((b) => b.active);
  return (
    <Modal title="Transferência entre contas" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" form="trf">Transferir</button></>}>
      <form id="trf" className="form-grid" onSubmit={submit}>
        <Alert>{err}</Alert>
        <Field label="Origem"><select value={f.from_id} onChange={set('from_id')} required><option value="">Selecione…</option>{active.map((b) => <option key={b.id} value={b.id}>{b.name} ({money(b.saldo)})</option>)}</select></Field>
        <Field label="Destino"><select value={f.to_id} onChange={set('to_id')} required><option value="">Selecione…</option>{active.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Valor (R$)"><input inputMode="decimal" value={f.amount} onChange={set('amount')} required /></Field>
        <Field label="Data"><input type="date" value={f.tx_date} onChange={set('tx_date')} required /></Field>
        <Field label="Descrição" full><input value={f.description} onChange={set('description')} /></Field>
      </form>
    </Modal>
  );
}
