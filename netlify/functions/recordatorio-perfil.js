/** Daily candidate generation; delivery is exclusively through the shared quota queue. */
exports.handler = async function() {
  try {
    const { planProfileReminders } = await import('../lib/mail-planner.mjs');
    const queued = await planProfileReminders();
    console.log('[recordatorio-perfil] Candidatos procesados:', queued);
    return { statusCode:200 };
  } catch { console.warn('[recordatorio-perfil] Cola no disponible'); return { statusCode:503 }; }
};
