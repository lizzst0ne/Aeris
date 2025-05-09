import React, { useState, useEffect, useRef } from 'react';
import { 
  verifyToken, 
  createCalendarEvent, 
  getAccessToken, 
  startGoogleAuthFlow,
  createEventFromDetectedText,
  parseTextToEventDetails
} from './calendar-service';



// Google Vision API key - replace with your actual API key
const GOOGLE_VISION_API_KEY = 'AIzaSyDTKpqKc0TMHZlxtRhBW6SvMNGqTCU1_ss';

// Match UUIDs with the Adafruit device
const CALENDAR_SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const CALENDAR_DATA_CHAR_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';

//point size of the drawing
const POINT_SIZE = 3;

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
    
    //Draw as circle
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
  // States for Vision API
  const [visionApiStatus, setVisionApiStatus] = useState('Not sent');
  const [visionApiResults, setVisionApiResults] = useState(null);
  const [isSubmittingToVision, setIsSubmittingToVision] = useState(false);
  
  // States for Calendar integration
  const [detectedText, setDetectedText] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [eventDetails, setEventDetails] = useState(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState('Not created');
  const [createdEvent, setCreatedEvent] = useState(null);
  const [eventCreationError, setEventCreationError] = useState(null);
  const [showEventConfirmation, setShowEventConfirmation] = useState(false);
  const [autoCreateEvent, setAutoCreateEvent] = useState(true); // New state for auto-creation toggle
  
  // Refs to maintain state between renders
  const dataCharRef = useRef(null);
  const lastValueRef = useRef('');
  const sessionStateRef = useRef('idle'); // idle, collecting, completed
  const canvasRef = useRef(null);
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
    
    log('Device disconnected');
  };

  // Process data received from the BLE device
  const processData = (data) => {
    // Check for control messages (START, STOP, END)
    if (data.includes('START-')) {
      sessionStateRef.current = 'collecting';
      log(`New data collection session started: ${data}`);
      // Clear both the state and the ref
      coordinatesRef.current = [];
      setCoordinates([]);
      return;
    }
    
    if (data.includes('STOP-')) {
      sessionStateRef.current = 'waiting_for_date';
      log(`Data collection stopped: ${data}`);
      log(`Total coordinates received: ${coordinatesRef.current.length}`);
      
      // Directly update the preview using the coordinates from the ref
      if (coordinatesRef.current.length > 0) {
        log(`Forcing preview update with ${coordinatesRef.current.length} points`);
        updateCanvasPreview(coordinatesRef.current);
      } else {
        log('No coordinates available to display preview');
      }
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
      log(`Final coordinates count: ${coordinatesRef.current.length}`);
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
          
          // Update both the ref and the state
          const newCoord = { x, y };
          coordinatesRef.current = [...coordinatesRef.current, newCoord];
          
          setCoordinates(prev => {
            const newCoords = [...prev, newCoord];
            return newCoords;
          });
        } else {
          log(`Invalid coordinate data: ${coordData}`);
        }
      }
    }
  };

  // Handle data received from the BLE characteristic
  const handleDataReceived = (event) => {
    try {
      const value = event.target.value;
      const textDecoder = new TextDecoder('utf-8');
      const raw = textDecoder.decode(value);
      const trimmed = raw.trim();
  
      // Only process new values (different from the last one)
      if (trimmed && trimmed !== lastValueRef.current) {
        lastValueRef.current = trimmed;
        setCurrentData(trimmed);
        
        // Only update message history for control messages, not coordinates
        if (!trimmed.includes(':') || !sessionStateRef.current === 'collecting') {
          setMessageHistory((prev) => [`Received: ${trimmed}`, ...prev.slice(0, 19)]);
        }
        
        // Process the message based on its format
        processData(trimmed);
      }
    } catch (err) {
      log(`Error decoding value: ${err.message}`);
    }
  };

  // Set up notifications for the characteristic
  const setupNotifications = async (characteristic) => {
    dataCharRef.current = characteristic;
    log('Starting notifications for data characteristic');
  
    try {
      // Add event listener for notifications
      characteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
      
      // Request a faster connection interval if the device supports it
      if (connectedDevice && connectedDevice.gatt) {
        // This is optional and might not be supported by all devices
        try {
          await connectedDevice.gatt.requestConnectionPriorityChange('high');
          log('Requested high priority connection');
        } catch (e) {
          log('Connection priority change not supported or failed');
        }
      }
      
      // Start notifications
      await characteristic.startNotifications();
      log('Notifications started successfully');
    } catch (err) {
      log(`Error setting up notifications: ${err.message}`);
      setStatus(`Notification setup failed: ${err.message}`);
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

      // Set up notifications instead of polling
      await setupNotifications(characteristic);
      setStatus('Connected - Listening for Notifications');

      // Listen for disconnection events
      device.addEventListener('gattserverdisconnected', handleDisconnection);
    } catch (err) {
      log(`Connection failed: ${err.message}`);
      setStatus(`Connection failed: ${err.message}`);
    }
  };

  
  // Add a new function to force update the canvas with direct coordinates
  const updateCanvasPreview = (coordsToUse) => {
    if (!coordsToUse || coordsToUse.length === 0) {
      log('No coordinates provided to force update preview');
      return;
    }
    
    try {
      log(`Forcing preview update with ${coordsToUse.length} points`);
      
      // Log some coordinate samples for debugging
      if (coordsToUse.length > 0) {
        log(`First coordinate: (${coordsToUse[0].x}, ${coordsToUse[0].y})`);
        if (coordsToUse.length > 1) {
          const lastIdx = coordsToUse.length - 1;
          log(`Last coordinate: (${coordsToUse[lastIdx].x}, ${coordsToUse[lastIdx].y})`);
        }
      }
      
      // Get min/max values for logging
      const xs = coordsToUse.map(coord => coord.x);
      const ys = coordsToUse.map(coord => coord.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      
      log(`Coordinate range: X(${minX}-${maxX}), Y(${minY}-${maxY})`);
      
      // Use auto-sizing with padding of 20px and specified point size
      const padding = 20;
      const result = createBMPFile(coordsToUse, padding, POINT_SIZE);
      
      // Update state with the new canvas info
      setCanvasPreview(result.previewUrl);
      setBmpData(result.bmpBlob);
      
      // Update the width/height state to match what was actually used
      setImageWidth(result.canvas.width);
      setImageHeight(result.canvas.height);
      
      log(`Canvas preview force updated with auto-sized dimensions: ${result.canvas.width}x${result.canvas.height}`);
    } catch (err) {
      log(`Error forcing canvas preview update: ${err.message}`);
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
      const text = data.responses[0]?.fullTextAnnotation?.text || 'No text detected';
      setDetectedText(text);
      
      log(`Detected text: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
      
      // Log dateInfo if available
      if (dateInfo) {
        log(`Using date info from Bluetooth device: ${dateInfo}`);
      } else {
        log('No date info available from Bluetooth device, will use date from text or default to today');
      }
      
      // Parse text into event details, prioritizing dateInfo from Bluetooth
      const parsedEventDetails = parseTextToEventDetails(text, dateInfo);
      if (parsedEventDetails) {
        setEventDetails(parsedEventDetails);
        log(`Event details parsed: ${parsedEventDetails.summary}`);
        log(`Event date: ${new Date(parsedEventDetails.start.dateTime).toLocaleDateString()}`);
        log(`Event time: ${new Date(parsedEventDetails.start.dateTime).toLocaleTimeString()}`);
        
        // Auto-create event if enabled and user is authenticated
        if (autoCreateEvent) {
          // Check authentication first
          const { token, isValid } = await getAccessToken();
          
          if (token && isValid) {
            log('Auto-creating calendar event...');
            
            // First set authentication state (for UI feedback)
            setAccessToken(token);
            setIsAuthenticated(true);
            
            // Then create the event automatically
            await createEvent();
          } else {
            log('Authentication required for auto-creating calendar event');
            setCalendarStatus('Authentication required');
            // Store event details for later creation after auth
            setEventDetails(parsedEventDetails);
            
            // Prompt for authentication
            handleGoogleAuth();
          }
        }
      } else {
        log('Could not parse event details from text');
      }
      
    } catch (err) {
      log(`Vision API Error: ${err.message}`);
      setVisionApiStatus(`Error: ${err.message}`);
    } finally {
      setIsSubmittingToVision(false);
    }
  };

  // Google Calendar Authentication - UPDATED to use calendar-service.js
  const handleGoogleAuth = async () => {
    try {
      log('Starting Google Authentication...');
      setEventCreationError(null);
      
      // Check if we already have a token
      const { token, isValid, error } = await getAccessToken();
      
      if (token && isValid) {
        // Token found and valid
        log('Found valid token');
        setAccessToken(token);
        setIsAuthenticated(true);
        log('Authentication successful!');
        
        // If we have event details waiting, create the event
        if (eventDetails && autoCreateEvent) {
          log('Creating pending event now that we are authenticated');
          await createEvent();
        }
        
        return token;
      } else if (token) {
        // Token found but invalid
        log(`Token invalid: ${error}`);
        setEventCreationError(`Auth error: ${error}`);
        setIsAuthenticated(false);
        
        // Start new auth flow
        startGoogleAuthFlow();
      } else {
        // No token, start new auth flow
        log('No token found, starting auth flow');
        startGoogleAuthFlow();
      }
    } catch (err) {
      const errorMsg = err.message || 'Unknown error';
      log(`Authentication error: ${errorMsg}`);
      setEventCreationError(`Auth error: ${errorMsg}`);
      setIsAuthenticated(false);
    }
    
    return null;
  };

  // Create calendar event - UPDATED to use calendar-service.js
  const createEvent = async () => {
    if (!detectedText) {
      log('Cannot create event: missing text data');
      setEventCreationError('Cannot create event: missing text data');
      return;
    }
    
    try {
      // Clear previous creation states
      setCreatedEvent(null);
      setEventCreationError(null);
      setShowEventConfirmation(false);
      setIsCreatingEvent(true);
      setCalendarStatus('Creating event...');
      
      // Use our helper function that handles all the complexity
      const result = await createEventFromDetectedText(detectedText, dateInfo);
      
      log('Event created successfully!');
      setCalendarStatus('Event created successfully!');
      console.log('Created event:', result);
      
      // Store the created event details for display
      setCreatedEvent(result);
      setShowEventConfirmation(true);
      
    } catch (err) {
      const errorMsg = err.message || 'Unknown error';
      
      // If the error mentions authentication, prompt for auth
      if (errorMsg.includes('Authentication') || errorMsg.includes('auth')) {
        log('Authentication needed for calendar access');
        handleGoogleAuth();
      } else {
        log(`Error creating calendar event: ${errorMsg}`);
        setCalendarStatus(`Error: ${errorMsg}`);
        setEventCreationError(`Failed to create event: ${errorMsg}`);
      }
    } finally {
      setIsCreatingEvent(false);
    }
  };

  // Format a date for display
  const formatEventTime = (isoString) => {
    if (!isoString) return '(not set)';
    
    try {
      const date = new Date(isoString);
      return date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short', 
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoString;
    }
  };
  
  const renderEventCreationStatus = () => {
    return (
      <div style={{ 
        marginTop: '20px',
        border: eventCreationError ? '1px solid #f44336' : '1px solid #4CAF50',
        borderRadius: '4px',
        padding: '15px',
        backgroundColor: eventCreationError ? '#ffebee' : '#e8f5e9'
      }}>
        <h3>Calendar Event Status</h3>
        
        {isCreatingEvent && (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <div className="loading-spinner" style={{ 
              width: '20px', 
              height: '20px', 
              border: '3px solid #f3f3f3',
              borderTop: '3px solid #3498db',
              borderRadius: '50%',
              animation: 'spin 2s linear infinite',
              marginRight: '10px'
            }}></div>
            <span>Creating event in Google Calendar...</span>
          </div>
        )}
        
        {eventCreationError && (
          <div style={{ color: '#f44336' }}>
            <p><strong>Error:</strong> {eventCreationError}</p>
            <button 
              onClick={() => setEventCreationError(null)}
              style={{ 
                padding: '5px 10px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginTop: '5px'
              }}
            >
              Dismiss
            </button>
          </div>
        )}
        
        {createdEvent && showEventConfirmation && (
          <div>
            <div style={{ 
              backgroundColor: '#fff', 
              border: '1px solid #ddd',
              borderRadius: '4px',
              padding: '10px',
              marginBottom: '10px'
            }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#4CAF50' }}>✓ Event Created Successfully!</h4>
              <p><strong>Title:</strong> {createdEvent.summary}</p>
              <p><strong>Start:</strong> {formatEventTime(createdEvent.start?.dateTime)}</p>
              <p><strong>End:</strong> {formatEventTime(createdEvent.end?.dateTime)}</p>
              
              {createdEvent.htmlLink && (
                <a 
                  href={createdEvent.htmlLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    padding: '5px 10px',
                    backgroundColor: '#4285F4',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '4px',
                    marginTop: '10px'
                  }}
                >
                  View in Google Calendar
                </a>
              )}
            </div>
            
            <button 
              onClick={() => {
                setShowEventConfirmation(false);
                setCreatedEvent(null);
              }}
              style={{ 
                padding: '5px 10px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Dismiss
            </button>
          </div>
        )}
        
        {!isCreatingEvent && !eventCreationError && !createdEvent && (
          <div>
            <p>No events have been created yet. Use the "Create Calendar Event" button after text detection.</p>
          </div>
        )}
      </div>
    );
  };

  // Event creation section component - UPDATED with auto-create toggle
  const renderEventCreationSection = () => {
    if (!detectedText) return null;
    
    return (
      <div style={{ 
        marginTop: '20px', 
        padding: '15px',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px'
      }}>
        <h3>Google Calendar Integration</h3>
        
        {/* Auto-create Toggle - NEW */}
        <div style={{ 
          padding: '10px',
          backgroundColor: '#fff', 
          borderRadius: '4px',
          marginBottom: '15px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span><strong>Auto-create events:</strong> When text is detected, automatically create calendar events</span>
          <label className="switch" style={{
            position: 'relative',
            display: 'inline-block',
            width: '50px',
            height: '24px'
          }}>
            <input 
              type="checkbox" 
              checked={autoCreateEvent} 
              onChange={() => setAutoCreateEvent(!autoCreateEvent)}
              style={{
                opacity: 0,
                width: 0,
                height: 0
              }}
            />
            <span style={{
              position: 'absolute',
              cursor: 'pointer',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: autoCreateEvent ? '#4CAF50' : '#ccc',
              transition: '.4s',
              borderRadius: '24px'
            }}>
              <span style={{
                position: 'absolute',
                content: '',
                height: '16px',
                width: '16px',
                left: autoCreateEvent ? '30px' : '4px',
                bottom: '4px',
                backgroundColor: 'white',
                transition: '.4s',
                borderRadius: '50%'
              }}></span>
            </span>
          </label>
        </div>
        
        {/* Authentication Status */}
        <div style={{ 
          padding: '10px', 
          backgroundColor: isAuthenticated ? '#e8f5e9' : '#fff3e0',
          borderRadius: '4px',
          marginBottom: '15px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <strong>Auth Status:</strong> {isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
          </div>
          
          <button
            onClick={handleGoogleAuth}
            style={{ 
              padding: '8px 16px',
              backgroundColor: isAuthenticated ? '#4CAF50' : '#FF9800',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {isAuthenticated ? 'Re-Authenticate' : 'Connect to Google Calendar'}
          </button>
        </div>
        
        {/* Parsed Event Details Preview */}
        {eventDetails && (
          <div style={{ 
            border: '1px solid #ddd',
            borderRadius: '4px',
            padding: '10px',
            backgroundColor: '#fff',
            marginBottom: '15px'
          }}>
            <h4>Parsed Event Details</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '5px' }}>
              <strong>Title:</strong> <span>{eventDetails.summary}</span>
              <strong>Start:</strong> <span>{formatEventTime(eventDetails.start?.dateTime)}</span>
              <strong>End:</strong> <span>{formatEventTime(eventDetails.end?.dateTime)}</span>
              <strong>Description:</strong> <span>{eventDetails.description || '(none)'}</span>
            </div>
            
            <button 
              onClick={() => setEventDetails(null)}
              style={{ 
                padding: '5px 10px',
                backgroundColor: '#f5f5f5',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginTop: '10px',
                cursor: 'pointer',
                fontSize: '0.8em'
              }}
            >
              Clear & Re-parse
            </button>
          </div>
        )}
        
        {/* Create Event Button */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
          <button
            onClick={createEvent}
            disabled={!detectedText || isCreatingEvent}
            style={{ 
              padding: '10px 20px',
              backgroundColor: (!detectedText || isCreatingEvent) ? '#cccccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!detectedText || isCreatingEvent) ? 'default' : 'pointer',
              fontSize: '1em',
              fontWeight: 'bold'
            }}
          >
            {isCreatingEvent ? 'Creating Event...' : 'Create Calendar Event'}
          </button>
        </div>
        
        {/* Event Creation Status/Confirmation */}
        {renderEventCreationStatus()}
      </div>
    );
  };

  // Check for authentication token on component mount - UPDATED to use calendar-service.js
  useEffect(() => {
    // Use our helper function to get and validate the token
    getAccessToken().then(({ token, isValid }) => {
      if (token) {
        setAccessToken(token);
        
        if (isValid) {
          setIsAuthenticated(true);
          log('Authentication token found and verified');
        } else {
          log('Token found but not valid');
        }
      }
    }).catch(err => {
      log(`Token error: ${err.message}`);
    });

    return () => {
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
      
      if (connectedDevice && connectedDevice.gatt.connected) {
        connectedDevice.gatt.disconnect();
      }
    };
  }, []);

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
      </div>
    );
  };

  // Render the UI
  return (
    <div>
      <h1 style={{textAlign: 'center', marginTop:'30%'}}>Aetas Calendar</h1>
    
        <div style={{textAlign: 'center', marginTop: '40%', marginBottom: '50px'}}>
          <button 
            onClick={connectToDevice}
            disabled={connectedDevice !== null}
            style={{
              backgroundColor: connectedDevice ? 'hsl(0, 0.00%, 84.70%)' : '#C5C5F1',
              border: '0.5px solid #1e1e1e', 
              borderRadius: '30px', 
              width: '200px', 
              height: '75px',
              color: '#1e1e1e',
              fontSize: '20px'
            }}>Connect to Calendar</button>

            {connectedDevice && (
              <p>Calendar Connected!</p>
            )}
        </div>  
               
      <div style={{ padding: '20px' }}>
        {/* <h2>Bluetooth Calendar with Vision API</h2> */}
        <p><strong>Status:</strong> {status}</p>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {/* <button 
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
          </button> */}
          
          <button 
            onClick={sendToVisionAPI}
            disabled={!bmpData || isSubmittingToVision}
            style={{ 
              padding: '8px 16px',
              backgroundColor: (!bmpData || isSubmittingToVision) ? '#cccccc' : '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!bmpData || isSubmittingToVision) ? 'default' : 'pointer'
            }}
          >
            {isSubmittingToVision ? 'Sending to Vision API...' : 'Send to Vision API'}
          </button>
        </div>
        
        {/* Vision API Status */}
        {(
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

        {/* Data Display Section */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
          {/* Left Column - Status and Data */}
         {/* <div style={{ flex: '1 1 400px' }}>
             <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                {/* Current Info Panel
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
    
                    {/* New Event Parsing Debug Section 
                    {currentData && detectedText && (
                      <>
                        <h4>Event Parsing Debug</h4>
                        <pre style={{ 
                          backgroundColor: '#ffffff', 
                          padding: '10px', 
                          borderRadius: '5px',
                          border: '1px solid #ddd',
                          overflow: 'auto',
                          maxHeight: '300px',
                          fontSize: '12px',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {(() => {
                            try {
                              // Call your parsing function directly here for debugging
                              const parsedEvent = parseTextToEventDetails(detectedText, dateInfo);
                              return JSON.stringify(parsedEvent, null, 2);
                            } catch (err) {
                              return `Error parsing event: ${err.message}`;
                            }
                          })()}
                        </pre>
                      </>
                    )}
                </div>
              </div>
            </div>
          </div> */}

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

        {/* Event Creation Section - Only show when text is detected */}
        {detectedText && renderEventCreationSection()}
      </div>
    </div>
  );
};


export default BluetoothPage;
