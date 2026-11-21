/** Popula o banco com 12 meses de dados fictícios para demonstração dos relatórios. */
import { pool, query, withTransaction } from './pool.js';
import { createBankAccount, createManualTransaction } from '../services/banking.js';
import { createTitles, payTitle } from '../services/titles.js';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const rand = (min: number, max: number) => Math.round((min + Math.random() * (max - min)) * 100) / 100;

async function main() {
  const [{ count }] = await query<{ count: number }>('SELECT COUNT(*)::int AS count FROM financial_titles');
  if (count > 0) {
    console.log('Já existem títulos cadastrados; demonstração não aplicada.');
    return pool.end();
  }
  const [admin] = await query<{ id: number }>(`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`);
  if (!admin) throw new Error('Execute npm run db:migrate antes.');
  const uid = admin.id;
  const acc = async (code: string) => (await query<{ id: number }>('SELECT id FROM accounts WHERE code = $1', [code]))[0].id;
  const cc = async (code: string) => (await query<{ id: number }>('SELECT id FROM cost_centers WHERE code = $1', [code]))[0].id;

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  await withTransaction(async (c) => {
    const bankA = await createBankAccount(c, { name: 'Banco Principal', bank: 'Banco do Brasil', agency: '1234', number: '56789-0', initial_balance: 80000, opening_date: iso(start) }, uid);
    const bankB = await createBankAccount(c, { name: 'Conta Investimentos', bank: 'Itaú', agency: '4321', number: '98765-1', initial_balance: 40000, opening_date: iso(start) }, uid);

    const clients: number[] = [];
    for (const name of ['Alfa Comércio Ltda', 'Beta Serviços S.A.', 'Gama Indústria', 'Delta Tecnologia']) {
      const [p] = await query<{ id: number }>(`INSERT INTO partners (kind, name, document) VALUES ('CLIENTE', $1, $2) RETURNING id`, [name, String(Math.floor(1e13 + Math.random() * 9e13))], c);
      clients.push(p.id);
    }
    const suppliers: Record<string, number> = {};
    for (const name of ['Imobiliária Central', 'Distribuidora Norte', 'Energia SA', 'Agência Criativa', 'Contabilidade Silva']) {
      const [p] = await query<{ id: number }>(`INSERT INTO partners (kind, name) VALUES ('FORNECEDOR', $1) RETURNING id`, [name], c);
      suppliers[name] = p.id;
    }

    const accounts = {
      vendas: await acc('4.1'), servicos: await acc('4.2'), impostos: await acc('5.1'), cmv: await acc('6.1'),
      pessoal: await acc('7.1'), aluguel: await acc('7.2'), energia: await acc('7.3'), marketing: await acc('7.4'),
      terceiros: await acc('7.5'), tarifas: await acc('7.10'), imobilizado: await acc('1.2.1'), emprestimo: await acc('2.2.1'),
      irpj: await acc('7.11'),
    };
    const ccs = { ADM: await cc('ADM'), COM: await cc('COM'), OPE: await cc('OPE') };

    await createManualTransaction(c, { bank_account_id: bankA, tx_date: iso(new Date(start.getTime() + 5 * 864e5)), direction: 'ENTRADA', amount: 60000, description: 'Captação de empréstimo bancário', activity: 'FINANCIAMENTO', counterpart_account_id: accounts.emprestimo }, uid);
    await createManualTransaction(c, { bank_account_id: bankA, tx_date: iso(new Date(start.getTime() + 20 * 864e5)), direction: 'SAIDA', amount: 35000, description: 'Compra de equipamentos', activity: 'INVESTIMENTO', counterpart_account_id: accounts.imobilizado }, uid);

    for (let i = 0; i < 13; i++) {
      const y = start.getUTCFullYear();
      const m = start.getUTCMonth() + i;
      const day = (d: number) => iso(new Date(Date.UTC(y, m, d)));
      const isPast = new Date(Date.UTC(y, m, 28)) < now;
      const dueIsPast = (d: number) => new Date(Date.UTC(y, m, d)) < now;
      const growth = 1 + i * 0.03;

      const items: { kind: 'PAGAR' | 'RECEBER'; partner: number; account: number; cc: number; desc: string; amount: number; due: number }[] = [
        { kind: 'RECEBER', partner: clients[i % 4], account: accounts.vendas, cc: ccs.COM, desc: 'Venda de produtos', amount: rand(38000, 52000) * growth, due: 10 },
        { kind: 'RECEBER', partner: clients[(i + 1) % 4], account: accounts.servicos, cc: ccs.OPE, desc: 'Contrato de serviços', amount: rand(18000, 24000) * growth, due: 20 },
        { kind: 'PAGAR', partner: suppliers['Distribuidora Norte'], account: accounts.cmv, cc: ccs.OPE, desc: 'Compra de mercadorias', amount: rand(20000, 27000) * growth, due: 15 },
        { kind: 'PAGAR', partner: suppliers['Contabilidade Silva'], account: accounts.impostos, cc: ccs.ADM, desc: 'Simples Nacional', amount: rand(5000, 6500) * growth, due: 20 },
        { kind: 'PAGAR', partner: suppliers['Imobiliária Central'], account: accounts.aluguel, cc: ccs.ADM, desc: 'Aluguel do escritório', amount: 6500, due: 5 },
        { kind: 'PAGAR', partner: suppliers['Energia SA'], account: accounts.energia, cc: ccs.ADM, desc: 'Conta de energia', amount: rand(1200, 1900), due: 12 },
        { kind: 'PAGAR', partner: suppliers['Agência Criativa'], account: accounts.marketing, cc: ccs.COM, desc: 'Campanha de marketing', amount: rand(2500, 5500), due: 25 },
        { kind: 'PAGAR', partner: suppliers['Contabilidade Silva'], account: accounts.terceiros, cc: ccs.ADM, desc: 'Honorários contábeis', amount: 1800, due: 10 },
        { kind: 'PAGAR', partner: suppliers['Contabilidade Silva'], account: accounts.pessoal, cc: ccs.ADM, desc: 'Folha de pagamento', amount: rand(16000, 18000), due: 5 },
        { kind: 'PAGAR', partner: suppliers['Contabilidade Silva'], account: accounts.irpj, cc: ccs.ADM, desc: 'IRPJ/CSLL estimativa', amount: rand(1500, 2500) * growth, due: 28 },
      ];

      for (const it of items) {
        const [tid] = await createTitles(c, it.kind, {
          partner_id: it.partner, account_id: it.account, cost_center_id: it.cc, description: `${it.desc} ${String((m % 12) + 1).padStart(2, '0')}/${y + Math.floor(m / 12)}`,
          issue_date: day(1), due_date: day(it.due), amount: Math.round(it.amount * 100) / 100,
        }, uid);
        // Títulos passados são liquidados (alguns com atraso/juros); ~8% ficam inadimplentes
        if (dueIsPast(it.due) && Math.random() > 0.08) {
          const [t] = await query<{ amount: number }>('SELECT amount FROM financial_titles WHERE id = $1', [tid], c);
          const late = Math.random() < 0.15 && dueIsPast(it.due + 5);
          await payTitle(c, tid, {
            bank_account_id: bankA, payment_date: day(it.due + (late ? 5 : 0)), amount: t.amount,
            interest: late ? Math.round(t.amount * 0.01 * 100) / 100 : 0,
          }, uid);
        }
      }
      if (isPast) {
        await createManualTransaction(c, { bank_account_id: bankA, tx_date: day(27), direction: 'SAIDA', amount: rand(80, 160), description: 'Tarifas bancárias', activity: 'OPERACIONAL', counterpart_account_id: accounts.tarifas }, uid);
        await createManualTransaction(c, { bank_account_id: bankA, tx_date: day(28), direction: 'SAIDA', amount: 2500, description: 'Amortização de empréstimo', activity: 'FINANCIAMENTO', counterpart_account_id: accounts.emprestimo }, uid);
      }
    }

    // Orçamento do ano corrente para algumas contas
    const year = now.getUTCFullYear();
    for (const [account, value] of [[accounts.vendas, 48000], [accounts.servicos, 22000], [accounts.cmv, 24000], [accounts.pessoal, 17000], [accounts.marketing, 4000]] as const) {
      for (let mm = 1; mm <= 12; mm++) {
        await query('INSERT INTO budgets (account_id, year, month, amount) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [account, year, mm, value], c);
      }
    }
    void bankB;
  });
  console.log('✔ Dados de demonstração criados');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
