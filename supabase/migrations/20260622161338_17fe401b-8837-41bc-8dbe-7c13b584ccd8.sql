
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
RETURNS public.app_role[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_authorized boolean := FALSE;
  v_roles public.app_role[];
BEGIN
  -- Visibilidade: o próprio usuário, ou diretoria/master (legado ou novo modelo)
  IF v_caller_id = _user_id THEN
    v_is_authorized := TRUE;
  ELSE
    v_is_authorized := EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = v_caller_id AND role IN ('diretoria'::public.app_role, 'master'::public.app_role)
      UNION ALL
      SELECT 1
      FROM public.user_role_assignments ja
      JOIN public.roles r ON r.id = ja.role_id
      WHERE ja.user_id = v_caller_id
        AND (r.code IN ('diretoria','master') OR r.is_master = TRUE)
    );
  END IF;

  IF NOT v_is_authorized THEN
    RETURN ARRAY[]::public.app_role[];
  END IF;

  -- Combina, converte e deduplica as fontes de papéis
  SELECT COALESCE(array_agg(DISTINCT role_enum), ARRAY[]::public.app_role[])
  INTO v_roles
  FROM (
    -- 1) Fonte legada
    SELECT role AS role_enum
    FROM public.user_roles
    WHERE user_id = _user_id

    UNION

    -- 2) Modelo novo: converte code -> enum apenas para valores válidos
    SELECT r.code::public.app_role
    FROM public.user_role_assignments ja
    JOIN public.roles r ON r.id = ja.role_id
    WHERE ja.user_id = _user_id
      AND r.code IN ('master','diretoria','supervisor','financeiro','compras','administrativo','rh','colaborador')

    UNION

    -- 3) Flag is_master injeta automaticamente o papel 'master'
    SELECT 'master'::public.app_role
    FROM public.user_role_assignments ja
    JOIN public.roles r ON r.id = ja.role_id
    WHERE ja.user_id = _user_id AND r.is_master = TRUE
  ) AS combined_sources;

  RETURN v_roles;
END;
$$;
