// bluetooth.js

// UART Service UUIDs (standard Nordic UART Service)
const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Nordic TX (device → phone)
const UART_RX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Nordic RX (phone → device)

let currentDevice;
let txCharacteristic; // This is the characteristic we'll read from
let rxCharacteristic; // This is the characteristic we'll write to (if needed)
let decoder = new TextDecoder();

// Helper function to safely stringify objects that might contain circular references
function safeStringify(obj, indent = 2) {
  let cache = [];
  const safeObj = JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      // If we've seen this object before, replace it with [Circular]
      if (cache.includes(value)) {
        return '[Circular]';
      }
      // Add the object to our cache
      cache.push(value);
    }
    return value;
  }, indent);
  
  // Clear the cache when done
  cache = null;
  return safeObj;
}

// Safe console log function
function safeLog(message, ...args) {
  const formattedArgs = args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      // Don't try to stringify DOM elements or Bluetooth objects
      if (arg instanceof Element || 
          arg instanceof BluetoothDevice ||
          arg instanceof BluetoothRemoteGATTServer ||
          arg instanceof BluetoothRemoteGATTService ||
          arg instanceof BluetoothRemoteGATTCharacteristic) {
        return `[${arg.constructor.name}]`;
      }
      try {
        return safeStringify(arg);
      } catch (e) {
        return '[Object that cannot be stringified]';
      }
    }
    return arg;
  });
  
  // Use regular console.log but with safe arguments
  console.log(message, ...formattedArgs);
}

// Expose a function to simulate received data for debugging
window.simulateBluetoothData = function(data) {
  if (!data) return;
  
  // Create a mock array buffer with the data
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  // Create a fake event object
  const mockEvent = {
    target: {
      value: {
        buffer: dataBuffer.buffer,
        byteLength: dataBuffer.byteLength
      }
    }
  };
  
  // Call the handleDataReceived function with our mock event
  handleDataReceived(mockEvent);
};

// Event handler function - defined before usage
function handleDataReceived(event) {
  safeLog('Data received event triggered!');
  
  const value = event.target.value;
  // Decode the received value (could be text or binary)
  let receivedData;
  
  // Try different decoding approaches
  try {
    // First attempt: standard text decoding
    receivedData = decoder.decode(value);
    safeLog('Standard decoding successful:', receivedData);
    
    // If the string is empty or contains only whitespace, try reading as bytes
    if (!receivedData.trim()) {
      let bytes = new Uint8Array(value.buffer);
      receivedData = Array.from(bytes).map(b => b.toString()).join(', ');
      safeLog('Decoded as bytes:', receivedData);
    }
  } catch (e) {
    console.error('Decoding error:', e.message);
    // Fallback: try to read as bytes
    try {
      let bytes = new Uint8Array(value.buffer);
      receivedData = Array.from(bytes).map(b => b.toString()).join(', ');
      safeLog('Fallback decoded as bytes:', receivedData);
    } catch (e2) {
      console.error('Fallback decoding error:', e2.message);
      receivedData = "Error decoding data";
    }
  }
  
  safeLog('Final received data:', receivedData);
  document.getElementById('status').textContent = 'Status: DATA RECEIVED';
  
  // Update the UI with the received data
  document.getElementById('receivedData').textContent = receivedData;
  
  // If we're looking for a specific bit value (0 or 1)
  // we can check for it here and respond accordingly
  if (receivedData.includes("1")) {
    document.getElementById('bitStatus').textContent = "Bit Status: ON (1)";
    document.getElementById('bitStatus').className = "on";
  } else if (receivedData.includes("0")) {
    document.getElementById('bitStatus').textContent = "Bit Status: OFF (0)";
    document.getElementById('bitStatus').className = "off";
  }
  
  // Add to data history
  const dataList = document.getElementById('dataHistory');
  const listItem = document.createElement('li');
  listItem.textContent = `${new Date().toLocaleTimeString()}: ${receivedData}`;
  dataList.prepend(listItem);
  
  // Keep the list from getting too long
  if (dataList.children.length > 10) {
    dataList.removeChild(dataList.lastChild);
  }
}

async function connectToDevice() {
  try {
    safeLog('Starting Bluetooth connection attempt...');
    
    // Check if Web Bluetooth is supported
    if (!navigator.bluetooth) {
      console.error('Web Bluetooth API is not supported in this browser');
      document.getElementById('message').textContent = 'Error: Web Bluetooth not supported in this browser';
      return;
    }
    
    // Request a Bluetooth device with the UART service UUID
    safeLog('Requesting Bluetooth device...');
    const device = await navigator.bluetooth.requestDevice({
      // First, try to filter by both service and name
      filters: [
        { name: 'very cool calendar we made' }
      ],
      optionalServices: [UART_SERVICE_UUID]
    });

    // Save the device object for later use
    currentDevice = device;
    
    document.getElementById('message').textContent = 'Connecting to ' + device.name + '...';
    safeLog('Selected device:', device.name);
    
    // Connect to the device's GATT server
    safeLog('Connecting to GATT server...');
    const server = await device.gatt.connect();
    safeLog('Connected to GATT server');
    
    // Get the primary service and characteristics
    safeLog('Getting UART service...');
    const service = await server.getPrimaryService(UART_SERVICE_UUID);
    safeLog('Got UART service');
    
    // Get TX characteristic (the one we'll read from)
    safeLog('Getting TX characteristic...');
    txCharacteristic = await service.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);
    safeLog('Got TX characteristic');
    
    // Get RX characteristic (the one we'll write to if needed)
    safeLog('Getting RX characteristic...');
    rxCharacteristic = await service.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);
    safeLog('Got RX characteristic');
    
    // Log the properties without trying to use them
    safeLog('Connected to device. Waiting for data...');
    
    // Try everything we can to receive data
    
    // Approach 1: Try to add an event listener for value changes
    // This is the most reliable method if supported
    try {
      safeLog('Attempting to setup notifications');
      await txCharacteristic.startNotifications().catch(e => {
        safeLog('Could not start notifications (continuing anyway):', e.message);
      });
      
      txCharacteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
      safeLog('Event listener added');
    } catch (notifyError) {
      safeLog('Could not setup notification listener:', notifyError.message);
    }
    
    // Approach 2: Try a single read to see if we can get an initial value
    try {
      safeLog('Attempting to read current value');
      const initialValue = await txCharacteristic.readValue();
      safeLog('Read successful');
      handleDataReceived({target: {value: initialValue}});
    } catch (readError) {
      safeLog('Could not read initial value:', readError.message);
    }
    
    document.getElementById('message').textContent = `Connected to ${device.name}`;
    document.getElementById('status').textContent = 'Status: Connected - Waiting for button press on device';
    document.getElementById('status').className = 'connected';
    
    // Enable the send button if we want to send data
    document.getElementById('sendButton').disabled = false;
    
    // Handle disconnection
    device.addEventListener('gattserverdisconnected', handleDisconnection);
    
  } catch (error) {
    console.error('Connection error:', error.message);
    document.getElementById('message').textContent = 'Failed to connect: ' + error.message;
    document.getElementById('status').textContent = 'Status: Not Connected';
    document.getElementById('status').className = '';
  }
}

function handleDisconnection(event) {
  safeLog('Device disconnected');
  document.getElementById('message').textContent = 'Device disconnected.';
  document.getElementById('status').textContent = 'Status: Disconnected';
  document.getElementById('status').className = 'disconnected';
  document.getElementById('sendButton').disabled = true;
}

// Function to send data to the device if needed
async function sendData(data) {
  if (!rxCharacteristic) {
    console.error('No RX characteristic available');
    return;
  }
  
  try {
    // Convert string to an encoded buffer
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    safeLog('Sending data:', data);
    
    // Send the data
    await rxCharacteristic.writeValue(dataBuffer);
    safeLog('Data sent successfully');
    
    // Add to data history as "sent"
    const dataList = document.getElementById('dataHistory');
    const listItem = document.createElement('li');
    listItem.textContent = `${new Date().toLocaleTimeString()}: SENT: ${data}`;
    listItem.style.color = 'blue';
    dataList.prepend(listItem);
  } catch (error) {
    console.error('Error sending data:', error.message);
    document.getElementById('message').textContent = 'Error sending data: ' + error.message;
  }
}

// Initialize event listeners when page loads
document.addEventListener('DOMContentLoaded', function() {
  safeLog('DOM content loaded, setting up event listeners');
  document.getElementById('connectButton').addEventListener('click', connectToDevice);
  
  // Add event listener for send button if needed
  document.getElementById('sendButton').addEventListener('click', function() {
    const dataToSend = document.getElementById('dataToSend').value;
    sendData(dataToSend);
  });
  
  safeLog('Bluetooth.js initialization complete');
});