-- `Usuario.sesionInvalidadaEn`: desde este instante no vale ninguna sesión de
-- la cuenta emitida antes.
--
-- ── POR QUÉ ───────────────────────────────────────────────────────────────
--
-- La sesión de la cuenta vencía a las 8 horas, y una Sunmi prendida más que eso
-- pedía el mail y la contraseña en plena venta. Desde ahora no vence por reloj:
-- dura hasta que el usuario cierra sesión, y la valida el servidor contra la
-- base en cada pedido (`proxy.js`): el usuario existe, está activo y la sesión
-- se emitió después de esta marca. Cambiarle la contraseña escribe la marca, y
-- con eso sus sesiones viejas quedan afuera en todos los dispositivos.
--
-- ── QUÉ HACE ──────────────────────────────────────────────────────────────
--
-- Una columna nula, sin relleno: las sesiones vigentes al desplegar siguen
-- valiendo. No borra ni modifica ninguna fila.

ALTER TABLE "Usuario" ADD COLUMN "sesionInvalidadaEn" TIMESTAMP(3);
