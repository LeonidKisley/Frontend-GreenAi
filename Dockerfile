FROM nginx:1.28.0-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY *.html *.css app.js metrics.js monitoring.js /usr/share/nginx/html/
EXPOSE 3001
