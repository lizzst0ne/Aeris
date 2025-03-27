// bluetooth.js

// UART Service UUIDs (standard Nordic UART Service)
const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Nordic TX (device → phone)
const UART_RX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Nordic RX (phone → device)

let currentDevice;
let txCharacteristic; // This is the characteristic we'll read from
let rxCharacteristic; // This is the characteristic we'll write to (if needed)
let decoder = new TextDecoder();

async function connectToDevice() {
  try {
    // Request a Bluetooth device with the UART service UUID
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [UART_SERVICE_UUID] },
        { name: 'very cool calendar we made' } // Filter by the device name in your code
      ],
      optionalServices: [UART_SERVICE_UUID]
    });

    // Save the device object for later use
    currentDevice = device;
    
    document.getElementById('message').textContent = 'Connecting to ' + device.name + '...';
    
    // Connect to the device's GATT server
    const server = await device.gatt.connect();
    
    // Get the primary service and characteristics
    const service = await server.getPrimaryService(UART_SERVICE_UUID);
    
    // Get TX characteristic (the one we'll read from)
    txCharacteristic = await service.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);
    
    // Get RX characteristic (the one we'll write to if needed)
    rxCharacteristic = await service.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);
    
    // Enable notifications to receive data from the device
    await txCharacteristic.startNotifications();
    
    // Add event listener for when data is received
    txCharacteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
    
    document.getElementById('message').textContent = `Connected to ${device.name}`;
    document.getElementById('status').textContent = 'Status: Connected YAY';
    document.getElementById('status').className = 'connected';
    
    // Enable the send button if we want to send data
    document.getElementById('sendButton').disabled = false;
    
    // Handle disconnection
    device.addEventListener('gattserverdisconnected', handleDisconnection);
    
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('message').textContent = 'Failed to connect: ' + error.message;
    document.getElementById('status').textContent = 'Status: Not Connected';
    document.getElementById('status').className = '';
  }
}

function handleDataReceived(event) {
  
  const value = event.target.value;
  // Decode the received value (could be text or binary)
  const receivedData = decoder.decode(value);
  
  console.log('Received data:', receivedData);
  document.getElementById('status').textContent = 'Status: DATA RECIEVED';
  
  // Update the UI with the received data
  document.getElementById('receivedData').textContent = receivedData;
  
  // If we're looking for a specific bit value (0 or 1)
  // we can check for it here and respond accordingly
  if (receivedData === "1") {
    document.getElementById('bitStatus').textContent = "Bit Status: ON (1)";
    document.getElementById('bitStatus').className = "on";
  } else if (receivedData === "0") {
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

function handleDisconnection() {
  console.log('Device disconnected');
  document.getElementById('message').textContent = 'Device disconnected.';
  document.getElementById('status').textContent = 'Status: Disconnected';
  document.getElementById('status').className = 'disconnected';
  document.getElementById('sendButton').disabled = true;
  
  // You could also implement auto-reconnect logic here
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
    
    // Send the data
    await rxCharacteristic.writeValue(dataBuffer);
    console.log('Data sent:', data);
  } catch (error) {
    console.error('Error sending data:', error);
  }
}

// Initialize event listeners when page loads
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('connectButton').addEventListener('click', connectToDevice);
  
  // Add event listener for send button if needed
  document.getElementById('sendButton').addEventListener('click', function() {
    const dataToSend = document.getElementById('dataToSend').value;
    sendData(dataToSend);
  });
});