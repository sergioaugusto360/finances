import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { money, todayIso } from '../../lib/format';
import type { BankAccount } from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Field, Kpi, Loading, Modal } from '../../components/ui';

export function BankAccountsPage() {
  const { canWrite } = useAuth();
  const list = useFetch<BankAccount[]>('/bank-accounts');
  const [edit, setEdit] = useState<Partial<BankAccount> | null>(null);
  const total = (list.data ?? []).filter((b) => b.active).reduce((s, b) => s + b.saldo, 0);

  return (
    <>
      <div className="page-header">
        <div><h1>Contas bancárias</h1><p>Caixa, bancos e aplicações — cada conta gera uma conta contábil em 1.1.1</p></div>
        {canWrite && <button className="btn primary" onClick={() => setEdit({})}>+ Nova conta</button>}
      </div>
      <div className="grid grid-4"><Kpi label="Saldo consolidado" value={money(total)} tone={total < 0 ? 'neg' : undefined} /></div>
      <Alert>{list.error}</Alert>
      <div className="card table-wrap">
        {list.loading ? <Loading /> : (
          <table>
            <thead><tr><th>Nome</th><th>Banco</th><th>Agência / Conta</th><th>Conta contábil</th><th className="num">Saldo atual</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {list.data?.map((b) => (
                <tr key={b.id}>
                  <td><b>{b.name}</b></td><td>{b.bank ?? '—'}</td><td>{[b.agency, b.number].filter(Boolean).join(' / ') || '—'}</td>
                  <td><code>{b.account_code}</code></td>
                  <td className={`num ${b.saldo < 0 ? 'neg' : ''}`}><b>{money(b.saldo)}</b></td>
                  <td>{b.active ? <span className="badge good">Ativa</span> : <span className="badge neutral">Inativa</span>}</td>
                  <td className="actions">{canWrite && <button className="btn sm" onClick={() => setEdit(b)}>Editar</button>}</td>
                </tr>
              ))}
              {!list.data?.length && <tr><td colSpan={7} className="empty">Nenhuma conta cadastrada</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {edit && <BankForm bank={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
    </>
  );
}

function BankForm({ bank, onClose, onSaved }: { bank: Partial<BankAccount>; onClose: () => void; onSaved: () => void }) {
  const isNew = !bank.id;
  const [f, setF] = useState({ name: bank.name ?? '', bank: bank.bank ?? '', agency: bank.agency ?? '', number: bank.number ?? '', initial_balance: '0', opening_date: todayIso(), active: bank.active ?? true });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (isNew) await api.post('/bank-accounts', { ...f, initial_balance: Number(f.initial_balance.replace(',', '.')) });
      else await api.put(`/bank-accounts/${bank.id}`, { name: f.name, bank: f.bank, agency: f.agency, number: f.number, active: f.active });
      onSaved();
    } catch (e2) { setErr((e2 as Error).message); }
  };
  return (
    <Modal title={isNew ? 'Nova conta bancária' : 'Editar conta bancária'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" form="bank">Salvar</button></>}>
      <form id="bank" className="form-grid" onSubmit={submit}>
        <Alert>{err}</Alert>
        <Field label="Nome" full><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Banco"><input value={f.bank} onChange={set('bank')} /></Field>
        <Field label="Agência"><input value={f.agency} onChange={set('agency')} /></Field>
        <Field label="Número da conta"><input value={f.number} onChange={set('number')} /></Field>
        {isNew ? (
          <>
            <Field label="Saldo inicial (R$)" hint="Lançado contra Saldos Iniciais de Implantação (PL)"><input inputMode="decimal" value={f.initial_balance} onChange={set('initial_balance')} /></Field>
            <Field label="Data do saldo inicial"><input type="date" value={f.opening_date} onChange={set('opening_date')} /></Field>
          </>
        ) : (
          <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ativa</label>
        )}
      </form>
    </Modal>
  );
}
