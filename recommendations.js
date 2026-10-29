/* Recommendations are proposals for human review. No infrastructure action is sent. */
function readDemoTelemetry(resource) {
  const timestamp = document.getElementById('policy-time').value;
  if (!timestamp) return null;
  const number = id => {
    const value = document.getElementById(id).value.trim();
    return value === '' ? null : Number(value);
  };
  return {resource, observedAt: new Date(timestamp).toISOString(),
    origin: document.getElementById('policy-origin').value,
    memoryPercent: number('policy-memory'), latencyP95Ms: number('policy-latency'),
    errorRatePercent: number('policy-errors')};
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('recommendation-form');
  if (!form) return;
  const button = document.getElementById('recommend-button');
  let busy = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const cluster = document.getElementById('cluster').value;
    const id = document.getElementById('node').value;
    put('recommendation-result', '');
    if (!cluster || !id) { put('recommendation-status', 'Selecciona un clúster y un nodo.'); return; }
    busy = true; button.disabled = true;
    try {
      const telemetry = readDemoTelemetry({type:'node', cluster, id});
      put('recommendation-status', 'Preparando predicción y evaluando restricciones…');
      const end = new Date(Date.now() - 30000);
      const params = new URLSearchParams({cluster, resourceId:id, stepSeconds:'15',
        start:GreenMetrics.rfc3339Seconds(new Date(end.getTime()-7200000)), end:GreenMetrics.rfc3339Seconds(end)});
      const dataset = await predictionRequest(`/api/processing/v1/prediction/dataset?${params}`);
      const result = await predictionRequest('/api/recommendations/v1/recommendations', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({dataset,telemetry})});
      const statuses = {not_evaluable:'No evaluable', blocked:'Bloqueada por restricciones', eligible_for_review:'Lista para revisión humana'};
      const actions = {none:'Sin propuesta', maintain:'Mantener capacidad', review_capacity_reduction:'Revisar posible reducción de capacidad', review_capacity_increase:'Revisar aumento de capacidad'};
      if (!statuses[result.status] || !actions[result.action] || result.executionAllowed !== false
          || result.resource?.id !== id || result.resource?.cluster !== cluster) throw new Error('Respuesta de recomendación inválida.');
      put('recommendation-status', `${statuses[result.status]} · ${cluster} / ${id}`);
      const labels = {prediction_freshness:'Vigencia de la predicción', telemetry_identity_and_freshness:'Recurso y vigencia de telemetría', memoryPercent:'Memoria', latencyP95Ms:'Latencia p95', errorRatePercent:'Errores'};
      const checks = {pass:'Cumple', fail:'Excede límite', unknown:'Sin evidencia suficiente'};
      put('recommendation-result', `${actions[result.action]}\n${result.checks.map(c => `${labels[c.name] || c.name}: ${checks[c.status] || c.status}`).join('\n')}\nLímites demo: CPU ${result.policy.cpuLowPercent}–${result.policy.cpuHighPercent} %, memoria ≤${result.policy.memoryMaxPercent} %, p95 ≤${result.policy.latencyP95MaxMs} ms, errores ≤${result.policy.errorRateMaxPercent} %.\n${result.warnings.join('\n')}\nReferencia: ${result.recommendationId}`);
    } catch (error) { put('recommendation-status', error.message); }
    finally { busy = false; button.disabled = false; }
  });
  const energyForm = document.getElementById('energy-form');
  let energyBusy = false;
  energyForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (energyBusy) return;
    const file = document.getElementById('energy-file').files[0];
    if (!file) { put('energy-status', 'Selecciona un archivo JSON de potencia.'); return; }
    if (file.size > 1500000) { put('energy-status', 'El archivo supera 1,5 MB.'); return; }
    energyBusy = true;
    document.getElementById('energy-button').disabled = true;
    put('energy-status', 'Integrando muestras de potencia…');
    try {
      const body = JSON.parse(await file.text());
      const result = await predictionRequest('/api/recommendations/v1/energy', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
      if (!Number.isFinite(result.energyKwh) || result.energyKwh < 0
          || (result.co2eKg !== null && (!Number.isFinite(result.co2eKg) || result.co2eKg < 0))) throw new Error('Resultado de energía inválido.');
      put('energy-status', `${result.energyKwh.toFixed(6)} kWh · ${result.co2eKg === null ? 'CO₂e no evaluable: falta factor' : result.co2eKg.toFixed(6)+' kg CO₂e'} · ${GreenMetrics.origin(result.origin)}\n${result.start} — ${result.end}\n${result.warnings.join(' ')}`);
    } catch (error) { put('energy-status', `No se pudo calcular: ${error.message}`); }
    finally { energyBusy = false; document.getElementById('energy-button').disabled = false; }
  });
});
