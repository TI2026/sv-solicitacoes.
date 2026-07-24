-- sprint15_011_fleet_discriminators.sql
-- Adiciona constraint rígida no discriminador `type` da tabela `fuel_requests`

DO $$
DECLARE
    invalid_rows INT;
BEGIN
    -- Validar se existem registros com 'type' inválido ou nulo
    SELECT COUNT(*) INTO invalid_rows 
    FROM public.fuel_requests 
    WHERE type IS NULL OR type NOT IN ('abastecimento', 'diaria', 'reembolso');

    IF invalid_rows > 0 THEN
        RAISE EXCEPTION 'A tabela fuel_requests possui % registros sem discriminador válido. A migração falhou. Limpe os dados legados ou corrija os valores de type antes de prosseguir.', invalid_rows;
    END IF;
END $$;

-- Agora é seguro adicionar a restrição e criar um índice
ALTER TABLE public.fuel_requests
ADD CONSTRAINT check_fuel_request_type 
CHECK (type IN ('abastecimento', 'diaria', 'reembolso'));

CREATE INDEX IF NOT EXISTS idx_fuel_requests_type ON public.fuel_requests(type);

-- Se for inserir um novo registro e omitir 'type', a constraint impedirá, mas vamos forçar NOT NULL se possível.
ALTER TABLE public.fuel_requests ALTER COLUMN type SET NOT NULL;
