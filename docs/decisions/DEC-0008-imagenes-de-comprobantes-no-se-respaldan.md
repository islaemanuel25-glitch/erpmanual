# DEC-0008 — Las imágenes de comprobantes viven siete días y NO se respaldan

**Estado:** Vigente

**Fecha:** 2026-08-11

## Contexto

El módulo de recepción por comprobante guarda la foto de cada comprobante para poder
conciliarla contra el pedido. Esas fotos necesitan un lugar, y el proyecto no
tenía ninguno: escribir en el disco del contenedor las pierde al recrearlo, y eso
ya estaba documentado desde la importación de listas, cuyo campo de ubicación de
archivo quedó en `null` todo este tiempo por el mismo motivo.

## Decisión

**Las fotos van a un volumen del VPS y viven siete días desde que se suben.**

- Cada foto vence por su cuenta, a los siete días de SU subida.
- Un proceso diario borra las vencidas. **No hay borrado en bloque:** una foto de
  ayer no se va junto con una de la semana pasada.
- Confirmar la recepción **no** adelanta el borrado.
- **El volumen NO entra en el backup del VPS.**

## Motivo

Respaldar algo que se borra a los siete días por diseño sería guardar lo que ya
decidimos tirar. El backup existe para lo que tiene que sobrevivir; la foto de
un comprobante, explícitamente, no.

Lo que sí sobrevive es **lo que se leyó de esa foto**: número, fecha, líneas,
cantidades, precios, impuestos y totales quedan en la base, y la base sí se
respalda. Se pierde la imagen, no la información.

## La consecuencia, que está aceptada

**Si nadie baja el paquete de comprobantes, las fotos se pierden y no hay vuelta.**

No es un descuido ni un pendiente: es lo que se eligió. Está escrito acá y en
`lib/compras-proveedor/comprobante/retencionImagen.js` para que nadie "arregle"
el backup agregándole el volumen sin entender por qué no estaba.

Para bajar el riesgo hay dos cosas, y ninguna es un respaldo automático:

- **El paquete de comprobantes es propio y separado del backup de la base**, y se
  puede descargar cuando uno quiera, sin esperar ningún aviso.
- **La campana de notificaciones avisa** cuando hay fotos por vencer, con un solo
  cartel —sin escalones— que lo ven el dueño y el administrador, y que ofrece
  descargar el paquete de la semana. El mismo cartel dice **cuánto está
  ocupando** el volumen: no hay tope de tamaño porque hoy sería un número
  inventado, y este es el modo de que la medición aparezca sola en vez de
  depender de que alguien entre al VPS a mirarla.

## Si el volumen se llena, se rechaza la subida

Decidido por Emanuel el 2026-08-11. **Nunca se borra lo más viejo para hacer
lugar.**

El motivo es el mismo que sostiene toda la ventana: siete días son una promesa, y
borrar antes de tiempo la rompe **en silencio**. El que subió una foto ayer
creería tener seis días para revisarla contra el papel y no los tendría, sin que
nada se lo diga — y se enteraría justo cuando la necesita.

Rechazar la subida también molesta, pero molesta **de frente**: quien intenta
subir se entera en el momento, con un mensaje que dice que no se guardó y que no
se borró nada, y todavía puede hacer algo. Un borrado anticipado no le avisa a
nadie.

El mensaje vive en `MOTIVO_ALMACEN.SIN_ESPACIO` y el candado que lo sostiene es
de forma: `aBorrarHoy` mira la fecha y nada más, y no tiene —ni va a tener— un
parámetro de presión. Una puerta para adelantarse, aunque nazca cerrada, es la
que alguien abre el día que el disco esté al 95 %.

## Lo que esto le hace a la segunda revisión

El personal recibe y ahí entra todo: stock y costo se cargan con su okey. Después
el dueño, encargado o administrador hace una segunda revisión y corrige lo que
esté mal.

**Esa segunda revisión queda atada a la ventana de siete días.** Pasados los
siete días se pueden revisar los números —cantidades, costos, totales, todo eso
vive en la base— pero **ya no contra el papel**. Si una diferencia necesita mirar
el comprobante, hay siete días para hacerlo.

Es la contracara directa de no respaldar las imágenes, y conviene tenerla
presente al decidir cada cuánto se revisa.

## Consecuencias operativas

- Hay que crear el volumen en el VPS y **excluirlo** del backup a propósito, no
  por omisión.
- El skill `/backup` no cambia: sigue respaldando la base y nada más.
- Un incidente que necesite auditar comprobantes viejos **no va a tener las fotos**.
  Va a tener los datos.

## Relacionado

- `lib/compras-proveedor/comprobante/retencionImagen.js` — la regla, con sus
  candados en el `.test.mjs` de al lado
- `prisma/schema.prisma`, modelo `ComprobanteProveedor` — los campos `venceEn`,
  `imagenBorradaEn` y `archivoUbicacion`
- `DEC-0005-el-vps-no-construye.md` — la otra decisión de infraestructura del VPS
