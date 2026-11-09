
const date = new Date('2026-02-11T20:00:00Z'); // 8:00 PM UTC
const formattedBO = date.toLocaleString('es-BO', { timeZone: 'America/La_Paz' });
const formattedUTC = date.toLocaleString('es-BO', { timeZone: 'UTC' });

console.log('UTC Time:', formattedUTC);
console.log('Bolivia Time (America/La_Paz):', formattedBO);

if (formattedBO !== formattedUTC) {
    console.log('✅ Success: Timezone conversion is working correctly.');
} else {
    console.log('❌ Failure: Timezone conversion is not working.');
}
