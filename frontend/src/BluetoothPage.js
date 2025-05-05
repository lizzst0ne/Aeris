import React, { useState, useEffect, useRef } from 'react';

// Match UUIDs with the Adafruit device
const CALENDAR_SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const CALENDAR_DATA_CHAR_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';

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

  // const saveCoordinatesToServer = async () => {
  //   if (coordinates.length === 0) {
  //     log('No coordinates to save');
  //     return;
  //   }
    
  //   try {
  //     setSavingStatus('saving');
  //     log('Saving coordinates to server...');
      
  //     const payload = {
  //       fileName: 'coordz.txt',
  //       date: dateInfo || 'unknown',
  //       coordinates: coordinates,
  //       sessionState: sessionStateRef.current
  //     };
      
  //     const response = await fetch(SAVE_COORDINATES_ENDPOINT, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify(payload),
  //     });
      
  //     if (response.ok) {
  //       const result = await response.json();
  //       log(`Coordinates saved to server: ${result.message}`);
  //       setSavingStatus('success');
  //     } else {
  //       const error = await response.text();
  //       throw new Error(`Server responded with: ${error}`);
  //     }
  //   } catch (err) {
  //     log(`Error saving to server: ${err.message}`);
  //     setSavingStatus('error');
  //   }
  // };

  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      
      if (connectedDevice && connectedDevice.gatt.connected) {
        connectedDevice.gatt.disconnect();
      }
    };
  }, [connectedDevice]);

  // Render the UI
  return (
    <div style={{ padding: '20px' }}>
      <h2>Bluetooth Calendar</h2>
      <p><strong>Status:</strong> {status}</p>
      
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
    </div>
  );
};

export default BluetoothPage;