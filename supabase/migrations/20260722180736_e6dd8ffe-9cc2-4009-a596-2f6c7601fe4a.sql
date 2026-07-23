
INSERT INTO public.dynamic_categories (module, field_key, label, is_active)
SELECT 'compras', 'category', v.label, true
FROM (VALUES
  ('Material de Escritório'),
  ('Material de Limpeza'),
  ('Material de Construção'),
  ('Ferramentas'),
  ('EPI - Equipamento de Proteção'),
  ('Uniformes'),
  ('Equipamentos de Informática'),
  ('Software e Licenças'),
  ('Manutenção Predial'),
  ('Manutenção de Veículos'),
  ('Combustível'),
  ('Serviços Terceirizados'),
  ('Telefonia e Internet'),
  ('Marketing e Publicidade'),
  ('Alimentação'),
  ('Viagens e Hospedagem'),
  ('Treinamentos e Cursos'),
  ('Insumos Operacionais'),
  ('Outros')
) AS v(label)
WHERE NOT EXISTS (
  SELECT 1 FROM public.dynamic_categories
  WHERE module='compras' AND field_key='category' AND label = v.label
);
