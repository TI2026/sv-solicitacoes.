-- Release Freeze: tipo único para evidência bancária do pagamento.
-- Em migration própria porque novos valores de enum só podem ser usados após commit.
ALTER TYPE public.fuel_attachment_type
  ADD VALUE IF NOT EXISTS 'comprovante_pagamento';
