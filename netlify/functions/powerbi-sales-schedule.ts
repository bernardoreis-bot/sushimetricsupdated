import type { Handler } from '@netlify/functions';
import { runScheduledBatch, saveAudit } from './_powerbiSales';

export const handler: Handler = async () => {
  try {
    const res = await runScheduledBatch();
    return { statusCode: 200, body: JSON.stringify(res) };
  } catch (err: any) {
    await saveAudit({ type: 'schedule_error', error: err.message || String(err) });
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};
