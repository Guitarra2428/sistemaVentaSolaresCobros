const app = document.querySelector("#app");

const state = {
  user: JSON.parse(localStorage.getItem("svs_user") || "null"),
  token: localStorage.getItem("svs_token") || null,
  permisos: JSON.parse(localStorage.getItem("svs_permisos") || "[]"),
  view: "panel",
  tab: "clientes",
  cobrosTab: "cobrar",
  reportesTab: "ventas",
  reportesResult: null,
  clientesFilter: "",
  data: null
};

function persistSession(user, token, permisos) {
  state.user = user;
  state.token = token;
  state.permisos = permisos || [];
  localStorage.setItem("svs_user", JSON.stringify(user));
  localStorage.setItem("svs_token", token);
  localStorage.setItem("svs_permisos", JSON.stringify(state.permisos));
}

function clearSession() {
  state.user = null;
  state.token = null;
  state.permisos = [];
  state.data = null;
  localStorage.removeItem("svs_user");
  localStorage.removeItem("svs_token");
  localStorage.removeItem("svs_permisos");
}

function can(permiso) {
  if (!state.user) return false;
  if (state.user.rol === "Administrador") return true;
  if (!permiso) return true;
  return state.permisos.includes(permiso);
}

function canAny(...permisos) {
  return permisos.some((p) => can(p));
}

const money = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" });
const fmtMoney = (v) => money.format(Number(v || 0));

function fmtDate(value) {
  if (!value) return "";
  return new Date(`${value}`.slice(0, 10) + "T00:00:00").toLocaleDateString("es-DO");
}

function fmtDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("es-DO");
}

function pctLabel(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

const byId = (id) => document.getElementById(id);

const escapeHtml = (unsafe) =>
  String(unsafe ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function labelStatus(status) {
  const red = ["En mora", "Vencida", "Anulada", "Cancelado", "Anulado"];
  const warn = ["Pendiente de inicial", "Bloqueado", "Pendiente", "Parcialmente pagada", "Reservado"];
  const blue = ["Activo", "Registrado", "Saldado", "Pagada"];
  const klass = red.includes(status) ? "red" : warn.includes(status) ? "warn" : blue.includes(status) ? "blue" : "gray";
  return `<span class="pill ${klass}">${escapeHtml(status)}</span>`;
}

// ---------- Toasts ----------
function ensureToastRoot() {
  let root = byId("toastRoot");
  if (!root) {
    root = document.createElement("div");
    root.id = "toastRoot";
    root.className = "toast-container";
    document.body.appendChild(root);
  }
  return root;
}

function toast(message, kind = "info", timeout = 4000) {
  const root = ensureToastRoot();
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.innerHTML = `<span>${escapeHtml(message)}</span><button aria-label="Cerrar">×</button>`;
  el.querySelector("button").addEventListener("click", () => el.remove());
  root.appendChild(el);
  if (timeout > 0) setTimeout(() => el.remove(), timeout);
}

// ---------- Modal ----------
function openModal({ title, body, submitLabel = "Confirmar", cancelLabel = "Cancelar", onSubmit, danger = false, wide = false }) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal ${wide ? "modal-wide" : ""}">
      <header class="modal-head">
        <h3>${escapeHtml(title)}</h3>
        <button class="modal-close" aria-label="Cerrar">×</button>
      </header>
      <form class="modal-body">
        ${body}
        <footer class="modal-foot">
          <button type="button" class="btn secondary" data-role="cancel">${escapeHtml(cancelLabel)}</button>
          <button type="submit" class="btn ${danger ? "danger" : ""}" data-role="submit">${escapeHtml(submitLabel)}</button>
        </footer>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.querySelector('[data-role="cancel"]').addEventListener("click", close);
  const form = backdrop.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = backdrop.querySelector('[data-role="submit"]');
    const data = Object.fromEntries(new FormData(form));
    await withLoading(btn, "Procesando…", async () => {
      try {
        await onSubmit(data);
        close();
      } catch (err) {
        toast(humanErrorMessage(err), "error", 6000);
      }
    });
  });
  return close;
}

/**
 * Modal solo-lectura: sin form, botón único "Cerrar". Para vistas de detalle.
 * `extraFooter` permite añadir botones adicionales (ej. "Imprimir").
 */
function openViewModal({ title, body, wide = true, extraFooter = "", printable = false }) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal ${wide ? "modal-wide" : ""} ${printable ? "modal-printable" : ""}">
      <header class="modal-head">
        <h3>${escapeHtml(title)}</h3>
        <button class="modal-close" aria-label="Cerrar">×</button>
      </header>
      <div class="modal-body">
        <div class="modal-view-content">${body}</div>
        <footer class="modal-foot">
          ${extraFooter}
          <button type="button" class="btn secondary" data-role="close">Cerrar</button>
        </footer>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.querySelector('[data-role="close"]').addEventListener("click", close);
  return { close, root: backdrop };
}

// ---------- API ----------
class ApiError extends Error {
  constructor(payload, status) {
    super(payload.error || `Error ${status}`);
    this.status = status;
    this.code = payload.code;
    this.details = payload.details;
    this.detail = payload.detail;
  }
}

// Lock anti-double-submit: rechaza mutaciones idénticas concurrentes (mismo METHOD + PATH).
// Los GET se pueden repetir libremente porque son idempotentes.
const inFlight = new Set();

async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isMutation = method !== "GET";
  const key = `${method} ${path}`;

  if (isMutation && inFlight.has(key)) {
    throw new ApiError({ error: "Ya hay una operación idéntica en curso, espera unos segundos" }, 429);
  }
  if (isMutation) inFlight.add(key);

  try {
    const headers = { "Content-Type": "application/json" };
    if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
    const response = await fetch(path, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearSession();
      renderLogin(payload.error || "Sesión expirada");
      throw new ApiError(payload, 401);
    }
    if (!response.ok) throw new ApiError(payload, response.status);
    return payload;
  } finally {
    if (isMutation) inFlight.delete(key);
  }
}

function humanErrorMessage(err) {
  if (err instanceof ApiError) {
    if (Array.isArray(err.details) && err.details.length) {
      return err.details.map((d) => `${d.path}: ${d.message}`).join(" · ");
    }
    if (err.detail) return `${err.message} (${err.detail})`;
    return err.message;
  }
  return err && err.message ? err.message : "Error desconocido";
}

async function load() {
  if (!state.user || !state.token) {
    renderLogin();
    return;
  }
  try {
    const payload = await api("/api/bootstrap");
    persistSession(payload.user, state.token, payload.permisos);
    state.data = payload.data;
    if (!isViewAllowed(state.view)) state.view = firstAllowedView();
    // Si la contraseña debe cambiarse, forzar modal antes de mostrar el shell.
    if (state.user && state.user.passwordDebeCambiar) {
      renderShell();
      openCambiarPasswordModal(true);
      return;
    }
    renderShell();
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) {
      toast(`No se pudo cargar el sistema: ${humanErrorMessage(err)}`, "error", 6000);
    }
  }
}

// ---------- Login ----------
function renderLogin(error = "") {
  app.innerHTML = `
    <section class="login">
      <div class="login-panel">
        <p class="label">Administración inmobiliaria</p>
        <h1 class="brand">Venta de solares y cobros</h1>
        <p class="hint">Controla clientes, solares, ventas, contratos, cuotas, mora congelada y recibos desde una sola consola operativa.</p>
        <form class="form" id="loginForm" autocomplete="on">
          <label class="field"><span>Usuario</span><input name="usuario" autocomplete="username" required></label>
          <label class="field"><span>Contraseña</span><input name="password" type="password" autocomplete="current-password" required></label>
          <button class="btn" type="submit" id="loginSubmit">Entrar</button>
          <div class="error">${escapeHtml(error)}</div>
        </form>
      </div>
      <div class="login-visual"></div>
    </section>
  `;
  byId("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const btn = byId("loginSubmit");
    withLoading(btn, "Ingresando…", async () => {
      try {
        const payload = await api("/api/login", { method: "POST", body: JSON.stringify(form) });
        persistSession(payload.user, payload.token, payload.permisos);
        await load();
      } catch (err) {
        renderLogin(humanErrorMessage(err));
      }
    });
  });
}

// ---------- Vistas y permisos ----------
const VIEWS = [
  { id: "panel",     text: "Panel",         perm: null },
  { id: "catalogos", text: "Catálogos",     perm: null },
  { id: "ventas",    text: "Ventas",        perm: null },
  { id: "cobros",    text: "Cobros",        perm: null },
  { id: "reportes",  text: "Reportes",      perm: null },
  { id: "config",    text: "Configuración", perm: "configurar_parametros" }
];

function isViewAllowed(id) {
  const v = VIEWS.find((x) => x.id === id);
  if (!v) return false;
  return can(v.perm);
}
function firstAllowedView() {
  return VIEWS.find((v) => can(v.perm)).id;
}
function allowedViews() {
  return VIEWS.filter((v) => can(v.perm));
}

function renderShell() {
  const views = allowedViews();
  app.innerHTML = `
    <section class="shell">
      <aside class="sidebar">
        <h1>Solares<br>Cobros</h1>
        <nav class="nav">
          ${views.map((v) => `<button data-view="${v.id}" class="${state.view === v.id ? "active" : ""}">${v.text}</button>`).join("")}
        </nav>
        <div class="userbox">
          <strong>${escapeHtml(state.user.nombre)}</strong><br>
          ${escapeHtml(state.user.rol)}<br><br>
          <button class="btn secondary btn-sm" id="btnCambiarPassword" style="margin-bottom:6px;">Cambiar contraseña</button>
          <button class="btn secondary" id="logout">Salir</button>
        </div>
      </aside>
      <section class="content" id="content"></section>
    </section>
  `;
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      renderShell();
    });
  });
  byId("logout").addEventListener("click", () => {
    clearSession();
    renderLogin();
  });
  const btnCambPwd = byId("btnCambiarPassword");
  if (btnCambPwd) btnCambPwd.addEventListener("click", () => openCambiarPasswordModal(false));
  renderView();
}

function renderView() {
  const content = byId("content");
  const renderer = {
    panel: renderDashboard,
    catalogos: renderCatalogs,
    ventas: renderSales,
    cobros: renderCollections,
    reportes: renderReports,
    config: renderConfig
  }[state.view];
  content.innerHTML = renderer();
  bindView();
}

function renderHeader(title, action = "") {
  return `
    <div class="topbar">
      <div>
        <p class="label">Sistema Administración Venta Solares</p>
        <h2>${escapeHtml(title)}</h2>
      </div>
      <div class="actions">${action}</div>
    </div>
  `;
}

function metric(label, value) {
  return `<div class="card metric"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

// ---------- Panel ----------
function renderDashboard() {
  const d = state.data;
  const contratosActivos = d.contratos.filter((item) => item.estado === "Activo").length;
  const contratosSaldados = d.contratos.filter((item) => item.estado === "Saldado").length;
  const balance = d.contratos.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const cobradoHistorico = d.cobros
    .filter((cb) => cb.estado === "Registrado")
    .reduce((sum, cb) => sum + Number(cb.montoTotal || 0), 0);

  // F5: vencimientos próximos (7 días)
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const en7 = new Date(hoy); en7.setDate(en7.getDate() + 7);
  const vencProx = d.cuotas
    .filter((q) => ["Pendiente", "Parcialmente pagada", "Vencida"].includes(q.estado) && q.balancePendiente > 0)
    .map((q) => ({ ...q, venc: new Date(String(q.fechaVencimiento).slice(0, 10) + "T00:00:00") }))
    .filter((q) => q.venc <= en7)
    .sort((a, b) => a.venc - b.venc)
    .slice(0, 15);
  const puedeGenerarMora = canAny("ajustar_anular_mora"); // admin/gerente por matriz
  const action = puedeGenerarMora
    ? `<button class="btn warning" id="generateLateFees">Generar mora diaria</button>`
    : "";
  return `
    ${renderHeader("Panel principal", action)}
    <section class="grid">
      ${metric("Clientes activos", d.clientes.filter((i) => i.estado === "Activo").length)}
      ${metric("Solares disponibles", d.solares.filter((i) => i.estado === "Disponible").length)}
      ${metric("Contratos activos", contratosActivos)}
      ${metric("Balance cartera", fmtMoney(balance))}
    </section>
    <br>
    <section class="grid">
      <div class="card metric metric-link" data-goto-saldados="1">
        <span>Contratos saldados</span>
        <strong>${contratosSaldados}</strong>
        <small class="hint">Click para ver detalle</small>
      </div>
      ${metric("Cobrado histórico", fmtMoney(cobradoHistorico))}
      ${metric("Total ventas registradas", d.ventas.length)}
      ${metric("Solares vendidos", d.solares.filter((s) => s.estado === "Vendido").length)}
    </section>
    <br>
    <section class="layout">
      <div class="card">
        <h3 class="section-title">Próximos vencimientos (7 días)</h3>
        ${vencProx.length === 0
          ? `<p class="hint">Ninguna cuota vence en los próximos 7 días.</p>`
          : `<div class="table-wrap">${(() => {
              const canPagar = canAny("registrar_adelanto");
              const headers = ["Contrato", "Cuota", "Vence", "Pendiente"];
              if (canPagar) headers.push("");
              return table(headers, vencProx.map((q) => {
                const ct = d.contratos.find((c) => c.id === q.contratoId);
                const v = d.ventas.find((v) => ct && v.id === ct.ventaId);
                const cli = v && d.clientes.find((c) => c.id === v.clienteId);
                const row = [
                  `<button class="link-cell" data-action="view-contrato" data-id="${ct?.id}">${escapeHtml(ct?.numero || "")}${cli ? " · " + escapeHtml(cli.nombre) : ""}</button>`,
                  `#${q.numero}`,
                  fmtDate(q.fechaVencimiento),
                  fmtMoney(q.balancePendiente)
                ];
                if (canPagar) {
                  row.push(`<button class="btn btn-sm" data-action="cobrar-cuota-direct" data-contrato-id="${ct?.id}" data-cuota-id="${q.id}" data-numero="${q.numero}" data-vencimiento="${q.fechaVencimiento}" data-balance="${q.balancePendiente}">Cobrar</button>`);
                }
                return row;
              }));
            })()}</div>`}
      </div>
      <div class="card">
        <h3 class="section-title">Solares por estado</h3>
        <div class="table-wrap">${lotsTable(d.solares.slice(0, 20))}</div>
      </div>
    </section>
  `;
}

// ---------- Catálogos ----------
const CATALOG_TABS = [
  { id: "clientes",  text: "Clientes",  perm: null },
  { id: "proyectos", text: "Proyectos", perm: null },
  { id: "solares",   text: "Solares",   perm: null },
  { id: "reservas",  text: "Reservas",  perm: null }
];

function renderCatalogs() {
  if (!CATALOG_TABS.some((t) => t.id === state.tab)) state.tab = "clientes";
  return `
    ${renderHeader("Catálogos maestros")}
    <div class="tabs">
      ${CATALOG_TABS.map((t) => `<button data-tab="${t.id}" class="${state.tab === t.id ? "active" : ""}">${t.text}</button>`).join("")}
    </div>
    ${renderCatalogTab()}
  `;
}

function renderCatalogTab() {
  if (state.tab === "clientes") {
    const form = can("crear_cliente") ? `
      <div class="card">
        <h3 class="section-title">Nuevo cliente</h3>
        <form class="form" id="clientForm">
          <label class="field"><span>Nombre completo</span><input name="nombreCompleto" required minlength="2" id="clientNombreCompleto"></label>
          <label class="field"><span>Cédula/RNC</span><input name="cedulaRnc" required minlength="5" id="clientCedulaRnc"></label>
          <div id="clientDuplicateWarning" class="dup-warn" style="display:none"></div>
          <div class="two">
            <label class="field"><span>Teléfono</span><input name="telefono"></label>
            <label class="field"><span>Correo</span><input name="correo" type="email"></label>
          </div>
          <label class="field"><span>Dirección</span><input name="direccion"></label>
          <div class="two">
            <label class="field"><span>Estado civil</span><input name="estadoCivil"></label>
            <label class="field"><span>Ocupación</span><input name="ocupacion"></label>
          </div>
          <button class="btn" type="submit">Guardar cliente</button>
        </form>
      </div>` : "";
    const filtered = state.clientesFilter
      ? state.data.clientes.filter((c) => {
          const q = state.clientesFilter.toLowerCase();
          return (c.nombre || "").toLowerCase().includes(q) || (c.cedulaRnc || "").toLowerCase().includes(q);
        })
      : state.data.clientes;
    return `
      <section class="layout">${form}
      <div>
        <div class="filter-inline">
          <input type="search" id="clientesFilterInput" placeholder="Buscar por nombre o cédula…" value="${escapeHtml(state.clientesFilter)}">
          <span class="hint">${filtered.length} de ${state.data.clientes.length}</span>
        </div>
        <div class="table-wrap">${clientsTable(filtered)}</div>
      </div>
      </section>`;
  }
  if (state.tab === "proyectos") {
    const form = can("registrar_proyecto") ? `
      <div class="card">
        <h3 class="section-title">Nuevo proyecto</h3>
        <form class="form" id="projectForm">
          <label class="field"><span>Nombre</span><input name="nombre" required minlength="2"></label>
          <label class="field"><span>Ubicación</span><input name="ubicacion"></label>
          <label class="field"><span>Descripción</span><textarea name="descripcion" rows="3"></textarea></label>
          <label class="field"><span>Cantidad solares</span><input name="cantidadSolares" type="number" min="0"></label>
          <button class="btn" type="submit">Guardar proyecto</button>
        </form>
      </div>` : "";
    return `<section class="layout">${form}<div class="table-wrap">${projectsTable(state.data.proyectos)}</div></section>`;
  }
  if (state.tab === "solares") {
    const form = can("registrar_solar") ? `
      <div class="card">
        <h3 class="section-title">Nuevo solar</h3>
        <form class="form" id="lotForm">
          <label class="field"><span>Proyecto</span>${select("idProyecto", state.data.proyectos, "nombre")}</label>
          <div class="two">
            <label class="field"><span>Manzana</span><input name="manzana" required></label>
            <label class="field"><span>Número</span><input name="numeroSolar" required></label>
          </div>
          <div class="two">
            <label class="field"><span>Metros²</span><input name="metrosCuadrados" type="number" step="0.01" min="0.01" required></label>
            <label class="field"><span>Precio por metro</span><input name="precioPorMetro" type="number" step="0.01" min="0.01" required></label>
          </div>
          <label class="field"><span>Observaciones</span><textarea name="observaciones" rows="2"></textarea></label>
          <button class="btn" type="submit">Guardar solar</button>
        </form>
      </div>` : "";
    return `<section class="layout">${form}<div class="table-wrap">${lotsTable(state.data.solares)}</div></section>`;
  }
  // reservas
  const form = can("reservar_solar") ? `
    <div class="card">
      <h3 class="section-title">Nueva reserva</h3>
      <form class="form" id="reservationForm">
        <label class="field"><span>Cliente</span>${select("idCliente", state.data.clientes, "nombre")}</label>
        <label class="field"><span>Solar disponible</span>${select("idSolar", state.data.solares.filter((s) => s.estado === "Disponible"), lotName)}</label>
        <label class="field"><span>Expira</span><input name="fechaExpiracion" type="date"></label>
        <button class="btn" type="submit">Reservar solar</button>
      </form>
    </div>` : "";
  return `<section class="layout">${form}<div class="table-wrap">${reservationsTable(state.data.reservas)}</div></section>`;
}

// ---------- Ventas ----------
function renderSales() {
  const form = can("registrar_venta") ? `
    <div class="card">
      <h3 class="section-title">Registrar venta</h3>
      <form class="form" id="saleForm">
        <label class="field"><span>Cliente</span>${select("idCliente", state.data.clientes, "nombre")}</label>
        <label class="field"><span>Solar disponible/reservado</span>${select("idSolar", state.data.solares.filter((s) => ["Disponible", "Reservado"].includes(s.estado)), lotName)}</label>
        <div class="two">
          <label class="field"><span>Precio total</span><input name="precioTotal" type="number" step="0.01" min="0.01" required></label>
          <label class="field"><span>Inicial</span><input name="montoInicial" type="number" step="0.01" min="0" required></label>
        </div>
        <div class="two">
          <label class="field"><span>Cantidad cuotas</span><input name="cantidadCuotas" type="number" min="1" value="24" required></label>
          <label class="field"><span>Primer pago</span><input name="fechaPrimerPago" type="date" required></label>
        </div>
        <label class="field"><span>Frecuencia</span>
          <select name="frecuenciaPago">
            <option>Mensual</option><option>Quincenal</option><option>Semanal</option><option>Personalizada</option>
          </select>
        </label>
        <label class="field">
          <span>Tasa de interés por cuota (decimal, opcional)</span>
          <input name="tasaInteresCuota" type="number" step="0.0001" min="0" max="0.9999" placeholder="Por defecto: ${(state.data.configuracion.porcentajeInteresCuota ?? 0.012)}">
        </label>
        <button class="btn" type="submit">Crear venta + contrato + plan</button>
      </form>
    </div>` : "";
  return `
    ${renderHeader("Ventas y contratos")}
    <section class="layout">
      ${form}
      <div>
        <div class="table-wrap">${salesTable(state.data.ventas)}</div>
        <br>
        <div class="table-wrap">${contractsTable(state.data.contratos)}</div>
      </div>
    </section>
  `;
}

// ---------- Cobros ----------
function renderCollections() {
  const subTabs = [
    { id: "cobrar", text: "Cobrar" },
    { id: "renegociar", text: "Renegociar", perm: "renegociar_contrato" }
  ].filter((t) => can(t.perm));

  if (!subTabs.some((t) => t.id === state.cobrosTab)) state.cobrosTab = subTabs[0].id;

  const tabs = subTabs.length > 1
    ? `<div class="tabs">${subTabs.map((t) => `<button data-cobros-tab="${t.id}" class="${state.cobrosTab === t.id ? "active" : ""}">${t.text}</button>`).join("")}</div>`
    : "";

  if (state.cobrosTab === "renegociar") {
    return `${renderHeader("Cobros y recibos")}${tabs}${renderRenegociar()}`;
  }
  return `${renderHeader("Cobros y recibos")}${tabs}${renderCobrar()}`;
}

function renderCobrar() {
  const contratosCobrables = state.data.contratos.filter((c) =>
    ["Pendiente de inicial", "Activo", "En mora"].includes(c.estado)
  );
  const contratoSel = contratosCobrables[0];
  const puedeAlgunCobro = canAny(
    "registrar_cobro_inicial",
    "registrar_adelanto",
    "registrar_pago_mora",
    "registrar_abono_capital"
  );
  const form = puedeAlgunCobro ? `
    <div class="card">
      <h3 class="section-title">Registrar cobro</h3>
      <form class="form" id="collectionForm">
        <label class="field"><span>Contrato</span>${select("idContrato", contratosCobrables, contractName)}</label>
        <label class="field"><span>Tipo aplicación</span>
          <select name="tipoAplicacion" id="tipoAplicacion">
            ${can("registrar_cobro_inicial") ? "<option>Inicial</option>" : ""}
            ${can("registrar_adelanto") ? "<option>Cuota</option>" : ""}
            ${can("registrar_pago_mora") ? "<option>Mora</option>" : ""}
            ${can("registrar_adelanto") ? "<option>Adelanto</option>" : ""}
            ${can("registrar_abono_capital") ? "<option>Abono a capital</option>" : ""}
          </select>
        </label>
        <label class="field"><span>Cuota</span>${select("idCuota",
          state.data.cuotas.filter((q) => !contratoSel || q.contratoId === contratoSel.id), quotaName, true)}</label>
        <label class="field"><span>Mora</span>${select("idMora",
          state.data.mora.filter((m) => ["Pendiente", "Parcialmente pagada"].includes(m.estado)), lateFeeName, true)}</label>
        <div class="two">
          <label class="field"><span>Monto</span><input name="monto" type="number" step="0.01" min="0.01" required></label>
          <label class="field"><span>Método</span>
            <select name="metodoPago">
              <option>Efectivo</option><option>Transferencia</option><option>Deposito</option>
              <option>Cheque</option><option>Tarjeta</option><option>Otro</option>
            </select>
          </label>
        </div>
        <label class="field"><span>Referencia</span><input name="referenciaPago"></label>
        <label class="field" id="motivoRenegField" style="display:none;">
          <span>Motivo renegociación</span>
          <input name="motivoRenegociacion" placeholder="Obligatorio para abono a capital">
        </label>
        <button class="btn" type="submit">Registrar recibo</button>
      </form>
    </div>` : "";
  return `
    <section class="layout">
      ${form}
      <div>
        <div class="table-wrap">${collectionsTable(state.data.cobros)}</div>
        <br>
        <div class="table-wrap">${quotasTable(state.data.cuotas)}</div>
      </div>
    </section>
  `;
}

function renderRenegociar() {
  const contratos = state.data.contratos.filter((c) => ["Activo", "En mora"].includes(c.estado));
  if (contratos.length === 0) {
    return `<div class="card"><p class="hint">No hay contratos elegibles para renegociar (deben estar Activo o En mora).</p></div>`;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  return `
    <section class="layout">
      <div class="card">
        <h3 class="section-title">Renegociación formal</h3>
        <p class="hint">Anula las cuotas pendientes del contrato y crea un plan nuevo con el saldo actual como capital. Los pagos ya aplicados quedan intactos.</p>
        <form class="form" id="renegForm">
          <label class="field"><span>Contrato</span>${select("idContrato", contratos, contractName)}</label>
          <label class="field"><span>Motivo</span><textarea name="motivo" rows="3" required minlength="3" placeholder="Ej: cliente solicita reducir cuota mensual"></textarea></label>
          <div class="two">
            <label class="field"><span>Nueva cantidad de cuotas</span><input name="cantidadCuotas" type="number" min="1" value="12" required></label>
            <label class="field"><span>Frecuencia</span>
              <select name="frecuenciaPago">
                <option>Mensual</option><option>Quincenal</option><option>Semanal</option><option>Personalizada</option>
              </select>
            </label>
          </div>
          <label class="field"><span>Fecha primer pago nuevo plan</span><input name="fechaPrimerPago" type="date" value="${hoy}" required></label>
          <button class="btn" type="submit">Renegociar contrato</button>
        </form>
      </div>
      <div class="card">
        <h3 class="section-title">Contratos elegibles</h3>
        <div class="table-wrap">${contractsTable(contratos)}</div>
      </div>
    </section>
  `;
}

// ---------- Reportes con filtros ----------
const REPORT_TABS = [
  { id: "ventas",         text: "Ventas",           perm: ["ver_reportes_ventas", "ver_reportes_ventas_propias"] },
  { id: "saldados",       text: "Saldados",         perm: ["ver_reportes_ventas", "ver_reportes_ventas_propias"] },
  { id: "cobros",         text: "Cobros",           perm: ["ver_reportes_cobros", "ver_reportes_cobros_propios"] },
  { id: "mora",           text: "Mora",             perm: ["ver_reporte_mora", "ver_reporte_mora_propio"] },
  { id: "comisiones",     text: "Comisiones",       perm: ["ver_reporte_comisiones", "ver_reporte_comisiones_propias"] },
  { id: "solares",        text: "Solares",          perm: null },
  { id: "estado-cuenta",  text: "Estado de cuenta", perm: null },
  { id: "auditoria",      text: "Auditoría",        perm: ["consultar_auditoria"] }
];

function reportTabsAllowed() {
  return REPORT_TABS.filter((t) => !t.perm || (Array.isArray(t.perm) ? t.perm.some((p) => can(p)) : can(t.perm)));
}

function renderReports() {
  const tabs = reportTabsAllowed();
  if (tabs.length === 0) {
    return `${renderHeader("Reportes")}<div class="card"><p class="hint">No tienes permisos para ver reportes.</p></div>`;
  }
  if (!tabs.some((t) => t.id === state.reportesTab)) state.reportesTab = tabs[0].id;
  const activeTab = state.reportesTab;
  const exportBtn = state.reportesResult && activeTab !== "estado-cuenta"
    ? `<button class="btn secondary btn-sm" id="exportCsvBtn">Exportar CSV</button>` : "";
  return `
    ${renderHeader("Reportes", exportBtn)}
    <div class="tabs">
      ${tabs.map((t) => `<button data-reportes-tab="${t.id}" class="${activeTab === t.id ? "active" : ""}">${t.text}</button>`).join("")}
    </div>
    ${renderReportTab(activeTab)}
  `;
}

function renderReportTab(tab) {
  if (tab === "ventas")        return renderReportVentas();
  if (tab === "saldados")      return renderReportSaldados();
  if (tab === "cobros")        return renderReportCobros();
  if (tab === "mora")          return renderReportMora();
  if (tab === "comisiones")    return renderReportComisiones();
  if (tab === "solares")       return renderReportSolares();
  if (tab === "estado-cuenta") return renderReportEstadoCuenta();
  if (tab === "auditoria")     return renderReportAuditoria();
  return "";
}

function renderReportSaldados() {
  const r = state.reportesResult;
  const promedioMeses = r && r.items && r.items.length > 0
    ? (r.items.reduce((sum, i) => {
        const inicio = new Date(i.fecha_venta);
        const fin = new Date();
        return sum + Math.max(0, (fin - inicio) / (1000 * 60 * 60 * 24 * 30));
      }, 0) / r.items.length).toFixed(1)
    : "—";
  return `
    <div class="card">
      <h3 class="section-title">Contratos totalmente pagados</h3>
      <p class="hint">Ventas cuyo contrato quedó en estado Saldado (todas las cuotas pagadas).</p>
      <form class="form filter-form" data-report="saldados">
        ${dateFilterFields()}
        <label class="field"><span>Vendedor</span>
          <select name="idVendedor"><option value="">Todos</option>${state.data.usuarios.map((u) => `<option value="${u.id}">${escapeHtml(u.nombre)}</option>`).join("")}</select>
        </label>
        <button class="btn" type="submit">Consultar</button>
      </form>
    </div>
    ${r ? `
      <br>
      <section class="grid">
        ${metric("Contratos saldados", r.count)}
        ${metric("Total facturado", fmtMoney(r.totales.precioTotal))}
        ${metric("Meses promedio desde venta", promedioMeses)}
        ${metric("Total iniciales", fmtMoney(r.totales.montoInicial))}
      </section>
      <br>
      <div class="table-wrap">${table(
        ["Contrato", "Fecha venta", "Cliente", "Solar", "Vendedor", "Precio", "Inicial", "Financiado"],
        r.items.map((i) => [
          i.numero_contrato || `VEN-${String(i.id_venta).padStart(6, "0")}`,
          fmtDate(i.fecha_venta),
          i.cliente || "",
          `${i.manzana || ""} ${i.numero_solar || ""}`,
          i.vendedor || "",
          fmtMoney(i.precio_total),
          fmtMoney(i.monto_inicial),
          fmtMoney(i.monto_financiado)
        ])
      )}</div>` : "<p class=\"hint\">Ajusta filtros y pulsa Consultar.</p>"}
  `;
}

function dateFilterFields() {
  return `
    <div class="two">
      <label class="field"><span>Desde</span><input name="desde" type="date"></label>
      <label class="field"><span>Hasta</span><input name="hasta" type="date"></label>
    </div>
  `;
}

function renderReportVentas() {
  const r = state.reportesResult;
  const vendedores = state.data.usuarios;
  return `
    <div class="card">
      <form class="form filter-form" data-report="ventas">
        ${dateFilterFields()}
        <div class="two">
          <label class="field"><span>Vendedor</span>
            <select name="idVendedor"><option value="">Todos</option>${vendedores.map((u) => `<option value="${u.id}">${escapeHtml(u.nombre)}</option>`).join("")}</select>
          </label>
          <label class="field"><span>Estado</span>
            <select name="estado"><option value="">Todos</option><option>Activa</option><option>Saldada</option><option>Anulada</option><option>En mora</option><option>Cancelada</option></select>
          </label>
        </div>
        <button class="btn" type="submit">Consultar</button>
      </form>
    </div>
    ${r ? `
      <br>
      <section class="grid">
        ${metric("Ventas", r.count)}
        ${metric("Precio total", fmtMoney(r.totales.precioTotal))}
        ${metric("Iniciales", fmtMoney(r.totales.montoInicial))}
        ${metric("Financiado", fmtMoney(r.totales.montoFinanciado))}
      </section>
      <br>
      <div class="table-wrap">${table(
        ["Venta", "Fecha", "Cliente", "Solar", "Vendedor", "Total", "Estado contrato", "Balance"],
        r.items.map((i) => [
          `VEN-${String(i.id_venta).padStart(6, "0")}`,
          fmtDate(i.fecha_venta),
          i.cliente || "",
          `${i.manzana || ""} ${i.numero_solar || ""}`,
          i.vendedor || "",
          fmtMoney(i.precio_total),
          labelStatus(i.estado_contrato || i.estado),
          fmtMoney(i.balance_pendiente || 0)
        ])
      )}</div>` : "<p class=\"hint\">Ajusta filtros y pulsa Consultar.</p>"}
  `;
}

function renderReportCobros() {
  const r = state.reportesResult;
  return `
    <div class="card">
      <form class="form filter-form" data-report="cobros">
        ${dateFilterFields()}
        <label class="field"><span>Tipo aplicación</span>
          <select name="tipoAplicacion"><option value="">Todos</option><option>Inicial</option><option>Cuota</option><option>Mora</option><option>Adelanto</option><option>Abono a capital</option></select>
        </label>
        <button class="btn" type="submit">Consultar</button>
      </form>
    </div>
    ${r ? `
      <br>
      <section class="grid">
        ${metric("Cobros", r.count)}
        ${metric("Total aplicado", fmtMoney(r.totales.total))}
        ${metric("Inicial", fmtMoney(r.totales.porTipo.Inicial || 0))}
        ${metric("Mora + Cuotas", fmtMoney((r.totales.porTipo.Cuota || 0) + (r.totales.porTipo.Mora || 0)))}
      </section>
      <br>
      <div class="table-wrap">${table(
        ["Recibo", "Fecha", "Cliente", "Contrato", "Tipo", "Monto", "Método", "Cajero"],
        r.items.map((i) => [
          i.numero_recibo,
          fmtDate(i.fecha_pago),
          i.cliente || "",
          i.numero_contrato || "",
          i.tipo_aplicacion,
          fmtMoney(i.monto_aplicado),
          i.metodo_pago,
          i.cajero || ""
        ])
      )}</div>` : "<p class=\"hint\">Ajusta filtros y pulsa Consultar.</p>"}
  `;
}

function renderReportMora() {
  const r = state.reportesResult;
  return `
    <div class="card">
      <form class="form filter-form" data-report="mora">
        <div class="two">
          <label class="field"><span>Cliente</span>
            <select name="idCliente"><option value="">Todos</option>${state.data.clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join("")}</select>
          </label>
          <label class="field"><span>Contrato</span>
            <select name="idContrato"><option value="">Todos</option>${state.data.contratos.map((c) => `<option value="${c.id}">${escapeHtml(c.numero)}</option>`).join("")}</select>
          </label>
        </div>
        <button class="btn" type="submit">Consultar</button>
      </form>
    </div>
    ${r ? `
      <br>
      <section class="grid">
        ${metric("Cargos activos", r.count)}
        ${metric("Total generado", fmtMoney(r.totales.montoMoraTotal))}
        ${metric("Pagado", fmtMoney(r.totales.pagadoTotal))}
        ${metric("Pendiente", fmtMoney(r.totales.pendienteTotal))}
      </section>
      <br>
      <div class="table-wrap">${table(
        ["Contrato", "Cliente", "Cuota", "Vencimiento", "Días atraso", "Mora", "Pagado", "Pendiente", "Estado"],
        r.items.map((i) => [
          i.numero_contrato,
          i.cliente || "",
          i.numero_cuota,
          fmtDate(i.fecha_vencimiento),
          i.dias_atraso,
          fmtMoney(i.monto_mora),
          fmtMoney(i.monto_pagado),
          fmtMoney(i.balance_pendiente),
          labelStatus(i.estado)
        ])
      )}</div>` : "<p class=\"hint\">Ajusta filtros y pulsa Consultar.</p>"}
  `;
}

function renderReportComisiones() {
  const r = state.reportesResult;
  return `
    <div class="card">
      <form class="form filter-form" data-report="comisiones">
        ${dateFilterFields()}
        <div class="two">
          <label class="field"><span>Vendedor</span>
            <select name="idVendedor"><option value="">Todos</option>${state.data.usuarios.map((u) => `<option value="${u.id}">${escapeHtml(u.nombre)}</option>`).join("")}</select>
          </label>
          <label class="field"><span>Estado</span>
            <select name="estado"><option value="">Todos</option><option>Pendiente</option><option>Pagada</option></select>
          </label>
        </div>
        <button class="btn" type="submit">Consultar</button>
      </form>
    </div>
    ${r ? `
      <br>
      <section class="grid">
        ${metric("Comisiones", r.count)}
        ${metric("Pendientes", fmtMoney(r.totales.pendiente))}
        ${metric("Pagadas", fmtMoney(r.totales.pagado))}
        ${metric("Total", fmtMoney(r.totales.pagado + r.totales.pendiente))}
      </section>
      <br>
      <div class="table-wrap">${(() => {
        const canPay = can("marcar_comision_pagada");
        const headers = ["Comisión", "Vendedor", "Venta", "Precio venta", "% / Monto", "Monto", "Generación", "Pago", "Estado"];
        if (canPay) headers.push("Acciones");
        return table(headers, r.items.map((i) => {
          const row = [
            `COM-${String(i.id_comision).padStart(4, "0")}`,
            i.vendedor || "",
            `VEN-${String(i.id_venta).padStart(6, "0")}`,
            fmtMoney(i.precio_total),
            i.porcentaje_o_monto,
            fmtMoney(i.monto_comision),
            fmtDate(i.fecha_generacion),
            fmtDate(i.fecha_pago),
            labelStatus(i.estado)
          ];
          if (canPay) {
            row.push(i.estado === "Pendiente"
              ? `<button class="btn btn-sm" data-action="pagar-comision" data-id="${i.id_comision}">Marcar pagada</button>`
              : "—");
          }
          return row;
        }));
      })()}</div>` : "<p class=\"hint\">Ajusta filtros y pulsa Consultar.</p>"}
  `;
}

function renderReportSolares() {
  const r = state.reportesResult;
  return `
    <div class="card">
      <form class="form filter-form" data-report="solares">
        <div class="two">
          <label class="field"><span>Proyecto</span>
            <select name="idProyecto"><option value="">Todos</option>${state.data.proyectos.map((p) => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join("")}</select>
          </label>
          <label class="field"><span>Estado</span>
            <select name="estado"><option value="">Todos</option><option>Disponible</option><option>Reservado</option><option>Bloqueado</option><option>Vendido</option><option>Anulado</option></select>
          </label>
        </div>
        <button class="btn" type="submit">Consultar</button>
      </form>
    </div>
    ${r ? `
      <br>
      <section class="grid">
        ${Object.entries(r.porEstado).map(([est, n]) => metric(est, n)).join("")}
      </section>
      <br>
      <div class="table-wrap">${table(
        ["Proyecto", "Manzana", "Número", "Metros²", "Precio", "Estado", "Tipo bloqueo"],
        r.items.map((i) => [
          i.proyecto,
          i.manzana,
          i.numero_solar,
          i.metros_cuadrados,
          fmtMoney(i.precio_total),
          labelStatus(i.estado),
          i.tipo_bloqueo || ""
        ])
      )}</div>` : "<p class=\"hint\">Ajusta filtros y pulsa Consultar.</p>"}
  `;
}

function renderReportEstadoCuenta() {
  const r = state.reportesResult;
  const contratos = state.data.contratos;
  return `
    <div class="card">
      <form class="form filter-form" data-report="estado-cuenta">
        <label class="field"><span>Contrato</span>
          <select name="idContrato" required><option value="">Selecciona…</option>${contratos.map((c) => `<option value="${c.id}">${escapeHtml(c.numero)}</option>`).join("")}</select>
        </label>
        <button class="btn" type="submit">Ver estado de cuenta</button>
      </form>
    </div>
    ${r ? renderEstadoCuenta(r) : ""}
  `;
}

function renderEstadoCuenta(r) {
  const c = r.contrato;
  return `
    <br>
    <div class="card">
      <h3 class="section-title">${escapeHtml(c.numero_contrato)} — ${escapeHtml(c.cliente)}</h3>
      <div class="grid">
        ${metric("Estado", c.estado)}
        ${metric("Precio total", fmtMoney(c.precio_total))}
        ${metric("Inicial", fmtMoney(c.monto_inicial))}
        ${metric("Financiado", fmtMoney(c.monto_financiado))}
        ${metric("Balance pendiente", fmtMoney(c.balance_pendiente || 0))}
        ${metric("Mora pendiente", fmtMoney(c.total_mora_pendiente || 0))}
      </div>
    </div>
    <br>
    <div class="card">
      <h3 class="section-title">Plan de cuotas</h3>
      <div class="table-wrap">${table(
        ["#", "Vencimiento", "Monto", "Capital", "Interés", "Pagado", "Pendiente", "Estado"],
        r.cuotas.map((q) => [
          q.numero_cuota,
          fmtDate(q.fecha_vencimiento),
          fmtMoney(q.monto),
          fmtMoney(q.capital),
          fmtMoney(q.interes),
          fmtMoney(q.monto_pagado),
          fmtMoney(q.balance_pendiente),
          labelStatus(q.estado)
        ])
      )}</div>
    </div>
    ${r.mora.length ? `<br>
    <div class="card">
      <h3 class="section-title">Moras</h3>
      <div class="table-wrap">${table(
        ["Cuota", "Vencimiento", "Días atraso", "Mora", "Pagado", "Pendiente", "Estado"],
        r.mora.map((m) => [
          m.numero_cuota,
          fmtDate(m.fecha_vencimiento),
          m.dias_atraso,
          fmtMoney(m.monto_mora),
          fmtMoney(m.monto_pagado),
          fmtMoney(m.balance_pendiente),
          labelStatus(m.estado)
        ])
      )}</div>
    </div>` : ""}
    <br>
    <div class="card">
      <h3 class="section-title">Cobros aplicados</h3>
      <div class="table-wrap">${table(
        ["Recibo", "Fecha", "Tipo", "Monto", "Método", "Estado"],
        r.cobros.map((cb) => [
          cb.numero_recibo,
          fmtDate(cb.fecha_pago),
          cb.tipo_aplicacion,
          fmtMoney(cb.monto_aplicado),
          cb.metodo_pago,
          labelStatus(cb.estado)
        ])
      )}</div>
    </div>
    ${r.renegociaciones.length ? `<br>
    <div class="card">
      <h3 class="section-title">Historial de renegociaciones</h3>
      <div class="table-wrap">${table(
        ["Fecha", "Motivo"],
        r.renegociaciones.map((rn) => [fmtDate(rn.fecha), rn.motivo])
      )}</div>
    </div>` : ""}
  `;
}

function renderReportAuditoria() {
  const items = state.reportesResult || [];
  return `
    <div class="card">
      <form class="form filter-form" data-report="auditoria">
        <div class="two">
          <label class="field"><span>Entidad</span>
            <select name="entidad">
              <option value="">Todas</option>
              <option>clientes</option><option>proyectos</option><option>solares</option><option>reservas</option>
              <option>ventas</option><option>contratos</option><option>cobros</option><option>mora</option>
              <option>renegociaciones</option><option>configuracion</option><option>usuarios</option>
            </select>
          </label>
          <label class="field"><span>ID entidad</span><input name="idEntidad" placeholder="Opcional"></label>
        </div>
        ${dateFilterFields()}
        <label class="field"><span>Usuario</span>
          <select name="idUsuario"><option value="">Todos</option>${state.data.usuarios.map((u) => `<option value="${u.id}">${escapeHtml(u.nombre)}</option>`).join("")}</select>
        </label>
        <label class="field"><span>Límite</span><input name="limit" type="number" min="1" max="500" value="100"></label>
        <button class="btn" type="submit">Consultar</button>
      </form>
    </div>
    ${state.reportesResult ? `
      <br>
      <div class="table-wrap">${table(
        ["Fecha", "Usuario", "Acción", "Entidad", "ID"],
        items.map((i) => [fmtDateTime(i.fecha), i.usuario, i.accion, i.entidad, i.entidadId])
      )}</div>` : "<p class=\"hint\">Ajusta filtros y pulsa Consultar.</p>"}
  `;
}

const REPORT_ENDPOINTS = {
  "ventas":         "/api/reportes/ventas",
  "saldados":       "/api/reportes/ventas",
  "cobros":         "/api/reportes/cobros",
  "mora":           "/api/reportes/mora",
  "comisiones":     "/api/reportes/comisiones",
  "solares":        "/api/reportes/solares",
  "estado-cuenta":  (data) => `/api/estado-cuenta/${data.idContrato}`,
  "auditoria":      "/api/auditoria"
};

// Filtros forzados por sub-tab: los inyecta runReport siempre.
const REPORT_FORCED = {
  "saldados": { estado: "Saldada" }
};

async function runReport(reportId, formEl) {
  const data = { ...cleanPayload(Object.fromEntries(new FormData(formEl))), ...(REPORT_FORCED[reportId] || {}) };
  const endpoint = REPORT_ENDPOINTS[reportId];
  let url = typeof endpoint === "function" ? endpoint(data) : endpoint;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    if (reportId === "estado-cuenta" && k === "idContrato") continue;
    params.append(k, v);
  }
  const qs = params.toString();
  if (qs && reportId !== "estado-cuenta") url += `?${qs}`;
  state.reportesResult = await api(url);
  renderView();
}

// ---------- Configuración ----------
function esPlaceholderEmpresa(c) {
  return !c.nombreEmpresa
      || c.nombreEmpresa === "Nombre de la Inmobiliaria"
      || !c.rncEmpresa
      || c.rncEmpresa === "000-00000-0";
}

function renderConfig() {
  const c = state.data.configuracion;
  const advertencia = esPlaceholderEmpresa(c)
    ? `<div class="dup-warn" style="margin-bottom:14px;"><strong>⚠ Datos empresariales pendientes de configurar.</strong>
       Actualmente el recibo muestra datos genéricos. Antes de emitir recibos reales a clientes,
       actualiza el nombre, RNC y dirección de la empresa más abajo.</div>`
    : "";
  const form = can("configurar_parametros") ? `
    ${advertencia}
    <div class="card">
      <h3 class="section-title">Parámetros</h3>
      <form class="form" id="configForm">
        <label class="field"><span>Días reserva default</span><input name="diasReservaDefault" type="number" min="1" value="${c.diasReservaDefault}"></label>
        <label class="field"><span>Porcentaje mora (decimal)</span><input name="porcentajeMora" type="number" step="0.0001" min="0" max="1" value="${c.porcentajeMora}"></label>
        <label class="field"><span>Días gracia mora</span><input name="diasGraciaMora" type="number" min="0" value="${c.diasGraciaMora}"></label>
        <label class="field"><span>Impuesto venta (decimal)</span><input name="impuestoVenta" type="number" step="0.0001" min="0" max="1" value="${c.impuestoVenta}"></label>
        <label class="field"><span>Comisión default (decimal)</span><input name="comisionDefault" type="number" step="0.0001" min="0" max="1" value="${c.comisionDefault}"></label>
        <label class="field"><span>Interés por cuota — default (decimal)</span><input name="porcentajeInteresCuota" type="number" step="0.0001" min="0" max="0.9999" value="${c.porcentajeInteresCuota ?? 0.012}"></label>
        <hr style="border:0;border-top:1px solid var(--line);margin:12px 0;">
        <p class="label">Datos empresariales (aparecen en el recibo impreso)</p>
        <label class="field"><span>Nombre empresa</span><input name="nombreEmpresa" value="${escapeHtml(c.nombreEmpresa || "")}" placeholder="Razón social"></label>
        <label class="field"><span>RNC / Cédula fiscal</span><input name="rncEmpresa" value="${escapeHtml(c.rncEmpresa || "")}"></label>
        <label class="field"><span>Dirección</span><input name="direccionEmpresa" value="${escapeHtml(c.direccionEmpresa || "")}"></label>
        <label class="field"><span>Teléfono</span><input name="telefonoEmpresa" value="${escapeHtml(c.telefonoEmpresa || "")}"></label>
        <label class="field"><span>Nota legal al pie del recibo</span><textarea name="notaLegalRecibo" rows="2">${escapeHtml(c.notaLegalRecibo || "")}</textarea></label>
        <button class="btn" type="submit">Guardar configuración</button>
      </form>
    </div>` : `<div class="card"><p class="hint">Solo un Administrador puede editar la configuración.</p></div>`;
  return `
    ${renderHeader("Configuración general")}
    <section class="layout">
      ${form}
      <div class="card">
        <h3 class="section-title">Roles y permisos</h3>
        <div class="table-wrap">${rolesTable(state.data.roles)}</div>
      </div>
    </section>
  `;
}

// ---------- Bindings ----------
function bindView() {
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      renderView();
    });
  });
  bindForm("clientForm",      "/api/clientes",   "Cliente creado");
  bindForm("projectForm",     "/api/proyectos",  "Proyecto creado");
  bindForm("lotForm",         "/api/solares",    "Solar creado");
  bindForm("reservationForm", "/api/reservas",   "Reserva creada");
  bindForm("saleForm",        "/api/ventas",     "Venta registrada; solar bloqueado hasta cobrar el inicial");
  bindForm("collectionForm",  "/api/cobros",     "Cobro registrado");

  const tipoAplSel = byId("tipoAplicacion");
  const motivoField = byId("motivoRenegField");
  if (tipoAplSel && motivoField) {
    const toggle = () => {
      motivoField.style.display = tipoAplSel.value === "Abono a capital" ? "" : "none";
    };
    toggle();
    tipoAplSel.addEventListener("change", toggle);
  }
  bindForm("configForm",      "/api/configuracion", "Configuración actualizada", "PATCH");
  bindForm("renegForm",       "/api/renegociaciones", "Contrato renegociado; plan de cuotas recalculado");

  const cf = byId("clientesFilterInput");
  if (cf) {
    cf.addEventListener("input", debounce((e) => {
      state.clientesFilter = e.target.value;
      renderView();
      byId("clientesFilterInput")?.focus();
    }, 200));
  }

  // F6: alerta de duplicado al escribir en formulario nuevo cliente
  const nombreEl = byId("clientNombreCompleto");
  const cedulaEl = byId("clientCedulaRnc");
  if (nombreEl && cedulaEl) {
    const check = debounce(async () => {
      const nombre = nombreEl.value.trim();
      const cedula = cedulaEl.value.trim();
      const warn = byId("clientDuplicateWarning");
      if (!warn) return;
      if (nombre.length < 3 && cedula.length < 3) { warn.style.display = "none"; return; }
      try {
        const q = new URLSearchParams({ nombreCompleto: nombre, cedulaRnc: cedula });
        const similares = await api(`/api/clientes/similares?${q.toString()}`);
        if (similares.length === 0) { warn.style.display = "none"; return; }
        warn.style.display = "block";
        warn.innerHTML = `<strong>⚠ Posibles duplicados:</strong> ${similares.map((c) => `${escapeHtml(c.nombre)} (${escapeHtml(c.cedulaRnc)})`).join(" · ")}`;
      } catch (_) { /* silencioso */ }
    }, 350);
    nombreEl.addEventListener("input", check);
    cedulaEl.addEventListener("input", check);
  }

  document.querySelectorAll("[data-cobros-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.cobrosTab = btn.dataset.cobrosTab;
      renderView();
    });
  });
  document.querySelectorAll("[data-reportes-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.reportesTab = btn.dataset.reportesTab;
      state.reportesResult = null;
      renderView();
    });
  });

  document.querySelectorAll("form.filter-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      const reportId = form.dataset.report;
      await withLoading(btn, "Consultando…", async () => {
        try { await runReport(reportId, form); }
        catch (err) { toast(humanErrorMessage(err), "error", 6000); }
      });
    });
  });

  document.querySelectorAll("[data-goto-saldados]").forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      state.view = "reportes";
      state.reportesTab = "saldados";
      state.reportesResult = null;
      renderShell();
    });
  });

  const gen = byId("generateLateFees");
  if (gen) {
    gen.addEventListener("click", () => {
      withLoading(gen, "Generando…", async () => {
        try {
          const p = await api("/api/mora/generar", { method: "POST", body: "{}" });
          toast(`Moras generadas: ${p.generated.length}`, "success");
          await load();
        } catch (err) {
          toast(humanErrorMessage(err), "error", 6000);
        }
      });
    });
  }

  // Delegación de acciones inline en tablas
  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const action = btn.dataset.action;
      const id = Number(btn.dataset.id);
      if (action === "edit-client") openEditClientModal(id);
      else if (action === "anular-venta") openAnularVentaModal(id);
      else if (action === "anular-cobro") openAnularCobroModal(id);
      else if (action === "view-client") openClienteDetalle(id);
      else if (action === "view-contrato") openContratoDetalle(id);
      else if (action === "view-solar") openSolarDetalle(id);
      else if (action === "view-recibo") openReciboDetalle(id);
      else if (action === "pagar-comision") pagarComision(id);
      else if (action === "bloquear-solar") openBloquearSolarModal(id);
      else if (action === "desbloquear-solar") openDesbloquearSolarModal(id);
      else if (action === "cancel-reserva") openCancelReservaModal(id);
      else if (action === "cobrar-cuota-direct") {
        openCobrarCuotaModal({
          idContrato: Number(btn.dataset.contratoId),
          idCuota: Number(btn.dataset.cuotaId),
          numero: btn.dataset.numero,
          fechaVencimiento: btn.dataset.vencimiento,
          balance: Number(btn.dataset.balance)
        });
      }
    });
  });

  // F3: botón exportar CSV — presente en cada tab de reportes con resultados
  const exp = byId("exportCsvBtn");
  if (exp) exp.addEventListener("click", () => exportCurrentReport());
}

async function pagarComision(id) {
  if (!confirm("¿Marcar esta comisión como pagada? Esta acción queda auditada.")) return;
  try {
    await api(`/api/comisiones/${id}/pagar`, { method: "PUT" });
    toast("Comisión marcada como pagada", "success");
    // Refrescar resultados del reporte
    const form = document.querySelector('form.filter-form[data-report="comisiones"]');
    if (form) form.dispatchEvent(new Event("submit", { cancelable: true }));
  } catch (err) { toast(humanErrorMessage(err), "error", 6000); }
}

function openBloquearSolarModal(id) {
  openModal({
    title: "Bloquear solar administrativamente",
    body: `
      <label class="field"><span>Tipo de bloqueo</span>
        <select name="tipoBloqueo" required>
          <option value="Administrativo">Administrativo</option>
          <option value="Legal">Legal</option>
          <option value="Otro">Otro</option>
        </select>
      </label>
      <label class="field"><span>Motivo (obligatorio)</span><textarea name="motivo" rows="3" required minlength="3"></textarea></label>
    `,
    submitLabel: "Bloquear solar",
    onSubmit: async (data) => {
      await api(`/api/solares/${id}/bloquear`, { method: "POST", body: JSON.stringify(data) });
      toast("Solar bloqueado", "success");
      await load();
    }
  });
}

function openDesbloquearSolarModal(id) {
  openModal({
    title: "Desbloquear solar",
    body: `
      <p class="hint">Solo aplica a bloqueos Administrativo, Legal u Otro. Si es un bloqueo por venta pendiente, anula la venta.</p>
      <label class="field"><span>Motivo del desbloqueo</span><textarea name="motivo" rows="3" required minlength="3"></textarea></label>
    `,
    submitLabel: "Desbloquear",
    onSubmit: async (data) => {
      await api(`/api/solares/${id}/desbloquear`, { method: "POST", body: JSON.stringify(data) });
      toast("Solar desbloqueado", "success");
      await load();
    }
  });
}

// F3: exportar el reporte actual a CSV. Trabaja sobre state.reportesResult
function exportCurrentReport() {
  const r = state.reportesResult;
  if (!r) return toast("Nada que exportar. Ejecuta el reporte primero.", "info");
  const tab = state.reportesTab;
  const fecha = new Date().toISOString().slice(0, 10);
  let headers = [], rows = [];
  if (tab === "ventas" || tab === "saldados") {
    headers = ["Venta", "Fecha", "Cliente", "Solar", "Vendedor", "Precio", "Inicial", "Financiado", "Estado", "Balance"];
    rows = r.items.map((i) => [
      `VEN-${String(i.id_venta).padStart(6, "0")}`,
      i.fecha_venta, i.cliente, `${i.manzana || ""} ${i.numero_solar || ""}`,
      i.vendedor, i.precio_total, i.monto_inicial, i.monto_financiado,
      i.estado_contrato || i.estado, i.balance_pendiente || 0
    ]);
  } else if (tab === "cobros") {
    headers = ["Recibo", "Fecha", "Cliente", "Contrato", "Tipo", "Monto", "Método", "Cajero", "Estado"];
    rows = r.items.map((i) => [i.numero_recibo, i.fecha_pago, i.cliente, i.numero_contrato, i.tipo_aplicacion, i.monto_aplicado, i.metodo_pago, i.cajero, i.estado]);
  } else if (tab === "mora") {
    headers = ["Contrato", "Cliente", "Cuota", "Vencimiento", "Días atraso", "Mora", "Pagado", "Pendiente", "Estado"];
    rows = r.items.map((i) => [i.numero_contrato, i.cliente, i.numero_cuota, i.fecha_vencimiento, i.dias_atraso, i.monto_mora, i.monto_pagado, i.balance_pendiente, i.estado]);
  } else if (tab === "comisiones") {
    headers = ["Comisión", "Vendedor", "Venta", "Precio venta", "%/Monto", "Monto", "Generación", "Pago", "Estado"];
    rows = r.items.map((i) => [`COM-${String(i.id_comision).padStart(4, "0")}`, i.vendedor, `VEN-${String(i.id_venta).padStart(6, "0")}`, i.precio_total, i.porcentaje_o_monto, i.monto_comision, i.fecha_generacion, i.fecha_pago, i.estado]);
  } else if (tab === "solares") {
    headers = ["Proyecto", "Manzana", "Número", "Metros²", "Precio", "Estado", "Tipo bloqueo"];
    rows = r.items.map((i) => [i.proyecto, i.manzana, i.numero_solar, i.metros_cuadrados, i.precio_total, i.estado, i.tipo_bloqueo || ""]);
  } else if (tab === "auditoria") {
    headers = ["Fecha", "Usuario", "Acción", "Entidad", "ID"];
    rows = r.map((i) => [i.fecha, i.usuario, i.accion, i.entidad, i.entidadId]);
  } else {
    return toast("Este reporte no soporta exportación", "info");
  }
  exportToCSV(`reporte-${tab}-${fecha}.csv`, headers, rows);
}

// ---------- Modales de acción ----------
function openEditClientModal(id) {
  const c = state.data.clientes.find((x) => x.id === id);
  if (!c) return;
  openModal({
    title: `Editar cliente: ${c.nombre}`,
    body: `
      <label class="field"><span>Nombre completo</span><input name="nombreCompleto" value="${escapeHtml(c.nombre)}" required minlength="2"></label>
      <div class="two">
        <label class="field"><span>Teléfono</span><input name="telefono" value="${escapeHtml(c.telefono || "")}"></label>
        <label class="field"><span>Correo</span><input name="correo" type="email" value="${escapeHtml(c.correo || "")}"></label>
      </div>
      <label class="field"><span>Dirección</span><input name="direccion" value="${escapeHtml(c.direccion || "")}"></label>
      <div class="two">
        <label class="field"><span>Estado civil</span><input name="estadoCivil" value="${escapeHtml(c.estadoCivil || "")}"></label>
        <label class="field"><span>Ocupación</span><input name="ocupacion" value="${escapeHtml(c.ocupacion || "")}"></label>
      </div>
      <label class="field"><span>Estado</span>
        <select name="estado"><option ${c.estado === "Activo" ? "selected" : ""}>Activo</option><option ${c.estado === "Inactivo" ? "selected" : ""}>Inactivo</option></select>
      </label>
    `,
    submitLabel: "Guardar cambios",
    onSubmit: async (data) => {
      await api(`/api/clientes/${id}`, { method: "PUT", body: JSON.stringify(cleanPayload(data)) });
      toast("Cliente actualizado", "success");
      await load();
    }
  });
}

function openAnularVentaModal(id) {
  const v = state.data.ventas.find((x) => x.id === id);
  if (!v) return;
  const client = state.data.clientes.find((c) => c.id === v.clienteId);
  openModal({
    title: `Anular venta ${v.numero}`,
    body: `
      <p class="hint">Cliente: <strong>${escapeHtml(client ? client.nombre : "")}</strong>. Al anular se libera el solar y se cancela el contrato. Solo aplica antes del cobro inicial.</p>
      <label class="field"><span>Motivo (obligatorio)</span><textarea name="motivo" rows="3" required minlength="3" placeholder="Explica por qué se anula esta venta"></textarea></label>
    `,
    submitLabel: "Anular venta",
    danger: true,
    onSubmit: async (data) => {
      await api(`/api/ventas/${id}`, { method: "DELETE", body: JSON.stringify(data) });
      toast("Venta anulada; solar liberado", "success");
      await load();
    }
  });
}

function openCancelReservaModal(id) {
  const r = state.data.reservas.find((x) => x.id === id);
  if (!r) return;
  const cliente = state.data.clientes.find((c) => c.id === r.clienteId);
  const solar = state.data.solares.find((s) => s.id === r.solarId);
  openModal({
    title: `Cancelar reserva`,
    body: `
      <p class="hint">Cliente: <strong>${escapeHtml(cliente ? cliente.nombre : "")}</strong> · Solar: <strong>${escapeHtml(solar ? solar.codigo : "")}</strong>.
      Al cancelar, el solar se libera y queda Disponible para otra reserva o venta.</p>
      <label class="field"><span>Motivo (obligatorio)</span>
        <textarea name="motivo" rows="3" required minlength="3" placeholder="Ej: cliente desistió, no logró aprobación bancaria…"></textarea>
      </label>
    `,
    submitLabel: "Cancelar reserva",
    danger: true,
    onSubmit: async (data) => {
      await api(`/api/reservas/${id}`, { method: "DELETE", body: JSON.stringify(data) });
      toast("Reserva cancelada · solar liberado", "success");
      await load();
    }
  });
}

function openAnularCobroModal(id) {
  const c = state.data.cobros.find((x) => x.id === id);
  if (!c) return;
  openModal({
    title: `Anular recibo ${c.numero}`,
    body: `
      <p class="hint">Monto: <strong>${fmtMoney(c.montoTotal)}</strong>. Al anular se recalculan cuotas y moras afectadas.</p>
      <label class="field"><span>Motivo (obligatorio)</span><textarea name="motivo" rows="3" required minlength="3" placeholder="Explica por qué se anula este recibo"></textarea></label>
    `,
    submitLabel: "Anular recibo",
    danger: true,
    onSubmit: async (data) => {
      await api(`/api/cobros/${id}`, { method: "DELETE", body: JSON.stringify(data) });
      toast("Recibo anulado", "success");
      await load();
    }
  });
}

// ---------- Detalles (solo lectura) ----------
async function openClienteDetalle(id) {
  let data;
  try { data = await api(`/api/clientes/${id}/detalle`); }
  catch (err) { return toast(humanErrorMessage(err), "error", 6000); }
  const { cliente, contratos, cobrosRecientes, morasActivas, proximaCuota, totales } = data;
  const body = `
    <section class="grid">
      ${metric("Contratos activos", totales.contratosActivos)}
      ${metric("Balance total", fmtMoney(totales.balancePendiente))}
      ${metric("Mora pendiente", fmtMoney(totales.moraPendiente))}
      ${metric("Próxima cuota", proximaCuota ? fmtDate(proximaCuota.fecha_vencimiento) : "—")}
    </section>
    <br>
    <div class="detail-section">
      <h4>Datos del cliente</h4>
      <div class="two">
        <div><strong>Cédula/RNC:</strong> ${escapeHtml(cliente.cedula_rnc || "")}</div>
        <div><strong>Teléfono:</strong> ${escapeHtml(cliente.telefono || "—")}</div>
        <div><strong>Correo:</strong> ${escapeHtml(cliente.correo || "—")}</div>
        <div><strong>Dirección:</strong> ${escapeHtml(cliente.direccion || "—")}</div>
        <div><strong>Estado civil:</strong> ${escapeHtml(cliente.estado_civil || "—")}</div>
        <div><strong>Ocupación:</strong> ${escapeHtml(cliente.ocupacion || "—")}</div>
      </div>
    </div>
    <div class="detail-section">
      <h4>Contratos (${contratos.length})</h4>
      <div class="table-wrap">${table(
        ["Contrato", "Proyecto", "Solar", "Estado", "Balance", "Mora"],
        contratos.map((c) => [
          c.numero_contrato,
          c.proyecto,
          `${c.manzana}-${c.numero_solar}`,
          labelStatus(c.estado_contrato),
          fmtMoney(c.balance_pendiente),
          fmtMoney(c.mora_pendiente)
        ])
      )}</div>
    </div>
    ${proximaCuota ? `
    <div class="detail-section">
      <h4>Próxima cuota a pagar</h4>
      <p>Contrato <strong>${escapeHtml(proximaCuota.numero_contrato)}</strong>, cuota #${proximaCuota.numero_cuota} vence ${fmtDate(proximaCuota.fecha_vencimiento)} — pendiente <strong>${fmtMoney(proximaCuota.balance_pendiente)}</strong></p>
    </div>` : ""}
    ${morasActivas.length ? `
    <div class="detail-section">
      <h4>Moras activas (${morasActivas.length})</h4>
      <div class="table-wrap">${table(
        ["Contrato", "Cuota", "Vencimiento", "Días", "Mora", "Pagado", "Pendiente", "Estado"],
        morasActivas.map((m) => [
          m.numero_contrato,
          m.numero_cuota,
          fmtDate(m.fecha_vencimiento),
          m.dias_atraso,
          fmtMoney(m.monto_mora),
          fmtMoney(m.monto_pagado),
          fmtMoney(m.balance_pendiente),
          labelStatus(m.estado)
        ])
      )}</div>
    </div>` : ""}
    <div class="detail-section">
      <h4>Últimos cobros (${cobrosRecientes.length})</h4>
      <div class="table-wrap">${table(
        ["Recibo", "Fecha", "Contrato", "Tipos", "Monto", "Método", "Estado"],
        cobrosRecientes.map((cb) => [
          cb.numero_recibo,
          fmtDate(cb.fecha_pago),
          cb.numero_contrato,
          cb.tipos_aplicacion,
          fmtMoney(cb.monto_total),
          cb.metodo_pago,
          labelStatus(cb.estado)
        ])
      )}</div>
    </div>
  `;
  openViewModal({ title: `Cliente: ${cliente.nombre_completo}`, body });
}

async function openContratoDetalle(idContrato) {
  let data;
  try { data = await api(`/api/estado-cuenta/${idContrato}`); }
  catch (err) { return toast(humanErrorMessage(err), "error", 6000); }
  const c = data.contrato;

  // Acciones rápidas de cobro según estado del contrato
  const canInicial = can("registrar_cobro_inicial");
  const canCuota = canAny("registrar_adelanto");
  const canMora = can("registrar_pago_mora");
  const inicialPendiente = Number(c.inicial_pendiente || 0);
  const puedeCobrarInicial = c.estado === "Pendiente de inicial" && inicialPendiente > 0 && canInicial;
  const puedePagarCuota = ["Activo", "En mora"].includes(c.estado) && canCuota;
  const puedePagarMora = ["Activo", "En mora"].includes(c.estado) && canMora;

  const accionesTop = [];
  if (puedeCobrarInicial) {
    accionesTop.push(`<button class="btn" data-action="cobrar-inicial" data-contrato-id="${c.id_contrato}" data-monto="${inicialPendiente}">Cobrar inicial (${fmtMoney(inicialPendiente)})</button>`);
  }

  const body = `
    ${accionesTop.length ? `<div class="detail-actions">${accionesTop.join(" ")}</div>` : ""}
    <section class="grid">
      ${metric("Estado", c.estado)}
      ${metric("Precio total", fmtMoney(c.precio_total))}
      ${metric("Inicial", fmtMoney(c.monto_inicial))}
      ${metric("Financiado", fmtMoney(c.monto_financiado))}
      ${metric("Balance", fmtMoney(c.balance_pendiente || 0))}
      ${metric("Mora pendiente", fmtMoney(c.total_mora_pendiente || 0))}
      ${metric("Tasa por cuota", pctLabel(c.tasa_interes_cuota))}
    </section>
    <br>
    <div class="detail-section">
      <h4>Datos</h4>
      <div class="two">
        <div><strong>Cliente:</strong> ${escapeHtml(c.cliente || "")} (${escapeHtml(c.cedula_rnc || "")})</div>
        <div><strong>Solar:</strong> ${escapeHtml(c.manzana || "")} - ${escapeHtml(c.numero_solar || "")}</div>
        <div><strong>Fecha venta:</strong> ${fmtDate(c.fecha_venta)}</div>
        <div><strong>Cantidad cuotas:</strong> ${c.cantidad_cuotas}</div>
        <div><strong>Tasa de interés aplicada:</strong> ${pctLabel(c.tasa_interes_cuota)} por cuota</div>
      </div>
    </div>
    <div class="detail-section">
      <h4>Plan de cuotas (${data.cuotas.length})</h4>
      <div class="table-wrap">${(() => {
        const withActions = puedePagarCuota;
        const headers = ["#", "Vencimiento", "Monto", "Capital", "Interés", "Pagado", "Pendiente", "Estado"];
        if (withActions) headers.push("Acciones");
        return table(headers, data.cuotas.map((q) => {
          const row = [
            q.numero_cuota, fmtDate(q.fecha_vencimiento),
            fmtMoney(q.monto), fmtMoney(q.capital), fmtMoney(q.interes),
            fmtMoney(q.monto_pagado), fmtMoney(q.balance_pendiente),
            labelStatus(q.estado)
          ];
          if (withActions) {
            const puede = q.estado !== "Anulada" && Number(q.balance_pendiente) > 0;
            row.push(puede
              ? `<button class="btn btn-sm" data-action="cobrar-cuota" data-contrato-id="${c.id_contrato}" data-cuota-id="${q.id_cuota}" data-numero="${q.numero_cuota}" data-vencimiento="${q.fecha_vencimiento}" data-balance="${q.balance_pendiente}">Cobrar</button>`
              : "");
          }
          return row;
        }));
      })()}</div>
    </div>
    ${data.mora.length ? `
    <div class="detail-section">
      <h4>Moras (${data.mora.length})</h4>
      <div class="table-wrap">${(() => {
        const canAdmin = can("ajustar_anular_mora");
        const withActions = puedePagarMora || canAdmin;
        const headers = ["Cuota", "Vencimiento", "Días", "Mora", "Pagado", "Pendiente", "Estado"];
        if (withActions) headers.push("Acciones");
        return table(headers, data.mora.map((m) => {
          const row = [
            m.numero_cuota, fmtDate(m.fecha_vencimiento), m.dias_atraso,
            fmtMoney(m.monto_mora), fmtMoney(m.monto_pagado), fmtMoney(m.balance_pendiente),
            labelStatus(m.estado)
          ];
          if (withActions) {
            const activa = ["Pendiente", "Parcialmente pagada"].includes(m.estado);
            const puedePagar = puedePagarMora && activa && Number(m.balance_pendiente) > 0;
            const acciones = [];
            if (puedePagar) {
              acciones.push(`<button class="btn btn-sm" data-action="cobrar-mora" data-contrato-id="${c.id_contrato}" data-mora-id="${m.id_mora}" data-numero="${m.numero_cuota}" data-balance="${m.balance_pendiente}">Cobrar</button>`);
            }
            if (canAdmin && activa) {
              acciones.push(`<button class="btn secondary btn-sm" data-action="ajustar-mora" data-mora-id="${m.id_mora}" data-monto="${m.monto_mora}" data-pagado="${m.monto_pagado}" data-numero="${m.numero_cuota}">Ajustar</button>`);
              acciones.push(`<button class="btn danger btn-sm" data-action="anular-mora" data-mora-id="${m.id_mora}" data-numero="${m.numero_cuota}">Anular</button>`);
            }
            row.push(acciones.join(" "));
          }
          return row;
        }));
      })()}</div>
    </div>` : ""}
    <div class="detail-section">
      <h4>Cobros aplicados (${data.cobros.length})</h4>
      <div class="table-wrap">${table(
        ["Recibo", "Fecha", "Tipo", "Monto", "Método", "Estado"],
        data.cobros.map((cb) => [
          cb.numero_recibo, fmtDate(cb.fecha_pago), cb.tipo_aplicacion,
          fmtMoney(cb.monto_aplicado), cb.metodo_pago, labelStatus(cb.estado)
        ])
      )}</div>
    </div>
    ${data.renegociaciones.length ? `
    <div class="detail-section">
      <h4>Renegociaciones (${data.renegociaciones.length})</h4>
      <div class="table-wrap">${table(
        ["Fecha", "Motivo"],
        data.renegociaciones.map((r) => [fmtDate(r.fecha), r.motivo])
      )}</div>
    </div>` : ""}
  `;

  const { close, root } = openViewModal({ title: `Contrato ${c.numero_contrato}`, body });

  // Delegación local: los botones cobrar-* están DENTRO del modal, no en el content principal
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || !root.contains(btn)) return;
    const action = btn.dataset.action;
    if (action === "cobrar-inicial") {
      openCobrarInicialModal(Number(btn.dataset.contratoId), Number(btn.dataset.monto), close);
    } else if (action === "cobrar-cuota") {
      openCobrarCuotaModal({
        idContrato: Number(btn.dataset.contratoId),
        idCuota: Number(btn.dataset.cuotaId),
        numero: btn.dataset.numero,
        fechaVencimiento: btn.dataset.vencimiento,
        balance: Number(btn.dataset.balance)
      }, close);
    } else if (action === "cobrar-mora") {
      openCobrarMoraModal({
        idContrato: Number(btn.dataset.contratoId),
        idMora: Number(btn.dataset.moraId),
        numeroCuota: btn.dataset.numero,
        balance: Number(btn.dataset.balance)
      }, close);
    } else if (action === "ajustar-mora") {
      openAjustarMoraModal({
        idMora: Number(btn.dataset.moraId),
        montoActual: Number(btn.dataset.monto),
        pagado: Number(btn.dataset.pagado),
        numeroCuota: btn.dataset.numero
      }, close);
    } else if (action === "anular-mora") {
      openAnularMoraModal({
        idMora: Number(btn.dataset.moraId),
        numeroCuota: btn.dataset.numero
      }, close);
    }
  });
}

function openAjustarMoraModal(mora, closeParent) {
  openModal({
    title: `Ajustar mora — cuota #${mora.numeroCuota}`,
    body: `
      <p class="hint">Monto actual: <strong>${fmtMoney(mora.montoActual)}</strong>${mora.pagado > 0 ? ` · Ya pagado: <strong>${fmtMoney(mora.pagado)}</strong> (el nuevo monto no puede ser menor)` : ""}</p>
      <label class="field"><span>Nuevo monto</span>
        <input name="nuevoMonto" type="number" step="0.01" min="${Math.max(0.01, mora.pagado)}" value="${mora.montoActual}" required></label>
      <label class="field"><span>Motivo (obligatorio)</span>
        <textarea name="motivo" rows="3" required minlength="3" placeholder="Ej: documentación válida presentada, descuento comercial autorizado…"></textarea></label>
    `,
    submitLabel: "Ajustar mora",
    onSubmit: async (data) => {
      await api(`/api/mora/${mora.idMora}`, { method: "PUT", body: JSON.stringify({
        nuevoMonto: Number(data.nuevoMonto), motivo: data.motivo
      })});
      toast("Mora ajustada", "success");
      if (closeParent) closeParent();
      await load();
    }
  });
}

function openAnularMoraModal(mora, closeParent) {
  openModal({
    title: `Anular mora — cuota #${mora.numeroCuota}`,
    body: `
      <p class="hint">Solo procede si la mora no tiene pagos aplicados. Si ya se pagó algo, anula primero los cobros correspondientes.</p>
      <label class="field"><span>Motivo (obligatorio)</span>
        <textarea name="motivo" rows="3" required minlength="3" placeholder="Ej: error en generación, ajuste comercial autorizado…"></textarea></label>
    `,
    submitLabel: "Anular mora",
    danger: true,
    onSubmit: async (data) => {
      await api(`/api/mora/${mora.idMora}`, { method: "DELETE", body: JSON.stringify({ motivo: data.motivo })});
      toast("Mora anulada", "success");
      if (closeParent) closeParent();
      await load();
    }
  });
}

// ---------- Cobro directo desde detalle de contrato ----------
function metodoPagoSelect(name = "metodoPago") {
  return `<select name="${name}">
    <option>Efectivo</option><option>Transferencia</option><option>Deposito</option>
    <option>Cheque</option><option>Tarjeta</option><option>Otro</option>
  </select>`;
}

function openCobrarInicialModal(idContrato, montoInicialPendiente, closeParent) {
  openModal({
    title: "Cobrar inicial",
    body: `
      <p class="hint">Este cobro activará el contrato y marcará el solar como <strong>Vendido</strong>.</p>
      <label class="field"><span>Monto (debe cubrir el inicial completo)</span>
        <input name="monto" type="number" step="0.01" min="${montoInicialPendiente}" value="${montoInicialPendiente}" required></label>
      <label class="field"><span>Método de pago</span>${metodoPagoSelect()}</label>
      <label class="field"><span>Referencia</span><input name="referenciaPago" placeholder="Opcional"></label>
    `,
    submitLabel: "Registrar cobro inicial",
    onSubmit: async (data) => {
      await api("/api/cobros", { method: "POST", body: JSON.stringify({
        idContrato, tipoAplicacion: "Inicial",
        monto: Number(data.monto),
        metodoPago: data.metodoPago,
        referenciaPago: data.referenciaPago || null
      })});
      toast("Contrato activado — solar vendido", "success");
      if (closeParent) closeParent();
      await load();
    }
  });
}

function openCobrarCuotaModal(cuota, closeParent) {
  openModal({
    title: `Cobrar cuota #${cuota.numero}`,
    body: `
      <p class="hint">Vence: <strong>${fmtDate(cuota.fechaVencimiento)}</strong> · Balance pendiente: <strong>${fmtMoney(cuota.balance)}</strong></p>
      <label class="field"><span>Monto</span>
        <input name="monto" type="number" step="0.01" min="0.01" max="${cuota.balance}" value="${cuota.balance}" required></label>
      <label class="field"><span>Tipo</span>
        <select name="tipoAplicacion">
          <option value="Cuota">Cuota (pago normal)</option>
          <option value="Adelanto">Adelanto (pago anticipado)</option>
        </select>
      </label>
      <label class="field"><span>Método de pago</span>${metodoPagoSelect()}</label>
      <label class="field"><span>Referencia</span><input name="referenciaPago" placeholder="Opcional"></label>
    `,
    submitLabel: "Registrar cobro",
    onSubmit: async (data) => {
      await api("/api/cobros", { method: "POST", body: JSON.stringify({
        idContrato: cuota.idContrato,
        idCuota: cuota.idCuota,
        tipoAplicacion: data.tipoAplicacion,
        monto: Number(data.monto),
        metodoPago: data.metodoPago,
        referenciaPago: data.referenciaPago || null
      })});
      toast(`Cuota #${cuota.numero} cobrada`, "success");
      if (closeParent) closeParent();
      await load();
    }
  });
}

function openCobrarMoraModal(mora, closeParent) {
  openModal({
    title: `Cobrar mora — cuota #${mora.numeroCuota}`,
    body: `
      <p class="hint">Balance pendiente de mora: <strong>${fmtMoney(mora.balance)}</strong>. Se permite pago parcial.</p>
      <label class="field"><span>Monto</span>
        <input name="monto" type="number" step="0.01" min="0.01" max="${mora.balance}" value="${mora.balance}" required></label>
      <label class="field"><span>Método de pago</span>${metodoPagoSelect()}</label>
      <label class="field"><span>Referencia</span><input name="referenciaPago" placeholder="Opcional"></label>
    `,
    submitLabel: "Registrar pago de mora",
    onSubmit: async (data) => {
      await api("/api/cobros", { method: "POST", body: JSON.stringify({
        idContrato: mora.idContrato,
        idMora: mora.idMora,
        tipoAplicacion: "Mora",
        monto: Number(data.monto),
        metodoPago: data.metodoPago,
        referenciaPago: data.referenciaPago || null
      })});
      toast("Pago de mora registrado", "success");
      if (closeParent) closeParent();
      await load();
    }
  });
}

async function openSolarDetalle(idSolar) {
  let data;
  try { data = await api(`/api/solares/${idSolar}/historial`); }
  catch (err) { return toast(humanErrorMessage(err), "error", 6000); }
  const { solar, reservas, ventas, auditoria } = data;
  const canBlockAdmin = can("registrar_solar");
  const bloqueoManual = solar.tipo_bloqueo && solar.tipo_bloqueo !== "Venta pendiente de inicial";
  const puedeBloquear = canBlockAdmin && ["Disponible", "Reservado"].includes(solar.estado);
  const puedeDesbloquear = canBlockAdmin && solar.estado === "Bloqueado" && bloqueoManual;
  const acciones = [];
  if (puedeBloquear) acciones.push(`<button class="btn warning btn-sm" data-action="bloquear-solar" data-id="${solar.id_solar}">Bloquear administrativamente</button>`);
  if (puedeDesbloquear) acciones.push(`<button class="btn btn-sm" data-action="desbloquear-solar" data-id="${solar.id_solar}">Desbloquear</button>`);
  const body = `
    ${acciones.length ? `<div class="detail-actions">${acciones.join(" ")}</div>` : ""}
    <section class="grid">
      ${metric("Estado actual", solar.estado)}
      ${metric("Precio total", fmtMoney(solar.precio_total))}
      ${metric("Metros²", solar.metros_cuadrados)}
      ${metric("Precio/m²", fmtMoney(solar.precio_por_metro))}
    </section>
    <br>
    <div class="detail-section">
      <h4>Datos del solar</h4>
      <div class="two">
        <div><strong>Proyecto:</strong> ${escapeHtml(solar.proyecto)}</div>
        <div><strong>Manzana / número:</strong> ${escapeHtml(solar.manzana)} / ${escapeHtml(solar.numero_solar)}</div>
        <div><strong>Tipo de bloqueo:</strong> ${escapeHtml(solar.tipo_bloqueo || "—")}</div>
        <div><strong>Ubicación:</strong> ${escapeHtml(solar.ubicacion_ref || "—")}</div>
        <div><strong>Creado por:</strong> ${escapeHtml(solar.creado_por || "—")}</div>
        <div><strong>Modificado por:</strong> ${escapeHtml(solar.modificado_por || "—")}</div>
      </div>
      ${solar.observaciones ? `<p><strong>Observaciones:</strong> ${escapeHtml(solar.observaciones)}</p>` : ""}
    </div>
    <div class="detail-section">
      <h4>Reservas (${reservas.length})</h4>
      <div class="table-wrap">${table(
        ["Reserva", "Expira", "Cliente", "Vendedor", "Estado"],
        reservas.map((r) => [
          fmtDate(r.fecha_reserva),
          fmtDate(r.fecha_expiracion),
          r.cliente, r.vendedor || "—",
          labelStatus(r.estado)
        ])
      )}</div>
    </div>
    <div class="detail-section">
      <h4>Ventas (${ventas.length})</h4>
      <div class="table-wrap">${table(
        ["Fecha", "Cliente", "Vendedor", "Precio", "Contrato", "Estado contrato", "Balance"],
        ventas.map((v) => [
          fmtDate(v.fecha_venta), v.cliente, v.vendedor || "—",
          fmtMoney(v.precio_total),
          v.numero_contrato || "—",
          v.estado_contrato ? labelStatus(v.estado_contrato) : labelStatus(v.estado_venta),
          fmtMoney(v.balance_pendiente || 0)
        ])
      )}</div>
    </div>
    <div class="detail-section">
      <h4>Bitácora del solar (${auditoria.length})</h4>
      <div class="table-wrap">${table(
        ["Fecha", "Usuario", "Acción"],
        auditoria.map((a) => [fmtDateTime(a.fecha_hora), a.usuario || "—", a.accion])
      )}</div>
    </div>
  `;
  openViewModal({ title: `Solar ${solar.manzana}-${solar.numero_solar} — ${solar.proyecto}`, body });
}

function openCambiarPasswordModal(forced) {
  openModal({
    title: forced ? "Debes cambiar tu contraseña" : "Cambiar contraseña",
    body: `
      ${forced ? `<p class="hint"><strong>Primer ingreso detectado.</strong> Cambia tu contraseña temporal antes de continuar.</p>` : ""}
      <label class="field"><span>Contraseña actual</span><input name="passwordActual" type="password" required autocomplete="current-password"></label>
      <label class="field"><span>Nueva contraseña (mín. 8 caracteres)</span><input name="passwordNuevo" type="password" required minlength="8" autocomplete="new-password"></label>
      <label class="field"><span>Confirmar</span><input name="passwordConfirm" type="password" required minlength="8" autocomplete="new-password"></label>
    `,
    submitLabel: "Actualizar contraseña",
    cancelLabel: forced ? "Salir" : "Cancelar",
    onSubmit: async (data) => {
      if (data.passwordNuevo !== data.passwordConfirm) {
        throw new Error("Las contraseñas nuevas no coinciden");
      }
      await api("/api/cambiar-password", { method: "POST", body: JSON.stringify({
        passwordActual: data.passwordActual, passwordNuevo: data.passwordNuevo
      })});
      state.user.passwordDebeCambiar = false;
      localStorage.setItem("svs_user", JSON.stringify(state.user));
      toast("Contraseña actualizada", "success");
    }
  });
}

async function openReciboDetalle(idCobro) {
  let data;
  try { data = await api(`/api/cobros/${idCobro}/detalle`); }
  catch (err) { return toast(humanErrorMessage(err), "error", 6000); }
  const { cobro, detalles, config } = data;
  const simbolo = config.simbolo_moneda || "RD$";
  const totalLetras = String(cobro.monto_total);

  const body = `
    <div class="receipt">
      ${(!config.nombre_empresa || config.nombre_empresa === "Nombre de la Inmobiliaria" || !config.rnc_empresa || config.rnc_empresa === "000-00000-0")
        ? `<div class="receipt-warning no-print">⚠ Este recibo muestra datos empresariales placeholder. Actualízalos en Configuración antes de imprimirlo para un cliente.</div>` : ""}
      <header class="receipt-head">
        <div class="receipt-empresa">
          ${config.nombre_empresa ? `<strong class="receipt-empresa-name">${escapeHtml(config.nombre_empresa)}</strong>` : ""}
          ${config.rnc_empresa ? `<div>RNC: ${escapeHtml(config.rnc_empresa)}</div>` : ""}
          ${config.direccion_empresa ? `<div>${escapeHtml(config.direccion_empresa)}</div>` : ""}
          ${config.telefono_empresa ? `<div>Tel: ${escapeHtml(config.telefono_empresa)}</div>` : ""}
          <h4 style="margin-top:12px;">Recibo de pago</h4>
          <p class="receipt-num">N.° ${escapeHtml(cobro.numero_recibo)}</p>
        </div>
        <div class="receipt-status">
          ${labelStatus(cobro.estado)}
          <div>${fmtDate(cobro.fecha_pago)}</div>
        </div>
      </header>
      <section class="receipt-parties">
        <div>
          <p class="label">Cliente</p>
          <strong>${escapeHtml(cobro.cliente_nombre)}</strong><br>
          Cédula/RNC: ${escapeHtml(cobro.cedula_rnc || "")}<br>
          ${cobro.telefono ? `Tel: ${escapeHtml(cobro.telefono)}<br>` : ""}
          ${cobro.direccion ? `Dir: ${escapeHtml(cobro.direccion)}` : ""}
        </div>
        <div>
          <p class="label">Contrato</p>
          <strong>${escapeHtml(cobro.numero_contrato)}</strong><br>
          Estado: ${escapeHtml(cobro.estado_contrato)}<br>
          Solar: ${escapeHtml(cobro.manzana)} - ${escapeHtml(cobro.numero_solar)}<br>
          Proyecto: ${escapeHtml(cobro.proyecto)}
        </div>
      </section>
      <section class="receipt-body">
        <table class="receipt-table">
          <thead><tr><th>Aplicación</th><th>Referencia</th><th class="right">Monto</th></tr></thead>
          <tbody>
            ${detalles.map((d) => {
              let ref = "—";
              if (d.tipo_aplicacion === "Cuota" || d.tipo_aplicacion === "Adelanto") {
                ref = d.numero_cuota ? `Cuota #${d.numero_cuota} (vence ${fmtDate(d.fecha_vencimiento)})` : "—";
              } else if (d.tipo_aplicacion === "Mora") {
                ref = d.id_mora ? `Mora #${d.id_mora}` : "—";
              } else if (d.tipo_aplicacion === "Inicial") {
                ref = "Pago inicial del contrato";
              } else if (d.tipo_aplicacion === "Abono a capital") {
                ref = "Abono a capital (renegociación)";
              }
              return `<tr><td>${escapeHtml(d.tipo_aplicacion)}</td><td>${escapeHtml(ref)}</td><td class="right">${escapeHtml(simbolo)} ${fmtMoney(d.monto_aplicado).replace(/[^\d.,-]/g, "")}</td></tr>`;
            }).join("")}
          </tbody>
          <tfoot>
            <tr><th colspan="2" class="right">Total</th><th class="right">${escapeHtml(simbolo)} ${fmtMoney(cobro.monto_total).replace(/[^\d.,-]/g, "")}</th></tr>
          </tfoot>
        </table>
      </section>
      <section class="receipt-meta">
        <div><strong>Método de pago:</strong> ${escapeHtml(cobro.metodo_pago)}</div>
        ${cobro.referencia_pago ? `<div><strong>Referencia:</strong> ${escapeHtml(cobro.referencia_pago)}</div>` : ""}
        <div><strong>Cajero:</strong> ${escapeHtml(cobro.cajero_nombre)}</div>
      </section>
      ${cobro.estado === "Anulado" ? `
      <section class="receipt-void">
        <strong>ANULADO</strong> el ${fmtDateTime(cobro.fecha_anulacion)} por ${escapeHtml(cobro.anulado_por || "—")}<br>
        Motivo: ${escapeHtml(cobro.motivo_anulacion || "")}
      </section>` : ""}
      <footer class="receipt-foot">
        <div class="signature">___________________________<br>Firma del cliente</div>
        <div class="signature">___________________________<br>Firma del cajero</div>
      </footer>
      ${config.nota_legal_recibo ? `<p class="receipt-nota">${escapeHtml(config.nota_legal_recibo)}</p>` : ""}
    </div>
  `;
  const extraFooter = `<button type="button" class="btn" onclick="window.print()">Imprimir</button>`;
  openViewModal({ title: `Recibo ${cobro.numero_recibo}`, body, printable: true, extraFooter });
}

function bindForm(id, path, successMsg, method = "POST") {
  const form = byId(id);
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    withLoading(btn, "Guardando…", async () => {
      const payload = cleanPayload(Object.fromEntries(new FormData(form)));
      try {
        await api(path, { method, body: JSON.stringify(payload) });
        toast(successMsg || "Operación registrada", "success");
        await load();
      } catch (err) {
        toast(humanErrorMessage(err), "error", 6000);
      }
    });
  });
}

async function withLoading(btn, loadingText, fn) {
  if (!btn) return fn();
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = loadingText;
  try { await fn(); }
  finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([, value]) => value !== "" && value !== null && value !== undefined)
  );
}

function debounce(fn, ms) {
  let handle;
  return (...args) => {
    clearTimeout(handle);
    handle = setTimeout(() => fn(...args), ms);
  };
}

function exportToCSV(filename, headers, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v).replace(/<[^>]+>/g, "");
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// ---------- Selects y labels ----------
function select(name, items, label, optional = false) {
  const labeler = typeof label === "function" ? label : (item) => item[label];
  const opts = items.map((item) => `<option value="${item.id}">${escapeHtml(labeler(item))}</option>`).join("");
  return `<select name="${name}" ${optional ? "" : "required"}>${optional ? "<option value=''>No aplica</option>" : ""}${opts}</select>`;
}

function lotName(item) {
  const project = state.data.proyectos.find((p) => p.id === item.proyectoId);
  return `${project ? project.nombre : "Proyecto"} | Mz ${item.manzana} Solar ${item.numero} | ${fmtMoney(item.precioTotal)} | ${item.estado}`;
}

function contractName(item) {
  const venta = state.data.ventas.find((v) => v.id === item.ventaId);
  const cliente = venta && state.data.clientes.find((c) => c.id === venta.clienteId);
  return `${item.numero} | ${cliente ? cliente.nombre : ""} | ${item.estado} | Balance ${fmtMoney(item.balance)}`;
}

function quotaName(item) {
  return `Cuota ${item.numero} | vence ${fmtDate(item.fechaVencimiento)} | balance ${fmtMoney(item.balancePendiente)}`;
}

function lateFeeName(item) {
  const cuota = state.data.cuotas.find((q) => q.id === item.cuotaId);
  return `Mora cuota ${cuota ? cuota.numero : ""} | balance ${fmtMoney(item.balancePendiente)}`;
}

// ---------- Tablas ----------
function clientsTable(items) {
  const canEdit = can("editar_cliente");
  const headers = ["Código", "Nombre", "Cédula/RNC", "Teléfono", "Estado", "Acciones"];
  return table(
    headers,
    items.map((i) => {
      const actions = [`<button class="btn secondary btn-sm" data-action="view-client" data-id="${i.id}">Ver</button>`];
      if (canEdit) actions.push(`<button class="btn secondary btn-sm" data-action="edit-client" data-id="${i.id}">Editar</button>`);
      return [i.codigo, i.nombre, i.cedulaRnc, i.telefono, labelStatus(i.estado), actions.join(" ")];
    })
  );
}

function projectsTable(items) {
  return table(
    ["Código", "Nombre", "Ubicación", "Solares", "Estado"],
    items.map((i) => [i.codigo, i.nombre, i.ubicacion, i.cantidadSolares, labelStatus(i.estado)])
  );
}

function lotsTable(items) {
  return table(
    ["Código", "Proyecto", "Manzana", "Número", "Precio", "Estado", "Acciones"],
    items.map((i) => {
      const project = state.data.proyectos.find((p) => p.id === i.proyectoId);
      return [
        i.codigo,
        project ? project.nombre : "",
        i.manzana,
        i.numero,
        fmtMoney(i.precioTotal),
        labelStatus(i.estado),
        `<button class="btn secondary btn-sm" data-action="view-solar" data-id="${i.id}">Ver historial</button>`
      ];
    })
  );
}

function reservationsTable(items) {
  const canCancel = can("reservar_solar");
  return table(
    ["Cliente", "Solar", "Reserva", "Expira", "Estado", "Acciones"],
    items.map((i) => {
      const client = state.data.clientes.find((c) => c.id === i.clienteId);
      const lot = state.data.solares.find((s) => s.id === i.solarId);
      const acciones = (canCancel && i.estado === "Activa")
        ? `<button class="btn danger btn-sm" data-action="cancel-reserva" data-id="${i.id}">Cancelar</button>`
        : "";
      return [
        client ? client.nombre : "",
        lot ? lot.codigo : "",
        fmtDate(i.fechaReserva),
        fmtDate(i.fechaExpiracion),
        labelStatus(i.estado),
        acciones
      ];
    })
  );
}

function salesTable(items) {
  const canAnular = can("anular_venta");
  return table(
    ["Venta", "Cliente", "Solar", "Total", "Inicial", "Estado", "Acciones"],
    items.map((i) => {
      const client = state.data.clientes.find((c) => c.id === i.clienteId);
      const lot = state.data.solares.find((s) => s.id === i.solarId);
      const contrato = state.data.contratos.find((c) => c.ventaId === i.id);
      const actions = [];
      if (contrato) actions.push(`<button class="btn secondary btn-sm" data-action="view-contrato" data-id="${contrato.id}">Ver</button>`);
      if (canAnular && contrato && contrato.estado === "Pendiente de inicial") {
        actions.push(`<button class="btn danger btn-sm" data-action="anular-venta" data-id="${i.id}">Anular</button>`);
      }
      return [
        i.numero,
        client ? client.nombre : "",
        lot ? lot.codigo : "",
        fmtMoney(i.precioTotal),
        fmtMoney(i.montoInicial),
        labelStatus(i.estado),
        actions.join(" ")
      ];
    })
  );
}

function contractsTable(items) {
  return table(
    ["Contrato", "Venta", "Estado", "Balance", "Renegociado", "Acciones"],
    items.map((i) => {
      const sale = state.data.ventas.find((v) => v.id === i.ventaId);
      return [
        i.numero,
        sale ? sale.numero : "",
        labelStatus(i.estado),
        fmtMoney(i.balance),
        i.esRenegociado ? "Sí" : "No",
        `<button class="btn secondary btn-sm" data-action="view-contrato" data-id="${i.id}">Ver</button>`
      ];
    })
  );
}

function quotasTable(items) {
  return table(
    ["Contrato", "Cuota", "Vence", "Monto", "Pagado", "Balance", "Estado"],
    items.map((i) => {
      const contract = state.data.contratos.find((c) => c.id === i.contratoId);
      return [
        contract ? contract.numero : "",
        i.numero,
        fmtDate(i.fechaVencimiento),
        fmtMoney(i.monto),
        fmtMoney(i.montoPagado),
        fmtMoney(i.balancePendiente),
        labelStatus(i.estado)
      ];
    })
  );
}

function collectionsTable(items) {
  const canAnular = can("anular_recibo");
  return table(
    ["Recibo", "Contrato", "Fecha", "Monto", "Método", "Estado", "Acciones"],
    items.map((i) => {
      const contract = state.data.contratos.find((c) => c.id === i.contratoId);
      const actions = [`<button class="btn secondary btn-sm" data-action="view-recibo" data-id="${i.id}">Ver</button>`];
      if (canAnular && i.estado === "Registrado") {
        actions.push(`<button class="btn danger btn-sm" data-action="anular-cobro" data-id="${i.id}">Anular</button>`);
      }
      return [
        i.numero,
        contract ? contract.numero : "",
        fmtDate(i.fechaPago),
        fmtMoney(i.montoTotal),
        i.metodoPago,
        labelStatus(i.estado),
        actions.join(" ")
      ];
    })
  );
}

function lateFeesTable(items) {
  return table(
    ["Cuota", "Inicio", "Días", "Base", "Mora", "Pagado", "Balance", "Estado"],
    items.map((i) => {
      const quota = state.data.cuotas.find((q) => q.id === i.cuotaId);
      return [
        quota ? quota.numero : "",
        fmtDate(i.fechaInicioMora),
        i.diasAtraso,
        fmtMoney(i.balanceBaseCalculo),
        fmtMoney(i.montoMora),
        fmtMoney(i.montoPagado),
        fmtMoney(i.balancePendiente),
        labelStatus(i.estado)
      ];
    })
  );
}

function auditTable(items) {
  return table(
    ["Fecha", "Usuario", "Acción", "Entidad"],
    items.map((i) => [fmtDateTime(i.fecha), i.usuario, i.accion, i.entidad])
  );
}

function rolesTable(items) {
  return table(
    ["Rol", "Permisos"],
    items.map((i) => [i.nombre, (i.permisos || []).join(", ")])
  );
}

function table(headers, rows) {
  return `
    <table>
      <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.length
          ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell == null ? "" : (typeof cell === "string" && cell.startsWith("<") ? cell : escapeHtml(cell))}</td>`).join("")}</tr>`).join("")
          : `<tr><td colspan="${headers.length}">Sin registros</td></tr>`}
      </tbody>
    </table>
  `;
}

// Escape cierra el modal más reciente (encima) — soporta modales anidados
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const backdrops = document.querySelectorAll(".modal-backdrop");
  if (backdrops.length === 0) return;
  const last = backdrops[backdrops.length - 1];
  last.remove();
  e.stopPropagation();
});

// ---------- Boot ----------
load().catch((error) => {
  app.innerHTML = `<div class="card"><h1>Error</h1><p>${escapeHtml(error.message)}</p></div>`;
});
