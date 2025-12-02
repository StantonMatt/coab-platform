# COAB Backend - Setup Instructions

## Prerequisites

- Node.js 22+
- Access to Supabase project (COAB)

## Environment Setup

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Edit `.env` with your Supabase credentials:
```
# Get these from Supabase Dashboard > Settings > Database
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[ref]:[password]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres

# Generate with: openssl rand -hex 32
JWT_SECRET=your-32-char-secret-here

# CORS origin for frontend
CORS_ORIGIN=http://localhost:5173
```

## Installation

From the project root:

```bash
# Install all workspace dependencies
npm install

# Build shared utilities
npm run build:utils
```

## Database Setup

Since you have an existing Supabase database, you need to:

1. **Option A: Introspect existing schema (Recommended)**
```bash
cd coab-backend
npx prisma db pull
```

2. **Run the auth migration** to add authentication columns:
```bash
npx prisma db push
```

Or use the migration file directly:
```bash
npx prisma migrate dev --name add_auth_infrastructure
```

3. **Generate Prisma client:**
```bash
npx prisma generate
```

## Create Admin User

After database setup:

```bash
npm run create-admin
```

This will prompt for:
- Nombre (Name)
- Apellido (Surname)
- Correo electrónico (Email)
- Contraseña (Password - min 8 characters)

## Run Development Server

```bash
npm run dev
```

Server will start at http://localhost:3000

## Test Endpoints

- Health check: http://localhost:3000/health
- API health: http://localhost:3000/api/v1/health

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript to dist/ |
| `npm run start` | Run production build |
| `npm run studio` | Open Prisma Studio |
| `npm run migrate` | Run Prisma migrations |
| `npm run db:pull` | Introspect database schema |
| `npm run create-admin` | Create admin user |







