import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { monthName } from '../../lib/format';
import { Alert, Field, Loading } from '../../components/ui';

interface Settings { company_name: string; document: string | null; fiscal_year_start_month: number }

export function SettingsPage() {
  const s = useFetch<Settings>('/admin/settings');
  const [f, setF] = useState<Settings | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (s.data) setF(s.data); }, [s.data]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(''); setErr('');
    try { await api.put('/admin/settings', f); setMsg('Configurações salvas'); } catch (e2) { setErr((e2 as Error).message); }
  };

  if (!f) return <Loading />;
  return (
    <>
      <div className="page-header"><div><h1>Configurações</h1><p>Dados da empresa e parâmetros gerais</p></div></div>
      <form className="card form-grid" onSubmit={submit} style={{ maxWidth: 720 }}>
        <Alert kind="success">{msg}</Alert>
        <Alert>{err}</Alert>
        <Field label="Razão social" full><input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} required /></Field>
        <Field label="CNPJ"><input value={f.document ?? ''} onChange={(e) => setF({ ...f, document: e.target.value })} /></Field>
        <Field label="Início do exercício fiscal">
          <select value={f.fiscal_year_start_month} onChange={(e) => setF({ ...f, fiscal_year_start_month: Number(e.target.value) })}>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}
          </select>
        </Field>
        <div className="full"><button className="btn primary">Salvar</button></div>
      </form>
      <div className="card" style={{ maxWidth: 720 }}>
        <h2>Políticas de segurança ativas</h2>
        <ul className="text-2">
          <li>Senhas com hash bcrypt (custo 12) e política de complexidade mínima</li>
          <li>Bloqueio de 15 minutos após 5 tentativas de login incorretas + limitação de requisições</li>
          <li>Sessão via JWT com expiração e encerramento automático após 30 min de inatividade</li>
          <li>Perfis de acesso (administrador, financeiro, visualizador) validados no servidor</li>
          <li>Trilha de auditoria de logins e de todas as alterações de dados</li>
          <li>Lançamentos imutáveis: correções são feitas por estorno, preservando o histórico</li>
          <li>Cabeçalhos de segurança HTTP (Helmet), CORS restrito e validação de entrada (Zod)</li>
        </ul>
      </div>
    </>
  );
}
