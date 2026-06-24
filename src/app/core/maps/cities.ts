export interface City {
  slug: string;
  name: string;
  lat: number;
  lng: number;
}

/** The Hungarian cities the game supports, with centres for boundary lookups. */
export const CITIES: City[] = [
  { slug: 'budapest', name: 'Budapest', lat: 47.4979, lng: 19.0402 },
  { slug: 'debrecen', name: 'Debrecen', lat: 47.5316, lng: 21.6273 },
  { slug: 'szeged', name: 'Szeged', lat: 46.253, lng: 20.1414 },
  { slug: 'miskolc', name: 'Miskolc', lat: 48.1035, lng: 20.7784 },
  { slug: 'pecs', name: 'Pécs', lat: 46.0727, lng: 18.2323 },
  { slug: 'gyor', name: 'Győr', lat: 47.6875, lng: 17.6504 },
  { slug: 'nyiregyhaza', name: 'Nyíregyháza', lat: 47.9554, lng: 21.7167 },
  { slug: 'kecskemet', name: 'Kecskemét', lat: 46.8964, lng: 19.6897 },
  { slug: 'szekesfehervar', name: 'Székesfehérvár', lat: 47.186, lng: 18.4221 },
  { slug: 'szombathely', name: 'Szombathely', lat: 47.2307, lng: 16.6218 },
];
