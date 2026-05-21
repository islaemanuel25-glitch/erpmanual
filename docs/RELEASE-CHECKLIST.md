# Checklist de Release — ERP Azul

## 1. Pre-release (dev)

- [ ] `git status` limpio (sin cambios sin commitear)
- [ ] `npx prisma migrate dev` — aplica migraciones pendientes en dev
- [ ] `npx prisma generate` — regenera el cliente Prisma
- [ ] `npm run lint` — sin errores ni warnings críticos

### Smoke tests manuales

- [ ] **Clientes:** listado, detalle, crear, editar
- [ ] **Cuenta Corriente:** ver saldo + movimientos, registrar pago, registrar ajuste
- [ ] **Puntos:** ver saldo, canjear puntos (si activo en el local)
- [ ] **POS Venta contado:** buscar producto, agregar al carrito, cobrar efectivo
- [ ] **POS Venta fiado:** cobrar como Cuenta Corriente → verificar movimiento CC generado
- [ ] **Analytics:** ranking facturación/frecuencia, inactivos con/sin compras
- [ ] **Import/Export:** importar preview + apply, exportar Excel, exportar PDF
- [ ] **Merge clientes:** unificar duplicados, verificar transferencia de ventas/CC/puntos/tags

## 2. Producción

- [ ] `docker exec erpazul_app prisma migrate deploy` — aplica migraciones en producción (CLI de prisma incluido en la imagen, sin `npx`)
- [ ] Verificar endpoints críticos:
  - `GET /api/clientes/listar`
  - `GET /api/clientes/[id]/cuenta-corriente`
  - `GET /api/clientes/[id]/puntos`
  - `POST /api/pos-ventas/crear`
- [ ] Verificar que el login funciona correctamente
- [ ] Verificar que el sidebar muestra todos los módulos

## 3. Rollback

### Solo código (sin migración nueva)

```bash
git revert <hash-del-commit>
```

### Con migración aplicada

El rollback de migraciones Prisma es **manual**. Pasos:

1. Identificar el migration.sql aplicado
2. Escribir SQL inverso (DROP TABLE, DROP COLUMN, etc.)
3. Ejecutar el SQL inverso directamente en la base de datos
4. Eliminar la entrada de `_prisma_migrations` correspondiente
5. Revertir el commit de código

> **Importante:** Siempre hacer backup de la base de datos antes de aplicar migraciones en producción.

## 4. Notas de deploy

- El deploy reconstruye la imagen Docker en el VPS. Un deploy típico tarda
  **~10-11 min**, dominado casi por completo por `next build` (~10 min con
  Turbopack). El resto (`npm ci`, copies, migrate) es marginal.
- El `next build` no se acelera con cache entre builds porque Turbopack no
  reaprovecha `.next/cache`. Optimizar este punto queda pendiente para una
  sesión futura (evaluar build con Webpack para producción, cache persistente
  experimental de Turbopack, o build en CI con push a un registry).
- `docker compose -f docker-compose.prod.yml up -d --no-deps app` recrea el
  container con ~3-5 s de corte (502 vía nginx mientras Next arranca).
