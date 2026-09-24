/* Pure presentation helpers. No inferred measurements or cross-series aggregation. */
window.GreenMetrics = {
  rfc3339Seconds(value) {
    const milliseconds = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (!Number.isFinite(milliseconds)) throw new TypeError('Timestamp inválido');
    return new Date(Math.floor(milliseconds / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  },
  value(sample, unit) {
    if (!sample || sample.quality !== 'valid' || !Number.isFinite(sample.value)) return 'Sin dato';
    const n = sample.value;
    const fmt = value => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(value);
    if (unit === 'ratio') return `${fmt(n * 100)} %`;
    if (unit === 'bytes' || unit === 'bytes/s') {
      const scale = Math.abs(n) >= 1073741824 ? 1073741824 : Math.abs(n) >= 1048576 ? 1048576 : Math.abs(n) >= 1024 ? 1024 : 1;
      const label = ({1: 'B', 1024: 'KiB', 1048576: 'MiB', 1073741824: 'GiB'})[scale];
      return `${fmt(n / scale)} ${label}${unit === 'bytes/s' ? '/s' : ''}`;
    }
    return `${fmt(n)} ${unit}`;
  },
  key(series) { return JSON.stringify([series.resource, Object.entries(series.labels || {}).sort(), series.origin]); },
  origin(value) { return ({observed:'Observado', simulated:'Simulado', estimated:'Estimado', unknown:'Desconocido'})[value] || 'Desconocido'; },
  status(value) { return ({complete:'Completo', partial:'Parcial', no_data:'Sin datos'})[value] || value; }
};
