import { BoletaConfig } from '../types';

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function createBoletaConfig(yearMonth: string, startingFolioJanuary2024: number): BoletaConfig {
  // Parse the year and month
  const [year, month] = yearMonth.split('-').map(Number);
  const periodoInicio = new Date(Date.UTC(year, month - 1, 1));
  const periodoFin = new Date(Date.UTC(year, month, 0)); // Last day of the month
  
  // Get previous month dates
  const prevMonthInicio = new Date(Date.UTC(year, month - 2, 1));
  const prevMonthFin = new Date(Date.UTC(year, month - 1, 0));
  
  const monthName = monthNames[month - 1];
  
  return {
    yearMonth,
    year,
    month,
    periodoInicio,
    periodoFin,
    prevMonthInicio,
    prevMonthFin,
    monthName,
    startingFolioJanuary2024
  };
}