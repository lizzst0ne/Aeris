import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import GoogleLoginButton from './GoogleLoginButton';
import CalendarComponent from './CalendarComponent';

// [ADDED] React Router imports
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import BluetoothPage from './BluetoothPage';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (loggedInUser, token) => {
    setUser(loggedInUser);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  // [ADDED] Wrap everything in <Router>
  return (
    <Router>
      <div className="app">
        <header>
          <h1>Google Calendar Integration</h1>
          {/*  [ADDED] Button to go to Bluetooth Page */}
          <Link to="/bluetooth">
            <button style={{ marginRight: '1rem' }}>Go to Bluetooth Page</button>
          </Link>

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

        {/*  [ADDED] Define Routes */}
        <Routes>
          {/* Bluetooth Page route */}
          <Route path="/bluetooth" element={<BluetoothPage />} />

          {/* Root route shows calendar/login logic */}
          <Route
            path="/"
            element={
              <main>
                {user ? (
                  <CalendarComponent />
                ) : (
                  <div className="login-prompt">
                    <p>Please sign in with Google to access your calendar</p>
                  </div>
                )}
              </main>
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
