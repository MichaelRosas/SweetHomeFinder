const API_BASE = 'https://api.petfinder.com/v2';
let accessToken = null;
let tokenExpiry = null;

// Get OAuth token
async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const response = await fetch(`${API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: import.meta.env.VITE_PETFINDER_API_KEY,
      client_secret: import.meta.env.VITE_PETFINDER_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to get PetFinder access token');
  }

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000 - 60000; // Subtract 1 minute for safety

  return accessToken;
}

// Make authenticated request
async function apiRequest(endpoint) {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`PetFinder API request failed: ${response.status}`);
  }

  return response.json();
}

// Persistent cache using localStorage with 30-day expiration
const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days (animal types/breeds rarely change)
const CACHE_PREFIX = 'petfinder_cache_';

function getFromCache(key) {
  try {
    const cached = localStorage.getItem(CACHE_PREFIX + key);
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_DURATION) {
      return data;
    }

    // Cache expired, remove it
    localStorage.removeItem(CACHE_PREFIX + key);
    return null;
  } catch (error) {
    console.error('Cache read error:', error);
    return null;
  }
}

function setToCache(key, data) {
  try {
    localStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({
        data,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    console.error('Cache write error:', error);
    // If localStorage is full or blocked, continue without caching
  }
}

function getCachedOrFetch(key, fetchFn) {
  const cached = getFromCache(key);
  if (cached) {
    return Promise.resolve(cached);
  }

  return fetchFn().then((data) => {
    setToCache(key, data);
    return data;
  });
}

// Get animal types
export async function getTypes() {
  try {
    return await getCachedOrFetch('types', async () => {
      const response = await apiRequest('/types');
      return response.types.map((type) => type.name);
    });
  } catch (error) {
    console.error('Failed to fetch types from PetFinder:', error);
    // Fallback to static data
    return [
      'Dog',
      'Cat',
      'Rabbit',
      'Small & Furry',
      'Horse',
      'Bird',
      'Scales, Fins & Other',
      'Barnyard',
    ];
  }
}

// Get breeds for a specific animal type
export async function getBreeds(animalType) {
  if (!animalType) return [];

  try {
    return await getCachedOrFetch(`breeds-${animalType}`, async () => {
      const endpoint = `/types/${encodeURIComponent(animalType.toLowerCase())}/breeds`;
      const response = await apiRequest(endpoint);

      if (!response?.breeds || !Array.isArray(response.breeds)) {
        return [];
      }

      return response.breeds.map((breed) => breed.name);
    });
  } catch (error) {
    console.error(`Failed to fetch breeds for ${animalType}:`, error);
    // Fallback to static data
    const fallbackBreeds = {
      Dog: [
        'Siberian Husky',
        'Labrador Retriever',
        'German Shepherd',
        'Golden Retriever',
        'Beagle',
        'Mixed Breed',
      ],
      Cat: [
        'Siamese',
        'Persian',
        'Maine Coon',
        'Ragdoll',
        'Sphynx',
        'Domestic Short Hair',
        'Domestic Long Hair',
      ],
      Rabbit: ['Holland Lop', 'Netherland Dwarf', 'Lionhead', 'Mini Rex', 'Mixed Breed'],
      'Small & Furry': ['Hamster', 'Guinea Pig', 'Ferret', 'Chinchilla', 'Gerbil', 'Rat', 'Mouse'],
      Horse: ['Quarter Horse', 'Thoroughbred', 'Arabian', 'Paint', 'Appaloosa', 'Mixed Breed'],
      Bird: ['Parakeet', 'Cockatiel', 'Canary', 'Finch', 'Parrot', 'Mixed Breed'],
      'Scales, Fins & Other': ['Goldfish', 'Turtle', 'Snake', 'Lizard', 'Mixed Breed'],
      Barnyard: ['Chicken', 'Goat', 'Pig', 'Sheep', 'Duck', 'Mixed Breed'],
    };
    return fallbackBreeds[animalType] || ['Mixed Breed'];
  }
}

// Get available colors
export async function getColors() {
  try {
    return await getCachedOrFetch('colors', async () => {
      // PetFinder doesn't have a dedicated colors endpoint, so we'll use common pet colors
      return [
        'Black',
        'White',
        'Brown',
        'Gray',
        'Golden',
        'Cream',
        'Red',
        'Blue',
        'Chocolate',
        'Silver',
        'Tan',
        'Brindle',
        'Merle',
        'Tricolor',
        'Bicolor',
        'Orange',
        'Yellow',
        'Sable',
        'Fawn',
        'Buff',
      ];
    });
  } catch (error) {
    console.error('Failed to get colors:', error);
    return ['Black', 'White', 'Brown', 'Gray', 'Golden', 'Mixed'];
  }
}

// Get available ages
export function getAges() {
  return ['Baby', 'Young', 'Adult', 'Senior'];
}

// Get available genders
export function getGenders() {
  return ['Male', 'Female'];
}

// Get available sizes
export function getSizes() {
  return ['Small', 'Medium', 'Large', 'Extra Large'];
}

// Get available environments/tags
export function getEnvironments() {
  return [
    'Good with other animals',
    'Good with children',
    'Animal must be leashed at all times',
    'Good with dogs',
    'Good with cats',
  ];
}

// Get common pet attributes/tags
export function getAttributes() {
  return ['Spayed/Neutered', 'House Trained', 'Declawed', 'Special Needs', 'Shots Current'];
}

// Utility to clear cache (useful for debugging or forced refresh)
export function clearPetFinderCache() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
    console.log('PetFinder cache cleared');
  } catch (error) {
    console.error('Failed to clear cache:', error);
  }
}

// Legacy functions for backward compatibility
export { getTypes as getTypesFromApi, getBreeds as getBreedsFromApi };
