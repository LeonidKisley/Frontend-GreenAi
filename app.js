// ==================================================================
// CONFIGURACIÓN DEL ENDPOINT BACKEND
// ==================================================================
const API_URL = (() => {
  const origin = window.location.origin;
  if (!origin || origin === 'null' || origin === 'file://') {
    return 'http://localhost:3001/api';
  }
  return `${origin}/api`;
})();

// Cliente puro: las métricas se consumen directamente del green-ai-gateway (puerto 8081)
const MONITORING_URL = 'http://localhost:8081/api/monitoring/v1/metrics';

// ==================================================================
// ADAPTADORES DEL CONTRATO DEL GATEWAY (/api/monitoring/v1/metrics)
// ==================================================================
function normalizeNode(node) {
  return {
    hostname: node.hostname || node.nodeId || 'NODE-XX',
    hardware_id: node.nodeId || null,
    ip_address: node.ipAddress || '10.0.0.1',
    cpu_cores: node.cpuCores || 0,
    ram_gb: node.ramGb || 0,
    max_watts: node.maxWatts || 0,
    estado: node.estado || 'ACTIVO',
    usuario: node.usuario ? { nombre_completo: node.usuario.nombreCompleto } : null
  };
}

function normalizeSnapshot(snapshot) {
  return {
    hostname: snapshot.hostname || snapshot.nodeId || 'NODE-XX',
    timestamp: snapshot.timestamp || null,
    cpu_utilization_pct: snapshot.cpuUtilizationPct ?? 0,
    ram_utilization_pct: snapshot.ramUtilizationPct ?? 0,
    temperatura_celsius: snapshot.temperaturaCelsius ?? 0,
    energia_watts: snapshot.energiaWatts ?? 0,
    estado: snapshot.estado || 'ACTIVO'
  };
}

async function fetchMonitoring(path) {
  const res = await fetch(`${MONITORING_URL}/${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${path}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function computeKPIs(current) {
  const list = Array.isArray(current) ? current : [];
  const active = list.filter((s) => (s.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO');
  const avg = (key) => (list.length ? Math.round(list.reduce((acc, s) => acc + Number(s[key] || 0), 0) / list.length) : 0);
  return {
    nodosActivos: active.length || list.length,
    totalWatts: avg('energia_watts'),
    cpuAvg: avg('cpu_utilization_pct'),
    ramAvg: avg('ram_utilization_pct')
  };
}

function updateClock() {
  const clock = document.getElementById('live-clock');
  if (!clock) return;
  clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function applyTheme(isLight) {
  document.documentElement.classList.toggle('light-mode', isLight);
  if (document.body) document.body.classList.toggle('light-mode', isLight);
}

function isLightTheme() {
  return document.documentElement.classList.contains('light-mode') || (document.body && document.body.classList.contains('light-mode'));
}

function syncThemeUI() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  const isLight = isLightTheme();
  toggle.setAttribute('aria-checked', String(isLight));
  toggle.title = isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
}

function bindThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  toggle.addEventListener('click', () => {
    const isLight = !isLightTheme();
    applyTheme(isLight);
    localStorage.setItem('greenai-theme', isLight ? 'light' : 'dark');
    updateChartColors(isLight ? '#475569' : '#94A3B8', isLight ? '#CBD5E1' : '#334155');
    syncThemeUI();
  });

  if (localStorage.getItem('greenai-theme') === 'light') {
    applyTheme(true);
    updateChartColors('#475569', '#CBD5E1');
  }
  syncThemeUI();
}

function renderUserProfile() {
  const userRaw = localStorage.getItem('usuarioLogueado');
  if (!userRaw) return;

  try {
    const user = JSON.parse(userRaw);
    const display = document.getElementById('user-name-display');
    if (display && user) {
      display.textContent = user.nombre_completo || user.nombre || 'Operador';
    }
  } catch (error) {
    console.error('Error leyendo sesión:', error);
  }
}

function setupPasswordStrength() {
  const passwordInput = document.getElementById('password');
  const strengthFill = document.getElementById('strength-fill');
  const strengthText = document.getElementById('strength-text');
  if (!passwordInput || !strengthFill || !strengthText) return;

  const evaluateStrength = (value) => {
    let score = 0;
    if (value.length >= 8) score += 1;
    if (/[A-Z]/.test(value)) score += 1;
    if (/[0-9]/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;

    if (score <= 1) {
      strengthFill.style.width = '25%';
      strengthFill.style.background = '#EF4444';
      strengthText.textContent = 'Fuerza: baja';
      return;
    }

    if (score === 2) {
      strengthFill.style.width = '50%';
      strengthFill.style.background = '#F59E0B';
      strengthText.textContent = 'Fuerza: media';
      return;
    }

    if (score === 3) {
      strengthFill.style.width = '75%';
      strengthFill.style.background = '#06B6D4';
      strengthText.textContent = 'Fuerza: alta';
      return;
    }

    strengthFill.style.width = '100%';
    strengthFill.style.background = '#10B981';
    strengthText.textContent = 'Fuerza: robusta';
  };

  passwordInput.addEventListener('input', (event) => evaluateStrength(event.target.value));
}

function isProtectedPage() {
  const path = window.location.pathname.toLowerCase();
  return path.endsWith('/dashboard.html') || path.endsWith('/network.html');
}

function checkAuthSession() {
  const userRaw = localStorage.getItem('usuarioLogueado');
  if (!userRaw) {
    if (isProtectedPage()) {
      window.location.href = 'login.html';
    }
    return null;
  }

  try {
    const parsed = JSON.parse(userRaw);
    if (!parsed || !parsed.email) {
      throw new Error('Usuario inválido');
    }
    return parsed;
  } catch (error) {
    console.error('Error leyendo sesión:', error);
    localStorage.removeItem('usuarioLogueado');
    if (isProtectedPage()) {
      window.location.href = 'login.html';
    }
    return null;
  }
}

function setupLogoutButton() {
  const logoutBtn = document.getElementById('logout-btn');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('usuarioLogueado');
    window.location.href = 'login.html';
  });
}

function getSessionUser() {
  try {
    const parsed = JSON.parse(localStorage.getItem('usuarioLogueado'));
    return parsed && parsed.email ? parsed : null;
  } catch (error) {
    return null;
  }
}

function renderSettingsAccount() {
  const nameEl = document.getElementById('settings-user-name');
  const emailEl = document.getElementById('settings-user-email');
  const roleEl = document.getElementById('settings-user-role');
  const btn = document.getElementById('settings-account-btn');
  if (!nameEl || !btn) return;

  const user = getSessionUser();
  if (user) {
    nameEl.textContent = user.nombre_completo || user.nombre || 'Operador';
    if (emailEl) emailEl.textContent = user.email || '';
    if (roleEl) {
      roleEl.textContent = (user.rol || 'OPERADOR').toUpperCase();
      roleEl.className = 'tag cyan';
    }
    btn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Cerrar sesión';
    btn.dataset.action = 'logout';
  } else {
    nameEl.textContent = 'Invitado';
    if (emailEl) emailEl.textContent = 'No has iniciado sesión';
    if (roleEl) roleEl.textContent = '';
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Iniciar sesión';
    btn.dataset.action = 'login';
  }
}

function setupSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;

  const openBtn = document.getElementById('settings-btn');
  const closeBtn = document.getElementById('settings-close');
  const accountBtn = document.getElementById('settings-account-btn');
  const openSettings = () => {
    renderSettingsAccount();
    modal.hidden = false;
    document.body.classList.add('modal-open');
  };
  const closeSettings = () => {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
  };

  if (openBtn) openBtn.addEventListener('click', openSettings);
  if (closeBtn) closeBtn.addEventListener('click', closeSettings);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeSettings();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) closeSettings();
  });

  if (accountBtn) {
    accountBtn.addEventListener('click', () => {
      if (accountBtn.dataset.action === 'logout') {
        localStorage.removeItem('usuarioLogueado');
        window.location.href = 'login.html';
      } else {
        window.location.href = 'login.html';
      }
    });
  }
}

function bindPublicNavState() {
  const isLogged = Boolean(localStorage.getItem('usuarioLogueado'));
  const dashboardLink = document.querySelector('a[href="dashboard.html"]');
  const loginLink = document.querySelector('a[href="login.html"]');
  const registerLink = document.querySelector('a[href="register.html"]');

  if (dashboardLink && isLogged) {
    dashboardLink.style.display = 'inline-flex';
  }

  if (loginLink && isLogged) {
    loginLink.style.display = 'none';
  }

  if (registerLink && isLogged) {
    registerLink.style.display = 'none';
  }
}

let wattsChart = null;
let resourcesChart = null;
let monthlyEnergyChart = null;

function initializeCharts() {
  const canvasWatts = document.getElementById('wattsChart');
  const canvasResources = document.getElementById('resourcesChart');
  const canvasMonthly = document.getElementById('monthlyEnergyChart');

  if (canvasWatts && typeof Chart !== 'undefined') {
    const ctxWatts = canvasWatts.getContext('2d');
    wattsChart = new Chart(ctxWatts, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Energía real (Watts)',
          data: [],
          fill: true,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.36
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { labels: { color: '#94A3B8', usePointStyle: true, boxWidth: 8 } },
          tooltip: { mode: 'index', intersect: false, titleColor: '#F8FAFC', bodyColor: '#E2E8F0', backgroundColor: '#0F172A' }
        },
        scales: {
          x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(148, 163, 184, 0.12)' } },
          y: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(148, 163, 184, 0.12)' } }
        }
      }
    });
  }

  if (canvasResources && typeof Chart !== 'undefined') {
    const ctxResources = canvasResources.getContext('2d');
    resourcesChart = new Chart(ctxResources, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'CPU (%)', data: [], borderColor: '#06B6D4', backgroundColor: 'rgba(6, 182, 212, 0.08)', fill: false, borderWidth: 2, pointRadius: 0, tension: 0.36 },
          { label: 'RAM (%)', data: [], borderColor: '#A855F7', backgroundColor: 'rgba(168, 85, 247, 0.08)', fill: false, borderWidth: 2, pointRadius: 0, tension: 0.36 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { labels: { color: '#94A3B8', usePointStyle: true, boxWidth: 8 } },
          tooltip: { mode: 'index', intersect: false, titleColor: '#F8FAFC', bodyColor: '#E2E8F0', backgroundColor: '#0F172A' }
        },
        scales: {
          x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(148, 163, 184, 0.12)' } },
          y: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(148, 163, 184, 0.12)' } }
        }
      }
    });
  }

  if (canvasMonthly && typeof Chart !== 'undefined') {
    const ctxMonthly = canvasMonthly.getContext('2d');
    monthlyEnergyChart = new Chart(ctxMonthly, {
      type: 'bar',
      data: {
        labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
        datasets: [{
          label: 'kWh',
          data: [330, 420, 390, 480, 460, 510],
          borderRadius: 10,
          backgroundColor: ['#06B6D4', '#22D3EE', '#A855F7', '#10B981', '#67E8F9', '#34D399']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#0F172A', titleColor: '#F8FAFC', bodyColor: '#E2E8F0' }
        },
        scales: {
          x: { ticks: { color: '#94A3B8' }, grid: { display: false } },
          y: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(148, 163, 184, 0.12)' } }
        }
      }
    });
  }
}

function updateChartColors(textColor, gridColor) {
  [wattsChart, resourcesChart, monthlyEnergyChart].forEach((chart) => {
    if (!chart) return;

    if (chart.options.plugins.legend) {
      chart.options.plugins.legend.labels.color = textColor;
    }

    if (chart.options.scales.x) {
      chart.options.scales.x.ticks.color = textColor;
      chart.options.scales.x.grid.color = gridColor;
    }

    if (chart.options.scales.y) {
      chart.options.scales.y.ticks.color = textColor;
      chart.options.scales.y.grid.color = gridColor;
    }

    chart.update();
  });
}

async function loadKPIs() {
  try {
    const kpis = computeKPIs((await fetchMonitoring('current')).map(normalizeSnapshot));

    const nodesEl = document.getElementById('kpi-nodes');
    const wattsEl = document.getElementById('kpi-watts');
    const cpuEl = document.getElementById('kpi-cpu');
    const ramEl = document.getElementById('kpi-ram');

    if (nodesEl) nodesEl.textContent = String(kpis.nodosActivos ?? '--');
    if (wattsEl) wattsEl.textContent = `${kpis.totalWatts} W`;
    if (cpuEl) cpuEl.textContent = `${kpis.cpuAvg} %`;
    if (ramEl) ramEl.textContent = `${kpis.ramAvg} %`;

    const nodesCard = document.querySelector('.kpi-card .kpi-value strong#kpi-nodes')?.closest('.kpi-card');
    if (nodesCard && !nodesCard.dataset.bound) {
      nodesCard.dataset.bound = 'true';
      nodesCard.style.cursor = 'pointer';
      nodesCard.addEventListener('click', () => {
        window.location.href = 'network.html';
      });
    }
  } catch (error) {
    console.error('Error al cargar KPIs:', error);
  }
}

async function loadUsuariosTable() {
  try {
    const tbody = document.getElementById('usuarios-table-body');
    if (!tbody) return;

    const res = await fetch(`${API_URL}/usuarios`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    tbody.innerHTML = (data || []).map((u) => `
      <tr>
        <td class="mono">${u.usuario_id || '--'}</td>
        <td>${u.nombre_completo || 'Sin nombre'}</td>
        <td>${u.email || 'N/A'}</td>
        <td><span class="tag cyan">${(u.rol || 'OPERATOR').toUpperCase()}</span></td>
        <td>${u.fecha_creacion ? new Date(u.fecha_creacion).toLocaleDateString() : 'N/A'}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error al cargar usuarios:', error);
  }
}

async function loadHardwareTable() {
  try {
    const tbody = document.getElementById('hardware-table-body');
    if (!tbody) return;

    const catalog = (await fetchMonitoring('catalog')).map(normalizeNode);

    tbody.innerHTML = catalog.map((h) => `
      <tr>
        <td>${h.hostname || 'N/A'}</td>
        <td class="mono">${h.ip_address || '0.0.0.0'}</td>
        <td>${h.cpu_cores || 0} cores</td>
        <td>${h.ram_gb || 0} GB</td>
        <td class="mono">${h.max_watts || 0} W</td>
        <td>${h.usuario?.nombre_completo || h.usuario_nombre || 'Sin asignar'}</td>
        <td><span class="tag ${h.estado === 'INACTIVO' ? 'purple' : 'success'}">${(h.estado || 'ACTIVO').toUpperCase()}</span></td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error al cargar hardware:', error);
  }
}

async function loadMonthlyEnergy() {
  if (!monthlyEnergyChart) return;

  try {
    const history = (await fetchMonitoring('history')).map(normalizeSnapshot);
    const ordered = [...history].reverse();
    const defaults = [330, 420, 390, 480, 460, 510];

    const points = Array.from({ length: 6 }, (_, idx) => {
      const item = ordered[idx] || {};
      return Number(item.energia_watts || defaults[idx] || 0);
    });

    monthlyEnergyChart.data.datasets[0].data = points;
    monthlyEnergyChart.update();
  } catch (error) {
    console.error('Error al cargar consumo mensual:', error);
  }
}

async function loadLogsAndCharts() {
  try {
    const history = (await fetchMonitoring('history')).map(normalizeSnapshot);
    const data = history;

    const tbody = document.getElementById('logs-table-body');
    if (tbody) {
      tbody.innerHTML = (data || []).slice(0, 10).map((log) => {
        const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '--:--:--';
        return `
          <tr>
            <td>${timestamp}</td>
            <td>${log.hostname || 'Servidor'}</td>
            <td>${log.cpu_utilization_pct ?? 0}%</td>
            <td>${log.ram_utilization_pct ?? 0}%</td>
            <td>${log.temperatura_celsius ?? 0} °C</td>
            <td class="mono">${log.energia_watts ?? 0} W</td>
          </tr>
        `;
      }).join('');
    }

    if (wattsChart && resourcesChart && Array.isArray(data)) {
      const ordered = [...data].reverse();
      const labels = ordered.map((log) => log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
      const wattsData = ordered.map((log) => Number(log.energia_watts ?? 0));
      const cpuData = ordered.map((log) => Number(log.cpu_utilization_pct ?? 0));
      const ramData = ordered.map((log) => Number(log.ram_utilization_pct ?? 0));

      wattsChart.data.labels = labels;
      wattsChart.data.datasets[0].data = wattsData;
      wattsChart.update();

      resourcesChart.data.labels = labels;
      resourcesChart.data.datasets[0].data = cpuData;
      resourcesChart.data.datasets[1].data = ramData;
      resourcesChart.update();
    }
  } catch (error) {
    console.error('Error al cargar logs y gráficos:', error);
  }
}

function setMessage(elementId, message, isError = false) {
  const messageBox = document.getElementById(elementId);
  if (!messageBox) return;
  messageBox.textContent = message;
  messageBox.style.color = isError ? '#EF4444' : '#10B981';
}

async function setupLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;
  const submitBtn = form.querySelector('button[type="submit"]');
  let isSubmitting = false;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value;

    if (!email || !password) {
      setMessage('message', 'Completa correo y contraseña.', true);
      return;
    }

    isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.original = submitBtn.innerHTML;
      submitBtn.innerHTML = 'Ingresando...';
    }

    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al iniciar sesión.');

      const usuario = data.usuario || { nombre_completo: 'Usuario' };
      localStorage.setItem('usuarioLogueado', JSON.stringify(usuario));
      setMessage('message', '¡Bienvenido! Redirigiendo...');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
    } catch (error) {
      setMessage('message', error.message || 'Error de conexión.', true);
    } finally {
      isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = submitBtn.dataset.original || submitBtn.innerHTML;
        delete submitBtn.dataset.original;
      }
    }
  });
}

async function setupRegisterForm() {
  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const nombre = document.getElementById('nombre_completo')?.value.trim();
    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value;
    const confirmPassword = document.getElementById('confirm_password')?.value;
    const rol = document.getElementById('rol')?.value || 'OPERADOR';

    if (!nombre || !email || !password || !confirmPassword) {
      setMessage('message', 'Completa todos los campos.', true);
      return;
    }

    if (password !== confirmPassword) {
      setMessage('message', 'Las contraseñas no coinciden.', true);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_completo: nombre, email, password, rol })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al registrar usuario.');

      const usuario = (data && data.data && data.data[0]) || { nombre_completo: nombre, email, rol };
      localStorage.setItem('usuarioLogueado', JSON.stringify(usuario));
      setMessage('message', '¡Registro exitoso! Redirigiendo...');
      form.reset();
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
    } catch (error) {
      setMessage('message', error.message || 'Error de conexión.', true);
    }
  });
}

function renderHardwareCards(data) {
  // Esta función ahora estará manejada por el carrusel en initializeCarousel
}

// ========================================================================
// LÓGICA DEL CARRUSEL DE SERVIDORES
// ========================================================================
let carouselState = {
  servers: [],
  blocks: [],
  currentBlockIndex: 0,
  blockDuration: 8000, // 8 segundos
  transitionDuration: 600, // 600ms
  autoPlayInterval: null,
  isTransitioning: false,
  isPaused: false
};

// ========================================================================
// ESTADO Y HELPERS DE LA VISTA FÍSICA
// ========================================================================
const physicalViewState = {
  servers: []
};

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function buildPhysicalServers(hardware, logs) {
  const logsByHost = {};
  (Array.isArray(logs) ? logs : []).forEach((log) => {
    const key = log.hostname || (log.hardware && log.hardware.hostname) || '';
    if (key && logsByHost[key] === undefined) logsByHost[key] = log;
  });

  const mocks = generateMockServers(50);
  const hardwareList = Array.isArray(hardware) ? hardware : [];

  return Array.from({ length: 50 }, (_, index) => {
    const hw = hardwareList[index] || {};
    const live = logsByHost[hw.hostname] || {};
    const mock = mocks[index] || {};

    return {
      hostname: hw.hostname || mock.hostname || `NODE-${String(index + 1).padStart(2, '0')}`,
      hardware_id: hw.hardware_id || null,
      ip_address: hw.ip_address || `10.11.${Math.floor(index / 16)}.${(index % 16) + 10}`,
      cpu_cores: hw.cpu_cores || mock.cpu_cores || 16,
      ram_gb: hw.ram_gb || mock.ram_gb || 32,
      max_watts: hw.max_watts || mock.max_watts || 320,
      estado: hw.estado || mock.estado || 'ACTIVO',
      usuario: hw.usuario || null,
      cpu_utilization: live.cpu_utilization_pct !== undefined ? Number(live.cpu_utilization_pct) : Math.floor(Math.random() * 100),
      ram_utilization: live.ram_utilization_pct !== undefined ? Number(live.ram_utilization_pct) : Math.floor(Math.random() * 100),
      temperatura_celsius: live.temperatura_celsius !== undefined ? Number(live.temperatura_celsius) : 35 + Math.random() * 25,
      energia_watts: live.energia_watts !== undefined ? Number(live.energia_watts) : (hw.max_watts || 320)
    };
  });
}

function bladeTooltipHTML(server, rack) {
  const online = (server.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO';
  const estado = online ? 'ACTIVO' : 'INACTIVO';
  const cpu = Math.round(Number(server.cpu_utilization) || 0);
  const ram = Math.round(Number(server.ram_utilization) || 0);
  const watts = Math.round(Number(server.energia_watts) || 0);
  const temp = Number(server.temperatura_celsius || 0).toFixed(1);
  const idTxt = server.hardware_id ? escapeHtml(String(server.hardware_id)) : '<span class="tp-empty">—</span>';

  return [
    '<div class="tp-head">',
    '  <div class="tp-host-block">',
    `    <span class="tp-host">${escapeHtml(server.hostname)}</span>`,
    `    <span class="tp-id">HW-ID ${idTxt}</span>`,
    '  </div>',
    `  <span class="tp-status ${online ? 'online' : 'offline'}">${estado}</span>`,
    '</div>',
    '<div class="tp-grid">',
    `  <div class="tp-cell"><span>IP</span><strong class="mono">${escapeHtml(server.ip_address)}</strong></div>`,
    `  <div class="tp-cell"><span>CPU</span><strong>${cpu}%</strong></div>`,
    `  <div class="tp-cell"><span>RAM</span><strong>${ram}%</strong></div>`,
    `  <div class="tp-cell"><span>Consumo</span><strong>${watts} W</strong></div>`,
    `  <div class="tp-cell"><span>Temp</span><strong>${temp} °C</strong></div>`,
    `  <div class="tp-cell"><span>Rack</span><strong>${rack || '—'}</strong></div>`,
    '</div>',
    server.usuario && server.usuario.nombre_completo
      ? `<div class="tp-user"><i class="fa-solid fa-user"></i> ${escapeHtml(server.usuario.nombre_completo)}</div>`
      : ''
  ].join('');
}

function initPhysicalRackTooltip() {
  const rack = document.getElementById('physical-rack');
  const tip = document.getElementById('blade-tooltip');
  if (!rack || !tip) return;

  const show = (event) => {
    const blade = event.target.closest('.blade');
    if (!blade || blade.dataset.tooltipIdx === undefined) {
      tip.hidden = true;
      return;
    }
    const server = physicalViewState.servers[Number(blade.dataset.tooltipIdx)];
    if (!server) {
      tip.hidden = true;
      return;
    }
    tip.innerHTML = bladeTooltipHTML(server, blade.dataset.rack || '');
    tip.hidden = false;
    move(event);
  };

  const move = (event) => {
    if (tip.hidden) return;
    const gap = 16;
    let x = event.clientX + gap;
    let y = event.clientY + gap;
    const rect = tip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - gap;
    if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - gap;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  };

  const hide = () => {
    tip.hidden = true;
  };

  rack.addEventListener('mouseover', show);
  rack.addEventListener('mousemove', move);
  rack.addEventListener('mouseleave', hide);
  rack.addEventListener('touchstart', hide);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Convierte coordenadas del DOM real a coordenadas del viewBox del SVG
function mapToViewBox(el, svg, point = 'center') {
  const svgRect = svg.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const toX = (px) => ((px - svgRect.left) / (svgRect.width || 1)) * 1000;
  const toY = (py) => ((py - svgRect.top) / (svgRect.height || 1)) * 760;
  const cx = elRect.left + elRect.width / 2;
  if (point === 'top') return { x: toX(cx), y: toY(elRect.top) };
  if (point === 'bottom') return { x: toX(cx), y: toY(elRect.bottom) };
  return { x: toX(cx), y: toY(elRect.top + elRect.height / 2) };
}

// Función para dibujar líneas dinámicas de tráfico alineadas a cada servidor
function drawTrafficLines() {
  const svg = document.querySelector('.network-svg');
  const trafficLinesGroup = document.getElementById('traffic-lines');
  const switchEl = document.querySelector('.switch-core');
  const cards = Array.from(document.querySelectorAll('#carousel-servers .server-card'));
  if (!svg || !trafficLinesGroup || !switchEl) return;

  trafficLinesGroup.innerHTML = '';

  const origin = mapToViewBox(switchEl, svg, 'bottom');
  const paths = [];
  const nodes = [];
  let index = 0;

  for (const card of cards) {
    const dest = mapToViewBox(card, svg, 'top');
    const dx = dest.x - origin.x;
    const dy = dest.y - origin.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const bend = Math.max(16, Math.min(36, dist * 0.07));
    const sway = (index % 2 === 0 ? 1 : -1) * Math.min(22, dist * 0.05);

    const ctrl1 = { x: origin.x + dx * 0.38 + sway, y: origin.y + dy * 0.3 };
    const ctrl2 = { x: dest.x - dx * 0.2 - sway, y: dest.y - dy * 0.16 - bend };
    const pathData = `M ${origin.x} ${origin.y} C ${ctrl1.x} ${ctrl1.y}, ${ctrl2.x} ${ctrl2.y}, ${dest.x} ${dest.y}`;

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('class', index % 2 === 1 ? 'flow-line alt' : 'flow-line');
    paths.push(path);

    const node = document.createElementNS(SVG_NS, 'circle');
    node.setAttribute('cx', dest.x);
    node.setAttribute('cy', dest.y);
    node.setAttribute('r', '4');
    node.setAttribute('class', 'flow-node');
    nodes.push(node);

    index++;
  }

  const startNode = document.createElementNS(SVG_NS, 'circle');
  startNode.setAttribute('cx', origin.x);
  startNode.setAttribute('cy', origin.y);
  startNode.setAttribute('r', '5');
  startNode.setAttribute('class', 'flow-node origin');

  paths.forEach((path) => trafficLinesGroup.appendChild(path));
  trafficLinesGroup.appendChild(startNode);
  nodes.forEach((node) => trafficLinesGroup.appendChild(node));

  syncCarouselPauseUI();
}

function generateMockServers(count = 50) {
  return Array.from({ length: count }, (_, index) => ({
    hostname: `NODE-${String(index + 1).padStart(2, '0')}`,
    estado: index % 7 === 0 ? 'INACTIVO' : 'ACTIVO',
    ip_address: `10.11.${Math.floor(index / 16)}.${(index % 16) + 10}`,
    cpu_cores: 16 + (index % 4) * 4,
    ram_gb: 32 + (index % 3) * 16,
    max_watts: 320 + (index % 5) * 20,
    cpu_utilization: Math.floor(Math.random() * 100),
    ram_utilization: Math.floor(Math.random() * 100),
    temperatura_celsius: 35 + Math.random() * 25,
    usuario: null
  }));
}

function divideServersIntoBlocks(servers, blockSize = 4) {
  const blocks = [];
  for (let i = 0; i < servers.length; i += blockSize) {
    blocks.push(servers.slice(i, i + blockSize));
  }
  return blocks;
}

function renderCarouselBlock(blockIndex, animate = false) {
  const container = document.getElementById('carousel-servers');
  if (!container) return;

  if (carouselState.isTransitioning || blockIndex >= carouselState.blocks.length) return;

  const block = carouselState.blocks[blockIndex];
  if (!block) return;

  carouselState.isTransitioning = true;

  if (animate) {
    container.classList.add('fade-out');
    
    setTimeout(() => {
      renderCarouselBlockContent(container, block);
      container.classList.remove('fade-out');
      container.classList.add('fade-in');
      
      // Dibujar líneas según cantidad de servidores
      drawTrafficLines(block.length);
      
      setTimeout(() => {
        container.classList.remove('fade-in');
        carouselState.isTransitioning = false;
      }, carouselState.transitionDuration);
    }, carouselState.transitionDuration / 2);
  } else {
    renderCarouselBlockContent(container, block);
    drawTrafficLines(block.length);
    carouselState.isTransitioning = false;
  }

  updateProgressDots(blockIndex);
  updateCarouselStats(blockIndex);
}

function updateCarouselStats(blockIndex) {
  const blockEl = document.getElementById('carousel-block');
  const visibleEl = document.getElementById('carousel-visible');
  const totalEl = document.getElementById('carousel-total');
  const block = carouselState.blocks[blockIndex];
  if (blockEl) blockEl.textContent = `${blockIndex + 1}/${carouselState.blocks.length}`;
  if (visibleEl) visibleEl.textContent = block ? block.length : 0;
  if (totalEl) totalEl.textContent = carouselState.servers.length;
}

function renderCarouselBlockContent(container, block) {
  container.innerHTML = block.map((host) => {
    const estado = (host.estado || 'ACTIVO').toUpperCase();
    const online = estado !== 'INACTIVO';

    return `
      <article class="server-card ${online ? 'online' : 'offline'}">
        <div class="server-header">
          <div class="server-name">${host.hostname || 'NODE-XX'}</div>
          <span class="server-status ${online ? 'online' : 'offline'}">${estado}</span>
        </div>

        <div class="server-meta">
          <div class="server-meta-item">
            <span class="meta-label">IP</span>
            <span class="meta-value mono">${host.ip_address || '10.0.0.1'}</span>
          </div>
          <div class="server-meta-item">
            <span class="meta-label">Cores</span>
            <span class="meta-value mono">${host.cpu_cores || 0}</span>
          </div>
          <div class="server-meta-item">
            <span class="meta-label">RAM</span>
            <span class="meta-value mono">${host.ram_gb || 0} GB</span>
          </div>
          <div class="server-meta-item">
            <span class="meta-label">Power</span>
            <span class="meta-value mono">${host.max_watts || 0} W</span>
          </div>
        </div>

        <div class="server-metrics">
          <div class="metric-box"><span>CPU</span><strong>${host.cpu_utilization || 0}%</strong></div>
          <div class="metric-box"><span>RAM</span><strong>${host.ram_utilization || 0}%</strong></div>
        </div>
      </article>
    `;
  }).join('');
}

function generateProgressDots(totalBlocks) {
  const container = document.getElementById('progress-dots');
  if (!container) return;

  container.innerHTML = Array.from({ length: totalBlocks }, (_, index) => `
    <div class="progress-dot ${index === 0 ? 'active' : ''}" data-block-index="${index}" role="button" aria-label="Bloque ${index + 1}" tabindex="0"></div>
  `).join('');

  // Agregar event listeners a los puntos
  container.querySelectorAll('.progress-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      const blockIndex = parseInt(dot.dataset.blockIndex, 10);
      goToBlock(blockIndex);
    });

    dot.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const blockIndex = parseInt(dot.dataset.blockIndex, 10);
        goToBlock(blockIndex);
      }
    });
  });
}

function updateProgressDots(blockIndex) {
  const dots = document.querySelectorAll('.progress-dot');
  dots.forEach((dot, index) => {
    if (index === blockIndex) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
  syncCarouselPauseUI();
}

function goToBlock(blockIndex) {
  if (blockIndex >= 0 && blockIndex < carouselState.blocks.length && !carouselState.isTransitioning) {
    carouselState.currentBlockIndex = blockIndex;
    renderCarouselBlock(blockIndex, true);
    resetAutoPlay();
  }
}

function nextBlock() {
  if (!carouselState.isTransitioning && !carouselState.isPaused) {
    const nextIndex = (carouselState.currentBlockIndex + 1) % carouselState.blocks.length;
    carouselState.currentBlockIndex = nextIndex;
    renderCarouselBlock(nextIndex, true);
  }
}

function syncCarouselPauseUI() {
  const pauseBtn = document.getElementById('carousel-pause');
  const dots = document.getElementById('progress-dots');
  if (pauseBtn) {
    pauseBtn.innerHTML = carouselState.isPaused
      ? '<i class="fa-solid fa-play"></i>'
      : '<i class="fa-solid fa-pause"></i>';
    pauseBtn.title = carouselState.isPaused ? 'Reanudar' : 'Pausar';
    pauseBtn.classList.toggle('active', !carouselState.isPaused);
  }
  document.querySelectorAll('#traffic-lines').forEach((group) => {
    group.classList.toggle('paused', carouselState.isPaused);
  });
  const activeDot = dots && dots.querySelector('.progress-dot.active');
  if (activeDot) activeDot.classList.toggle('paused', carouselState.isPaused);
}

function toggleCarousel() {
  carouselState.isPaused = !carouselState.isPaused;
  if (carouselState.isPaused) {
    clearInterval(carouselState.autoPlayInterval);
  } else {
    startAutoPlay();
  }
  syncCarouselPauseUI();
}

function setupCarouselControls() {
  const pauseBtn = document.getElementById('carousel-pause');
  const firstBtn = document.getElementById('carousel-first');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  const lastBtn = document.getElementById('carousel-last');

  if (pauseBtn) pauseBtn.addEventListener('click', toggleCarousel);
  if (firstBtn) firstBtn.addEventListener('click', () => goToBlock(0));
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const total = carouselState.blocks.length || 1;
      goToBlock((carouselState.currentBlockIndex - 1 + total) % total);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const total = carouselState.blocks.length || 1;
      goToBlock((carouselState.currentBlockIndex + 1) % total);
    });
  }
  if (lastBtn) lastBtn.addEventListener('click', () => goToBlock((carouselState.blocks.length || 1) - 1));
  syncCarouselPauseUI();
}

function startAutoPlay() {
  // Limpiar intervalo anterior si existe
  if (carouselState.autoPlayInterval) {
    clearInterval(carouselState.autoPlayInterval);
  }
  
  // Cronometraje total: duración del bloque + transición
  const totalDuration = carouselState.blockDuration + carouselState.transitionDuration;
  
  carouselState.autoPlayInterval = setInterval(() => {
    nextBlock();
  }, totalDuration);
}

function resetAutoPlay() {
  clearInterval(carouselState.autoPlayInterval);
  if (!carouselState.isPaused) {
    startAutoPlay();
  }
}

function initializeCarousel(servers = null) {
  setupCarouselControls();

  // Usar los servidores proporcionados o generar mocks
  const allServers = servers && servers.length > 0 
    ? servers 
    : generateMockServers(50);

  // Tomar solo los primeros 50 servidores
  carouselState.servers = allServers.slice(0, 50).map(server => ({
    ...server,
    cpu_utilization: server.cpu_utilization !== undefined ? server.cpu_utilization : Math.floor(Math.random() * 100),
    ram_utilization: server.ram_utilization !== undefined ? server.ram_utilization : Math.floor(Math.random() * 100),
    temperatura_celsius: server.temperatura_celsius !== undefined ? server.temperatura_celsius : 35 + Math.random() * 25
  }));

  // Dividir en bloques de 4
  carouselState.blocks = divideServersIntoBlocks(carouselState.servers, 4);

  // Generar puntos de progreso
  generateProgressDots(carouselState.blocks.length);

  // Renderizar el primer bloque
  renderCarouselBlock(0, false);

  // Iniciar autoplay
  startAutoPlay();
}


function renderPhysicalRack(data, logs = []) {
  const container = document.getElementById('physical-rack');
  if (!container) return;

  const servers = buildPhysicalServers(data, logs);
  physicalViewState.servers = servers;

  const totalEl = document.getElementById('physical-rack-total');
  if (totalEl) totalEl.textContent = String(servers.length);

  const rackLetters = ['A', 'B', 'C', 'D', 'E'];
  const slotsPerRack = 10;

  const cabinets = rackLetters.map((letter, rackIndex) => {
    const slice = servers.slice(rackIndex * slotsPerRack, (rackIndex + 1) * slotsPerRack);
    const onlineCount = slice.filter((s) => (s.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO').length;

    const blades = slice.map((server, slotIndex) => {
      const globalIndex = rackIndex * slotsPerRack + slotIndex;
      const online = (server.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO';
      const healthDur = randomInRange(0.42, 0.62).toFixed(2);
      const healthDelay = randomInRange(0, 0.9).toFixed(2);
      const trafficDur = randomInRange(0.55, 0.95).toFixed(2);
      const trafficDelay = randomInRange(0.05, 1.2).toFixed(2);

      return `
        <div class="blade ${online ? 'online' : 'offline'}" data-tooltip-idx="${globalIndex}" data-rack="${letter}" aria-label="${escapeHtml(server.hostname)} ${online ? 'activo' : 'inactivo'}">
          <span class="blade-leds">
            <span class="blade-led led-health" style="--led-dur:${healthDur}s;--led-delay:${healthDelay}s"></span>
            ${online ? `<span class="blade-led led-traffic" style="--led-dur:${trafficDur}s;--led-delay:${trafficDelay}s"></span>` : ''}
          </span>
          <span class="blade-label">${escapeHtml(server.hostname)}</span>
        </div>
      `;
    });

    return `
      <article class="rack-cabinet rack-${letter}">
        <header class="cabinet-header">
          <span class="cabinet-name"><i class="fa-solid fa-server"></i> RACK ${letter}</span>
          <span class="cabinet-count"><b>${onlineCount}</b>/10</span>
        </header>
        <div class="cabinet-slots">${blades.join('')}</div>
      </article>
    `;
  });

  container.innerHTML = cabinets.join('');
}

function toggleNetworkView(mode) {
  const logicalPanel = document.getElementById('network-logic-panel');
  const physicalPanel = document.getElementById('network-physical-panel');
  const buttons = document.querySelectorAll('[data-view-toggle]');

  if (!logicalPanel || !physicalPanel) return;

  const showLogical = mode === 'logical';
  logicalPanel.classList.toggle('active', showLogical);
  physicalPanel.classList.toggle('active', !showLogical);

  const carouselToolbar = document.querySelector('.carousel-toolbar');
  if (carouselToolbar) carouselToolbar.hidden = !showLogical;

  const bladeTooltip = document.getElementById('blade-tooltip');
  if (bladeTooltip) bladeTooltip.hidden = true;

  buttons.forEach((button) => {
    const isActive = button.dataset.viewToggle === mode;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

async function loadNetworkData() {
  try {
    const [catalog, history, current] = await Promise.all([
      fetchMonitoring('catalog'),
      fetchMonitoring('history'),
      fetchMonitoring('current')
    ]);

    const hardware = catalog.map(normalizeNode);
    const logs = history.map(normalizeSnapshot);
    const kpis = computeKPIs(current.map(normalizeSnapshot));

    // Inicializar el carrusel con los datos de hardware
    initializeCarousel(hardware);

    // Renderizar la vista física
    renderPhysicalRack(hardware, logs);

    // Actualizar estadísticas
    const nodeCountEl = document.getElementById('network-nodes');
    const trafficEl = document.getElementById('network-traffic');
    const latencyEl = document.getElementById('network-latency');

    if (nodeCountEl) nodeCountEl.textContent = `${kpis.nodosActivos ?? hardware.length ?? 0}/50`;
    if (trafficEl) trafficEl.textContent = `${kpis.totalWatts ?? 0} W`;
    if (latencyEl) latencyEl.textContent = `${Math.max(6, Math.min(120, Number(kpis.cpuAvg ?? 34) * 2))} ms`;

    // Cargar eventos mejorados
    const feed = document.getElementById('network-log-feed');
    if (feed) {
      const eventHtml = (logs || []).slice(0, 8).map((log) => {
        const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '--:--:--';
        const hora = new Date(log.timestamp).toLocaleDateString('es-ES');
        
        // Determinar nivel de severidad
        const temp = log.temperatura_celsius || 0;
        const cpu = log.cpu_utilization_pct || 0;
        let estado = 'normal';
        let statusClass = 'event-status';
        let icon = '✓';
        
        if (temp > 60 || cpu > 85) {
          estado = 'CRÍTICO';
          statusClass += ' critical';
          icon = '⚠';
        } else if (temp > 55 || cpu > 70) {
          estado = 'ALERTA';
          statusClass += ' warning';
          icon = '!';
        } else {
          estado = 'NORMAL';
        }

        return `
          <li>
            <strong>${icon} ${log.hostname || 'NODE-XX'}</strong>
            <div class="event-meta">
              <span><i class="fa-solid fa-thermometer-half"></i> ${Math.round(temp)}°C</span>
              <span><i class="fa-solid fa-microchip"></i> CPU ${cpu}%</span>
              <span><i class="fa-solid fa-memory"></i> RAM ${log.ram_utilization_pct || 0}%</span>
              <span><i class="fa-solid fa-bolt"></i> ${log.energia_watts || 0}W</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
              <span style="font-size: 0.7rem; color: var(--text-muted);">${hora} • ${timestamp}</span>
              <span class="${statusClass}">${estado}</span>
            </div>
          </li>
        `;
      }).join('');
      
      feed.innerHTML = eventHtml || '<li style="color: var(--text-muted);">No hay eventos registrados</li>';
    }
  } catch (error) {
    console.error('Error cargando red:', error);
  }
}


function initializeDashboard() {
  checkAuthSession();
  renderUserProfile();
  initializeCharts();
  loadKPIs();
  loadUsuariosTable();
  loadHardwareTable();
  loadLogsAndCharts();
  loadMonthlyEnergy();
  setInterval(() => {
    loadKPIs();
    loadLogsAndCharts();
    loadMonthlyEnergy();
  }, 10000);
}

function initializeNetworkPage() {
  checkAuthSession();
  renderUserProfile();
  
  // Cargar datos iniciales de la red
  loadNetworkData();

  // Inicializar el tooltip de la vista física
  initPhysicalRackTooltip();
  
  // Configurar los botones de toggle de vista
  const viewButtons = document.querySelectorAll('[data-view-toggle]');
  viewButtons.forEach((button) => {
    button.addEventListener('click', () => toggleNetworkView(button.dataset.viewToggle));
  });
  
  // Establecer la vista lógica por defecto
  toggleNetworkView('logical');

  // Recalcular las líneas de tráfico cuando terminen de cargar las fuentes
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => drawTrafficLines());
  }
  
  // Recargar datos cada 30 segundos para actualizar eventos
  setInterval(loadNetworkData, 30000);
}

document.addEventListener('DOMContentLoaded', () => {
  updateClock();
  setInterval(updateClock, 1000);
  bindThemeToggle();
  renderUserProfile();
  setupPasswordStrength();
  setupLogoutButton();
  setupLoginForm();
  setupRegisterForm();
  bindPublicNavState();
  setupSettingsModal();

  // Recalcular líneas de tráfico al redimensionar la ventana
  let trafficResizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(trafficResizeTimer);
    trafficResizeTimer = setTimeout(() => {
      if (document.getElementById('traffic-lines')) drawTrafficLines();
    }, 150);
  });

  if (document.getElementById('wattsChart') || document.getElementById('resourcesChart') || document.getElementById('monthlyEnergyChart')) {
    initializeDashboard();
  }

  if (document.getElementById('carousel-servers') || document.getElementById('physical-rack')) {
    initializeNetworkPage();
  }
});