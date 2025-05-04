import React, { useState, useEffect, useRef } from 'react';

// Match UUIDs with the Adafruit device
const CALENDAR_SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const CALENDAR_DATA_CHAR_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';

// Helper function to visualize data points
const formatCoordinateData = (coords) => {
  if (!coords || coords.length === 0) return "No data collected";
  return `${coords.length} points collected`;
};

// Helper function to generate file content from coordinates
const generateFileContent = (coordinates) => {
  if (!coordinates || coordinates.length === 0) {
    return "";
  }
  
  return coordinates.map(coord => `[${coord.x},${coord.y}],`).join('\n');
};

// Helper function to download data as a file
const downloadFile = (content, filename = "coordinates.txt", contentType = "text/plain") => {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  
  // Clean up
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
};

const BluetoothPage = () => {
  const [status, setStatus] = useState('Not Connected');
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [currentData, setCurrentData] = useState(null);
  const [coordinates, setCoordinates] = useState([]);
  const [dateInfo, setDateInfo] = useState(null);
  const [messageHistory, setMessageHistory] = useState([]);
  const [debugLog, setDebugLog] = useState([]);
  const [fileGenerated, setFileGenerated] = useState(false);
  
  // Refs to maintain state between renders
  const dataCharRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const lastValueRef = useRef('');
  const sessionStateRef = useRef('idle'); // idle, collecting, completed
  const coordinatesRef = useRef([]);

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
    setFileGenerated(false);
    
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    log('Device disconnected');
  };

  // Handle file generation when STOP is received
  const handleStopReceived = () => {
    if (coordinatesRef.current.length > 0 && !fileGenerated) {
      const content = generateFileContent(coordinatesRef.current);
      const filename = `coordinates_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
      
      downloadFile(content, filename);
      setFileGenerated(true);
      log(`Generated file with ${coordinatesRef.current.length} coordinates`);
    } else if (fileGenerated) {
      log('File already generated for this session');
    } else {
      log('No coordinates to export');
    }
  };

  // Process received data based on message format
  const processData = (data) => {
    // Check for control messages (START, STOP, END)
    if (data.includes('START-')) {
      sessionStateRef.current = 'collecting';
      coordinatesRef.current = [];
      setCoordinates([]);
      setFileGenerated(false);
      log(`New data collection session started: ${data}`);
      return;
    }
    
    if (data.includes('STOP-')) {
      sessionStateRef.current = 'waiting_for_date';
      log(`Data collection stopped: ${data}`);
      handleStopReceived(); // Generate and download file
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
          const newCoord = { x, y };
          coordinatesRef.current = [...coordinatesRef.current, newCoord];
          setCoordinates(coordinatesRef.current);
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

  // Manual export function (for UI button)
  const handleManualExport = () => {
    if (coordinatesRef.current.length > 0) {
      const content = generateFileContent(coordinatesRef.current);
      const filename = `coordinates_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
      
      downloadFile(content, filename);
      log(`Manually exported ${coordinatesRef.current.length} coordinates`);
    } else {
      log('No coordinates to export');
    }
  };

  // Set up polling to regularly read the characteristic value
  const setupPolling = async (characteristic) => {
    dataCharRef.current = characteristic;
    log('Polling started (200ms interval)'); // Reduced from 500ms to 200ms for speed

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
    }, 200); // Poll every 200ms for better responsiveness
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

      // Try to use notifications if supported (more efficient than polling)
      try {
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', (event) => {
          handleDataReceived(event.target.value);
        });
        log('Notifications enabled (efficient mode)');
      } catch (err) {
        // Fall back to polling if notifications aren't supported
        log('Notifications not supported, using polling fallback');
        await setupPolling(characteristic);
      }

      setStatus('Connected - Receiving Data');

      // Listen for disconnection events
      device.addEventListener('gattserverdisconnected', handleDisconnection);
    } catch (err) {
      log(`Connection failed: ${err.message}`);
      setStatus(`Connection failed: ${err.message}`);
    }
  };

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
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
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
          onClick={handleManualExport}
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
          Export Coordinates
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
              {fileGenerated && (
                <p style={{ color: '#4CAF50' }}><strong>File Generated:</strong> Yes</p>
              )}
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