
-- =============================================
-- SECTORS TABLE (Block 6.3)
-- =============================================
CREATE TABLE IF NOT EXISTS public.sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  responsible_user_id uuid REFERENCES public.profiles(id),
  substitute_user_id uuid REFERENCES public.profiles(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view sectors" ON public.sectors
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Diretoria manages sectors" ON public.sectors
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria'::app_role))
  WITH CHECK (has_role(auth.uid(), 'diretoria'::app_role));

-- =============================================
-- ADD sector_id and manager_user_id to profiles (Block 6.4)
-- =============================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'sector_id') THEN
    ALTER TABLE public.profiles ADD COLUMN sector_id uuid REFERENCES public.sectors(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'manager_user_id') THEN
    ALTER TABLE public.profiles ADD COLUMN manager_user_id uuid REFERENCES public.profiles(id);
  END IF;
END $$;

-- =============================================
-- ADD approver_type columns to approval_flow_steps (Block 6.1/6.2)
-- =============================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approval_flow_steps' AND column_name = 'approver_type') THEN
    ALTER TABLE public.approval_flow_steps ADD COLUMN approver_type text NOT NULL DEFAULT 'usuario_fixo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approval_flow_steps' AND column_name = 'fixed_sector_id') THEN
    ALTER TABLE public.approval_flow_steps ADD COLUMN fixed_sector_id uuid REFERENCES public.sectors(id);
  END IF;
END $$;

-- ADD resolved columns to approval_request_steps (Block 6.5)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approval_request_steps' AND column_name = 'approver_rule') THEN
    ALTER TABLE public.approval_request_steps ADD COLUMN approver_rule text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approval_request_steps' AND column_name = 'resolved_sector_id') THEN
    ALTER TABLE public.approval_request_steps ADD COLUMN resolved_sector_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approval_request_steps' AND column_name = 'resolved_from_user_id') THEN
    ALTER TABLE public.approval_request_steps ADD COLUMN resolved_from_user_id uuid;
  END IF;
END $$;

-- =============================================
-- ADD clothing sizes to candidates (Block 3.6)
-- =============================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'shirt_size') THEN
    ALTER TABLE public.candidates ADD COLUMN shirt_size text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'pants_size') THEN
    ALTER TABLE public.candidates ADD COLUMN pants_size text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'shoe_size') THEN
    ALTER TABLE public.candidates ADD COLUMN shoe_size text;
  END IF;
END $$;

-- =============================================
-- SEED DYNAMIC CATEGORIES: CARGOS (Block 3.1)
-- =============================================
INSERT INTO public.dynamic_categories (module, field_key, label) VALUES
('admissions','job_title','Arquiteto de edificações'),
('admissions','job_title','Arquiteto de interiores'),
('admissions','job_title','Arquiteto paisagista'),
('admissions','job_title','Arquiteto urbanista'),
('admissions','job_title','Desenhista projetista de arquitetura'),
('admissions','job_title','Desenhista projetista de construção civil'),
('admissions','job_title','Desenhista projetista de eletricidade'),
('admissions','job_title','Desenhista técnico (construção civil)'),
('admissions','job_title','Desenhista técnico (instalações hidrossanitárias)'),
('admissions','job_title','Eletrotécnico'),
('admissions','job_title','Engenheiro ambiental'),
('admissions','job_title','Engenheiro civil'),
('admissions','job_title','Engenheiro civil (edificações)'),
('admissions','job_title','Engenheiro civil (estruturas metálicas)'),
('admissions','job_title','Engenheiro civil (geotécnia)'),
('admissions','job_title','Engenheiro civil (hidráulica)'),
('admissions','job_title','Engenheiro civil (rodovias)'),
('admissions','job_title','Engenheiro civil (saneamento)'),
('admissions','job_title','Engenheiro civil (transportes e trânsito)'),
('admissions','job_title','Engenheiro de controle de qualidade'),
('admissions','job_title','Engenheiro de produção'),
('admissions','job_title','Engenheiro de redes de comunicação'),
('admissions','job_title','Engenheiro de segurança do trabalho'),
('admissions','job_title','Engenheiro de telecomunicações'),
('admissions','job_title','Engenheiro eletricista'),
('admissions','job_title','Engenheiro eletricista de manutenção'),
('admissions','job_title','Engenheiro eletricista de projetos'),
('admissions','job_title','Engenheiro eletrônico'),
('admissions','job_title','Engenheiro eletrônico de manutenção'),
('admissions','job_title','Engenheiro eletrônico de projetos'),
('admissions','job_title','Engenheiro mecânico'),
('admissions','job_title','Engenheiro mecânico industrial'),
('admissions','job_title','Engenheiro projetista de telecomunicações'),
('admissions','job_title','Tecnólogo em construção civil'),
('admissions','job_title','Tecnólogo em segurança do trabalho'),
('admissions','job_title','Topógrafo'),
('admissions','job_title','Técnico de estradas'),
('admissions','job_title','Técnico de obras civis'),
('admissions','job_title','Técnico de saneamento'),
('admissions','job_title','Técnico eletricista'),
('admissions','job_title','Técnico em agrimensura'),
('admissions','job_title','Técnico em segurança do trabalho'),
('admissions','job_title','Armador de estrutura de concreto'),
('admissions','job_title','Armador de estrutura de concreto armado'),
('admissions','job_title','Assentador de canalização (edificações)'),
('admissions','job_title','Assentador de revestimentos cerâmicos'),
('admissions','job_title','Carpinteiro'),
('admissions','job_title','Carpinteiro de fôrmas para concreto'),
('admissions','job_title','Carpinteiro de obras'),
('admissions','job_title','Demolidor de edificações'),
('admissions','job_title','Eletricista de instalações'),
('admissions','job_title','Eletricista de instalações (edifícios)'),
('admissions','job_title','Encanador'),
('admissions','job_title','Fiscal de pátio de usina de concreto'),
('admissions','job_title','Gerente de produção e operações da construção civil e obras públicas'),
('admissions','job_title','Gesseiro'),
('admissions','job_title','Inspetor de terraplenagem'),
('admissions','job_title','Instalador de sistemas fotovoltaicos'),
('admissions','job_title','Instalador de tubulações'),
('admissions','job_title','Marmorista (construção)'),
('admissions','job_title','Mestre (construção civil)'),
('admissions','job_title','Montador de andaimes (edificações)'),
('admissions','job_title','Operador de martelete'),
('admissions','job_title','Pedreiro'),
('admissions','job_title','Pedreiro de edificações'),
('admissions','job_title','Pintor de obras'),
('admissions','job_title','Poceiro (edificações)'),
('admissions','job_title','Rejuntador de revestimentos'),
('admissions','job_title','Serralheiro'),
('admissions','job_title','Servente de obras'),
('admissions','job_title','Supervisor de usina de concreto'),
('admissions','job_title','Telhador (telhas de argila e materiais similares)'),
('admissions','job_title','Telhador (telhas metálicas)'),
('admissions','job_title','Vidraceiro'),
('admissions','job_title','Vidraceiro (edificações)'),
('admissions','job_title','Agente de portaria'),
('admissions','job_title','Agente de segurança'),
('admissions','job_title','Gestor em segurança'),
('admissions','job_title','Instalador de sistemas eletroeletrônicos de segurança'),
('admissions','job_title','Mantenedor de sistemas eletroeletrônicos de segurança'),
('admissions','job_title','Monitor de sistemas eletrônicos de segurança externo'),
('admissions','job_title','Monitor de sistemas eletrônicos de segurança interno'),
('admissions','job_title','Porteiro de edifícios'),
('admissions','job_title','Supervisor de vigilantes'),
('admissions','job_title','Vigia'),
('admissions','job_title','Vigilante'),
('admissions','job_title','Faxineiro'),
('admissions','job_title','Jardineiro'),
('admissions','job_title','Limpador de fachadas'),
('admissions','job_title','Limpador de piscinas'),
('admissions','job_title','Limpador de vidros'),
('admissions','job_title','Trabalhador da manutenção de edificações'),
('admissions','job_title','Trabalhador de serviços de limpeza e conservação de áreas públicas'),
('admissions','job_title','Varredor de rua'),
('admissions','job_title','Administrador de edifícios'),
('admissions','job_title','Auxiliar de manutenção predial'),
('admissions','job_title','Eletricista de manutenção eletroeletrônica'),
('admissions','job_title','Garagista'),
('admissions','job_title','Gerente de facility management'),
('admissions','job_title','Mecânico de manutenção e instalação de aparelhos de climatização e refrigeração'),
('admissions','job_title','Técnico de manutenção elétrica'),
('admissions','job_title','Técnico de manutenção elétrica de máquina'),
('admissions','job_title','Zelador de edifício'),
('admissions','job_title','Administrador'),
('admissions','job_title','Analista de folha de pagamento'),
('admissions','job_title','Analista de recursos humanos'),
('admissions','job_title','Assistente administrativo'),
('admissions','job_title','Auxiliar de contabilidade'),
('admissions','job_title','Auxiliar de escritório'),
('admissions','job_title','Auxiliar de faturamento'),
('admissions','job_title','Auxiliar de pessoal'),
('admissions','job_title','Contador'),
('admissions','job_title','Diretor administrativo'),
('admissions','job_title','Diretor administrativo e financeiro'),
('admissions','job_title','Diretor de recursos humanos'),
('admissions','job_title','Diretor de relações de trabalho'),
('admissions','job_title','Diretor financeiro'),
('admissions','job_title','Gerente administrativo'),
('admissions','job_title','Gerente de departamento pessoal'),
('admissions','job_title','Gerente de recursos humanos'),
('admissions','job_title','Gerente financeiro'),
('admissions','job_title','Recepcionista, em geral'),
('admissions','job_title','Secretária(o) executiva(o)'),
('admissions','job_title','Supervisor administrativo'),
('admissions','job_title','Tecnólogo em gestão administrativo- financeira'),
('admissions','job_title','Agente de vendas de serviços'),
('admissions','job_title','Almoxarife'),
('admissions','job_title','Analista de gestão de estoque'),
('admissions','job_title','Analista de logistica'),
('admissions','job_title','Analista de negócios'),
('admissions','job_title','Analista de pesquisa de mercado'),
('admissions','job_title','Analista de planejamento de materias'),
('admissions','job_title','Analista de projetos logisticos'),
('admissions','job_title','Apontador de mão-de-obra'),
('admissions','job_title','Armazenista'),
('admissions','job_title','Assistente de vendas'),
('admissions','job_title','Auxiliar de logistica'),
('admissions','job_title','Comprador'),
('admissions','job_title','Conferente de carga e descarga'),
('admissions','job_title','Conferente mercadoria (exceto carga e descarga)'),
('admissions','job_title','Diretor comercial'),
('admissions','job_title','Diretor de marketing'),
('admissions','job_title','Estoquista'),
('admissions','job_title','Expedidor de mercadorias'),
('admissions','job_title','Gerente comercial'),
('admissions','job_title','Gerente de marketing'),
('admissions','job_title','Gerente de vendas'),
('admissions','job_title','Motorista de caminhão (rotas regionais e internacionais)'),
('admissions','job_title','Motorista de carro de passeio'),
('admissions','job_title','Motorista de furgão ou veículo similar'),
('admissions','job_title','Supervisor de almoxarifado'),
('admissions','job_title','Supervisor de compras'),
('admissions','job_title','Supervisor de logística'),
('admissions','job_title','Supervisor de orçamento'),
('admissions','job_title','Técnico de vendas'),
('admissions','job_title','Técnico em atendimento e vendas'),
('admissions','job_title','Vendedor pracista')
ON CONFLICT DO NOTHING;

-- =============================================
-- SEED DYNAMIC CATEGORIES: JORNADAS (Block 3.2)
-- =============================================
INSERT INTO public.dynamic_categories (module, field_key, label) VALUES
('admissions','work_shift','12/36 Dia Ímpar — 06:00 às 18:00'),
('admissions','work_shift','12/36 Dia Ímpar — Intervalar'),
('admissions','work_shift','12/36 Dia Par — 06:00 às 18:00'),
('admissions','work_shift','12/36 Dia Par — Intervalar'),
('admissions','work_shift','12/36 Noite Ímpar — 18:00 às 06:00'),
('admissions','work_shift','12/36 Noite Ímpar — 18:30 às 06:30'),
('admissions','work_shift','12/36 Noite Ímpar — Intervalar'),
('admissions','work_shift','12/36 Noite Par — 18:00 às 06:00'),
('admissions','work_shift','12/36 Noite Par — 18:30 às 06:30'),
('admissions','work_shift','12/36 Noite Par — Intervalar'),
('admissions','work_shift','Horário Obras — 07:30 às 17:30'),
('admissions','work_shift','Horário Obras — 07:00 às 17:30'),
('admissions','work_shift','Horário Obras Engenharia'),
('admissions','work_shift','Isabel — Meio Turno Manhã'),
('admissions','work_shift','MRV Flores do Outono — São José/SC'),
('admissions','work_shift','MRV Flores do Vale — Biguaçu/SC'),
('admissions','work_shift','Porto Alegre — Turno Integral 08:00 às 17:00'),
('admissions','work_shift','Porto Alegre — Turno Integral 08:30 às 17:30'),
('admissions','work_shift','Porto Alegre — Turno Manhã 08:30 às 12:30'),
('admissions','work_shift','Redução Aviso — 2h Ímpar'),
('admissions','work_shift','Segunda a Quinta 07:00 às 17:00 / Sexta 07:00 às 16:00'),
('admissions','work_shift','Segunda a Sábado — 08:00 às 17:30'),
('admissions','work_shift','Segunda a Sábado — 08:00 às 17:00'),
('admissions','work_shift','Segunda a Sexta — 07:50 às 17:50'),
('admissions','work_shift','Segunda a Sexta — 07:00 às 16:00'),
('admissions','work_shift','Segunda a Sexta — 07:30 às 17:30'),
('admissions','work_shift','Segunda a Sexta — 07:30 às 17:30 (Manutenção Canoas)'),
('admissions','work_shift','Segunda a Sexta — 08:00 às 18:00'),
('admissions','work_shift','Segunda a Sexta — 08:00 às 16:00'),
('admissions','work_shift','Segunda a Sexta — 08:00 às 17:48'),
('admissions','work_shift','Segunda a Sexta — 08:30 às 12:30'),
('admissions','work_shift','Segunda a Sexta — 07:00 às 17:00')
ON CONFLICT DO NOTHING;

-- =============================================
-- SEED DYNAMIC CATEGORIES: LOCAIS (Block 3.3)
-- =============================================
INSERT INTO public.dynamic_categories (module, field_key, label) VALUES
('admissions','hiring_location','SV Engenharia — Administrativo'),
('admissions','hiring_location','Uniformes e EPI''s'),
('admissions','hiring_location','MRV Porto Montenegro'),
('admissions','hiring_location','MRV Flores de Gaia — SC'),
('admissions','hiring_location','MRV Porto Bremen — RS'),
('admissions','hiring_location','MRV Frankfurt — SC'),
('admissions','hiring_location','MRV Flores de Évora — SC'),
('admissions','hiring_location','MRV Porto Missões — RS'),
('admissions','hiring_location','MRV Log Joinville — SC'),
('admissions','hiring_location','MRV Porto Bello — RS'),
('admissions','hiring_location','MRV Flores de Violetas — SC'),
('admissions','hiring_location','MRV Porto Cambará — POA'),
('admissions','hiring_location','MRV Bragança — SC'),
('admissions','hiring_location','MRV Bamburgo — SC'),
('admissions','hiring_location','MRV Alvorada — SC'),
('admissions','hiring_location','MRV Sintonia — Palhoça — SC'),
('admissions','hiring_location','MRV Loja São José — SC'),
('admissions','hiring_location','MRV Jardim Di Ávila — Joinville — SC'),
('admissions','hiring_location','MRV Jardim dos Príncipes — Joinville — SC'),
('admissions','hiring_location','MRV Loja Sensia — Curitiba — PR'),
('admissions','hiring_location','MRV Loja Central — Curitiba — PR'),
('admissions','hiring_location','CVT HUBB — MRV — SC'),
('admissions','hiring_location','Centro de Treinamento MRV — SC'),
('admissions','hiring_location','CMEI Regina Piola'),
('admissions','hiring_location','Lar São Francisco — 1ª Etapa'),
('admissions','hiring_location','Lar São Francisco — 2ª Etapa'),
('admissions','hiring_location','Lar de Acolhimento — Nova Prata'),
('admissions','hiring_location','Aditivo Lar de Acolhimento — Nova Prata'),
('admissions','hiring_location','Drenagem Pluvial Sagrado Coração de Jesus — Veranópolis'),
('admissions','hiring_location','Guerino Zugno'),
('admissions','hiring_location','Quadra Jardim América — CXS'),
('admissions','hiring_location','Largo da Antiga Estação Férrea — Lote 05'),
('admissions','hiring_location','Revitalização Antiga Pedreira — São Marcos'),
('admissions','hiring_location','Conjunto Habitacional — Tapejara'),
('admissions','hiring_location','EEI Leon — CXS'),
('admissions','hiring_location','EEI Dr. Renan — CXS'),
('admissions','hiring_location','EEI Frei Ambrósio — CXS'),
('admissions','hiring_location','EEI Ana Aurora do Amaral Lisboa I — CXS'),
('admissions','hiring_location','EEI Santos Dumont — CXS'),
('admissions','hiring_location','EMEF Atiliano Pinguelo — CXS'),
('admissions','hiring_location','EMEF Fioravante Webber — CXS'),
('admissions','hiring_location','EMEF Catulo da Paixão Cearense — CXS'),
('admissions','hiring_location','EMEF Machado de Assis — CXS'),
('admissions','hiring_location','EMEF Ruben Bento Alves — CXS'),
('admissions','hiring_location','EMEF Armindo Mario Turra — CXS'),
('admissions','hiring_location','EMEF Padre Antonio Vieira — CXS'),
('admissions','hiring_location','EMEF João de Zorzi — CXS'),
('admissions','hiring_location','EMEF Paulo Freire — CXS'),
('admissions','hiring_location','EMEF Nova Esperança — CXS'),
('admissions','hiring_location','EMEF José Bonifácio — CXS'),
('admissions','hiring_location','EMEF Arnaldo Ballvé — CXS'),
('admissions','hiring_location','EMEF Angelo Francisco Guerra — CXS'),
('admissions','hiring_location','EMEF Guerino Zugno — CXS'),
('admissions','hiring_location','EMEF São Vicente de Paulo'),
('admissions','hiring_location','EMEF San Gennaro — Pintura'),
('admissions','hiring_location','UBS Lindolfo Collor'),
('admissions','hiring_location','Aeroporto Hugo Cantergiani'),
('admissions','hiring_location','Pavimentação'),
('admissions','hiring_location','Pavimentação PAVS Rua dos Brilhantes'),
('admissions','hiring_location','Reforma de Muro da Divisa na SMTTM'),
('admissions','hiring_location','Estação Férrea — Aditivo'),
('admissions','hiring_location','Lavagem EPI Floresta'),
('admissions','hiring_location','Lavagem EPI Imigrantes'),
('admissions','hiring_location','EPI Imigrantes — Itens Diversos'),
('admissions','hiring_location','EPI Floresta — Itens Diversos'),
('admissions','hiring_location','Reformas Tapumes EPI Imigrantes'),
('admissions','hiring_location','Pintura Condomínio Raiar del Puerto'),
('admissions','hiring_location','Pintura Parque Orquídeas — CXS'),
('admissions','hiring_location','Residencial Alto de Lourdes'),
('admissions','hiring_location','Residencial Santo Stino Di Livenza'),
('admissions','hiring_location','Limpeza Porto Cambará'),
('admissions','hiring_location','Limpeza Pós-Obra Luggo MRV'),
('admissions','hiring_location','Limpeza Pós-Obra Porto América MRV'),
('admissions','hiring_location','Limpeza Pós-Obra Flores do Porto — SC'),
('admissions','hiring_location','Limpeza Pós-Obra Porto Montenegro'),
('admissions','hiring_location','Limpeza Parque Poente — Viamão'),
('admissions','hiring_location','Limpeza Passo Petrópolis — POA'),
('admissions','hiring_location','Bulltrade Sapucaia — RS'),
('admissions','hiring_location','NAV Taquari — RS'),
('admissions','hiring_location','NAV Taquara — RS'),
('admissions','hiring_location','NAV Guaíba — RS'),
('admissions','hiring_location','PRF — Superintendência PRF — PE'),
('admissions','hiring_location','PRF — COE Hangar — PE'),
('admissions','hiring_location','PRF — 1ª Delegacia Recife — PE'),
('admissions','hiring_location','PRF — UOP Igarassu — PE'),
('admissions','hiring_location','PRF — UOP Água Preta — PE'),
('admissions','hiring_location','PRF — 2ª Delegacia Caruaru — PE'),
('admissions','hiring_location','PRF — UOP Gravatá — PE'),
('admissions','hiring_location','PRF — 3ª Delegacia Garanhuns — PE'),
('admissions','hiring_location','PRF — UOP São Caitano — PE'),
('admissions','hiring_location','PRF — 4ª Delegacia Serra Talhada — PE'),
('admissions','hiring_location','PRF — UOP Sertânia / Cruzeiro do Nordeste — PE'),
('admissions','hiring_location','PRF — UOP Floresta — PE'),
('admissions','hiring_location','PRF — 5ª Delegacia Salgueiro — PE'),
('admissions','hiring_location','PRF — UOP Ouricuri — PE'),
('admissions','hiring_location','PRF — UOP Trevo do Ibó — PE'),
('admissions','hiring_location','PRF — 6ª Delegacia Petrolina — PE'),
('admissions','hiring_location','PRF — UOP Rajada — PE'),
('admissions','hiring_location','PRF — UOP Santa Maria da Boa Vista — PE'),
('admissions','hiring_location','PRF — Juriti — PE'),
('admissions','hiring_location','Centro Administrativo Municipal — Porto Alegre'),
('admissions','hiring_location','Centro Agrícola Demonstrativo — Viamão'),
('admissions','hiring_location','Subprefeitura Centro — POA'),
('admissions','hiring_location','Subprefeitura Centro/Sul — POA'),
('admissions','hiring_location','Subprefeitura Cristal — POA'),
('admissions','hiring_location','Subprefeitura Cruzeiro — POA'),
('admissions','hiring_location','Subprefeitura Eixo Baltazar — POA'),
('admissions','hiring_location','Subprefeitura Extremo Sul — POA'),
('admissions','hiring_location','Subprefeitura Glória — POA'),
('admissions','hiring_location','Subprefeitura Humaitá/Navegantes — POA'),
('admissions','hiring_location','Subprefeitura Ilhas — POA'),
('admissions','hiring_location','Subprefeitura Leste — POA'),
('admissions','hiring_location','Subprefeitura Lomba do Pinheiro — POA'),
('admissions','hiring_location','Subprefeitura Nordeste — POA'),
('admissions','hiring_location','Subprefeitura Noroeste — POA'),
('admissions','hiring_location','Subprefeitura Norte — POA'),
('admissions','hiring_location','Subprefeitura Partenon — POA'),
('admissions','hiring_location','Subprefeitura Restinga — POA'),
('admissions','hiring_location','Subprefeitura Sul — POA'),
('admissions','hiring_location','Brigada Militar — Núcleo 02'),
('admissions','hiring_location','Prédios Brigada Militar — POA'),
('admissions','hiring_location','Troca de Piso Colégio Tiradentes'),
('admissions','hiring_location','Troca de Piso Sala Tiradentes'),
('admissions','hiring_location','Piso Refeitório Tiradentes'),
('admissions','hiring_location','Biblioteca Tiradentes — CXS'),
('admissions','hiring_location','Viezzer Engenharia')
ON CONFLICT DO NOTHING;

-- =============================================
-- Add notification_preferences to profiles (Block 9)
-- =============================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'notification_preferences') THEN
    ALTER TABLE public.profiles ADD COLUMN notification_preferences jsonb NOT NULL DEFAULT '{"email": true, "push": false}'::jsonb;
  END IF;
END $$;
