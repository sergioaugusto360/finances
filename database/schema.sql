-- =====================================================================
-- Sistema Financeiro - Esquema PostgreSQL
-- Modelo contábil de partidas dobradas: toda operação financeira gera
-- lançamentos (journal_entries/journal_lines). DRE e Balanço são
-- derivados dos lançamentos; o Fluxo de Caixa deriva dos movimentos
-- bancários (bank_transactions).
-- =====================================================================

-- ---------- Segurança e administração ----------
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(160) NOT NULL UNIQUE,
  password_hash   VARCHAR(200) NOT NULL,
  role            VARCHAR(20)  NOT NULL DEFAULT 'visualizador'
                  CHECK (role IN ('admin','financeiro','visualizador')),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  action      VARCHAR(40)  NOT NULL,
  entity      VARCHAR(60)  NOT NULL,
  entity_id   VARCHAR(60),
  details     JSONB,
  ip          VARCHAR(60),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS company_settings (
  id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name  VARCHAR(160) NOT NULL DEFAULT 'Minha Empresa',
  document      VARCHAR(20),
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Plano de contas ----------
-- type: natureza da conta
-- subtype: CIRCULANTE / NAO_CIRCULANTE (contas patrimoniais)
-- dre_group: linha da DRE onde a conta é totalizada
CREATE TABLE IF NOT EXISTS accounts (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(30)  NOT NULL UNIQUE,
  name            VARCHAR(120) NOT NULL,
  type            VARCHAR(20)  NOT NULL
                  CHECK (type IN ('ATIVO','PASSIVO','PATRIMONIO','RECEITA','DEDUCAO','CUSTO','DESPESA')),
  subtype         VARCHAR(20)  CHECK (subtype IN ('CIRCULANTE','NAO_CIRCULANTE')),
  dre_group       VARCHAR(30)  CHECK (dre_group IN (
                    'RECEITA_BRUTA','DEDUCOES','CUSTOS','DESPESAS_OPERACIONAIS',
                    'DEPRECIACAO','RECEITAS_FINANCEIRAS','DESPESAS_FINANCEIRAS','IMPOSTOS_LUCRO')),
  parent_id       INTEGER REFERENCES accounts(id),
  system_key      VARCHAR(40) UNIQUE,
  accepts_entries BOOLEAN NOT NULL DEFAULT TRUE,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Gestão complementar ----------
CREATE TABLE IF NOT EXISTS cost_centers (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(20)  NOT NULL UNIQUE,
  name       VARCHAR(120) NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partners (
  id         SERIAL PRIMARY KEY,
  kind       VARCHAR(12)  NOT NULL CHECK (kind IN ('CLIENTE','FORNECEDOR','AMBOS')),
  name       VARCHAR(160) NOT NULL,
  document   VARCHAR(20),
  email      VARCHAR(160),
  phone      VARCHAR(30),
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  bank            VARCHAR(80),
  agency          VARCHAR(20),
  number          VARCHAR(30),
  account_id      INTEGER NOT NULL REFERENCES accounts(id),
  initial_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budgets (
  id         SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  year       INTEGER NOT NULL,
  month      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount     NUMERIC(14,2) NOT NULL,
  UNIQUE (account_id, year, month)
);

-- ---------- Contabilidade ----------
CREATE TABLE IF NOT EXISTS journal_entries (
  id          BIGSERIAL PRIMARY KEY,
  entry_date  DATE NOT NULL,
  description VARCHAR(255) NOT NULL,
  source      VARCHAR(20) NOT NULL
              CHECK (source IN ('MANUAL','TITULO','BAIXA','MOVIMENTO','TRANSFERENCIA','SALDO_INICIAL','ESTORNO')),
  source_id   BIGINT,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_je_date ON journal_entries(entry_date);

CREATE TABLE IF NOT EXISTS journal_lines (
  id             BIGSERIAL PRIMARY KEY,
  entry_id       BIGINT  NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id     INTEGER NOT NULL REFERENCES accounts(id),
  cost_center_id INTEGER REFERENCES cost_centers(id),
  debit          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK (debit = 0 OR credit = 0)
);
CREATE INDEX IF NOT EXISTS idx_jl_account ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_jl_entry ON journal_lines(entry_id);

-- ---------- Contas a pagar / receber ----------
CREATE TABLE IF NOT EXISTS financial_titles (
  id                 BIGSERIAL PRIMARY KEY,
  kind               VARCHAR(8)  NOT NULL CHECK (kind IN ('PAGAR','RECEBER')),
  partner_id         INTEGER REFERENCES partners(id),
  account_id         INTEGER NOT NULL REFERENCES accounts(id),
  cost_center_id     INTEGER REFERENCES cost_centers(id),
  description        VARCHAR(255) NOT NULL,
  document_number    VARCHAR(60),
  issue_date         DATE NOT NULL,
  due_date           DATE NOT NULL,
  amount             NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  status             VARCHAR(10) NOT NULL DEFAULT 'ABERTO'
                     CHECK (status IN ('ABERTO','PARCIAL','LIQUIDADO','CANCELADO')),
  installment        INTEGER NOT NULL DEFAULT 1,
  installments_total INTEGER NOT NULL DEFAULT 1,
  group_id           UUID,
  notes              TEXT,
  journal_entry_id   BIGINT REFERENCES journal_entries(id),
  created_by         INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_titles_kind_due ON financial_titles(kind, due_date);
CREATE INDEX IF NOT EXISTS idx_titles_status ON financial_titles(status);

CREATE TABLE IF NOT EXISTS title_payments (
  id               BIGSERIAL PRIMARY KEY,
  title_id         BIGINT  NOT NULL REFERENCES financial_titles(id),
  bank_account_id  INTEGER NOT NULL REFERENCES bank_accounts(id),
  payment_date     DATE NOT NULL,
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  interest         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (interest >= 0),
  discount         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  notes            TEXT,
  journal_entry_id BIGINT REFERENCES journal_entries(id),
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Movimentação bancária (base do fluxo de caixa) ----------
-- activity: classificação DFC (método direto)
CREATE TABLE IF NOT EXISTS bank_transactions (
  id               BIGSERIAL PRIMARY KEY,
  bank_account_id  INTEGER NOT NULL REFERENCES bank_accounts(id),
  tx_date          DATE NOT NULL,
  direction        VARCHAR(7) NOT NULL CHECK (direction IN ('ENTRADA','SAIDA')),
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description      VARCHAR(255) NOT NULL,
  activity         VARCHAR(20) NOT NULL
                   CHECK (activity IN ('OPERACIONAL','INVESTIMENTO','FINANCIAMENTO','TRANSFERENCIA','SALDO_INICIAL')),
  source           VARCHAR(20) NOT NULL,
  source_id        BIGINT,
  journal_entry_id BIGINT REFERENCES journal_entries(id),
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_btx_date ON bank_transactions(tx_date);
