import { supabase } from '../lib/supabase';

export interface SchemaValidationResult {
  valid: boolean;
  missingColumns: string[];
  existingColumns: string[];
  errorMessage?: string;
  fixSuggestion?: string;
}

export async function validateTransactionsSchema(): Promise<SchemaValidationResult> {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .limit(1);

    if (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        const columnMatch = error.message.match(/column "?(\w+)"? does not exist/i);
        const missingColumn = columnMatch ? columnMatch[1] : 'unknown';

        return {
          valid: false,
          missingColumns: [missingColumn],
          existingColumns: [],
          errorMessage: `Database schema error: Column "${missingColumn}" does not exist in transactions table`,
          fixSuggestion: `The transactions table is missing the "${missingColumn}" column. This column is required for predictions to work correctly.`
        };
      }

      return {
        valid: false,
        missingColumns: [],
        existingColumns: [],
        errorMessage: `Database error: ${error.message}`,
        fixSuggestion: 'Please check your database connection and table permissions.'
      };
    }

    if (data && data.length > 0) {
      const firstRow = data[0];
      const existingColumns = Object.keys(firstRow);

      const requiredColumns = ['site_id', 'supplier_id', 'transaction_date'];
      const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

      if (missingColumns.length > 0) {
        return {
          valid: false,
          missingColumns,
          existingColumns,
          errorMessage: `Missing required columns: ${missingColumns.join(', ')}`,
          fixSuggestion: `The transactions table is missing: ${missingColumns.join(', ')}. These columns are required for order predictions.`
        };
      }

      return {
        valid: true,
        missingColumns: [],
        existingColumns,
      };
    }

    const { data: emptyCheck } = await supabase
      .from('transactions')
      .select('id, transaction_date')
      .limit(1);

    if (emptyCheck !== null) {
      return {
        valid: true,
        missingColumns: [],
        existingColumns: ['id', 'transaction_date'],
      };
    }

    return {
      valid: false,
      missingColumns: [],
      existingColumns: [],
      errorMessage: 'Unable to validate transactions table schema',
      fixSuggestion: 'Please ensure the transactions table exists and has the correct structure.'
    };

  } catch (error) {
    return {
      valid: false,
      missingColumns: [],
      existingColumns: [],
      errorMessage: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
      fixSuggestion: 'An unexpected error occurred during schema validation. Please check the console for details.'
    };
  }
}

export async function getTableSchema(tableName: string): Promise<{ columns: string[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);

    if (error) {
      return { columns: [], error: error.message };
    }

    if (data && data.length > 0) {
      return { columns: Object.keys(data[0]) };
    }

    return { columns: [], error: 'No data available to determine schema' };
  } catch (error) {
    return {
      columns: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
