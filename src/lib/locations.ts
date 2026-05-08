export type CountryEntry = {
  name: string;
  iso: string;
  dialCode: string;
  cities: string[];
};

export const COUNTRIES: CountryEntry[] = [
  {
    name: "India",
    iso: "IN",
    dialCode: "+91",
    cities: [
      "Mumbai",
      "Delhi",
      "Bengaluru",
      "Hyderabad",
      "Chennai",
      "Kolkata",
      "Pune",
      "Ahmedabad",
      "Jaipur",
      "Surat",
      "Lucknow",
      "Kanpur",
      "Nagpur",
      "Indore",
      "Bhopal",
      "Chandigarh",
      "Coimbatore",
      "Visakhapatnam"
    ]
  },
  {
    name: "United States",
    iso: "US",
    dialCode: "+1",
    cities: [
      "New York",
      "Los Angeles",
      "Chicago",
      "Houston",
      "Phoenix",
      "Philadelphia",
      "San Antonio",
      "San Diego",
      "Dallas",
      "Austin",
      "San Jose",
      "Seattle",
      "Denver",
      "Boston",
      "San Francisco",
      "Miami",
      "Atlanta",
      "Washington D.C."
    ]
  },
  {
    name: "United Kingdom",
    iso: "GB",
    dialCode: "+44",
    cities: [
      "London",
      "Manchester",
      "Birmingham",
      "Leeds",
      "Glasgow",
      "Edinburgh",
      "Liverpool",
      "Bristol",
      "Sheffield",
      "Cardiff",
      "Belfast",
      "Newcastle"
    ]
  },
  {
    name: "Canada",
    iso: "CA",
    dialCode: "+1",
    cities: [
      "Toronto",
      "Montreal",
      "Vancouver",
      "Calgary",
      "Edmonton",
      "Ottawa",
      "Winnipeg",
      "Quebec City",
      "Hamilton",
      "Halifax"
    ]
  },
  {
    name: "Australia",
    iso: "AU",
    dialCode: "+61",
    cities: [
      "Sydney",
      "Melbourne",
      "Brisbane",
      "Perth",
      "Adelaide",
      "Gold Coast",
      "Canberra",
      "Hobart",
      "Darwin"
    ]
  },
  {
    name: "Germany",
    iso: "DE",
    dialCode: "+49",
    cities: [
      "Berlin",
      "Hamburg",
      "Munich",
      "Cologne",
      "Frankfurt",
      "Stuttgart",
      "Düsseldorf",
      "Dortmund",
      "Leipzig"
    ]
  },
  {
    name: "France",
    iso: "FR",
    dialCode: "+33",
    cities: [
      "Paris",
      "Marseille",
      "Lyon",
      "Toulouse",
      "Nice",
      "Nantes",
      "Strasbourg",
      "Montpellier",
      "Bordeaux"
    ]
  },
  {
    name: "Spain",
    iso: "ES",
    dialCode: "+34",
    cities: ["Madrid", "Barcelona", "Valencia", "Seville", "Zaragoza", "Málaga", "Bilbao"]
  },
  {
    name: "Italy",
    iso: "IT",
    dialCode: "+39",
    cities: ["Rome", "Milan", "Naples", "Turin", "Florence", "Bologna", "Venice", "Verona"]
  },
  {
    name: "Netherlands",
    iso: "NL",
    dialCode: "+31",
    cities: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Eindhoven", "Groningen"]
  },
  {
    name: "Ireland",
    iso: "IE",
    dialCode: "+353",
    cities: ["Dublin", "Cork", "Galway", "Limerick", "Waterford"]
  },
  {
    name: "United Arab Emirates",
    iso: "AE",
    dialCode: "+971",
    cities: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah"]
  },
  {
    name: "Saudi Arabia",
    iso: "SA",
    dialCode: "+966",
    cities: ["Riyadh", "Jeddah", "Mecca", "Medina", "Dammam", "Khobar"]
  },
  {
    name: "Singapore",
    iso: "SG",
    dialCode: "+65",
    cities: ["Singapore"]
  },
  {
    name: "Japan",
    iso: "JP",
    dialCode: "+81",
    cities: ["Tokyo", "Osaka", "Yokohama", "Nagoya", "Sapporo", "Kobe", "Kyoto", "Fukuoka"]
  },
  {
    name: "South Korea",
    iso: "KR",
    dialCode: "+82",
    cities: ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon", "Gwangju"]
  },
  {
    name: "China",
    iso: "CN",
    dialCode: "+86",
    cities: [
      "Beijing",
      "Shanghai",
      "Guangzhou",
      "Shenzhen",
      "Chengdu",
      "Hangzhou",
      "Wuhan",
      "Xi'an",
      "Tianjin",
      "Suzhou"
    ]
  },
  {
    name: "Hong Kong",
    iso: "HK",
    dialCode: "+852",
    cities: ["Hong Kong", "Kowloon", "New Territories"]
  },
  {
    name: "Indonesia",
    iso: "ID",
    dialCode: "+62",
    cities: ["Jakarta", "Surabaya", "Bandung", "Medan", "Bekasi", "Tangerang", "Depok", "Semarang"]
  },
  {
    name: "Malaysia",
    iso: "MY",
    dialCode: "+60",
    cities: ["Kuala Lumpur", "George Town", "Ipoh", "Johor Bahru", "Shah Alam", "Petaling Jaya"]
  },
  {
    name: "Philippines",
    iso: "PH",
    dialCode: "+63",
    cities: ["Manila", "Quezon City", "Cebu City", "Davao City", "Makati", "Taguig"]
  },
  {
    name: "Thailand",
    iso: "TH",
    dialCode: "+66",
    cities: ["Bangkok", "Chiang Mai", "Pattaya", "Phuket", "Khon Kaen"]
  },
  {
    name: "Vietnam",
    iso: "VN",
    dialCode: "+84",
    cities: ["Ho Chi Minh City", "Hanoi", "Da Nang", "Haiphong", "Can Tho"]
  },
  {
    name: "Brazil",
    iso: "BR",
    dialCode: "+55",
    cities: [
      "São Paulo",
      "Rio de Janeiro",
      "Brasília",
      "Salvador",
      "Fortaleza",
      "Belo Horizonte",
      "Manaus",
      "Curitiba"
    ]
  },
  {
    name: "Mexico",
    iso: "MX",
    dialCode: "+52",
    cities: ["Mexico City", "Guadalajara", "Monterrey", "Puebla", "Toluca", "Tijuana", "León"]
  },
  {
    name: "South Africa",
    iso: "ZA",
    dialCode: "+27",
    cities: ["Johannesburg", "Cape Town", "Durban", "Pretoria", "Port Elizabeth", "Bloemfontein"]
  },
  {
    name: "Nigeria",
    iso: "NG",
    dialCode: "+234",
    cities: ["Lagos", "Abuja", "Kano", "Ibadan", "Port Harcourt", "Benin City"]
  },
  {
    name: "Kenya",
    iso: "KE",
    dialCode: "+254",
    cities: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"]
  },
  {
    name: "Israel",
    iso: "IL",
    dialCode: "+972",
    cities: ["Tel Aviv", "Jerusalem", "Haifa", "Rishon LeZion", "Petah Tikva", "Beersheba"]
  },
  {
    name: "Turkey",
    iso: "TR",
    dialCode: "+90",
    cities: ["Istanbul", "Ankara", "Izmir", "Bursa", "Adana", "Gaziantep"]
  }
];

export const COUNTRIES_BY_NAME: Record<string, CountryEntry> = Object.fromEntries(
  COUNTRIES.map((country) => [country.name, country])
);

export function findCountryByName(name: string): CountryEntry | undefined {
  return COUNTRIES_BY_NAME[name];
}
