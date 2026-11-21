export type Role = 'admin' | 'financeiro' | 'visualizador';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface Account {
  id: number;
  code: string;
  name: string;
  type: 'ATIVO' | 'PASSIVO' | 'PATRIMONIO' | 'RECEITA' | 'DEDUCAO' | 'CUSTO' | 'DESPESA';
  subtype: 'CIRCULANTE' | 'NAO_CIRCULANTE' | null;
  dre_group: string | null;
  parent_id: number | null;
  system_key: string | null;
  accepts_entries: boolean;
  active: boolean;
  has_entries?: boolean;
}

export interface CostCenter { id: number; code: string; name: string; active: boolean }

export interface Partner {
  id: number;
  kind: 'CLIENTE' | 'FORNECEDOR' | 'AMBOS';
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
}

export interface BankAccount {
  id: number;
  name: string;
  bank: string | null;
  agency: string | null;
  number: string | null;
  account_code: string;
  initial_balance: number;
  saldo: number;
  active: boolean;
}

export type TitleStatus = 'ABERTO' | 'PARCIAL' | 'LIQUIDADO' | 'CANCELADO';

export interface Title {
  id: number;
  kind: 'PAGAR' | 'RECEBER';
  partner_id: number | null;
  partner_name: string | null;
  account_id: number;
  account_code: string;
  account_name: string;
  cost_center_id: number | null;
  cost_center_name: string | null;
  description: string;
  document_number: string | null;
  issue_date: string;
  due_date: string;
  amount: number;
  paid_amount: number;
  saldo: number;
  status: TitleStatus;
  vencido: boolean;
  installment: number;
  installments_total: number;
  notes: string | null;
}

export interface Payment {
  id: number;
  payment_date: string;
  amount: number;
  interest: number;
  discount: number;
  bank_name: string;
  user_name: string | null;
  notes: string | null;
}

export interface DreSummary {
  receita_bruta: number; deducoes: number; receita_liquida: number; custos: number; lucro_bruto: number;
  despesas_operacionais: number; ebitda: number; depreciacao: number; ebit: number; receitas_financeiras: number;
  despesas_financeiras: number; resultado_financeiro: number; lair: number; impostos_lucro: number; lucro_liquido: number;
}

export interface Aging {
  a_vencer: number; vencido_1_30: number; vencido_31_60: number; vencido_61_90: number; vencido_90_mais: number; total_aberto: number;
}
