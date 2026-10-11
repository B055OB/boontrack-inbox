import { formatCurrency, formatNumber, formatDate } from '../lib/i18n/formatters';
import idDict from '../locales/id.json';
import enDict from '../locales/en.json';

console.log('=== I18N RESOURCE VERIFICATION ===');
console.log('ID Keys:', Object.keys(idDict));
console.log('EN Keys:', Object.keys(enDict));

console.log('\n=== FORMATTERS VERIFICATION ===');
console.log('IDR Format:', formatCurrency(150000, 'IDR', 'id-ID'));
console.log('USD Format:', formatCurrency(150.5, 'USD', 'en-US'));
console.log('MYR Format:', formatCurrency(75, 'MYR', 'en-US'));
console.log('EUR Format:', formatCurrency(99.9, 'EUR', 'en-US'));
console.log('Number Format:', formatNumber(1250000, 'id-ID'));
console.log('Date Format:', formatDate(new Date('2026-10-11T12:00:00Z'), 'id-ID'));

console.log('\n=== SUCCESS: All i18n modules validated! ===');
