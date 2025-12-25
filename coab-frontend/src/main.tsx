import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initMercadoPago } from '@mercadopago/sdk-react';
import { Toaster } from '@/components/ui/toaster';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import BoletaDetailPage from './pages/BoletaDetail';
import SetupPage from './pages/Setup';
import RecuperarPage from './pages/Recuperar';
import PaymentResultPage from './pages/PaymentResult';
import TransbankCallbackPage from './pages/TransbankCallback';
import ProfilePage from './pages/Profile';
import AdminLoginPage from './pages/admin/Login';
import AdminDashboardPage from './pages/admin/Dashboard';
import AdminCustomersPage from './pages/admin/Customers';
import AdminCustomerProfilePage from './pages/admin/CustomerProfile';
import AdminBatchPDFPage from './pages/admin/BatchPDF';
import AdminPaymentsPage from './pages/admin/Payments';
import AdminRutasPage from './pages/admin/Rutas';
import AdminTarifasPage from './pages/admin/Tarifas';
import AdminSubsidiosPage from './pages/admin/Subsidios';
import AdminMedidoresPage from './pages/admin/Medidores';
import AdminLecturasPage from './pages/admin/Lecturas';
import AdminMultasPage from './pages/admin/Multas';
import AdminDescuentosPage from './pages/admin/Descuentos';
import AdminCortesPage from './pages/admin/Cortes';
import AdminRepactacionesPage from './pages/admin/Repactaciones';
import './index.css';

// Initialize Mercado Pago SDK (public key will be fetched from backend)
// This is safe to call with undefined - it will be initialized when the key is available
const MP_PUBLIC_KEY = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY;
if (MP_PUBLIC_KEY) {
  initMercadoPago(MP_PUBLIC_KEY, { locale: 'es-CL' });
}

// Configure React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Customer Portal */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/recuperar" element={<RecuperarPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/boletas/:id" element={<BoletaDetailPage />} />
          <Route path="/setup/:token" element={<SetupPage />} />
          <Route path="/pago/resultado" element={<PaymentResultPage />} />
          <Route path="/transbank/callback" element={<TransbankCallbackPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
          
          {/* Admin Portal */}
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/clientes" element={<AdminCustomersPage />} />
          <Route path="/admin/clientes/:id" element={<AdminCustomerProfilePage />} />
          <Route path="/admin/pagos" element={<AdminPaymentsPage />} />
          <Route path="/admin/boletas/generar" element={<AdminBatchPDFPage />} />
          <Route path="/admin/rutas" element={<AdminRutasPage />} />
          <Route path="/admin/tarifas" element={<AdminTarifasPage />} />
          <Route path="/admin/subsidios" element={<AdminSubsidiosPage />} />
          <Route path="/admin/medidores" element={<AdminMedidoresPage />} />
          <Route path="/admin/lecturas" element={<AdminLecturasPage />} />
          <Route path="/admin/multas" element={<AdminMultasPage />} />
          <Route path="/admin/descuentos" element={<AdminDescuentosPage />} />
          <Route path="/admin/cortes" element={<AdminCortesPage />} />
          <Route path="/admin/repactaciones" element={<AdminRepactacionesPage />} />
          <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
