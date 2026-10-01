# Green AI — Frontend

Frontend estático con Supabase Auth, métricas de Monitoring y estimaciones experimentales de CPU a través de Gateway. CPU se presenta como porcentaje; memoria como bytes escalados; red y filesystem mantienen sus series separadas. Se muestran procedencia, calidad, advertencias y periodo. Energía, inventario y topología física siguen como propuestas futuras.

## Configurar Supabase

1. Ejecutar `supabase-auth-setup.sql` en SQL Editor. Crea perfiles y roles separados; no modifica los históricos.
2. Activar `public.custom_access_token_hook` en Authentication → Hooks → Custom Access Token → Postgres.
3. En Authentication → URL Configuration, usar Site URL `http://127.0.0.1:3001` y permitir `http://127.0.0.1:3001/login.html`.
4. Habilitar Email y Confirm Email. Para confirmaciones a usuarios externos al equipo, configurar SMTP propio.
5. Verificar que JWKS publique una clave ES256 o RS256.
6. Copiar `config.example.js` a `config.local.js` y completar Project URL, publishable key y URL pública del Gateway. Nunca usar secretos o service_role.

Los usuarios existentes en `public.usuario` no son automáticamente cuentas de Auth. Crear una cuenta en Authentication → Users o registrarse desde la página. No borrar usuarios históricos: las FK actuales tienen borrado en cascada.

## Ejecutar

Desde esta carpeta: `python -m http.server 3001 --bind 127.0.0.1`.
Abrir `http://127.0.0.1:3001/login.html`. La confirmación PKCE debe abrirse en el mismo navegador/origen usado para registrarse. Usar HTTP, no file://.

Desde el workspace: `docker compose up -d --build`. El compose monta `config.local.js` en el contenedor de Frontend; no se incluye en la imagen. Para cambiarla, editar el archivo y recargar el navegador. El servidor Nginx escucha en 3001.

## API y sesión

Rutas funcionales: GET `/api/monitoring/v1/metrics/catalog`, `current` e `history`; GET `/api/processing/v1/prediction/dataset`; POST `/api/prediction/v1/predictions`. El Frontend no accede a tablas Supabase ni a microservicios internos. Auth es la única excepción para login, registro y renovación.

## Estimación experimental de CPU

1. Iniciar sesión y elegir un clúster y un nodo concretos.
2. Pulsar «Estimar CPU del nodo seleccionado». El panel solicita hasta dos horas de CPU a Data Processing (paso 15 s) y envía ese JSON intacto a Prediction mediante Gateway. Esta ventana es independiente del selector del gráfico.
3. Leer valor, recurso, instante estimado, horizonte, modelo, origen de entrada y advertencias. El modelo remuestrea cada 5 minutos y necesita al menos seis intervalos consecutivos para sus características actuales; puede requerir más datos si hay huecos.

El modelo de la imagen se entrena con un fixture sintético; el resultado es una estimación experimental, no evidencia de ahorro energético. Una ventana insuficiente devuelve un mensaje explícito. El POST no se reintenta automáticamente: si vence la sesión, iniciar sesión y volver a solicitar. La estimación queda ligada al recurso mostrado aunque después cambien los filtros. No se ejecuta inferencia automática cada 15 segundos.

El SDK conserva la sesión; `authenticatedFetch` adjunta Bearer exclusivamente al Gateway configurado. Ante 401 renueva una vez y reintenta GET. Un 403 muestra falta de permisos y no renueva. Gateway valida firma, issuer, audience, expiración y `user_role`. Decodificar el claim en la interfaz solo sirve para presentación.

Nuevas cuentas: OPERATOR. ADMIN solo se asigna desde servidor mediante el SQL administrativo comentado en el script. Volver a iniciar sesión tras cambiar el rol. Un claim ausente aparece como PENDING y Gateway rechaza el acceso.

## Verificación

`node --test tests/frontend.test.cjs`

Prueba manual: login → dashboard → seleccionar métrica, clúster y nodo → revisar histórico → cerrar sesión. Sin fuente se muestra vacío/error, nunca datos inventados. CPU/red necesitan muestras para su ventana de 60 segundos. El Simulator genera un clúster nuevo al reiniciar.

Referencias: [Auth](https://supabase.com/docs/guides/auth), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
