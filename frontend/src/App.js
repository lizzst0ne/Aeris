import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import GoogleLoginButton from './GoogleLoginButton';
import CalendarComponent from './CalendarComponent';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    // Cleanup subscription
    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (loggedInUser, token) => {
    setUser(loggedInUser);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="app">
      <header>
        <h1>Google Calendar Integration</h1>
        {user ? (
          <div className="user-info">
            <img src={user.photoURL} alt="Profile" className="profile-pic" />
            <span>Welcome, {user.displayName}</span>
            <button onClick={() => auth.signOut()}>Sign Out</button>
          </div>
        ) : (
          <GoogleLoginButton onLoginSuccess={handleLoginSuccess} />
        )}
      </header>

      <main>
        {user ? (
          <CalendarComponent />
        ) : (
          <div className="login-prompt">
            <p>Please sign in with Google to access your calendar</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;