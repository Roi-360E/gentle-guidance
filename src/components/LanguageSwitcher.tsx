import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Languages } from 'lucide-react';
import { useUserCurrency } from '@/hooks/useUserCurrency';

interface Props {
  compact?: boolean;
}

export const LanguageSwitcher = ({ compact = false }: Props) => {
  const { i18n } = useTranslation();
  const { setCurrency } = useUserCurrency();
  const current = (i18n.language || 'pt').split('-')[0];

  const onChange = (val: string) => {
    i18n.changeLanguage(val);
    // Suggest sensible default currency when user picks a language explicitly
    if (val === 'es') setCurrency('EUR');
    if (val === 'pt') setCurrency('BRL');
  };

  return (
    <div className={`inline-flex items-center gap-1.5 ${compact ? '' : 'bg-muted/30 border border-border rounded-lg px-2 py-1'}`}>
      <Languages className="w-3.5 h-3.5 text-muted-foreground" />
      <Select value={current} onValueChange={onChange}>
        <SelectTrigger className="h-7 w-[110px] text-xs border-0 bg-transparent focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pt">🇧🇷 Português</SelectItem>
          <SelectItem value="es">🇪🇸 Español</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
