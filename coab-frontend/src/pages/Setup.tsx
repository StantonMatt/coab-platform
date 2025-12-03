import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/api';
import { formatearRUT } from '@coab/utils';
import { CheckCircle2, XCircle, Eye, EyeOff, Loader2 } from 'lucide-react';

// Password requirements schema
const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Incluir al menos una mayúscula')
  .regex(/[a-z]/, 'Incluir al menos una minúscula')
  .regex(/[0-9]/, 'Incluir al menos un número');

const setupSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

type SetupForm = z.infer<typeof setupSchema>;

// Requirement indicator component
function RequirementIndicator({ met, text }: { met: boolean; text: string }) {
  return (
    <div
      className={`flex items-center gap-2 ${met ? 'text-emerald-600' : 'text-slate-400'}`}
    >
      {met ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <div className="h-4 w-4 border-2 border-slate-300 rounded-full" />
      )}
      <span className="text-sm">{text}</span>
    </div>
  );
}

export default function SetupPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Validate token on page load
  const {
    data: tokenData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['setup-token', token],
    queryFn: async () => {
      const res = await apiClient.get(`/auth/setup/${token}`);
      return res.data;
    },
    enabled: !!token,
    retry: false,
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
  });

  const password = watch('password', '');

  // Password strength indicators
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  // Setup mutation
  const setupMutation = useMutation({
    mutationFn: async (data: SetupForm) => {
      const res = await apiClient.post('/auth/setup', {
        token,
        password: data.password,
        confirmPassword: data.confirmPassword,
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Contraseña configurada',
        description: 'Ahora puedes iniciar sesión',
      });
      // Redirect to login with RUT pre-filled
      navigate(`/login?rut=${encodeURIComponent(data.rut || '')}`);
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.error?.message || 'Error al configurar contraseña';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: message,
      });
    },
  });

  const onSubmit = (data: SetupForm) => {
    setupMutation.mutate(data);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md border-slate-200 shadow-sm">
          <CardContent className="pt-8 pb-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-slate-600">Validando enlace...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid or expired token
  if (error || !tokenData?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md border-slate-200 shadow-sm">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <XCircle className="h-16 w-16 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold text-red-600">Enlace Inválido</h2>
            <p className="text-slate-600">
              Este enlace ya fue usado o ha expirado.
              <br />
              Contacta a COAB para solicitar uno nuevo.
            </p>
            <Button
              onClick={() => navigate('/login')}
              className="mt-4 bg-blue-600 hover:bg-blue-700"
            >
              Ir a Inicio de Sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md border-slate-200 shadow-sm">
        <CardHeader className="text-center pb-4">
          <div className="mb-2">
            <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">
            Configurar Contraseña
          </CardTitle>
          <p className="text-slate-500 text-sm">Portal Clientes COAB</p>
        </CardHeader>
        <CardContent>
          {/* Customer Info */}
          <div className="mb-6 p-4 bg-slate-50 rounded-lg text-center border border-slate-200">
            <p className="font-semibold text-slate-900">
              {tokenData.cliente.nombre}
            </p>
            <p className="text-sm text-slate-600 font-mono">
              RUT: {formatearRUT(tokenData.cliente.rut)}
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <Label htmlFor="password" className="text-slate-700">
                Nueva Contraseña
              </Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                  className={`h-12 pr-12 text-lg ${errors.password ? 'border-red-500 focus:ring-red-500' : 'border-slate-300'}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 p-1"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Password Requirements */}
            <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                Requisitos
              </p>
              <RequirementIndicator met={hasMinLength} text="Mínimo 8 caracteres" />
              <RequirementIndicator met={hasUppercase} text="Una letra mayúscula" />
              <RequirementIndicator met={hasLowercase} text="Una letra minúscula" />
              <RequirementIndicator met={hasNumber} text="Un número" />
            </div>

            <div>
              <Label htmlFor="confirmPassword" className="text-slate-700">
                Confirmar Contraseña
              </Label>
              <div className="relative mt-1">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  {...register('confirmPassword')}
                  className={`h-12 pr-12 text-lg ${errors.confirmPassword ? 'border-red-500 focus:ring-red-500' : 'border-slate-300'}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 p-1"
                  tabIndex={-1}
                >
                  {showConfirm ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-sm text-red-500 mt-1">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-lg bg-blue-600 hover:bg-blue-700"
              disabled={setupMutation.isPending}
            >
              {setupMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Configurando...
                </>
              ) : (
                'Configurar Contraseña'
              )}
            </Button>
          </form>

          <p className="text-xs text-center text-slate-500 mt-6">
            Al configurar tu contraseña, podrás acceder al portal de clientes
            para ver tu saldo y boletas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

