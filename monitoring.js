let historyChart;
let catalog = [];
let refreshTimer;
let refreshing = false;
const names = {'node.cpu.utilization':'CPU', 'node.memory.used':'Memoria utilizada', 'node.network.receive':'Red recibida', 'node.network.transmit':'Red transmitida', 'node.filesystem.used':'Filesystem utilizado'};
const $ = id => document.getElementById(id);
function put(id, text) { if ($(id)) $(id).textContent = text; }
function options(id, entries, selected) {
  $(id).replaceChildren(...entries.map(([value, label]) => new Option(label, value)));
  if (entries.some(([value]) => value === selected)) $(id).value = selected;
}
async function metricRequest(operation, params = {}) {
  const response = await authenticatedFetch(`${GATEWAY_BASE_URL}/api/monitoring/v1/metrics/${operation}?${new URLSearchParams(params)}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const id = response.headers.get('X-Request-Id');
    throw new Error(`${body.detail || 'No se pudieron consultar las métricas.'} (HTTP ${response.status})${id ? ' · Referencia: ' + id : ''}`);
  }
  return response.json();
}
function renderCurrent(payload) {
  const rows = payload.series.flatMap(series => {
    const sample = series.samples.at(-1);
    return [[series.resource.cluster, series.resource.id, Object.entries(series.labels).map(([k,v]) => `${k}=${v}`).join(', ') || '—',
      GreenMetrics.value(sample, payload.unit), GreenMetrics.origin(series.origin), sample?.quality || 'missing',
      sample ? new Date(sample.timestamp).toLocaleString() : 'Sin dato']];
  });
  $('metric-rows').replaceChildren(...rows.map(values => {
    const row = document.createElement('tr');
    values.forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); });
    return row;
  }));
  put('current-status', rows.length ? GreenMetrics.status(payload.dataStatus) : 'Sin datos para estos filtros.');
  put('warnings', payload.warnings.join(' · '));
}
function drawHistory(payload) {
  historyChart?.destroy();
  if (typeof Chart === 'undefined') { put('history-status', 'No se pudo cargar el gráfico. Los valores actuales siguen disponibles.'); return; }
  const ratio = payload.unit === 'ratio';
  const labels = [...new Set(payload.series.flatMap(series => series.samples.map(s => s.timestamp)))].sort();
  historyChart = new Chart($('history-chart'), {
    type:'line',
    data:{labels:labels.map(t => new Date(t).toLocaleTimeString()), datasets:payload.series.map((series, i) => {
      const values = new Map(series.samples.map(s => [s.timestamp, s]));
      return { label:`${series.resource.id} ${Object.values(series.labels).join(' ')} · ${GreenMetrics.origin(series.origin)}`,
        data:labels.map(t => { const s = values.get(t); return s?.quality === 'valid' && Number.isFinite(s.value) ? s.value * (ratio ? 100 : 1) : null; }),
        borderColor:['#06b6d4','#a855f7','#10b981','#f59e0b','#fb7185'][i % 5], pointRadius:0, spanGaps:false };
    })},
    options:{responsive:true, maintainAspectRatio:false, animation:false, plugins:{legend:{labels:{color:'#94a3b8'}}},
      scales:{x:{ticks:{color:'#94a3b8',maxTicksLimit:8}},y:{title:{display:true,text:ratio ? '%' : payload.unit},ticks:{color:'#94a3b8'}}}}
  });
  put('history-status', `${GreenMetrics.status(payload.dataStatus)} · ${new Date(payload.start).toLocaleString()} — ${new Date(payload.end).toLocaleString()} · ${payload.warnings.join(' · ')}`);
}
async function refreshMetrics() {
  if (refreshing) return;
  refreshing = true;
  clearTimeout(refreshTimer);
  $('refresh').disabled = true;
  for (const id of ['metric','cluster','node','period']) $(id).disabled = true;
  put('request-status', 'Consultando…');
  try {
    const metric = $('metric').value;
    const all = await metricRequest('current', {metric, resourceType:'node'});
    const oldCluster = $('cluster').value;
    options('cluster', [['','Todos los clústeres'], ...[...new Set(all.series.map(s => s.resource.cluster))].sort().map(c => [c,c])], oldCluster);
    const cluster = $('cluster').value;
    const oldNode = $('node').value;
    options('node', [['','Todos los nodos'], ...[...new Set(all.series.filter(s => !cluster || s.resource.cluster === cluster).map(s => s.resource.id))].sort().map(n => [n,n])], oldNode);
    const node = $('node').value;
    const params = {metric, resourceType:'node', ...(cluster ? {cluster} : {}), ...(node ? {resourceId:node} : {})};
    const current = cluster || node ? await metricRequest('current', params) : all;
    renderCurrent(current);
    const end = new Date();
    const start = new Date(end.getTime() - Number($('period').value) * 60000);
    let historyError;
    try {
      drawHistory(await metricRequest('history', {
        ...params,
        start:GreenMetrics.rfc3339Seconds(start),
        end:GreenMetrics.rfc3339Seconds(end),
        stepSeconds:'15'
      }));
    } catch (error) {
      historyError = error;
      historyChart?.destroy(); historyChart = null;
      put('history-status', `Histórico no disponible: ${error.message}`);
    }
    const definition = catalog.find(m => m.id === metric);
    if (definition) put('metric-description', `${definition.description} Unidad original: ${definition.unit}.`);
    put('request-status', historyError
      ? `Valores actuales disponibles · ${historyError.message}`
      : `Actualizado ${new Date().toLocaleTimeString()} · zona ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  } catch (error) {
    $('metric-rows').replaceChildren();
    historyChart?.destroy(); historyChart = null;
    put('current-status','Consulta no disponible'); put('history-status','Consulta no disponible'); put('warnings','');
    put('request-status', error.message);
  } finally {
    refreshing = false;
    $('refresh').disabled = false;
    for (const id of ['metric','cluster','node','period']) $(id).disabled = false;
    refreshTimer = setTimeout(refreshMetrics, 15000);
  }
}
async function startMonitoring() {
  try {
    catalog = await metricRequest('catalog');
    options('metric', catalog.map(m => [m.id, names[m.id] || m.id]));
    $('refresh').onclick = refreshMetrics;
    for (const id of ['metric','cluster','node','period']) $(id).onchange = refreshMetrics;
    await refreshMetrics();
  } catch (error) { put('request-status',error.message); $('refresh').onclick = startMonitoring; }
}
window.addEventListener('pagehide', () => clearTimeout(refreshTimer));
