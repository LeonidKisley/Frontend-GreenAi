# GreenAi_TPI

Proyecto GreenAi para la asignatura de Taller de Proyectos I.

Sistema de monitoreo de consumo energético (Watts, CPU, RAM, temperatura) de una flota de servidores.

## Arquitectura de microservicios

```
┌─────────────────┐      HTTP       ┌────────────────────┐      HTTP       ┌──────────────────────────┐
│   Frontend      │ ───────────────►│  green-ai-gateway   │ ───────────────►│  monitoring-service      │
│ (cliente puro)  │  :8081          │  Spring Cloud GW    │  :8080          │  (o mock-monitoring)     │
└─────────────────┘   /api/monitoring/v1/metrics/*          /api/v1/metrics/*   └──────────────────────────┘
```

El Frontend (**GreenAi_TPI**) actúa como **cliente puro**: consume directamente los contratos del Gateway en el puerto `8081`, sin intermediarios.

Contrato consumido (todos `GET`):

| Endpoint (Gateway)            | Descripción                                  |
| ----------------------------- | -------------------------------------------- |
| `/api/monitoring/v1/metrics/catalog`  | Catálogo de nodos/servidores (hardware). |
| `/api/monitoring/v1/metrics/current`  | Telemetría actual (snapshot) de cada nodo. |
| `/api/monitoring/v1/metrics/history`  | Serie histórica de lecturas de telemetría. |

El Gateway reenvía a `monitoring-service` con `StripPrefix=3` y `PrefixPath=/api/v1`
(o sea `catalog`/`current`/`history` expuestos como `/api/v1/metrics/*`).

## Requisitos

- Docker (Docker Desktop en Windows/macOS)
- Node.js 18+ (solo para el mock cuando corre en el host)
- Backend Node (opcional, para autenticación en el puerto 3001)

## Levantar el entorno local (verificado)

> Se usa una red Docker dedicada `greenai-net` para que el Gateway y el mock se
> comuniquen por nombre de servicio.

### 1) Levantar el mock del monitoring-service

```bash
# Construir la imagen del mock (desde la carpeta mock-monitoring/)
docker build -t green-ai-monitoring-mock ./mock-monitoring

# Crear la red (si no existe)
docker network create greenai-net

# Ejecutar el mock dentro de la red
docker run -d --name mock-monitoring --network greenai-net green-ai-monitoring-mock
```

### 2) Levantar la imagen del green-ai-gateway

```bash
docker run -d --name gateway-app \
  --network greenai-net \
  -p 8081:8081 \
  -e GATEWAY_MONITORING_BASE_URL=http://mock-monitoring:8080 \
  -e GATEWAY_CORS_ALLOWED_ORIGIN=http://localhost:3001 \
  green-ai-gateway:latest
```

Variables de entorno clave del Gateway:

- `GATEWAY_MONITORING_BASE_URL`: URL del `monitoring-service` (en la red se usa `http://mock-monitoring:8080`).
- `GATEWAY_CORS_ALLOWED_ORIGIN`: origen del Frontend permitido (p. ej. `http://localhost:3001`).

### 3) Verificar las métricas

```bash
# PowerShell
Invoke-WebRequest http://localhost:8081/api/monitoring/v1/metrics/catalog
Invoke-WebRequest http://localhost:8081/api/monitoring/v1/metrics/current
Invoke-WebRequest http://localhost:8081/api/monitoring/v1/metrics/history

# o curl
curl http://localhost:8081/api/monitoring/v1/metrics/current
```

Salida esperada (JSON):

```jsonc
// current
[
  {
    "nodeId": "NODE-01",
    "hostname": "NODE-01",
    "timestamp": "2026-09-22T23:32:40.925Z",
    "cpuUtilizationPct": 61.7,
    "ramUtilizationPct": 50.8,
    "temperaturaCelsius": 48.2,
    "energiaWatts": 209.6,
    "estado": "ACTIVO"
  }
]
```

### 4) Probar el Frontend

Opción A — sirviendo desde el backend de autenticación (recomendado):

```bash
cd Backend
npm install
npm start   # levanta en http://localhost:3001 (sirve Frontend/ + /api de login y registro)
```

Abrir `http://localhost:3001/index.html`. El login/registro usa el backend en
`localhost:3001` y las métricas se leen directo del Gateway en `8081`.

Opción B — sin autenticación (cliente puro):

Abrir directamente los HTML del Frontend (`index.html`, `dashboard.html`, `network.html`).
Las métricas se consumen de `http://localhost:8081/api/monitoring/v1/metrics/*`.

> El Gateway también sirve Prometheus en `/actuator/prometheus` y health en
> `/actuator/health`.

## Alternativa: mock corriendo en el host

Si preferís tener el mock en tu máquina (no en Docker) tenés que apuntar el Gateway
al host. Desde un contenedor usá `host.docker.internal` (Docker Desktop):

```bash
node mock-monitoring/server.js   # levanta el mock en 127.0.0.1:8080

docker run -d --name gateway-app \
  -p 8081:8081 \
  -e GATEWAY_MONITORING_BASE_URL=http://host.docker.internal:8080 \
  -e GATEWAY_CORS_ALLOWED_ORIGIN=http://localhost:3001 \
  green-ai-gateway:latest
```

En Linux nativo con `--network host` el Gateway alcanza el mock con el valor por
defecto (`http://127.0.0.1:8080`).

## Estructura del repositorio

```
GreenAi_TPI/
├── Frontend/            # Cliente puro (HTML + JS/CSS). Consume el Gateway en :8081
├── Backend/             # Backend de autenticación (Express + Supabase), sirve Frontend en :3001
├── mock-monitoring/     # Mock del monitoring-service (contrato /api/v1/metrics/*)
├── exporter/            # Exporter de métricas (Prometheus) con Dockerfile
└── K8s/                 # Manifiestos Kubernetes (microservicios y observabilidad)
```