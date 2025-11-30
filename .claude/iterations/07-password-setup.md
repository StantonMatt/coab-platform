# ITERATION 7: Password Setup (WhatsApp Link)

**Goal:** Admin can send secure setup links to customers via WhatsApp; customers set their password using the link

**You'll Be Able To:** Send WhatsApp setup links from admin panel, customers set passwords via mobile

**Prerequisites:**
- Iteration 1 complete (`TokenConfiguracion` table defined)
- Iterations 4-5 complete (admin can view customer profiles)
- Infobip WhatsApp account verified (started in Iteration 1)

---

## Backend Tasks

### Task 7.1: Setup Token Generation API with Rate Limiting

**SECURITY CRITICAL:** Setup tokens must be:
- Single-use (cannot be reused after password set)
- Time-limited (48-hour expiry)
- Cryptographically random (256-bit)
- Rate-limited to prevent abuse

**Update:** `src/services/admin.service.ts`

Add `generateSetupToken()` method:

```typescript
// src/services/admin.service.ts
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Generate a password setup token for a customer
 */
export async function generateSetupToken(
  clienteId: bigint,
  adminEmail: string,
  ipAddress: string
) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: {
      id: true,
      rut: true,
      nombre_completo: true,
      telefono: true,
      hash_contrasena: true
    }
  });

  if (!cliente) {
    throw new Error('Cliente no encontrado');
  }

  // Generate cryptographically secure token
  const token = crypto.randomBytes(32).toString('hex');

  // Delete any existing unused tokens for this customer
  await prisma.tokenConfiguracion.deleteMany({
    where: {
      cliente_id: clienteId,
      usado: false
    }
  });

  // Create new token (48-hour expiry)
  const tokenRecord = await prisma.tokenConfiguracion.create({
    data: {
      cliente_id: clienteId,
      token: token,
      tipo: 'setup',
      usado: false,
      expira_en: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
      ip_creacion: ipAddress
    }
  });

  // Create setup URL
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const setupUrl = `${frontendUrl}/setup/${token}`;

  // Audit log
  await prisma.logAuditoria.create({
    data: {
      accion: 'GENERAR_TOKEN_SETUP',
      entidad: 'token_configuracion',
      entidad_id: tokenRecord.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_nuevos: {
        clienteId: clienteId.toString(),
        clienteRut: cliente.rut,
        tokenExpiry: tokenRecord.expira_en.toISOString()
      },
      ip_address: ipAddress
    }
  });

  return {
    token,
    setupUrl,
    cliente: {
      id: cliente.id.toString(),
      rut: cliente.rut,
      nombre: cliente.nombre_completo,
      telefono: cliente.telefono
    },
    expiresAt: tokenRecord.expira_en
  };
}
```

**Update:** `src/routes/admin.routes.ts`

Add setup token endpoint with rate limiting:

```typescript
// Add to src/routes/admin.routes.ts

// POST /admin/clientes/:id/generar-setup - Generate setup token
fastify.post('/clientes/:id/generar-setup', {
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '1 hour',
      keyGenerator: (req) => `setup-${(req.params as any).id}`
    }
  }
}, async (request, reply) => {
  try {
    const { id } = request.params as { id: string };

    const result = await adminService.generateSetupToken(
      BigInt(id),
      request.user!.email!,
      request.ip
    );

    return result;
  } catch (error: any) {
    if (error.message === 'Cliente no encontrado') {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: error.message }
      });
    }
    throw error;
  }
});
```

**Test:**
```bash
curl -X POST http://localhost:3000/api/v1/admin/clientes/123/generar-setup \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Should return:
# {
#   "token": "abc123...",
#   "setupUrl": "http://localhost:5173/setup/abc123...",
#   "cliente": {...},
#   "expiresAt": "2025-..."
# }

# Test rate limit (4th request within 1 hour should fail)
curl -X POST http://localhost:3000/api/v1/admin/clientes/123/generar-setup \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 429 Too Many Requests
```

**Acceptance Criteria:**
- [ ] Generates cryptographically secure 256-bit token
- [ ] Token expires in 48 hours
- [ ] Old unused tokens deleted when generating new one
- [ ] Returns setup URL with token
- [ ] Audit log created
- [ ] Rate limited: 3 requests per customer per hour
- [ ] 429 returned when rate limit exceeded

---

### Task 7.2: WhatsApp Sending via Infobip

**Prerequisites:** Infobip account verified (started in Iteration 1)

**Create:** `src/services/infobip.service.ts`

```typescript
// src/services/infobip.service.ts
import { parsePhoneNumber, isValidPhoneNumber, CountryCode } from 'libphonenumber-js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const INFOBIP_API_KEY = process.env.INFOBIP_API_KEY;
const INFOBIP_BASE_URL = process.env.INFOBIP_BASE_URL || 'https://api.infobip.com';
const INFOBIP_WHATSAPP_SENDER = process.env.INFOBIP_WHATSAPP_SENDER;

interface WhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Format Chilean phone number to international format
 * Handles formats like: +56912345678, 912345678, 56912345678
 */
export function formatChileanPhone(phone: string): string | null {
  try {
    // Clean the input
    const cleaned = phone.replace(/\D/g, '');

    // Try parsing with Chile as default country
    if (isValidPhoneNumber(phone, 'CL' as CountryCode)) {
      const parsed = parsePhoneNumber(phone, 'CL' as CountryCode);
      return parsed.format('E.164'); // Returns +56912345678
    }

    // Try with explicit +56 if not present
    if (!cleaned.startsWith('56') && cleaned.length === 9) {
      const withPrefix = `+56${cleaned}`;
      if (isValidPhoneNumber(withPrefix)) {
        const parsed = parsePhoneNumber(withPrefix);
        return parsed.format('E.164');
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Send WhatsApp message via Infobip
 */
export async function sendWhatsAppMessage(
  phone: string,
  message: string
): Promise<WhatsAppResult> {
  if (!INFOBIP_API_KEY || !INFOBIP_WHATSAPP_SENDER) {
    console.warn('Infobip not configured - message not sent');
    return {
      success: false,
      error: 'WhatsApp no configurado'
    };
  }

  const formattedPhone = formatChileanPhone(phone);
  if (!formattedPhone) {
    return {
      success: false,
      error: `Número de teléfono inválido: ${phone}`
    };
  }

  try {
    const response = await fetch(`${INFOBIP_BASE_URL}/whatsapp/1/message/text`, {
      method: 'POST',
      headers: {
        'Authorization': `App ${INFOBIP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: INFOBIP_WHATSAPP_SENDER,
        to: formattedPhone,
        content: {
          text: message
        }
      })
    });

    const data = await response.json();

    if (response.ok && data.messages?.[0]) {
      return {
        success: true,
        messageId: data.messages[0].messageId
      };
    }

    return {
      success: false,
      error: data.requestError?.serviceException?.text || 'Error sending WhatsApp'
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send password setup link via WhatsApp
 */
export async function sendSetupLinkViaWhatsApp(
  clienteId: bigint,
  setupUrl: string,
  clienteNombre: string,
  clienteTelefono: string,
  logger: any
): Promise<WhatsAppResult> {
  const message = `Hola ${clienteNombre.split(' ')[0]},

Bienvenido al Portal de Clientes de COAB.

Para configurar tu contraseña y acceder a tu cuenta, ingresa al siguiente enlace:

${setupUrl}

Este enlace expira en 48 horas.

Si no solicitaste este mensaje, ignóralo.

- COAB Sistema de Agua`;

  const result = await sendWhatsAppMessage(clienteTelefono, message);

  // Log the attempt
  logger.info('WhatsApp setup link sent', {
    clienteId: clienteId.toString(),
    success: result.success,
    messageId: result.messageId,
    error: result.error
  });

  return result;
}
```

**Update:** `src/routes/admin.routes.ts`

Add endpoint to send setup link:

```typescript
// POST /admin/clientes/:id/enviar-setup - Generate token AND send via WhatsApp
fastify.post('/clientes/:id/enviar-setup', {
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '1 hour',
      keyGenerator: (req) => `enviar-setup-${(req.params as any).id}`
    }
  }
}, async (request, reply) => {
  try {
    const { id } = request.params as { id: string };
    const clienteId = BigInt(id);

    // 1. Generate setup token
    const tokenResult = await adminService.generateSetupToken(
      clienteId,
      request.user!.email!,
      request.ip
    );

    // 2. Check phone number
    if (!tokenResult.cliente.telefono) {
      return reply.code(400).send({
        error: {
          code: 'NO_PHONE',
          message: 'Cliente no tiene teléfono registrado',
          setupUrl: tokenResult.setupUrl // Still return URL for manual sharing
        }
      });
    }

    // 3. Send via WhatsApp
    const whatsappResult = await infobipService.sendSetupLinkViaWhatsApp(
      clienteId,
      tokenResult.setupUrl,
      tokenResult.cliente.nombre,
      tokenResult.cliente.telefono,
      fastify.log
    );

    return {
      ...tokenResult,
      whatsapp: whatsappResult
    };
  } catch (error: any) {
    if (error.message === 'Cliente no encontrado') {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: error.message }
      });
    }
    throw error;
  }
});
```

**Acceptance Criteria:**
- [ ] Generates setup token and sends via WhatsApp
- [ ] Uses `libphonenumber-js` for phone validation
- [ ] Handles various Chilean phone formats
- [ ] Returns setup URL even if WhatsApp fails (for manual sharing)
- [ ] Rate limited: 3 requests per customer per hour
- [ ] Logs WhatsApp send attempts with success/error

---

### Task 7.3: Password Setup Endpoint

**Create:** `src/schemas/setup.schema.ts`

```typescript
// src/schemas/setup.schema.ts
import { z } from 'zod';

// Password requirements: 8+ chars, 1 uppercase, 1 lowercase, 1 number
export const passwordSchema = z
  .string()
  .min(8, 'Contraseña debe tener al menos 8 caracteres')
  .regex(/[A-Z]/, 'Contraseña debe incluir al menos una mayúscula')
  .regex(/[a-z]/, 'Contraseña debe incluir al menos una minúscula')
  .regex(/[0-9]/, 'Contraseña debe incluir al menos un número');

export const setupPasswordSchema = z.object({
  token: z.string().min(1, 'Token requerido'),
  password: passwordSchema,
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword']
});

export type SetupPasswordInput = z.infer<typeof setupPasswordSchema>;
```

**Update:** `src/services/auth.service.ts`

Add `setupPassword()` method:

```typescript
// Add to src/services/auth.service.ts
import { hash } from '@node-rs/argon2';

/**
 * Setup customer password using setup token
 */
export async function setupPassword(
  token: string,
  password: string,
  ipAddress: string
) {
  // Find valid token
  const tokenRecord = await prisma.tokenConfiguracion.findFirst({
    where: {
      token: token,
      tipo: 'setup',
      usado: false,
      expira_en: { gt: new Date() }
    },
    include: {
      cliente: true
    }
  });

  if (!tokenRecord || !tokenRecord.cliente) {
    throw new Error('Token inválido o expirado');
  }

  // Hash password with Argon2id
  const hashContrasena = await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });

  // Update customer with password and mark token as used
  await prisma.$transaction([
    prisma.cliente.update({
      where: { id: tokenRecord.cliente_id },
      data: {
        hash_contrasena: hashContrasena,
        primer_login: false
      }
    }),
    prisma.tokenConfiguracion.update({
      where: { id: tokenRecord.id },
      data: {
        usado: true,
        usado_en: new Date(),
        ip_uso: ipAddress
      }
    })
  ]);

  // Audit log
  await prisma.logAuditoria.create({
    data: {
      accion: 'CONFIGURAR_CONTRASENA',
      entidad: 'cliente',
      entidad_id: tokenRecord.cliente_id,
      usuario_tipo: 'cliente',
      datos_nuevos: {
        setup_completado: true
      },
      ip_address: ipAddress
    }
  });

  return {
    success: true,
    message: 'Contraseña configurada exitosamente',
    rut: tokenRecord.cliente.rut
  };
}

/**
 * Validate setup token (for showing setup form)
 */
export async function validateSetupToken(token: string) {
  const tokenRecord = await prisma.tokenConfiguracion.findFirst({
    where: {
      token: token,
      tipo: 'setup',
      usado: false,
      expira_en: { gt: new Date() }
    },
    include: {
      cliente: {
        select: {
          rut: true,
          nombre_completo: true
        }
      }
    }
  });

  if (!tokenRecord || !tokenRecord.cliente) {
    return { valid: false };
  }

  return {
    valid: true,
    cliente: {
      rut: tokenRecord.cliente.rut,
      nombre: tokenRecord.cliente.nombre_completo
    }
  };
}
```

**Update:** `src/routes/auth.routes.ts`

Add setup endpoints (public - no auth required):

```typescript
// Add to src/routes/auth.routes.ts

// GET /auth/setup/:token - Validate token (show form or error)
fastify.get('/setup/:token', async (request, reply) => {
  try {
    const { token } = request.params as { token: string };
    const result = await authService.validateSetupToken(token);

    if (!result.valid) {
      return reply.code(404).send({
        error: { code: 'INVALID_TOKEN', message: 'Enlace inválido o expirado' }
      });
    }

    return result;
  } catch (error: any) {
    return reply.code(500).send({
      error: { code: 'SERVER_ERROR', message: 'Error al validar enlace' }
    });
  }
});

// POST /auth/setup - Submit password
fastify.post('/setup', async (request, reply) => {
  try {
    const body = setupPasswordSchema.parse(request.body);

    const result = await authService.setupPassword(
      body.token,
      body.password,
      request.ip
    );

    return result;
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.errors[0].message,
          details: error.errors
        }
      });
    }

    if (error.message === 'Token inválido o expirado') {
      return reply.code(400).send({
        error: { code: 'INVALID_TOKEN', message: error.message }
      });
    }

    return reply.code(500).send({
      error: { code: 'SETUP_ERROR', message: 'Error al configurar contraseña' }
    });
  }
});
```

**Acceptance Criteria:**
- [ ] GET validates token and returns customer name
- [ ] POST creates Argon2id password hash
- [ ] Token marked as used after setup
- [ ] Customer `primer_login` set to false
- [ ] Zod validates password complexity
- [ ] IP address recorded on token use
- [ ] Audit log created

---

## Frontend Tasks

### Task 7.4: Send Setup Link from Admin Profile

**Update:** `src/pages/admin/CustomerProfile.tsx`

Add "Send Setup Link" button functionality:

```typescript
// Add to CustomerProfile.tsx

import { Send } from 'lucide-react';

// Add mutation for sending setup link
const sendSetupMutation = useMutation({
  mutationFn: async () => {
    const res = await adminApiClient.post(`/admin/clientes/${id}/enviar-setup`);
    return res.data;
  },
  onSuccess: (data) => {
    if (data.whatsapp?.success) {
      toast({
        title: 'Enlace enviado',
        description: 'Mensaje de WhatsApp enviado exitosamente'
      });
    } else {
      // WhatsApp failed but URL generated
      toast({
        title: 'Enlace generado',
        description: data.whatsapp?.error || 'Copie el enlace para compartir manualmente',
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(data.setupUrl);
              toast({ title: 'Enlace copiado' });
            }}
          >
            Copiar
          </Button>
        )
      });
    }
  },
  onError: (error: any) => {
    const errorData = error.response?.data?.error;

    if (errorData?.code === 'NO_PHONE') {
      // Customer has no phone - show URL for manual sharing
      toast({
        title: 'Sin teléfono registrado',
        description: 'Copie el enlace para compartir manualmente',
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(errorData.setupUrl);
              toast({ title: 'Enlace copiado' });
            }}
          >
            Copiar
          </Button>
        )
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorData?.message || 'Error al enviar enlace'
      });
    }
  }
});

// In the action buttons section (inside CardContent):
{!customer.tiene_contrasena && (
  <Button
    variant="outline"
    onClick={() => sendSetupMutation.mutate()}
    disabled={sendSetupMutation.isPending}
  >
    <Send className="h-4 w-4 mr-2" />
    {sendSetupMutation.isPending ? 'Enviando...' : 'Enviar Link Configuración'}
  </Button>
)}
```

**Acceptance Criteria:**
- [ ] Button only shows if customer has no password
- [ ] Loading state during send
- [ ] Success toast with copy button if WhatsApp fails
- [ ] Success toast if WhatsApp succeeds
- [ ] Error handling for missing phone number

---

### Task 7.5: Password Setup Page (Public)

**Create:** `src/pages/Setup.tsx`

```typescript
import { useState, useEffect } from 'react';
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
import { CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';

// Password requirements
const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Incluir al menos una mayúscula')
  .regex(/[a-z]/, 'Incluir al menos una minúscula')
  .regex(/[0-9]/, 'Incluir al menos un número');

const setupSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword']
});

type SetupForm = z.infer<typeof setupSchema>;

export default function SetupPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Validate token
  const { data: tokenData, isLoading, error } = useQuery({
    queryKey: ['setup-token', token],
    queryFn: async () => {
      const res = await apiClient.get(`/auth/setup/${token}`);
      return res.data;
    },
    enabled: !!token,
    retry: false
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<SetupForm>({
    resolver: zodResolver(setupSchema)
  });

  const password = watch('password', '');

  // Password strength indicators
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  // Submit mutation
  const setupMutation = useMutation({
    mutationFn: async (data: SetupForm) => {
      const res = await apiClient.post('/auth/setup', {
        token,
        password: data.password,
        confirmPassword: data.confirmPassword
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Contraseña configurada',
        description: 'Ahora puedes iniciar sesión'
      });
      // Redirect to login with RUT pre-filled
      navigate(`/login?rut=${encodeURIComponent(data.rut)}`);
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Error al configurar contraseña';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: message
      });
    }
  });

  const onSubmit = (data: SetupForm) => {
    setupMutation.mutate(data);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            Validando enlace...
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid or expired token
  if (error || !tokenData?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <XCircle className="h-16 w-16 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold text-red-600">Enlace Inválido</h2>
            <p className="text-gray-600">
              Este enlace ya fue usado o ha expirado. Contacta a COAB para solicitar uno nuevo.
            </p>
            <Button onClick={() => navigate('/login')} className="mt-4">
              Ir a Inicio de Sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center text-primary-blue">
            Configurar Contraseña
          </CardTitle>
          <p className="text-center text-gray-600">Portal Clientes COAB</p>
        </CardHeader>
        <CardContent>
          {/* Customer Info */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg text-center">
            <p className="font-medium">{tokenData.cliente.nombre}</p>
            <p className="text-sm text-gray-600 font-mono">
              RUT: {formatearRUT(tokenData.cliente.rut)}
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="password">Nueva Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                  className={`h-12 pr-10 ${errors.password ? 'border-red-500' : ''}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Password Requirements */}
            <div className="space-y-1 text-sm">
              <RequirementIndicator met={hasMinLength} text="Mínimo 8 caracteres" />
              <RequirementIndicator met={hasUppercase} text="Una letra mayúscula" />
              <RequirementIndicator met={hasLowercase} text="Una letra minúscula" />
              <RequirementIndicator met={hasNumber} text="Un número" />
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  {...register('confirmPassword')}
                  className={`h-12 pr-10 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-sm text-red-500 mt-1">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-lg bg-primary-blue hover:bg-blue-700"
              disabled={setupMutation.isPending}
            >
              {setupMutation.isPending ? 'Configurando...' : 'Configurar Contraseña'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// Requirement indicator component
function RequirementIndicator({ met, text }: { met: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-2 ${met ? 'text-accent-green' : 'text-gray-400'}`}>
      {met ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <div className="h-4 w-4 border rounded-full" />
      )}
      <span>{text}</span>
    </div>
  );
}
```

**Update Router in `src/main.tsx`:**

```typescript
import SetupPage from './pages/Setup';

// Add to routes
<Route path="/setup/:token" element={<SetupPage />} />
```

**Test:**
1. Admin generates setup link for customer
2. Customer opens link in mobile browser
3. Page shows customer name and RUT
4. Customer enters password (8+ chars, uppercase, lowercase, number)
5. See real-time requirement indicators
6. Submit and redirect to login
7. Login with RUT + new password

**Acceptance Criteria:**
- [ ] Token validation on page load
- [ ] Invalid token shows error page
- [ ] Customer name and RUT displayed
- [ ] Password toggle visibility buttons
- [ ] Real-time password requirement indicators
- [ ] Password confirmation validation
- [ ] Success redirects to login with RUT pre-filled
- [ ] Mobile-friendly (touch targets ≥44px)
- [ ] Works on iOS Safari and Android Chrome

---

## Iteration 7 Complete! ✅

**What You Can Test:**
- Admin generates setup link for customer without password
- WhatsApp message sent with setup URL
- Manual URL copy if WhatsApp fails (e.g., no phone)
- Customer opens link on mobile → sees their info
- Customer sets password with visual requirements
- Expired/used links show error page
- Customer can now login with new password
- Rate limiting prevents abuse (3 per customer per hour)

**Fallback if Infobip Not Ready:**
If Infobip verification is still pending, admin can:
1. Click "Enviar Link Configuración"
2. Get setup URL in response
3. Manually copy/paste URL and send via personal WhatsApp

**Commit Message:**
```
feat: password setup via WhatsApp link with rate limiting

Backend (Fastify + Infobip + libphonenumber-js):
- POST /admin/clientes/:id/generar-setup (generate token)
- POST /admin/clientes/:id/enviar-setup (generate + WhatsApp)
- GET /auth/setup/:token (validate token)
- POST /auth/setup (set password)
- Cryptographically secure tokens (256-bit)
- 48-hour token expiry with single-use
- Infobip WhatsApp API integration
- Phone validation with libphonenumber-js
- Rate limiting: 3 requests per customer per hour
- Argon2id password hashing
- Audit trail for token generation and password setup

Frontend (Vite + React Router):
- Admin "Send Setup Link" button with copy fallback
- Password setup page with mobile-first design
- Real-time password requirement indicators
- Token validation and error states
- Redirect to login with RUT pre-filled

🚀 Generated with Claude Code
```
