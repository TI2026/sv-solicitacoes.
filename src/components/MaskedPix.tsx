import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MaskedPixProps {
  value: string;
  isRevealed?: boolean;
  onToggleReveal?: (revealed: boolean) => void;
  className?: string;
}

export function MaskedPix({ value, isRevealed: controlledIsRevealed, onToggleReveal, className }: MaskedPixProps) {
  const [localIsRevealed, setLocalIsRevealed] = useState(false);

  const isRevealed = controlledIsRevealed !== undefined ? controlledIsRevealed : localIsRevealed;

  const toggleReveal = () => {
    const nextState = !isRevealed;
    setLocalIsRevealed(nextState);
    if (onToggleReveal) {
      onToggleReveal(nextState);
    }
  };

  const getMaskedValue = (val: string) => {
    if (!val) return '—';
    if (val.length <= 4) return '***';
    return `${val.substring(0, 3)}...${val.substring(val.length - 4)}`;
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="font-mono text-sm">
        {isRevealed ? value : getMaskedValue(value)}
      </span>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-6 w-6 text-muted-foreground hover:text-foreground"
        onClick={toggleReveal}
        title={isRevealed ? "Ocultar Chave PIX" : "Revelar Chave PIX"}
      >
        {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </Button>
    </div>
  );
}
