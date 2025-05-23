import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import GoogleLoginButton from './GoogleLoginButton';
import CalendarComponent from './CalendarComponent';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import BluetoothPage from './BluetoothPage';


function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      
      // Check for token in localStorage when user state changes
      const token = localStorage.getItem('googleAccessToken');
      if (token) {
        setAccessToken(token);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (loggedInUser, token) => {
    setUser(loggedInUser);
    
    // Store token in localStorage and state
    if (token) {
      localStorage.setItem('googleAccessToken', token);
      setAccessToken(token);
    }
  };

  const handleSignOut = () => {
    auth.signOut();
    localStorage.removeItem('googleAccessToken');
    setAccessToken(null);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Router>
      <div className="app">
        <header>
          <div style={{marginTop:'10px', marginRight: '10px', textAlign: 'right'}}>
            {user ? (
              <div className="user-info" >
                <button 
                  onClick={handleSignOut} 
                  style={{
                    border: '1px solid #1e1e1e', 
                    backgroundColor: '#C5C5F1', 
                    borderRadius: '30px', 
                    width: '75px', 
                    color: '#1e1e1e', 
                    height: '30px',
                    verticalAlign: 'top'
                  }}>Sign Out</button>
                <img src={user.photoURL} alt="Profile" className="profile-pic" style={{marginLeft: '10px', borderRadius: '50%', height: '30px'}}/>
              </div>
            ) : (
              <GoogleLoginButton onLoginSuccess={handleLoginSuccess} />
            )}
          </div>
        </header>

        <Routes>
          {/* Bluetooth Page route */}
          <Route path="/bluetooth" element={<BluetoothPage />} />

          {/* Root route shows calendar/login logic */}
          <Route
            path="/"
            element={
              <main>
                <h1 style={{textAlign: 'center', marginTop:'30%'}}>Aetas Calendar</h1>

 {/*             {user ? (
                  <CalendarComponent />
                ) : (
                  <div className="login-prompt" style= {{textAlign: 'center'}}>
                    <p>Please sign in with Google to access your calendar</p>
                  </div>
                )}*/}
                
                {/* {user && ( */}
                  <div style={{textAlign: 'center', marginTop: '40%'}}>
                    <Link to="/bluetooth">
                      <button style={{
                        border: '0.5px solid #1e1e1e', 
                        backgroundColor: '#C5C5F1', 
                        borderRadius: '30px', 
                        width: '200px', 
                        height: '75px',
                        color: '#1e1e1e',
                        fontSize: '20px'
                      }}>Connect to Calendar</button>
                    </Link>
                  </div>
                {/* )} */}
              </main>
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;