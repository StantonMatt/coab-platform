/**
 * Types for PDF Boleta Generation
 */

export interface BoletaData {
  // Boleta info
  id: bigint;
  numeroFolio: string;
  fechaEmision: Date;
  fechaVencimiento: Date;
  periodoDesde: Date;
  periodoHasta: Date;
  
  // Amounts
  costoCargoFijo: number;
  costoAgua: number;
  costoAlcantarillado: number;
  costoTratamiento: number;
  montoTotalMes: number;
  montoSaldoAnterior: number;
  montoRepactacion: number;
  montoSubsidio: number;
  montoTotal: number;
  
  // Consumption
  consumoM3: number;
  lecturaAnterior: number;
  lecturaActual: number;
}

export interface ClienteData {
  id: bigint;
  numeroCliente: string;
  rut: string | null;
  nombreCompleto: string;
  direccion: string;
  comuna: string;
}

export interface BoletaPDFProps {
  boleta: BoletaData;
  cliente: ClienteData;
  qrCodeDataUrl?: string;
}

// Company info for the boleta
export const COMPANY_INFO = {
  nombre: 'COAB LTDA',
  rut: '76.607.412-K',
  banco: 'Banco Estado',
  cuentaCorriente: '62900310141',
  convenioRecaudacion: '1713',
  email: 'pagos@coab.cl',
  telefono: '+56 94511 8902',
  direccion: 'Antonio Varas N° 924 Of. 23, Temuco',
  oficina: '45 221 0529',
  emergencias: '+56 974497814',
  consultas: '+56 945118898',
  webPago: 'www.pagaqui.cl',
};

