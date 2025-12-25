import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import MonthYearPicker from '@/components/MonthYearPicker';
import {
  ArrowLeft,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Download,
  Clock,
  AlertCircle,
  StopCircle,
  Search,
  User,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { formatearRUT } from '@coab/utils';

interface JobStatus {
  id: string;
  periodo: string;
  estado: 'pendiente' | 'procesando' | 'completado' | 'error' | 'cancelado';
  total: number;
  procesados: number;
  exitosos: number;
  fallidos: number;
  omitidos: number;
  regenerar: boolean;
  zipPath: string | null;
  errores: string[];
  iniciadoEn: string;
  completadoEn: string | null;
  porcentaje: number;
  tiempoEstimado: number | null;
}

interface PeriodData {
  año: number;
  mes: number;
  totalBoletas: number;
  boletasConPdf: number;
  tieneBoletasPdf: boolean;
}

interface PeriodStats {
  total: number;
  conPdf: number;
  sinPdf: number;
  periodo: string;
  periodoLabel: string;
}

interface ClientBoletaItem {
  cliente: {
    id: string;
    nombre: string;
    rut: string;
    numeroCliente: string;
  };
  boleta: {
    id: string;
    periodo: string;
    montoTotal: number;
    tienePdf: boolean;
  } | null;
  pdfUrl?: string;
}

interface SearchResponse {
  resultados: ClientBoletaItem[];
}

interface StartJobResponse {
  success: boolean;
  jobId: string;
  periodo: string;
}

function formatTimeRemaining(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '';
  if (seconds < 60) return `~${seconds}s restantes`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `~${minutes}m ${secs}s restantes`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount);
}

export default function BatchPDFPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedMonth, setSelectedMonth] = useState('');
  const [regenerate, setRegenerate] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  
  // Client search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Check admin auth
  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    if (!token) {
      navigate('/admin/login');
    }
  }, [navigate]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch available periods
  const { data: availablePeriodsData, isLoading: isLoadingPeriods } = useQuery({
    queryKey: ['available-periods'],
    queryFn: async () => {
      const res = await adminApiClient.get('/admin/lecturas/periodos-disponibles');
      return res.data as { periodos: PeriodData[] };
    },
  });

  const availablePeriods = availablePeriodsData?.periodos || [];

  // Set initial selected month when periods load
  useEffect(() => {
    if (availablePeriods.length > 0 && !selectedMonth) {
      const firstPeriod = availablePeriods[0];
      setSelectedMonth(`${firstPeriod.año}-${String(firstPeriod.mes).padStart(2, '0')}`);
    }
  }, [availablePeriods, selectedMonth]);

  // Fetch period stats when month changes - ALWAYS fetch, not just when no job
  const { data: periodStats, isLoading: isLoadingStats, refetch: refetchStats } = useQuery({
    queryKey: ['period-stats', selectedMonth],
    queryFn: async () => {
      if (!selectedMonth) return null;
      const res = await adminApiClient.get(`/admin/boletas/periodo-stats?periodo=${selectedMonth}`);
      return res.data as PeriodStats;
    },
    enabled: !!selectedMonth,
  });

  // Search client boleta
  const searchEnabled = debouncedQuery.length >= 3 && !!selectedMonth;
  const { data: searchData, isLoading: isSearching, error: searchError, isFetching } = useQuery({
    queryKey: ['client-boleta-search', debouncedQuery, selectedMonth],
    queryFn: async () => {
      const res = await adminApiClient.get(
        `/admin/clientes/buscar-boleta?q=${encodeURIComponent(debouncedQuery)}&periodo=${selectedMonth}`
      );
      return res.data as SearchResponse;
    },
    enabled: searchEnabled,
    staleTime: 0,
    retry: false,
  });
  
  const searchResults = searchData?.resultados || [];

  // Poll for job status
  const { data: jobStatus, isLoading: isLoadingJob } = useQuery({
    queryKey: ['job-status', currentJobId],
    queryFn: async () => {
      if (!currentJobId) return null;
      const res = await adminApiClient.get(`/admin/jobs/${currentJobId}`);
      return res.data as JobStatus;
    },
    enabled: !!currentJobId && isPolling,
    refetchInterval: isPolling ? 2000 : false,
  });

  // Stop polling when job completes and AUTO-RESET state
  useEffect(() => {
    if (jobStatus && ['completado', 'error', 'cancelado'].includes(jobStatus.estado)) {
      setIsPolling(false);
      
      if (jobStatus.estado === 'completado') {
        toast({
          title: 'Generación completada',
          description: `Se generaron ${jobStatus.exitosos} PDFs exitosamente`,
        });
        // Refresh stats and available periods
        queryClient.invalidateQueries({ queryKey: ['period-stats'] });
        queryClient.invalidateQueries({ queryKey: ['available-periods'] });
        
        // Auto-reset after a short delay so user sees completion message
        setTimeout(() => {
          setCurrentJobId(null);
        }, 3000);
      } else if (jobStatus.estado === 'error') {
        toast({
          variant: 'destructive',
          title: 'Error en la generación',
          description: 'El trabajo terminó con errores',
        });
        // Auto-reset on error too
        setTimeout(() => {
          setCurrentJobId(null);
        }, 3000);
      } else if (jobStatus.estado === 'cancelado') {
        toast({
          title: 'Trabajo cancelado',
          description: 'La generación fue cancelada',
        });
        setCurrentJobId(null);
      }
    }
  }, [jobStatus, toast, queryClient]);

  // Start generation mutation - No ZIP, just generate PDFs
  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await adminApiClient.post('/admin/boletas/generar-pdfs', {
        periodo: selectedMonth,
        regenerar: regenerate,
        generarZip: false, // Never generate ZIP
      });
      return res.data as StartJobResponse;
    },
    onSuccess: (data) => {
      setCurrentJobId(data.jobId);
      setIsPolling(true);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error.response?.data?.error?.message || 'Error al iniciar generación',
      });
    },
  });

  // Cancel job mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!currentJobId) throw new Error('No hay trabajo activo');
      await adminApiClient.post(`/admin/jobs/${currentJobId}/cancel`);
    },
    onSuccess: () => {
      setIsPolling(false);
      setCurrentJobId(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error.response?.data?.error?.message || 'Error al cancelar trabajo',
      });
    },
  });

  // Generate single PDF mutation
  const generateSingleMutation = useMutation({
    mutationFn: async (boletaId: string) => {
      const response = await adminApiClient.post<{ pdfUrl?: string }>(`/admin/boletas/${boletaId}/regenerar-pdf`);
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['client-boleta-search'] });
      queryClient.invalidateQueries({ queryKey: ['period-stats'] });
      queryClient.invalidateQueries({ queryKey: ['available-periods'] });
      return response.data;
    },
    onSuccess: (data) => {
      toast({
        title: 'PDF generado',
        description: 'El PDF se generó exitosamente',
      });
      // Open the PDF if URL is returned
      if (data?.pdfUrl) {
        window.open(data.pdfUrl, '_blank');
      }
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error.response?.data?.error?.message || 'Error al generar PDF',
      });
    },
  });

  const isActive = startMutation.isPending || (jobStatus?.estado === 'pendiente') || (jobStatus?.estado === 'procesando');
  const isComplete = jobStatus?.estado === 'completado';
  const hasError = jobStatus?.estado === 'error';
  const isCancelled = jobStatus?.estado === 'cancelado';
  const hasJob = !!currentJobId;

  // Determine if we can generate
  const canGenerate = periodStats && periodStats.total > 0 && (regenerate || periodStats.sinPdf > 0);
  const noBoletas = periodStats && periodStats.total === 0;
  const allGenerated = periodStats && periodStats.total > 0 && periodStats.sinPdf === 0 && !regenerate;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/admin/clientes')}
              className="text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Generación de Boletas PDF
              </h1>
              <p className="text-sm text-slate-500">
                Genera y descarga boletas en formato PDF
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Period Selection Card */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Seleccionar Período
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Month Year Picker */}
            {isLoadingPeriods ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                <span className="ml-2 text-slate-600">Cargando períodos...</span>
              </div>
            ) : (
              <MonthYearPicker
                selectedPeriodo={selectedMonth}
                onSelect={(periodo) => {
                  setSelectedMonth(periodo);
                  // Force refetch stats when month changes
                  setTimeout(() => refetchStats(), 100);
                }}
                availablePeriods={availablePeriods}
                isLoading={isActive}
              />
            )}

            {/* Period Stats - ALWAYS show when month selected */}
            {selectedMonth && (
              <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                {isLoadingStats ? (
                  <div className="flex items-center gap-2 text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Cargando información...</span>
                  </div>
                ) : noBoletas ? (
                  <div className="flex items-center gap-2 text-amber-700">
                    <AlertCircle className="h-5 w-5" />
                    <span className="font-medium">
                      No hay boletas para este período
                    </span>
                  </div>
                ) : periodStats ? (
                  <>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-slate-900">{periodStats.total}</p>
                        <p className="text-xs text-slate-500">Total boletas</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-emerald-600">{periodStats.conPdf}</p>
                        <p className="text-xs text-emerald-600">Con PDF</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-blue-600">{periodStats.sinPdf}</p>
                        <p className="text-xs text-blue-600">Sin PDF</p>
                      </div>
                    </div>

                    {allGenerated && !hasJob && (
                      <div className="flex items-center gap-2 text-emerald-700">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">
                          Todos los PDFs ya están generados. Descárgalos desde Supabase Storage.
                        </span>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Client Search Card - ALWAYS visible */}
        {selectedMonth && (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Search className="h-5 w-5" />
                Buscar Boleta Individual
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Buscar por RUT, N° Cliente o Nombre..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setDebouncedQuery(searchQuery);
                      }
                    }}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => setDebouncedQuery(searchQuery)}
                  disabled={searchQuery.length < 3}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>

              {/* Search Results */}
              {(isSearching || isFetching) && searchEnabled && (
                <div className="flex items-center gap-2 text-slate-500 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Buscando...</span>
                </div>
              )}

              {searchResults.length > 0 && !isSearching && (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  <p className="text-sm text-slate-500 mb-2">
                    {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} encontrado{searchResults.length !== 1 ? 's' : ''}
                  </p>
                  {searchResults.map((result) => (
                    <div key={result.cliente.id} className="p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-blue-100 rounded-full flex-shrink-0">
                          <User className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 truncate">
                            {result.cliente.nombre}
                          </p>
                          <p className="text-sm text-slate-500">
                            RUT: {formatearRUT(result.cliente.rut)} • N° {result.cliente.numeroCliente}
                          </p>
                          {result.boleta ? (
                            <p className="text-sm text-slate-500 mt-1">
                              Monto: {formatCurrency(result.boleta.montoTotal)}
                            </p>
                          ) : (
                            <p className="text-sm text-amber-600 mt-1">
                              Sin boleta para este período
                            </p>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          {result.boleta ? (
                            result.boleta.tienePdf ? (
                              <Button
                                size="sm"
                                onClick={() => window.open(result.pdfUrl, '_blank')}
                                className="bg-emerald-600 hover:bg-emerald-700"
                              >
                                <Download className="h-4 w-4 mr-1" />
                                PDF
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => generateSingleMutation.mutate(result.boleta!.id)}
                                disabled={generateSingleMutation.isPending}
                                className="bg-blue-600 hover:bg-blue-700"
                              >
                                {generateSingleMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                  <FileText className="h-4 w-4 mr-1" />
                                )}
                                Generar
                              </Button>
                            )
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {debouncedQuery.length >= 3 && searchResults.length === 0 && !isSearching && !searchError && (
                <div className="text-center py-4 text-slate-500">
                  No se encontraron clientes para "{debouncedQuery}"
                </div>
              )}

              {searchError && (
                <div className="text-center py-4 text-amber-600">
                  No se encontró cliente o boleta para este período
                </div>
              )}

              {debouncedQuery.length > 0 && debouncedQuery.length < 3 && (
                <div className="text-center py-2 text-slate-400 text-sm">
                  Ingrese al menos 3 caracteres para buscar
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Batch Generation Card */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Generación Masiva
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Options */}
            {!hasJob && (
              <div className="space-y-4">
                {/* Regenerate Toggle */}
                <div className="flex items-center gap-3">
                  <Switch
                    id="regenerate"
                    checked={regenerate}
                    onCheckedChange={setRegenerate}
                  />
                  <div>
                    <label
                      htmlFor="regenerate"
                      className="text-sm font-medium cursor-pointer text-slate-700"
                    >
                      Regenerar existentes
                    </label>
                    <p className="text-xs text-slate-500">
                      Sobrescribe PDFs que ya existen
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Generate Button */}
            {!hasJob && (
              <Button
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending || !canGenerate}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {startMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Iniciando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {regenerate 
                      ? `Regenerar ${periodStats?.total || 0} PDFs`
                      : `Generar ${periodStats?.sinPdf || 0} PDFs`}
                  </>
                )}
              </Button>
            )}

            {/* Inline Progress Section */}
            {hasJob && (
              <div className="space-y-4">
                {/* Loading state */}
                {isLoadingJob && !jobStatus && (
                  <div className="flex items-center gap-3 text-slate-600">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Iniciando trabajo...</span>
                  </div>
                )}

                {/* Progress Display */}
                {jobStatus && (
                  <>
                    {/* Status Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isActive && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
                        {isComplete && <CheckCircle className="h-5 w-5 text-emerald-600" />}
                        {hasError && <XCircle className="h-5 w-5 text-red-600" />}
                        {isCancelled && <StopCircle className="h-5 w-5 text-amber-600" />}
                        <span className={`font-medium ${
                          isActive ? 'text-blue-700' :
                          isComplete ? 'text-emerald-700' :
                          hasError ? 'text-red-700' :
                          'text-amber-700'
                        }`}>
                          {isActive ? 'Procesando...' : 
                           isComplete ? 'Completado' : 
                           hasError ? 'Error' : 
                           'Cancelado'}
                        </span>
                      </div>
                      {isActive && jobStatus.tiempoEstimado && (
                        <div className="flex items-center gap-1 text-sm text-slate-500">
                          <Clock className="h-4 w-4" />
                          {formatTimeRemaining(jobStatus.tiempoEstimado)}
                        </div>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">
                          {jobStatus.procesados} de {jobStatus.total} boletas
                        </span>
                        <span className="font-medium text-slate-900">{jobStatus.porcentaje}%</span>
                      </div>
                      <Progress 
                        value={jobStatus.porcentaje} 
                        className="h-2"
                      />
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <p className="text-lg font-bold text-slate-900">
                          {jobStatus.total}
                        </p>
                        <p className="text-xs text-slate-500">Total</p>
                      </div>
                      <div className="p-2 bg-emerald-50 rounded-lg">
                        <p className="text-lg font-bold text-emerald-600">
                          {jobStatus.exitosos}
                        </p>
                        <p className="text-xs text-emerald-600">Generados</p>
                      </div>
                      <div className="p-2 bg-amber-50 rounded-lg">
                        <p className="text-lg font-bold text-amber-600">
                          {jobStatus.omitidos}
                        </p>
                        <p className="text-xs text-amber-600">Existentes</p>
                      </div>
                      <div className="p-2 bg-red-50 rounded-lg">
                        <p className="text-lg font-bold text-red-600">
                          {jobStatus.fallidos}
                        </p>
                        <p className="text-xs text-red-600">Fallidos</p>
                      </div>
                    </div>

                    {/* Status Messages */}
                    {isComplete && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-800 text-sm">
                        <CheckCircle className="h-4 w-4 flex-shrink-0" />
                        <span>Generación completada. Los PDFs están disponibles en Supabase Storage.</span>
                      </div>
                    )}

                    {hasError && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-800 text-sm">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        <span>El trabajo terminó con errores</span>
                      </div>
                    )}

                    {isCancelled && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
                        <StopCircle className="h-4 w-4 flex-shrink-0" />
                        <span>La generación fue cancelada</span>
                      </div>
                    )}

                    {/* Error Details */}
                    {jobStatus.errores && jobStatus.errores.length > 0 && (
                      <div className="border border-red-200 rounded-lg overflow-hidden">
                        <div className="bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                          Errores ({jobStatus.errores.length})
                        </div>
                        <div className="max-h-32 overflow-y-auto">
                          {jobStatus.errores.slice(0, 10).map((error, i) => (
                            <div
                              key={i}
                              className="px-3 py-1.5 text-sm text-red-700 border-t border-red-100"
                            >
                              {error}
                            </div>
                          ))}
                          {jobStatus.errores.length > 10 && (
                            <div className="px-3 py-1.5 text-sm text-red-500 border-t border-red-100 italic">
                              ...y {jobStatus.errores.length - 10} más
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-2">
                      {isActive && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => cancelMutation.mutate()}
                          disabled={cancelMutation.isPending}
                        >
                          {cancelMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <StopCircle className="h-4 w-4 mr-2" />
                          )}
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Help Text */}
        <Card className="border-slate-200 shadow-sm bg-blue-50">
          <CardContent className="pt-6">
            <h3 className="font-medium text-blue-900 mb-2">Información</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Solo se muestran meses que tienen lecturas registradas</li>
              <li>• Los meses con ✓ tienen todos los PDFs generados</li>
              <li>• Use la búsqueda para generar o descargar una boleta individual</li>
              <li>• Para descargar múltiples PDFs, use Supabase Storage directamente</li>
              <li>• Los clientes pueden descargar sus boletas desde su portal</li>
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
