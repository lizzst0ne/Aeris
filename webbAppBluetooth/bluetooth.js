// bluetooth.js

// Define our custom service and characteristic UUIDs (matching device)
const CALENDAR_SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const CALENDAR_DATA_CHAR_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';

// For backward compatibility (we'll try both approaches)
const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const UART_RX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

let currentDevice;
let dataCharacteristic; // Our custom data characteristic
let isConnected = false;
let decoder = new TextDecoder();

// Store last received value to avoid duplicates
let lastReceivedValue = null;

// Safe logging function
function safeLog(message, ...args) {
  console.log(message, ...args);
}

// Event handler function for when we receive data
function handleDataReceived(event) {
  safeLog('Data received event triggered!');
  
  const value = event.target.value;
  
  // Display the raw buffer information for debugging
  safeLog('Raw buffer received');
  
  // Try to decode the data as text
  try {
    // First approach: read as number for button state
    const dataView = new DataView(value.buffer);
    const buttonState = dataView.getUint8(0);
    safeLog('Decoded button state:', buttonState);
    
    // Check if this is the same as last value (to avoid duplicates from polling)
    if (lastReceivedValue === buttonState.toString()) {
      safeLog('Duplicate value detected, ignoring');
      return;
    }
    
    // Store this as last received value
    lastReceivedValue = buttonState.toString();
    
    // Update the UI with the received data
    document.getElementById('status').textContent = 'Status: DATA RECEIVED';
    document.getElementById('receivedData').textContent = buttonState.toString();
    
    // Check if the received data is 0 or 1 and update the bit status
    if (buttonState === 1) {
      document.getElementById('bitStatus').textContent = "Bit Status: ON (1)";
      document.getElementById('bitStatus').className = "on";
    } else {
      document.getElementById('bitStatus').textContent = "Bit Status: OFF (0)";
      document.getElementById('bitStatus').className = "off";
    }
    
    // Add to data history
    const dataList = document.getElementById('dataHistory');
    const listItem = document.createElement('li');
    listItem.textContent = `${new Date().toLocaleTimeString()}: ${buttonState}`;
    dataList.prepend(listItem);
    
    // Keep the list from getting too long
    if (dataList.children.length > 10) {
      dataList.removeChild(dataList.lastChild);
    }
  } catch (error) {
    console.error('Error processing data:', error);
    try {
      // Fallback: try to decode as text
      const textValue = decoder.decode(value);
      safeLog('Fallback - decoded as text:', textValue);
      document.getElementById('receivedData').textContent = textValue;
    } catch (e) {
      console.error('Failed to decode as text:', e);
    }
  }
}

// Helper for testing - simulates receiving data
window.simulateBluetoothData = function(data) {
  if (data !== '0' && data !== '1') {
    console.error('Simulated data must be "0" or "1"');
    return;
  }
  
  // Create a sample ArrayBuffer with the button state
  const buffer = new ArrayBuffer(1);
  const view = new DataView(buffer);
  view.setUint8(0, parseInt(data));
  
  // Create a fake event object
  const mockEvent = {
    target: {
      value: {
        buffer: buffer,
        byteLength: 1
      }
    }
  };
  
  // Call the handleDataReceived function with our mock event
  handleDataReceived(mockEvent);
};

async function connectToDevice() {
  try {
    safeLog('Starting Bluetooth connection attempt...');
    
    // Check if Web Bluetooth is supported
    if (!navigator.bluetooth) {
      console.error('Web Bluetooth API is not supported in this browser');
      document.getElementById('message').textContent = 'Error: Web Bluetooth not supported in this browser';
      return;
    }
    
    // Request a Bluetooth device with our service UUIDs
    safeLog('Requesting Bluetooth device...');
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { name: 'very cool calendar we made' }
      ],
      optionalServices: [CALENDAR_SERVICE_UUID, UART_SERVICE_UUID]
    });

    // Save the device object for later use
    currentDevice = device;
    
    document.getElementById('message').textContent = 'Connecting to ' + device.name + '...';
    safeLog('Selected device:', device.name);
    
    // Connect to the device's GATT server
    safeLog('Connecting to GATT server...');
    const server = await device.gatt.connect();
    safeLog('Connected to GATT server');
    
    // First try to get the custom calendar service
    try {
      safeLog('Trying to get custom Calendar service...');
      const calendarService = await server.getPrimaryService(CALENDAR_SERVICE_UUID);
      safeLog('Got Calendar service');
      
      // Get the data characteristic
      safeLog('Getting data characteristic...');
      dataCharacteristic = await calendarService.getCharacteristic(CALENDAR_DATA_CHAR_UUID);
      safeLog('Got data characteristic');
      
      // Set up data reception for our custom characteristic
      await setupDataReception();
    } catch (customServiceError) {
      safeLog('Could not find custom service:', customServiceError.message);
      safeLog('Falling back to UART service...');
      
      try {
        // Fallback to UART service
        const uartService = await server.getPrimaryService(UART_SERVICE_UUID);
        safeLog('Got UART service');
        
        // Get TX characteristic
        safeLog('Getting TX characteristic...');
        dataCharacteristic = await uartService.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);
        safeLog('Got TX characteristic');
        
        // Set up data reception for UART characteristic
        await setupDataReception();
      } catch (uartError) {
        throw new Error(`Failed to connect to either custom or UART service: ${uartError.message}`);
      }
    }
    
    // Handle disconnection
    device.addEventListener('gattserverdisconnected', handleDisconnection);
    
  } catch (error) {
    console.error('Connection error:', error);
    document.getElementById('message').textContent = 'Failed to connect: ' + error.message;
    document.getElementById('status').textContent = 'Status: Not Connected';
    document.getElementById('status').className = '';
  }
}

async function setupDataReception() {
  safeLog('Setting up data reception...');
  
  // First approach: Try notifications
  let notificationsSupported = false;
  try {
    if (dataCharacteristic.properties.notify) {
      safeLog('Notification property exists - will try to use notifications');
      
      try {
        await dataCharacteristic.startNotifications();
        dataCharacteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
        safeLog('Notifications set up successfully');
        notificationsSupported = true;
      } catch (notifyError) {
        safeLog('Error starting notifications:', notifyError.message);
      }
    } else {
      safeLog('Notification property not supported on this characteristic');
    }
  } catch (error) {
    safeLog('Error checking notification support:', error.message);
  }
  
  // Second approach: Always use polling (even if notifications are working)
  safeLog('Setting up polling as backup data reception method');
  
  // Try to do an initial read to check if characteristic is readable
  try {
    const initialValue = await dataCharacteristic.readValue();
    safeLog('Initial read successful, value length:', initialValue.byteLength);
    if (initialValue.byteLength > 0) {
      handleDataReceived({target: {value: initialValue}});
    }
  } catch (readError) {
    safeLog('Warning: Could not perform initial read:', readError.message);
  }
  
  // Set up a polling interval (read the characteristic every 300ms)
  window.pollingInterval = setInterval(async function() {
    if (!dataCharacteristic || !isConnected) {
      clearInterval(window.pollingInterval);
      return;
    }
    
    try {
      const value = await dataCharacteristic.readValue();
      if (value && value.byteLength > 0) {
        handleDataReceived({target: {value: value}});
      }
    } catch (error) {
      // Don't log every error to avoid flooding the console
      if (error.message.includes('disconnected')) {
        safeLog('Device disconnected during polling');
        clearInterval(window.pollingInterval);
      }
    }
  }, 300);
  
  // Mark as connected
  isConnected = true;
  
  // Update connection status
  document.getElementById('status').textContent = 'Status: Connected - Waiting for button press on device';
  document.getElementById('status').className = 'connected';
  
  if (notificationsSupported) {
    document.getElementById('message').textContent = `Connected to ${currentDevice.name} using notifications and polling`;
  } else {
    document.getElementById('message').textContent = `Connected to ${currentDevice.name} using polling (notifications not available)`;
  }
}

function handleDisconnection(event) {
  safeLog('Device disconnected');
  document.getElementById('message').textContent = 'Device disconnected.';
  document.getElementById('status').textContent = 'Status: Disconnected';
  document.getElementById('status').className = 'disconnected';
  
  // Clear polling interval if it exists
  if (window.pollingInterval) {
    clearInterval(window.pollingInterval);
    window.pollingInterval = null;
    safeLog('Polling interval cleared');
  }
  
  // Reset the characteristic variables
  dataCharacteristic = null;
  lastReceivedValue = null;
  isConnected = false;
}

// Initialize event listeners when page loads
document.addEventListener('DOMContentLoaded', function() {
  safeLog('DOM content loaded, setting up event listeners');
  
  document.getElementById('connectButton').addEventListener('click', connectToDevice);
  
  safeLog('Bluetooth.js initialization complete - custom service version');
});