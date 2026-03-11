import { Input } from '@/components/ui/input';
import { maskCurrency, currencyToNumber } from '@/lib/masks';

interface MoneyInputProps {
  value: string;
  onChange: (formatted: string, numeric: number) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  id?: string;
  max?: number;
}

export function MoneyInput({ value, onChange, placeholder = 'R$ 0,00', required, className, id, max = 50000 }: MoneyInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = maskCurrency(raw);
    const numeric = currencyToNumber(formatted);
    if (numeric <= max) {
      onChange(formatted, numeric);
    }
  };

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">R$</span>
      <Input
        id={id}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        inputMode="numeric"
        className={`pl-10 ${className || ''}`}
        required={required}
      />
    </div>
  );
}
