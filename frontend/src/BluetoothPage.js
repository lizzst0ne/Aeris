import React, { useState, useEffect, useRef } from 'react';

// Google Vision API key - replace with your actual API key
const GOOGLE_VISION_API_KEY = 'AIzaSyDTKpqKc0TMHZlxtRhBW6SvMNGqTCU1_ss';

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
  
  // Draw each coordinate as a point (small circle)
  coordinates.forEach(coord => {
    // Adjust coordinates relative to minX, minY + padding
    const x = coord.x - minX + padding;
    const y = coord.y - minY + padding;
    
    // Draw as circle
    ctx.beginPath();
    ctx.arc(x, y, pointSize / 2, 0, Math.PI * 2);
    ctx.fill();
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
  const [pointSize, setPointSize] = useState(3);
  const [receivedPoints, setReceivedPoints] = useState(0);
  const [receivedTime, setReceivedTime] = useState(0);
  const [pointsRate, setPointsRate] = useState(0);
  
  // New states for Vision API
  const [apiKey, setApiKey] = useState(GOOGLE_VISION_API_KEY || '');
  const [visionApiStatus, setVisionApiStatus] = useState('Not sent');
  const [visionApiResults, setVisionApiResults] = useState(null);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [isSubmittingToVision, setIsSubmittingToVision] = useState(false);
  
  // Refs to maintain state between renders
  const dataCharRef = useRef(null);
  const characteristicRef = useRef(null);
  const lastValueRef = useRef('');
  const sessionStateRef = useRef('idle'); // idle, collecting, completed
  const startTimeRef = useRef(0);
  const lastRateUpdateRef = useRef(0);

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
    characteristicRef.current = null;
    setCurrentData(null);
    sessionStateRef.current = 'idle';
    
    // Remove notification listener if it exists
    if (characteristicRef.current) {
      try {
        characteristicRef.current.removeEventListener('characteristicvaluechanged', handleNotification);
      } catch (err) {
        log(`Error removing notification listener: ${err.message}`);
      }
    }
    
    log('Device disconnected');
  };

  // Function to handle incoming notifications
  const handleNotification = (event) => {
    const value = event.target.value;
    handleDataReceived(value);
    
    // Calculate and display points per second every 2 seconds
    const now = Date.now();
    if (now - lastRateUpdateRef.current > 2000) {
      const elapsedTime = (now - startTimeRef.current) / 1000; // convert to seconds
      if (elapsedTime > 0) {
        const rate = receivedPoints / elapsedTime;
        setPointsRate(rate.toFixed(1));
        setReceivedTime(elapsedTime.toFixed(1));
      }
      lastRateUpdateRef.current = now;
    }
  };

// Process received data based on message format
const processData = (data) => {
  // Check for control messages (START, STOP, END)
  if (data.includes('START-')) {
    sessionStateRef.current = 'collecting';
    log(`New data collection session started: ${data}`);
    setCoordinates([]);
    startTimeRef.current = Date.now();
    setReceivedPoints(0);
    return;
  }
  
  if (data.includes('STOP-')) {
    sessionStateRef.current = 'waiting_for_date';
    log(`Data collection stopped: ${data}`);
    log(`Total coordinates received: ${coordinates.length}`);
    // Generate preview immediately when we stop collecting
    updateCanvasPreview();
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
    // Update the preview one more time at the end
    updateCanvasPreview();
    return;
  }
  
  // Process coordinate data (format: "C:[x],[y]")
  if (sessionStateRef.current === 'collecting' && data.includes(':')) {
    // Check if this is a coordinate message (C: prefix)
    if (data.startsWith('C:')) {
      const coordData = data.substring(2); // Remove "C:" prefix
      const [rawX, rawY] = coordData.split(',').map(Number);
      
      if (!isNaN(rawX) && !isNaN(rawY)) {
        // Increment received points counter
        setReceivedPoints(prev => prev + 1);
        
        // Use the exact coordinates without scaling
        const x = rawX;
        const y = rawY;
        
        setCoordinates(prev => {
          const newCoords = [...prev, { x, y }];
          
          // Log coordinate info periodically
          if (newCoords.length % 20 === 0) {
            log(`Total coordinates: ${newCoords.length}, Latest: (${x},${y})`);
          }
          
          return newCoords;
        });
      } else {
        log(`Invalid coordinate data: ${coordData}`);
      }
    }
    // Other message types with ":" that aren't coordinates or known commands
    else if (!data.startsWith('START-') && !data.startsWith('STOP-') && 
             !data.startsWith('DATE-') && !data.startsWith('END-')) {
      log(`Unknown data format received: ${data}`);
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
        
        // Only log non-coordinate messages to avoid flooding the console
        if (!trimmed.startsWith('C:')) {
          log(`Data received: ${trimmed}`);
        }
      }
    } catch (err) {
      log(`Error decoding value: ${err.message}`);
    }
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
      
      // Save the characteristic reference
      characteristicRef.current = characteristic;

      // Try to use notifications (will work on Android)
      try {
        log('Trying to start notifications...');
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', handleNotification);
        log('Notifications started successfully! You should see better performance.');
        setStatus('Connected - Using Notifications');
      } catch (error) {
        // If notifications fail, provide feedback but continue
        log(`Notifications not supported: ${error.message}`);
        log('Falling back to polling approach...');
        
        // Note: We don't implement polling here because notifications should work on Android
        // In a real app, you'd add a polling fallback here
        setStatus('Connected - Notifications Failed');
      }

      // Listen for disconnection events
      device.addEventListener('gattserverdisconnected', handleDisconnection);
      
      // Initialize the time tracking for points per second calculation
      startTimeRef.current = Date.now();
      lastRateUpdateRef.current = Date.now();
      setReceivedPoints(0);
      
    } catch (err) {
      log(`Connection failed: ${err.message}`);
      setStatus(`Connection failed: ${err.message}`);
    }
  };
  
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

  // Function to convert blob to base64
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Get the base64 part after the comma: data:image/bmp;base64,BASE64_DATA
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Send image to Google Vision API for text recognition
  const sendToVisionAPI = async () => {
    if (!bmpData) {
      log('No BMP data available to send to Vision API');
      return;
    }

    if (!apiKey) {
      setShowApiKeyInput(true);
      log('API key required to use Vision API');
      return;
    }

    try {
      setVisionApiStatus('Sending to Vision API...');
      setIsSubmittingToVision(true);
      log('Preparing image data for Vision API...');

      // Convert BMP blob to base64
      const base64Image = await blobToBase64(bmpData);
      log(`Image converted to base64 (${Math.floor(base64Image.length / 1024)}KB)`);

      // Prepare the request
      const visionRequest = {
        requests: [
          {
            image: {
              content: base64Image
            },
            features: [
              {
                type: 'TEXT_DETECTION',
                maxResults: 10
              },
              {
                type: 'DOCUMENT_TEXT_DETECTION',
                maxResults: 10
              }
            ]
          }
        ]
      };

      log('Sending request to Vision API...');
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(visionRequest)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      log('Response received from Vision API');

      // Process and display results
      setVisionApiResults(data);
      setVisionApiStatus('Results received');
      
      // Extract the detected text for easy display
      const detectedText = data.responses[0]?.fullTextAnnotation?.text || 
                          'No text detected';
      
      log(`Detected text: ${detectedText.substring(0, 100)}${detectedText.length > 100 ? '...' : ''}`);
      
    } catch (err) {
      log(`Vision API Error: ${err.message}`);
      setVisionApiStatus(`Error: ${err.message}`);
    } finally {
      setIsSubmittingToVision(false);
    }
  };

  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      // Remove notification listener if it exists
      if (characteristicRef.current) {
        try {
          characteristicRef.current.removeEventListener('characteristicvaluechanged', handleNotification);
        } catch (err) {
          console.error('Error removing notification listener:', err);
        }
      }
      
      if (connectedDevice && connectedDevice.gatt.connected) {
        connectedDevice.gatt.disconnect();
      }
    };
  }, [connectedDevice]);

  // Display formatted Vision API results
  const renderVisionResults = () => {
    if (!visionApiResults) return null;
    
    const textAnnotations = visionApiResults.responses[0]?.textAnnotations || [];
    const fullText = visionApiResults.responses[0]?.fullTextAnnotation?.text;
    
    return (
      <div style={{ marginTop: '20px' }}>
        <h3>Vision API Results</h3>
        
        {fullText ? (
          <div style={{ 
            border: '1px solid #ddd',
            padding: '10px',
            backgroundColor: '#fff',
            borderRadius: '4px',
            marginBottom: '10px'
          }}>
            <h4>Detected Text:</h4>
            <pre style={{ 
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>{fullText}</pre>
          </div>
        ) : (
          <p>No text detected in the image</p>
        )}
        
        {textAnnotations.length > 0 && (
          <div>
            <h4>Text Elements ({textAnnotations.length - 1}):</h4>
            <ul style={{ 
              maxHeight: '200px', 
              overflowY: 'auto',
              padding: '0 0 0 20px'
            }}>
              {textAnnotations.slice(1).map((item, idx) => (
                <li key={idx}>"{item.description}" (Confidence: {(item.score * 100 || 0).toFixed(2)}%)</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // Render the UI
  return (
    <div style={{ padding: '20px' }}>
      <h2>Bluetooth Calendar with Vision API</h2>
      <p><strong>Status:</strong> {status}</p>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
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
          onClick={() => setShowApiKeyInput(!showApiKeyInput)}
          style={{ 
            padding: '8px 16px',
            backgroundColor: '#FF9800',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {showApiKeyInput ? 'Hide API Key Input' : 'Set Vision API Key'}
        </button>
        
        <button 
          onClick={sendToVisionAPI}
          disabled={!bmpData || !apiKey || isSubmittingToVision}
          style={{ 
            padding: '8px 16px',
            backgroundColor: (!bmpData || !apiKey || isSubmittingToVision) ? '#cccccc' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: (!bmpData || !apiKey || isSubmittingToVision) ? 'default' : 'pointer'
          }}
        >
          {isSubmittingToVision ? 'Sending to Vision API...' : 'Send to Vision API'}
        </button>
      </div>
      
      {/* Performance Metrics */}
      {connectedDevice && (
        <div style={{ 
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#e8f5e9',
          borderRadius: '8px'
        }}>
          <h3 style={{ marginTop: 0 }}>Performance Metrics</h3>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div>
              <strong>Points Received:</strong> {receivedPoints}
            </div>
            <div>
              <strong>Time Elapsed:</strong> {receivedTime}s
            </div>
            <div>
              <strong>Points per Second:</strong> {pointsRate}
            </div>
          </div>
        </div>
      )}
      
      {/* API Key Input Section */}
      {showApiKeyInput && (
        <div style={{ 
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#f0f0f0',
          borderRadius: '8px',
          maxWidth: '500px'
        }}>
          <h3 style={{ marginTop: 0 }}>Google Vision API Key</h3>
          <input 
            type="text" 
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your Google Vision API Key"
            style={{ 
              width: '100%',
              padding: '8px',
              marginBottom: '10px',
              borderRadius: '4px',
              border: '1px solid #ddd'
            }}
          />
          <p style={{ fontSize: '0.8rem', color: '#555' }}>
            Your API key is stored only in this browser session and is not saved permanently.
          </p>
        </div>
      )}

      {/* Vision API Status */}
      {apiKey && (
        <div style={{ 
          marginBottom: '20px',
          padding: '10px',
          backgroundColor: visionApiStatus.includes('Error') ? '#ffebee' : '#e3f2fd',
          borderRadius: '4px',
          maxWidth: '500px'
        }}>
          <strong>Vision API Status:</strong> {visionApiStatus}
        </div>
      )}

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
          
          {/* Vision API Results */}
          {renderVisionResults()}
        </div>
      </div>
      
      {/* Debug Log Section */}
      <div style={{ marginTop: '30px' }}>
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
  );
};

export default BluetoothPage;