#include <bluefruit.h>
#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <string>
#include <vector>
#include <stdlib.h>
#include <Arduino.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3D

#define SEND_BUTTON 25
#define BLE_BUTTON 26

// Define a custom service and characteristic UUID
// This way we have full control over the permissions
#define CALENDAR_SERVICE_UUID        "19B10000-E8F2-537E-4F6C-D104768A1214"
#define CALENDAR_DATA_CHAR_UUID      "19B10001-E8F2-537E-4F6C-D104768A1214"

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Create a custom BLE service and characteristic
BLEService calendarService(CALENDAR_SERVICE_UUID);
BLECharacteristic dataCharacteristic(CALENDAR_DATA_CHAR_UUID);

// Variable to avoid button bouncing
unsigned long lastButtonPress = 0;
const unsigned long debounceTime = 300; // 300ms debounce

// Variable to store last sent value
uint8_t buttonState = 0;

// Function declarations
void startAdv(void);
void connect_callback(uint16_t conn_handle);
void disconnect_callback(uint16_t conn_handle, uint8_t reason);
void setupCalendarService(void); // Added missing declaration

void setup() {
  Serial.begin(115200);
  
  // Button setup
  pinMode(SEND_BUTTON, INPUT);
  pinMode(BLE_BUTTON, INPUT);
  
  // Display setup
  if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("SSD1306 allocation failed"));
    for(;;); // Don't proceed, loop forever
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);
  display.println("Initializing...");
  display.display();
  
  // Initialize Bluefruit with maximum connections as peripheral
  Bluefruit.begin();
  Bluefruit.setTxPower(8);    // Maximum power
  Bluefruit.setName("very cool calendar we made");
  
  // Set the connect/disconnect callback handlers
  Bluefruit.Periph.setConnectCallback(connect_callback);
  Bluefruit.Periph.setDisconnectCallback(disconnect_callback);

  // Configure and start the custom service
  setupCalendarService();
  
  // Start advertising
  startAdv();

  display.clearDisplay();
  display.setCursor(0,0);
  display.println("Ready - press button");
  display.println("to send data");
  display.display();
  
  Serial.println("Bluetooth ready");
}

void setupCalendarService(void) {
  // Setup Calendar Service
  calendarService.begin();

  // Configure the data characteristic with proper permissions
  dataCharacteristic.setProperties(CHR_PROPS_READ | CHR_PROPS_NOTIFY);
  dataCharacteristic.setPermission(SECMODE_OPEN, SECMODE_NO_ACCESS);
  dataCharacteristic.setFixedLen(1); // 1 byte for the button state (0 or 1)
  dataCharacteristic.begin();
  
  // Set the initial value to 0
  uint8_t initialValue = 0;
  dataCharacteristic.write(&initialValue, 1);
}

void startAdv(void) {
  // Advertising packet
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();

  // Include the custom service UUID
  Bluefruit.Advertising.addService(calendarService);

  // Include Name
  Bluefruit.Advertising.addName();
  
  // Apple compatible advertising settings
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244);    // in unit of 0.625 ms
  Bluefruit.Advertising.setFastTimeout(30);      // number of seconds in fast mode
  Bluefruit.Advertising.start(0);                // 0 = Don't stop advertising 
}

void loop() {
  // Check if send button is pressed
  if(!digitalRead(SEND_BUTTON)) {
    unsigned long currentTime = millis();
    
    // Debounce the button press
    if (currentTime - lastButtonPress > debounceTime) {
      lastButtonPress = currentTime;
      
      // Toggle button state (0 to 1, 1 to 0)
      buttonState = (buttonState == 0) ? 1 : 0;
      
      // Update the characteristic value with the new state
      dataCharacteristic.write(&buttonState, 1);
      
      // Show on display
      display.clearDisplay();
      display.setCursor(0,0);
      display.print("Sent value: ");
      display.println(buttonState);
      display.setCursor(0,20);
      display.println("Press again to toggle");
      display.display();
      
      // Log to serial
      Serial.print("Button pressed, new state: ");
      Serial.println(buttonState);
      
      // Wait until button is released
      while(!digitalRead(SEND_BUTTON)) {
        delay(10);
      }
    }
  }

  // BLE disconnect button handling
  if(!digitalRead(BLE_BUTTON)) {
    int timeStart = millis();
    while(!digitalRead(BLE_BUTTON)) {
      int timeEnd = millis();
      int timeHeld = timeEnd - timeStart;
      
      if(timeHeld >= 2200) {
        display.clearDisplay();
        display.setCursor(0,0);
        display.println("Disconnecting...");
        display.display();
        Bluefruit.disconnect(Bluefruit.connHandle());
        break;
      }
    }
  }
}

void connect_callback(uint16_t conn_handle) {
  BLEConnection* connection = Bluefruit.Connection(conn_handle);
  
  char central_name[32] = {0};
  connection->getPeerName(central_name, sizeof(central_name));
  
  Serial.print("Connected to ");
  Serial.println(central_name);
  
  display.clearDisplay();
  display.setCursor(0,0);
  display.println("Bluetooth Connected");
  display.println("Press button to send data");
  display.display();
}

void disconnect_callback(uint16_t conn_handle, uint8_t reason) {
  (void) conn_handle;
  (void) reason;
  
  Serial.print("Disconnected, reason = 0x");
  Serial.println(reason, HEX);
  
  display.clearDisplay();
  display.setCursor(0,0);
  display.println("Bluetooth Disconnected");
  display.println("Advertising...");
  display.display();
}