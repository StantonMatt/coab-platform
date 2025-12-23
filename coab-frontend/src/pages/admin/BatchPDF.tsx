import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import { format, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
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
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

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

export default function BatchPDFPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Generate last 12 months as options
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return {
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy', { locale: es }),
    };
  });
  
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [regenerate, setRegenerate] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Check admin auth
  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    if (!token) {
      navigate('/admin/login');
    }
  }, [navigate]);

  // Poll for job status
  const { data: jobStatus, isLoading: isLoadingJob } = useQuery({
    queryKey: ['job-status', currentJobId],
    queryFn: async () => {
      if (!currentJobId) return null;
      const res = await adminApiClient.get(`/admin/jobs/${currentJobId}`);
      return res.data as JobStatus;
    },
    enabled: !!currentJobId && isPolling,
    refetchInterval: isPolling ? 2000 : false, // Poll every 2 seconds
  });

  // Stop polling when job completes
  useEffect(() => {
    if (jobStatus && ['completado', 'error', 'cancelado'].includes(jobStatus.estado)) {
      setIsPolling(false);
      
      if (jobStatus.estado === 'completado') {
        toast({
          title: 'Generación completada',
          description: `Se generaron ${jobStatus.exitosos} PDFs exitosamente`,
        });
      } else if (jobStatus.estado === 'error') {
        toast({
          variant: 'destructive',
          title: 'Error en la generación',
          description: 'El trabajo terminó con errores',
        });
      } else if (jobStatus.estado === 'cancelado') {
        toast({
          title: 'Trabajo cancelado',
          description: 'La generación fue cancelada',
        });
      }
    }
  }, [jobStatus, toast]);

  // Start generation mutation
  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await adminApiClient.post('/admin/boletas/generar-pdfs', {
        periodo: selectedMonth,
        regenerar: regenerate,
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
      queryClient.invalidateQueries({ queryKey: ['job-status', currentJobId] });
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

  // Download ZIP
  const handleDownload = useCallback(async () => {
    if (!currentJobId) return;
    
    try {
      const res = await adminApiClient.get(`/admin/jobs/${currentJobId}/download`);
      if (res.data?.url) {
        window.open(res.data.url, '_blank');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error.response?.data?.error?.message || 'Error al descargar ZIP',
      });
    }
  }, [currentJobId, toast]);

  // Reset to start new job
  const handleStartNew = () => {
    setCurrentJobId(null);
    setIsPolling(false);
  };

  const isActive = startMutation.isPending || (jobStatus?.estado === 'pendiente') || (jobStatus?.estado === 'procesando');
  const isComplete = jobStatus?.estado === 'completado';
  const hasError = jobStatus?.estado === 'error';
  const isCancelled = jobStatus?.estado === 'cancelado';
  const hasJob = !!currentJobId;
  const jobFinished = isComplete || hasError || isCancelled;

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
                Generación Masiva de PDFs
              </h1>
              <p className="text-sm text-slate-500">
                Genera todas las boletas de un período
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Configuration Card - Always visible */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Configuración
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Month Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Período
              </label>
              <Select 
                value={selectedMonth} 
                onValueChange={setSelectedMonth}
                disabled={hasJob && !jobFinished}
              >
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Seleccionar mes" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Regenerate Toggle */}
            <div className="flex items-center gap-3">
              <Switch
                id="regenerate"
                checked={regenerate}
                onCheckedChange={setRegenerate}
                disabled={hasJob && !jobFinished}
              />
              <div>
                <label
                  htmlFor="regenerate"
                  className={`text-sm font-medium cursor-pointer ${
                    hasJob && !jobFinished ? 'text-slate-400' : 'text-slate-700'
                  }`}
                >
                  Regenerar existentes
                </label>
                <p className="text-xs text-slate-500">
                  Sobrescribe PDFs que ya existen
                </p>
              </div>
            </div>

            {/* Generate Button */}
            {!hasJob && (
              <Button
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
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
                    Generar PDFs
                  </>
                )}
              </Button>
            )}

            {/* Inline Progress Section */}
            {hasJob && (
              <div className="pt-4 border-t border-slate-200 space-y-4">
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
                        indicatorClassName={
                          hasError ? 'bg-red-500' : 
                          isCancelled ? 'bg-amber-500' : 
                          isComplete ? 'bg-emerald-500' : 'bg-blue-600'
                        }
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
                        <span>Generación completada exitosamente</span>
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

                      {isComplete && jobStatus.zipPath && (
                        <Button
                          size="sm"
                          onClick={handleDownload}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Descargar ZIP
                        </Button>
                      )}

                      {jobFinished && (
                        <Button variant="outline" size="sm" onClick={handleStartNew}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Nuevo Trabajo
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
              <li>• Los PDFs se generan en paralelo para mayor velocidad</li>
              <li>• El archivo ZIP estará disponible al finalizar</li>
              <li>• Puede cancelar el trabajo en cualquier momento</li>
              <li>• "Existentes" son boletas que ya tienen PDF generado</li>
              <li>• Active "Regenerar existentes" para sobrescribir todos los PDFs</li>
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
