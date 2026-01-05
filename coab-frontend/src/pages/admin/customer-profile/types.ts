// Customer Profile Types

export interface Customer {
  id: string;
  rut: string | null;
  numeroCliente: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  saldo: number;
  estadoCuenta: string;
  estaBloqueado: boolean;
  bloqueadoHasta: string | null;
  intentosFallidos: number;
  tieneContrasena: boolean;
  ultimoInicioSesion: string | null;
  fechaCreacion: string;
  esClienteActual: boolean;
}

export interface Pago {
  id: string;
  monto: number;
  fechaPago: string;
  tipoPago: string;
  estado: string;
  numeroTransaccion: string | null;
  operador: string | null;
  observaciones: string | null;
}

export interface Boleta {
  id: string;
  numeroFolio: string | null;
  periodoDesde: string;
  periodoHasta: string;
  fechaEmision: string;
  fechaVencimiento: string;
  montoTotal: number;
  montoAdeudado?: number;
  estado: string;
  parcialmentePagada?: boolean;
  consumoM3: number | null;
  tienePdf: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    hasNextPage: boolean;
    nextCursor: string | null;
  };
}

export interface Medidor {
  id: number;
  numero_medidor: string;
  marca: string | null;
  modelo: string | null;
  estado: string;
  fecha_instalacion: string | null;
}

export interface Lectura {
  id: string;
  medidorId: string;
  valorLectura: number;
  valorCorregido: number | null;
  fechaLectura: string;
  periodoAno: number;
  periodoMes: number;
  tipoLectura: string | null;
  confirmada: boolean;
  observaciones: string | null;
  advertencia: boolean;
  tieneCorreccion: boolean;
}

export interface Multa {
  id: number;
  monto: number;
  tipo: string;
  descripcion: string | null;
  estado: string;
  fecha_multa: string;
}

export interface Descuento {
  id: number;
  nombre: string;
  tipo: string;
  valor: number;
  fecha_aplicacion: string;
  monto_aplicado: number | null;
}

export interface CorteServicio {
  id: number;
  fecha_corte: string;
  motivo: string;
  estado: string;
  fecha_reposicion: string | null;
}

export interface Repactacion {
  id: number;
  monto_original: number;
  monto_total: number;
  cuotas_total: number;
  cuotas_pagadas: number;
  monto_cuota: number;
  estado: string;
  fecha_inicio: string;
}

