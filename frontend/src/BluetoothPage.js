import React, { useState } from 'react';

const BluetoothPage = () => {
  const [log, setLog] = useState([]);
  const [connected, setConnected] = useState(false);

  const connectToDevice = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'Calendar BLE' }],
        optionalServices: [0x180F, '6e400001-b5a3-f393-e0a9-e50e24dcca9e']
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
      const rxChar = await service.getCharacteristic('6e400003-b5a3-f393-e0a9-e50e24dcca9e'); // RX from peripheral

      setConnected(true);
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      // Simple polling loop
      const poll = async () => {
        while (device.gatt.connected) {
          const value = await rxChar.readValue();
          buffer += decoder.decode(value);

          // Split on newlines
          let lines = buffer.split('\n');
          buffer = lines.pop(); // keep the incomplete line

          lines.forEach(line => {
            const clean = line.trim();
            if (clean) {
              console.log('Received:', clean);
              setLog(prev => [...prev, clean]);
            }
          });

          await new Promise(res => setTimeout(res, 500)); // poll every 500ms
        }
      };

      poll();
    } catch (err) {
      console.error('Bluetooth error:', err);
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h2>Bluetooth Test Page</h2>
      <button onClick={connectToDevice} disabled={connected}>
        {connected ? 'Connected' : 'Connect to Device'}
      </button>
      <div style={{ marginTop: '1rem' }}>
        <h3>Data Received:</h3>
        <pre style={{ background: '#eee', padding: '1rem', maxHeight: '300px', overflowY: 'scroll' }}>
          {log.join('\n')}
        </pre>
      </div>
    </div>
  );
};

export default BluetoothPage;
