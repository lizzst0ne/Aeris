#include <bluefruit.h>
#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <string>
#include <Arduino.h>
#include <InternalFileSystem.h>
#include <Adafruit_LittleFS.h>
#include <cstdio>

// Button pin
#define TEST_BUTTON 25

// Bluetooth variables
BLEDis bledis;
BLEUart bleuart;
bool isConnected = false;

void setup() {
  Serial.begin(115200);
  
  // Initialize button
  pinMode(TEST_BUTTON, INPUT_PULLUP);
  
  // Initialize Bluetooth
  Bluefruit.begin();
  Bluefruit.setName("BLE Test Device");
  
  // Set up callbacks
  Bluefruit.Periph.setConnectCallback([](uint16_t conn_handle) {
    isConnected = true;
    Serial.println("Connected");
  });
  
  Bluefruit.Periph.setDisconnectCallback([](uint16_t conn_handle, uint8_t reason) {
    isConnected = false;
    Serial.println("Disconnected");
  });
  
  // Configure Device Information Service
  bledis.setManufacturer("Adafruit");
  bledis.setModel("Test");
  bledis.begin();
  
  // Configure BLE UART service
  bleuart.begin();
  
  // Start advertising
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(bleuart);
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244);
  Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);
  
  Serial.println("Advertising started");
}

void loop() {
  // Check if button is pressed
  if (digitalRead(TEST_BUTTON) == LOW && isConnected) {
    delay(50); // Simple debounce
    
    // Send test data sequence
    Serial.println("Sending test data");
    
    // Send START marker
    bleuart.write("START", 5);
    delay(100);
    
    // Send test coordinates
    bleuart.write("100 150", 7);
    delay(100);
    bleuart.write("200 250", 7);
    delay(100);
    
    // Send STOP marker
    bleuart.write("STOP", 4);
    delay(100);
    
    // Send date
    bleuart.write("5,15", 4);
    delay(100);
    
    // Send END marker
    bleuart.write("END", 3);
    delay(100);
    
    // Send START marker for next transmission
    bleuart.write("START", 5);
    
    Serial.println("Test data sent");
    
    // Wait until button is released
    while (digitalRead(TEST_BUTTON) == LOW);
    delay(100); // Additional debounce
  }
}