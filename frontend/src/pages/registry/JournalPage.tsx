import { Fragment, useState } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { date, money, monthEndIso, monthStartIso, todayIso } from '../../lib/format';
import type { Account } from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Field, Loading, Modal } from '../../components/ui';

interface Entry {
  id: number; entry_date: string; description: string; source: string; user_name: string | null;
  lines: { account_id: number; code: string; name: string; debit: number; credit: number }[];
}
const SOURCE: Record<string, string> = { MANUAL: 'Manual', TITULO: 'Provisão', BAIXA: 'Baixa', MOVIMENTO: 'Movimento', TRANSFERENCIA: 'Transferência', SALDO_INICIAL: 'Saldo inicial', ESTORNO: 'Estorno' };

export function JournalPage() {
  const { canWrite } = useAuth();
  const [p, setP] = useState({ start: monthStartIso(), end: monthEndIso() });
  const list = useFetch<Entry[]>('/journal', p);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="page-header">
        <div><h1>Lançamentos contábeis</h1><p>Livro diário — partidas dobradas geradas automaticamente ou manualmente (ajustes, depreciação, provisões)</p></div>
        {canWrite && <button className="btn primary" onClick={() => setCreating(true)}>+ Lançamento manual</button>}
      </div>
      <div className="toolbar">
        <Field label="De"><input type="date" value={p.start} onChange={(e) => setP({ ...p, start: e.target.value })} /></Field>
        <Field label="Até"><input type="date" value={p.end} onChange={(e) => setP({ ...p, end: e.target.value })} /></Field>
      </div>
      <Alert>{list.error}</Alert>
      <div className="card table-wrap">
        {list.loading ? <Loading /> : (
          <table>
            <thead><tr><th>Data</th><th>Nº</th><th>Histórico / Conta</th><th>Origem</th><th className="num">Débito</th><th className="num">Crédito</th></tr></thead>
            <tbody>
              {list.data?.map((e) => (
                <Fragment key={e.id}>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <td>{date(e.entry_date)}</td><td>#{e.id}</td><td><b>{e.description}</b> <span className="small muted">{e.user_name}</span></td>
                    <td><span className="badge neutral">{SOURCE[e.source]}</span></td><td /><td />
                  </tr>
                  {e.lines.map((l, i) => (
                    <tr key={i}><td /><td /><td className="small" style={{ paddingLeft: l.credit ? 40 : 20 }}>{l.code} {l.name}</td><td />
                      <td className="num">{l.debit ? money(l.debit) : ''}</td><td className="num">{l.credit ? money(l.credit) : ''}</td></tr>
                  ))}
                </Fragment>
              ))}
              {!list.data?.length && <tr><td colSpan={6} className="empty">Nenhum lançamento no período</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {creating && <EntryForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); list.reload(); }} />}
    </>
  );
}

function EntryForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const accounts = useFetch<Account[]>('/accounts');
  const [head, setHead] = useState({ entry_date: todayIso(), description: '' });
  const [lines, setLines] = useState([{ account_id: '', debit: '', credit: '' }, { account_id: '', debit: '', credit: '' }]);
  const [err, setErr] = useState('');
  const n = (v: string) => Number(v.replace(',', '.')) || 0;
  const totalD = lines.reduce((s, l) => s + n(l.debit), 0);
  const totalC = lines.reduce((s, l) => s + n(l.credit), 0);
  const balanced = Math.abs(totalD - totalC) < 0.005 && totalD > 0;
  const upd = (i: number, k: 'account_id' | 'debit' | 'credit', v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const save = async () => {
    try {
      await api.post('/journal', { ...head, lines: lines.filter((l) => l.account_id).map((l) => ({ account_id: Number(l.account_id), debit: n(l.debit), credit: n(l.credit) })) });
      onSaved();
    } catch (e) { setErr((e as Error).message); }
  };
  const options = (accounts.data ?? []).filter((a) => a.accepts_entries && a.active);
  return (
    <Modal title="Lançamento contábil manual" onClose={onClose} wide
      footer={<><span className={`badge ${balanced ? 'good' : 'critical'}`}>D {money(totalD)} · C {money(totalC)}</span><span className="spacer" />
        <button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save} disabled={!balanced || !head.description}>Lançar</button></>}>
      <Alert>{err}</Alert>
      <div className="alert info">Lançamentos manuais não afetam o fluxo de caixa. Para movimentar bancos, use Fluxo de caixa › Movimento avulso.</div>
      <div className="form-grid">
        <Field label="Data"><input type="date" value={head.entry_date} onChange={(e) => setHead({ ...head, entry_date: e.target.value })} /></Field>
        <Field label="Histórico"><input value={head.description} onChange={(e) => setHead({ ...head, description: e.target.value })} /></Field>
      </div>
      <table>
        <thead><tr><th>Conta</th><th className="num">Débito</th><th className="num">Crédito</th><th /></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td><select value={l.account_id} onChange={(e) => upd(i, 'account_id', e.target.value)}><option value="">Selecione…</option>
                {options.filter((a) => !a.code.startsWith('1.1.1.')).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></td>
              <td><input inputMode="decimal" value={l.debit} onChange={(e) => upd(i, 'debit', e.target.value)} disabled={!!l.credit} /></td>
              <td><input inputMode="decimal" value={l.credit} onChange={(e) => upd(i, 'credit', e.target.value)} disabled={!!l.debit} /></td>
              <td>{lines.length > 2 && <button className="btn sm ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div><button className="btn sm" onClick={() => setLines([...lines, { account_id: '', debit: '', credit: '' }])}>+ Linha</button></div>
    </Modal>
  );
}
