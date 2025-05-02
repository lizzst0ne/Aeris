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
  const pollingIntervalRef = useRef(null);
  const lastValueRef = useRef('');

  const log = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `${timestamp} - ${msg}`;
    setDebugLog((prev) => [entry, ...prev.slice(0, 20)]);
    console.log('[Bluetooth]', msg);
  };

  const handleDisconnection = () => {
    setStatus('Disconnected');
    setConnectedDevice(null);
    dataCharRef.current = null;
    setButtonState(null);
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    log('Device disconnected');
  };

  const handleDataReceived = (value) => {
    try {
      const textDecoder = new TextDecoder('utf-8');
      const raw = textDecoder.decode(value);
      const trimmed = raw.trim();

      if (trimmed && trimmed !== lastValueRef.current) {
        lastValueRef.current = trimmed;
        setButtonState(trimmed);
        setHistory((prev) => [`Received: ${trimmed}`, ...prev]);
        log(`Data received: ${trimmed}`);
      }
    } catch (err) {
      log(`Error decoding value: ${err.message}`);
    }
  };

  const setupPolling = async (characteristic) => {
    dataCharRef.current = characteristic;
    log('Notifications enabled (polling fallback)');

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const value = await characteristic.readValue();
        handleDataReceived(value);
      } catch (err) {
        log(`Polling error: ${err.message}`);
        if (err.message.includes('disconnected')) {
          clearInterval(pollingIntervalRef.current);
        }
      }
    }, 500);
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

      await setupPolling(characteristic);
      setStatus('Connected - Polling for Data');

      device.addEventListener('gattserverdisconnected', handleDisconnection);
    } catch (err) {
      log('Connection failed: ' + err.message);
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

      {buttonState !== null && (
        <div style={{ marginTop: '20px' }}>
          <p><strong>Last Data:</strong> {buttonState}</p>
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

      {debugLog.length > 0 && (
        <div style={{ marginTop: '30px' }}>
          <h4>Debug Console</h4>
          <pre style={{ background: '#eee', padding: '10px', height: '200px', overflowY: 'scroll' }}>
            {debugLog.map((line, i) => <div key={i}>{line}</div>)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default BluetoothPage;
