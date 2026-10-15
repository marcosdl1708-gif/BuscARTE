/** Monthly candidate generation for opted-in contacts; no fixed 90-person slice. */
exports.handler = async function() {
  try {
    const { planMonthlySummary } = await import('../lib/mail-planner.mjs');
    const queued = await planMonthlySummary();
    console.log('[resumen-mensual] Candidatos procesados:', queued);
    return { statusCode:200 };
  } catch { console.warn('[resumen-mensual] Cola no disponible'); return { statusCode:503 }; }
};
