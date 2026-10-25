/** Daily candidate generation; delivery is exclusively through the shared quota queue. */
exports.handler = async function() {
  try {
    const { planProfileReminders, planFortnightlySummary } = await import('../lib/mail-planner.mjs');
    const reminders = await planProfileReminders();
    const updates = await planFortnightlySummary();
    console.log('[recordatorio-perfil] Candidatos procesados:', JSON.stringify({reminders,updates}));
    return { statusCode:200 };
  } catch { console.warn('[recordatorio-perfil] Cola no disponible'); return { statusCode:503 }; }
};
