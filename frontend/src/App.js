import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import GoogleLoginButton from './GoogleLoginButton';
import CalendarComponent from './CalendarComponent';

// const util = require('util');
// const fs = require('fs/promises');
// const exec = util.promisify(require('child_process').exec);
// const axios = require('axios');

// (async () => {
//     //capture frame
    

//     await exec(
//         'ffmpeg -y -f video4linux -s 1280x720' +
//         '-i /dev/video1- frames 1 code.jpg'
//     );

//     //convert to base 64
//     const image = await fs.readFile('code.jpg');
//     const base64 = image.toString('base64');

//     const url = 
//       'https://vision.googleapis.com/v1/images:annotate' +
//       '?key=${process.env.gkey}' ;

//     const results = await axios
//       .post(url, {
//           requests: [{
//               image: {
//                   content: base64
//               },
//               features: [{
//                   type:'DOCUMENT_TEXT_DETECTION'
//               }]
//           }]
//       });
//     const code = results.data.responses[0].fullTextAnnotation.text;
// })();

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
          {/*  [ADDED] Button to go to Bluetooth Page */}
              <div style={{marginTop:'10px', marginRight: '10px', textAlign: 'right'}}>
                {user ? (
                    <div className="user-info">
                      <img src={user.photoURL} alt="Profile" className="profile-pic" />
                      <span>Welcome, {user.displayName}</span>
                      <button onClick={() => auth.signOut()}>Sign Out</button>
                    </div>
                  ) : (
                    <GoogleLoginButton onLoginSuccess={handleLoginSuccess} />
                )}
              </div>
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

                <h1 style={{textAlign: 'center', marginTop:'20%'}}>Aetas Calendar</h1>

                {user ? (
                  <CalendarComponent />
                ) : (
                  <div className="login-prompt" style= {{textAlign: 'center'}}>
                    <p>Please sign in with Google to access your calendar</p>
                  </div>
                )}
                <div style={{textAlign: 'center', marginTop: '50%'}}>
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
                  
              </main>
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
