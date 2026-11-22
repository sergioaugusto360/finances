# Finanças — Sistema de Gestão Financeira e Contábil

Aplicação web completa de finanças empresariais.

| Camada | Tecnologia |
|---|---|
| Front-end | React 18 + TypeScript + Vite + CSS próprio + Recharts |
| Back-end | Node.js + Express + TypeScript + Zod |
| Banco de dados | PostgreSQL 16 |
| Segurança | JWT, bcrypt, Helmet, rate limiting, RBAC, auditoria |

## Módulos

| Módulo | Onde | O que faz |
|---|---|---|
| **Dashboard** | `/` | Saldo bancário, a receber/pagar 30 dias, vencidos, resultado do mês, receitas x despesas (12 meses), fluxo de caixa, maiores despesas, próximos vencimentos |
| **Receitas e contas a receber** | `/contas-a-receber` | Títulos parcelados, baixa total/parcial com juros e descontos, estorno, aging, inadimplência |
| **Despesas e contas a pagar** | `/contas-a-pagar` | Mesmo modelo para fornecedores, custos e despesas, com centro de custo |
| **Fluxo de caixa** | `/fluxo-de-caixa` | DFC pelo método direto (operacional / investimento / financiamento), evolução mensal, movimentos avulsos, transferências e **projeção** a partir dos vencimentos |
| **DRE** | `/dre` | Receita bruta → deduções → receita líquida → custos → lucro bruto → despesas → EBITDA → EBIT → resultado financeiro → LAIR → IR/CSLL → lucro líquido, com % sobre a receita, detalhe por conta, filtro por centro de custo e comparativo mensal |
| **Balanço patrimonial** | `/balanco` | Ativo e passivo (circulante e não circulante) e PL em qualquer data, com conferência Ativo = Passivo + PL |
| **Relatórios e indicadores** | `/indicadores` | Liquidez (corrente, seca, imediata, geral), endividamento, margens, ROE/ROA, PMR/PMP, capital circulante líquido, inadimplência e **orçado x realizado** |
| **Gestão complementar** | menu lateral | Contas bancárias, clientes/fornecedores, plano de contas, centros de custo, orçamento anual e lançamentos contábeis manuais |
| **Segurança e administração** | menu lateral (admin) | Usuários e perfis, trilha de auditoria, configurações da empresa e troca de senha |

## Arquitetura

```
financas-app/
├── docker-compose.yml        # PostgreSQL
├── database/
│   ├── schema.sql            # tabelas, índices e restrições
│   └── seed.sql              # plano de contas padrão e centros de custo
├── backend/src/
│   ├── config/env.ts         # variáveis de ambiente validadas
│   ├── db/                   # pool, transações, migração e dados de demonstração
│   ├── middleware/           # autenticação JWT, RBAC e tratamento de erros
│   ├── services/
│   │   ├── ledger.ts         # motor de partidas dobradas (lançar e estornar)
│   │   ├── titles.ts         # contas a pagar/receber: provisão, baixa, cancelamento
│   │   ├── banking.ts        # contas bancárias, movimentos e transferências
│   │   ├── reports.ts        # DRE, balanço, DFC, projeção, aging, indicadores, dashboard
│   │   └── audit.ts          # trilha de auditoria
│   └── routes/               # API REST (/api/...)
└── frontend/src/
    ├── auth/                 # contexto de sessão
    ├── components/           # layout, UI e gráficos
    ├── lib/                  # cliente da API, formatação e tipos
    └── pages/                # telas de cada módulo
```

### Modelo contábil

Todo fato financeiro gera um **lançamento de partidas dobradas** (`journal_entries` + `journal_lines`). O banco garante que débito e crédito nunca aparecem na mesma linha, e o serviço garante que o total de débitos é igual ao de créditos.

| Evento | Débito | Crédito |
|---|---|---|
| Despesa lançada (competência) | Despesa / custo | Fornecedores a pagar |
| Pagamento | Fornecedores + juros pagos | Banco + descontos obtidos |
| Receita lançada (competência) | Clientes a receber | Receita |
| Recebimento | Banco + descontos concedidos | Clientes + juros recebidos |
| Saldo inicial de banco | Banco | Saldos iniciais (PL) |
| Movimento avulso | Banco ou contrapartida | Contrapartida ou banco |

Daí derivam os relatórios:
- **DRE**: soma das contas de resultado pelo `dre_group`, no regime de competência.
- **Balanço**: saldo das contas patrimoniais até a data, mais o resultado do exercício ainda não encerrado.
- **Fluxo de caixa**: tabela `bank_transactions` (regime de caixa), classificada por atividade.

Lançamentos não são apagados. Cancelamentos e estornos geram um lançamento inverso, o que preserva o histórico para auditoria.

### Segurança

- Senhas com bcrypt (custo 12) e política de complexidade.
- Login com resposta genérica, tempo constante, bloqueio de 15 minutos após 5 falhas e limitação de requisições.
- JWT com expiração. O token fica em `sessionStorage`, cada requisição confere no banco se o usuário continua ativo, e a sessão cai após 30 minutos de inatividade.
- Perfis aplicados no servidor:
  - **admin**: acesso total.
  - **financeiro**: leitura e escrita.
  - **visualizador**: somente leitura.
- Auditoria de logins (incluindo falhas) e de toda operação de escrita, com usuário, IP e dados.
- Helmet, CORS restrito, limite de tamanho do corpo e validação de toda entrada com Zod.
- SQL sempre parametrizado e operações financeiras dentro de transações.

## Como executar

Pré-requisitos: Node.js 20+ e Docker (ou um PostgreSQL 14+ próprio).

```bash
# 1. Banco de dados
docker compose up -d

# 2. Back-end
cd backend
cp .env.example .env          # ajuste JWT_SECRET e a senha do admin
npm install
npm run db:migrate            # cria tabelas, plano de contas e usuário admin
npm run db:demo               # (opcional) 12 meses de dados fictícios
npm run dev                   # http://localhost:3333/api

# 3. Front-end (em outro terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173
```


