/* Two explicit user-authorized requests, both through the authenticated Gateway. */
async function predictionRequest(path, options = {}) {
  const response = await authenticatedFetch(`${GATEWAY_BASE_URL}${path}`, {
    ...options, signal: AbortSignal.timeout(35000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reference = response.headers.get('X-Request-Id');
    const hints = {
      401: 'Tu sesión venció. Inicia sesión de nuevo antes de repetir la operación.',
      403: 'Tu cuenta no tiene permiso para esta operación.',
      422: 'No hay una ventana de CPU utilizable. Espera más muestras o selecciona otro nodo.',
      503: 'El servicio o su modelo no están disponibles.',
      504: 'La consulta excedió el tiempo de espera.'
    };
    throw new Error(`${hints[response.status] || body.detail || body.message || 'No se pudo completar la estimación.'} (HTTP ${response.status})${reference ? ' · Referencia: ' + reference : ''}`);
  }
  return body;
}

function validatePrediction(result, dataset) {
  if (result.origin !== 'estimated' || result.target !== 'cpu_utilization' || result.unit !== '%'
      || !Number.isFinite(result.value) || result.value < 0 || result.value > 100
      || result.inputDatasetId !== dataset.datasetId
      || result.resource?.id !== dataset.resource.id || result.resource?.cluster !== dataset.resource.cluster
      || !Number.isFinite(Date.parse(result.predictedFor))) {
    throw new Error('La respuesta de Prediction no corresponde al dataset o contiene un valor inválido.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('predict-button');
  if (!button) return;
  let busy = false;
  button.addEventListener('click', async () => {
    if (busy) return;
    const cluster = document.getElementById('cluster').value;
    const resourceId = document.getElementById('node').value;
    const resultBox = document.getElementById('prediction-result');
    resultBox.hidden = true;
    if (!cluster || !resourceId) { put('prediction-status', 'Elige un clúster y un nodo concretos en los filtros superiores.'); return; }
    busy = true; button.disabled = true;
    try {
      put('prediction-status', 'Preparando el histórico de CPU…');
      const end = new Date(Date.now() - 30000);
      const params = new URLSearchParams({cluster, resourceId, stepSeconds:'15',
        start:GreenMetrics.rfc3339Seconds(new Date(end.getTime() - 2 * 3600000)), end:GreenMetrics.rfc3339Seconds(end)});
      const dataset = await predictionRequest(`/api/processing/v1/prediction/dataset?${params}`);
      if (!dataset.features?.length) throw new Error('Data Processing no devolvió muestras utilizables.');
      put('prediction-status', 'Ejecutando el modelo de predicción…');
      const result = await predictionRequest('/api/prediction/v1/predictions', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(dataset)
      });
      validatePrediction(result, dataset);
      put('prediction-value', `${new Intl.NumberFormat('es-PE', {maximumFractionDigits:2}).format(result.value)} % · Estimado`);
      put('prediction-resource', `${result.resource.cluster} / ${result.resource.id}`);
      put('prediction-time', new Date(result.predictedFor).toLocaleString());
      put('prediction-model', `${result.horizon || 'No informado'} / ${result.modelVersion || 'No informado'}`);
      put('prediction-origin', (dataset.origins || []).map(GreenMetrics.origin).join(' · ') || 'Desconocido');
      put('prediction-dataset', result.inputDatasetId);
      put('prediction-warnings', [...(dataset.warnings || []), ...(result.warnings || [])].join(' · '));
      resultBox.hidden = false;
      put('prediction-status', `Estimación generada ${new Date(result.generatedAt).toLocaleString()}. Corresponde al recurso indicado; no se actualiza automáticamente.`);
    } catch (error) {
      put('prediction-status', error.name === 'TimeoutError' ? 'La operación tardó demasiado. Puedes volver a intentarlo.' : error.message);
    } finally { busy = false; button.disabled = false; }
  });
});
