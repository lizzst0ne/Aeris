import React, { useState, useEffect, useRef } from 'react';

// Match UUIDs with the Adafruit device
const CALENDAR_SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const CALENDAR_DATA_CHAR_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';

// Helper function to download data as a text file - not used directly anymore
// Instead, the saveCoordinatesToFile function handles download directly for better debugging
const downloadAsFile = (data, filename) => {
  console.log('downloadAsFile called', {data: data.substring(0, 50) + '...', filename});
  const text = data;
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  console.log('Download anchor created');
  a.click();
  console.log('Download anchor clicked');
  
  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('Download anchor cleaned up');
  }, 100);
};


// Helper function to visualize data points
const formatCoordinateData = (coords) => {
  if (!coords || coords.length === 0) return "No data collected";
  return `${coords.length} points collected`;
};

const BluetoothPage = () => {
  const [status, setStatus] = useState('Not Connected');
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [currentData, setCurrentData] = useState(null);
  const [coordinates, setCoordinates] = useState([]);
  const [dateInfo, setDateInfo] = useState(null);
  const [messageHistory, setMessageHistory] = useState([]);
  const [debugLog, setDebugLog] = useState([]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [modalContent, setModalContent] = useState('');
  
  // Refs to maintain state between renders
  const dataCharRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const lastValueRef = useRef('');
  const sessionStateRef = useRef('idle'); // idle, collecting, completed

  // Helper for adding to debug log
  const log = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `${timestamp} - ${msg}`;
    setDebugLog((prev) => [entry, ...prev.slice(0, 20)]);
    console.log('[Bluetooth]', msg);
  };

  // Handle disconnection of device
  const handleDisconnection = () => {
    setStatus('Disconnected');
    setConnectedDevice(null);
    dataCharRef.current = null;
    setCurrentData(null);
    sessionStateRef.current = 'idle';
    
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    log('Device disconnected');
  };

  // Process received data based on message format
  const processData = (data) => {
    // Check for control messages (START, STOP, END)
    if (data.includes('START-')) {
      sessionStateRef.current = 'collecting';
      log(`New data collection session started: ${data}`);
      setCoordinates([]);
      return;
    }
    
    if (data.includes('STOP-')) {
      sessionStateRef.current = 'waiting_for_date';
      log(`Data collection stopped: ${data}`);
      log(`${coordinates}`);
      return;
    }
    
    if (data.includes('DATE-')) {
      sessionStateRef.current = 'has_date';
      // Extract date information from format "DATE-[counter]:[month],[day]"
      const dateContent = data.split(':')[1] || '';
      setDateInfo(dateContent);
      log(`Date received: ${dateContent}`);
      return;
    }
    
    if (data.includes('END-')) {
      sessionStateRef.current = 'completed';
      log(`Session completed: ${data}`);
      return;
    }
    
    // Process coordinate data (format: "[counter]:[x],[y]")
    if (sessionStateRef.current === 'collecting' && data.includes(':')) {
      const parts = data.split(':');
      if (parts.length === 2) {
        const coordData = parts[1];
        const [x, y] = coordData.split(',').map(Number);
        
        if (!isNaN(x) && !isNaN(y)) {
          setCoordinates(prev => [...prev, { x, y }]);
          log(`Coordinate received: x=${x}, y=${y}`);
        }
      }
    }
  };

   // Save coordinates to a text file or display them for copying
   const saveCoordinatesToFile = () => {
    // Log the action for debugging
    log('Save Coordinates button clicked');
    
    if (coordinates.length === 0) {
      log('No coordinates to save');
      alert('No coordinates to save!');
      return;
    }
    
    try {
      log(`Preparing to save ${coordinates.length} coordinates...`);
      
      // Build the content of the file
      let content = `Calendar Coordinates Data\n`;
      content += `Date: ${dateInfo || 'Not provided'}\n`;
      content += `Total Coordinates: ${coordinates.length}\n\n`;
      
      // Add all coordinates
      coordinates.forEach((coord, index) => {
        content += `${index+1}: ${coord.x},${coord.y}\n`;
      });
      
      log('Content prepared: ' + content.substring(0, 50) + '...');
      
      // Generate filename with timestamp keeping timestamp for now for different file making
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace('T', '_').split('.')[0];
      const filename = `coordz${timestamp}.txt`;
      
      // Detect if we're on iOS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      
      if (isIOS) {
        // For iOS, show the content in a modal for copying instead of downloading
        setShowCopyModal(true);
        setModalContent(content);
        log('Displaying content for copying (iOS mode)');
      } else {
        // Download the file as before for non-iOS devices
        log(`Initiating download of file: ${filename}`);
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        
        log('Download anchor created, attempting to click...');
        a.click();
        
        log('Click triggered on download anchor');
        
        // Clean up
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          log('Download anchor cleaned up');
        }, 100);
        
        log(`Coordinates saved to file: ${filename}`);
      }
    } catch (err) {
      const errorMsg = `Error saving coordinates: ${err.message}`;
      log(errorMsg);
      console.error(errorMsg, err);
      alert(`Error: ${err.message}`);
    }
  };

  // Handle data received from the BLE characteristic
  const handleDataReceived = (value) => {
    try {
      const textDecoder = new TextDecoder('utf-8');
      const raw = textDecoder.decode(value);
      const trimmed = raw.trim();

      // Only process new values (different from the last one)
      if (trimmed && trimmed !== lastValueRef.current) {
        lastValueRef.current = trimmed;
        setCurrentData(trimmed);
        setMessageHistory((prev) => [`Received: ${trimmed}`, ...prev.slice(0, 19)]);
        
        // Process the message based on its format
        processData(trimmed);
        
        log(`Data received: ${trimmed}`);
      }
    } catch (err) {
      log(`Error decoding value: ${err.message}`);
    }
  };

  // Set up polling to regularly read the characteristic value
  const setupPolling = async (characteristic) => {
    dataCharRef.current = characteristic;
    log('Polling started (500ms interval)');

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const value = await characteristic.readValue();
        handleDataReceived(value);
      } catch (err) {
        log(`Polling error: ${err.message}`);
        if (err.message.includes('disconnected')) {
          clearInterval(pollingIntervalRef.current);
          handleDisconnection();
        }
      }
    }, 10); // Poll every 10ms
  };

  // Connect to the Adafruit device
  const connectToDevice = async () => {
    try {
      log('Requesting Bluetooth device...');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'very cool calendar we made' }],
        optionalServices: [CALENDAR_SERVICE_UUID]
      });
      
      setConnectedDevice(device);
      setStatus('Connecting...');
      log('Connecting to GATT server...');

      // Connect to the GATT server
      const server = await device.gatt.connect();
      log('Connected to GATT server');

      // Get the calendar service
      const service = await server.getPrimaryService(CALENDAR_SERVICE_UUID);
      log('Found calendar service');

      // Get the data characteristic
      const characteristic = await service.getCharacteristic(CALENDAR_DATA_CHAR_UUID);
      log('Found data characteristic');

      // Set up polling for data
      await setupPolling(characteristic);
      setStatus('Connected - Polling for Data');

      // Listen for disconnection events
      device.addEventListener('gattserverdisconnected', handleDisconnection);
    } catch (err) {
      log(`Connection failed: ${err.message}`);
      setStatus(`Connection failed: ${err.message}`);
    }
  };

 
// Render the UI
return (
  <div style={{ padding: '20px' }}>
    <h2>Bluetooth Calendar</h2>
    <p><strong>Status:</strong> {status}</p>
    
    <div style={{ display: 'flex', gap: '10px' }}>
      <button 
        onClick={connectToDevice}
        disabled={connectedDevice !== null}
        style={{ 
          padding: '8px 16px',
          backgroundColor: connectedDevice ? '#cccccc' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: connectedDevice ? 'default' : 'pointer'
        }}
      >
        Connect to Calendar Device
      </button>

      <button 
        onClick={saveCoordinatesToFile}
        disabled={coordinates.length === 0}
        style={{ 
          padding: '8px 16px',
          backgroundColor: coordinates.length === 0 ? '#cccccc' : '#2196F3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: coordinates.length === 0 ? 'default' : 'pointer'
        }}
      >
        Save Coordinates to File
      </button>
    </div>

    {/* Data Display Section */}
    {currentData && (
      <div style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {/* Current Info Panel */}
          <div style={{ 
            flex: '1 1 300px', 
            marginRight: '20px', 
            padding: '15px',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            marginBottom: '15px'
          }}>
            <h3>Current Data</h3>
            <p><strong>Last Message:</strong> {currentData}</p>
            <p><strong>Date:</strong> {dateInfo || 'Not set'}</p>
            <p><strong>Session State:</strong> {sessionStateRef.current}</p>
            <p><strong>Coordinates:</strong> {formatCoordinateData(coordinates)}</p>
          </div>

          {/* Message History Panel */}
          <div style={{
            flex: '1 1 300px',
            padding: '15px',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            marginBottom: '15px'
          }}>
            <h3>Message History</h3>
            <ul style={{ maxHeight: '200px', overflowY: 'auto', padding: '0 0 0 20px' }}>
              {messageHistory.map((entry, idx) => (
                <li key={idx} style={{ marginBottom: '5px' }}>{entry}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Debug Console */}
        <div style={{ marginTop: '20px' }}>
          <h3>Debug Console</h3>
          <pre style={{ 
            background: '#333', 
            color: '#f3f3f3',
            padding: '10px', 
            height: '200px', 
            overflowY: 'scroll',
            fontFamily: 'monospace',
            borderRadius: '4px'
          }}>
            {debugLog.map((line, i) => <div key={i}>{line}</div>)}
          </pre>
        </div>
      </div>
    )}
    {/* Copy Modal for iOS */}
    {showCopyModal && (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '80%',
          overflow: 'auto'
        }}>
          <h3>Coordinate Data</h3>
          <p>Copy this data to save it (long press and select "Copy"):</p>
          <textarea 
            readOnly
            style={{
              width: '100%',
              height: '200px',
              padding: '10px',
              marginBottom: '10px',
              fontFamily: 'monospace',
              fontSize: '12px'
            }}
            value={modalContent}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            <button 
              onClick={() => {
                try {
                  navigator.clipboard.writeText(modalContent);
                  alert('Content copied to clipboard!');
                } catch (err) {
                  alert('Please copy the text manually by long-pressing and selecting "Copy"');
                }
              }}
              style={{ 
                padding: '8px 16px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Copy to Clipboard
            </button>
            <button 
              onClick={() => setShowCopyModal(false)}
              style={{ 
                padding: '8px 16px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
);
};

export default BluetoothPage;