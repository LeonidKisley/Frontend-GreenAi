# Green AI — Frontend

Frontend estático con Supabase Auth y métricas de Monitoring a través de Gateway. El dashboard consulta catálogo, valores actuales e históricos. CPU se presenta como porcentaje; memoria como bytes escalados; red y filesystem mantienen sus series separadas. Se muestran procedencia, calidad, advertencias y periodo. Energía, predicciones, inventario y topología están marcados como «En desarrollo».

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

Únicas rutas funcionales: GET `/api/monitoring/v1/metrics/catalog`, `current` e `history`. El Frontend no accede a tablas Supabase ni a microservicios internos. Auth es la única excepción para login, registro y renovación.

El SDK conserva la sesión; `authenticatedFetch` adjunta Bearer exclusivamente al Gateway configurado. Ante 401 renueva una vez y reintenta GET. Un 403 muestra falta de permisos y no renueva. Gateway valida firma, issuer, audience, expiración y `user_role`. Decodificar el claim en la interfaz solo sirve para presentación.

Nuevas cuentas: OPERATOR. ADMIN solo se asigna desde servidor mediante el SQL administrativo comentado en el script. Volver a iniciar sesión tras cambiar el rol. Un claim ausente aparece como PENDING y Gateway rechaza el acceso.

## Verificación

`node --test tests/frontend.test.cjs`

Prueba manual: login → dashboard → seleccionar métrica, clúster y nodo → revisar histórico → cerrar sesión. Sin fuente se muestra vacío/error, nunca datos inventados. CPU/red necesitan muestras para su ventana de 60 segundos. El Simulator genera un clúster nuevo al reiniciar.

Referencias: [Auth](https://supabase.com/docs/guides/auth), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
