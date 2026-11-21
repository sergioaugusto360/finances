import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { money, monthName } from '../../lib/format';
import type { Account } from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Field, Loading, Modal } from '../../components/ui';

interface Budget { account_id: number; code: string; name: string; year: number; month: number; amount: number }

export function BudgetPage() {
  const { canWrite } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const list = useFetch<Budget[]>('/budgets', { year });
  const [edit, setEdit] = useState<{ account_id?: number; values: number[] } | null>(null);
  const [err, setErr] = useState('');

  const rows = useMemo(() => {
    const map = new Map<number, { account_id: number; code: string; name: string; values: number[] }>();
    for (const b of list.data ?? []) {
      if (!map.has(b.account_id)) map.set(b.account_id, { account_id: b.account_id, code: b.code, name: b.name, values: Array(12).fill(0) });
      map.get(b.account_id)!.values[b.month - 1] = b.amount;
    }
    return [...map.values()];
  }, [list.data]);

  const remove = async (accountId: number) => {
    if (!confirm('Remover o orçamento desta conta no ano?')) return;
    try { await api.del(`/budgets/${accountId}/${year}`); list.reload(); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <>
      <div className="page-header">
        <div><h1>Orçamento</h1><p>Metas mensais por conta de resultado — comparadas em Indicadores › Orçado x realizado</p></div>
        <div className="toolbar">
          <Field label="Ano"><input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 110 }} /></Field>
          {canWrite && <button className="btn primary" onClick={() => setEdit({ values: Array(12).fill(0) })}>+ Orçar conta</button>}
        </div>
      </div>
      <Alert>{err || list.error}</Alert>
      <div className="card table-wrap">
        {list.loading ? <Loading /> : (
          <table>
            <thead><tr><th>Conta</th>{Array.from({ length: 12 }, (_, i) => <th key={i} className="num">{monthName(i + 1)}</th>)}<th className="num">Total</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.account_id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.code} {r.name}</td>
                  {r.values.map((v, i) => <td key={i} className="num small">{money(v)}</td>)}
                  <td className="num"><b>{money(r.values.reduce((s, v) => s + v, 0))}</b></td>
                  <td className="actions">
                    {canWrite && <button className="btn sm" onClick={() => setEdit({ account_id: r.account_id, values: [...r.values] })}>Editar</button>}
                    {canWrite && <button className="btn sm danger" onClick={() => remove(r.account_id)}>Remover</button>}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={15} className="empty">Nenhum orçamento para {year}</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {edit && <BudgetForm year={year} initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
    </>
  );
}

function BudgetForm({ year, initial, onClose, onSaved }: { year: number; initial: { account_id?: number; values: number[] }; onClose: () => void; onSaved: () => void }) {
  const accounts = useFetch<Account[]>('/accounts', { type: 'RECEITA,DEDUCAO,CUSTO,DESPESA' });
  const [accountId, setAccountId] = useState(initial.account_id ? String(initial.account_id) : '');
  const [values, setValues] = useState(initial.values.map(String));
  const [err, setErr] = useState('');
  const fillAll = () => setValues(Array(12).fill(values[0]));
  const save = async () => {
    try {
      await api.put('/budgets', { account_id: Number(accountId), year, months: values.map((v, i) => ({ month: i + 1, amount: Number(v.replace(',', '.')) || 0 })) });
      onSaved();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Modal title={`Orçamento ${year}`} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save} disabled={!accountId}>Salvar</button></>}>
      <Alert>{err}</Alert>
      <Field label="Conta de resultado">
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={!!initial.account_id}>
          <option value="">Selecione…</option>
          {accounts.data?.filter((a) => a.accepts_entries && a.dre_group).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
        </select>
      </Field>
      {accounts.loading ? <Loading /> : (
        <div className="grid grid-4">
          {values.map((v, i) => (
            <Field key={i} label={monthName(i + 1)}>
              <input inputMode="decimal" value={v} onChange={(e) => setValues(values.map((x, j) => (j === i ? e.target.value : x)))} />
            </Field>
          ))}
        </div>
      )}
      <div><button className="btn sm" onClick={fillAll}>Repetir janeiro em todos os meses</button></div>
    </Modal>
  );
}
