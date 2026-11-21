import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import type { Partner } from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Field, Loading, Modal } from '../../components/ui';

const KIND = { CLIENTE: 'Cliente', FORNECEDOR: 'Fornecedor', AMBOS: 'Cliente e fornecedor' };

export function PartnersPage() {
  const { canWrite } = useAuth();
  const [filter, setFilter] = useState({ kind: '', search: '' });
  const list = useFetch<Partner[]>('/partners', filter);
  const [edit, setEdit] = useState<Partial<Partner> | null>(null);
  return (
    <>
      <div className="page-header">
        <div><h1>Clientes e fornecedores</h1><p>Cadastro de parceiros comerciais</p></div>
        {canWrite && <button className="btn primary" onClick={() => setEdit({ kind: 'CLIENTE', active: true })}>+ Novo parceiro</button>}
      </div>
      <div className="card">
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <Field label="Tipo"><select value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value })}><option value="">Todos</option><option value="CLIENTE">Clientes</option><option value="FORNECEDOR">Fornecedores</option></select></Field>
          <Field label="Busca"><input placeholder="Nome ou documento" value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} /></Field>
        </div>
        <Alert>{list.error}</Alert>
        {list.loading ? <Loading /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nome</th><th>Tipo</th><th>CPF/CNPJ</th><th>E-mail</th><th>Telefone</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {list.data?.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.name}</b></td><td>{KIND[p.kind]}</td><td>{p.document ?? '—'}</td><td>{p.email ?? '—'}</td><td>{p.phone ?? '—'}</td>
                    <td>{p.active ? <span className="badge good">Ativo</span> : <span className="badge neutral">Inativo</span>}</td>
                    <td className="actions">{canWrite && <button className="btn sm" onClick={() => setEdit(p)}>Editar</button>}</td>
                  </tr>
                ))}
                {!list.data?.length && <tr><td colSpan={7} className="empty">Nenhum parceiro encontrado</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && <PartnerForm partner={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
    </>
  );
}

function PartnerForm({ partner, onClose, onSaved }: { partner: Partial<Partner>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ kind: partner.kind ?? 'CLIENTE', name: partner.name ?? '', document: partner.document ?? '', email: partner.email ?? '', phone: partner.phone ?? '', active: partner.active ?? true });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (partner.id) await api.put(`/partners/${partner.id}`, f); else await api.post('/partners', f);
      onSaved();
    } catch (e2) { setErr((e2 as Error).message); }
  };
  return (
    <Modal title={partner.id ? 'Editar parceiro' : 'Novo parceiro'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" form="partner">Salvar</button></>}>
      <form id="partner" className="form-grid" onSubmit={submit}>
        <Alert>{err}</Alert>
        <Field label="Nome / razão social" full><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Tipo"><select value={f.kind} onChange={set('kind')}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="CPF / CNPJ"><input value={f.document} onChange={set('document')} /></Field>
        <Field label="E-mail"><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Telefone"><input value={f.phone} onChange={set('phone')} /></Field>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ativo</label>
      </form>
    </Modal>
  );
}
