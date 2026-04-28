/**
 * TOOL: excel_import
 * Databron: base64-encoded Excel of CSV-tekst
 * Gebruik wanneer: een gebruiker een Excel of CSV uploadt met content voor het CMS
 * Gebruik NIET voor: data die al als object-array beschikbaar is
 * Input: { data: string, type: "excel"|"csv", maxRows?: number }
 * Succes: { success: true, rows: object[], columns: string[], count: number }
 * Fout:   { success: false, error: string }
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as XLSX from 'xlsx';

export const excelImportTool = tool(
  async ({ data, type, maxRows = 500 }) => {
    try {
      const wb = type === 'csv'
        ? XLSX.read(data, { type: 'string' })
        : XLSX.read(data, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) throw new Error('Geen rijen gevonden in het bestand');
      return JSON.stringify({ success: true, rows: rows.slice(0, maxRows), columns: Object.keys(rows[0]), count: rows.length });
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: 'excel_import',
    description: 'Parseer een geüploade Excel of CSV naar rijen. Gebruik als voorbereiding op cms_bulk_write.',
    schema: z.object({
      data:    z.string().describe('Excel als base64 of CSV als tekst'),
      type:    z.enum(['excel','csv']),
      maxRows: z.number().optional().describe('Max. rijen, standaard 500')
    })
  }
);