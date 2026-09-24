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
    role: String(claims.user_role || 'PENDING').toUpperCase()
  };
}

async function getAuthSession() {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  activeAuthSession = data.session;
  return activeAuthSession;
}

let refreshInFlight;
async function authenticatedFetch(url, options = {}) {
  const target = new URL(url, location.href);
  const gateway = new URL(GATEWAY_BASE_URL, location.href);
  if (target.origin !== gateway.origin || !target.pathname.startsWith('/api/')) throw new Error('Destino de API no permitido.');
  let session = await getAuthSession();
  if (!session) { location.replace('login.html'); throw new Error('Inicia sesión nuevamente.'); }
  const send = token => {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/json');
    return fetch(target, {...options, headers, signal: options.signal || AbortSignal.timeout(10000)});
  };
  let response = await send(session.access_token);
  if (response.status === 401 && (!options.method || options.method === 'GET')) {
    refreshInFlight ||= getSupabaseClient().auth.refreshSession().finally(() => { refreshInFlight = null; });
    const refreshed = await refreshInFlight;
    if (!refreshed.error && refreshed.data.session) response = await send(refreshed.data.session.access_token);
    if (refreshed.error || response.status === 401) {
      await getSupabaseClient().auth.signOut({scope:'local'});
      location.replace('login.html');
      throw new Error('La sesión no es válida. Inicia sesión nuevamente.');
    }
  }
  return response;
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

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      setMessage('message', '¡Bienvenido! Redirigiendo...');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
    } catch (error) {
      setMessage('message', error.message || 'Error de conexión.', true);
    } finally {
      submit.disabled = false;
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
        if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
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


document.addEventListener('DOMContentLoaded', async () => {
  const protectedPage = /\/(dashboard|network)\.html$/.test(location.pathname);
  setupLoginForm(); setupRegisterForm();
  const logout = document.getElementById('logout-btn');
  if (logout) logout.onclick = async () => {
    const {error} = await getSupabaseClient().auth.signOut({scope:'local'});
    if (error) { alert('No se pudo cerrar sesión. Inténtalo otra vez.'); return; }
    location.replace('login.html');
  };
  try {
    const session = await getAuthSession();
    if (protectedPage && !session) { location.replace('login.html'); return; }
    function showProfile(next) {
      activeAuthSession = next;
      const view = sessionUserView(next);
      const name = document.getElementById('user-name-display');
      const role = document.getElementById('user-role-badge');
      if (name) name.textContent = view?.nombre_completo || '';
      if (role) role.textContent = view?.role || '';
    }
    showProfile(session);
    getSupabaseClient().auth.onAuthStateChange((event,next) => {
      showProfile(next);
      if (event === 'SIGNED_OUT' && protectedPage) location.replace('login.html');
    });
    if (session && document.getElementById('login-form')) { location.replace('dashboard.html'); return; }
    if (session && document.getElementById('metric')) await startMonitoring();
  } catch (error) {
    const target = document.getElementById('request-status') || document.getElementById('message');
    if (target) target.textContent = error.message;
  }
});
