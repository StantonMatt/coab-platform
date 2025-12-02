import { useQuery } from '@tanstack/react-query';
import { checkHealth } from './lib/api';

/**
 * Main App component
 * Tests connection to backend health endpoint
 */
function App() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['health'],
    queryFn: checkHealth,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        {/* Logo placeholder */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-[var(--color-primary)] rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-2xl">C</span>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-[var(--color-text-primary)] mb-2">
          COAB Platform
        </h1>
        <p className="text-center text-[var(--color-text-secondary)] mb-8">
          Portal de Clientes y Administración
        </p>

        {/* Connection status */}
        <div className="border border-[var(--color-border)] rounded-xl p-4">
          <h2 className="text-sm font-medium text-[var(--color-text-muted)] mb-2">
            Estado del Backend
          </h2>

          {isLoading && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
              <span className="text-[var(--color-text-secondary)]">
                Conectando...
              </span>
            </div>
          )}

          {isError && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <span className="text-red-600">
                Error de conexión: {(error as Error)?.message || 'No disponible'}
              </span>
            </div>
          )}

          {data && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-[var(--color-accent)] rounded-full" />
                <span className="text-[var(--color-accent)] font-medium">
                  Backend Conectado: {data.status}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                Última verificación:{' '}
                {new Date(data.timestamp).toLocaleString('es-CL')}
              </p>
            </div>
          )}
        </div>

        {/* Version info */}
        <p className="text-center text-xs text-[var(--color-text-muted)] mt-6">
          Iteration 1 - Project Setup
        </p>
      </div>
    </div>
  );
}

export default App;







