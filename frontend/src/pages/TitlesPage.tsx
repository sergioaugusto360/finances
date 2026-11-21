import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { date, money, monthEndIso, monthStartIso, todayIso } from '../lib/format';
import type { Account, Aging, BankAccount, CostCenter, Partner, Payment, Title } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { Alert, Field, Kpi, Loading, Modal, StatusBadge } from '../components/ui';

type Kind = 'PAGAR' | 'RECEBER';

const CFG = {
  PAGAR: {
    path: '/payables', title: 'Despesas e contas a pagar', subtitle: 'Obrigações com fornecedores, despesas e custos',
    partnerKind: 'FORNECEDOR', partnerLabel: 'Fornecedor', accountTypes: 'DESPESA,CUSTO,DEDUCAO,ATIVO,PASSIVO', payVerb: 'Pagar', payNoun: 'pagamento',
  },
  RECEBER: {
    path: '/receivables', title: 'Receitas e contas a receber', subtitle: 'Valores a receber de clientes e receitas',
    partnerKind: 'CLIENTE', partnerLabel: 'Cliente', accountTypes: 'RECEITA,ATIVO,PASSIVO,PATRIMONIO', payVerb: 'Receber', payNoun: 'recebimento',
  },
} as const;

export function TitlesPage({ kind }: { kind: Kind }) {
  const cfg = CFG[kind];
  const { canWrite } = useAuth();
  const [filters, setFilters] = useState({ start: monthStartIso(-1), end: monthEndIso(2), status: 'ABERTO,PARCIAL', search: '', overdue: '' });
  const list = useFetch<Title[]>(cfg.path, filters);
  const agingData = useFetch<Aging>(`${cfg.path}/aging`);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<Title | null>(null);
  const [detail, setDetail] = useState<Title | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const reload = () => { list.reload(); agingData.reload(); };
  const cancel = async (t: Title) => {
    if (!confirm(`Cancelar o título "${t.description}"? A provisão contábil será estornada.`)) return;
    try {
      await api.post(`${cfg.path}/${t.id}/cancel`);
      setMsg('Título cancelado'); reload();
    } catch (e) { setErr((e as Error).message); }
  };

  const rows = list.data ?? [];
  const total = rows.reduce((s, r) => s + r.saldo, 0);
  const a = agingData.data;

  return (
    <>
      <div className="page-header">
        <div><h1>{cfg.title}</h1><p>{cfg.subtitle}</p></div>
        {canWrite && <button className="btn primary" onClick={() => setCreating(true)}>+ Novo lançamento</button>}
      </div>

      {a && (
        <div className="grid grid-4">
          <Kpi label="Total em aberto" value={money(a.total_aberto)} />
          <Kpi label="A vencer" value={money(a.a_vencer)} />
          <Kpi label="Vencido até 30 dias" value={money(a.vencido_1_30)} tone={a.vencido_1_30 > 0 ? 'neg' : undefined} />
          <Kpi label="Vencido há mais de 30 dias" value={money(Number(a.vencido_31_60) + Number(a.vencido_61_90) + Number(a.vencido_90_mais))}
            tone={Number(a.vencido_31_60) + Number(a.vencido_61_90) + Number(a.vencido_90_mais) > 0 ? 'neg' : undefined}
            foot={`31-60: ${money(a.vencido_31_60)} · 61-90: ${money(a.vencido_61_90)} · +90: ${money(a.vencido_90_mais)}`} />
        </div>
      )}

      <Alert kind="success">{msg}</Alert>
      <Alert>{err || list.error}</Alert>

      <div className="card">
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <Field label="Vencimento de"><input type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} /></Field>
          <Field label="até"><input type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} /></Field>
          <Field label="Situação">
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="ABERTO,PARCIAL">Em aberto</option>
              <option value="LIQUIDADO">Liquidados</option>
              <option value="CANCELADO">Cancelados</option>
              <option value="">Todos</option>
            </select>
          </Field>
          <Field label="Somente vencidos">
            <select value={filters.overdue} onChange={(e) => setFilters({ ...filters, overdue: e.target.value })}>
              <option value="">Não</option><option value="true">Sim</option>
            </select>
          </Field>
          <Field label="Busca"><input placeholder="Descrição, documento, parceiro" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></Field>
          <div className="spacer" />
          <div className="right"><div className="small muted">Saldo listado</div><b style={{ fontSize: 18 }}>{money(total)}</b></div>
        </div>
        {list.loading ? <Loading /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Vencimento</th><th>Descrição</th><th>{cfg.partnerLabel}</th><th>Conta</th><th>Centro de custo</th><th className="num">Valor</th><th className="num">Saldo</th><th>Situação</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td>{date(t.due_date)}</td>
                    <td><a className="clickable" onClick={() => setDetail(t)}>{t.description}</a>{t.document_number && <div className="small muted">Doc. {t.document_number}</div>}</td>
                    <td>{t.partner_name ?? '—'}</td>
                    <td className="small">{t.account_code} {t.account_name}</td>
                    <td className="small">{t.cost_center_name ?? '—'}</td>
                    <td className="num">{money(t.amount)}</td>
                    <td className="num"><b>{money(t.saldo)}</b></td>
                    <td><StatusBadge status={t.status} overdue={t.vencido} /></td>
                    <td>
                      <div className="actions">
                        {canWrite && ['ABERTO', 'PARCIAL'].includes(t.status) && <button className="btn sm primary" onClick={() => setPaying(t)}>{cfg.payVerb}</button>}
                        {canWrite && t.status === 'ABERTO' && <button className="btn sm danger" onClick={() => cancel(t)}>Cancelar</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={9} className="empty">Nenhum título encontrado</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && <TitleForm kind={kind} onClose={() => setCreating(false)} onSaved={(n) => { setCreating(false); setMsg(`${n} título(s) criado(s)`); reload(); }} />}
      {paying && <PayForm kind={kind} title={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); setMsg(`Baixa registrada`); reload(); }} />}
      {detail && <TitleDetail kind={kind} title={detail} onClose={() => setDetail(null)} onChanged={reload} />}
    </>
  );
}

function TitleForm({ kind, onClose, onSaved }: { kind: Kind; onClose: () => void; onSaved: (n: number) => void }) {
  const cfg = CFG[kind];
  const partners = useFetch<Partner[]>('/partners', { kind: cfg.partnerKind });
  const accounts = useFetch<Account[]>('/accounts', { type: cfg.accountTypes });
  const ccs = useFetch<CostCenter[]>('/cost-centers');
  const [f, setF] = useState({ partner_id: '', account_id: '', cost_center_id: '', description: '', document_number: '', issue_date: todayIso(), due_date: todayIso(), amount: '', installments: '1', notes: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = await api.post<{ ids: number[] }>(cfg.path, {
        ...f,
        partner_id: f.partner_id || null, cost_center_id: f.cost_center_id || null,
        amount: Number(f.amount.replace(',', '.')), installments: Number(f.installments),
      });
      onSaved(res.ids.length);
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  };

  const analytic = (accounts.data ?? []).filter((a) => a.accepts_entries && a.active);
  return (
    <Modal title={kind === 'PAGAR' ? 'Nova despesa / conta a pagar' : 'Nova receita / conta a receber'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" form="title-form" disabled={busy}>Salvar</button></>}>
      <form id="title-form" className="form-grid" onSubmit={submit}>
        <Alert>{err}</Alert>
        <Field label="Descrição" full><input value={f.description} onChange={set('description')} required minLength={2} /></Field>
        <Field label={cfg.partnerLabel}>
          <select value={f.partner_id} onChange={set('partner_id')}>
            <option value="">— Não informado —</option>
            {partners.data?.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Nº do documento"><input value={f.document_number} onChange={set('document_number')} /></Field>
        <Field label="Conta contábil (categoria)" full>
          <select value={f.account_id} onChange={set('account_id')} required>
            <option value="">Selecione…</option>
            {analytic.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
        </Field>
        <Field label="Centro de custo">
          <select value={f.cost_center_id} onChange={set('cost_center_id')}>
            <option value="">— Nenhum —</option>
            {ccs.data?.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        </Field>
        <Field label="Valor total (R$)"><input inputMode="decimal" value={f.amount} onChange={set('amount')} required placeholder="0,00" /></Field>
        <Field label="Data de competência / emissão"><input type="date" value={f.issue_date} onChange={set('issue_date')} required /></Field>
        <Field label="Vencimento (1ª parcela)"><input type="date" value={f.due_date} onChange={set('due_date')} required /></Field>
        <Field label="Parcelas" hint="Vencimentos mensais a partir da 1ª parcela"><input type="number" min={1} max={120} value={f.installments} onChange={set('installments')} /></Field>
        <Field label="Observações" full><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}

function PayForm({ kind, title, onClose, onSaved }: { kind: Kind; title: Title; onClose: () => void; onSaved: () => void }) {
  const cfg = CFG[kind];
  const banks = useFetch<BankAccount[]>('/bank-accounts');
  const [f, setF] = useState({ bank_account_id: '', payment_date: todayIso(), amount: String(title.saldo), interest: '0', discount: '0', notes: '' });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const n = (v: string) => Number(v.replace(',', '.')) || 0;
  const net = n(f.amount) + n(f.interest) - n(f.discount);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await api.post(`${cfg.path}/${title.id}/pay`, { ...f, amount: n(f.amount), interest: n(f.interest), discount: n(f.discount) });
      onSaved();
    } catch (e2) { setErr((e2 as Error).message); }
  };

  return (
    <Modal title={`Registrar ${cfg.payNoun}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" form="pay-form">Confirmar</button></>}>
      <div className="alert info">{title.description} — saldo em aberto <b>{money(title.saldo)}</b> (venc. {date(title.due_date)})</div>
      <form id="pay-form" className="form-grid" onSubmit={submit}>
        <Alert>{err}</Alert>
        <Field label="Conta bancária">
          <select value={f.bank_account_id} onChange={set('bank_account_id')} required>
            <option value="">Selecione…</option>
            {banks.data?.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name} ({money(b.saldo)})</option>)}
          </select>
        </Field>
        <Field label={`Data do ${cfg.payNoun}`}><input type="date" value={f.payment_date} onChange={set('payment_date')} required /></Field>
        <Field label="Valor principal" hint="Valor parcial mantém o título em aberto"><input inputMode="decimal" value={f.amount} onChange={set('amount')} required /></Field>
        <Field label="Juros / multa"><input inputMode="decimal" value={f.interest} onChange={set('interest')} /></Field>
        <Field label="Desconto"><input inputMode="decimal" value={f.discount} onChange={set('discount')} /></Field>
        <Field label="Valor líquido movimentado"><input value={money(net)} readOnly /></Field>
        <Field label="Observações" full><input value={f.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}

function TitleDetail({ kind, title, onClose, onChanged }: { kind: Kind; title: Title; onClose: () => void; onChanged: () => void }) {
  const cfg = CFG[kind];
  const { canWrite } = useAuth();
  const d = useFetch<Title & { payments: Payment[] }>(`${cfg.path}/${title.id}`);
  const [err, setErr] = useState('');
  const reverse = async (p: Payment) => {
    if (!confirm('Estornar esta baixa? O lançamento contábil será revertido e o movimento bancário removido.')) return;
    try { await api.del(`${cfg.path}/payments/${p.id}`); d.reload(); onChanged(); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Modal title="Detalhes do título" onClose={onClose} wide>
      <Alert>{err}</Alert>
      <div className="form-grid">
        <Field label="Descrição"><div>{title.description}</div></Field>
        <Field label={cfg.partnerLabel}><div>{title.partner_name ?? '—'}</div></Field>
        <Field label="Conta"><div>{title.account_code} {title.account_name}</div></Field>
        <Field label="Centro de custo"><div>{title.cost_center_name ?? '—'}</div></Field>
        <Field label="Emissão / Vencimento"><div>{date(title.issue_date)} / {date(title.due_date)}</div></Field>
        <Field label="Parcela"><div>{title.installment} de {title.installments_total}</div></Field>
        <Field label="Valor / Pago"><div>{money(title.amount)} / {money(d.data?.paid_amount ?? title.paid_amount)}</div></Field>
        <Field label="Situação"><div><StatusBadge status={d.data?.status ?? title.status} overdue={title.vencido} /></div></Field>
        {title.notes && <Field label="Observações" full><div>{title.notes}</div></Field>}
      </div>
      <h2>Baixas</h2>
      <table>
        <thead><tr><th>Data</th><th>Conta bancária</th><th className="num">Principal</th><th className="num">Juros</th><th className="num">Desconto</th><th>Usuário</th><th /></tr></thead>
        <tbody>
          {d.data?.payments.map((p) => (
            <tr key={p.id}>
              <td>{date(p.payment_date)}</td><td>{p.bank_name}</td>
              <td className="num">{money(p.amount)}</td><td className="num">{money(p.interest)}</td><td className="num">{money(p.discount)}</td>
              <td className="small">{p.user_name}</td>
              <td className="actions">{canWrite && <button className="btn sm danger" onClick={() => reverse(p)}>Estornar</button>}</td>
            </tr>
          ))}
          {!d.data?.payments.length && <tr><td colSpan={7} className="empty">Nenhuma baixa registrada</td></tr>}
        </tbody>
      </table>
    </Modal>
  );
}
