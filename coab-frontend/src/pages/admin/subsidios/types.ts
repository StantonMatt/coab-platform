// Type definitions for Subsidios module

export interface Subsidio {
  id: number;
  limiteM3: number;
  porcentaje: number;
  fechaInicio: string;
  fechaTermino: string | null;
  numeroDecreto: string | null;
  observaciones: string | null;
  estado: string;
  cantidadHistorial: number;
  esVigente: boolean;
}

export interface HistorialEntry {
  id: string;
  clienteId: string;
  numeroCliente: string;
  subsidioId: number | null;
  fechaCambio: string | null;
  tipoCambio: string;
  detalles: string | null;
  esActivo: boolean;
  cliente: {
    id: string;
    numeroCliente: string;
    nombre: string;
  } | null;
  subsidio: {
    id: number;
    porcentaje: number;
    limiteM3: number;
  } | null;
}

export interface HistorialFilters extends Record<string, unknown> {
  search: string;
  tipoCambio: string;
  esActivo: string;
}

export interface SubsidioFormData {
  id: string;
  limiteM3: string;
  porcentaje: string;
  fechaInicio: string;
  fechaTermino: string;
  numeroDecreto: string;
  observaciones: string;
  estado: string;
}

export const initialFormData: SubsidioFormData = {
  id: '',
  limiteM3: '',
  porcentaje: '',
  fechaInicio: new Date().toISOString().split('T')[0],
  fechaTermino: '',
  numeroDecreto: '',
  observaciones: '',
  estado: 'activo',
};

// Type for client search results
export interface ClienteSearchResult {
  id: string;
  numeroCliente: string;
  nombre: string;
  rut: string;
}

// Type for reassign client info
export interface ReassignClienteInfo {
  clienteId: string;
  clienteName: string;
  clienteNumero: string;
  currentSubsidio: {
    id: number;
    porcentaje: number;
    limiteM3: number;
  };
}

