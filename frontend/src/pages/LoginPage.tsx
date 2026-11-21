import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Alert, Field } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ color: 'var(--text)', padding: 0 }}><span className="brand-mark" style={{ color: '#fff' }}>R$</span> Finanças</div>
        <div>
          <h1>Entrar</h1>
          <p className="text-2" style={{ margin: '4px 0 0' }}>Acesse o painel de gestão financeira</p>
        </div>
        <Alert>{error}</Alert>
        <Field label="E-mail">
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label="Senha">
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <button className="btn primary" disabled={busy} style={{ justifyContent: 'center' }}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <span className="small muted">Após 5 tentativas incorretas o acesso é bloqueado por 15 minutos.</span>
      </form>
    </div>
  );
}
