#include <bluefruit.h>
#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Arduino.h>
#include <InternalFileSystem.h>
#include <Adafruit_LittleFS.h>

using namespace Adafruit_LittleFS_Namespace;

// OLED
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3D
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// BLE
BLEDis bledis;
BLEUart bleuart;
BLEBas blebas;
bool isConnected = false;

// Pins
#define SEND_BUTTON 25
#define VBATPIN A6

// Date storage
#define DATES "/wutduhdate.txt"
File file(InternalFS);
int day = 1;
int month = 1;

// Sample coordinate data
const int coordz[3][2] = {
  {112, 345},
  {116, 348},
  {118, 351}
};

// BLE setup
void connect_callback(uint16_t conn_handle) {
  isConnected = true;
  bleuart.write((uint8_t*)"START", 5);
}
void disconnect_callback(uint16_t conn_handle, uint8_t reason) {
  isConnected = false;
}
void startAdv() {
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(bleuart);
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244);
  Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);
}

// BLE transmit logic
void sendData() {
  if (!isConnected) return;

  // STOP after current data
  bleuart.write((uint8_t*)"STOP", 4);

  // Save and send date
  char dateBuf[6];
  sprintf(dateBuf, "%d,%d", month, day);

  if (InternalFS.exists(DATES)) InternalFS.remove(DATES);
  if (file.open(DATES, FILE_O_WRITE)) {
    file.write(dateBuf, strlen(dateBuf));
    file.close();
  }

  if (month < 10 && day < 10) {
    bleuart.write((uint8_t*)dateBuf, 3);
  } else {
    bleuart.write((uint8_t*)dateBuf, strlen(dateBuf));
  }

  // END then START again
  bleuart.write((uint8_t*)"END", 3);
  bleuart.write((uint8_t*)"START", 5);
}

// OLED
void drawStatus() {
  display.clearDisplay();
  display.setCursor(0, 0);
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.println(isConnected ? "BLE: Connected" : "BLE: Not Connected");
  display.display();
}

void setup() {
  pinMode(SEND_BUTTON, INPUT);
  InternalFS.begin();
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) while (true);
  drawStatus();

  Bluefruit.begin();
  Bluefruit.setTxPower(4);
  Bluefruit.setName("very cool calendar we made");

  Bluefruit.Periph.setConnectCallback(connect_callback);
  Bluefruit.Periph.setDisconnectCallback(disconnect_callback);

  bledis.begin();
  bleuart.begin();
  bleuart.notifyEnabled();
  blebas.begin();
  blebas.write(100);

  startAdv();
}

void loop() {
  drawStatus();

  if (!digitalRead(SEND_BUTTON)) {
    delay(300); // debounce

    // Send test coordinates
    for (int i = 0; i < 3; i++) {
      char coord[12];
      snprintf(coord, sizeof(coord), "%d %d", coordz[i][0], coordz[i][1]);
      bleuart.write((uint8_t*)coord, strlen(coord));
      delay(20); // spacing to help Bluefy process it
    }

    sendData(); // STOP + DATE + END + START
  }

  delay(10);
}
