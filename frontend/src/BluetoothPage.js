import React, { useState, useEffect } from 'react';
import './BluetoothPage.css';

const BluetoothPage = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [device, setDevice] = useState(null);
  const [server, setServer] = useState(null);
  const [service, setService] = useState(null);
  const [rxCharacteristic, setRxCharacteristic] = useState(null);
  const [txCharacteristic, setTxCharacteristic] = useState(null);
  const [coordinates, setCoordinates] = useState([]);
  const [date, setDate] = useState({ month: 1, day: 1 });
  const [status, setStatus] = useState('Disconnected');
  const [dataBuffer, setDataBuffer] = useState('');
  const [logMessages, setLogMessages] = useState([]);
  const [isPolling, setIsPolling] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  
  // UUID values for the BLE UART service and characteristics
  // Using the Nordic UART Service UUIDs
  const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const UART_TX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // TX from device perspective
  const UART_RX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // RX from device perspective

  // Add log message with timestamp
  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages(prev => [{ time: timestamp, msg: message }, ...prev.slice(0, 19)]);
    console.log(`${timestamp}: ${message}`);
  };

  // Connect to Bluetooth device
  const connectBluetooth = async () => {
    try {
      addLog('Starting Bluetooth scan...');
      setStatus('Scanning...');
      
      // Request Bluetooth device with specified services
      const bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'very cool calendar' }
        ],
        optionalServices: [UART_SERVICE_UUID]
      });
      
      setDevice(bluetoothDevice);
      addLog(`Found device: ${bluetoothDevice.name}`);
      setStatus('Device selected, connecting...');
      
      // Add event listener for disconnection
      bluetoothDevice.addEventListener('gattserverdisconnected', () => {
        setIsConnected(false);
        setIsPolling(false);
        setStatus('Device disconnected');
        addLog('Device disconnected');
      });
      
      // Connect to the GATT server
      addLog('Connecting to GATT server...');
      const gattServer = await bluetoothDevice.gatt.connect();
      setServer(gattServer);
      addLog('Connected to GATT server');
      setStatus('Connected to GATT server, getting service...');
      
      // Get the UART service
      addLog('Getting UART service...');
      const uartService = await gattServer.getPrimaryService(UART_SERVICE_UUID);
      setService(uartService);
      addLog('Got UART service');
      setStatus('Got UART service, getting characteristics...');
      
      // Get both characteristics
      addLog('Getting TX characteristic...');
      const txChar = await uartService.getCharacteristic(UART_TX_CHAR_UUID);
      setTxCharacteristic(txChar);
      addLog('Got TX characteristic');
      
      addLog('Getting RX characteristic...');
      const rxChar = await uartService.getCharacteristic(UART_RX_CHAR_UUID);
      setRxCharacteristic(rxChar);
      addLog('Got RX characteristic');
      
      setIsConnected(true);
      setStatus('Connected and ready');
      addLog('Device fully connected and ready');
      
      // Start polling for data
      setIsPolling(true);

    } catch (error) {
      console.error('Bluetooth connection error:', error);
      addLog(`Error: ${error.message}`);
      setStatus(`Error: ${error.message}`);
    }
  };
  
  // Disconnect from Bluetooth device
  const disconnectBluetooth = async () => {
    if (device && device.gatt.connected) {
      setIsPolling(false);
      await device.gatt.disconnect();
      addLog('Manually disconnected from device');
    }
    setIsConnected(false);
    setDevice(null);
    setServer(null);
    setService(null);
    setTxCharacteristic(null);
    setRxCharacteristic(null);
    setStatus('Disconnected');
  };
  
  // Start the polling loop to read data
  useEffect(() => {
    let pollInterval;
    
    const pollData = async () => {
      if (isPolling && rxCharacteristic) {
        try {
          const value = await rxCharacteristic.readValue();
          if (value.byteLength > 0) {
            const decoder = new TextDecoder('utf-8');
            const decodedData = decoder.decode(value);
            
            // Only process if we actually got data
            if (decodedData.trim().length > 0) {
              addLog(`Received: ${decodedData.substring(0, 20)}${decodedData.length > 20 ? '...' : ''}`);
              processIncomingData(decodedData);
            }
          }
        } catch (error) {
          addLog(`Polling error: ${error.message}`);
          console.error('Polling error:', error);
        }
      }
    };
    
    if (isPolling) {
      addLog('Started polling for data');
      pollInterval = setInterval(pollData, 500); // Poll every 500ms
    }
    
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        addLog('Stopped polling for data');
      }
    };
  }, [isPolling, rxCharacteristic]);
  
  // Process incoming data
  const processIncomingData = (data) => {
    // Append the new data to our buffer
    const newBuffer = dataBuffer + data;
    setDataBuffer(newBuffer);
    
    // Check for START marker
    if (newBuffer.includes('START') && !isReceiving) {
      addLog('Found START marker - beginning data collection');
      setIsReceiving(true);
      setCoordinates([]); // Clear previous coordinates
      const newData = newBuffer.substring(newBuffer.indexOf('START') + 5);
      setDataBuffer(newData);
      return;
    }
    
    // Check for STOP marker to finish coordinates
    if (newBuffer.includes('STOP') && isReceiving) {
      addLog('Found STOP marker - processing coordinates');
      const parts = newBuffer.split('STOP');
      const coordData = parts[0];
      const afterStop = parts[1] || '';
      
      // Process the coordinate data
      processCoordinateData(coordData);
      
      // Check if there's date data after STOP
      if (afterStop && afterStop.match(/\d+,\d+/)) {
        processDateData(afterStop);
      }
      
      setIsReceiving(false);
      setDataBuffer('');
      addLog('Processing complete');
      return;
    }
    
    // If we're in receiving mode but haven't seen STOP yet, just update the buffer
    if (isReceiving) {
      setDataBuffer(newBuffer);
    } else {
      // If not in receiving mode and data doesn't contain START, just clear it
      setDataBuffer('');
    }
  };
  
  // Process coordinate data - expects format from your paste.txt file
  const processCoordinateData = (data) => {
    if (!data) return;
    
    try {
      // Parse coordinates in format "index:[x,y],"
      const regex = /(\d+):\[(\d+),(\d+)\],/g;
      let match;
      const newCoords = [];
      
      while ((match = regex.exec(data)) !== null) {
        const index = parseInt(match[1], 10);
        const x = parseInt(match[2], 10);
        const y = parseInt(match[3], 10);
        
        if (!isNaN(index) && !isNaN(x) && !isNaN(y)) {
          newCoords.push({ index, x, y });
        }
      }
      
      if (newCoords.length > 0) {
        addLog(`Processed ${newCoords.length} coordinates`);
        setCoordinates(prev => [...prev, ...newCoords]);
      } else {
        addLog('No valid coordinates found in data');
      }
    } catch (error) {
      addLog(`Error processing coordinates: ${error.message}`);
      console.error('Error processing coordinates:', error);
    }
  };
  
  // Process date data - expects format "month,day"
  const processDateData = (data) => {
    try {
      // Find first occurrence of month,day pattern
      const dateMatch = data.match(/(\d+),(\d+)/);
      
      if (dateMatch) {
        const month = parseInt(dateMatch[1], 10);
        const day = parseInt(dateMatch[2], 10);
        
        if (!isNaN(month) && !isNaN(day)) {
          addLog(`Processed date: ${month}/${day}`);
          setDate({ month, day });
        } else {
          addLog('Found date format but values are invalid');
        }
      } else {
        addLog('No valid date format found');
      }
    } catch (error) {
      addLog(`Error processing date: ${error.message}`);
      console.error('Error processing date:', error);
    }
  };
  
  // Function to send test data back to the device (if needed)
  const sendTestData = async () => {
    if (!isConnected || !txCharacteristic) return;
    
    try {
      // Create an encoder for the data
      const encoder = new TextEncoder();
      
      // Send test data
      const data = 'TEST_DATA';
      await txCharacteristic.writeValue(encoder.encode(data));
      addLog(`Sent test data: ${data}`);
      setStatus('Test data sent!');
    } catch (error) {
      console.error('Error sending data:', error);
      addLog(`Send error: ${error.message}`);
      setStatus(`Send error: ${error.message}`);
    }
  };
  
  // Clear received coordinates
  const clearCoordinates = () => {
    setCoordinates([]);
    setDataBuffer('');
    setIsReceiving(false);
    addLog('Cleared all coordinates and data buffer');
  };
  
  // For debugging - display received coordinates
  const getCoordinatesDisplay = () => {
    if (coordinates.length === 0) return 'No coordinates received yet';
    
    return coordinates.slice(-5).map((coord) => 
      `Coord ${coord.index}: x=${coord.x}, y=${coord.y}`
    ).join('\n');
  };
  
  // Helper to display the current data buffer for debugging
  const getBufferPreview = () => {
    if (!dataBuffer || dataBuffer.length === 0) return 'Empty';
    
    const preview = dataBuffer.substring(0, 30);
    return `${preview}${dataBuffer.length > 30 ? '...' : ''} (${dataBuffer.length} chars)`;
  };
  
  return (
    <div className="bluetooth-container">
      <h1>Bluetooth Connection</h1>
      
      <div className="status-display">
        <p>Status: {status}</p>
        <p>Connected: {isConnected ? 'Yes' : 'No'}</p>
        <p>Polling: {isPolling ? 'Active' : 'Inactive'}</p>
        <p>Receiving Data: {isReceiving ? 'Yes' : 'No'}</p>
        <p>Date: {date.month}/{date.day}</p>
        <p>Coordinates Received: {coordinates.length}</p>
        <p>Buffer: {getBufferPreview()}</p>
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
            <button onClick={clearCoordinates} className="clear-btn">
              Clear Data
            </button>
          </>
        )}
      </div>
      
      <div className="log-container">
        <h3>Debug Log</h3>
        <div className="log-entries">
          {logMessages.map((log, index) => (
            <div key={index} className="log-entry">
              <span className="log-time">{log.time}</span>
              <span className="log-message">{log.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BluetoothPage;