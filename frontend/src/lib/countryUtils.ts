/**
 * Convert ISO 3166-1 alpha-2 country code to flag emoji
 * Uses regional indicator symbols (Unicode)
 */
export function getCountryFlag(countryIso: string): string {
  if (!countryIso || countryIso.length !== 2) {
    return '🌍'; // Default globe emoji for unknown countries
  }
  
  const codePoints = countryIso
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  
  return String.fromCodePoint(...codePoints);
}

/**
 * Format country code for display (with flag)
 */
export function formatCountryDisplay(countryIso: string, callingCode: string): string {
  const flag = getCountryFlag(countryIso);
  return `${flag} ${callingCode}`;
}
