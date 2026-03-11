const createCountry = (code, name, categories, options = {}) => ({
  code,
  name,
  categories,
  defaultSelected: false,
  fallbackCategory: null,
  matchers: [],
  ...options
});

const LIVE_TV_COUNTRIES = [
  createCountry('TR', 'Türkiye', [
    'TR ✨ Ulusal',
    'TR ✨ Ulusal 4K',
    'TR ✨ Spor',
    'TR ✨ BeIN Sports',
    'TR ✨ Exxen Sports',
    'TR ✨ S-Sport Plus',
    'TR ✨ Tabii Sport',
    'TR ✨ Tivibu Sport & Smart Sport',
    'TR ✨ Haber',
    'TR ✨ Muzik',
    'TR ✨ Dini Kanallar',
    'TR ✨ Yöresel',
    'TR ✨ Cocuk',
    'TR ✨ HEVC',
    'TR ✨ Raw',
    'TR ✨ Radio',
    'TR ✨ Turkcell Tv+',
    'TR ✨ Bein Connect TOD',
    'TR ✨ BluTV',
    'TR ✨ EXXEN',
    'TR ✨ Gain',
    'TR ✨ PUHUTV'
  ], {
    defaultSelected: true,
    fallbackCategory: 'TR ✨ Diger',
    matchers: [/^TR\s/iu]
  }),
  createCountry('FR', 'France', [
    'France ✨ General',
    'France ✨ News',
    'France ✨ Sports',
    'France ✨ Music',
    'France ✨ Enfants',
    'France ✨ Divertissement',
    'France ✨ VIP'
  ], {
    fallbackCategory: 'France ✨ Diger',
    matchers: [/^France\s/iu]
  }),
  createCountry('DE', 'Germany', [
    'Germany ⭐ National',
    'Germany ⭐ Sport',
    'Germany ⭐ Sky Sport',
    'Germany ⭐ DAZN',
    'Germany ⭐ RTL+ Sport',
    'Germany ⭐ DYN Sport',
    'Germany ⭐ Magenta Sport',
    'Germany ⭐ Sky Cinema',
    'Germany ⭐ Kinder',
    'Germany ⭐ Doku',
    'Germany ⭐ Amazon LIVE',
    'Germany ⭐ Hevc',
    'Germany ⭐ UHD (4K)',
    'Germany ⭐ Radio',
    'Germany ⭐ VIP'
  ], {
    matchers: [/^Germany\s/iu]
  }),
  createCountry('GB', 'United Kingdom', [
    'UK ✨ EPL',
    'UK ✨ SPFL',
    'UK ✨ Sports',
    'UK ✨ LOI',
    'UK ✨ Paramount',
    'UK ✨ SkyGo NZ',
    'UK ✨ HEVC',
    'UK ✨ VIP'
  ], {
    matchers: [/^UK\s/iu]
  }),
  createCountry('US', 'USA', [
    'Usa ✨ General',
    'Usa ✨ NFL',
    'Usa ✨ NBA',
    'Usa ✨ NHL',
    'Usa ✨ MLB',
    'Usa ✨ MLS',
    'Usa ✨ Max Sports',
    'Usa ✨ Paramount+',
    'Usa ✨ Setanta'
  ], {
    matchers: [/^Usa\b/iu]
  }),
  createCountry('ES', 'Spain', [
    'Spain ✨',
    'Spain ✨ Sport',
    'Spain ✨ DAZN Sports',
    'Spain ✨ Orange',
    'Spain ✨ NFL',
    'Spain ✨ VIP',
    'Spain ✨ Radio'
  ], {
    matchers: [/^Spain\b/iu]
  }),
  createCountry('IT', 'Italy', [
    'Italy ✨',
    'Italy ✨ Sports',
    'Italy ✨ Calcio Sport',
    'Italy ✨ Dazn Sport',
    'Italy ✨ Sky Cinema',
    'Italy ✨ Bambini',
    'Italy ✨ Documentario',
    'Italy ✨ Pluto TV',
    'Italy ✨ Radio'
  ], {
    matchers: [/^Italy\s/iu]
  }),
  createCountry('PT', 'Portugal', [
    'Portugal ✨',
    'Portugal ✨ Sports',
    'Portugal ✨ VIP'
  ], {
    matchers: [/^Portugal\s/iu]
  }),
  createCountry('PL', 'Poland', [
    'Poland ✨',
    'Poland ✨ Sports',
    'Poland ✨ Kino',
    'Poland ✨ Dziecko',
    'Poland ✨ Dokumentalny',
    'Poland ✨ Radio',
    'Poland ✨ VIP'
  ], {
    matchers: [/^Poland\s/iu]
  }),
  createCountry('NL', 'Netherlands', [
    'Netherland ✨',
    'Netherland ✨ Sport',
    'Netherland ✨ Cinema'
  ], {
    matchers: [/^Netherland\s/iu]
  }),
  createCountry('BE', 'Belgium', [
    'Belgium'
  ], {
    matchers: [/^Belgium$/iu]
  }),
  createCountry('AT', 'Austria', [
    'Austria ✨'
  ], {
    matchers: [/^Austria\s/iu]
  }),
  createCountry('CH', 'Switzerland', [
    'Switzerland ✨ VIP'
  ], {
    matchers: [/^Switzerland\s/iu]
  }),
  createCountry('SE', 'Sweden', [
    'Sweden ✨',
    'Sweden ✨ Radio'
  ], {
    matchers: [/^Sweden\s/iu]
  }),
  createCountry('NO', 'Norway', [
    'Norway ✨'
  ], {
    matchers: [/^Norway\s/iu]
  }),
  createCountry('DK', 'Denmark', [
    'Denmark ✨'
  ], {
    matchers: [/^Denmark\s/iu]
  }),
  createCountry('FI', 'Finland', [
    'Finland ✨'
  ], {
    matchers: [/^Finland\s/iu]
  }),
  createCountry('CA', 'Canada', [
    'Canada ✨'
  ], {
    matchers: [/^Canada\s/iu]
  }),
  createCountry('BR', 'Brazil', [
    'Brazil ✨'
  ], {
    matchers: [/^Brazil\s/iu]
  }),
  createCountry('BG', 'Bulgaria', [
    'Bulgaria ✨',
    'Bulgaria ✨ Sports'
  ], {
    matchers: [/^Bulgaria\s/iu]
  }),
  createCountry('CZSK', 'Czech and Slovak', [
    'Czech and Slowak ✨',
    'Czech and Slowak ✨ VIP'
  ], {
    matchers: [/^Czech and Slowak\s/iu]
  }),
  createCountry('GR', 'Greece', [
    'Greece ✨'
  ], {
    matchers: [/^Greece\s/iu]
  }),
  createCountry('HU', 'Hungary', [
    'Hungary ✨'
  ], {
    matchers: [/^Hungary\s/iu]
  }),
  createCountry('AL', 'Albania', [
    'Albania ✨',
    'Albania ✨ Sports'
  ], {
    matchers: [/^Albania\s/iu]
  }),
  createCountry('AF', 'Afghanistan', [
    'Afghanistan ✨'
  ], {
    matchers: [/^Afghanistan\s/iu]
  }),
  createCountry('ARAB', 'Arab', [
    'Arab ✨ countries',
    'Arabic ✨ beIN Sport'
  ], {
    matchers: [/^Arab\s/iu, /^Arabic\s/iu]
  }),
  createCountry('AZ', 'Azerbaijan', [
    'Azerbaijan'
  ], {
    matchers: [/^Azerbaijan$/iu]
  }),
  createCountry('KURD', 'Kurdish', [
    'Kurdish ✨'
  ], {
    matchers: [/^Kurdish\s/iu]
  }),
  createCountry('LATAM', 'Latin America', [
    'Latin ✨ America'
  ], {
    matchers: [/^Latin\s/iu]
  }),
  createCountry('LV', 'Latvia', [
    'Latvia ✨'
  ], {
    matchers: [/^Latvia\s/iu]
  }),
  createCountry('MK', 'Macedonia', [
    'Macedonia ✨'
  ], {
    matchers: [/^Macedonia\s/iu]
  }),
  createCountry('NI', 'Northern Ireland', [
    'NI ✨ Premiership'
  ], {
    matchers: [/^NI\s/iu]
  }),
  createCountry('PK', 'Pakistan', [
    'Pakistan ✨'
  ], {
    matchers: [/^Pakistan\s/iu]
  }),
  createCountry('RO', 'Romania', [
    'Romania ✨',
    'Romania ✨ Radio'
  ], {
    matchers: [/^Romania\s/iu]
  }),
  createCountry('RU', 'Russia', [
    'Russia ✨ Федеральные (National)',
    'Russian VIP ✨'
  ], {
    matchers: [/^Russia\s/iu, /^Russian VIP\s/iu]
  }),
  createCountry('SK', 'Slovakia', [
    'Slovakia ✨'
  ], {
    matchers: [/^Slovakia\s/iu]
  }),
  createCountry('SI', 'Slovenia', [
    'Slovenia ✨'
  ], {
    matchers: [/^Slovenia\s/iu]
  }),
  createCountry('EXYU', 'Ex-Yu', [
    'Ex-yu ✨',
    'ex-yu ✨ Bosnia',
    'ex-yu ✨ Croatia',
    'ex-yu ✨ Doku',
    'ex-yu ✨ Serbia',
    'ex-yu ✨ Sport'
  ], {
    matchers: [/^Ex-yu\s/iu, /^ex-yu\s/iu]
  }),
  createCountry('UA', 'Ukraine', [
    'Ukraine ✨'
  ], {
    matchers: [/^Ukraine\s/iu]
  }),
  createCountry('IN', 'India', [
    'India ✨'
  ], {
    matchers: [/^India\s/iu]
  }),
  createCountry('ID', 'Indonesia', [
    'Indonesia ✨'
  ], {
    matchers: [/^Indonesia\s/iu]
  }),
  createCountry('GLOBAL', 'Global Sports', [
    'Sport ✨ PPV',
    'VIP ✨ Sports'
  ], {
    matchers: [/^Sport ✨ PPV$/u, /^VIP ✨ Sports$/u]
  })
];

const LIVE_TV_CATEGORY_ALIASES = {
  'France ✨General': 'France ✨ General',
  'France ✨Cinemas': 'France ✨ Diger',
  'Italy ✨ radio': 'Italy ✨ Radio',
  'Spain Radio': 'Spain ✨ Radio',
  'Usa': 'Usa ✨ General'
};

const DEFAULT_LIVE_COUNTRY_CODE = LIVE_TV_COUNTRIES.find((country) => country.defaultSelected)?.code || 'TR';

module.exports = {
  DEFAULT_LIVE_COUNTRY_CODE,
  LIVE_TV_COUNTRIES,
  LIVE_TV_CATEGORY_ALIASES
};
