import React, { useState, useEffect, useRef } from 'react';

const CALENDAR_SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const CALENDAR_DATA_CHAR_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';

const BluetoothPage = () => {
  const [status, setStatus] = useState('Not Connected');
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [buttonState, setButtonState] = useState(null);
  const [history, setHistory] = useState([]);
  const [debugLogs, setDebugLogs] = useState([]);

  const dataCharRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const bufferRef = useRef('');
  const parsedPointsRef = useRef([]);

  const appendDebug = (msg) => {
    const time = new Date().toLocaleTimeString();
    setDebugLogs((prev) => [`${time} - ${msg}`, ...prev.slice(0, 100)]);
    console.log('[Debug]', msg);
  };

  const handleDisconnection = () => {
    setStatus('Disconnected');
    setConnectedDevice(null);
    dataCharRef.current = null;
    setButtonState(null);
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    appendDebug('Device disconnected');
  };

  const handleDataReceived = (event) => {
    const value = event.target.value;
    const textDecoder = new TextDecoder('utf-8');
    const chunk = textDecoder.decode(value);
    appendDebug('Received chunk: ' + chunk);

    bufferRef.current += chunk;

    const lines = bufferRef.current.split('\n');
    bufferRef.current = lines.pop(); // retain any partial line

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      if (line === 'START') {
        parsedPointsRef.current = [];
        setStatus('Receiving Data...');
        appendDebug('START received');
      } else if (line === 'STOP') {
        setStatus('Coordinate Stream Complete');
        appendDebug('STOP received');
      } else if (line === 'END') {
        appendDebug('END received');
        setHistory((prev) => [
          `Received ${parsedPointsRef.current.length} points`,
          ...prev,
        ]);
        parsedPointsRef.current = [];
      } else if (line.includes(',')) {
        appendDebug('Received date string: ' + line);
      } else if (/^\d+\s+\d+$/.test(line)) {
        const [x, y] = line.split(' ').map(Number);
        parsedPointsRef.current.push({ x, y });
        setButtonState(`Point: (${x}, ${y})`);
        appendDebug(`Parsed point: (${x}, ${y})`);
      } else {
        appendDebug('Unrecognized line: ' + line);
      }
    }
  };

  const setupNotificationsAndPolling = async (characteristic) => {
    dataCharRef.current = characteristic;

    try {
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
      appendDebug('Notifications enabled');
    } catch (err) {
      appendDebug('Notifications failed: ' + err.message);
    }

    pollingIntervalRef.current = setInterval(async () => {
      if (!dataCharRef.current) return;
      try {
        const value = await dataCharRef.current.readValue();
        handleDataReceived({ target: { value } });
      } catch (err) {
        appendDebug('Polling error: ' + err.message);
        if (err.message.includes('disconnected')) {
          clearInterval(pollingIntervalRef.current);
        }
      }
    }, 300);
  };

  const connectToDevice = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'very cool calendar we made' }],
        optionalServices: [CALENDAR_SERVICE_UUID],
      });
      setConnectedDevice(device);
      setStatus('Connecting...');
      appendDebug('Device selected: ' + device.name);

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(CALENDAR_SERVICE_UUID);
      const characteristic = await service.getCharacteristic(CALENDAR_DATA_CHAR_UUID);

      await setupNotificationsAndPolling(characteristic);
      setStatus('Connected - Waiting for Data');
      appendDebug('Connected and service ready');

      device.addEventListener('gattserverdisconnected', handleDisconnection);
    } catch (err) {
      appendDebug('Connection failed: ' + err.message);
      setStatus(`Connection failed: ${err.message}`);
    }
  };

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      if (connectedDevice && connectedDevice.gatt.connected) {
        connectedDevice.gatt.disconnect();
      }
    };
  }, [connectedDevice]);

  return (
    <div style={{ padding: '20px' }}>
      <h2>Bluetooth Test Page</h2>
      <p><strong>Status:</strong> {status}</p>
      <button onClick={connectToDevice}>Connect to Adafruit BLE Device</button>

      {buttonState && (
        <div style={{ marginTop: '20px' }}>
          <p><strong>Latest Point:</strong> {buttonState}</p>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <h4>Data History</h4>
          <ul>
            {history.map((entry, idx) => (
              <li key={idx}>{entry}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: '30px' }}>
        <h4>Debug Console</h4>
        <div style={{
          maxHeight: '200px',
          overflowY: 'auto',
          backgroundColor: '#f4f4f4',
          padding: '10px',
          fontFamily: 'monospace',
          border: '1px solid #ccc'
        }}>
          {debugLogs.map((log, idx) => (
            <div key={idx}>{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BluetoothPage;
