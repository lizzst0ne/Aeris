// In your firebase config file (e.g., firebase.js)
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

// Your Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBxuAYDkIU0fZctlahsS_AOBRFoCeJxHpU",
    authDomain: "aeris-4a23a.firebaseapp.com",
    projectId: "aeris-4a23a",
    storageBucket: "aeris-4a23a.firebasestorage.app",
    messagingSenderId: "1046705024425",
    appId: "1:1046705024425:web:dc2a788d800987332668b8"
  };

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Add Google Calendar API scope to the provider
googleProvider.addScope('https://www.googleapis.com/auth/calendar');

// Function to handle Google sign-in
const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    // This gives you a Google Access Token
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential.accessToken;
    const user = result.user;
    
    // Store the token for later use with Google Calendar API
    localStorage.setItem('googleAccessToken', token);
    
    return { user, token };
  } catch (error) {
    console.error("Error signing in with Google:", error);
    throw error;
  }
};

export { auth, signInWithGoogle };