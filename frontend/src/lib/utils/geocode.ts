/**
 * Reverse geocoding utility using OpenStreetMap Nominatim.
 * Resolves a latitude/longitude pair into a human-readable Indonesian address.
 */

export interface ReverseGeocodeResult {
  /** Full address string, e.g. "Jl. Colombo No. 1, Caturtunggal, Depok, Sleman, D.I. Yogyakarta" */
  full: string;
  /** Short address — district + city/regency only, e.g. "Depok, Sleman" */
  short: string;
}

/**
 * Build a structured address from a Nominatim address object.
 * Layers (most-specific first):
 *   road → house_number → neighbourhood → hamlet → village/suburb/quarter →
 *   city_district/subdistrict → city/regency/county → state
 */
function buildAddress(addr: Record<string, string>): ReverseGeocodeResult {
  const road = addr.road || addr.pedestrian || addr.footway || addr.path || '';
  const houseNumber = addr.house_number || '';
  const neighbourhood = addr.neighbourhood || addr.hamlet || '';
  const village =
    addr.village ||
    addr.suburb ||
    addr.quarter ||
    addr.municipality ||
    '';
  const district =
    addr.city_district ||
    addr.subdistrict ||
    addr.suburb ||
    addr.town ||
    '';
  const regency = addr.city || addr.regency || addr.county || '';
  const state = addr.state || '';

  // Full address: road (with house number) → neighbourhood → village → district → regency → state
  const fullParts: string[] = [];
  if (road) {
    fullParts.push(houseNumber ? `${road} No. ${houseNumber}` : road);
  }
  if (neighbourhood && neighbourhood !== village) fullParts.push(neighbourhood);
  if (village) fullParts.push(village);
  if (district && district !== village) fullParts.push(district);
  if (regency) fullParts.push(regency);
  if (state) fullParts.push(state);

  // Short address: district → regency  (fallback to state)
  const shortParts: string[] = [];
  const shortDistrict = district || village || neighbourhood;
  if (shortDistrict) shortParts.push(shortDistrict);
  if (regency) shortParts.push(regency);
  else if (state) shortParts.push(state);

  return {
    full: fullParts.join(', ') || shortParts.join(', '),
    short: shortParts.join(', '),
  };
}

/**
 * Fetch a human-readable address from Nominatim for the given coordinates.
 * Returns null on network error or unexpected response.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'id, en',
          'User-Agent': 'Grove-B2B-App/1.0',
        },
      }
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (!data?.address) return null;

    return buildAddress(data.address);
  } catch {
    return null;
  }
}
