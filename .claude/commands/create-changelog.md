---
description: Create or update CHANGELOG.md files for backend and frontend
argument-hint: [backend|frontend] [Added|Changed|Fixed] [description]
---

Update CHANGELOG: $ARGUMENTS

## 📝 CHANGELOG Format (Keep a Changelog)

Both `coab-backend/CHANGELOG.md` and `coab-frontend/CHANGELOG.md` follow the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format.

### Structure:
```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New features added in this iteration

### Changed
- Changes to existing functionality

### Fixed
- Bug fixes

### Removed
- Removed features or deprecated functionality

### Security
- Security-related changes

## [1.0.0] - 2025-10-05

### Added
- Initial release
- Customer authentication with RUT + password
- Admin customer search
- Payment entry system
...
```

## 📋 Entry Format

**Use Spanish for descriptions** (this is a Chilean project):

### Added (New Features)
```markdown
- Autenticación de clientes con RUT y contraseña
- Dashboard de cliente con saldo y historial de pagos
- Sistema de entrada manual de pagos por admin
- Validación de RUT con módulo 11
- Formateo automático de moneda CLP
```

### Changed (Modifications)
```markdown
- Mejorado el rendimiento de búsqueda de clientes (< 200ms)
- Actualizado el diseño del dashboard para móviles
- Cambiado el formato de fecha a dd/MM/yyyy
```

### Fixed (Bug Fixes)
```markdown
- Corregido error de validación de RUT con dígito K
- Arreglado el problema de sesión expirada sin redirección
- Solucionado el cálculo incorrecto de saldo pendiente
```

### Removed (Deprecated)
```markdown
- Eliminado endpoint obsoleto /api/v1/old-payments
- Removido campo 'telefono_antiguo' de la tabla clientes
```

### Security (Security Updates)
```markdown
- Agregado rate limiting a endpoints de autenticación
- Implementado refresh token rotation
- Fortalecido validación de entrada con Zod
```

## 🔄 Workflow

### When Adding Entry:

1. **Read current CHANGELOG** for the service (backend or frontend)
2. **Identify section** (Added, Changed, Fixed, Removed, Security)
3. **Add entry under `## [Unreleased]`** section
4. **Use Spanish** for user-facing changes
5. **Be specific but concise**
6. **Link to issues/PRs** if applicable (future enhancement)

### When Releasing Version:

1. Move all `[Unreleased]` entries to new version section
2. Add version number and date: `## [1.1.0] - 2025-10-15`
3. Create new empty `[Unreleased]` section at top
4. Update version links at bottom (if using)

## 🎯 Best Practices

### ✅ Good Entries:
```markdown
- Agregado sistema de recuperación de contraseña vía WhatsApp
- Corregido error de cálculo FIFO en aplicación de pagos
- Mejorado rendimiento de búsqueda con índices en base de datos
- Implementado modo offline para consulta de saldo
```

### ❌ Bad Entries:
```markdown
- Fixed bug (too vague, what bug?)
- Updated code (not useful, be specific)
- Various improvements (meaningless)
- Changed some files (what changed?)
```

### 💡 Tips:
- Start with a verb (Agregado, Corregido, Mejorado, Implementado)
- Focus on **what** changed, not **how** it was changed
- Think from user/developer perspective: "What do they need to know?"
- Group related changes together
- Keep entries in Spanish (business language)

## 📦 Backend vs Frontend

**Backend Changes** (`coab-backend/CHANGELOG.md`):
- API endpoints added/changed
- Database schema changes
- Authentication/authorization updates
- Performance improvements
- Security patches
- Integration changes (Transbank, Infobip)

**Frontend Changes** (`coab-frontend/CHANGELOG.md`):
- UI components added/changed
- New pages or features
- UX improvements
- Mobile responsiveness fixes
- Accessibility enhancements
- Visual design updates

## 🚀 Integration with Git Workflow

**Before Committing:**
1. Review your changes: `git diff`
2. Identify what category they fall into (Added, Changed, Fixed)
3. Add entry to appropriate CHANGELOG.md
4. Include CHANGELOG update in your commit:
   ```bash
   git add coab-backend/CHANGELOG.md
   git commit -m "feat: agregado endpoint de búsqueda de clientes"
   ```

**In Pull Requests:**
- Reviewers can see what changed from CHANGELOG
- Easier to understand scope of changes
- Better release notes generation

## 📊 Example Complete Entry

```markdown
## [Unreleased]

### Added
- Autenticación de clientes con RUT y contraseña (bcrypt, 12 salt rounds)
- Dashboard de cliente móvil con saldo, pagos y boletas
- Búsqueda de clientes por RUT o número de cliente (admin)
- Sistema de entrada manual de pagos con aplicación FIFO
- Validación de RUT chileno con módulo 11 en frontend y backend
- Rotación de refresh tokens para mayor seguridad
- Rate limiting en endpoints de autenticación (5 intentos / 15 min)

### Changed
- Mejorado rendimiento de búsqueda de clientes (<200ms con 10k registros)
- Actualizado diseño de formularios para móvil (44px touch targets)
- Cambiado formato de fecha a dd/MM/yyyy con date-fns (es-CL)

### Fixed
- Corregido error de validación de RUT con dígito verificador 'K'
- Arreglado problema de sesión expirada sin redirección a login
- Solucionado cálculo incorrecto de saldo en caso de pagos parciales

### Security
- Agregado Helmet para security headers
- Implementado CORS restrictivo para producción
- Fortalecido validación de entrada con Zod en todos los endpoints
```

## ✅ Checklist

Before committing:
- [ ] CHANGELOG entry added to correct file (backend or frontend)
- [ ] Entry is in correct section (Added, Changed, Fixed, etc.)
- [ ] Description is in Spanish
- [ ] Description is specific and actionable
- [ ] Entry follows "verb + what + context" format
- [ ] CHANGELOG file is included in git commit
