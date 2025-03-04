// bluetooth.js

let currentDevice;
let currentCharacteristic;

async function connectToDevice() {
  try {
    
    // Request a Bluetooth device with a specific service UUID
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['your-service-uuid'] }]
    });

    // Save the device object for later use
    currentDevice = device;
    
    // Connect to the device's GATT server
    const server = await device.gatt.connect();
    
    // Get the primary service and characteristic
    const service = await server.getPrimaryService('your-service-uuid');
    currentCharacteristic = await service.getCharacteristic('your-characteristic-uuid');

    // Enable reading and writing data
    document.getElementById('message').textContent = `Connected to ${device.name}`;
    
  } catch (error) {
    console.log('Error:', error);
    document.getElementById('message').textContent = 'Failed to connect to device.';
  }
}

document.getElementById('connectButton').addEventListener('click', connectToDevice);
