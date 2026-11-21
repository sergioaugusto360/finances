const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

export const money = (v: number | null | undefined) => brl.format(Number(v ?? 0));
export const moneyCompact = (v: number) => `R$ ${compact.format(v)}`;
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
export const num = (v: number | null | undefined, digits = 2) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const date = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
export const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR');

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]}/${y.slice(2)}`;
};
export const monthName = (m: number) => MONTHS[m - 1];

export const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const monthStartIso = (offset = 0) => {
  const d = new Date();
  const s = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  return new Date(s.getTime() - s.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const monthEndIso = (offset = 0) => {
  const d = new Date();
  const s = new Date(d.getFullYear(), d.getMonth() + 1 + offset, 0);
  return new Date(s.getTime() - s.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const yearStartIso = () => `${new Date().getFullYear()}-01-01`;
