import { collection, getDocs, doc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import axios from 'axios';

const PROXY_SERVER_URL = 'https://proxy-server-we-eat-e24e32c11d10.herokuapp.com';
const GOOGLE_PLACES_API_KEY = 'YOUR_GOOGLE_PLACES_API_KEY';

const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 3958.8; // Earth's radius in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  console.log("Multiplication: ", R * c, "c equals: ", c);
  return R * c;
};

export const fetchKeywords = async (): Promise<string[]> => {
  const newKeywords: string[] = [];

  const restaurantsSnapshot = await getDocs(collection(db, 'restaurants'));
  restaurantsSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.name) {
      newKeywords.push(data.name);
      console.log("Adding restaurant name from Firestore: ", data.name);
    }
  });

  if (auth.currentUser) {
    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    const createdMenusSnapshot = await getDocs(collection(userDocRef, 'createdMenus'));
    createdMenusSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.restaurantName) {
        newKeywords.push(data.restaurantName);
        console.log("Adding restaurant name from user's created menus: ", data.restaurantName);
      }
    });
  }

  return newKeywords;
};

export const searchRestaurants = async (location: string, radius: number, searchQuery: string | string[], userLocation: { lat: number, lng: number }) => {
  const allResults: any[] = [];
  const keywords = typeof searchQuery === 'string' && searchQuery ? [searchQuery] : searchQuery;

  for (const keyword of keywords && keywords.length > 0 ? keywords : await fetchKeywords()) {
    console.log(`Searching for keyword: ${keyword}`);

    const params = {
      location,
      radius: radius * 1609.34, // Convert miles to meters
      keyword,
      type: 'restaurant',
      key: GOOGLE_PLACES_API_KEY
    };

    console.log('Request params:', params);

    try {
      const { data } = await axios.get(`${PROXY_SERVER_URL}/proxy`, { params });
      console.log(`Google Places API results for ${keyword}:`, data.results);
      allResults.push(...data.results);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`Error fetching data for keyword: ${keyword}`, error.response?.data || error.message);
      } else {
        console.error(`Error fetching data for keyword: ${keyword}`, error);
      }
    }
  }

  const formattedResults = allResults.map((result) => {
    const vicinity = result.vicinity || result.formatted_address || '';
    const distance = result.geometry && result.geometry.location
      ? haversineDistance(userLocation.lat, userLocation.lng, result.geometry.location.lat, result.geometry.location.lng)
      : NaN;
    return {
      name: result.name,
      vicinity,
      geometry: result.geometry,
      distance
    };
  }).filter(result => !isNaN(result.distance) && result.distance <= (radius + 1)); // Added margin of error

  formattedResults.sort((a, b) => a.distance - b.distance);

  console.log("Sorted search results: ", formattedResults);
  return formattedResults;
};
