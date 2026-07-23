
INSERT INTO public.sectors (name, code, active) VALUES
  ('Diretoria', 'diretoria', true),
  ('Administrativo', 'administrativo', true),
  ('RH', 'rh', true),
  ('Financeiro', 'financeiro', true),
  ('Compras', 'compras', true),
  ('Serviços', 'servicos', true),
  ('Obras', 'obras', true),
  ('Frota', 'frota', true),
  ('Almoxarifado', 'almoxarifado', true),
  ('Portaria', 'portaria', true),
  ('Comercial', 'comercial', true)
ON CONFLICT DO NOTHING;
