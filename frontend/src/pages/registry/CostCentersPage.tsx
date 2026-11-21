import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import type { CostCenter } from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Field, Loading, Modal } from '../../components/ui';

export function CostCentersPage() {
  const { canWrite } = useAuth();
  const list = useFetch<CostCenter[]>('/cost-centers');
  const [edit, setEdit] = useState<Partial<CostCenter> | null>(null);
  return (
    <>
      <div className="page-header">
        <div><h1>Centros de custo</h1><p>Departamentos e unidades para análise gerencial (a DRE pode ser filtrada por centro de custo)</p></div>
        {canWrite && <button className="btn primary" onClick={() => setEdit({ active: true })}>+ Novo centro</button>}
      </div>
      <Alert>{list.error}</Alert>
      <div className="card table-wrap">
        {list.loading ? <Loading /> : (
          <table>
            <thead><tr><th>Código</th><th>Nome</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {list.data?.map((c) => (
                <tr key={c.id}>
                  <td><code>{c.code}</code></td><td>{c.name}</td>
                  <td>{c.active ? <span className="badge good">Ativo</span> : <span className="badge neutral">Inativo</span>}</td>
                  <td className="actions">{canWrite && <button className="btn sm" onClick={() => setEdit(c)}>Editar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && <CcForm cc={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
    </>
  );
}

function CcForm({ cc, onClose, onSaved }: { cc: Partial<CostCenter>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ code: cc.code ?? '', name: cc.name ?? '', active: cc.active ?? true });
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try { if (cc.id) await api.put(`/cost-centers/${cc.id}`, f); else await api.post('/cost-centers', f); onSaved(); } catch (e2) { setErr((e2 as Error).message); }
  };
  return (
    <Modal title={cc.id ? 'Editar centro de custo' : 'Novo centro de custo'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" form="cc">Salvar</button></>}>
      <form id="cc" className="form-grid" onSubmit={submit}>
        <Alert>{err}</Alert>
        <Field label="Código"><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required /></Field>
        <Field label="Nome"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ativo</label>
      </form>
    </Modal>
  );
}
