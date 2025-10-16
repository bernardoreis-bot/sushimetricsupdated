import { supabase } from '../lib/supabase';
import { parseInvoicePDF, parseInvoiceLineItems } from './invoiceParser';

export interface ProcessedInvoice {
  file: File;
  parsedData: any;
  lineItems: any[];
  formData: {
    transaction_date: string;
    invoice_number: string;
    invoice_reference: string;
    amount: string;
    site_id: string;
    supplier_id: string;
    category_id: string;
    notes: string;
  };
}

export async function processInvoiceWithLineItems(
  file: File,
  parsingRules: any[]
): Promise<ProcessedInvoice> {
  console.log(`Processing invoice: ${file.name}`);

  // Parse invoice metadata
  const parsed = await parseInvoicePDF(file, parsingRules);
  console.log('Parsed invoice data:', parsed);

  // Parse line items
  let lineItems: any[] = [];
  try {
    lineItems = await parseInvoiceLineItems(file);
    console.log(`Extracted ${lineItems.length} line items from invoice`);
  } catch (err) {
    console.warn('Could not extract line items:', err);
  }

  const formData = {
    transaction_date: parsed.date || new Date().toISOString().split('T')[0],
    invoice_number: parsed.invoiceNumber || '',
    invoice_reference: parsed.invoiceReference || '',
    amount: parsed.totalAmount ? parsed.totalAmount.toString() : '',
    site_id: parsed.matchedRuleSiteId || '',
    supplier_id: parsed.matchedRuleSupplierId || '',
    category_id: parsed.matchedRuleCategoryId || '',
    notes: ''
  };

  return {
    file,
    parsedData: parsed,
    lineItems,
    formData
  };
}

export async function saveTransactionWithLineItems(
  transactionData: any,
  lineItems: any[]
): Promise<{ transactionId: string; success: boolean; error?: string }> {
  try {
    // Insert transaction
    const { data: transaction, error: transError } = await supabase
      .from('transactions')
      .insert(transactionData)
      .select()
      .single();

    if (transError) throw transError;
    if (!transaction) throw new Error('Transaction not created');

    // Insert line items if any
    if (lineItems && lineItems.length > 0) {
      const itemsToInsert = lineItems.map(item => ({
        transaction_id: transaction.id,
        item_name: item.productName || item.item_name || 'Unknown Item',
        item_code: item.productCode || item.item_code || null,
        quantity: item.quantity || 0,
        unit_price: item.pricePerUnit || item.unit_price || 0,
        line_total: item.totalPrice || item.line_total || 0,
        category: 'Other'
      }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error('Error inserting line items:', itemsError);
        // Don't fail the whole transaction if line items fail
      } else {
        console.log(`Successfully saved ${itemsToInsert.length} line items`);
      }
    }

    return { transactionId: transaction.id, success: true };
  } catch (error: any) {
    console.error('Error saving transaction:', error);
    return { transactionId: '', success: false, error: error.message };
  }
}
