import React, { useState, useEffect, useRef } from 'react';

const CALENDAR_SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const CALENDAR_DATA_CHAR_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';

const BluetoothPage = () => {
  const [status, setStatus] = useState('Not Connected');
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [buttonState, setButtonState] = useState(null);
  const [history, setHistory] = useState([]);
  const dataCharRef = useRef(null);
  const pollingIntervalRef = useRef(null);

  const log = (...args) => console.log('[Bluetooth]', ...args);

  const handleDisconnection = () => {
    setStatus('Disconnected');
    setConnectedDevice(null);
    dataCharRef.current = null;
    setButtonState(null);
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    log('Device disconnected');
  };

  const handleDataReceived = (event) => {
    const value = event.target.value;
    const dataView = new DataView(value.buffer);
    const state = dataView.getUint8(0);
    setButtonState(state);

    setHistory((prev) => {
      const updated = [`${new Date().toLocaleTimeString()}: ${state}`, ...prev];
      return updated.slice(0, 10);
    });

    setStatus('Connected - Data Received');
  };

  const setupNotificationsAndPolling = async (characteristic) => {
    dataCharRef.current = characteristic;

    try {
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
      log('Notifications enabled');
    } catch (err) {
      log('Notifications failed:', err.message);
    }

    pollingIntervalRef.current = setInterval(async () => {
      if (!dataCharRef.current) return;
      try {
        const value = await dataCharRef.current.readValue();
        handleDataReceived({ target: { value } });
      } catch (err) {
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
        optionalServices: [CALENDAR_SERVICE_UUID]
      });
      setConnectedDevice(device);
      setStatus('Connecting...');

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(CALENDAR_SERVICE_UUID);
      const characteristic = await service.getCharacteristic(CALENDAR_DATA_CHAR_UUID);

      await setupNotificationsAndPolling(characteristic);
      setStatus('Connected - Waiting for Data');

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
          <p><strong>Button State:</strong> {buttonState === 1 ? 'ON (1)' : 'OFF (0)'}</p>
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
    </div>
  );
};

export default BluetoothPage;
