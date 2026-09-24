// ==================================================================
// CONFIGURACIÓN DE SUPABASE AUTH Y GATEWAY
// ==================================================================
const GREEN_AI_CONFIG = window.GREEN_AI_CONFIG || {};
const GATEWAY_BASE_URL = String(GREEN_AI_CONFIG.gatewayBaseUrl || 'http://127.0.0.1:8081').replace(/\/$/, '');
const API_URL = `${GATEWAY_BASE_URL}/api`;

let supabaseClient = null;
let activeAuthSession = null;

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const { supabaseUrl, supabasePublishableKey } = GREEN_AI_CONFIG;
  if (!supabaseUrl || !supabasePublishableKey || !window.supabase?.createClient) {
    throw new Error('Supabase Auth no está configurado. Copia config.example.js como config.local.js y completa sus valores.');
  }
  supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey, {
    auth: { flowType: 'pkce', autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });
  return supabaseClient;
}

function decodeJwtClaims(accessToken) {
  try {
    const encoded = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    return JSON.parse(decodeURIComponent(atob(payload).split('').map((char) =>
      `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`
    ).join('')));
  } catch (_error) {
    return {};
  }
}

function sessionUserView(session) {
  const user = session?.user;
  if (!user) return null;
  const claims = decodeJwtClaims(session.access_token || '');
  return {
    nombre_completo: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Operador',
    email: user.email,
    role: String(claims.user_role || 'OPERATOR').toUpperCase()
  };
}

async function getAuthSession() {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  activeAuthSession = data.session;
  return activeAuthSession;
}

async function authenticatedFetch(url, options = {}) {
  const session = await getAuthSession();
  if (!session?.access_token) {
    window.location.href = 'login.html';
    throw new Error('La sesión expiró. Inicia sesión nuevamente.');
  }
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${session.access_token}`);
  headers.set('Accept', 'application/json');
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    await getSupabaseClient().auth.signOut({ scope: 'local' });
    window.location.href = 'login.html';
  }
  return response;
}

function updateClock() {
  const clock = document.getElementById('live-clock');
  if (!clock) return;
  clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function bindThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  toggle.addEventListener('click', () => {
    const isLight = !document.body.classList.contains('light-mode');
    document.body.classList.toggle('light-mode', isLight);
    localStorage.setItem('greenai-theme', isLight ? 'light' : 'dark');
    updateChartColors(isLight ? '#475569' : '#94A3B8', isLight ? '#CBD5E1' : '#334155');
  });

  if (localStorage.getItem('greenai-theme') === 'light') {
    document.body.classList.add('light-mode');
    updateChartColors('#475569', '#CBD5E1');
  }
}

function renderUserProfile(session = activeAuthSession) {
  const user = sessionUserView(session);
  if (!user) return;

  try {
    const display = document.getElementById('user-name-display');
    const roleBadge = document.getElementById('user-role-badge');
    const settingsName = document.getElementById('settings-user-name');
    const settingsEmail = document.getElementById('settings-user-email');
    const settingsRole = document.getElementById('settings-user-role');
    const normalizedRole = String(user.role || 'OPERATOR').trim().toUpperCase();
    const formattedRole = normalizedRole === 'OPERADOR' ? 'OPERATOR' : normalizedRole;
    const isOperator = formattedRole === 'OPERATOR';

    if (display && user) {
      display.textContent = user.nombre_completo || user.nombre || 'Operador';
    }

    if (roleBadge) {
      roleBadge.textContent = formattedRole;
    }

    if (settingsName) settingsName.textContent = user.nombre_completo || user.nombre || 'Operador';
    if (settingsEmail) settingsEmail.textContent = user.email || 'N/A';
    if (settingsRole) settingsRole.textContent = formattedRole;

    document.querySelectorAll('[data-admin-only]').forEach((element) => {
      const shouldHide = isOperator && element instanceof HTMLElement;
      element.style.display = shouldHide ? 'none' : '';
    });
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

async function checkAuthSession() {
  try {
    const session = await getAuthSession();
    if (!session && isProtectedPage()) window.location.href = 'login.html';
    return session;
  } catch (error) {
    console.error('Error iniciando Supabase Auth:', error);
    if (isProtectedPage()) {
      window.location.href = 'login.html';
    }
    return null;
  }
}

function setupLogoutButton() {
  const logoutBtn = document.getElementById('logout-btn');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', async () => {
    await getSupabaseClient().auth.signOut();
    window.location.href = 'login.html';
  });
}

function bindPublicNavState(session) {
  const isLogged = Boolean(session);
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
          x: { ticks: { color: '#94A3B8', maxTicksLimit: 6 }, grid: { color: 'rgba(148, 163, 184, 0.12)' } },
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
          x: { ticks: { color: '#94A3B8', maxTicksLimit: 6 }, grid: { color: 'rgba(148, 163, 184, 0.12)' } },
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
          x: { ticks: { color: '#94A3B8', maxTicksLimit: 6 }, grid: { display: false } },
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
    const res = await authenticatedFetch(`${API_URL}/kpis`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const nodesEl = document.getElementById('kpi-nodes');
    const wattsEl = document.getElementById('kpi-watts');
    const cpuEl = document.getElementById('kpi-cpu');
    const ramEl = document.getElementById('kpi-ram');

    if (nodesEl) nodesEl.textContent = String(data.nodosActivos ?? '--');
    if (wattsEl) wattsEl.textContent = `${data.totalWatts ?? 0} W`;
    if (cpuEl) cpuEl.textContent = `${data.cpuAvg ?? 0} %`;
    if (ramEl) ramEl.textContent = `${data.ramAvg ?? 0} %`;

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

    const res = await authenticatedFetch(`${API_URL}/usuarios`);
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

    const res = await authenticatedFetch(`${API_URL}/hardware`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    tbody.innerHTML = (data || []).map((h) => `
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
    const res = await authenticatedFetch(`${API_URL}/logs`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const points = Array.from({ length: 6 }, (_, idx) => {
      const item = (data || [])[idx] || {};
      return Number(item.energia_watts || [330, 420, 390, 480, 460, 510][idx] || 0);
    });

    monthlyEnergyChart.data.datasets[0].data = points;
    monthlyEnergyChart.update();
  } catch (error) {
    console.error('Error al cargar consumo mensual:', error);
  }
}

async function loadLogsAndCharts() {
  try {
    const res = await authenticatedFetch(`${API_URL}/logs`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

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
      const ramData = ordered.map((log) => Number(log.ram_utilizacion_pct ?? 0));

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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value;

    if (!email || !password) {
      setMessage('message', 'Completa correo y contraseña.', true);
      return;
    }

    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      setMessage('message', '¡Bienvenido! Redirigiendo...');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
    } catch (error) {
      setMessage('message', error.message || 'Error de conexión.', true);
    }
  });
}

async function setupRegisterForm() {
  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');

    const nombre = document.getElementById('nombre_completo')?.value.trim();
    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value;
    const confirmPassword = document.getElementById('confirm_password')?.value;
    if (!nombre || !email || !password || !confirmPassword) {
      setMessage('message', 'Completa todos los campos.', true);
      return;
    }

    if (password !== confirmPassword) {
      setMessage('message', 'Las contraseñas no coinciden.', true);
      return;
    }

    // 🔒 1. DESHABILITAR BOTÓN PARA EVITAR REENVÍO MULTIPLE
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.6';
      submitBtn.style.cursor = 'not-allowed';
    }

    try {
      const emailRedirectTo = new URL('login.html', window.location.href).href;
      const { data, error } = await getSupabaseClient().auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: { full_name: nombre }
        }
      });
      if (error) throw error;
      form.reset();

      if (data.session) {
        setMessage('message', '¡Registro exitoso! Redirigiendo...');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
      } else {
        setMessage('message', 'Revisa tu correo y confirma la cuenta antes de iniciar sesión.');
      }
    } catch (error) {
      setMessage('message', error.message || 'Error de conexión.', true);

      // 🔓 2. REHABILITAR BOTÓN SI HAY UN ERROR
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
      }
    }
  });
}

function applyAccentTheme(accent) {
  const normalizedAccent = ['cyan', 'green', 'purple'].includes(accent) ? accent : 'cyan';
  document.body.setAttribute('data-accent', normalizedAccent);
  localStorage.setItem('greenai-accent', normalizedAccent);

  // Map accents to CSS variables for instant site-wide updates
  const map = {
    cyan: { primary: '#06B6D4', glow: 'rgba(34,211,238,0.28)', neonCyan: '#06B6D4', neonPurple: '#A855F7', neonGreen: '#10B981' },
    green: { primary: '#10B981', glow: 'rgba(16,185,129,0.28)', neonCyan: '#22D3EE', neonPurple: '#9333EA', neonGreen: '#10B981' },
    purple: { primary: '#A855F7', glow: 'rgba(168,85,247,0.28)', neonCyan: '#06B6D4', neonPurple: '#A855F7', neonGreen: '#10B981' }
  };

  const vars = map[normalizedAccent] || map.cyan;
  const root = document.documentElement;
  root.style.setProperty('--primary-color', vars.primary);
  root.style.setProperty('--accent-glow', vars.glow);
  root.style.setProperty('--neon-cyan', vars.neonCyan);
  root.style.setProperty('--neon-purple', vars.neonPurple);
  root.style.setProperty('--neon-green', vars.neonGreen);

  document.querySelectorAll('.palette-option').forEach((button) => {
    const active = button.dataset.accent === normalizedAccent;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function updateGlobalSettingsUI() {
  const isLight = document.body.classList.contains('light-mode');
  const themeToggle = document.getElementById('global-theme-toggle');
  if (themeToggle) themeToggle.checked = isLight;

  const savedAccent = localStorage.getItem('greenai-accent') || 'cyan';
  applyAccentTheme(savedAccent);
}

function bindSettingsModal() {
  // repurposed as a compact popover bound to the gear button
  const trigger = document.getElementById('global-settings-btn');
  const popover = document.getElementById('settings-popover');
  const themeToggle = document.getElementById('global-theme-toggle');
  const accentButtons = document.querySelectorAll('.palette-option');
  const applyBtn = document.getElementById('apply-accent-btn');

  if (!trigger || !popover) return;

  let open = false;

  function positionPopover() {
    const rect = trigger.getBoundingClientRect();
    popover.style.left = `${rect.left + window.scrollX}px`;
    popover.style.top = `${rect.bottom + window.scrollY + 8}px`;
  }

  function openPopover() {
    open = true;
    positionPopover();
    popover.classList.add('open');
    popover.setAttribute('aria-hidden', 'false');
    renderUserProfile();
    updateGlobalSettingsUI();
  }

  function closePopover() {
    open = false;
    popover.classList.remove('open');
    popover.setAttribute('aria-hidden', 'true');
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (open) closePopover(); else openPopover();
  });

  // hover opens transiently
  let hoverTimer = null;
  trigger.addEventListener('mouseenter', () => { clearTimeout(hoverTimer); openPopover(); });
  trigger.addEventListener('mouseleave', () => { hoverTimer = setTimeout(() => { if (open) closePopover(); }, 600); });
  popover.addEventListener('mouseenter', () => { clearTimeout(hoverTimer); });
  popover.addEventListener('mouseleave', () => { hoverTimer = setTimeout(() => { closePopover(); }, 400); });

  document.addEventListener('click', (ev) => {
    if (!popover.contains(ev.target) && ev.target !== trigger) closePopover();
  });

  if (themeToggle) {
    themeToggle.addEventListener('change', (event) => {
      const isLight = Boolean(event.target.checked);
      document.body.classList.toggle('light-mode', isLight);
      localStorage.setItem('greenai-theme', isLight ? 'light' : 'dark');
      updateChartColors(isLight ? '#475569' : '#94A3B8', isLight ? '#CBD5E1' : '#334155');
    });
  }

  accentButtons.forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.palette-option').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
    });
  });

  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const sel = document.querySelector('.palette-option.active');
      if (sel) applyAccentTheme(sel.dataset.accent || 'cyan');
      closePopover();
    });
  }

  // init UI state
  updateGlobalSettingsUI();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getFallbackServers(count = 50) {
  return Array.from({ length: count }, (_, index) => {
    const serverNumber = index + 1;
    const hostname = `srv-green-${String(serverNumber).padStart(3, '0')}`;
    const estado = serverNumber % 11 === 0 ? 'INACTIVO' : 'ACTIVO';
    const cpu = 28 + ((serverNumber * 9) % 62);
    const temp = Number((34 + ((serverNumber * 7) % 22) + (serverNumber % 5) * 0.7).toFixed(2));

    return {
      hostname,
      ip_address: `10.11.${Math.floor(serverNumber / 16)}.${(serverNumber % 16) + 10}`,
      cpu_cores: 12 + (serverNumber % 8),
      ram_gb: 24 + (serverNumber % 5) * 8,
      max_watts: 220 + (serverNumber % 9) * 35,
      estado,
      temperatura_celsius: temp,
      cpu_utilization_pct: cpu,
      ram_utilization_pct: 42 + ((serverNumber * 5) % 34),
      energia_watts: 180 + ((serverNumber * 17) % 260),
      hardware_id: `HW-${String(serverNumber).padStart(3, '0')}`
    };
  });
}

function formatNetworkTimestamp(value) {
  if (!value) return '--:--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getNetworkLogMessage(log) {
  const hostname = log?.hardware?.hostname || log?.hostname || 'srv-green-unknown';
  const temp = Number(log?.temperatura_celsius ?? 0);
  const cpu = Number(log?.cpu_utilization_pct ?? 0);

  if (cpu > 0 && temp > 0) {
    const isWarning = temp > 48 || cpu > 75;
    const message = isWarning
      ? `Temp elevada (${temp.toFixed(2)} °C)`
      : `Temp Óptima (${temp.toFixed(2)} °C)`;
    return {
      hostname,
      message,
      status: isWarning ? 'warning' : 'ok'
    };
  }

  if (cpu > 0) {
    return {
      hostname,
      message: `Carga CPU: ${cpu}%`,
      status: cpu > 75 ? 'warning' : 'ok'
    };
  }

  if (temp > 0) {
    return {
      hostname,
      message: `Temp Óptima (${temp.toFixed(2)} °C)`,
      status: temp > 48 ? 'warning' : 'ok'
    };
  }

  return {
    hostname,
    message: 'Estado estable del nodo',
    status: 'ok'
  };
}

function showFloatingTooltip(event, contentHtml) {
  let tooltip = document.getElementById('floating-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'floating-tooltip';
    tooltip.className = 'floating-tooltip';
    document.body.appendChild(tooltip);
  }

  tooltip.innerHTML = contentHtml;
  tooltip.style.left = `${event.clientX + 16}px`;
  tooltip.style.top = `${event.clientY + 16}px`;
  tooltip.style.opacity = '1';
  tooltip.style.display = 'block';
}

function hideFloatingTooltip() {
  const tooltip = document.getElementById('floating-tooltip');
  if (tooltip) {
    tooltip.style.opacity = '0';
    tooltip.style.display = 'none';
  }
}

function buildServerSummary(server, fallbackNumber = 1) {
  const hostname = server?.hostname || `srv-green-${String(fallbackNumber).padStart(3, '0')}`;
  const estado = String(server?.estado || 'ACTIVO').toUpperCase();
  const cpu = Number(server?.cpu_utilization_pct ?? 0);
  const ram = Number(server?.ram_utilization_pct ?? 0);
  const temp = Number(server?.temperatura_celsius ?? 32);
  const power = Number(server?.energia_watts ?? server?.max_watts ?? 320);
  const ip = server?.ip_address || `10.11.${Math.floor((fallbackNumber - 1) / 16)}.${((fallbackNumber - 1) % 16) + 10}`;
  return { hostname, estado, cpu, ram, temp, power, ip };
}

function renderLogicalView() {
  const fallback = getFallbackServers(50);
  const data = Array.isArray(serverCarouselState.serverData) && serverCarouselState.serverData.length
    ? serverCarouselState.serverData
    : fallback;

  serverCarouselState.serverData = data;
  serverCarouselState.totalServers = Math.max(data.length, 50);
  renderHardwareCards(data);
  requestAnimationFrame(() => renderTopologyConnections());
}

function renderPhysicalView(data) {
  const rackContainer = document.getElementById('physical-rack');
  if (!rackContainer) return;

  const source = Array.isArray(data) && data.length ? data : (
    Array.isArray(serverCarouselState.serverData) && serverCarouselState.serverData.length
      ? serverCarouselState.serverData
      : getFallbackServers(50)
  );

  const normalized = Array.from({ length: 50 }, (_, index) => {
    if (source[index]) return source[index];
    return getFallbackServers(50)[index];
  });

  const rackNames = ['Rack A', 'Rack B', 'Rack C', 'Rack D', 'Rack E'];

  rackContainer.innerHTML = rackNames.map((rackName, rackIndex) => {
    const start = rackIndex * 10;
    const servers = normalized.slice(start, start + 10);
    const rackCpu = servers.reduce((sum, server) => sum + Number(server?.cpu_utilization_pct ?? 0), 0) / Math.max(servers.length, 1);
    const rackRam = servers.reduce((sum, server) => sum + Number(server?.ram_utilization_pct ?? 0), 0) / Math.max(servers.length, 1);
    const rackTemp = servers.reduce((sum, server) => sum + Number(server?.temperatura_celsius ?? 32), 0) / Math.max(servers.length, 1);
    const rackPower = servers.reduce((sum, server) => sum + Number(server?.energia_watts ?? server?.max_watts ?? 320), 0);

    return `
      <div class="rack-cabinet" data-rack-name="${rackName}" data-rack-index="${rackIndex}">
        <div class="cabinet-header">${rackName}</div>
        <div class="cabinet-slots">
          ${servers.map((server, slotIndex) => {
            const summary = buildServerSummary(server, start + slotIndex + 1);
            const online = summary.estado !== 'INACTIVO';
            return `
              <div class="rack-slot ${online ? 'online' : 'offline'}" data-slot-index="${slotIndex}">
                <div class="blade-chassis">
                  <div class="blade-left">
                    <span class="blade-id">${summary.hostname.split('-').pop()}</span>
                    <span class="blade-vent"></span>
                  </div>
                  <span class="rack-led ${online ? 'led-blink' : 'led-alert'}"></span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  rackContainer.querySelectorAll('.rack-cabinet').forEach((rackEl, rackIndex) => {
    const rackName = rackEl.dataset.rackName;
    const rackServers = normalized.slice(rackIndex * 10, rackIndex * 10 + 10);
    const rackStats = rackServers.reduce((acc, server) => {
      const summary = buildServerSummary(server, acc.index + 1);
      acc.cpu += summary.cpu;
      acc.ram += summary.ram;
      acc.temp += summary.temp;
      acc.power += summary.power;
      acc.index += 1;
      return acc;
    }, { cpu: 0, ram: 0, temp: 0, power: 0, index: 0 });

    const rackHtml = `
      <strong>${rackName}</strong><br>
      Estado: ${rackServers.some((server) => String(server?.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO') ? 'Operativo' : 'Degradado'}<br>
      CPU: ${(rackStats.cpu / Math.max(rackServers.length, 1)).toFixed(1)}%<br>
      RAM: ${(rackStats.ram / Math.max(rackServers.length, 1)).toFixed(1)}%<br>
      Temp: ${(rackStats.temp / Math.max(rackServers.length, 1)).toFixed(1)}°C<br>
      Consumo: ${Math.round(rackStats.power)} W
    `;

    rackEl.addEventListener('mouseenter', (event) => showFloatingTooltip(event, rackHtml));
    rackEl.addEventListener('mousemove', (event) => showFloatingTooltip(event, rackHtml));
    rackEl.addEventListener('mouseleave', hideFloatingTooltip);

    rackEl.querySelectorAll('.rack-slot').forEach((slotEl, slotIndex) => {
      const server = rackServers[slotIndex];
      const summary = buildServerSummary(server, rackIndex * 10 + slotIndex + 1);
      const detailHtml = `
        <strong>${summary.hostname}</strong><br>
        Estado: ${summary.estado}<br>
        CPU: ${summary.cpu}%<br>
        RAM: ${summary.ram}%<br>
        Temperatura: ${summary.temp.toFixed(1)}°C<br>
        Consumo: ${summary.power} W
      `;
      slotEl.addEventListener('mouseenter', (event) => showFloatingTooltip(event, detailHtml));
      slotEl.addEventListener('mousemove', (event) => showFloatingTooltip(event, detailHtml));
      slotEl.addEventListener('mouseleave', hideFloatingTooltip);
    });
  });
}

function renderPhysicalRack(data) {
  renderPhysicalView(data);
}

function toggleNetworkView(viewName) {
  const panels = document.querySelectorAll('.network-panel');
  const buttons = document.querySelectorAll('[data-view-toggle]');

  panels.forEach((panel) => {
    const isActive = panel.id === `network-${viewName}-panel`;
    panel.classList.toggle('active', isActive);
    panel.style.display = isActive ? 'flex' : 'none';
    panel.style.opacity = isActive ? '1' : '0';
    panel.style.visibility = isActive ? 'visible' : 'hidden';
  });

  buttons.forEach((button) => {
    const isActive = button.dataset.viewToggle === viewName;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  if (viewName === 'logical') {
    renderLogicalView();
  }

  if (viewName === 'physical') {
    renderPhysicalView();
  }
}

async function loadNetworkData() {
  try {
    const [hardwareRes, logsRes] = await Promise.all([
      authenticatedFetch(`${API_URL}/hardware`),
      authenticatedFetch(`${API_URL}/logs`)
    ]);

    const hardwarePayload = hardwareRes.ok ? await hardwareRes.json() : [];
    const logsPayload = logsRes.ok ? await logsRes.json() : [];
    const serverList = Array.isArray(hardwarePayload) && hardwarePayload.length ? hardwarePayload : getFallbackServers(50);

    serverCarouselState.serverData = serverList;
    serverCarouselState.totalServers = Math.max(serverList.length, 50);

    const activeNodes = serverList.filter((server) => String(server.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO').length;
    const trafficAverage = serverList.reduce((sum, server) => sum + (Number(server.cpu_utilization_pct ?? 0) || 0), 0) / Math.max(serverList.length, 1);
    const latencyAverage = 14 + (activeNodes % 7) * 6 + Math.round(trafficAverage * 0.12);

    const nodesEl = document.getElementById('network-nodes');
    const trafficEl = document.getElementById('network-traffic');
    const latencyEl = document.getElementById('network-latency');

    if (nodesEl) nodesEl.textContent = `${activeNodes}/${serverList.length}`;
    if (trafficEl) trafficEl.textContent = `${Math.min(99, Math.max(28, Math.round(trafficAverage)))}%`;
    if (latencyEl) latencyEl.textContent = `${latencyAverage} ms`;

    const feed = document.getElementById('network-log-feed');
    if (feed) {
      const events = Array.isArray(logsPayload) && logsPayload.length ? logsPayload.slice(0, 6) : Array.from({ length: 6 }, (_, index) => {
        const server = serverList[index % serverList.length] || {};
        const temp = Number(server.temperatura_celsius ?? (34 + (index % 12)));
        const cpu = Number(server.cpu_utilization_pct ?? (42 + index * 7));
        return {
          timestamp: new Date(Date.now() - index * 45000).toISOString(),
          hostname: server.hostname || `srv-green-${String(index + 1).padStart(3, '0')}`,
          temperatura_celsius: temp,
          cpu_utilization_pct: cpu,
          ram_utilizacion_pct: Number(server.ram_utilizacion_pct ?? (44 + index * 5))
        };
      });

      feed.innerHTML = events.map((log) => {
        const time = formatNetworkTimestamp(log.timestamp);
        const info = getNetworkLogMessage(log);
        const statusClass = info.status === 'warning' ? 'warning' : 'ok';
        const formattedNode = escapeHtml(info.hostname);
        const formattedMessage = escapeHtml(info.message);
        return `
          <li>
            <span class="network-log-time">[${time}]</span>
            <span class="network-log-node">${formattedNode}</span>
            <span class="network-log-separator">|</span>
            <span class="network-log-message ${statusClass}">${formattedMessage}</span>
          </li>
        `;
      }).join('');
    }

    renderLogicalView();
    renderPhysicalView(serverList);
  } catch (error) {
    console.error('Error cargando datos del panel de red:', error);
    const fallback = getFallbackServers(50);
    serverCarouselState.serverData = fallback;
    serverCarouselState.totalServers = 50;
    renderLogicalView();
    renderPhysicalView(fallback);
  }
}

const serverCarouselState = {
  currentPage: 0,
  pageSize: 4,
  totalServers: 50,
  autoPlay: true,
  hoverPaused: false,
  intervalId: null,
  serverData: [],
  isTransitioning: false
};

function startServerAutoplay() {
  if (serverCarouselState.intervalId) {
    clearInterval(serverCarouselState.intervalId);
    serverCarouselState.intervalId = null;
  }

  if (!serverCarouselState.autoPlay || serverCarouselState.hoverPaused) {
    updateServerCarouselControls();
    return;
  }

  serverCarouselState.intervalId = setInterval(() => {
    if (!serverCarouselState.isTransitioning && !serverCarouselState.hoverPaused) {
      moveServerPage(1);
    }
  }, 5500);

  updateServerCarouselControls();
}

function renderTopologyConnections() {
  const canvas = document.querySelector('.network-canvas');
  const switchCore = document.querySelector('.switch-core');
  const svg = document.getElementById('network-connections-svg');
  const grid = document.getElementById('hardware-cards');

  if (!canvas || !switchCore || !svg || !grid) return;

  const cards = [...grid.querySelectorAll('.server-card')];
  if (!cards.length) {
    svg.innerHTML = '<defs><linearGradient id="networkGradient" x1="0%" x2="100%" y1="0%" y2="0%"><stop offset="0%" stop-color="#22D3EE" /><stop offset="50%" stop-color="#A855F7" /><stop offset="100%" stop-color="#10B981" /></linearGradient><linearGradient id="networkGradientAlt" x1="0%" x2="100%" y1="0%" y2="0%"><stop offset="0%" stop-color="#10B981" /><stop offset="50%" stop-color="#06B6D4" /><stop offset="100%" stop-color="#A855F7" /></linearGradient></defs>';
    return;
  }

  const canvasRect = canvas.getBoundingClientRect();
  const switchRect = switchCore.getBoundingClientRect();
  const startX = switchRect.left - canvasRect.left + switchRect.width / 2;
  const startY = switchRect.bottom - canvasRect.top;

  const paths = cards.map((card, index) => {
    const rect = card.getBoundingClientRect();
    const endX = rect.left - canvasRect.left + rect.width / 2;
    const endY = rect.top - canvasRect.top + 12;
    const midX1 = startX + (endX - startX) * 0.38;
    const midX2 = startX + (endX - startX) * 0.62;
    const d = `M ${startX} ${startY} C ${midX1} ${startY}, ${midX2} ${endY}, ${endX} ${endY}`;
    const altClass = index % 2 === 0 ? '' : ' alt';
    return `<path class="network-connection${altClass}" d="${d}" />`;
  }).join('');

  svg.innerHTML = `
    <defs>
      <linearGradient id="networkGradient" x1="0%" x2="100%" y1="0%" y2="0%">
        <stop offset="0%" stop-color="#22D3EE" />
        <stop offset="50%" stop-color="#A855F7" />
        <stop offset="100%" stop-color="#10B981" />
      </linearGradient>
      <linearGradient id="networkGradientAlt" x1="0%" x2="100%" y1="0%" y2="0%">
        <stop offset="0%" stop-color="#10B981" />
        <stop offset="50%" stop-color="#06B6D4" />
        <stop offset="100%" stop-color="#A855F7" />
      </linearGradient>
    </defs>
    ${paths}
  `;
}

function renderHardwareCards(data) {
  const container = document.getElementById('hardware-cards');
  if (!container) return;

  const source = Array.isArray(data) && data.length ? data : (serverCarouselState.serverData.length ? serverCarouselState.serverData : getFallbackServers(50));
  serverCarouselState.serverData = source;

  const totalServers = Math.max(source.length, 50);
  serverCarouselState.totalServers = totalServers;
  const pageCount = Math.max(1, Math.ceil(totalServers / serverCarouselState.pageSize));

  if (serverCarouselState.currentPage >= pageCount) {
    serverCarouselState.currentPage = 0;
  }

  const startIndex = serverCarouselState.currentPage * serverCarouselState.pageSize;
  const pageServers = source.slice(startIndex, startIndex + serverCarouselState.pageSize);
  const slots = Array.from({ length: serverCarouselState.pageSize }, (_, index) => {
    const server = pageServers[index];
    if (!server) {
      return '<div class="server-slot-empty" aria-hidden="true"></div>';
    }

    const estado = String(server.estado || 'ACTIVO').toUpperCase();
    const online = estado !== 'INACTIVO';
    const hostname = server.hostname || `srv-green-${String(startIndex + index + 1).padStart(3, '0')}`;
    const ip = server.ip_address || `10.11.${Math.floor((startIndex + index) / 16)}.${((startIndex + index) % 16) + 10}`;
    const cpuCores = server.cpu_cores || 16;
    const ramGb = server.ram_gb || 32;
    const maxWatts = server.max_watts || 320;
    const cpuUtil = Number(server.cpu_utilization_pct ?? 0);
    const tempC = Number(server.temperatura_celsius ?? 36);

    return `
      <article class="server-card ${online ? 'online' : 'offline'}" data-server="${escapeHtml(hostname)}">
        <div class="server-header">
          <div class="server-name">${hostname}</div>
          <span class="server-status ${online ? 'online' : 'offline'}">${estado}</span>
        </div>

        <div class="server-meta">
          <div class="server-meta-item">
            <span class="meta-label">IP</span>
            <span class="meta-value mono">${ip}</span>
          </div>
          <div class="server-meta-item">
            <span class="meta-label">Cores</span>
            <span class="meta-value mono">${cpuCores}</span>
          </div>
          <div class="server-meta-item">
            <span class="meta-label">RAM</span>
            <span class="meta-value mono">${ramGb} GB</span>
          </div>
          <div class="server-meta-item">
            <span class="meta-label">Power</span>
            <span class="meta-value mono">${maxWatts} W</span>
          </div>
        </div>

        <div class="server-metrics">
          <div class="metric-box"><span>CPU</span><strong>${Math.max(0, Math.round(cpuUtil))}%</strong></div>
          <div class="metric-box"><span>Temp</span><strong>${tempC.toFixed(2)}°C</strong></div>
        </div>
      </article>
    `;
  });

  container.innerHTML = slots.join('');

  const cards = container.querySelectorAll('.server-card');
  cards.forEach((card) => {
    const pause = () => {
      if (serverCarouselState.hoverPaused) return;
      serverCarouselState.hoverPaused = true;
      startServerAutoplay();
    };
    const resume = () => {
      serverCarouselState.hoverPaused = false;
      startServerAutoplay();
    };

    card.addEventListener('mouseenter', pause);
    card.addEventListener('mouseleave', resume);
  });

  updateServerCarouselControls();
  requestAnimationFrame(() => renderTopologyConnections());
}

function moveServerPage(direction) {
  if (serverCarouselState.isTransitioning) return;

  const totalPages = Math.max(1, Math.ceil(serverCarouselState.totalServers / serverCarouselState.pageSize));
  const nextPage = (serverCarouselState.currentPage + direction + totalPages) % totalPages;
  const container = document.getElementById('hardware-cards');

  if (!container) {
    serverCarouselState.currentPage = nextPage;
    return;
  }

  serverCarouselState.isTransitioning = true;
  container.classList.remove('fade-in');
  container.classList.add('fade-out');

  setTimeout(() => {
    serverCarouselState.currentPage = nextPage;
    renderHardwareCards(serverCarouselState.serverData);

    const activeContainer = document.getElementById('hardware-cards');
    if (activeContainer) {
      activeContainer.classList.remove('fade-out');
      void activeContainer.offsetWidth;
      activeContainer.classList.add('fade-in');
    }

    setTimeout(() => {
      serverCarouselState.isTransitioning = false;
      updateServerCarouselControls();
    }, 360);
  }, 350);
}

function updateServerCarouselControls() {
  const prevBtn = document.getElementById('server-prev-btn');
  const nextBtn = document.getElementById('server-next-btn');
  const autoplayBtn = document.getElementById('server-autoplay-btn');
  const bars = document.getElementById('server-page-bars');

  if (!bars || !prevBtn || !nextBtn || !autoplayBtn) return;

  const totalPages = Math.max(1, Math.ceil((serverCarouselState.totalServers || 50) / serverCarouselState.pageSize));
  bars.innerHTML = '';

  for (let index = 0; index < totalPages; index += 1) {
    const bar = document.createElement('button');
    bar.type = 'button';
    bar.className = 'page-bar';
    if (index === serverCarouselState.currentPage) {
      bar.classList.add('active');
    }
    bar.setAttribute('aria-label', `Ir al bloque ${index + 1}`);
    bar.addEventListener('click', () => {
      if (index === serverCarouselState.currentPage) return;
      serverCarouselState.currentPage = index;
      renderHardwareCards(serverCarouselState.serverData);
      startServerAutoplay();
    });
    bars.appendChild(bar);
  }

  prevBtn.disabled = totalPages <= 1 || serverCarouselState.isTransitioning;
  nextBtn.disabled = totalPages <= 1 || serverCarouselState.isTransitioning;
  autoplayBtn.textContent = serverCarouselState.autoPlay && !serverCarouselState.hoverPaused ? 'Pausar rotación' : 'Reanudar rotación';
}

function bindServerCarouselControls() {
  const prevBtn = document.getElementById('server-prev-btn');
  const nextBtn = document.getElementById('server-next-btn');
  const autoplayBtn = document.getElementById('server-autoplay-btn');

  if (!prevBtn || !nextBtn || !autoplayBtn) return;

  prevBtn.addEventListener('click', () => moveServerPage(-1));
  nextBtn.addEventListener('click', () => moveServerPage(1));
  autoplayBtn.addEventListener('click', () => {
    serverCarouselState.autoPlay = !serverCarouselState.autoPlay;
    if (!serverCarouselState.autoPlay) {
      serverCarouselState.hoverPaused = false;
    }
    startServerAutoplay();
  });

  startServerAutoplay();
}

async function initializeDashboard() {
  const session = await checkAuthSession();
  if (!session) return;
  renderUserProfile(session);
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

async function initializeNetworkPage() {
  const session = await checkAuthSession();
  if (!session) return;
  renderUserProfile(session);
  bindServerCarouselControls();
  loadNetworkData();
  const viewButtons = document.querySelectorAll('[data-view-toggle]');
  viewButtons.forEach((button) => {
    button.addEventListener('click', () => toggleNetworkView(button.dataset.viewToggle));
  });
  toggleNetworkView('logical');
  window.addEventListener('resize', renderTopologyConnections);
  setInterval(loadNetworkData, 10000);
}

document.addEventListener('DOMContentLoaded', async () => {
  updateClock();
  setInterval(updateClock, 1000);
  bindThemeToggle();
  setupPasswordStrength();
  setupLogoutButton();
  setupLoginForm();
  setupRegisterForm();
  bindSettingsModal();

  let session = null;
  try {
    session = await getAuthSession();
    getSupabaseClient().auth.onAuthStateChange((_event, nextSession) => {
      activeAuthSession = nextSession;
      renderUserProfile(nextSession);
      bindPublicNavState(nextSession);
    });
  } catch (error) {
    console.error(error.message);
    setMessage('message', error.message, true);
  }
  renderUserProfile(session);
  bindPublicNavState(session);

  if (document.getElementById('wattsChart') || document.getElementById('resourcesChart') || document.getElementById('monthlyEnergyChart')) {
    await initializeDashboard();
  }

  if (document.getElementById('hardware-cards') || document.getElementById('physical-rack')) {
    await initializeNetworkPage();
  }
});
