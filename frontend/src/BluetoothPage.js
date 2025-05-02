import React, { useState, useEffect, useRef } from 'react';

const CALENDAR_SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const CALENDAR_DATA_CHAR_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';

const BluetoothPage = () => {
  const [status, setStatus] = useState('Not Connected');
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [buttonState, setButtonState] = useState(null);
  const [history, setHistory] = useState([]);
  const [debugLog, setDebugLog] = useState([]);
  const dataCharRef = useRef(null);

  const log = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLog((prev) => [`${timestamp} - ${message}`, ...prev.slice(0, 50)]);
    console.log('[Bluetooth]', message);
  };

  const handleDisconnection = () => {
    setStatus('Disconnected');
    setConnectedDevice(null);
    dataCharRef.current = null;
    setButtonState(null);
    log('Device disconnected');
  };

  const handleDataReceived = (event) => {
    const value = event.target.value;
    const raw = [];
    for (let i = 0; i < value.byteLength; i++) {
      raw.push(value.getUint8(i));
    }
    log(`🔴 Raw Bytes: ${raw.join(', ')}`);

    const text = new TextDecoder().decode(value);
    log(`Received chunk: ${text}`);

    // Try parse as number pair
    const match = text.trim().match(/(\d+)\s+(\d+)/);
    if (match) {
      const x = parseInt(match[1], 10);
      const y = parseInt(match[2], 10);
      setButtonState(`Point: (${x}, ${y})`);
      log(`✅ Parsed point: (${x}, ${y})`);
    } else if (text.trim()) {
      setButtonState(`Message: ${text.trim()}`);
      log(`ℹ️ Message received: ${text.trim()}`);
    }
  };

  const setupNotifications = async (characteristic) => {
    dataCharRef.current = characteristic;
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
    log('Notifications enabled');
  };

  const connectToDevice = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'very cool calendar we made' }],
        optionalServices: [CALENDAR_SERVICE_UUID]
      });
      setConnectedDevice(device);
      setStatus('Connecting...');

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(CALENDAR_SERVICE_UUID);
      const characteristic = await service.getCharacteristic(CALENDAR_DATA_CHAR_UUID);

      await setupNotifications(characteristic);
      setStatus('Connected - Waiting for Data');

      device.addEventListener('gattserverdisconnected', handleDisconnection);
    } catch (err) {
      log(`Connection failed: ${err.message}`);
      setStatus(`Connection failed: ${err.message}`);
    }
  };

  useEffect(() => {
    return () => {
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

      {buttonState !== null && (
        <div style={{ marginTop: '20px' }}>
          <p><strong>Output:</strong> {buttonState}</p>
        </div>
      )}

      <div style={{ marginTop: '30px' }}>
        <h4>Debug Console</h4>
        <div style={{ backgroundColor: '#eee', padding: '10px', maxHeight: '300px', overflowY: 'auto', fontFamily: 'monospace' }}>
          {debugLog.map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BluetoothPage;
