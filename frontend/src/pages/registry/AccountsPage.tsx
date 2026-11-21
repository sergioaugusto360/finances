import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import type { Account } from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Field, Loading, Modal } from '../../components/ui';

const TYPES = { ATIVO: 'Ativo', PASSIVO: 'Passivo', PATRIMONIO: 'Patrimônio líquido', RECEITA: 'Receita', DEDUCAO: 'Dedução', CUSTO: 'Custo', DESPESA: 'Despesa' };
const DRE_GROUPS = {
  RECEITA_BRUTA: 'Receita bruta', DEDUCOES: 'Deduções', CUSTOS: 'Custos', DESPESAS_OPERACIONAIS: 'Despesas operacionais',
  DEPRECIACAO: 'Depreciação', RECEITAS_FINANCEIRAS: 'Receitas financeiras', DESPESAS_FINANCEIRAS: 'Despesas financeiras', IMPOSTOS_LUCRO: 'IRPJ/CSLL',
};

export function AccountsPage() {
  const { canWrite } = useAuth();
  const list = useFetch<Account[]>('/accounts');
  const [edit, setEdit] = useState<Partial<Account> | null>(null);
  const [err, setErr] = useState('');

  const remove = async (a: Account) => {
    if (!confirm(`Excluir a conta ${a.code} ${a.name}?`)) return;
    try { await api.del(`/accounts/${a.id}`); list.reload(); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <>
      <div className="page-header">
        <div><h1>Plano de contas</h1><p>Estrutura contábil que alimenta DRE, balanço e categorias de receitas/despesas</p></div>
        {canWrite && <button className="btn primary" onClick={() => setEdit({ type: 'DESPESA', accepts_entries: true, active: true })}>+ Nova conta</button>}
      </div>
      <Alert>{err || list.error}</Alert>
      <div className="card table-wrap">
        {list.loading ? <Loading /> : (
          <table>
            <thead><tr><th>Código</th><th>Nome</th><th>Tipo</th><th>Classificação</th><th>Grupo DRE</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {list.data?.map((a) => {
                const depth = a.code.split('.').length - 1;
                return (
                  <tr key={a.id}>
                    <td><code>{a.code}</code></td>
                    <td style={{ paddingLeft: 12 + depth * 18, fontWeight: a.accepts_entries ? 400 : 700 }}>{a.name}</td>
                    <td>{TYPES[a.type]}</td>
                    <td className="small">{a.subtype === 'CIRCULANTE' ? 'Circulante' : a.subtype === 'NAO_CIRCULANTE' ? 'Não circulante' : '—'}{!a.accepts_entries && ' · Sintética'}</td>
                    <td className="small">{a.dre_group ? DRE_GROUPS[a.dre_group as keyof typeof DRE_GROUPS] : '—'}</td>
                    <td>{a.active ? <span className="badge good">Ativa</span> : <span className="badge neutral">Inativa</span>}{a.system_key && <span className="badge info" style={{ marginLeft: 4 }}>Sistema</span>}</td>
                    <td className="actions">
                      {canWrite && <button className="btn sm" onClick={() => setEdit(a)}>Editar</button>}
                      {canWrite && !a.system_key && !a.has_entries && <button className="btn sm danger" onClick={() => remove(a)}>Excluir</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {edit && <AccountForm account={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
    </>
  );
}

function AccountForm({ account, onClose, onSaved }: { account: Partial<Account>; onClose: () => void; onSaved: () => void }) {
  const isNew = !account.id;
  const [f, setF] = useState({
    code: account.code ?? '', name: account.name ?? '', type: account.type ?? 'DESPESA', subtype: account.subtype ?? '',
    dre_group: account.dre_group ?? '', accepts_entries: account.accepts_entries ?? true, active: account.active ?? true,
  });
  const [err, setErr] = useState('');
  const isResult = ['RECEITA', 'DEDUCAO', 'CUSTO', 'DESPESA'].includes(f.type);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { ...f, subtype: f.subtype || null, dre_group: isResult ? f.dre_group || null : null };
    try {
      if (isNew) await api.post('/accounts', body); else await api.put(`/accounts/${account.id}`, body);
      onSaved();
    } catch (e2) { setErr((e2 as Error).message); }
  };
  return (
    <Modal title={isNew ? 'Nova conta contábil' : `Editar ${account.code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" form="acc">Salvar</button></>}>
      <form id="acc" className="form-grid" onSubmit={submit}>
        <Alert>{err}</Alert>
        <Field label="Código" hint="Ex.: 7.12 (a conta pai 7 deve existir)"><input value={f.code} disabled={!isNew} onChange={(e) => setF({ ...f, code: e.target.value })} required /></Field>
        <Field label="Tipo">
          <select value={f.type} disabled={!isNew} onChange={(e) => setF({ ...f, type: e.target.value as Account['type'] })}>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Nome" full><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        {!isResult && (
          <Field label="Classificação">
            <select value={f.subtype} onChange={(e) => setF({ ...f, subtype: e.target.value as Account['subtype'] & string })}>
              <option value="">—</option><option value="CIRCULANTE">Circulante</option><option value="NAO_CIRCULANTE">Não circulante</option>
            </select>
          </Field>
        )}
        {isResult && (
          <Field label="Grupo na DRE">
            <select value={f.dre_group} onChange={(e) => setF({ ...f, dre_group: e.target.value })}>
              <option value="">—</option>
              {Object.entries(DRE_GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        )}
        <label className="check"><input type="checkbox" checked={f.accepts_entries} onChange={(e) => setF({ ...f, accepts_entries: e.target.checked })} /> Analítica (aceita lançamentos)</label>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ativa</label>
      </form>
    </Modal>
  );
}
