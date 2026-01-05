import { ChevronLeft, ChevronRight, Check, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PeriodData {
  año: number;
  mes: number;
  totalBoletas: number;
  boletasConPdf: number;
  tieneBoletasPdf: boolean;
}

interface MonthYearPickerProps {
  selectedPeriodo: string; // "YYYY-MM" format
  onSelect: (periodo: string) => void;
  availablePeriods: PeriodData[];
  isLoading?: boolean;
}

const MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

const MONTH_NAMES_FULL = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

export default function MonthYearPicker({
  selectedPeriodo,
  onSelect,
  availablePeriods,
  isLoading = false,
}: MonthYearPickerProps) {
  // Parse selected period (handle empty string)
  const [selectedYear, selectedMonth] = selectedPeriodo 
    ? selectedPeriodo.split('-').map(Number) 
    : [0, 0];
  
  // Determine the year range from available periods
  const years = [...new Set(availablePeriods.map(p => p.año))].sort((a, b) => b - a);
  const minYear = years.length > 0 ? Math.min(...years) : new Date().getFullYear() - 1;
  const maxYear = years.length > 0 ? Math.max(...years) : new Date().getFullYear();
  
  // Current display year (can navigate with arrows)
  const displayYear = selectedYear || maxYear;

  // Check if a month is available (has lecturas)
  const isMonthAvailable = (month: number) => {
    return availablePeriods.some(p => p.año === displayYear && p.mes === month);
  };

  // Get period data for a month
  const getPeriodData = (month: number): PeriodData | undefined => {
    return availablePeriods.find(p => p.año === displayYear && p.mes === month);
  };

  // Check if month is fully generated (all PDFs exist)
  const isFullyGenerated = (month: number): boolean => {
    const period = getPeriodData(month);
    return period ? period.totalBoletas > 0 && period.boletasConPdf === period.totalBoletas : false;
  };

  // Check if month is partially generated
  const isPartiallyGenerated = (month: number): boolean => {
    const period = getPeriodData(month);
    return period ? period.boletasConPdf > 0 && period.boletasConPdf < period.totalBoletas : false;
  };

  // Navigate year
  const handleYearChange = (delta: number) => {
    const newYear = displayYear + delta;
    if (newYear >= minYear && newYear <= maxYear) {
      // Find first available month in the new year
      const availableInYear = availablePeriods.filter(p => p.año === newYear);
      if (availableInYear.length > 0) {
        const firstMonth = availableInYear.sort((a, b) => b.mes - a.mes)[0].mes;
        onSelect(`${newYear}-${String(firstMonth).padStart(2, '0')}`);
      }
    }
  };

  // Handle month selection
  const handleMonthSelect = (month: number) => {
    if (isMonthAvailable(month)) {
      onSelect(`${displayYear}-${String(month).padStart(2, '0')}`);
    }
  };

  // Get selected period label
  const getSelectedLabel = () => {
    if (!selectedYear || !selectedMonth) return '';
    return `${MONTH_NAMES_FULL[selectedMonth - 1]} ${selectedYear}`;
  };

  return (
    <div className="space-y-4">
      {/* Year Navigation */}
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleYearChange(-1)}
          disabled={displayYear <= minYear || isLoading}
          className="h-8 w-8"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="text-lg font-semibold text-slate-900 min-w-[60px] text-center">
          {displayYear}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleYearChange(1)}
          disabled={displayYear >= maxYear || isLoading}
          className="h-8 w-8"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Month Grid */}
      <div className="grid grid-cols-4 gap-2">
        {MONTH_NAMES.map((name, index) => {
          const month = index + 1;
          const available = isMonthAvailable(month);
          const isSelected = selectedYear === displayYear && selectedMonth === month;
          const fullyGenerated = isFullyGenerated(month);
          const partiallyGenerated = isPartiallyGenerated(month);

          return (
            <button
              key={month}
              onClick={() => handleMonthSelect(month)}
              disabled={!available || isLoading}
              className={cn(
                'relative flex flex-col items-center justify-center py-3 px-2 rounded-lg text-sm font-medium transition-all',
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
                available
                  ? isSelected
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                  : 'bg-slate-50 text-slate-300 cursor-not-allowed'
              )}
            >
              <span>{name}</span>
              {/* Status indicator */}
              {available && (
                <span className="absolute top-1 right-1">
                  {fullyGenerated ? (
                    <Check className={cn(
                      'h-3 w-3',
                      isSelected ? 'text-white' : 'text-emerald-500'
                    )} />
                  ) : partiallyGenerated ? (
                    <Circle className={cn(
                      'h-2.5 w-2.5 fill-current',
                      isSelected ? 'text-white' : 'text-blue-500'
                    )} />
                  ) : null}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Period Label */}
      {selectedPeriodo && (
        <div className="text-center text-sm text-slate-500 capitalize">
          Seleccionado: <span className="font-medium text-slate-700">{getSelectedLabel()}</span>
        </div>
      )}

      {/* Legend */}
      <div className="flex justify-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <Check className="h-3 w-3 text-emerald-500" />
          <span>Todos con PDF</span>
        </div>
        <div className="flex items-center gap-1">
          <Circle className="h-2.5 w-2.5 fill-blue-500 text-blue-500" />
          <span>Parcial</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="h-3 w-3 bg-slate-50 rounded border border-slate-200" />
          <span>Sin lecturas</span>
        </div>
      </div>
    </div>
  );
}




