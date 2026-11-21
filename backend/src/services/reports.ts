import { query } from '../db/pool.js';
import { round2 } from './ledger.js';

const r = round2;
const safeDiv = (a: number, b: number) => (b === 0 ? null : a / b);
const today = () => new Date().toISOString().slice(0, 10);

// =====================================================================
// DRE - Demonstração do Resultado do Exercício
// =====================================================================
export type DreGroup =
  | 'RECEITA_BRUTA' | 'DEDUCOES' | 'CUSTOS' | 'DESPESAS_OPERACIONAIS'
  | 'DEPRECIACAO' | 'RECEITAS_FINANCEIRAS' | 'DESPESAS_FINANCEIRAS' | 'IMPOSTOS_LUCRO';

interface DreAccountRow { account_id: number; code: string; name: string; dre_group: DreGroup; value: number }

async function dreAccounts(start: string, end: string, costCenterId?: number | null) {
  // Receitas: crédito - débito; demais (deduções, custos, despesas): débito - crédito
  return query<DreAccountRow>(
    `SELECT a.id AS account_id, a.code, a.name, a.dre_group,
            ROUND(SUM(CASE WHEN a.type = 'RECEITA' THEN jl.credit - jl.debit ELSE jl.debit - jl.credit END), 2) AS value
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN accounts a ON a.id = jl.account_id
      WHERE a.dre_group IS NOT NULL
        AND je.entry_date BETWEEN $1 AND $2
        AND ($3::int IS NULL OR jl.cost_center_id = $3)
      GROUP BY a.id
      HAVING SUM(jl.debit - jl.credit) <> 0
      ORDER BY a.code`,
    [start, end, costCenterId ?? null],
  );
}

function summarizeDre(rows: DreAccountRow[]) {
  const g = (k: DreGroup) => r(rows.filter((x) => x.dre_group === k).reduce((s, x) => s + x.value, 0));
  const receita_bruta = g('RECEITA_BRUTA');
  const deducoes = g('DEDUCOES');
  const receita_liquida = r(receita_bruta - deducoes);
  const custos = g('CUSTOS');
  const lucro_bruto = r(receita_liquida - custos);
  const despesas_operacionais = g('DESPESAS_OPERACIONAIS');
  const ebitda = r(lucro_bruto - despesas_operacionais);
  const depreciacao = g('DEPRECIACAO');
  const ebit = r(ebitda - depreciacao);
  const receitas_financeiras = g('RECEITAS_FINANCEIRAS');
  const despesas_financeiras = g('DESPESAS_FINANCEIRAS');
  const resultado_financeiro = r(receitas_financeiras - despesas_financeiras);
  const lair = r(ebit + resultado_financeiro);
  const impostos_lucro = g('IMPOSTOS_LUCRO');
  const lucro_liquido = r(lair - impostos_lucro);
  return {
    receita_bruta, deducoes, receita_liquida, custos, lucro_bruto, despesas_operacionais, ebitda,
    depreciacao, ebit, receitas_financeiras, despesas_financeiras, resultado_financeiro, lair,
    impostos_lucro, lucro_liquido,
  };
}

export type DreSummary = ReturnType<typeof summarizeDre>;

export async function dre(start: string, end: string, costCenterId?: number | null) {
  const rows = await dreAccounts(start, end, costCenterId);
  const summary = summarizeDre(rows);
  const rl = summary.receita_liquida;
  const lines: { key: string; label: string; value: number; level: 'grupo' | 'total' | 'resultado'; group?: DreGroup; sign: 1 | -1 }[] = [
    { key: 'receita_bruta', label: 'Receita Operacional Bruta', value: summary.receita_bruta, level: 'grupo', group: 'RECEITA_BRUTA', sign: 1 },
    { key: 'deducoes', label: '(-) Deduções da Receita', value: summary.deducoes, level: 'grupo', group: 'DEDUCOES', sign: -1 },
    { key: 'receita_liquida', label: '= Receita Operacional Líquida', value: summary.receita_liquida, level: 'total', sign: 1 },
    { key: 'custos', label: '(-) Custos (CMV/CSP)', value: summary.custos, level: 'grupo', group: 'CUSTOS', sign: -1 },
    { key: 'lucro_bruto', label: '= Lucro Bruto', value: summary.lucro_bruto, level: 'total', sign: 1 },
    { key: 'despesas_operacionais', label: '(-) Despesas Operacionais', value: summary.despesas_operacionais, level: 'grupo', group: 'DESPESAS_OPERACIONAIS', sign: -1 },
    { key: 'ebitda', label: '= EBITDA', value: summary.ebitda, level: 'total', sign: 1 },
    { key: 'depreciacao', label: '(-) Depreciação e Amortização', value: summary.depreciacao, level: 'grupo', group: 'DEPRECIACAO', sign: -1 },
    { key: 'ebit', label: '= Resultado Operacional (EBIT)', value: summary.ebit, level: 'total', sign: 1 },
    { key: 'receitas_financeiras', label: '(+) Receitas Financeiras', value: summary.receitas_financeiras, level: 'grupo', group: 'RECEITAS_FINANCEIRAS', sign: 1 },
    { key: 'despesas_financeiras', label: '(-) Despesas Financeiras', value: summary.despesas_financeiras, level: 'grupo', group: 'DESPESAS_FINANCEIRAS', sign: -1 },
    { key: 'lair', label: '= Resultado Antes do IR/CSLL (LAIR)', value: summary.lair, level: 'total', sign: 1 },
    { key: 'impostos_lucro', label: '(-) IRPJ e CSLL', value: summary.impostos_lucro, level: 'grupo', group: 'IMPOSTOS_LUCRO', sign: -1 },
    { key: 'lucro_liquido', label: '= Lucro/Prejuízo Líquido do Exercício', value: summary.lucro_liquido, level: 'resultado', sign: 1 },
  ];
  return {
    period: { start, end },
    summary,
    lines: lines.map((l) => ({
      ...l,
      percent_rl: rl ? r((l.value / rl) * 100) : null,
      accounts: l.group ? rows.filter((x) => x.dre_group === l.group) : [],
    })),
  };
}

/** DRE resumida mês a mês de um ano (para comparativos e gráficos). */
export async function dreMonthly(year: number, costCenterId?: number | null) {
  const rows = await query<DreAccountRow & { month: number }>(
    `SELECT EXTRACT(MONTH FROM je.entry_date)::int AS month, a.id AS account_id, a.code, a.name, a.dre_group,
            ROUND(SUM(CASE WHEN a.type = 'RECEITA' THEN jl.credit - jl.debit ELSE jl.debit - jl.credit END), 2) AS value
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN accounts a ON a.id = jl.account_id
      WHERE a.dre_group IS NOT NULL AND EXTRACT(YEAR FROM je.entry_date) = $1
        AND ($2::int IS NULL OR jl.cost_center_id = $2)
      GROUP BY 1, a.id`,
    [year, costCenterId ?? null],
  );
  return Array.from({ length: 12 }, (_, i) => ({ month: i + 1, ...summarizeDre(rows.filter((x) => x.month === i + 1)) }));
}

// =====================================================================
// Balanço Patrimonial
// =====================================================================
interface BalRow { id: number; code: string; name: string; type: string; subtype: string | null; balance: number }

export async function balanceSheet(asOf: string) {
  const rows = await query<BalRow>(
    `SELECT a.id, a.code, a.name, a.type,
            COALESCE(a.subtype, p.subtype) AS subtype,
            ROUND(SUM(CASE WHEN a.type = 'ATIVO' THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END), 2) AS balance
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN accounts a ON a.id = jl.account_id
       LEFT JOIN accounts p ON p.id = a.parent_id
      WHERE a.type IN ('ATIVO','PASSIVO','PATRIMONIO') AND je.entry_date <= $1
      GROUP BY a.id, p.subtype
      HAVING SUM(jl.debit - jl.credit) <> 0
      ORDER BY a.code`,
    [asOf],
  );

  // Resultado acumulado ainda não transferido para o PL (contas de resultado)
  const [{ result }] = await query<{ result: number }>(
    `SELECT COALESCE(ROUND(SUM(jl.credit - jl.debit), 2), 0) AS result
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN accounts a ON a.id = jl.account_id
      WHERE a.type IN ('RECEITA','DEDUCAO','CUSTO','DESPESA') AND je.entry_date <= $1`,
    [asOf],
  );

  const pick = (type: string, subtype?: string) =>
    rows.filter((x) => x.type === type && (subtype === undefined || x.subtype === subtype));
  const sum = (xs: { balance: number }[]) => r(xs.reduce((s, x) => s + x.balance, 0));

  const ac = pick('ATIVO', 'CIRCULANTE');
  const anc = pick('ATIVO', 'NAO_CIRCULANTE');
  const pc = pick('PASSIVO', 'CIRCULANTE');
  const pnc = pick('PASSIVO', 'NAO_CIRCULANTE');
  const pl = [
    ...pick('PATRIMONIO'),
    { id: 0, code: '3.9', name: 'Resultado do Exercício (não encerrado)', type: 'PATRIMONIO', subtype: null, balance: result },
  ];

  const ativo_total = r(sum(ac) + sum(anc));
  const passivo_total = r(sum(pc) + sum(pnc));
  const pl_total = sum(pl);

  return {
    as_of: asOf,
    ativo: {
      circulante: { total: sum(ac), contas: ac },
      nao_circulante: { total: sum(anc), contas: anc },
      total: ativo_total,
    },
    passivo: {
      circulante: { total: sum(pc), contas: pc },
      nao_circulante: { total: sum(pnc), contas: pnc },
      total: passivo_total,
    },
    patrimonio_liquido: { total: pl_total, contas: pl },
    passivo_mais_pl: r(passivo_total + pl_total),
    balanceado: r(ativo_total - passivo_total - pl_total) === 0,
  };
}

// =====================================================================
// Fluxo de Caixa (DFC - método direto) realizado + projetado
// =====================================================================
export async function cashFlow(start: string, end: string, bankAccountId?: number | null) {
  const params = [start, end, bankAccountId ?? null];
  const [{ opening }] = await query<{ opening: number }>(
    `SELECT COALESCE(ROUND(SUM(CASE WHEN direction = 'ENTRADA' THEN amount ELSE -amount END), 2), 0) AS opening
       FROM bank_transactions
      WHERE tx_date < $1 AND ($2::int IS NULL OR bank_account_id = $2)`,
    [start, bankAccountId ?? null],
  );
  const byActivity = await query<{ activity: string; entradas: number; saidas: number }>(
    `SELECT activity,
            COALESCE(ROUND(SUM(amount) FILTER (WHERE direction = 'ENTRADA'), 2), 0) AS entradas,
            COALESCE(ROUND(SUM(amount) FILTER (WHERE direction = 'SAIDA'), 2), 0) AS saidas
       FROM bank_transactions
      WHERE tx_date BETWEEN $1 AND $2 AND ($3::int IS NULL OR bank_account_id = $3)
      GROUP BY activity`,
    params,
  );
  // Entradas/saídas excluem saldos de implantação (e transferências no consolidado);
  // a variação do saldo considera todos os movimentos.
  const monthly = await query<{ month: string; entradas: number; saidas: number; variacao: number }>(
    `SELECT to_char(tx_date, 'YYYY-MM') AS month,
            COALESCE(ROUND(SUM(amount) FILTER (WHERE direction = 'ENTRADA' AND activity <> 'SALDO_INICIAL'
                     AND ($3::int IS NOT NULL OR activity <> 'TRANSFERENCIA')), 2), 0) AS entradas,
            COALESCE(ROUND(SUM(amount) FILTER (WHERE direction = 'SAIDA' AND activity <> 'SALDO_INICIAL'
                     AND ($3::int IS NOT NULL OR activity <> 'TRANSFERENCIA')), 2), 0) AS saidas,
            COALESCE(ROUND(SUM(CASE WHEN direction = 'ENTRADA' THEN amount ELSE -amount END), 2), 0) AS variacao
       FROM bank_transactions
      WHERE tx_date BETWEEN $1 AND $2 AND ($3::int IS NULL OR bank_account_id = $3)
      GROUP BY 1 ORDER BY 1`,
    params,
  );
  const transactions = await query(
    `SELECT bt.id, bt.tx_date, bt.direction, bt.amount, bt.description, bt.activity, bt.source, ba.name AS bank_name
       FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id
      WHERE bt.tx_date BETWEEN $1 AND $2 AND ($3::int IS NULL OR bt.bank_account_id = $3)
      ORDER BY bt.tx_date DESC, bt.id DESC LIMIT 500`,
    params,
  );

  const act = (k: string) => {
    const row = byActivity.find((x) => x.activity === k) ?? { entradas: 0, saidas: 0 };
    return { entradas: row.entradas, saidas: row.saidas, liquido: r(row.entradas - row.saidas) };
  };
  const operacional = act('OPERACIONAL');
  const investimento = act('INVESTIMENTO');
  const financiamento = act('FINANCIAMENTO');
  const saldos_iniciais = act('SALDO_INICIAL');
  const transferencias = act('TRANSFERENCIA');
  const variacao = r(operacional.liquido + investimento.liquido + financiamento.liquido + saldos_iniciais.liquido + transferencias.liquido);

  let running = opening;
  return {
    period: { start, end },
    saldo_inicial: opening,
    atividades: { operacional, investimento, financiamento, saldos_iniciais, transferencias },
    variacao_liquida: variacao,
    saldo_final: r(opening + variacao),
    mensal: monthly.map(({ variacao, ...m }) => {
      running = r(running + variacao);
      return { ...m, liquido: r(m.entradas - m.saidas), saldo: running };
    }),
    movimentos: transactions,
  };
}

/** Projeção de caixa com base nos títulos em aberto (vencidos entram no dia de hoje). */
export async function cashProjection(days: number) {
  const start = today();
  const [{ saldo }] = await query<{ saldo: number }>(
    `SELECT COALESCE(ROUND(SUM(CASE WHEN direction='ENTRADA' THEN amount ELSE -amount END), 2), 0) AS saldo FROM bank_transactions WHERE tx_date <= $1`,
    [start],
  );
  const rows = await query<{ day: string; entradas: number; saidas: number }>(
    `SELECT to_char(GREATEST(due_date, $1::date), 'YYYY-MM-DD') AS day,
            COALESCE(ROUND(SUM(amount - paid_amount) FILTER (WHERE kind = 'RECEBER'), 2), 0) AS entradas,
            COALESCE(ROUND(SUM(amount - paid_amount) FILTER (WHERE kind = 'PAGAR'), 2), 0) AS saidas
       FROM financial_titles
      WHERE status IN ('ABERTO','PARCIAL') AND due_date <= ($1::date + $2::int)
      GROUP BY 1 ORDER BY 1`,
    [start, days],
  );
  let running = saldo;
  const series = rows.map((d) => {
    running = r(running + d.entradas - d.saidas);
    return { ...d, saldo: running };
  });
  return {
    saldo_atual: saldo,
    total_entradas: r(rows.reduce((s, x) => s + x.entradas, 0)),
    total_saidas: r(rows.reduce((s, x) => s + x.saidas, 0)),
    saldo_projetado: running,
    menor_saldo: series.length ? Math.min(saldo, ...series.map((s) => s.saldo)) : saldo,
    serie: series,
  };
}

// =====================================================================
// Aging (vencimentos) de contas a pagar / receber
// =====================================================================
export async function aging(kind: 'PAGAR' | 'RECEBER') {
  const [row] = await query(
    `SELECT
        COALESCE(ROUND(SUM(amount - paid_amount) FILTER (WHERE due_date >= CURRENT_DATE), 2), 0) AS a_vencer,
        COALESCE(ROUND(SUM(amount - paid_amount) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 1 AND 30), 2), 0) AS vencido_1_30,
        COALESCE(ROUND(SUM(amount - paid_amount) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 31 AND 60), 2), 0) AS vencido_31_60,
        COALESCE(ROUND(SUM(amount - paid_amount) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 61 AND 90), 2), 0) AS vencido_61_90,
        COALESCE(ROUND(SUM(amount - paid_amount) FILTER (WHERE CURRENT_DATE - due_date > 90), 2), 0) AS vencido_90_mais,
        COALESCE(ROUND(SUM(amount - paid_amount), 2), 0) AS total_aberto
       FROM financial_titles
      WHERE kind = $1 AND status IN ('ABERTO','PARCIAL')`,
    [kind],
  );
  return row;
}

// =====================================================================
// Indicadores financeiros
// =====================================================================
export async function indicators(start: string, end: string) {
  const [d, b, agR] = await Promise.all([dre(start, end), balanceSheet(end), aging('RECEBER')]);
  const s = d.summary;
  const AC = b.ativo.circulante.total;
  const PC = b.passivo.circulante.total;
  const PNC = b.passivo.nao_circulante.total;
  const AT = b.ativo.total;
  const PL = b.patrimonio_liquido.total;

  const accBalance = async (sql: string) => (await query<{ v: number }>(sql, [end]))[0]?.v ?? 0;
  const caixa = await accBalance(
    `SELECT COALESCE(SUM(jl.debit - jl.credit),0) AS v FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
      JOIN accounts a ON a.id = jl.account_id JOIN accounts g ON g.id = a.parent_id
     WHERE g.system_key = 'GRUPO_BANCOS' AND je.entry_date <= $1`,
  );
  const estoques = await accBalance(
    `SELECT COALESCE(SUM(jl.debit - jl.credit),0) AS v FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
      JOIN accounts a ON a.id = jl.account_id WHERE a.system_key = 'ESTOQUES' AND je.entry_date <= $1`,
  );
  const clientes = await accBalance(
    `SELECT COALESCE(SUM(jl.debit - jl.credit),0) AS v FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
      JOIN accounts a ON a.id = jl.account_id WHERE a.system_key = 'CLIENTES' AND je.entry_date <= $1`,
  );
  const fornecedores = await accBalance(
    `SELECT COALESCE(SUM(jl.credit - jl.debit),0) AS v FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
      JOIN accounts a ON a.id = jl.account_id WHERE a.system_key = 'FORNECEDORES' AND je.entry_date <= $1`,
  );

  const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1);
  const compras = s.custos + s.despesas_operacionais;
  const vencido = Number(agR.total_aberto) - Number(agR.a_vencer);

  const budget = await query(
    `WITH real AS (
        SELECT a.id, SUM(CASE WHEN a.type = 'RECEITA' THEN jl.credit - jl.debit ELSE jl.debit - jl.credit END) AS realizado
          FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id JOIN accounts a ON a.id = jl.account_id
         WHERE je.entry_date BETWEEN $1 AND $2 AND a.dre_group IS NOT NULL
         GROUP BY a.id),
      orc AS (
        SELECT account_id, SUM(amount) AS orcado FROM budgets
         WHERE make_date(year, month, 1) BETWEEN date_trunc('month', $1::date) AND $2::date
         GROUP BY account_id)
     SELECT a.id AS account_id, a.code, a.name, a.type,
            COALESCE(orc.orcado, 0) AS orcado, ROUND(COALESCE(real.realizado, 0), 2) AS realizado
       FROM accounts a JOIN orc ON orc.account_id = a.id LEFT JOIN real ON real.id = a.id
      ORDER BY a.code`,
    [start, end],
  );

  const pct = (v: number | null) => (v == null ? null : r(v * 100));
  const num = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
  return {
    period: { start, end },
    liquidez: {
      corrente: num(safeDiv(AC, PC)),
      seca: num(safeDiv(AC - estoques, PC)),
      imediata: num(safeDiv(caixa, PC)),
      geral: num(safeDiv(AT, PC + PNC)),
    },
    endividamento: {
      geral_pct: pct(safeDiv(PC + PNC, AT)),
      composicao_curto_prazo_pct: pct(safeDiv(PC, PC + PNC)),
      capital_terceiros_sobre_pl_pct: pct(safeDiv(PC + PNC, PL)),
    },
    rentabilidade: {
      margem_bruta_pct: pct(safeDiv(s.lucro_bruto, s.receita_liquida)),
      margem_ebitda_pct: pct(safeDiv(s.ebitda, s.receita_liquida)),
      margem_operacional_pct: pct(safeDiv(s.ebit, s.receita_liquida)),
      margem_liquida_pct: pct(safeDiv(s.lucro_liquido, s.receita_liquida)),
      roe_pct: pct(safeDiv(s.lucro_liquido, PL)),
      roa_pct: pct(safeDiv(s.lucro_liquido, AT)),
    },
    atividade: {
      pmr_dias: num(safeDiv(clientes, s.receita_bruta / days)),
      pmp_dias: num(safeDiv(fornecedores, compras / days)),
      capital_circulante_liquido: r(AC - PC),
      inadimplencia_pct: pct(safeDiv(vencido, Number(agR.total_aberto))),
    },
    resultado: s,
    orcado_vs_realizado: budget.map((x: any) => ({
      ...x,
      variacao: r(x.realizado - x.orcado),
      atingimento_pct: x.orcado ? r((x.realizado / x.orcado) * 100) : null,
    })),
  };
}

// =====================================================================
// Dashboard
// =====================================================================
export async function dashboard() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const monthStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  const twelveAgo = new Date(Date.UTC(y, m - 11, 1)).toISOString().slice(0, 10);

  const [banks, titlesSummary, mes, monthly, topDespesas, upcoming, cash] = await Promise.all([
    query(
      `SELECT ba.id, ba.name, ba.bank,
              COALESCE(ROUND(SUM(CASE WHEN bt.direction='ENTRADA' THEN bt.amount ELSE -bt.amount END), 2), 0) AS saldo
         FROM bank_accounts ba LEFT JOIN bank_transactions bt ON bt.bank_account_id = ba.id
        WHERE ba.active GROUP BY ba.id ORDER BY ba.name`,
    ),
    query(
      `SELECT kind,
              COALESCE(ROUND(SUM(amount - paid_amount) FILTER (WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30), 2), 0) AS proximos_30,
              COALESCE(ROUND(SUM(amount - paid_amount) FILTER (WHERE due_date < CURRENT_DATE), 2), 0) AS vencido,
              COUNT(*) FILTER (WHERE due_date < CURRENT_DATE)::int AS qtd_vencidos,
              COALESCE(ROUND(SUM(amount - paid_amount), 2), 0) AS total_aberto
         FROM financial_titles WHERE status IN ('ABERTO','PARCIAL') GROUP BY kind`,
    ),
    dre(monthStart, monthEnd),
    query<{ month: string; receitas: number; despesas: number }>(
      `SELECT to_char(je.entry_date, 'YYYY-MM') AS month,
              COALESCE(ROUND(SUM(jl.credit - jl.debit) FILTER (WHERE a.type = 'RECEITA'), 2), 0) AS receitas,
              COALESCE(ROUND(SUM(jl.debit - jl.credit) FILTER (WHERE a.type IN ('DEDUCAO','CUSTO','DESPESA')), 2), 0) AS despesas
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id JOIN accounts a ON a.id = jl.account_id
        WHERE je.entry_date BETWEEN $1 AND $2 AND a.dre_group IS NOT NULL
        GROUP BY 1 ORDER BY 1`,
      [twelveAgo, monthEnd],
    ),
    query(
      `SELECT a.name, ROUND(SUM(jl.debit - jl.credit), 2) AS valor
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id JOIN accounts a ON a.id = jl.account_id
        WHERE a.type IN ('CUSTO','DESPESA') AND je.entry_date BETWEEN $1 AND $2
        GROUP BY a.id HAVING SUM(jl.debit - jl.credit) > 0 ORDER BY 2 DESC LIMIT 6`,
      [monthStart, monthEnd],
    ),
    query(
      `SELECT t.id, t.kind, t.description, t.due_date, ROUND(t.amount - t.paid_amount, 2) AS saldo, p.name AS partner_name
         FROM financial_titles t LEFT JOIN partners p ON p.id = t.partner_id
        WHERE t.status IN ('ABERTO','PARCIAL') AND t.due_date <= CURRENT_DATE + 15
        ORDER BY t.due_date LIMIT 10`,
    ),
    cashFlow(twelveAgo, monthEnd),
  ]);

  // garante 12 meses contínuos no gráfico
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(y, m - 11 + i, 1)).toISOString().slice(0, 7));
  const fill = <T extends { month: string }>(rows: T[], empty: Omit<T, 'month'>) =>
    months.map((mm) => rows.find((x) => x.month === mm) ?? ({ month: mm, ...empty } as T));

  const t = (k: string) => titlesSummary.find((x: any) => x.kind === k) ?? { proximos_30: 0, vencido: 0, qtd_vencidos: 0, total_aberto: 0 };
  return {
    saldo_bancario_total: r(banks.reduce((s: number, b: any) => s + b.saldo, 0)),
    contas_bancarias: banks,
    receber: t('RECEBER'),
    pagar: t('PAGAR'),
    mes_atual: mes.summary,
    receitas_despesas_12m: fill(monthly, { receitas: 0, despesas: 0 }).map((x) => ({ ...x, resultado: r(x.receitas - x.despesas) })),
    fluxo_caixa_12m: (() => {
      // meses sem movimento repetem o saldo do mês anterior
      let last = cash.saldo_inicial;
      return months.map((mm) => {
        const row = cash.mensal.find((x) => x.month === mm);
        if (row) last = row.saldo;
        return row ?? { month: mm, entradas: 0, saidas: 0, liquido: 0, saldo: last };
      });
    })(),
    top_despesas_mes: topDespesas,
    proximos_vencimentos: upcoming,
  };
}
