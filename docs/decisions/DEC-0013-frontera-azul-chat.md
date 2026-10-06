# DEC-0013 — Azul Chat entra al ERP por una frontera propia, cerrada y de solo lectura

**Fecha:** 2026-10-06
**Estado:** VIGENTE en código, **sin ruta HTTP externa**: la frontera está
escrita y probada, pero ninguna URL la expone todavía. Desde la tanda 2 (mismo
día) exige un vínculo persona ↔ aplicación, con la migración
`20261006120000_vinculo_integracion`, sin aplicar en producción.
**Alcance:** cómo una aplicación externa (Azul Chat) le pide datos al ERP en
nombre de una persona.

## Contexto

Azul Chat va a ser una aplicación independiente. El ERP sigue siendo la fuente
de verdad de usuarios, roles, locales y ventas, y Azul Chat no tiene acceso a
su base. La primera capacidad es `ventas_resumen`, sin IA.

Lo que el ERP tenía para autenticar es todo de PERSONAS en un navegador: el JWT
de `erpazul_sesion` firmado con `AUTH_SECRET` (`lib/auth.js`), con los permisos
congelados por ocho horas; la cookie de contexto operativo
(`lib/contexto.js`); el grupo activo del admin, que `grupo-activo/set` deja
elegir sin restricción; y los vouchers del POS offline, que también firman con
`AUTH_SECRET` (`verificarTokenIgnorandoVencimiento`, `lib/auth.js:35`). Darle cualquiera de esas cosas a una
aplicación le daba el ERP entero, y filtrarlas filtraba todas las sesiones.

## Decisión

Seis pasos separados, cada uno en su pieza de `lib/integraciones/azul-chat/`:

1. **La aplicación** se autentica con un secreto propio,
   `AZUL_CHAT_INTEGRACION_SECRET`, firmando cada solicitud con HMAC-SHA256 sobre
   aplicación, marca de tiempo y cuerpo crudo, con ventana de 300 s
   (`autenticacionAplicacion.js`). Sin secreto, con uno de menos de 32
   caracteres o con uno igual a `AUTH_SECRET`, la integración se apaga.
2. **El cuerpo** tiene forma cerrada —`capacidad`, `delegacion.usuarioId`,
   `alcance.grupoId`/`localId`, `parametros`— y una clave de más lo rechaza
   (`atender.js`). No hay dónde poner un endpoint, SQL ni una consulta.
3. **La capacidad** está en un catálogo congelado (`capacidades.js`). Hoy:
   `ventas_resumen`, que pide `reportes.ver`, el mismo permiso que el reporte
   del ERP del que sale.
4. **La delegación**: `usuarioId` es una afirmación de Azul Chat, no un dato.
5. **La autorización** se decide contra la base EN ESE MOMENTO
   (`autorizacion.js`): usuario existente y activo, rol actual con el permiso
   (vía `checkPerm`), local con grupo real igual al pedido, y local dentro del
   alcance actual —su local fijo si no es admin; el grupo de su local fijo si
   es admin con local; cualquiera si es admin sin local, como en el ERP—.
6. **La capacidad se ejecuta** con el alcance AUTORIZADO, no con el pedido.

`ventas_resumen` no tiene fórmula propia: el `where` comercial del período, el
`select`, el total y el desglose salieron de
`app/api/reportes-ventas/general/route.js` a `lib/reportes-ventas/resumenVentas.js`
y el reporte pasó a consumirlos.

## Motivo

El de cada paso está escrito en la cabecera de su archivo. El de fondo: la
aplicación no debe poder más que la persona en su propio ERP, y lo que la
persona puede se mira hoy, no en el login.

## Consecuencias

- Un permiso quitado o un usuario desactivado dejan de valer en la próxima
  solicitud, sin esperar a que venza ningún token.
- **Riesgo aceptado de V1** (decidido por Emanuel el 2026-10-06): no se
  guardan las firmas vistas, así que una solicitud capturada se puede repetir
  dentro de los 300 s. Con capacidades de solo lectura eso repite una
  consulta y nada más. **Cuando exista una capacidad que escriba, esto NO
  alcanza**: hará falta idempotencia y protección contra repetición antes de
  habilitarla.
- **Cerrado en la tanda 2: el vínculo.** Ni el secreto de la aplicación ni un
  `usuarioId` alcanzan: la persona tiene que haber autorizado a Azul Chat desde
  su sesión del ERP (`POST /api/integraciones/azul-chat/vinculo/autorizar`), que
  le muestra una vez un código al azar; el ERP guarda solo su SHA-256 en
  `VinculoIntegracion`. Azul Chat manda `delegacion: { usuarioId, vinculo }` y
  la puerta exige un vínculo vigente, de esta aplicación, cuyo dueño sea ese
  `usuarioId`. El vínculo es una condición MÁS: no reemplaza permiso, actividad
  ni alcance, que se siguen releyendo en cada consulta.
- **Quién autoriza y quién revoca.** Autoriza solo la persona, para sí misma:
  el código se le muestra a quien autoriza, así que autorizar por otro sería
  quedarse con su identidad. Revoca la persona misma, o quien hoy puede darla
  de baja (`autorizarGestionUsuarios` + `dentroDeAlcance`, la regla de
  `/api/usuarios/eliminar/[id]`): revocar corta menos que dar de baja.
  Revocar es el rollback: el vínculo no se borra ni se edita, lo garantiza un
  trigger.
- **Admin global:** sin local fijo consulta cualquier grupo y local que el ERP
  le deja elegir; con local fijo, el grupo de ese local. Confirmado por
  Emanuel el 2026-10-06: Azul Chat no tiene un modelo territorial propio.
- Falta la ruta HTTP externa. Cuando exista, le pasa a
  `atenderSolicitudAzulChat` las cabeceras y el cuerpo crudo y devuelve
  `status` y `cuerpo` tal cual.

## Evidencia

- `lib/integraciones/azul-chat/` y `lib/integraciones/vinculos/`, con sus
  candados `*.test.mjs`.
- `prisma/migrations/20261006120000_vinculo_integracion/migration.sql`.
- `scripts/pruebas-db/azulChatVentasResumen.mjs`: la integración contra el
  handler real del reporte en PostgreSQL, con ventas creadas por
  `/api/pos-ventas/crear`, una corrección por su ruta y una anulación por
  `revertirVenta`.
- `lib/ventas/filtroVentaComercial.test.mjs`, candado 5-13.bis: el envoltorio
  del filtro tiene que devolver `whereVentaComercial(...)`.
