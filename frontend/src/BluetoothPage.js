import React, { useState, useEffect } from 'react';
import './BluetoothPage.css';

const BluetoothPage = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [device, setDevice] = useState(null);
  const [service, setService] = useState(null);
  const [txCharacteristic, setTxCharacteristic] = useState(null);
  const [coordinates, setCoordinates] = useState([]);
  const [date, setDate] = useState({ month: 1, day: 1 });
  const [status, setStatus] = useState('Disconnected');
  const [dataBuffer, setDataBuffer] = useState('');
  
  // UUID values for the BLE UART service and characteristics
  // Using the Nordic UART Service UUIDs
  const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const UART_TX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // TX from device perspective
  const UART_RX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // RX from device perspective

  const connectBluetooth = async () => {
    try {
      setStatus('Scanning...');
      
      // Request Bluetooth device with specified services
      const bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'very cool calendar' } // Filter by name prefix from your device
        ],
        optionalServices: [UART_SERVICE_UUID]
      });
      
      setDevice(bluetoothDevice);
      setStatus('Device selected, connecting...');
      
      // Add event listener for disconnection
      bluetoothDevice.addEventListener('gattserverdisconnected', handleDisconnect);
      
      // Connect to the GATT server
      const server = await bluetoothDevice.gatt.connect();
      setStatus('Connected to GATT server, getting service...');
      
      // Get the UART service
      const uartService = await server.getPrimaryService(UART_SERVICE_UUID);
      setService(uartService);
      setStatus('Got UART service, getting characteristic...');
      
      // Get the TX characteristic (from the device's perspective)
      const txChar = await uartService.getCharacteristic(UART_RX_CHAR_UUID);
      setTxCharacteristic(txChar);
      
      // Start notifications
      await txChar.startNotifications();
      txChar.addEventListener('characteristicvaluechanged', handleIncomingData);
      
      setIsConnected(true);
      setStatus('Connected and ready for data');
    } catch (error) {
      console.error('Bluetooth connection error:', error);
      setStatus(`Error: ${error.message}`);
    }
  };
  
  const disconnectBluetooth = async () => {
    if (device && device.gatt.connected) {
      await device.gatt.disconnect();
    }
    setIsConnected(false);
    setDevice(null);
    setService(null);
    setTxCharacteristic(null);
    setStatus('Disconnected');
  };
  
  const handleDisconnect = () => {
    setIsConnected(false);
    setStatus('Device disconnected');
  };
  
  const handleIncomingData = (event) => {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const decodedData = decoder.decode(value);
    
    console.log('Received data:', decodedData);
    
    // Append the new data to our buffer
    const newBuffer = dataBuffer + decodedData;
    setDataBuffer(newBuffer);
    
    // Process the buffer
    processDataBuffer(newBuffer);
  };
  
  const processDataBuffer = (buffer) => {
    // Check for special markers in the data
    if (buffer.includes('START')) {
      // Clear old data when a new transmission starts
      setCoordinates([]);
      setDataBuffer(buffer.substring(buffer.indexOf('START') + 5)); // Remove START and anything before it
      return;
    }
    
    if (buffer.includes('STOP')) {
      // End of coordinate data transmission
      const parts = buffer.split('STOP');
      processCoordinateData(parts[0]);
      setDataBuffer(parts[1] || ''); // Keep anything after STOP
      return;
    }
    
    if (buffer.includes('END')) {
      // End of complete transmission
      const parts = buffer.split('END');
      processDateData(parts[0]);
      setDataBuffer(parts[1] || ''); // Keep anything after END
      return;
    }
    
    // If no special markers, just keep accumulating data
  };
  
  const processCoordinateData = (data) => {
    // Split the data by spaces to extract coordinates
    const coordPairs = data.trim().split(/\s+/);
    
    // Process in pairs (x and y)
    for (let i = 0; i < coordPairs.length; i += 2) {
      if (coordPairs[i] && coordPairs[i+1]) {
        const x = parseInt(coordPairs[i], 10);
        const y = parseInt(coordPairs[i+1], 10);
        
        if (!isNaN(x) && !isNaN(y)) {
          setCoordinates(prev => [...prev, { x, y }]);
        }
      }
    }
  };
  
  const processDateData = (data) => {
    // Extract date information (format: month,day)
    const dateMatch = data.match(/(\d+),(\d+)/);
    if (dateMatch) {
      const month = parseInt(dateMatch[1], 10);
      const day = parseInt(dateMatch[2], 10);
      
      if (!isNaN(month) && !isNaN(day)) {
        setDate({ month, day });
      }
    }
  };
  
  // Function to send test data back to the device (if needed)
  const sendTestData = async () => {
    if (!isConnected || !service) return;
    
    try {
      // Get the RX characteristic (from the device's perspective)
      const rxChar = await service.getCharacteristic(UART_TX_CHAR_UUID);
      
      // Create an encoder for the data
      const encoder = new TextEncoder();
      
      // Send test data
      const data = 'TEST_DATA';
      await rxChar.writeValue(encoder.encode(data));
      setStatus('Test data sent!');
    } catch (error) {
      console.error('Error sending data:', error);
      setStatus(`Send error: ${error.message}`);
    }
  };
  
  // For debugging - display received coordinates
  const getCoordinatesDisplay = () => {
    if (coordinates.length === 0) return 'No coordinates received yet';
    
    return coordinates.slice(-5).map((coord, idx) => 
      `Coord ${idx+1}: x=${coord.x}, y=${coord.y}`
    ).join('\n');
  };
  
  return (
    <div className="bluetooth-container">
      <h1>Bluetooth Connection</h1>
      <div className="status-display">
        <p>Status: {status}</p>
        <p>Connected: {isConnected ? 'Yes' : 'No'}</p>
        <p>Date: {date.month}/{date.day}</p>
      </div>
      
      <div className="coordinate-display">
        <h3>Last 5 Coordinates:</h3>
        <pre>{getCoordinatesDisplay()}</pre>
      </div>
      
      <div className="button-container">
        {!isConnected ? (
          <button onClick={connectBluetooth} className="connect-btn">
            Connect Bluetooth
          </button>
        ) : (
          <>
            <button onClick={disconnectBluetooth} className="disconnect-btn">
              Disconnect
            </button>
            <button onClick={sendTestData} className="test-btn">
              Send Test Data
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default BluetoothPage;