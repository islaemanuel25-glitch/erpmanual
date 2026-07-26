// lib/rbac/registry.js

export const PERMISSION_REGISTRY = [
    // Productos
    { code: "productos.ver", label: "Ver productos", group: "productos", order: 10, deprecated: false },
    { code: "productos.crear", label: "Crear productos", group: "productos", order: 20, deprecated: false },
    { code: "productos.editar", label: "Editar productos", group: "productos", order: 30, deprecated: false },
    { code: "productos.eliminar", label: "Eliminar productos", group: "productos", order: 40, deprecated: false },
    { code: "productos.importar", label: "Importar productos", group: "productos", order: 50, deprecated: false }, // NUEVO
  
    // Clientes
    { code: "clientes.ver", label: "Ver clientes", group: "clientes", order: 10, deprecated: false },
    { code: "clientes.crear", label: "Crear clientes", group: "clientes", order: 20, deprecated: false },
    { code: "clientes.editar", label: "Editar clientes", group: "clientes", order: 30, deprecated: false },
    { code: "clientes.eliminar", label: "Eliminar clientes", group: "clientes", order: 40, deprecated: false },
  
    { code: "clientes.puntos.ver", label: "Ver puntos", group: "clientes", order: 50, deprecated: false }, // NUEVO
    { code: "clientes.puntos.canjear", label: "Canjear puntos", group: "clientes", order: 60, deprecated: false }, // NUEVO
  
    { code: "clientes.cc.ver", label: "Ver cuenta corriente", group: "clientes", order: 70, deprecated: false }, // NUEVO
    { code: "clientes.cc.pagar", label: "Registrar pagos cuenta corriente", group: "clientes", order: 80, deprecated: false }, // NUEVO
    { code: "clientes.cc.ajustar", label: "Ajustar cuenta corriente", group: "clientes", order: 90, deprecated: false }, // NUEVO
  
    // Stock
    { code: "stock.ver", label: "Ver stock", group: "stock", order: 10, deprecated: false },
    { code: "stock.editar", label: "Editar stock", group: "stock", order: 20, deprecated: false }, // NUEVO
  
    // Transferencias
    { code: "transferencias.ver", label: "Ver transferencias", group: "transferencias", order: 5, deprecated: false },
    { code: "transferencias.crear", label: "Crear transferencias", group: "transferencias", order: 10, deprecated: false },
    { code: "transferencias.recibir", label: "Recibir transferencias", group: "transferencias", order: 20, deprecated: false },
    { code: "transferencias.cancelar", label: "Cancelar transferencias", group: "transferencias", order: 30, deprecated: false },
  
    // POS
    { code: "pos.usar", label: "Usar POS", group: "pos", order: 10, deprecated: false },
    { code: "pos.anular", label: "Anular venta", group: "pos", order: 20, deprecated: false },
    { code: "turnos.ver_todos", label: "Ver turnos de todo el local", group: "pos", order: 30, deprecated: false },
    { code: "precios.editar_manual", label: "Editar precio manual en venta", group: "pos", order: 40, deprecated: false },
    { code: "precios.usar_lista_costo", label: "Usar lista a costo en venta", group: "pos", order: 50, deprecated: false },
    { code: "precios.cambiar_lista_en_venta", label: "Cambiar lista de precios durante la venta", group: "pos", order: 60, deprecated: false },

    // Listas de Precios Comerciales
    { code: "listas_precios.ver", label: "Ver listas de precios", group: "listas_precios", order: 10, deprecated: false },
    { code: "listas_precios.crear", label: "Crear listas de precios", group: "listas_precios", order: 20, deprecated: false },
    { code: "listas_precios.editar", label: "Editar listas de precios", group: "listas_precios", order: 30, deprecated: false },
    { code: "listas_precios.eliminar", label: "Eliminar listas de precios", group: "listas_precios", order: 40, deprecated: false },
  
    // Pedidos
    { code: "pedidos.ver", label: "Ver pedidos", group: "pedidos", order: 10, deprecated: false },
    { code: "pedidos.editar", label: "Editar pedidos", group: "pedidos", order: 20, deprecated: false },
    { code: "pedidos.solicitar", label: "Solicitar pedidos", group: "pedidos", order: 30, deprecated: false },
  
    // POS Transferencias
    { code: "pos_transferencias.ver", label: "Ver POS transferencias", group: "pos_transferencias", order: 10, deprecated: false },
    { code: "pos_transferencias.enviar", label: "Enviar POS transferencias", group: "pos_transferencias", order: 20, deprecated: false },
  
    // Compras
    { code: "compras.crear", label: "Crear compras", group: "compras", order: 10, deprecated: false },
    { code: "compras.ver", label: "Ver compras", group: "compras", order: 20, deprecated: false },
    { code: "compras.recibir", label: "Recibir compras", group: "compras", order: 30, deprecated: false }, // NUEVO
  
    // Proveedores
    { code: "proveedores.ver", label: "Ver proveedores", group: "proveedores", order: 10, deprecated: false },
  
    // Usuarios
    { code: "usuarios.ver", label: "Ver usuarios", group: "usuarios", order: 10, deprecated: false },
    { code: "usuarios.editar", label: "Editar usuarios", group: "usuarios", order: 20, deprecated: false },
    { code: "usuarios.eliminar", label: "Eliminar usuarios", group: "usuarios", order: 30, deprecated: false },
    { code: "usuarios.gestionar", label: "Gestionar operadores", group: "usuarios", order: 40, deprecated: false },
    // Alta/baja/edición de usuarios ACOTADA al local propio (session.localId). No permite
    // asignar Admin ni roles con "*", ni tocar usuarios de otro local. Ver DUEÑO_LOCAL.
    { code: "usuarios.gestionar_local", label: "Gestionar usuarios del local", group: "usuarios", order: 50, deprecated: false }, // NUEVO
  
    // Roles
    { code: "roles.editar", label: "Editar roles", group: "roles", order: 10, deprecated: false },
  
    // Reportes
    { code: "reportes.ver", label: "Ver reportes", group: "reportes", order: 10, deprecated: false },
    { code: "auditoria.ver", label: "Ver bitácora de auditoría", group: "reportes", order: 20, deprecated: false },
    // Ver costos y rentabilidad (desbloquea secciones de costo hoy limitadas a admin), con scope de local.
    { code: "costos.ver", label: "Ver costos y rentabilidad", group: "reportes", order: 30, deprecated: false }, // NUEVO

    // Configuración por local (granular: cada crítica separada). Toda escritura valida
    // que el local modificado sea session.localId para un no-admin (ajeno -> 403).
    { code: "config_local.ticket", label: "Configurar ticket e impresión del local", group: "config_local", order: 10, deprecated: false }, // NUEVO
    { code: "config_local.fidelidad", label: "Configurar fidelidad/puntos del local", group: "config_local", order: 20, deprecated: false }, // NUEVO
    { code: "config_local.stock", label: "Configurar venta sin stock del local", group: "config_local", order: 30, deprecated: false }, // NUEVO
    { code: "config_local.pos", label: "Configurar reglas POS del local (cliente obligatorio)", group: "config_local", order: 40, deprecated: false }, // NUEVO
    { code: "config_local.operadores", label: "Gestionar operadores del local", group: "config_local", order: 50, deprecated: false }, // NUEVO
    { code: "config_local.alertas", label: "Configurar alertas del local", group: "config_local", order: 60, deprecated: false }, // NUEVO
    { code: "config_local.apariencia", label: "Configurar apariencia institucional del local", group: "config_local", order: 70, deprecated: false }, // NUEVO

    // Módulos
    // LEGACY / INCONSISTENTE: este permiso NO participa del bypass de operario.
    // El gate backend (lib/operador.js) nunca lo honró — solo exime a Admin ("*")
    // y a DUEÑO_LOCAL en su local (esDuenoLocal). El frontend tampoco lo usa más
    // (ver lib/operador-exencion.js). Se conserva en el catálogo para no romper
    // roles existentes que pudieran tenerlo, pero otorgarlo NO habilita operar
    // sin operario. Pendiente: retirarlo en una limpieza futura del catálogo.
    { code: "modulos.acceso_sin_operador", label: "Acceder sin operador activo (LEGACY, sin efecto)", group: "modulos", order: 10, deprecated: false },
  ];
  
  /**
   * Legacy export: mantiene el mismo shape que espera ModalRol.jsx
   * { grupo: string[] }
   */
  export const PERMISOS = PERMISSION_REGISTRY.reduce((acc, p) => {
    if (p.deprecated) return acc;
    if (!acc[p.group]) acc[p.group] = [];
    acc[p.group].push(p.code);
    return acc;
  }, {});
  
  export function getAllPermissionCodes() {
    return PERMISSION_REGISTRY.filter((p) => !p.deprecated).map((p) => p.code);
  }