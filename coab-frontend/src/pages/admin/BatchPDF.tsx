import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface BatchResult {
  success: boolean;
  periodo: string;
  total: number;
  generated: number;
  failed: number;
  errors: string[];
  mensaje: string;
}

export default function BatchPDFPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
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
  const [lastResult, setLastResult] = useState<BatchResult | null>(null);

  // Check admin auth
  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    if (!token) {
      navigate('/admin/login');
    }
  }, [navigate]);

  // Batch generation mutation
  const batchMutation = useMutation({
    mutationFn: async () => {
      const res = await adminApiClient.post('/admin/boletas/generar-pdfs', {
        periodo: selectedMonth,
        regenerar: regenerate,
      });
      return res.data as BatchResult;
    },
    onSuccess: (data) => {
      setLastResult(data);
      if (data.failed === 0) {
        toast({
          title: 'Generación completada',
          description: `Se generaron ${data.generated} PDFs exitosamente`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Generación con errores',
          description: `${data.generated} exitosos, ${data.failed} fallidos`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error.response?.data?.error?.message || 'Error al generar PDFs',
      });
    },
  });

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
        {/* Generation Form */}
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
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
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
              />
              <div>
                <label
                  htmlFor="regenerate"
                  className="text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Regenerar existentes
                </label>
                <p className="text-xs text-slate-500">
                  Sobrescribe PDFs que ya existen
                </p>
              </div>
            </div>

            {/* Generate Button */}
            <Button
              onClick={() => batchMutation.mutate()}
              disabled={batchMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {batchMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Generar PDFs
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {lastResult && (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-slate-900">
                Resultados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-2xl font-bold text-slate-900">
                    {lastResult.total}
                  </p>
                  <p className="text-sm text-slate-500">Total</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-lg">
                  <p className="text-2xl font-bold text-emerald-600">
                    {lastResult.generated}
                  </p>
                  <p className="text-sm text-emerald-600">Generados</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">
                    {lastResult.failed}
                  </p>
                  <p className="text-sm text-red-600">Fallidos</p>
                </div>
              </div>

              {/* Success/Error Indicator */}
              <div
                className={`flex items-center gap-3 p-4 rounded-lg ${
                  lastResult.failed === 0
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-amber-50 text-amber-800'
                }`}
              >
                {lastResult.failed === 0 ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
                <span className="font-medium">{lastResult.mensaje}</span>
              </div>

              {/* Error Details */}
              {lastResult.errors && lastResult.errors.length > 0 && (
                <div className="border border-red-200 rounded-lg overflow-hidden">
                  <div className="bg-red-50 px-4 py-2 text-sm font-medium text-red-800">
                    Errores ({lastResult.errors.length})
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {lastResult.errors.map((error, i) => (
                      <div
                        key={i}
                        className="px-4 py-2 text-sm text-red-700 border-t border-red-100"
                      >
                        {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Help Text */}
        <Card className="border-slate-200 shadow-sm bg-blue-50">
          <CardContent className="pt-6">
            <h3 className="font-medium text-blue-900 mb-2">Información</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Los PDFs se almacenan en Supabase Storage</li>
              <li>• Los clientes pueden descargar sus boletas desde el portal</li>
              <li>• Regenerar permite actualizar el diseño de boletas existentes</li>
              <li>
                • Para generar PDFs individuales, use el botón en el perfil del
                cliente
              </li>
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

