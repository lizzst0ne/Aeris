import React, { useState, useEffect, useRef, useCallback } from 'react';

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

// Improved BMP generation functions with point drawing and bug fixes
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
  
  // Calculate width and height with padding - ensure minimum dimensions
  const width = Math.max(200, (maxX - minX) + 1 + (2 * padding));
  const height = Math.max(150, (maxY - minY) + 1 + (2 * padding));
  
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
  
  // Create a map to track which pixels have been drawn to avoid duplicates
  // This helps prevent overdrawing which can cause those weird lines
  const drawnPixels = new Set();
  
  // Draw each coordinate as a point (small circle)
  coordinates.forEach(coord => {
    // Adjust coordinates relative to minX, minY + padding
    const x = Math.round(coord.x - minX + padding);
    const y = Math.round(coord.y - minY + padding);
    
    // Create a unique key for this pixel
    const pixelKey = `${x},${y}`;
    
    // Only draw if we haven't drawn this pixel before
    if (!drawnPixels.has(pixelKey)) {
      drawnPixels.add(pixelKey);
      
      // Draw as circle
      ctx.beginPath();
      ctx.arc(x, y, pointSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Return both the canvas and the BMP data
  return {
    canvas,
    bmpBlob: canvasToBMP(canvas),
    previewUrl: canvas.toDataURL('image/png')
  };
};

// Function to convert canvas to BMP file format with proper alignment
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
  
  // Calculate row size with proper padding to avoid alignment issues
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
  view.setUint16(6, 0, true);           // Reserved
  view.setUint16(8, 0, true);           // Reserved
  view.setUint32(10, fileHeaderSize + dibHeaderSize, true); // Pixel data offset
  
  // DIB Header (40 bytes - BITMAPINFOHEADER)
  view.setUint32(14, dibHeaderSize, true); // DIB Header size
  view.setInt32(18, width, true);         // Image width
  view.setInt32(22, -height, true);        // Image height (negative for top-down)
  view.setUint16(26, 1, true);             // Planes (always 1)
  view.setUint16(28, 24, true);            // Bits per pixel (24 for RGB)
  view.setUint32(30, 0, true);             // Compression method (0 = none)
  view.setUint32(34, 0, true);             // Image size (0 for uncompressed)
  view.setInt32(38, 2835, true);          // Horizontal resolution (72 DPI ≈ 2835 pixels/meter)
  view.setInt32(42, 2835, true);          // Vertical resolution
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
    
    // Add padding at the end of each row (crucial for proper BMP format)
    for (let p = 0; p < padding; p++) {
      view.setUint8(offset++, 0);
    }
  }
  
  return new Blob([buffer], { type: 'image/bmp' });
};

// Debounce function for limiting frequent calls
const debounce = (func, wait) => {
  let timeout;
  return function(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const BluetoothPage = () => {
  // State variables for Bluetooth connection
  const [status, setStatus] = useState('Not Connected');
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [currentData, setCurrentData] = useState(null);
  
  // State variables for data collection
  const [coordinates, setCoordinates] = useState([]);
  const [rawDataBuffer, setRawDataBuffer] = useState([]);
  const [dateInfo, setDateInfo] = useState(null);
  const [messageHistory, setMessageHistory] = useState([]);
  const [debugLog, setDebugLog] = useState([]);
  
  // State variables for canvas and bitmap
  const [canvasPreview, setCanvasPreview] = useState(null);
  const [imageWidth, setImageWidth] = useState(800);
  const [imageHeight, setImageHeight] = useState(600);
  const [bmpData, setBmpData] = useState(null);
  const [pointSize, setPointSize] = useState(3);
  
  // States for Vision API
  const [visionApiStatus, setVisionApiStatus] = useState('Not sent');
  const [visionApiResults, setVisionApiResults] = useState(null);
  const [isSubmittingToVision, setIsSubmittingToVision] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Refs to maintain state between renders
  const dataCharRef = useRef(null);
  const lastValueRef = useRef('');
  const sessionStateRef = useRef('idle'); // idle, collecting, waiting_for_date, has_date, completed
  const logPendingRef = useRef([]);
  const logTimeoutRef = useRef(null);
  const dataPointCountRef = useRef(0);
  
  // Throttled log function to reduce UI updates
  const log = useCallback((msg) => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `${timestamp} - ${msg}`;
    
    // Always log to console
    console.log('[Bluetooth]', msg);
    
    // Queue log entry
    logPendingRef.current.push(entry);
    
    // If no timeout is set, schedule an update
    if (!logTimeoutRef.current) {
      logTimeoutRef.current = setTimeout(() => {
        setDebugLog(prevLog => {
          const newLog = [...logPendingRef.current, ...prevLog].slice(0, 20);
          logPendingRef.current = [];
          logTimeoutRef.current = null;
          return newLog;
        });
      }, 250); // Update every 250ms max
    }
  }, []);
  
  // Process all buffered raw data at once
  const processBufferedData = useCallback(async () => {
    if (rawDataBuffer.length === 0) {
      log('No data in buffer to process');
      return false;
    }
    
    log(`Starting to process ${rawDataBuffer.length} buffered data points...`);
    setIsProcessing(true);
    
    // Create a new array for processed coordinates
    const newCoordinates = [];
    let processedCount = 0;
    
    // Process in smaller batches to avoid UI freezing
    const batchSize = 1000;
    const totalBatches = Math.ceil(rawDataBuffer.length / batchSize);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * batchSize;
      const endIdx = Math.min(startIdx + batchSize, rawDataBuffer.length);
      const batch = rawDataBuffer.slice(startIdx, endIdx);
      
      // Process each item in the current batch
      for (const data of batch) {
        if (data.includes(':')) {
          const parts = data.split(':');
          if (parts.length === 2) {
            const coordData = parts[1];
            const [rawX, rawY] = coordData.split(',').map(Number);
            
            if (!isNaN(rawX) && !isNaN(rawY)) {
              newCoordinates.push({ x: rawX, y: rawY });
              processedCount++;
            }
          }
        }
      }
      
      // Small delay between batches to allow UI to update
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
        log(`Processed batch ${batchIndex + 1}/${totalBatches}...`);
      }
    }
    
    log(`Processed ${processedCount} valid coordinates out of ${rawDataBuffer.length} data points`);
    
    // Update state with processed coordinates
    setCoordinates(newCoordinates);
    
    // Clear the buffer to free memory
    setRawDataBuffer([]);
    setIsProcessing(false);
    
    return true;
  }, [rawDataBuffer, log]);
  
  // Process received data based on message format
  const processData = useCallback((data) => {
    // Check for control messages (START, STOP, END)
    if (data.includes('START-')) {
      sessionStateRef.current = 'collecting';
      dataPointCountRef.current = 0;
      log(`New data collection session started: ${data}`);
      
      // Clear previous data and buffer
      setCoordinates([]);
      setRawDataBuffer([]);
      setCanvasPreview(null);
      setBmpData(null);
      return;
    }
    
    if (data.includes('STOP-')) {
      sessionStateRef.current = 'waiting_for_date';
      const totalPoints = dataPointCountRef.current;
      log(`Data collection stopped: ${data}`);
      log(`Total data points received: ${totalPoints}`);
      
      // Process all buffered data
      processBufferedData().then(() => {
        log('Buffered data processing complete');
        // Update canvas after processing is done
        setTimeout(() => updateCanvasPreview(), 100);
      });
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
      log(`Final data points count: ${dataPointCountRef.current}`);
      
      // Final canvas update
      setTimeout(() => updateCanvasPreview(), 100);
      return;
    }
    
    // Process coordinate data during collection phase
    if (sessionStateRef.current === 'collecting' && data.includes(':')) {
      // Just store raw data in buffer without processing
      setRawDataBuffer(prev => [...prev, data]);
      dataPointCountRef.current++;
      
      // Log collection progress occasionally
      if (dataPointCountRef.current % 100 === 0) {
        log(`Collected ${dataPointCountRef.current} data points so far`);
      }
    }
  }, [log, processBufferedData]);
  
  // Update canvas preview with point drawing
  const updateCanvasPreview = useCallback(() => {
    if (coordinates.length === 0) {
      log('No coordinates available to update preview');
      return;
    }
    
    if (isProcessing) {
      log('Skipping preview update - processing in progress');
      return;
    }
    
    try {
      log(`Updating preview with ${coordinates.length} points using point size: ${pointSize}px`);
      
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
  }, [coordinates, pointSize, isProcessing, log]);
  
  // Debounced version of updateCanvasPreview to prevent too many updates
  const debouncedUpdateCanvas = useCallback(
    debounce(() => updateCanvasPreview(), 300),
    [updateCanvasPreview]
  );
  
  // Handle data received from the BLE characteristic
  const handleDataReceived = useCallback((event) => {
    try {
      const value = event.target.value;
      const textDecoder = new TextDecoder('utf-8');
      const raw = textDecoder.decode(value);
      const trimmed = raw.trim();

      // Only process new values (different from the last one)
      if (trimmed && trimmed !== lastValueRef.current) {
        lastValueRef.current = trimmed;
        setCurrentData(trimmed);
        
        // Only update UI history for control messages during collection to save resources
        if (sessionStateRef.current !== 'collecting' || 
            trimmed.includes('START-') || 
            trimmed.includes('STOP-') ||
            trimmed.includes('DATE-') ||
            trimmed.includes('END-')) {
          setMessageHistory(prev => [`Received: ${trimmed}`, ...prev.slice(0, 19)]);
        }
        
        // Process the message
        processData(trimmed);
      }
    } catch (err) {
      log(`Error decoding value: ${err.message}`);
    }
  }, [log, processData]);
  
  // Function to convert blob to base64
  const blobToBase64 = useCallback((blob) => {
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
  }, []);
  
  // Set up notifications for the characteristic
  const setupNotifications = useCallback(async (characteristic) => {
    dataCharRef.current = characteristic;
    log('Starting notifications for data characteristic');

    try {
      // Add event listener for notifications
      characteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
      
      // Start notifications
      await characteristic.startNotifications();
      log('Notifications started successfully');
    } catch (err) {
      log(`Error setting up notifications: ${err.message}`);
      setStatus(`Notification setup failed: ${err.message}`);
    }
  }, [handleDataReceived, log]);
  
  // Handle disconnection of device
  const handleDisconnection = useCallback(() => {
    setStatus('Disconnected');
    setConnectedDevice(null);
    dataCharRef.current = null;
    setCurrentData(null);
    sessionStateRef.current = 'idle';
    
    log('Device disconnected');
  }, [log]);
  
  // Connect to the Adafruit device
  const connectToDevice = useCallback(async () => {
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

      // Set up notifications instead of polling
      await setupNotifications(characteristic);
      setStatus('Connected - Listening for Notifications');

      // Listen for disconnection events
      device.addEventListener('gattserverdisconnected', handleDisconnection);
    } catch (err) {
      log(`Connection failed: ${err.message}`);
      setStatus(`Connection failed: ${err.message}`);
    }
  }, [log, setupNotifications, handleDisconnection]);
  
  // Send image to Google Vision API for text recognition
  const sendToVisionAPI = useCallback(async () => {
    if (!bmpData) {
      log('No BMP data available to send to Vision API');
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
        `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
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
  }, [bmpData, blobToBase64, log]);
  
  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      // Clear any pending timeouts
      if (logTimeoutRef.current) {
        clearTimeout(logTimeoutRef.current);
      }
      
      // Clean up notification listener if characteristic exists
      if (dataCharRef.current) {
        try {
          dataCharRef.current.removeEventListener('characteristicvaluechanged', handleDataReceived);
          dataCharRef.current.stopNotifications().catch(err => {
            console.error("Error stopping notifications:", err);
          });
        } catch (err) {
          console.error("Cleanup error:", err);
        }
      }
      
      // Disconnect device if connected
      if (connectedDevice && connectedDevice.gatt.connected) {
        connectedDevice.gatt.disconnect();
      }
    };
  }, [connectedDevice, handleDataReceived]);
  
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
  
  // Status indicator component
  const StatusIndicator = ({ status, isProcessing, isSubmittingToVision }) => {
    let statusColor = '#e3f2fd'; // Default light blue
    let statusText = status;
    
    if (status.includes('Not Connected')) {
      statusColor = '#fff3e0'; // Light orange
    } else if (status.includes('Connected')) {
      statusColor = '#e8f5e9'; // Light green
    }
    
    if (isProcessing) {
      statusText = 'Processing data...';
      statusColor = '#fff8e1'; // Light yellow
    } else if (isSubmittingToVision) {
      statusText = 'Submitting to Vision API...';
      statusColor = '#e0f7fa'; // Light cyan
    }
    
    return (
      <div style={{ 
        marginBottom: '20px',
        padding: '10px',
        backgroundColor: statusColor,
        borderRadius: '4px',
        maxWidth: '500px',
        display: 'flex',
        alignItems: 'center'
      }}>
        <div style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: isProcessing || isSubmittingToVision ? '#ff9800' : 
                           status.includes('Connected') ? '#4caf50' : '#f44336',
          marginRight: '10px'
        }}></div>
        <strong>Status:</strong> {statusText}
      </div>
    );
  };

  // Render the UI
  return (
    <div style={{ padding: '20px' }}>
      <h2>Bluetooth Calendar with Vision API</h2>
      
      <StatusIndicator 
        status={status} 
        isProcessing={isProcessing} 
        isSubmittingToVision={isSubmittingToVision} 
      />
      
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
          onClick={sendToVisionAPI}
          disabled={!bmpData || isSubmittingToVision || isProcessing}
          style={{ 
            padding: '8px 16px',
            backgroundColor: (!bmpData || isSubmittingToVision || isProcessing) ? '#cccccc' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: (!bmpData || isSubmittingToVision || isProcessing) ? 'default' : 'pointer'
          }}
        >
          {isSubmittingToVision ? 'Sending to Vision API...' : 'Send to Vision API'}
        </button>
        
        <button 
          onClick={updateCanvasPreview}
          disabled={coordinates.length === 0 || isProcessing}
          style={{ 
            padding: '8px 16px',
            backgroundColor: (coordinates.length === 0 || isProcessing) ? '#cccccc' : '#607D8B',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: (coordinates.length === 0 || isProcessing) ? 'default' : 'pointer'
          }}
        >
          Update Preview
        </button>
      </div>
      
      {/* Vision API Status */}
      {visionApiStatus !== 'Not sent' && (
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
              disabled={isProcessing}
            />
          </div>
        </div>
      </div>

      {/* Data Collection Stats */}
      <div style={{ 
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: isProcessing ? '#fff8e1' : '#f5f5f5',
        borderRadius: '8px',
        maxWidth: '500px'
      }}>
        <h3 style={{ marginTop: 0 }}>Data Collection Stats</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <strong>Session State:</strong> {sessionStateRef.current}
          </div>
          <div>
            <strong>Date Info:</strong> {dateInfo || 'Not set'}
          </div>
          <div>
            <strong>Coordinates:</strong> {formatCoordinateData(coordinates)}
          </div>
          <div>
            <strong>Buffered Data:</strong> {rawDataBuffer.length} points
          </div>
          {isProcessing && (
            <div style={{ width: '100%', marginTop: '10px' }}>
              <div style={{ 
                width: '100%', 
                height: '6px', 
                backgroundColor: '#e0e0e0',
                borderRadius: '3px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${Math.min(100, (coordinates.length / Math.max(1, rawDataBuffer.length)) * 100)}%`,
                  height: '100%',
                  backgroundColor: '#ff9800',
                  transition: 'width 0.3s'
                }}></div>
              </div>
              <div style={{ fontSize: '12px', marginTop: '5px', textAlign: 'center' }}>
                Processing data... {coordinates.length} of {Math.max(1, rawDataBuffer.length)} points
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Rows */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
        {/* Left Column - Image Preview */}
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
              color: '#999',
              height: '200px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {isProcessing ? (
                "Processing data before preview..."
              ) : (
                coordinates.length > 0 ? 
                "Preview loading..." : 
                "No coordinates available to display preview"
              )}
            </div>
          )}
          
          {/* Vision API Results */}
          {renderVisionResults()}
        </div>

        {/* Right Column - Status and Debug */}
        <div style={{ flex: '1 1 300px' }}>
          {/* Message History Panel */}
          <div style={{ 
            padding: '15px',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            marginBottom: '15px'
          }}>
            <h3>Last Message</h3>
            <div style={{ 
              border: '1px solid #ddd',
              padding: '10px',
              background: '#fff',
              borderRadius: '4px',
              color: sessionStateRef.current === 'collecting' ? '#757575' : '#212121',
              fontFamily: 'monospace'
            }}>
              {currentData || 'No data received yet'}
            </div>
            
            <h4 style={{ marginTop: '15px', marginBottom: '5px' }}>Recent Messages</h4>
            <div style={{
              maxHeight: '150px',
              overflowY: 'auto',
              border: '1px solid #ddd',
              background: '#fff',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'monospace'
            }}>
              {messageHistory.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: '5px', margin: 0 }}>
                  {messageHistory.map((msg, i) => (
                    <li key={i} style={{ padding: '2px 5px' }}>
                      {msg}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ padding: '10px', color: '#757575', textAlign: 'center' }}>
                  No messages yet
                </div>
              )}
            </div>
          </div>
          
          {/* Debug Console */}
          <div style={{ 
            padding: '15px',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
          }}>
            <h3>Debug Console</h3>
            <pre style={{ 
              background: '#263238', 
              color: '#eceff1',
              padding: '10px', 
              height: '200px', 
              overflowY: 'scroll',
              fontFamily: 'monospace',
              borderRadius: '4px',
              fontSize: '12px',
              margin: 0
            }}>
              {debugLog.length > 0 ? 
                debugLog.map((line, i) => <div key={i}>{line}</div>) : 
                "No debug logs yet"}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BluetoothPage;