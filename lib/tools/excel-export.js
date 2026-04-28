/**
 * TOOL: excel_export
 * Databron: array van objecten (bijv. output van cms_read)
 * Gebruik wanneer: je data wil exporteren als downloadbare Excel
 * Gebruik NIET voor: ruwe tekst of niet-tabeldata
 * Input: { rows: object[], filename?: string }
 * Succes: { success: true, base64: string, filename: string, rows: number, columns: string[] }
 * Fout:   { success: false, error: string }
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as XLSX from 'xlsx';

export const excelExportTool = tool(
  async ({ rows, filename = 'export.xlsx' }) => {
    try {
      if (!rows.length) throw new Error('Geen data om te exporteren');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Sheet1');
      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      return JSON.stringify({ success: true, base64, filename, rows: rows.length, columns: Object.keys(rows[0]) });
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: 'excel_export',
    description: 'Converteer data naar een downloadbare Excel (base64). Gebruik na cms_read voor CMS-export.',
    schema: z.object({
      rows:     z.array(z.record(z.any())).describe('Array van objecten met consistente keys'),
      filename: z.string().optional()
    })
  }
);