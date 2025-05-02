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

using namespace Adafruit_LittleFS_Namespace;
using namespace std;

#define VBATPIN A6
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3D
#define DATES "/wutduhdate.txt"

File file(InternalFS);

#define SEND_BUTTON 25
#define BLE_BUTTON 26

#define DAY_A 9
#define DAY_B 10
int dayB_status;
#define MONTH_A 12
#define MONTH_B 13
int monthB_status;
int day;
int month;
String d;
String m;
int monthTime;
int dayTime;

#define months {"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"}

#define TOP_R 11
#define TOP_L 6
#define SENSE 14
#define BOTTOM_L 5
#define BOTTOM_R 0

#define X_MAX 13000
#define X_MIN 8850
#define Y_MAX 13000
#define Y_MIN 8500

unsigned short int x_raw, y_raw;
int x_pos, y_pos, last_x, last_y, delX, delY;
int filtered_x, filtered_y, avg_x, avg_y;
int last_avg_x, last_avg_y, temp_x, temp_y;
int last_avg_x_2, last_avg_y_2, temp_x_2, temp_y_2;
int last_avg_x_3, last_avg_y_3, temp_x_3, temp_y_3;
int last_avg_x_4, last_avg_y_4, temp_x_4, temp_y_4;
#define coeff 0.1

unsigned int coordz[1][2];
int numEntriesSame;

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
BLEService calendarService("19B10000-E8F2-537E-4F6C-D104768A1214");
BLECharacteristic dataCharacteristic("19B10001-E8F2-537E-4F6C-D104768A1214");
bool isConnected = false;

unsigned long lastButtonPress = 0;
const unsigned long debounceTime = 300;

void connect_callback(uint16_t conn_handle);
void disconnect_callback(uint16_t conn_handle, uint8_t reason);
void startAdv();
void readSensor();
void sendData();
void dayChange();
void monthChange();
void whatsTheDate();

void setup() {
  Serial.begin(115200);

  pinMode(TOP_R, OUTPUT); pinMode(TOP_L, OUTPUT);
  pinMode(BOTTOM_L, OUTPUT); pinMode(BOTTOM_R, OUTPUT);
  digitalWrite(TOP_R, LOW); digitalWrite(TOP_L, LOW);
  digitalWrite(BOTTOM_L, LOW); digitalWrite(BOTTOM_R, LOW);
  pinMode(SENSE, INPUT);

  pinMode(SEND_BUTTON, INPUT);
  pinMode(BLE_BUTTON, INPUT);
  pinMode(DAY_A, INPUT); pinMode(DAY_B, INPUT);
  pinMode(MONTH_A, INPUT); pinMode(MONTH_B, INPUT);

  attachInterrupt(DAY_A, dayChange, RISING);
  attachInterrupt(MONTH_A, monthChange, RISING);

  InternalFS.begin();
  file.open(DATES, FILE_O_READ);
  if(file){
    char buffer[64] = {0};
    uint32_t len = file.read(buffer, sizeof(buffer));
    buffer[len] = 0;
    sscanf(buffer, "%d,%d", &month, &day);
    file.close();
  } else {
    day = 1; month = 1;
  }
  int i = month - 1;
  m = (String[])months[i];

  analogReadResolution(14);
  analogReference(AR_INTERNAL_2_4);
  float measuredvbat = analogRead(VBATPIN) * 2 * 2.4 / 16384;
  batteryPercent = (measuredvbat / 3.7) * 100;
  batteryChange = 0;

  if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) while(1);
  display.clearDisplay(); display.setTextSize(1); display.setTextColor(SSD1306_WHITE);

  Bluefruit.begin();
  Bluefruit.setTxPower(4);
  Bluefruit.setName("very cool calendar we made");
  Bluefruit.Periph.setConnectCallback(connect_callback);
  Bluefruit.Periph.setDisconnectCallback(disconnect_callback);

  calendarService.begin();
  dataCharacteristic.setProperties(CHR_PROPS_READ);
  dataCharacteristic.setPermission(SECMODE_OPEN, SECMODE_NO_ACCESS);
  dataCharacteristic.setFixedLen(20);
  dataCharacteristic.begin();
  uint8_t initVal[1] = {'0'};
  dataCharacteristic.write(initVal, 1);

  startAdv();
  whatsTheDate();
}

void loop() {
  whatsTheDate();

  if (!digitalRead(SEND_BUTTON)) {
    unsigned long currentTime = millis();
    if (currentTime - lastButtonPress > debounceTime) {
      lastButtonPress = currentTime;
      sendData();
      while (!digitalRead(SEND_BUTTON)) delay(10);
    }
  }

  if (!digitalRead(BLE_BUTTON)) {
    int timeStart = millis();
    while (!digitalRead(BLE_BUTTON)) {
      if ((millis() - timeStart) >= 2000) {
        Bluefruit.disconnect(Bluefruit.connHandle());
        break;
      }
    }
  }
}

void sendData() {
  if (!Bluefruit.connected()) return;

  const char* parts[] = {"START", "430 280", "STOP", "4,27", "END"};
  for (int i = 0; i < 5; i++) {
    const char* msg = parts[i];
    dataCharacteristic.write((uint8_t*)msg, strlen(msg));
    delay(200);
  }
}

void startAdv() {
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(calendarService);
  Bluefruit.Advertising.addName();
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244);
  Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);
}

void connect_callback(uint16_t conn_handle) {
  isConnected = true;
  const char* msg = "START";
  dataCharacteristic.write((uint8_t*)msg, strlen(msg));
}

void disconnect_callback(uint16_t conn_handle, uint8_t reason) {
  isConnected = false;
}

void dayChange() {
  int time = millis();
  if (abs(time - dayTime) > 10) {
    dayB_status = digitalRead(DAY_B);
    day += (dayB_status == 1) ? 1 : -1;
    if (month == 2) day = constrain(day, 1, 28);
    else if (month == 4 || month == 6 || month == 9 || month == 11) day = constrain(day, 1, 30);
    else day = constrain(day, 1, 31);
    dayTime = millis();
  }
}

void monthChange() {
  monthB_status = digitalRead(MONTH_B);
  month += (monthB_status == 1) ? 1 : -1;
  if (month > 12) month = 1;
  if (month < 1) month = 12;
  int i = month - 1;
  m = (String[])months[i];
}

void whatsTheDate() {
  display.clearDisplay();
  display.setCursor(5, 5); display.print("Month: "); display.println(m);
  display.setCursor(5, 15); display.print("Day: "); display.println(day);
  display.setCursor(5, 40); display.println(isConnected ? "BLE: Connected" : "BLE: Not Connected");

  float lastPercent = batteryPercent;
  float measuredvbat = analogRead(VBATPIN) * 2 * 2.4 / 16384;
  display.setCursor(5, 50); display.print("Battery: ");
  batteryPercent = (measuredvbat / 3.7) * 100;
  float delBattery = batteryPercent - lastPercent;

  if (abs(delBattery) > 0) {
    batteryChange++;
    if (batteryChange > 5) batteryChange = 0;
    else if (batteryChange > 0) batteryPercent = lastPercent;
  }
  display.println((batteryPercent >= 100) ? 100 : int(batteryPercent));
  display.display();
}




// #include <bluefruit.h>
//  #include <SPI.h>
//  #include <Wire.h>
//  #include <Adafruit_GFX.h>
//  #include <Adafruit_SSD1306.h>
//  #include <string>
//  #include <vector>
//  #include <stdlib.h>
//  #include <Arduino.h>
 
//  #define SCREEN_WIDTH 128
//  #define SCREEN_HEIGHT 64
 
//  #define OLED_RESET -1
//  #define SCREEN_ADDRESS 0x3D
 
//  #define SEND_BUTTON 25
//  #define BLE_BUTTON 26
 
//  // Define a custom service and characteristic UUID
//  // This way we have full control over the permissions
//  #define CALENDAR_SERVICE_UUID        "19B10000-E8F2-537E-4F6C-D104768A1214"
//  #define CALENDAR_DATA_CHAR_UUID      "19B10001-E8F2-537E-4F6C-D104768A1214"
 
//  Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
 
//  // Create a custom BLE service and characteristic
//  BLEService calendarService(CALENDAR_SERVICE_UUID);
//  BLECharacteristic dataCharacteristic(CALENDAR_DATA_CHAR_UUID);
 
//  // Variable to avoid button bouncing
//  unsigned long lastButtonPress = 0;
//  const unsigned long debounceTime = 300; // 300ms debounce
 
//  // Variable to store last sent value
//  uint8_t buttonState = 0;

//  int counter = 0;
 
//  // Function declarations
//  void startAdv(void);
//  void connect_callback(uint16_t conn_handle);
//  void disconnect_callback(uint16_t conn_handle, uint8_t reason);
//  void setupCalendarService(void); // Added missing declaration
 
//  void setup() {
//    Serial.begin(115200);
   
//    // Button setup
//    pinMode(SEND_BUTTON, INPUT);
//    pinMode(BLE_BUTTON, INPUT);
   
//    // Display setup
//    if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
//      Serial.println(F("SSD1306 allocation failed"));
//      for(;;); // Don't proceed, loop forever
//    }
//    display.clearDisplay();
//    display.setTextSize(1);
//    display.setTextColor(SSD1306_WHITE);
//    display.setCursor(0,0);
//    display.println("Initializing...");
//    display.display();
   
//    // Initialize Bluefruit with maximum connections as peripheral
//    Bluefruit.begin();
//    Bluefruit.setTxPower(8);    // Maximum power
//    Bluefruit.setName("very cool calendar we made");
   
//    // Set the connect/disconnect callback handlers
//    Bluefruit.Periph.setConnectCallback(connect_callback);
//    Bluefruit.Periph.setDisconnectCallback(disconnect_callback);
 
//    // Configure and start the custom service
//    setupCalendarService();
   
//    // Start advertising
//    startAdv();
 
//    display.clearDisplay();
//    display.setCursor(0,0);
//    display.println("Ready - press button");
//    display.println("to send data");
//    display.display();
   
//    Serial.println("Bluetooth ready");
//  }
 
//  void setupCalendarService(void) {
//   calendarService.begin();

//   dataCharacteristic.setProperties(CHR_PROPS_READ | CHR_PROPS_NOTIFY);
//   dataCharacteristic.setPermission(SECMODE_OPEN, SECMODE_NO_ACCESS);
//   dataCharacteristic.setMaxLen(20);
//   dataCharacteristic.setFixedLen(false);
//   dataCharacteristic.begin();

//   const char* initialValue = "INIT";
//   dataCharacteristic.write(initialValue, strlen(initialValue));
// }
 
//  void startAdv(void) {
//    // Advertising packet
//    Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
//    Bluefruit.Advertising.addTxPower();
 
//    // Include the custom service UUID
//    Bluefruit.Advertising.addService(calendarService);
 
//    // Include Name
//    Bluefruit.Advertising.addName();
   
//    // Apple compatible advertising settings
//    Bluefruit.Advertising.restartOnDisconnect(true);
//    Bluefruit.Advertising.setInterval(32, 244);    // in unit of 0.625 ms
//    Bluefruit.Advertising.setFastTimeout(30);      // number of seconds in fast mode
//    Bluefruit.Advertising.start(0);                // 0 = Don't stop advertising 
//  }
 



//  void loop() {
//   // Check if send button is pressed
//   if(!digitalRead(SEND_BUTTON)) {
//     unsigned long currentTime = millis();

//     if (currentTime - lastButtonPress > debounceTime) {
//       lastButtonPress = currentTime;

//       // // Increment value to ensure it's always different
//       // buttonState = (buttonState + 1) % 256;

//       // // Write to characteristic
//       // dataCharacteristic.write(&buttonState, 1);

//       // // Log to serial
//       // Serial.print("🔵 Data sent over BLE: ");
//       // Serial.println(buttonState);

//       uint8_t end[] = {"STOP"};

//       if (strcmp(end, "STOP") == 0) {
//         end[5] = {"START"}
//       } else {
//         end[] = {"STOP"}
//       }

//       dataCharacteristic.write(end, sizeof(end));

//       delay(200);

//       String message = String(counter);
//       dataCharacteristic.write(message.c_str(), message.length());
//       Serial.print("🔵 Data sent over BLE: ");
//       Serial.println(message);
//       counter++;



//       // Show on OLED
//       display.clearDisplay();
//       display.setCursor(0, 0);
//       display.println("Data Sent:");
//       display.setCursor(0, 10);
//       display.print("Value: ");
//       display.println(message);
//       display.display();

//       while (!digitalRead(SEND_BUTTON)) delay(10);
//     }
//   }

//   // BLE disconnect
//   if (!digitalRead(BLE_BUTTON)) {
//     int timeStart = millis();
//     while (!digitalRead(BLE_BUTTON)) {
//       if (millis() - timeStart >= 2200) {
//         display.clearDisplay();
//         display.setCursor(0, 0);
//         display.println("Disconnecting...");
//         display.display();
//         Bluefruit.disconnect(Bluefruit.connHandle());
//         break;
//       }
//     }
//   }
// }




 
//  void connect_callback(uint16_t conn_handle) {
//    BLEConnection* connection = Bluefruit.Connection(conn_handle);
   
//    char central_name[32] = {0};
//    connection->getPeerName(central_name, sizeof(central_name));
   
//    Serial.print("Connected to ");
//    Serial.println(central_name);
   
//    display.clearDisplay();
//    display.setCursor(0,0);
//    display.println("Bluetooth Connected");
//    display.println("Press button to send data");
//    display.display();
//  }
 
//  void disconnect_callback(uint16_t conn_handle, uint8_t reason) {
//    (void) conn_handle;
//    (void) reason;
   
//    Serial.print("Disconnected, reason = 0x");
//    Serial.println(reason, HEX);
   
//    display.clearDisplay();
//    display.setCursor(0,0);
//    display.println("Bluetooth Disconnected");
//    display.println("Advertising...");
//    display.display();
//  }


