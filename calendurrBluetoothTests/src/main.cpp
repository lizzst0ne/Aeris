// NRF52840 Firmware with Enhanced BLE Chunked Data Transmission
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
const char* months[] = {"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"};

#define TOP_R 11
#define TOP_L 6
#define SENSE 14
#define BOTTOM_L 5
#define BOTTOM_R 0

#define X_MAX 2150
#define X_MIN 1490
#define Y_MAX 2115
#define Y_MIN 1400
#define X_LIMIT 330
#define Y_LIMIT 357

unsigned short int x_raw, y_raw;
int x_pos, y_pos, last_x, last_y, delX, delY;
unsigned char coordsArray[X_LIMIT][Y_LIMIT] = {0};
unsigned int coordz[1000][2];
int numEntries = 0;

BLEDis bledis;
BLEUart bleuart;
BLEBas blebas;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
boolean isConnected = false;

void connect_callback(uint16_t conn_handle);
void disconnect_callback(uint16_t conn_handle, uint8_t reason);
void startAdv();
void sendData();
void whatsTheDate();
void dayChange();
void monthChange();

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

  analogReadResolution(12);
  analogReference(AR_INTERNAL);
  last_x = 0; last_y = 0;

  display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS);
  display.clearDisplay(); display.setTextSize(1); display.setTextColor(SSD1306_WHITE);

  Bluefruit.configPrphBandwidth(BANDWIDTH_MAX);
  Bluefruit.begin();
  Bluefruit.setTxPower(4);
  Bluefruit.Periph.setConnectCallback(connect_callback);
  Bluefruit.Periph.setDisconnectCallback(disconnect_callback);
  Bluefruit.setName("very cool calendar we made");

  bledis.setManufacturer("Aeris");
  bledis.setModel("beta");
  bledis.begin();

  bleuart.begin();
  bleuart.notifyEnabled();
  blebas.begin();
  blebas.write(100);
  startAdv();

  InternalFS.begin();
  day = 1; month = 1;
  if (file.open(DATES, FILE_O_READ)) {
    char buffer[64] = {0};
    uint32_t len = file.read(buffer, sizeof(buffer));
    buffer[len] = 0;
    sscanf(buffer, "%d,%d", &month, &day);
    file.close();
  }
  m = months[month - 1];
  whatsTheDate();
}

void loop() {
  if (!digitalRead(SEND_BUTTON)) sendData();
  if (!digitalRead(BLE_BUTTON)) {
    int timeStart = millis();
    while (!digitalRead(BLE_BUTTON)) {
      if ((millis() - timeStart) >= 2000) {
        Bluefruit.disconnect(Bluefruit.connHandle());
        break;
      }
    }
  }
  whatsTheDate();
  delay(10);
}

void sendData() {
  bleuart.write("START\n");
  delay(20);
  char chunk[20];
  for (int i = 0; i < numEntries; i++) {
    snprintf(chunk, sizeof(chunk), "%04d:[%d,%d],", i, coordz[i][0], coordz[i][1]);
    bleuart.write((uint8_t*)chunk, strlen(chunk));
    delay(15); // Give iOS time to process
  }
  bleuart.write("STOP\n");

  if (InternalFS.exists(DATES)) InternalFS.remove(DATES);
  if (file.open(DATES, FILE_O_WRITE)) {
    char dat[8];
    sprintf(dat, "%d,%d", month, day);
    file.write(dat, strlen(dat));
    file.close();
  }
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

void connect_callback(uint16_t conn_handle) {
  isConnected = true;
  whatsTheDate();
  Serial.println("Connected");
}

void disconnect_callback(uint16_t conn_handle, uint8_t reason) {
  isConnected = false;
  whatsTheDate();
  Serial.println("Disconnected");
}

void whatsTheDate() {
  display.clearDisplay();
  display.setCursor(5,5);
  display.print("Month: "); display.println(m);
  display.setCursor(5,15);
  display.print("Day: "); display.println(day);
  display.setCursor(5,40);
  display.println(isConnected ? "BLE: Connected" : "BLE: Not Connected");
  float vbat = analogRead(VBATPIN);
  vbat *= 2 * 3.6 / 1024;
  display.setCursor(5,50);
  display.print("Battery: "); display.println(vbat);
  display.display();
}

void dayChange() {
  dayB_status = digitalRead(DAY_B);
  day += (dayB_status == 1) ? 1 : -1;
  if (month == 2) day = constrain(day, 1, 28);
  else if (month == 4 || month == 6 || month == 9 || month == 11) day = constrain(day, 1, 30);
  else day = constrain(day, 1, 31);
}

void monthChange() {
  monthB_status = digitalRead(MONTH_B);
  month += (monthB_status == 1) ? 1 : -1;
  if (month > 12) month = 1;
  if (month < 1) month = 12;
  m = months[month - 1];
}