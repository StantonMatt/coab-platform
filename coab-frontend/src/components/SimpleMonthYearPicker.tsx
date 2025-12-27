import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SimpleMonthYearPickerProps {
  value: string; // "YYYY-MM" format
  onChange: (value: string) => void;
  minYear?: number;
  maxYear?: number;
  className?: string;
}

const MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

const MONTH_NAMES_FULL = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

export default function SimpleMonthYearPicker({
  value,
  onChange,
  minYear = new Date().getFullYear() - 5,
  maxYear = new Date().getFullYear() + 1,
  className,
}: SimpleMonthYearPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Parse value
  const [selectedYear, selectedMonth] = value.split('-').map(Number);
  const [displayYear, setDisplayYear] = useState(selectedYear || new Date().getFullYear());

  // Sync display year when value changes
  useEffect(() => {
    if (selectedYear) {
      setDisplayYear(selectedYear);
    }
  }, [selectedYear]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Navigate year
  const handleYearChange = (delta: number) => {
    const newYear = displayYear + delta;
    if (newYear >= minYear && newYear <= maxYear) {
      setDisplayYear(newYear);
    }
  };

  // Handle month selection
  const handleMonthSelect = (month: number) => {
    onChange(`${displayYear}-${String(month).padStart(2, '0')}`);
    setIsOpen(false);
  };

  // Get display label
  const getDisplayLabel = () => {
    if (!selectedYear || !selectedMonth) return 'Seleccionar mes';
    const monthName = MONTH_NAMES_FULL[selectedMonth - 1];
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${selectedYear}`;
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center justify-between w-full px-3 py-2 text-left',
          'bg-white border border-slate-200 rounded-lg',
          'hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          'text-sm text-slate-900'
        )}
      >
        <span className={!selectedYear ? 'text-slate-400' : ''}>
          {getDisplayLabel()}
        </span>
        <Calendar className="h-4 w-4 text-slate-400" />
      </button>

      {/* Dropdown Calendar */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 p-3 bg-white border border-slate-200 rounded-lg shadow-lg">
          {/* Year Navigation */}
          <div className="flex items-center justify-between mb-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => handleYearChange(-1)}
              disabled={displayYear <= minYear}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-base font-semibold text-slate-900">
              {displayYear}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => handleYearChange(1)}
              disabled={displayYear >= maxYear}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Month Grid */}
          <div className="grid grid-cols-4 gap-1.5">
            {MONTH_NAMES.map((name, index) => {
              const month = index + 1;
              const isSelected = selectedYear === displayYear && selectedMonth === month;

              return (
                <button
                  key={month}
                  type="button"
                  onClick={() => handleMonthSelect(month)}
                  className={cn(
                    'py-2 px-1 rounded-md text-sm font-medium transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

