import React, { useState, useEffect, useRef } from 'react';

// Match UUIDs with the Adafruit device
const CALENDAR_SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const CALENDAR_DATA_CHAR_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';

// Helper function to visualize data points
const formatCoordinateData = (coords) => {
  if (!coords || coords.length === 0) return "No data collected";
  return `${coords.length} points collected`;
};

// Improved BMP generation functions with point drawing
const createBMPFile = (coordinates, padding = 10, pointSize = 3) => {
  // If no coordinates, return a small blank canvas
  if (!coordinates || coordinates.length === 0) {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    
    // Fill with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 100, 100);
    
    return {
      canvas,
      bmpBlob: canvasToBMP(canvas),
      previewUrl: canvas.toDataURL('image/png')
    };
  }
  
  // Find the dimensions needed based on coordinates
  const xs = coordinates.map(coord => coord.x);
  const ys = coordinates.map(coord => coord.y);
  
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  // Calculate width and height with padding
  const width = (maxX - minX) + 1 + (2 * padding);
  const height = (maxY - minY) + 1 + (2 * padding);
  
  // Create a canvas with these dimensions
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  // Fill with white background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  
  // Set to black for drawing points
  ctx.fillStyle = 'black';
  
  // Draw each coordinate as a point (small rectangle)
  coordinates.forEach(coord => {
    // Adjust coordinates relative to minX, minY + padding
    const x = coord.x - minX + padding;
    const y = coord.y - minY + padding;
    
    // Draw a filled rectangle for each point
    const halfSize = Math.floor(pointSize / 2);
    
    // Method 1: Draw as filled rectangle
    ctx.fillRect(x - halfSize, y - halfSize, pointSize, pointSize);
    
    // Alternative methods (commented out):
    
    // Method 2: Draw as circle
    // ctx.beginPath();
    // ctx.arc(x, y, pointSize / 2, 0, Math.PI * 2);
    // ctx.fill();
    
    // Method 3: Draw as single pixel (for very precise rendering)
    // ctx.fillRect(x, y, 1, 1);
  });

  // Return both the canvas and the BMP data
  return {
    canvas,
    bmpBlob: canvasToBMP(canvas),
    previewUrl: canvas.toDataURL('image/png')
  };
};

// Function to convert canvas to BMP file format
const canvasToBMP = (canvas) => {
  const width = canvas.width;
  const height = canvas.height;
  const context = canvas.getContext('2d');
  const imageData = context.getImageData(0, 0, width, height);
  const pixelArray = imageData.data;
  
  // BMP file header (14 bytes)
  const fileHeaderSize = 14;
  // DIB header size (40 bytes for BITMAPINFOHEADER)
  const dibHeaderSize = 40;
  
  // Calculate row size and padding
  // Each row in BMP needs to be multiple of 4 bytes
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const padding = rowSize - (width * 3);
  
  // Calculate file size
  const fileSize = fileHeaderSize + dibHeaderSize + (rowSize * height);
  
  // Create buffer for the BMP file
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  
  // BMP File Header (14 bytes)
  view.setUint8(0, 'B'.charCodeAt(0));  // BM signature
  view.setUint8(1, 'M'.charCodeAt(0));
  view.setUint32(2, fileSize, true);    // File size
  view.setUint32(6, 0, true);           // Reserved
  view.setUint32(10, fileHeaderSize + dibHeaderSize, true); // Pixel data offset
  
  // DIB Header (40 bytes - BITMAPINFOHEADER)
  view.setUint32(14, dibHeaderSize, true); // DIB Header size
  view.setUint32(18, width, true);         // Image width
  view.setInt32(22, -height, true);        // Image height (negative for top-down)
  view.setUint16(26, 1, true);             // Planes (always 1)
  view.setUint16(28, 24, true);            // Bits per pixel (24 for RGB)
  view.setUint32(30, 0, true);             // Compression method (0 = none)
  view.setUint32(34, 0, true);             // Image size (0 for uncompressed)
  view.setUint32(38, 2835, true);          // Horizontal resolution (72 DPI ≈ 2835 pixels/meter)
  view.setUint32(42, 2835, true);          // Vertical resolution
  view.setUint32(46, 0, true);             // Colors in palette (0 = default)
  view.setUint32(50, 0, true);             // Important colors (0 = all)
  
  // Pixel data
  let offset = fileHeaderSize + dibHeaderSize;
  
  // BMP stores pixels bottom-to-top by default, but we're using negative height for top-down
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelOffset = (y * width + x) * 4;
      
      // BMP stores colors as BGR, not RGB
      const blue = pixelArray[pixelOffset];
      const green = pixelArray[pixelOffset + 1];
      const red = pixelArray[pixelOffset + 2];
      
      // Write pixel data
      view.setUint8(offset++, blue);
      view.setUint8(offset++, green);
      view.setUint8(offset++, red);
    }
    
    // Add padding at the end of each row
    offset += padding;
  }
  
  return new Blob([buffer], { type: 'image/bmp' });
};


const BluetoothPage = () => {
  const [status, setStatus] = useState('Not Connected');
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [currentData, setCurrentData] = useState(null);
  const [coordinates, setCoordinates] = useState([]);
  const [dateInfo, setDateInfo] = useState(null);
  const [messageHistory, setMessageHistory] = useState([]);
  const [debugLog, setDebugLog] = useState([]);
  const [canvasPreview, setCanvasPreview] = useState(null);
  const [imageWidth, setImageWidth] = useState(800);
  const [imageHeight, setImageHeight] = useState(600);
  const [bmpData, setBmpData] = useState(null);
  
  // Refs to maintain state between renders
  const dataCharRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const lastValueRef = useRef('');
  const sessionStateRef = useRef('idle'); // idle, collecting, completed
  const canvasRef = useRef(null);

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
    log(`Total coordinates received: ${coordinates.length}`);
    // Force a preview update when we stop collecting
    setTimeout(() => updateCanvasPreview(), 100);
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
    log(`Final coordinates count: ${coordinates.length}`);
    // Generate preview when session is completed
    setTimeout(() => updateCanvasPreview(), 100);
    return;
  }
  
  // Process coordinate data (format: "[counter]:[x],[y]")
  if (sessionStateRef.current === 'collecting' && data.includes(':')) {
    const parts = data.split(':');
    if (parts.length === 2) {
      const coordData = parts[1];
      const [rawX, rawY] = coordData.split(',').map(Number);
      
      if (!isNaN(rawX) && !isNaN(rawY)) {
        // Add debugging info for raw coordinates
        log(`Raw coordinate received: x=${rawX}, y=${rawY}`);
        
        // Use the exact coordinates without scaling
        const x = rawX;
        const y = rawY;
        
        setCoordinates(prev => {
          const newCoords = [...prev, { x, y }];
          
          // Log coordinate info periodically
          if (newCoords.length % 5 === 0) {
            log(`Total coordinates: ${newCoords.length}, Latest: (${x},${y})`);
          }
          
          // If we've collected enough new points, update the preview
          if (newCoords.length % 10 === 0 || newCoords.length === 1) {
            setTimeout(() => updateCanvasPreview(), 50);
          }
          return newCoords;
        });
      } else {
        log(`Invalid coordinate data: ${coordData}`);
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
    log('Polling started (10ms interval)');

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
    }, 1); // Poll every 10ms
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


/// Generate BMP file
const handleGenerateBMP = () => {
  if (coordinates.length === 0) {
    log('No coordinates available to generate BMP');
    return;
  }
  
  try {
    log(`Generating BMP with ${coordinates.length} points using auto-sizing...`);
    updateCanvasPreview(); // Use our shared function
    log(`BMP generated and ready for Vision API: ${bmpData ? bmpData.size : 0} bytes`);
  } catch (err) {
    log(`Error generating BMP: ${err.message}`);
  }
};
  
// Add point size to state
const [pointSize, setPointSize] = useState(3);

// Update canvas preview with point drawing
const updateCanvasPreview = () => {
  if (coordinates.length === 0) {
    log('No coordinates to update preview');
    return;
  }
  
  try {
    log(`Updating preview with ${coordinates.length} points using point drawing (size: ${pointSize}px)`);
    
    // Log some coordinate samples for debugging
    if (coordinates.length > 0) {
      log(`First coordinate: (${coordinates[0].x}, ${coordinates[0].y})`);
      if (coordinates.length > 1) {
        const lastIdx = coordinates.length - 1;
        log(`Last coordinate: (${coordinates[lastIdx].x}, ${coordinates[lastIdx].y})`);
      }
    }
    
    // Get min/max values for logging
    const xs = coordinates.map(coord => coord.x);
    const ys = coordinates.map(coord => coord.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    log(`Coordinate range: X(${minX}-${maxX}), Y(${minY}-${maxY})`);
    
    // Use auto-sizing with padding of 20px and specified point size
    const padding = 20;
    const result = createBMPFile(coordinates, padding, pointSize);
    
    // Update state with the new canvas info
    setCanvasPreview(result.previewUrl);
    setBmpData(result.bmpBlob);
    
    // Update the width/height state to match what was actually used
    setImageWidth(result.canvas.width);
    setImageHeight(result.canvas.height);
    
    log(`Canvas preview updated with auto-sized dimensions: ${result.canvas.width}x${result.canvas.height}`);
  } catch (err) {
    log(`Error updating canvas preview: ${err.message}`);
    console.error("Preview update error:", err);
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
          onClick={handleGenerateBMP}
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
          Generate BMP
        </button>
      </div>

{/* Image Settings Display with Point Size Control */}
<div style={{ 
  marginBottom: '20px',
  padding: '15px',
  backgroundColor: '#f0f0f0',
  borderRadius: '8px',
  maxWidth: '500px'
}}>
  <h3 style={{ marginTop: 0 }}>BMP Settings (Auto-sized)</h3>
  <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
    <div>
      <label style={{ display: 'block', marginBottom: '5px' }}>Current Width:</label>
      <span style={{ padding: '5px', fontWeight: 'bold' }}>{imageWidth}px</span>
    </div>
    <div>
      <label style={{ display: 'block', marginBottom: '5px' }}>Current Height:</label>
      <span style={{ padding: '5px', fontWeight: 'bold' }}>{imageHeight}px</span>
    </div>
    <div>
      <label style={{ display: 'block', marginBottom: '5px' }}>Point Size:</label>
      <input 
        type="number" 
        value={pointSize} 
        onChange={(e) => setPointSize(Math.max(1, Number(e.target.value)))}
        min="1"
        max="10"
        style={{ padding: '5px', width: '60px' }}
      />
    </div>
    <button 
      onClick={updateCanvasPreview}
      disabled={coordinates.length === 0}
      style={{ 
        padding: '8px 16px',
        backgroundColor: '#607D8B',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: coordinates.length === 0 ? 'default' : 'pointer'
      }}
    >
      Update Preview
    </button>
  </div>
  <p style={{ marginTop: '10px', fontSize: '0.9em', color: '#666' }}>
    The BMP dimensions are automatically calculated based on the coordinate range. 
    Each coordinate is drawn as a {pointSize}×{pointSize} pixel point.
  </p>
</div>

      {/* Data Display Section */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
        {/* Left Column - Status and Data */}
        <div style={{ flex: '1 1 400px' }}>
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
              {/* Current Info Panel */}
              <div style={{ 
                flex: '1 1 300px',  
                padding: '15px',
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                marginBottom: '15px'
              }}>
                <h3>Current Data</h3>
                <p><strong>Last Message:</strong> {currentData || 'None'}</p>
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
                  {messageHistory.length > 0 ? (
                    messageHistory.map((entry, idx) => (
                      <li key={idx} style={{ marginBottom: '5px' }}>{entry}</li>
                    ))
                  ) : (
                    <li>No messages received</li>
                  )}
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
                {debugLog.length > 0 ? 
                  debugLog.map((line, i) => <div key={i}>{line}</div>) : 
                  "No debug logs yet"}
              </pre>
            </div>
          </div>
        </div>

        {/* Right Column - Canvas Preview and BMP Data */}
        <div style={{ 
          flex: '1 1 300px', 
          padding: '15px',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          marginBottom: '15px'
        }}>
          <h3>Preview Image</h3>
          {canvasPreview ? (
            <div style={{ border: '1px solid #ddd', background: '#fff', padding: '5px' }}>
              <img 
                src={canvasPreview} 
                alt="Drawing Preview" 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '400px',
                  display: 'block'
                }} 
              />
            </div>
          ) : (
            <div style={{ 
              border: '1px solid #ddd', 
              background: '#fff', 
              padding: '20px',
              textAlign: 'center',
              color: '#999'
            }}>
              {coordinates.length > 0 ? 
                "Preview loading..." : 
                "No coordinates available to display preview"}
            </div>
          )}
          <p style={{ fontSize: '0.9em', color: '#666', marginTop: '10px' }}>
            {canvasPreview ? 
              `Preview of the BMP image (${imageWidth}×${imageHeight} pixels).
              ${bmpData ? `The BMP data is ${Math.round(bmpData.size / 1024)} KB.` : ''}` :
              "Generate a preview by adding coordinates and clicking 'Update Preview'"
            }
          </p>
          
          {/* Add button to use with Google Vision - you'd integrate this with your API code */}
          {bmpData && (
            <button
              onClick={() => log('BMP data ready for Vision API')}
              style={{ 
                padding: '8px 16px',
                backgroundColor: '#FF5722',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                marginTop: '10px',
                cursor: 'pointer'
              }}
            >
              Send to Vision API
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BluetoothPage;