import { Decimal } from 'decimal.js';

export interface SubsidyCalculationParams {
  subsidyType: number; // 1 for 50%, 2 for 100%
  consumption: number;
  waterRate: number;
  sewageRate: number;
  treatmentRate: number;
  fixedCharge: number;
  useNewFormula: boolean; // true for dates >= 2024-04
}

export interface BoletaConfig {
  yearMonth: string; // Format: YYYY-MM
  year: number;
  month: number;
  periodoInicio: Date;
  periodoFin: Date;
  prevMonthInicio: Date;
  prevMonthFin: Date;
  monthName: string;
  startingFolioJanuary2024: number;
}

export interface ChargeBreakdown {
  cargoFijo: Decimal;
  costoAgua: Decimal;
  costoAlcantarillado: Decimal;
  costoTratamiento: Decimal;
  subtotal: Decimal;
  montoDescuento: Decimal;
  montoSubsidio: Decimal;
  montoTotalMes: Decimal;
  montoTotalSubsidiado: Decimal;
  montoNeto: Decimal;
  montoIva: Decimal;
}

export interface MultaInfo {
  montoMultaAfectoIva: Decimal;
  montoCargoSinIva: Decimal;
  multaIds: number[];
}

export interface ReposicionInfo {
  montoReposicionAfectoIva: Decimal;
  montoReposicionSinIva: Decimal;
  corteIds: number[];
}

export interface NotaCreditoInfo {
  montoNotaCredito: Decimal;
  notasAplicables: any[];
}

export interface MeterReadingInfo {
  medidor: any;
  lecturaAnterior: any;
  lecturaActual: any;
  valorAnterior: Decimal;
  valorActual: Decimal;
  consumo: Decimal;
}

export interface RepactacionInfo {
  montoRepactacion: Decimal;
  repactacionId: bigint | null;
}

export interface BoletaData {
  cliente_id: bigint;
  numero_cliente: string;
  numero_folio: string;
  periodo_desde: Date;
  periodo_hasta: Date;
  fecha_emision: Date;
  fecha_vencimiento: Date;
  estado: string;
  monto_subsidio: Decimal;
  monto_interes: Decimal;
  monto_otros_cargos: Decimal;
  monto_repactacion: Decimal;
  monto_saldo_anterior: Decimal;
  monto_neto: Decimal;
  monto_iva: Decimal;
  monto_total: Decimal;
  monto_descuento: Decimal;
  monto_total_mes: Decimal;
  monto_total_subsidiado: Decimal;
  consumo_m3: Decimal;
  observaciones: string;
  repactacion_id: bigint | null;
}