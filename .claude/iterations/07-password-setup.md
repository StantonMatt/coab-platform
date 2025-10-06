# ITERATION 7: Password Setup (WhatsApp Link + Infobip Auto-Send)

**Goal:** Admin can auto-send setup links via WhatsApp, customers can set passwords

**Duration:** 2-3 days (includes Infobip WhatsApp integration)

**You'll Be Able To:** Complete full automated onboarding flow (no manual link sharing!)

---

## Before You Start

### Prerequisites

⚠️ **Infobip WhatsApp verification must be complete** (started in Iteration 1)

**If Infobip verification is still pending:**
- You can still implement the full setup link flow (Tasks 7.1-7.4)
- Implement manual fallback first: Admin copies WhatsApp link and shares manually
- Once Infobip is verified, add Task 7.1.5 (WhatsApp auto-send integration)

**If Infobip is already verified:**
- Proceed with all tasks including 7.1.5 (WhatsApp auto-send)
- You'll need: `INFOBIP_API_KEY`, `INFOBIP_BASE_URL`, `INFOBIP_WHATSAPP_SENDER`

**Other Prerequisites:**
- Iterations 1-6 completed
- 355 customers migrated with phone numbers in database

---

## Backend Tasks (Day 1)

### Task 7.1: Setup Token APIs
**Time:** 3 hours

**Update:** `src/services/admin.service.ts`

Add `generateSetupLink()` method:

```typescript
// src/services/admin.service.ts
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

export async function generateSetupLink(clienteId: bigint, logger: any) {
  // Check if customer exists and doesn't already have password
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

  if (cliente.hash_contrasena) {
    throw new Error('Cliente ya tiene contraseña configurada');
  }

  if (!cliente.telefono) {
    throw new Error('Cliente no tiene teléfono registrado');
  }

  // Generate secure token (32 bytes = 64 hex chars)
  const token = crypto.randomBytes(32).toString('hex');

  // Create token in database
  await prisma.token_configuracion.create({
    data: {
      cliente_id: clienteId,
      token,
      tipo: 'setup',
      expira_en: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      usado: false
    }
  });

  const setupUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/configurar/${token}`;

  logger.info('Setup link generated', {
    clienteId: clienteId.toString(),
    token: token.substring(0, 8) + '...', // Log only first 8 chars
    expiry: '24h'
  });

  return {
    token,
    setupUrl,
    telefono: cliente.telefono,
    nombreCliente: cliente.nombre_completo
  };
}
```

**Update:** `src/services/auth.service.ts`

Add `configurarPassword()` method (or update if exists from earlier iteration):

```typescript
// src/services/auth.service.ts
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function configurarPassword(token: string, password: string, logger: any) {
  // Find valid token
  const setupToken = await prisma.token_configuracion.findFirst({
    where: {
      token,
      tipo: 'setup',
      usado: false,
      expira_en: { gt: new Date() }
    },
    include: {
      cliente: {
        select: {
          id: true,
          rut: true,
          nombre_completo: true,
          hash_contrasena: true
        }
      }
    }
  });

  if (!setupToken) {
    throw new Error('Token inválido o expirado');
  }

  if (setupToken.cliente.hash_contrasena) {
    throw new Error('Contraseña ya configurada');
  }

  // Hash password with Argon2id
  const hashContrasena = await hash(password, {
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1
  });

  // Update customer password
  await prisma.cliente.update({
    where: { id: setupToken.cliente_id },
    data: {
      hash_contrasena: hashContrasena,
      primer_login: false,
      cuenta_bloqueada: false,
      intentos_fallidos: 0
    }
  });

  // Mark token as used
  await prisma.token_configuracion.update({
    where: { id: setupToken.id },
    data: {
      usado: true,
      usado_en: new Date()
    }
  });

  logger.info('Password configured successfully', {
    clienteId: setupToken.cliente_id.toString(),
    token: token.substring(0, 8) + '...'
  });

  return {
    success: true,
    cliente: {
      rut: setupToken.cliente.rut,
      nombre: setupToken.cliente.nombre_completo
    }
  };
}
```

**Update:** `src/routes/admin.routes.ts`

Add setup link generation endpoint:

```typescript
// src/routes/admin.routes.ts
import { FastifyPluginAsync } from 'fastify';
import * as adminService from '../services/admin.service.js';
import { requireAdmin } from '../middleware/auth.middleware.js';

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireAdmin);

  // POST /admin/clientes/:id/enviar-setup
  fastify.post('/clientes/:id/enviar-setup', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const result = await adminService.generateSetupLink(BigInt(id), fastify.log);
      return result;
    } catch (error: any) {
      if (error.message === 'Cliente no encontrado') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: error.message }
        });
      }
      if (error.message.includes('ya tiene contraseña') || error.message.includes('no tiene teléfono')) {
        return reply.code(400).send({
          error: { code: 'INVALID_REQUEST', message: error.message }
        });
      }
      throw error;
    }
  });
};

export default adminRoutes;
```

**Update:** `src/routes/auth.routes.ts`

Add password configuration endpoint:

```typescript
// src/routes/auth.routes.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as authService from '../services/auth.service.js';

const configurarSchema = z.object({
  password: z.string()
    .min(8, 'Contraseña debe tener al menos 8 caracteres')
    .regex(/[0-9]/, 'Contraseña debe contener al menos un número'),
  passwordConfirm: z.string()
}).refine((data) => data.password === data.passwordConfirm, {
  message: 'Las contraseñas no coinciden',
  path: ['passwordConfirm']
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/configurar/:token
  fastify.post('/configurar/:token', async (request, reply) => {
    try {
      const { token } = request.params as { token: string };
      const body = configurarSchema.parse(request.body);

      const result = await authService.configurarPassword(
        token,
        body.password,
        fastify.log
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
      if (error.message.includes('inválido') || error.message.includes('expirado') || error.message.includes('ya configurada')) {
        return reply.code(400).send({
          error: { code: 'INVALID_TOKEN', message: error.message }
        });
      }
      throw error;
    }
  });
};

export default authRoutes;
```

---

### Task 7.1.5: Infobip WhatsApp Auto-Send (NEW - Moved from Phase 2)
**Time:** 1 day (8 hours)

**Why This Change:** Professional review identified that manual link sharing for 355 customers = 30 hours of work + ongoing support chaos. Infobip WhatsApp API costs ~$1.77 for 355 messages but saves weeks of operational burden.

**Cost Analysis:**
- Infobip WhatsApp: ~$0.005/message
- 355 customers × $0.005 = **$1.77 total**
- Time saved: ~30 hours of manual work
- **ROI: Massive** (save $300+ in labor for $1.77)

**Setup Infobip Account:**

1. Create account at https://www.infobip.com
2. Go to Channels → WhatsApp → Get Started
3. Create WhatsApp sender (requires business verification - use company details)
4. **Important:** Verification can take 1-3 days. Start this ASAP!
5. Get API key: Developer Tools → API Keys → Create New Key
6. Add to `.env`:
   ```bash
   INFOBIP_API_KEY=<your-key>
   INFOBIP_BASE_URL=https://api.infobip.com
   INFOBIP_WHATSAPP_SENDER=<your-verified-number>
   ```

**Install Infobip SDK:**

```bash
cd coab-backend
npm install @infobip-api/sdk
```

**Create WhatsApp Service:**

```typescript
// src/services/whatsapp.service.ts
import { InfobipClient, AuthType } from '@infobip-api/sdk';

const client = new InfobipClient({
  baseUrl: process.env.INFOBIP_BASE_URL!,
  apiKey: process.env.INFOBIP_API_KEY!,
  authType: AuthType.ApiKey
});

export async function sendSetupLink(
  phoneNumber: string,
  customerName: string,
  setupUrl: string,
  logger: any
) {
  // Format phone number for Chilean format (+56 9 XXXX XXXX)
  const formattedPhone = phoneNumber.startsWith('+56')
    ? phoneNumber
    : `+56${phoneNumber.replace(/^0/, '')}`;

  const message = `Hola ${customerName}! 👋

Bienvenido a COAB - Portal de Clientes.

Para acceder a tu cuenta por primera vez, configura tu contraseña aquí:
${setupUrl}

Este link expira en 24 horas.

Si tienes problemas, contacta a nuestro soporte.

🔒 Link seguro y confidencial`;

  try {
    const response = await client.channels.whatsapp.send({
      type: 'text',
      from: process.env.INFOBIP_WHATSAPP_SENDER!,
      to: formattedPhone,
      content: {
        text: message
      }
    });

    logger.info('WhatsApp setup link sent via Infobip', {
      to: formattedPhone,
      messageId: response.messages?.[0]?.messageId,
      status: response.messages?.[0]?.status?.groupName
    });

    return {
      success: true,
      messageId: response.messages?.[0]?.messageId,
      status: response.messages?.[0]?.status?.groupName
    };
  } catch (error: any) {
    logger.error('Failed to send WhatsApp via Infobip', {
      to: formattedPhone,
      error: error.message,
      details: error.response?.data
    });

    throw new Error('No se pudo enviar mensaje de WhatsApp. Intente más tarde.');
  }
}
```

**Update generateSetupLink() to Auto-Send:**

```typescript
// src/services/admin.service.ts
import { sendSetupLink } from './whatsapp.service.js';

export async function generateSetupLink(clienteId: bigint, logger: any) {
  // ... existing code to generate token ...

  const setupUrl = `${process.env.FRONTEND_URL}/configurar/${token}`;

  // **AUTO-SEND VIA INFOBIP** (NEW)
  try {
    await sendSetupLink(
      cliente.telefono!,
      cliente.nombre_completo,
      setupUrl,
      logger
    );

    logger.info('Setup link generated and sent via WhatsApp', {
      clienteId: clienteId.toString(),
      telefono: cliente.telefono
    });

    return {
      token,
      setupUrl,
      telefono: cliente.telefono,
      nombreCliente: cliente.nombre_completo,
      whatsappSent: true, // NEW
      message: 'Link enviado por WhatsApp exitosamente'
    };
  } catch (whatsappError: any) {
    // WhatsApp failed, but still return link for manual sharing
    logger.warn('WhatsApp send failed, returning link for manual sharing', {
      error: whatsappError.message
    });

    return {
      token,
      setupUrl,
      telefono: cliente.telefono,
      nombreCliente: cliente.nombre_completo,
      whatsappSent: false,
      message: 'Error al enviar WhatsApp. Copie el link y envíelo manualmente.',
      error: whatsappError.message
    };
  }
}
```

**Update Admin UI:**

```typescript
// src/components/admin/CustomerProfile.tsx
const sendSetupLink = useMutation({
  mutationFn: async () => {
    const res = await apiClient.post(`/admin/clientes/${customerId}/enviar-setup`);
    return res.data;
  },
  onSuccess: (result) => {
    if (result.whatsappSent) {
      toast.success(`Link enviado por WhatsApp a ${result.telefono}`);
    } else {
      toast.warning(result.message);
      // Show copy button as fallback
      setShowManualLink(true);
      setSetupUrl(result.setupUrl);
    }
  }
});
```

**Test Infobip Integration:**

```bash
# Test WhatsApp send
curl -X POST http://localhost:3000/api/v1/admin/clientes/123/enviar-setup \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Expected response:
# {
#   "token": "abc123...",
#   "setupUrl": "https://app.pages.dev/configurar/abc123...",
#   "telefono": "+56912345678",
#   "nombreCliente": "Juan Pérez",
#   "whatsappSent": true,
#   "message": "Link enviado por WhatsApp exitosamente"
# }

# Check customer's WhatsApp for message (test with your own phone first!)
```

**Bulk Send for All 355 Customers:**

Create admin script for initial rollout:

```typescript
// scripts/send-all-setup-links.ts
import { PrismaClient } from '@prisma/client';
import { generateSetupLink } from '../src/services/admin.service.js';
import pino from 'pino';

const prisma = new PrismaClient();
const logger = pino();

async function sendAllSetupLinks() {
  const customersNeedingSetup = await prisma.cliente.findMany({
    where: {
      hash_contrasena: null,
      telefono: { not: null }
    }
  });

  console.log(`Found ${customersNeedingSetup.length} customers needing setup links`);

  let sent = 0;
  let failed = 0;

  for (const customer of customersNeedingSetup) {
    try {
      const result = await generateSetupLink(customer.id, logger);
      if (result.whatsappSent) {
        sent++;
        console.log(`✅ Sent to ${customer.nombre_completo} (${customer.telefono})`);
      } else {
        failed++;
        console.log(`❌ Failed for ${customer.nombre_completo}: ${result.error}`);
      }

      // Rate limit: wait 1 second between sends (avoid Infobip throttling)
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error: any) {
      failed++;
      console.error(`❌ Error for ${customer.nombre_completo}:`, error.message);
    }
  }

  console.log(`\n✅ Sent: ${sent}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total cost: ~$${(sent * 0.005).toFixed(2)}`);
}

sendAllSetupLinks().catch(console.error);
```

**Run bulk send (after Infobip verification):**

```bash
cd coab-backend
npx ts-node scripts/send-all-setup-links.ts
```

**Acceptance Criteria:**
- [ ] Infobip account created and WhatsApp sender verified
- [ ] @infobip-api/sdk installed
- [ ] WhatsApp service created with proper error handling
- [ ] generateSetupLink() auto-sends via WhatsApp
- [ ] Fallback to manual link if WhatsApp fails
- [ ] Chilean phone number formatting works (+56 9 XXXX XXXX)
- [ ] Message text is professional and clear
- [ ] Bulk send script tested with 5-10 customers first
- [ ] Cost tracking: Sent count × $0.005 matches Infobip invoice
- [ ] Admin UI shows success/failure status
- [ ] Manual copy button available as fallback

**Cost Tracking:**
- Log every WhatsApp send to audit trail
- Query for monthly cost: `SELECT COUNT(*) * 0.005 AS cost FROM log_auditoria WHERE accion = 'WHATSAPP_ENVIADO' AND created_at >= '2025-10-01'`

---

**Test:**
```bash
# Generate token
curl -X POST http://localhost:3000/api/v1/admin/clientes/123/enviar-setup \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Returns:
# {
#   "token": "abc123...",
#   "setupUrl": "http://localhost:5173/configurar/abc123...",
#   "telefono": "+56912345678",
#   "nombreCliente": "Juan Pérez"
# }

# Test setup
curl -X POST http://localhost:3000/api/v1/auth/configurar/abc123... \
  -H "Content-Type: application/json" \
  -d '{
    "password": "NewPass123",
    "passwordConfirm": "NewPass123"
  }'

# Returns:
# {
#   "success": true,
#   "cliente": {
#     "rut": "12345678-9",
#     "nombre": "Juan Pérez"
#   }
# }
```

**Acceptance Criteria:**
- [ ] Token generated and stored in `token_configuracion` table
- [ ] Token expires in 24 hours
- [ ] Cannot generate token if customer already has password
- [ ] Cannot generate token if customer has no phone
- [ ] Setup endpoint validates token (not expired, not used)
- [ ] Password validation enforces min 8 chars + 1 number
- [ ] Password hashed with Argon2id (not bcrypt)
- [ ] Password update works, marks token as used
- [ ] Pino logs show setup link generation and usage

---

## Frontend Tasks (Day 2)

### Task 7.2: Admin Setup Link UI
**Time:** 2 hours

**Update:** `src/pages/admin/CustomerProfile.tsx`

Add "Enviar Link Configuración" button and modal:

```typescript
// Add to CustomerProfile.tsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/api';

export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [setupLinkModalOpen, setSetupLinkModalOpen] = useState(false);
  const [setupUrl, setSetupUrl] = useState('');
  const { toast } = useToast();

  const generateSetupLinkMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/admin/clientes/${id}/enviar-setup`);
      return response.data;
    },
    onSuccess: (data) => {
      setSetupUrl(data.setupUrl);
      setSetupLinkModalOpen(true);
      toast({
        title: 'Link generado',
        description: `Para ${data.nombreCliente} - Tel: ${data.telefono}`
      });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error?.message || 'Error al generar link';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage
      });
    }
  });

  const copyToClipboard = () => {
    navigator.clipboard.writeText(setupUrl);
    toast({
      title: 'Copiado',
      description: 'Link copiado al portapapeles'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* ... existing code ... */}

      <div className="mt-4 flex gap-2">
        {!customer?.tiene_contrasena && (
          <Button
            variant="outline"
            onClick={() => generateSetupLinkMutation.mutate()}
            disabled={generateSetupLinkMutation.isPending}
          >
            {generateSetupLinkMutation.isPending ? 'Generando...' : 'Enviar Link Configuración'}
          </Button>
        )}
        {/* ... other buttons ... */}
      </div>

      {/* Setup Link Modal */}
      <Dialog open={setupLinkModalOpen} onOpenChange={setSetupLinkModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link de Configuración</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">
                Comparte este link con el cliente por WhatsApp. El link expira en 24 horas.
              </p>
              <div className="p-3 bg-gray-100 rounded border border-gray-300 font-mono text-sm break-all">
                {setupUrl}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setSetupLinkModalOpen(false)}>
                Cerrar
              </Button>
              <Button onClick={copyToClipboard}>
                Copiar Link
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

**Test:**
1. Login as admin
2. Search for customer without password
3. Click "Enviar Link Configuración"
4. Should see modal with generated link
5. Click "Copiar Link"
6. Should see "Copiado" toast
7. Paste link in browser - should be valid URL

**Acceptance Criteria:**
- [ ] Button only shows for customers without password
- [ ] Button disabled during generation
- [ ] Modal displays generated URL
- [ ] Copy button works (copies to clipboard)
- [ ] Toast shows customer name and phone
- [ ] Error handling for already-configured customers
- [ ] Error handling for customers without phone

---

### Task 7.3: Password Setup Page
**Time:** 3 hours

**Create:** `src/pages/PasswordSetup.tsx`

```typescript
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/api';

const passwordSetupSchema = z.object({
  password: z.string()
    .min(8, 'Contraseña debe tener al menos 8 caracteres')
    .regex(/[0-9]/, 'Contraseña debe contener al menos un número'),
  passwordConfirm: z.string()
}).refine((data) => data.password === data.passwordConfirm, {
  message: 'Las contraseñas no coinciden',
  path: ['passwordConfirm']
});

type PasswordSetupForm = z.infer<typeof passwordSetupSchema>;

export default function PasswordSetupPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [customerName, setCustomerName] = useState('');
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<PasswordSetupForm>({
    resolver: zodResolver(passwordSetupSchema)
  });

  const password = watch('password');

  // Validate token on page load
  useEffect(() => {
    async function validateToken() {
      try {
        // We don't have a validation endpoint, so we'll just check on submit
        // For better UX, you could add GET /auth/configurar/:token to validate
        setTokenValid(true);
      } catch (error) {
        setTokenValid(false);
      }
    }
    if (token) {
      validateToken();
    }
  }, [token]);

  const onSubmit = async (data: PasswordSetupForm) => {
    try {
      const response = await apiClient.post(`/auth/configurar/${token}`, {
        password: data.password,
        passwordConfirm: data.passwordConfirm
      });

      const { cliente } = response.data;
      setCustomerName(cliente.nombre);

      toast({
        title: '¡Contraseña configurada!',
        description: 'Ya puedes iniciar sesión con tu RUT y contraseña'
      });

      // Redirect to login with RUT pre-filled
      setTimeout(() => {
        navigate(`/login?rut=${encodeURIComponent(cliente.rut)}`);
      }, 2000);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || 'Error al configurar contraseña';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage
      });

      // If token expired or invalid, show clear message
      if (errorMessage.includes('inválido') || errorMessage.includes('expirado')) {
        setTokenValid(false);
      }
    }
  };

  if (tokenValid === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-red-600">Link Inválido o Expirado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-gray-600 mb-4">
              Este link de configuración ha expirado o ya fue usado. Por favor, contacta a COAB para obtener un nuevo link.
            </p>
            <Button className="w-full" onClick={() => navigate('/login')}>
              Volver al Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Configura tu Contraseña</CardTitle>
          {customerName && (
            <p className="text-center text-gray-600 mt-2">Bienvenido, {customerName}</p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="password">Nueva Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 8 caracteres, 1 número"
                {...register('password')}
                className={errors.password ? 'border-red-500' : ''}
              />
              {errors.password && (
                <p className="text-sm text-red-500 mt-1">{errors.password.message}</p>
              )}
              {password && password.length > 0 && (
                <div className="mt-2 text-sm space-y-1">
                  <p className={password.length >= 8 ? 'text-green-600' : 'text-gray-500'}>
                    {password.length >= 8 ? '✓' : '○'} Mínimo 8 caracteres
                  </p>
                  <p className={/[0-9]/.test(password) ? 'text-green-600' : 'text-gray-500'}>
                    {/[0-9]/.test(password) ? '✓' : '○'} Al menos 1 número
                  </p>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="passwordConfirm">Confirmar Contraseña</Label>
              <Input
                id="passwordConfirm"
                type="password"
                placeholder="Repite la contraseña"
                {...register('passwordConfirm')}
                className={errors.passwordConfirm ? 'border-red-500' : ''}
              />
              {errors.passwordConfirm && (
                <p className="text-sm text-red-500 mt-1">{errors.passwordConfirm.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Configurando...' : 'Configurar Contraseña'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Update Router:**
```typescript
// src/main.tsx or App.tsx
import { createBrowserRouter, RouterProvider } from 'react-router';
import PasswordSetup from './pages/PasswordSetup';

const router = createBrowserRouter([
  {
    path: '/configurar/:token',
    element: <PasswordSetup />
  }
]);
```

**Test:**
1. Copy setup URL from admin modal
2. Open in new incognito window
3. Should see "Configura tu Contraseña" page
4. Enter password "NewPass123"
5. Enter confirm "NewPass123"
6. Should see real-time validation checkmarks
7. Submit
8. Should see success toast
9. Should redirect to login with RUT pre-filled
10. Login with RUT and new password
11. Should successfully enter dashboard

**Acceptance Criteria:**
- [ ] Token validation on page load
- [ ] Expired token shows error page
- [ ] Used token shows error page
- [ ] Password validation shows real-time feedback (checkmarks)
- [ ] Password mismatch shows error
- [ ] Success shows toast and redirects to login
- [ ] RUT pre-filled in login page URL params
- [ ] Customer can login with new password
- [ ] Password stored as Argon2id hash (verify in database)

---

## Iteration 7 Complete! ✅

**What You Can Test:**
- Full onboarding flow:
  1. Admin searches for customer without password
  2. Admin clicks "Enviar Link Configuración"
  3. Admin copies link
  4. Customer opens link (simulate WhatsApp click)
  5. Customer sees personalized setup page
  6. Customer sets password with real-time validation
  7. Customer redirected to login
  8. Customer logs in successfully
  9. Customer sees their dashboard

**Note:** ~~WhatsApp auto-send is Phase 2~~ **NOW IN MVP!** Infobip integration added based on professional review (saves 30 hours of manual work for $1.77).

**Commit Message:**
```
feat: password setup flow with Infobip WhatsApp auto-send

Backend (Fastify + Argon2id + Infobip):
- Setup token generation endpoint (POST /admin/clientes/:id/enviar-setup)
- Password configuration endpoint (POST /auth/configurar/:token)
- Token validation and expiry (24 hours)
- Argon2id password hashing (memoryCost: 19456)
- Pino logging for audit trail
- **Infobip WhatsApp integration for automated link sending**
- **Bulk send script for 355 customer onboarding**
- **Fallback to manual link if WhatsApp fails**
- **Cost tracking: $0.005/message**

Frontend (Vite + React Router):
- Admin setup link generation UI
- WhatsApp send status indicators (success/failure)
- Manual copy button as fallback
- Customer password setup page with real-time validation
- Token validation and error handling
- Redirect to login with RUT pre-filled via URL params
- Real-time password strength indicators
```
