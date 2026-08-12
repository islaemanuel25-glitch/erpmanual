# INC-0004 — El comprobante de Mauro no es una factura, y por eso no puede cerrar

**Fecha:** 2026-08-12
**Estado:** cerrado el 2026-08-12 (`7368fa3`), con un hallazgo grave adentro
**Alcance:** módulo de recepción por comprobante, primer intento de cierre completo

## Qué pasó

Después de desplegar `6a105c4` se cargó la receta de Mauro y se releyó su
comprobante —el único que hay en producción— para ver si cerraba. No cierra, y
la causa no es la receta.

**El papel no tiene total impreso.** Mirando la foto real
(`/vol/comprobantes/Mauro_0_0_1_p1.jpg`, 6,2 MB), lo que hay es una **planilla
de pedido**: una grilla con nombre de producto, precio unitario, cantidad e
importe, y nada más. No tiene número, ni CUIT, ni neto, ni IVA, ni total. El
lector devolvió `total: 0` y `neto: 0` porque **no hay** total ni neto que leer,
no porque se equivocara.

La verificación aritmética compara la suma de las líneas contra el pie. Sin pie
no hay contra qué comparar, así que el comprobante queda en `MAL_LEIDO` de forma
permanente — y `puedeAceptarse` bloquea aceptar precios de un comprobante que no
cierra. **Con este documento, aceptar no se puede probar.**

## La corrección de un dato que quedó escrito mal

La migración `20260812040000_receta_mauro` justifica la receta diciendo que "la
suma de las líneas es 3.774.700 y el total impreso al pie es 3.776.700". **Ese
total no existe en el papel.** Salió de un análisis anterior de esta misma
sesión y no se verificó contra la foto hasta ahora.

La migración **no se edita**: ya está aplicada y Prisma guarda su checksum;
tocarla rompería el próximo `migrate deploy`. La corrección vive acá.

La conclusión de la receta —que el precio de cada línea ya es el final, sin IVA
que agregarle— **sigue siendo correcta**, pero por otra evidencia: en las 31
filas del papel el importe es exactamente cantidad × precio unitario, sin
ninguna columna de impuesto. Verificado en tres al azar: 40 × 3.360 = 134.400;
130 × 2.250 = 292.500; 200 × 3.650 = 730.000.

Y **los 2.000 pesos de residuo nunca existieron**: eran la diferencia contra ese
total inventado.

## El conteo de renglones funciona, y su aviso es un falso positivo acá

El control nuevo hizo exactamente lo que se le pidió y acertó: informó **31
renglones en el papel**, y el papel tiene 31 filas de producto. Contadas una por
una sobre la foto.

Pero avisó que "faltan 10", y no falta ninguna. **Diez de esas 31 filas están en
cero**: producto listado, cantidad vacía, importe $0 —PHILIPS MORRIS CONV 10,
PHILIPS SELECT CONV KS, CHESTERFIELD 20 UVA BOX, MARLBORO 20 GOLD, las tres
FUSION SANDIA/MENTOLADO/TITANIUM RED, TITANIUM BLUE, TITANIUM GOLD SLIMS y
M.CRAFTED 20 SUAVE KS—. El lector transcribió las 21 que tienen cantidad, que es
lo correcto.

O sea: el control compara "renglones que veo" contra "renglones que transcribí",
y en una planilla de pedido esos dos números **legítimamente difieren**. La
pregunta del prompt tiene que ser más precisa: cuántos renglones **con cantidad**
hay, no cuántas filas tiene la grilla.

Es un falso positivo con consecuencia real: el aviso sale en rojo, arriba de
todo, diciendo que faltan renglones, sobre una lectura completa.

## Un detalle que conviene mirar

La foto está **recortada**: en el borde se lee "ECONOMICOS // EXTR…", cortado.
Puede haber otra sección de la planilla fuera del cuadro. Las 31 filas son las
que se ven; no se puede afirmar que sean todas las del papel.

## Lo que apareció al arreglarlo, y era peor

Al medir el arreglo del conteo contra el mismo papel, el modelo devolvió un
total de **3.774.700 — exactamente la suma de las 21 líneas—** sobre un papel
que no tiene renglón de total, comprobado recortando el borde de la foto. Tres
corridas seguidas, las tres cerrando con diferencia cero y estado `CARGADO`.

La causa estaba en el esquema de salida: `total` y `neto` eran **campos
obligatorios**. Obligado a poner un número donde no hay ninguno, el modelo pone
el más plausible, y el más plausible es la suma. Con eso la verificación compara
la suma contra sí misma: **cierra siempre**. El candado central del módulo
quedaba desactivado justo en los papeles donde más falta hace, y el comprobante
salía habilitado para proponer costos.

El arreglo tiene tres partes: el pie dejó de exigir `total` y `neto`; se
pregunta aparte si el papel TIENE un renglón de total impreso —un booleano no se
puede calcular sumando, que es la misma idea del conteo de renglones—; y el
booleano manda sobre el número.

Y hubo un segundo tropiezo, del mismo tipo: `lecturaUtilizable` exige un total y
devolvía un solo texto sin código, así que el papel sin total salía por el
return de "se leyó mal" **antes** de llegar a su estado nuevo. Los candados no lo
vieron porque armaban el pie con `total: 0`, que sí pasa esa puerta; el modelo,
sin la obligación, omite el campo entero. **La forma del dato de prueba tiene que
ser la forma del dato real.**

## Medición de cierre

Tres corridas contra el mismo papel, con `7368fa3` en producción: renglones que
dice ver **21**, transcriptas **21**, **ningún** aviso, estado **SIN_TOTAL**,
propone costos **false**, total **omitido**, y el booleano en **false**.

## Lo que se decidió y se hizo

Las dos cosas, autorizadas por Emanuel el 2026-08-12:

1. **Estado propio para el documento sin total** (`SIN_TOTAL`). Dice que no trae
   total, que por eso no se puede verificar, y que no se propone ningún costo. No
   acusa al lector, y deja abierta la otra posibilidad —que el total exista y no
   se haya leído— porque desde los números no se distingue.
2. **El conteo pasa a contar los renglones CON CANTIDAD.** Medido contra este
   mismo papel: 21 contra 21, sin aviso.

Queda sin resolver una sola cosa, y es de datos y no de código: **para probar el
flujo de aceptar precios hace falta un comprobante con total impreso.** Con esta
planilla no se puede, por diseño.
