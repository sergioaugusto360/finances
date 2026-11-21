-- Plano de contas padrão (simplificado, baseado na estrutura brasileira)
INSERT INTO company_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

INSERT INTO accounts (code, name, type, subtype, dre_group, system_key, accepts_entries) VALUES
 ('1',         'ATIVO',                              'ATIVO',     NULL,            NULL, NULL, FALSE),
 ('1.1',       'Ativo Circulante',                   'ATIVO',     'CIRCULANTE',    NULL, NULL, FALSE),
 ('1.1.1',     'Caixa e Equivalentes',               'ATIVO',     'CIRCULANTE',    NULL, 'GRUPO_BANCOS', FALSE),
 ('1.1.2',     'Clientes a Receber',                 'ATIVO',     'CIRCULANTE',    NULL, 'CLIENTES', TRUE),
 ('1.1.3',     'Estoques',                           'ATIVO',     'CIRCULANTE',    NULL, 'ESTOQUES', TRUE),
 ('1.1.4',     'Impostos a Recuperar',               'ATIVO',     'CIRCULANTE',    NULL, NULL, TRUE),
 ('1.2',       'Ativo Não Circulante',               'ATIVO',     'NAO_CIRCULANTE',NULL, NULL, FALSE),
 ('1.2.1',     'Imobilizado',                        'ATIVO',     'NAO_CIRCULANTE',NULL, NULL, TRUE),
 ('1.2.2',     '(-) Depreciação Acumulada',          'ATIVO',     'NAO_CIRCULANTE',NULL, NULL, TRUE),
 ('1.2.3',     'Intangível',                         'ATIVO',     'NAO_CIRCULANTE',NULL, NULL, TRUE),
 ('2',         'PASSIVO',                            'PASSIVO',   NULL,            NULL, NULL, FALSE),
 ('2.1',       'Passivo Circulante',                 'PASSIVO',   'CIRCULANTE',    NULL, NULL, FALSE),
 ('2.1.1',     'Fornecedores a Pagar',               'PASSIVO',   'CIRCULANTE',    NULL, 'FORNECEDORES', TRUE),
 ('2.1.2',     'Obrigações Trabalhistas',            'PASSIVO',   'CIRCULANTE',    NULL, NULL, TRUE),
 ('2.1.3',     'Obrigações Tributárias',             'PASSIVO',   'CIRCULANTE',    NULL, NULL, TRUE),
 ('2.1.4',     'Empréstimos de Curto Prazo',         'PASSIVO',   'CIRCULANTE',    NULL, NULL, TRUE),
 ('2.2',       'Passivo Não Circulante',             'PASSIVO',   'NAO_CIRCULANTE',NULL, NULL, FALSE),
 ('2.2.1',     'Empréstimos de Longo Prazo',         'PASSIVO',   'NAO_CIRCULANTE',NULL, NULL, TRUE),
 ('3',         'PATRIMÔNIO LÍQUIDO',                 'PATRIMONIO',NULL,            NULL, NULL, FALSE),
 ('3.1',       'Capital Social',                     'PATRIMONIO',NULL,            NULL, 'CAPITAL', TRUE),
 ('3.2',       'Lucros/Prejuízos Acumulados',        'PATRIMONIO',NULL,            NULL, 'LUCROS_ACUMULADOS', TRUE),
 ('3.3',       'Saldos Iniciais de Implantação',     'PATRIMONIO',NULL,            NULL, 'SALDOS_INICIAIS', TRUE),
 ('4',         'RECEITAS',                           'RECEITA',   NULL,            NULL, NULL, FALSE),
 ('4.1',       'Receita de Vendas de Produtos',      'RECEITA',   NULL, 'RECEITA_BRUTA', NULL, TRUE),
 ('4.2',       'Receita de Prestação de Serviços',   'RECEITA',   NULL, 'RECEITA_BRUTA', NULL, TRUE),
 ('4.3',       'Juros Recebidos',                    'RECEITA',   NULL, 'RECEITAS_FINANCEIRAS', 'JUROS_RECEBIDOS', TRUE),
 ('4.4',       'Descontos Obtidos',                  'RECEITA',   NULL, 'RECEITAS_FINANCEIRAS', 'DESCONTOS_OBTIDOS', TRUE),
 ('4.5',       'Rendimentos de Aplicações',          'RECEITA',   NULL, 'RECEITAS_FINANCEIRAS', NULL, TRUE),
 ('5',         'DEDUÇÕES DA RECEITA',                'DEDUCAO',   NULL,            NULL, NULL, FALSE),
 ('5.1',       'Impostos sobre Vendas',              'DEDUCAO',   NULL, 'DEDUCOES', NULL, TRUE),
 ('5.2',       'Devoluções e Abatimentos',           'DEDUCAO',   NULL, 'DEDUCOES', NULL, TRUE),
 ('6',         'CUSTOS',                             'CUSTO',     NULL,            NULL, NULL, FALSE),
 ('6.1',       'Custo das Mercadorias Vendidas',     'CUSTO',     NULL, 'CUSTOS', NULL, TRUE),
 ('6.2',       'Custo dos Serviços Prestados',       'CUSTO',     NULL, 'CUSTOS', NULL, TRUE),
 ('7',         'DESPESAS',                           'DESPESA',   NULL,            NULL, NULL, FALSE),
 ('7.1',       'Despesas com Pessoal',               'DESPESA',   NULL, 'DESPESAS_OPERACIONAIS', NULL, TRUE),
 ('7.2',       'Aluguel e Condomínio',               'DESPESA',   NULL, 'DESPESAS_OPERACIONAIS', NULL, TRUE),
 ('7.3',       'Energia, Água e Telecom',            'DESPESA',   NULL, 'DESPESAS_OPERACIONAIS', NULL, TRUE),
 ('7.4',       'Marketing e Publicidade',            'DESPESA',   NULL, 'DESPESAS_OPERACIONAIS', NULL, TRUE),
 ('7.5',       'Serviços de Terceiros',              'DESPESA',   NULL, 'DESPESAS_OPERACIONAIS', NULL, TRUE),
 ('7.6',       'Despesas Administrativas Gerais',    'DESPESA',   NULL, 'DESPESAS_OPERACIONAIS', NULL, TRUE),
 ('7.7',       'Depreciação e Amortização',          'DESPESA',   NULL, 'DEPRECIACAO', NULL, TRUE),
 ('7.8',       'Juros Pagos',                        'DESPESA',   NULL, 'DESPESAS_FINANCEIRAS', 'JUROS_PAGOS', TRUE),
 ('7.9',       'Descontos Concedidos',               'DESPESA',   NULL, 'DESPESAS_FINANCEIRAS', 'DESCONTOS_CONCEDIDOS', TRUE),
 ('7.10',      'Tarifas Bancárias',                  'DESPESA',   NULL, 'DESPESAS_FINANCEIRAS', NULL, TRUE),
 ('7.11',      'IRPJ e CSLL',                        'DESPESA',   NULL, 'IMPOSTOS_LUCRO', NULL, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Liga cada conta ao seu pai pelo código (1.1.2 -> 1.1)
UPDATE accounts c SET parent_id = p.id
  FROM accounts p
 WHERE c.parent_id IS NULL
   AND position('.' in c.code) > 0
   AND p.code = regexp_replace(c.code, '\.[^.]+$', '');

INSERT INTO cost_centers (code, name) VALUES
 ('ADM', 'Administrativo'), ('COM', 'Comercial'), ('OPE', 'Operações')
ON CONFLICT (code) DO NOTHING;
