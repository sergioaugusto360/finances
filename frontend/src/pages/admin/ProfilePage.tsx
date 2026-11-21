import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Field } from '../../components/ui';

export function ProfilePage() {
  const { user } = useAuth();
  const [f, setF] = useState({ current_password: '', new_password: '', confirm: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(''); setErr('');
    if (f.new_password !== f.confirm) return setErr('A confirmação não confere com a nova senha');
    try {
      await api.post('/auth/change-password', { current_password: f.current_password, new_password: f.new_password });
      setMsg('Senha alterada com sucesso');
      setF({ current_password: '', new_password: '', confirm: '' });
    } catch (e2) { setErr((e2 as Error).message); }
  };
  return (
    <>
      <div className="page-header"><div><h1>Meu perfil</h1><p>{user?.name} · {user?.email}</p></div></div>
      <form className="card form-grid" onSubmit={submit} style={{ maxWidth: 560 }}>
        <h2 className="full">Alterar senha</h2>
        <Alert kind="success">{msg}</Alert>
        <Alert>{err}</Alert>
        <Field label="Senha atual" full><input type="password" autoComplete="current-password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} required /></Field>
        <Field label="Nova senha" hint="Mín. 8 caracteres com maiúscula, minúscula e número"><input type="password" autoComplete="new-password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} required /></Field>
        <Field label="Confirmar nova senha"><input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required /></Field>
        <div className="full"><button className="btn primary">Alterar senha</button></div>
      </form>
    </>
  );
}
