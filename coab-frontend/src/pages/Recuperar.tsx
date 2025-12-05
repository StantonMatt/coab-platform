import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/api';
import { CheckCircle2, ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { validarRUT, formatearRUT } from '@coab/utils';

// Password validation schema
const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Incluir al menos una mayúscula')
  .regex(/[a-z]/, 'Incluir al menos una minúscula')
  .regex(/[0-9]/, 'Incluir al menos un número');

// Step 1: Request code
const requestSchema = z.object({
  rut: z.string().min(1, 'RUT requerido').refine(validarRUT, 'RUT inválido'),
});

// Step 2: Validate code and set password
const resetSchema = z
  .object({
    codigo: z.string().length(6, 'Código debe ser de 6 dígitos'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

type RequestForm = z.infer<typeof requestSchema>;
type ResetForm = z.infer<typeof resetSchema>;

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

export default function RecuperarPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<'request' | 'verify' | 'success'>('request');
  const [rut, setRut] = useState('');
  const [rutDisplay, setRutDisplay] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Step 1: Request code form
  const requestForm = useForm<RequestForm>({
    resolver: zodResolver(requestSchema),
  });

  // Step 2: Verify code form
  const resetForm = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
  });

  const password = resetForm.watch('password', '');

  // Password strength indicators
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  // Request code mutation
  const requestMutation = useMutation({
    mutationFn: async (data: RequestForm) => {
      const res = await apiClient.post('/auth/solicitar-reset', {
        rut: data.rut,
      });
      return res.data;
    },
    onSuccess: () => {
      toast({
        title: 'Código enviado',
        description:
          'Si tu RUT está registrado, recibirás un código por WhatsApp',
      });
      setStep('verify');
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.error?.message || 'Error al solicitar código';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: message,
      });
    },
  });

  // Validate code mutation
  const resetMutation = useMutation({
    mutationFn: async (data: ResetForm) => {
      const res = await apiClient.post('/auth/validar-reset', {
        rut: rut,
        codigo: data.codigo,
        password: data.password,
        confirmPassword: data.confirmPassword,
      });
      return res.data;
    },
    onSuccess: () => {
      setStep('success');
      toast({
        title: 'Contraseña actualizada',
        description: 'Ya puedes iniciar sesión con tu nueva contraseña',
      });
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.error?.message || 'Código inválido';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: message,
      });
    },
  });

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cleanValue = value.replace(/[^0-9kK]/g, '').toUpperCase();
    const formatted = formatearRUT(cleanValue);
    setRutDisplay(formatted);
    setRut(cleanValue);
    requestForm.setValue('rut', cleanValue, {
      shouldValidate: cleanValue.length > 0,
    });
  };

  const onRequestSubmit = (data: RequestForm) => {
    requestMutation.mutate(data);
  };

  const onResetSubmit = (data: ResetForm) => {
    resetMutation.mutate(data);
  };

  // Success Screen
  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md border-slate-200 shadow-sm">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              ¡Contraseña Actualizada!
            </h2>
            <p className="text-slate-600">
              Tu contraseña ha sido cambiada exitosamente.
            </p>
            <Button
              onClick={() =>
                navigate(`/login?rut=${encodeURIComponent(formatearRUT(rut))}`)
              }
              className="w-full h-12 bg-blue-600 hover:bg-blue-700"
            >
              Ir a Iniciar Sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 2: Verify Code
  if (step === 'verify') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md border-slate-200 shadow-sm">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl font-bold text-slate-900">
              Verificar Código
            </CardTitle>
            <p className="text-slate-500 text-sm">
              Ingresa el código de 6 dígitos enviado a tu WhatsApp
            </p>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={resetForm.handleSubmit(onResetSubmit)}
              className="space-y-5"
            >
              <div>
                <Label htmlFor="codigo" className="text-slate-700">
                  Código de Verificación
                </Label>
                <Input
                  id="codigo"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  {...resetForm.register('codigo')}
                  className={`h-14 text-center text-2xl tracking-widest font-mono mt-1 ${
                    resetForm.formState.errors.codigo
                      ? 'border-red-500'
                      : 'border-slate-300'
                  }`}
                />
                {resetForm.formState.errors.codigo && (
                  <p className="text-sm text-red-500 mt-1">
                    {resetForm.formState.errors.codigo.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="password" className="text-slate-700">
                  Nueva Contraseña
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    {...resetForm.register('password')}
                    className={`h-12 pr-12 ${
                      resetForm.formState.errors.password
                        ? 'border-red-500'
                        : 'border-slate-300'
                    }`}
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
                <RequirementIndicator
                  met={hasMinLength}
                  text="Mínimo 8 caracteres"
                />
                <RequirementIndicator
                  met={hasUppercase}
                  text="Una letra mayúscula"
                />
                <RequirementIndicator
                  met={hasLowercase}
                  text="Una letra minúscula"
                />
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
                    {...resetForm.register('confirmPassword')}
                    className={`h-12 pr-12 ${
                      resetForm.formState.errors.confirmPassword
                        ? 'border-red-500'
                        : 'border-slate-300'
                    }`}
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
                {resetForm.formState.errors.confirmPassword && (
                  <p className="text-sm text-red-500 mt-1">
                    {resetForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-blue-600 hover:bg-blue-700"
                disabled={resetMutation.isPending}
              >
                {resetMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  'Cambiar Contraseña'
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full text-slate-600 hover:text-slate-900"
                onClick={() => {
                  setStep('request');
                  resetForm.reset();
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Solicitar nuevo código
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 1: Request Code
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md border-slate-200 shadow-sm">
        <CardHeader className="text-center pb-4">
          <div className="mb-2">
            <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
              <svg
                className="h-6 w-6 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
          </div>
          <CardTitle className="text-xl font-bold text-slate-900">
            Recuperar Contraseña
          </CardTitle>
          <p className="text-slate-500 text-sm">
            Ingresa tu RUT para recibir un código de recuperación
          </p>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={requestForm.handleSubmit(onRequestSubmit)}
            className="space-y-5"
          >
            <div>
              <Label htmlFor="rut" className="text-slate-700">
                RUT
              </Label>
              <Input
                id="rut"
                type="text"
                inputMode="numeric"
                placeholder="12.345.678-9"
                value={rutDisplay}
                onChange={handleRutChange}
                className={`h-12 text-lg mt-1 ${
                  requestForm.formState.errors.rut
                    ? 'border-red-500'
                    : 'border-slate-300'
                }`}
              />
              {requestForm.formState.errors.rut && (
                <p className="text-sm text-red-500 mt-1">
                  {requestForm.formState.errors.rut.message}
                </p>
              )}
            </div>

            <p className="text-sm text-slate-600">
              Te enviaremos un código de 6 dígitos a tu WhatsApp registrado.
            </p>

            <Button
              type="submit"
              className="w-full h-12 bg-blue-600 hover:bg-blue-700"
              disabled={requestMutation.isPending}
            >
              {requestMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar Código'
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full text-slate-600 hover:text-slate-900"
              onClick={() => navigate('/login')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a Iniciar Sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

