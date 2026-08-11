# Antes de desplegar el módulo de comprobante — qué cambia y qué no

**Rango:** `f79cdaf..7dcb5c4`, 13 commits, 31 archivos.
**Migraciones:** 84 → 87.
**Escrito el 2026-08-11**, antes de desplegar, a pedido de Emanuel: *"es mucho
commit acumulado y nadie lo vio funcionando junto"*.

La pregunta que contesta este documento es una sola: **qué cambia para alguien
que abre el sistema mañana a la mañana.** La respuesta corta es *nada visible*, y
abajo está cómo se comprobó cada parte. Lo que no se pudo comprobar también está
dicho.

## Lo que se midió, no lo que se supone

### 1. Ninguna pantalla cambia

Cero archivos tocados en `app/modulos/` y en `components/`. Enumerado con
`git diff --name-only f79cdaf..HEAD -- "app/modulos/**" "components/**"`, que
devolvió vacío.

No es un argumento de lectura: si ningún archivo de pantalla cambió, ninguna
pantalla se ve distinta.

### 2. Una sola ruta de API cambia, y viene apagada

`app/api/compras-proveedor/recibir/[id]/route.js` es la única. Lo que se le
agregó es la frontera entre recibir mercadería y escribir el costo, y **está
apagada salvo que el cliente la encienda**:

- Con `fronteraCostoActiva` ausente —que es el caso—, la decisión es
  `!costosExcluidos.has(id)`, y `costosExcluidos` sale de un campo del cuerpo que
  nadie manda, así que arranca vacío. Resultado: escribe siempre, igual que hoy.
- La pantalla de compras actual **no manda ninguno de los cuatro campos nuevos**.
  Comprobado con `grep -c` sobre `app/modulos/compras-proveedor/[id]/page.jsx`
  buscando `fronteraCostoActiva|costosExcluidos|costosAceptados|umbralRevisarPct`:
  **0 apariciones**.

Lo único que la respuesta trae de más es `decisionesDeCosto`, un campo nuevo que
la pantalla de hoy no lee. Un campo de más en un JSON no rompe a quien lo ignora.

### 3. El rechazo de cantidades negativas no se alcanza desde la pantalla

Es el único cambio de la ruta que **sí** altera una respuesta: antes una cantidad
negativa se convertía en cero en silencio, ahora devuelve 400.

Desde la pantalla no se puede llegar. La cantidad está topada en cuatro lugares
—`Math.max(0, …)` al escribir, al salir del campo, y en el botón de restar, más
un `min="0"`— en las dos vistas, escritorio y móvil. Para ver ese 400 hay que
armar el pedido a mano.

**Sigue siendo un cambio de comportamiento**, y por eso está acá y no escondido:
si alguien tiene un script propio que postea negativos esperando que se
conviertan en cero, ese script ahora falla. No sabemos de ninguno.

### 4. Las migraciones: dos aditivas y una que solo agrega

- `20260811120000_umbrales_costo_por_proveedor` — dos columnas **nulables** en
  `Proveedor`. La versión vieja las ignora.
- `20260811150000_recepcion_por_comprobante` — tres tablas nuevas
  (`RecetaProveedor`, `ComprobanteProveedor`, `ComprobanteLinea`). Los únicos
  `ALTER TABLE` son las claves foráneas **de esas mismas tablas nuevas**;
  ninguna tabla existente se modifica.
- `20260811180000_permisos_revisar_y_comprobantes` — **el clasificador la marca
  como NO ADITIVA**, y tiene razón en marcarla: es un `UPDATE` sobre `Rol`. Ver
  abajo.

### 5. El `UPDATE` de permisos, mirado de verdad

Lo que hace es agregar dos strings al arreglo `permisos` de `DUEÑO_LOCAL` y
`ENCARGADO`. No borra, no reemplaza, y es idempotente: solo toca los roles que
todavía no los tienen.

La pregunta que importa no es qué hace la migración, sino **qué le hace la
versión vieja a un rol que ya los tiene**, porque durante la ventana entre migrar
y recrear la imagen vieja sigue atendiendo. Se comprobó ejecutando, contra el
`lib/rbac/registry.js` de `f79cdaf` sacado con `git show`:

- La imagen que corre conoce **59 permisos**, y ninguno de los dos nuevos.
- `checkPerm` solo pregunta si un código está en el arreglo. Un código que la
  versión vieja nunca consulta es inerte.
- El riesgo real era otro: que abrir y guardar un rol en la versión vieja
  **descartara** los permisos que no conoce. No pasa. `components/roles/ModalRol.jsx`
  carga `initialData.permisos` tal cual y devuelve `form.permisos` sin filtrar
  contra el catálogo. Los dos códigos nuevos **no se dibujan como casilla**
  —quedan invisibles— pero **sobreviven al guardado**.

Invisible y conservado es el resultado bueno. Lo que había que descartar era
"invisible y borrado", y no ocurre.

### 6. El interceptor de auditoría

`lib/auditoria/interceptor.js` suma dos entradas a la lista blanca y dos al mapa
de dominios, todas con clave de modelo nuevo. Ninguna clave existente cambia, y
como las tablas nuevas arrancan vacías, esas ramas no se ejecutan.

### 7. `systemRoles.js` no repisa nada

Los permisos que se movieron a `ENCARGADO_PERMISOS` son el **default de
creación**. El seed no repisa un rol que ya existe —está escrito en el
encabezado del archivo— así que en producción, donde los roles ya existen, quien
los cambia es la migración, no el seed.

## Entonces, qué cambia mañana

Para alguien que abre el sistema y trabaja normal: **nada**. Vende, recibe
mercadería, mira reportes exactamente igual.

Lo que sí es distinto, y ninguna de las tres se cruza en el camino de nadie:

1. En la pantalla de roles aparecen **dos casillas nuevas**, "Revisar lo
   recibido" y "Ver fotos de comprobantes", ya tildadas para dueño y encargado.
2. La respuesta de recibir trae un campo más que nadie lee todavía.
3. El log del contenedor gana una línea al arrancar, `[comprobantes] …`, que va a
   decir que el almacén **no está disponible** hasta que se corra el runbook del
   volumen. Es correcto que lo diga: todavía no está montado.

## Lo que este documento NO prueba

- **Nadie lo vio funcionando junto en producción.** Lo que hay son 2803 candados
  en verde, un `npm run build` limpio y el servidor standalone levantado a mano
  tres veces. Eso no es lo mismo que tráfico real.
- **El módulo de comprobante no tiene pantalla todavía**, así que su código está
  desplegado pero no se ejerce desde ningún lado. Es a propósito: se despliega
  ahora para que el chequeo del volumen esté adentro de la imagen cuando se corra
  el runbook.
- **No se pudo contar cuántos roles toca en producción.** No hay acceso a esa
  base y no se pide. Sobre la copia local `erpazul_al` la migración resultó
  idempotente —dos filas la primera vez, cero la segunda—, y eso es un indicio,
  no la medición de producción.
