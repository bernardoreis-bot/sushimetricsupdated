import type { Handler } from '@netlify/functions';
import { runExtractLatest, saveAudit } from './_powerbiSales';

export const handler: Handler = async () => {
  try {
    const { bySiteId, missing } = await runExtractLatest('schedule');
    if (missing && missing.length > 0) {
      const day = new Date().getUTCDay(); // 1=Mon, 3=Wed
      await saveAudit({ type: 'schedule_missed', missing });
      if (day === 3) {
        await saveAudit({ type: 'schedule_alert', message: 'Sales still missing by Wednesday', missing });
      }
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, created: bySiteId, missing }) };
  } catch (err: any) {
    await saveAudit({ type: 'schedule_error', error: err.message || String(err) });
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};
