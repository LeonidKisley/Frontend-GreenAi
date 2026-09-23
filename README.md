# Green AI — Frontend

Interfaz web de Green AI para monitorear consumo energético, recursos del clúster, topología de red y autenticación de operadores. Frontend estático (HTML + CSS + JavaScript) sin framework, servido junto al backend del proyecto.

HTML5 · CSS3 (theme cyberpunk/glassmorphism) · JavaScript vanilla · Chart.js.

## Páginas

| Archivo | Ruta | Descripción |
| --- | --- | --- |
| `index.html` | `/` | Landing: presentación de la plataforma y acceso a Login/Registro. |
| `login.html` | `/login.html` | Inicio de sesión de operadores. |
| `register.html` | `/register.html` | Registro de operador (rol fijo `OPERADOR`) con indicador de fortaleza de contraseña. |
| `dashboard.html` | `/dashboard.html` | KPIs, gráficos de telemetría (Watts, CPU/RAM, consumo mensual) y tablas de usuarios, hardware y logs. |
| `network.html` | `/network.html` | Topología de red: vista lógica (switch core + servidores) y vista física (racks A–E). |

## Estructura

```text
Frontend/
├── index.html       Landing
├── login.html       Autenticación
├── register.html    Registro de operadores
├── dashboard.html   Panel de telemetría y tablas
├── network.html     Topología de red
├── styles.css       Estilos base y componentes (glass-panel, kpi-card, etc.)
├── styles2.css      Estilos adicionales (no referenciado por las páginas actuales)
├── app.js           Lógica: API, sesión, gráficos, carrusel de servidores, temas
├── README.md        Este documento
└── .gitignore
```

## Endpoint de API

`app.js` define `API_URL` de forma dinámica:

- Si la página se abre por `file://` o sin origen, usa `http://localhost:3001/api`.
- Si se sirve por HTTP, usa `${window.location.origin}/api`.

Endpoints consumidos:

| Método | Ruta | Uso |
| --- | --- | --- |
| POST | `/api/login` | Iniciar sesión; guarda `usuarioLogueado` en `localStorage`. |
| POST | `/api/registro` | Crear operador; guarda la sesión y redirige al dashboard. |
| GET | `/api/kpis` | Tarjetas: nodos activos, watts totales, CPU y RAM promedio. |
| GET | `/api/hardware` | Tabla de hardware y servidores del clúster. |
| GET | `/api/logs` | Logs de telemetría, gráficos y consumo mensual. |
| GET | `/api/usuarios` | Tabla de operadores (visible solo para roles distintos de OPERATOR). |

## Sesión y roles

- La sesión se guarda en `localStorage` bajo la clave `usuarioLogueado`.
- `dashboard.html` y `network.html` redirigen a `login.html` si no hay sesión válida (`checkAuthSession`).
- Los elementos con `data-admin-only="true"` (p. ej. tabla de operadores) se ocultan para el rol `OPERATOR`.
- El botón "Cerrar sesión" elimina la clave y vuelve al login.

## Ejecutar

No requiere instalación ni build. Opciones:

1. **Con servidor estático** (recomendado para desarrollo; el backend puede estar en `http://localhost:3001`):

   ```powershell
   python -m http.server 3001 --directory Frontend
   ```

2. **Directo**: abrir `index.html` en el navegador. La API se resolverá a `http://localhost:3001/api`.

Si la página se sirve desde otro origen o puerto, el backend (o gateway) debe permitir CORS para ese origen.

## Notas de implementación

- **Datos offline**: si `/api/hardware` o `/api/logs` fallan, `network.html` genera 50 servidores simulados (`getFallbackServers`) para mantener la vista funcional.
- **Gráficos**: se inicializan con Chart.js (CDN `chart.js`). El consumo mensual usa datos estáticos de respaldo `[330, 420, 390, 480, 460, 510]` (kWh).
- **Refresco**: dashboard y network se recargan cada 10 segundos.
- **Tema y acentos**: tema claro/oscuro y acento (cyan/verde/púrpura) persistidos en `localStorage` (`greenai-theme`, `greenai-accent`).

## Ley de protección de datos

El proyecto se desarrolla conforme a la Ley N° 29733 (Ley de Protección de Datos Personales del Perú).