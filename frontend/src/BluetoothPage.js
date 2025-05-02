import React, { useState, useEffect, useRef } from 'react';

const CALENDAR_SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const CALENDAR_DATA_CHAR_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';

const BluetoothPage = () => {
  const [status, setStatus] = useState('Not Connected');
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [buttonState, setButtonState] = useState(null);
  const [history, setHistory] = useState([]);
  const [debugMessages, setDebugMessages] = useState([]);
  const dataCharRef = useRef(null);
  const pollingIntervalRef = useRef(null);

  const log = (...args) => {
    const timestamp = new Date().toLocaleTimeString();
    const message = `${timestamp} - ${args.join(' ')}`;
    setDebugMessages(prev => [message, ...prev.slice(0, 49)]); // Keep latest 50
    console.log('[Bluetooth]', ...args);
  };

  const handleDisconnection = () => {
    setStatus('Disconnected');
    setConnectedDevice(null);
    dataCharRef.current = null;
    setButtonState(null);
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    log('Device disconnected');
  };

  const parseAndHandleValue = (value) => {
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(value).trim();
    log('Polled value:', text);
    if (/^\d+$/.test(text)) {
      setButtonState(text);
      setHistory(prev => [`Received value: ${text}`, ...prev]);
    } else {
      setHistory(prev => [`Unknown data: ${text}`, ...prev]);
    }
  };

  const setupPollingOnly = async (characteristic) => {
    dataCharRef.current = characteristic;

    pollingIntervalRef.current = setInterval(async () => {
      if (!dataCharRef.current) return;
      try {
        const value = await dataCharRef.current.readValue();
        parseAndHandleValue(value);
      } catch (err) {
        log('Polling error:', err.message);
      }
    }, 300);
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

      await setupPollingOnly(characteristic);
      setStatus('Connected - Polling for Data');

      device.addEventListener('gattserverdisconnected', handleDisconnection);
    } catch (err) {
      log('Connection failed:', err.message);
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
          <p><strong>Latest Value:</strong> {buttonState}</p>
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

      <div style={{ marginTop: '30px', backgroundColor: '#f3f3f3', padding: '10px', borderRadius: '6px' }}>
        <h4>Debug Console</h4>
        <pre style={{ height: '200px', overflowY: 'scroll', fontSize: '0.85em' }}>
          {debugMessages.join('\n')}
        </pre>
      </div>
    </div>
  );
};

export default BluetoothPage;
