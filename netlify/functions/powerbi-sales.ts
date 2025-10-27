import type { Handler } from '@netlify/functions';
import { runExtractLatest, createSalesTransactions, getLastSundayISO, saveAudit } from './_powerbiSales';

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    const body = event.body ? JSON.parse(event.body) : {};
    const action = body.action || 'extract_latest';

    if (action === 'manual_create') {
      const manual = body.manual_amounts || {};
      const sundayISO = getLastSundayISO();
      await createSalesTransactions(manual, sundayISO, 'manual');
      await saveAudit({ type: 'manual_create', sundayISO, manual });
      return { statusCode: 200, body: JSON.stringify({ message: 'Sales transactions created', sundayISO }) };
    }

    // default: extract latest via OpenAI Vision
    const { bySiteId, missing } = await runExtractLatest('manual-trigger');
    return { statusCode: 200, body: JSON.stringify({ message: 'Extracted and created transactions', created: bySiteId, missing }) };
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};
