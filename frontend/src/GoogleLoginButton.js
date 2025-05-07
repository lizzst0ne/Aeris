import React, { useState } from 'react';
import { signInWithGoogle } from './firebase'; // Path to your firebase.js file

const GoogleLoginButton = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { user, token } = await signInWithGoogle();
      console.log("Logged in user:", user);
      console.log("Access token for Calendar API:", token);
      
      if (onLoginSuccess) {
        onLoginSuccess(user, token);
      }
    } catch (err) {
      setError("Failed to login with Google. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleGoogleLogin}
        disabled={isLoading}
        className="google-login-btn"
        style={{border: '1px solid #1e1e1e', backgroundColor: '#C5C5F1', borderRadius: '30px', width: '200px'}}
      >
        {isLoading ? "Logging in..." : "Sign in with Google"}
      </button>
      
      {error && <p className="error-message">{error}</p>}
    </div>
  );
};

export default GoogleLoginButton;