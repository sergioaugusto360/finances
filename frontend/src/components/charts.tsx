/**
 * Componentes de gráfico (Recharts) com regras de visualização consistentes:
 * marcas finas, grade discreta, tooltip por hover, legenda + rótulos diretos e
 * cores fixas por entidade (receitas = série 1, despesas = série 2).
 */
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, ComposedChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps,
} from 'recharts';
import { money, moneyCompact } from '../lib/format';

export const COLORS = {
  // mesmos valores de --series-* em styles.css (atributos SVG não resolvem var() em todos os navegadores)
  receitas: '#2a78d6',
  despesas: '#eb6834',
  saldo: '#2a78d6',
  resultado: '#1baf7a',
  grid: '#e9ebef',
  axis: '#8a90a2',
};

const axisProps = { stroke: COLORS.axis, fontSize: 12, tickLine: false, axisLine: false } as const;

interface SeriesDef { key: string; label: string; color: string }

function ChartTooltip({ active, payload, label, series, labelFormatter }: TooltipProps<number, string> & { series: SeriesDef[]; labelFormatter?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="t-title">{labelFormatter ? labelFormatter(String(label)) : label}</div>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        if (!p) return null;
        return (
          <div className="t-row" key={s.key}>
            <span className="legend-swatch" style={{ background: s.color }} />
            {s.label}
            <b>{money(Number(p.value))}</b>
          </div>
        );
      })}
    </div>
  );
}

export function Legend({ series }: { series: SeriesDef[] }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span className="legend-item" key={s.key}>
          <span className="legend-swatch" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Barras agrupadas (ex.: receitas x despesas por mês). */
export function GroupedBars<T extends Record<string, unknown>>({ data, xKey, series, xFormatter, height = 280 }: { data: T[]; xKey: string; series: SeriesDef[]; xFormatter?: (v: string) => string; height?: number }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={COLORS.grid} />
          <XAxis dataKey={xKey} tickFormatter={xFormatter} {...axisProps} />
          <YAxis tickFormatter={moneyCompact} width={72} {...axisProps} />
          <Tooltip cursor={{ fill: 'rgba(42,120,214,0.06)' }} content={<ChartTooltip series={series} labelFormatter={xFormatter} />} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Linha única de saldo com área suave e linha de referência no zero. */
export function BalanceLine<T extends Record<string, unknown>>({ data, xKey, yKey, label, xFormatter, height = 260 }: { data: T[]; xKey: string; yKey: string; label: string; xFormatter?: (v: string) => string; height?: number }) {
  const series = [{ key: yKey, label, color: COLORS.saldo }];
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${yKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2a78d6" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#2a78d6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={COLORS.grid} />
          <XAxis dataKey={xKey} tickFormatter={xFormatter} {...axisProps} minTickGap={24} />
          <YAxis tickFormatter={moneyCompact} width={72} {...axisProps} />
          <ReferenceLine y={0} stroke="#c3c7d1" />
          <Tooltip cursor={{ stroke: '#8a90a2', strokeDasharray: '3 3' }} content={<ChartTooltip series={series} labelFormatter={xFormatter} />} />
          <Area type="monotone" dataKey={yKey} stroke={COLORS.saldo} strokeWidth={2} fill={`url(#grad-${yKey})`} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Entradas x saídas em barras + linha de saldo acumulado (mesma escala em R$). */
export function CashFlowChart<T extends Record<string, unknown>>({ data, xFormatter, height = 300 }: { data: T[]; xFormatter?: (v: string) => string; height?: number }) {
  const series = [
    { key: 'entradas', label: 'Entradas', color: COLORS.receitas },
    { key: 'saidas', label: 'Saídas', color: COLORS.despesas },
    { key: 'saldo', label: 'Saldo acumulado', color: COLORS.resultado },
  ];
  return (
    <>
      <Legend series={series} />
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="24%">
            <CartesianGrid vertical={false} stroke={COLORS.grid} />
            <XAxis dataKey="month" tickFormatter={xFormatter} {...axisProps} />
            <YAxis tickFormatter={moneyCompact} width={72} {...axisProps} />
            <Tooltip cursor={{ fill: 'rgba(42,120,214,0.06)' }} content={<ChartTooltip series={series} labelFormatter={xFormatter} />} />
            <Bar dataKey="entradas" fill={COLORS.receitas} radius={[4, 4, 0, 0]} maxBarSize={20} />
            <Bar dataKey="saidas" fill={COLORS.despesas} radius={[4, 4, 0, 0]} maxBarSize={20} />
            <Line type="monotone" dataKey="saldo" stroke={COLORS.resultado} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: COLORS.resultado }} activeDot={{ r: 6, fill: COLORS.resultado, stroke: '#fff', strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/** Lista de barras horizontais (ranking) — com rótulo e valor diretos. */
export function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div className="empty">Sem dados no período</div>;
  return (
    <div className="bar-list">
      {items.map((i) => (
        <div className="bar-row" key={i.label} title={`${i.label}: ${money(i.value)}`}>
          <span>{i.label}</span>
          <b className="num">{money(i.value)}</b>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(i.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
