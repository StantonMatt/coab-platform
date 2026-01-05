import { useQuery } from '@tanstack/react-query';
import adminApiClient from '@/lib/adminApi';
import type {
  Customer,
  Pago,
  Boleta,
  PaginatedResponse,
  Medidor,
  Lectura,
  Multa,
  Descuento,
  CorteServicio,
  Repactacion,
} from '../types';

export function useCustomerQueries(customerId: string | undefined) {
  // Fetch customer profile
  const customerQuery = useQuery<Customer>({
    queryKey: ['admin-customer', customerId],
    queryFn: async () => {
      const res = await adminApiClient.get<Customer>(`/admin/clientes/${customerId}`);
      return res.data;
    },
    enabled: !!customerId,
  });

  // Fetch payments
  const paymentsQuery = useQuery<PaginatedResponse<Pago>>({
    queryKey: ['admin-customer-payments', customerId],
    queryFn: async () => {
      const res = await adminApiClient.get<PaginatedResponse<Pago>>(
        `/admin/clientes/${customerId}/pagos?limit=20`
      );
      return res.data;
    },
    enabled: !!customerId,
  });

  // Fetch boletas
  const boletasQuery = useQuery<PaginatedResponse<Boleta>>({
    queryKey: ['admin-customer-boletas', customerId],
    queryFn: async () => {
      const res = await adminApiClient.get<PaginatedResponse<Boleta>>(
        `/admin/clientes/${customerId}/boletas?limit=20`
      );
      return res.data;
    },
    enabled: !!customerId,
  });

  // Fetch medidores
  const medidoresQuery = useQuery<{ medidores: Medidor[] }>({
    queryKey: ['admin-customer-medidores', customerId],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${customerId}/medidores`);
      return res.data;
    },
    enabled: !!customerId,
  });

  // Fetch lecturas
  const lecturasQuery = useQuery<{ lecturas: Lectura[] }>({
    queryKey: ['admin-customer-lecturas', customerId],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${customerId}/lecturas?limit=20`);
      return res.data;
    },
    enabled: !!customerId,
  });

  // Fetch multas
  const multasQuery = useQuery<{ multas: Multa[] }>({
    queryKey: ['admin-customer-multas', customerId],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${customerId}/multas`);
      return res.data;
    },
    enabled: !!customerId,
  });

  // Fetch descuentos aplicados
  const descuentosQuery = useQuery<{ descuentos: Descuento[] }>({
    queryKey: ['admin-customer-descuentos', customerId],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${customerId}/descuentos`);
      return res.data;
    },
    enabled: !!customerId,
  });

  // Fetch cortes
  const cortesQuery = useQuery<{ cortes: CorteServicio[] }>({
    queryKey: ['admin-customer-cortes', customerId],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${customerId}/cortes`);
      return res.data;
    },
    enabled: !!customerId,
  });

  // Fetch repactaciones
  const repactacionesQuery = useQuery<{ repactaciones: Repactacion[] }>({
    queryKey: ['admin-customer-repactaciones', customerId],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${customerId}/repactaciones`);
      return res.data;
    },
    enabled: !!customerId,
  });

  return {
    // Main customer data
    customer: customerQuery.data,
    isLoading: customerQuery.isLoading,
    error: customerQuery.error,

    // Related data
    paymentsData: paymentsQuery.data,
    boletasData: boletasQuery.data,
    medidoresData: medidoresQuery.data,
    lecturasData: lecturasQuery.data,
    multasData: multasQuery.data,
    descuentosData: descuentosQuery.data,
    cortesData: cortesQuery.data,
    repactacionesData: repactacionesQuery.data,
  };
}

