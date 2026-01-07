import XLSX from 'xlsx';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GENERATED_FILE = path.join(__dirname, '../../../_dev/tables/planillas/generadas/2025-08 Planilla Boleta Gen-final.xlsx');

console.log('📂 Examining generated planilla:', GENERATED_FILE);

const workbook = XLSX.readFile(GENERATED_FILE);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Convert to array of arrays
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as any[][];

console.log('\n📊 Headers:');
console.log(data[0]);

console.log('\n📄 Sample data (first 3 rows):');
for (let i = 1; i <= Math.min(3, data.length - 1); i++) {
  console.log(`Row ${i}:`, data[i]);
}

// Check for empty columns
console.log('\n🔍 Checking for empty/unpopulated columns:');
const headers = data[0];
const emptyColumns: string[] = [];

headers.forEach((header: string, index: number) => {
  let isEmpty = true;
  for (let row = 1; row < Math.min(10, data.length); row++) {
    if (data[row][index] && data[row][index] !== '' && data[row][index] !== 0) {
      isEmpty = false;
      break;
    }
  }
  if (isEmpty) {
    emptyColumns.push(header);
  }
});

console.log('Empty/unpopulated columns:', emptyColumns);
console.log('\nTotal columns:', headers.length);
console.log('Empty columns:', emptyColumns.length);
console.log('Populated columns:', headers.length - emptyColumns.length);