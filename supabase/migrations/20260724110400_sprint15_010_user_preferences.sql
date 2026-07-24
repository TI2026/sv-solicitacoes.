-- sprint15_010_user_preferences.sql
-- Tabela para persistir preferências do usuário (ordem de abas, filtros, etc)

CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS: o próprio usuário pode gerenciar suas preferências
CREATE POLICY "Usuários podem ver suas próprias preferências" ON public.user_preferences
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir suas próprias preferências" ON public.user_preferences
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas próprias preferências" ON public.user_preferences
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas próprias preferências" ON public.user_preferences
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Função de trigger para updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger de Updated At
CREATE TRIGGER handle_updated_at 
BEFORE UPDATE ON public.user_preferences
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
