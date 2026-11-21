import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { dateTime } from '../../lib/format';
import type { Role } from '../../lib/types';
import { Alert, Field, Loading, Modal } from '../../components/ui';

interface UserRow { id: number; name: string; email: string; role: Role; active: boolean; locked: boolean; last_login_at: string | null }

const ROLES: Record<Role, { label: string; desc: string }> = {
  admin: { label: 'Administrador', desc: 'Acesso total, inclusive usuários, auditoria e configurações' },
  financeiro: { label: 'Financeiro', desc: 'Cria e altera lançamentos, títulos, baixas e cadastros' },
  visualizador: { label: 'Visualizador', desc: 'Somente consulta dashboards e relatórios' },
};

export function UsersPage() {
  const list = useFetch<UserRow[]>('/admin/users');
  const [edit, setEdit] = useState<Partial<UserRow> | null>(null);
  return (
    <>
      <div className="page-header">
        <div><h1>Usuários e perfis de acesso</h1><p>Controle de acesso baseado em perfis (RBAC)</p></div>
        <button className="btn primary" onClick={() => setEdit({ role: 'financeiro', active: true })}>+ Novo usuário</button>
      </div>
      <div className="grid grid-3">
        {Object.entries(ROLES).map(([k, r]) => (
          <div className="card" key={k}><h2>{r.label}</h2><p className="text-2 small" style={{ marginBottom: 0 }}>{r.desc}</p></div>
        ))}
      </div>
      <Alert>{list.error}</Alert>
      <div className="card table-wrap">
        {list.loading ? <Loading /> : (
          <table>
            <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Último acesso</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {list.data?.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b></td><td>{u.email}</td><td>{ROLES[u.role].label}</td>
                  <td className="small">{u.last_login_at ? dateTime(u.last_login_at) : 'Nunca'}</td>
                  <td>
                    {u.locked ? <span className="badge critical">Bloqueado</span> : u.active ? <span className="badge good">Ativo</span> : <span className="badge neutral">Inativo</span>}
                  </td>
                  <td className="actions"><button className="btn sm" onClick={() => setEdit(u)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && <UserForm user={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
    </>
  );
}

function UserForm({ user, onClose, onSaved }: { user: Partial<UserRow>; onClose: () => void; onSaved: () => void }) {
  const isNew = !user.id;
  const [f, setF] = useState({ name: user.name ?? '', email: user.email ?? '', role: user.role ?? 'financeiro', active: user.active ?? true, password: '' });
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (isNew) await api.post('/admin/users', f);
      else await api.put(`/admin/users/${user.id}`, { name: f.name, role: f.role, active: f.active, password: f.password });
      onSaved();
    } catch (e2) { setErr((e2 as Error).message); }
  };
  return (
    <Modal title={isNew ? 'Novo usuário' : 'Editar usuário'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" form="user">Salvar</button></>}>
      <form id="user" className="form-grid" onSubmit={submit}>
        <Alert>{err}</Alert>
        <Field label="Nome" full><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="E-mail"><input type="email" value={f.email} disabled={!isNew} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label="Perfil">
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
          </select>
        </Field>
        <Field label={isNew ? 'Senha' : 'Nova senha (opcional)'} hint="Mín. 8 caracteres com maiúscula, minúscula e número" full>
          <input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required={isNew} />
        </Field>
        {!isNew && <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ativo (salvar também desbloqueia o usuário)</label>}
      </form>
    </Modal>
  );
}
