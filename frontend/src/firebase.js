// In your firebase config file (e.g., firebase.js)
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBYbff4B6k2D_CEhCj1GQiO2Ei-M3AuSl8",
  authDomain: "aeris-451519.firebaseapp.com",
  projectId: "aeris-451519",
  storageBucket: "aeris-451519.firebasestorage.app",
  messagingSenderId: "1054100119575",
  appId: "1:1054100119575:web:8ccb09d985dfea51b17c52"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Add Google Calendar API scope to the provider
googleProvider.addScope('https://www.googleapis.com/auth/calendar');
googleProvider.addScope('https://www.googleapis.com/auth/calendar.events');

googleProvider.setCustomParameters({
  access_type: 'offline',
  prompt: 'consent'
});


// Function to handle Google sign-in
const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    
    // Get the Google OAuth credentials
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    // IMPORTANT: This token is only for Firebase Auth, not for direct API calls
    // We need to get the ID token instead, which we'll exchange for a proper access token
    const user = result.user;
    
    // Get the ID token from the user
    const idToken = await user.getIdToken();
    
    // We'll use this ID token in our backend to exchange for Google API tokens
    console.log("Got Firebase ID token:", idToken);
    
    // For now, store this ID token
    localStorage.setItem('firebaseIdToken', idToken);
    
    // You should implement a backend exchange endpoint - see comments below
    // For now we'll simulate this with a frontend approach (not recommended for production)
    const accessToken = credential.accessToken;
    if (accessToken) {
      localStorage.setItem('googleAccessToken', accessToken);
      console.log("Stored access token:", accessToken);
    } else {
      console.error("No access token available!");
    }
    
    return { user, idToken };
  } catch (error) {
    console.error("Error signing in with Google:", error);
    throw error;
  }
};

//to exchange the Firebase ID token for Google API tokens using a secure backend
const exchangeTokenWithBackend = async (idToken) => {
  // This function would call your backend endpoint
  // Your backend would then use the Firebase Admin SDK to:
  // 1. Verify the ID token
  // 2. Use Google OAuth libraries to exchange it for Google API tokens
  // 3. Return those tokens to the frontend
  
  
  const response = await fetch('/api/auth/exchange-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  
  if (!response.ok) {
    throw new Error('Failed to exchange token');
  }
  
  const { accessToken, refreshToken, expiresIn } = await response.json();
  
  // Store these tokens securely
  localStorage.setItem('googleAccessToken', accessToken);
  sessionStorage.setItem('tokenExpiry', Date.now() + expiresIn * 1000);
  
  // Don't store refresh token in localStorage in production
  // Your backend should handle refresh tokens securely
  
  return { accessToken };
  
};

export { auth, signInWithGoogle };