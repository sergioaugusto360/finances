import { Fragment, useState } from 'react';
import { useFetch } from '../../lib/useFetch';
import { dateTime } from '../../lib/format';
import { Alert, Field, Loading } from '../../components/ui';

interface Log { id: number; action: string; entity: string; entity_id: string | null; details: unknown; ip: string | null; created_at: string; user_name: string | null }

const ENTITIES = ['users', 'contas_pagar', 'contas_receber', 'bank_accounts', 'bank_transactions', 'journal_entries', 'accounts', 'partners', 'cost_centers', 'budgets', 'company_settings'];

export function AuditPage() {
  const [entity, setEntity] = useState('');
  const list = useFetch<Log[]>('/admin/audit', { entity, limit: 300 });
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className="page-header">
        <div><h1>Trilha de auditoria</h1><p>Registro de acessos e de todas as alterações (quem, o quê, quando e de onde)</p></div>
        <Field label="Entidade">
          <select value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">Todas</option>
            {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </Field>
      </div>
      <Alert>{list.error}</Alert>
      <div className="card table-wrap">
        {list.loading ? <Loading /> : (
          <table>
            <thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Registro</th><th>IP</th><th /></tr></thead>
            <tbody>
              {list.data?.map((l) => (
                <Fragment key={l.id}>
                  <tr>
                    <td className="small">{dateTime(l.created_at)}</td><td>{l.user_name ?? '—'}</td>
                    <td><span className={`badge ${l.action === 'LOGIN_FALHA' ? 'critical' : l.action.startsWith('LOGIN') ? 'info' : 'neutral'}`}>{l.action}</span></td>
                    <td>{l.entity}</td><td>{l.entity_id ?? '—'}</td><td className="small">{l.ip ?? '—'}</td>
                    <td className="actions">{l.details != null && <button className="btn sm" onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? 'Ocultar' : 'Detalhes'}</button>}</td>
                  </tr>
                  {open === l.id && <tr><td colSpan={7}><pre className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(l.details, null, 2)}</pre></td></tr>}
                </Fragment>
              ))}
              {!list.data?.length && <tr><td colSpan={7} className="empty">Sem registros</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
