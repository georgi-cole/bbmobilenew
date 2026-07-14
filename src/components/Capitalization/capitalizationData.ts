export type CapitalizationContinent =
  | 'Africa'
  | 'Asia'
  | 'Europe'
  | 'North America'
  | 'South America'
  | 'Oceania';

export interface CapitalizationCountry {
  id: string;
  name: string;
  flag: string;
  capital: string;
  accepted: string[];
  latitude: number;
  longitude: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export interface CapitalizationContinentStyle {
  color: string;
  center: {
    latitude: number;
    longitude: number;
  };
}

export interface CapitalizationLandShape {
  continent: CapitalizationContinent;
  points: Array<[longitude: number, latitude: number]>;
}

function country(
  id: string,
  name: string,
  flag: string,
  capital: string,
  latitude: number,
  longitude: number,
  difficulty: 1 | 2 | 3 | 4 | 5,
  alternatives: string[] = [],
): CapitalizationCountry {
  return {
    id,
    name,
    flag,
    capital,
    accepted: [capital, ...alternatives],
    latitude,
    longitude,
    difficulty,
  };
}

export const CAPITALIZATION_CONTINENTS: CapitalizationContinent[] = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
];

export const CAPITALIZATION_CONTINENT_STYLES: Record<
  CapitalizationContinent,
  CapitalizationContinentStyle
> = {
  Africa: { color: '#5bd68a', center: { latitude: 2, longitude: 21 } },
  Asia: { color: '#f3c75f', center: { latitude: 32, longitude: 91 } },
  Europe: { color: '#66b8ff', center: { latitude: 51, longitude: 13 } },
  'North America': { color: '#ff8b72', center: { latitude: 47, longitude: -101 } },
  'South America': { color: '#c996ff', center: { latitude: -18, longitude: -61 } },
  Oceania: { color: '#62d1c0', center: { latitude: -25, longitude: 136 } },
};

export const CAPITALIZATION_COUNTRIES_BY_CONTINENT: Record<
  CapitalizationContinent,
  CapitalizationCountry[]
> = {
  Africa: [
    country('egypt', 'Egypt', '🇪🇬', 'Cairo', 26.8, 30.8, 1, ['Al Qahirah']),
    country('kenya', 'Kenya', '🇰🇪', 'Nairobi', -0.1, 37.9, 2),
    country('morocco', 'Morocco', '🇲🇦', 'Rabat', 31.8, -7.1, 2),
    country('ghana', 'Ghana', '🇬🇭', 'Accra', 7.9, -1, 2),
    country('tanzania', 'Tanzania', '🇹🇿', 'Dodoma', -6.4, 35, 3),
    country('senegal', 'Senegal', '🇸🇳', 'Dakar', 14.5, -14.4, 3),
    country('ethiopia', 'Ethiopia', '🇪🇹', 'Addis Ababa', 9.1, 40.5, 3),
    country('rwanda', 'Rwanda', '🇷🇼', 'Kigali', -1.9, 29.9, 3),
    country('tunisia', 'Tunisia', '🇹🇳', 'Tunis', 34, 9.5, 2),
    country('nigeria', 'Nigeria', '🇳🇬', 'Abuja', 9.1, 8.7, 2),
    country('burkina-faso', 'Burkina Faso', '🇧🇫', 'Ouagadougou', 12.3, -1.6, 4),
    country('burundi', 'Burundi', '🇧🇮', 'Gitega', -3.4, 29.9, 5),
  ],
  Asia: [
    country('japan', 'Japan', '🇯🇵', 'Tokyo', 36.2, 138.3, 1),
    country('south-korea', 'South Korea', '🇰🇷', 'Seoul', 36.4, 127.8, 1),
    country('thailand', 'Thailand', '🇹🇭', 'Bangkok', 15.8, 101, 1),
    country('vietnam', 'Vietnam', '🇻🇳', 'Hanoi', 16.2, 107.8, 2, ['Ha Noi']),
    country('mongolia', 'Mongolia', '🇲🇳', 'Ulaanbaatar', 46.9, 103.8, 4, ['Ulan Bator']),
    country('nepal', 'Nepal', '🇳🇵', 'Kathmandu', 28.4, 84.1, 3),
    country('philippines', 'Philippines', '🇵🇭', 'Manila', 12.9, 121.8, 2),
    country('malaysia', 'Malaysia', '🇲🇾', 'Kuala Lumpur', 4.2, 102, 2),
    country('indonesia', 'Indonesia', '🇮🇩', 'Jakarta', -2.5, 118, 2),
    country('jordan', 'Jordan', '🇯🇴', 'Amman', 31.2, 36.5, 3),
  ],
  Europe: [
    country('france', 'France', '🇫🇷', 'Paris', 46.2, 2.2, 1),
    country('germany', 'Germany', '🇩🇪', 'Berlin', 51.2, 10.5, 1),
    country('italy', 'Italy', '🇮🇹', 'Rome', 42.9, 12.6, 1, ['Roma']),
    country('spain', 'Spain', '🇪🇸', 'Madrid', 40.5, -3.7, 1),
    country('portugal', 'Portugal', '🇵🇹', 'Lisbon', 39.4, -8.2, 2, ['Lisboa']),
    country('greece', 'Greece', '🇬🇷', 'Athens', 39.1, 22.9, 1),
    country('sweden', 'Sweden', '🇸🇪', 'Stockholm', 60.1, 18.6, 2),
    country('poland', 'Poland', '🇵🇱', 'Warsaw', 52.1, 19.4, 2, ['Warszawa']),
    country('norway', 'Norway', '🇳🇴', 'Oslo', 60.5, 8.5, 2),
    country('ireland', 'Ireland', '🇮🇪', 'Dublin', 53.4, -8.2, 2),
    country('romania', 'Romania', '🇷🇴', 'Bucharest', 45.9, 24.9, 3),
    country('montenegro', 'Montenegro', '🇲🇪', 'Podgorica', 42.7, 19.4, 4),
    country('moldova', 'Moldova', '🇲🇩', 'Chisinau', 47, 28.8, 5, ['Chișinău']),
  ],
  'North America': [
    country('canada', 'Canada', '🇨🇦', 'Ottawa', 56.1, -106.3, 2),
    country(
      'united-states',
      'United States',
      '🇺🇸',
      'Washington, D.C.',
      39.8,
      -98.6,
      2,
      ['Washington DC', 'Washington'],
    ),
    country('mexico', 'Mexico', '🇲🇽', 'Mexico City', 23.6, -102.6, 1, ['Ciudad de Mexico']),
    country('guatemala', 'Guatemala', '🇬🇹', 'Guatemala City', 15.8, -90.2, 3),
    country('cuba', 'Cuba', '🇨🇺', 'Havana', 21.5, -79.4, 2, ['La Habana']),
    country('jamaica', 'Jamaica', '🇯🇲', 'Kingston', 18.1, -77.3, 3),
    country('panama', 'Panama', '🇵🇦', 'Panama City', 8.5, -80.8, 2),
    country('costa-rica', 'Costa Rica', '🇨🇷', 'San Jose', 9.7, -84.2, 3, ['San José']),
    country('dominican-republic', 'Dominican Republic', '🇩🇴', 'Santo Domingo', 18.7, -70.2, 3),
    country('bahamas', 'Bahamas', '🇧🇸', 'Nassau', 25, -77.4, 4),
  ],
  'South America': [
    country('brazil', 'Brazil', '🇧🇷', 'Brasilia', -14.2, -51.9, 2, ['Brasília']),
    country('argentina', 'Argentina', '🇦🇷', 'Buenos Aires', -38.4, -63.6, 1),
    country('chile', 'Chile', '🇨🇱', 'Santiago', -35.7, -71.5, 1),
    country('peru', 'Peru', '🇵🇪', 'Lima', -9.2, -75, 1),
    country('colombia', 'Colombia', '🇨🇴', 'Bogota', 4.6, -74.1, 2, ['Bogotá']),
    country('uruguay', 'Uruguay', '🇺🇾', 'Montevideo', -32.5, -55.8, 2),
    country('paraguay', 'Paraguay', '🇵🇾', 'Asuncion', -23.4, -58.4, 3, ['Asunción']),
    country('ecuador', 'Ecuador', '🇪🇨', 'Quito', -1.8, -78.2, 2),
    country('venezuela', 'Venezuela', '🇻🇪', 'Caracas', 6.4, -66.6, 2),
    country('guyana', 'Guyana', '🇬🇾', 'Georgetown', 4.9, -58.9, 4),
  ],
  Oceania: [
    country('australia', 'Australia', '🇦🇺', 'Canberra', -25.3, 133.8, 1),
    country('new-zealand', 'New Zealand', '🇳🇿', 'Wellington', -40.9, 174.9, 1),
    country('fiji', 'Fiji', '🇫🇯', 'Suva', -17.7, 178.1, 3),
    country('papua-new-guinea', 'Papua New Guinea', '🇵🇬', 'Port Moresby', -6.3, 143.9, 3),
    country('samoa', 'Samoa', '🇼🇸', 'Apia', -13.8, -172.1, 4),
    country('tonga', 'Tonga', '🇹🇴', "Nuku'alofa", -21.2, -175.2, 5, ['Nukualofa', 'Nuku alofa']),
    country('vanuatu', 'Vanuatu', '🇻🇺', 'Port Vila', -15.4, 166.9, 4),
    country('solomon-islands', 'Solomon Islands', '🇸🇧', 'Honiara', -9.6, 160.2, 4),
    country('kiribati', 'Kiribati', '🇰🇮', 'South Tarawa', 1.9, -157.4, 5, ['Tarawa']),
    country('tuvalu', 'Tuvalu', '🇹🇻', 'Funafuti', -7.1, 177.7, 5),
  ],
};

export const CAPITALIZATION_LAND_SHAPES: CapitalizationLandShape[] = [
  {
    continent: 'Africa',
    points: [
      [-17, 35],
      [5, 37],
      [33, 31],
      [51, 11],
      [43, -12],
      [31, -35],
      [18, -35],
      [8, -18],
      [-9, -34],
      [-16, -5],
    ],
  },
  {
    continent: 'Europe',
    points: [
      [-10, 36],
      [0, 44],
      [11, 48],
      [25, 60],
      [40, 55],
      [43, 41],
      [29, 36],
      [15, 38],
      [5, 36],
    ],
  },
  {
    continent: 'Asia',
    points: [
      [30, 10],
      [45, 30],
      [60, 50],
      [95, 60],
      [135, 50],
      [150, 30],
      [120, 5],
      [105, -5],
      [80, 5],
      [65, 20],
      [45, 12],
    ],
  },
  {
    continent: 'North America',
    points: [
      [-168, 15],
      [-150, 60],
      [-95, 72],
      [-55, 52],
      [-80, 25],
      [-100, 15],
      [-115, 25],
      [-130, 24],
    ],
  },
  {
    continent: 'South America',
    points: [
      [-82, 12],
      [-62, 8],
      [-35, -10],
      [-52, -55],
      [-72, -45],
      [-80, -10],
    ],
  },
  {
    continent: 'Oceania',
    points: [
      [112, -10],
      [155, -10],
      [160, -45],
      [110, -45],
    ],
  },
];
