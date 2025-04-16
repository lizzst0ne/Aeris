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

// Battery pin
#define VBATPIN A6

// OLED Details
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3D

// file ?
#define DATES "/wutduhdate.txt"

File file(InternalFS);

// Buttons
#define SEND_BUTTON 25
#define BLE_BUTTON 26

// Day and month deets
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

#define months {"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"}

// Sensor Pins and Details
#define TOP_R 11
#define TOP_L 6
#define SENSE 14
#define BOTTOM_L 5
#define BOTTOM_R 0

#define X_MAX 2150
#define X_MIN 1490
#define Y_MAX 2115
#define Y_MIN 1400

#define X_LIMIT 330 //660
#define Y_LIMIT 357 //715

#define SCALE_FACTOR 10 // not actually being used rn i think

unsigned short int x_raw;
unsigned short int y_raw;

int x_pos;
int y_pos;

int last_x;
int last_y;

int delX;
int delY;

unsigned char coordsArray[X_LIMIT][Y_LIMIT] = {0};

unsigned int coordz[1][2];
int numEntries; // prob dont need this 


// Bluetooth functions
void connect_callback(uint16_t conn_handle);
void disconnect_callback(uint16_t conn_handle, uint8_t reason);
void startAdv();

// screen init
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Bluetooth stuff
BLEDis bledis;
BLEUart bleuart;
BLEBas blebas;

// if Bluetooth is connected or not
boolean isConnected;

// Button Functions
void readSensor();
void sendData();
// Date and printing Functions (interrupts for the knobs)
void dayChange();
void monthChange();
void whatsTheDate();

/*-----------------  SETUP FCN   -------------------*/
void setup() {
  Serial.begin(115200);
  while (!Serial);



  //SENSOR SETUP
  // set top and bottom pins to output, and initialize to low
  pinMode(TOP_R, OUTPUT);
  pinMode(TOP_L, OUTPUT);
  pinMode(BOTTOM_L, OUTPUT);
  pinMode(BOTTOM_R, OUTPUT);
  digitalWrite(TOP_R, LOW);
  digitalWrite(TOP_L, LOW);
  digitalWrite(BOTTOM_L, LOW);
  digitalWrite(BOTTOM_R, LOW);
  // set sense pin to output
  pinMode(SENSE, INPUT);

  pinMode(SEND_BUTTON, INPUT);
  pinMode(BLE_BUTTON, INPUT);

  pinMode(DAY_A, INPUT);
  pinMode(DAY_B, INPUT);
  pinMode(MONTH_A, INPUT);
  pinMode(MONTH_B, INPUT);

  attachInterrupt(DAY_A, dayChange, RISING);
  attachInterrupt(MONTH_A, monthChange, RISING);

  dayB_status = digitalRead(DAY_B);
  monthB_status = digitalRead(MONTH_B);

  numEntries = 0;

  analogReadResolution(12);
  analogReference(AR_INTERNAL);

  last_x = 0;
  last_y = 0;
//END SENSOR SETUP

  if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("SSD1306 allocation failed"));
    for(;;); // Don't proceed, loop forever
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  


  /*---------------------------------------------------*/
  /*    Bluetooth BLE CONFIG                           */
  /*---------------------------------------------------*/
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
  bleuart.write(3);

  blebas.begin();
  blebas.write(100);

  startAdv();

  /*---------------------------------------------------*/
  /*  DATE SETUP (find previous value from previous    */
  /*  instance if it exists, otherwise: 1/1)           */
  /*                                                   */
  /*  Includes the File Setup/First read               */    
  /*---------------------------------------------------*/
  day = 1;
  month = 1;

  // FILE SETUP/READ
  InternalFS.begin();

  file.open(DATES, FILE_O_READ);

  if(file){
    uint32_t len;
    char buffer[64] = {0};

    len = file.read(buffer, sizeof(buffer));
    buffer[len] = 0;

    sscanf(buffer, "%d,%d", &month, &day); //update the month and day values

    file.close();
  }
  else{Serial.println("LOESERRR");}

  //set month string to hold the correct month name
  int i = month - 1;
  m = (String[])months[i];

  isConnected = false;//Bluetooth is not connected
  
  whatsTheDate();//print out the system status to the OLED

  //while(!Bluefruit.connected());

  // uint8_t front[] = {"START"};
  // bleuart.write(front, sizeof(front));

}


/*-----------------  MAIN LOOP   -------------------*/
void loop() {

  if(!digitalRead(SEND_BUTTON)){
    sendData();
  }

  if(!digitalRead(BLE_BUTTON)){
    //timer to keep track of how long button has been held
    int timeStart = millis();
    while(!digitalRead(BLE_BUTTON)){
      int timeEnd = millis();

      int timeHeld = timeEnd - timeStart;
      
      //when the timer exceeds 2 seconds or something the ble will be disconnected and 
      //automatically start searching for another device to pair with
      if(timeHeld >= 2000){
     
        Bluefruit.disconnect(Bluefruit.connHandle());
        break;
      }
    }

  }

  while(Serial.available()){
    delay(2);

    uint8_t buf[64];
    int count = Serial.readBytes(buf, sizeof(buf));
    bleuart.write(buf, count);
  }
  
  while(bleuart.available()){
    uint8_t ch;
    ch = (uint8_t) bleuart.read();
    Serial.write(ch);
  }

  // if(isConnected){

  //   //////////////////////////////////////////////////
  //   // set up pins to read in X coordinate
  //   digitalWrite(TOP_R, HIGH);
  //   digitalWrite(TOP_L, HIGH);
  //   digitalWrite(BOTTOM_L, LOW);
  //   digitalWrite(BOTTOM_R, LOW);
    
  //   delay(1);
  //   // read in x position
  //   x_raw = analogRead(SENSE);

  //   // set up pins to read in Y coordinate
  //   digitalWrite(TOP_R, HIGH);
  //   digitalWrite(TOP_L, LOW);
  //   digitalWrite(BOTTOM_L, HIGH);
  //   digitalWrite(BOTTOM_R, LOW);

  //   delay(1);
  //   // read in y position
  //   y_raw = analogRead(SENSE);

  //   x_pos = (x_raw - X_MIN)/5;
  //   y_pos = (y_raw - Y_MIN)/5;

  //   delX = x_pos - last_x;
  //   delY = y_pos - last_y;

  //   if(delX > -1 && delX < 1 && delY > -1 && delY < 1){

  //     if(x_pos != (signed int)coordz[0][0] && y_pos != (signed int)coordz[0][1]){
  //       //coordsArray[x_pos][y_pos] = 1;
  //       coordz[0][0] = x_pos;
  //       coordz[0][1] = y_pos;

  //       numEntries++;

  //       //int size = 9;

  //       // Serial.print(delX);
  //       // Serial.print(" ");
  //       // Serial.println(delY);

  //       // char coord[size];
  //       // sprintf(coord, "[%d,%d],", coordz[0][0], coordz[0][1]);
  //       // Serial.println(coord);
  //       // bleuart.write(coord, sizeof(coord));
  //     }
  //   }

  //   // Serial.print(x_raw);
  //   // Serial.print(" ");
  //   // Serial.println(y_raw);

  //   // char coord[9];
  //   // sprintf(coord, "[%d,%d],", x_raw, y_raw);
  //   // Serial.println(coord);

  //   last_x = x_pos;
  //   last_y = y_pos;

    

  // }

  
  

/////////////////////////////////////////

  //readSensor();
  delay(10);
  whatsTheDate();
  
}

void readSensor(){
  Serial.println("READ");
  // set up pins to read in X coordinate
  digitalWrite(TOP_R, HIGH);
  digitalWrite(TOP_L, HIGH);
  digitalWrite(BOTTOM_L, LOW);
  digitalWrite(BOTTOM_R, LOW);
  
  delay(1);
  // read in x position
  x_raw = analogRead(SENSE);

  // set up pins to read in Y coordinate
  digitalWrite(TOP_R, HIGH);
  digitalWrite(TOP_L, LOW);
  digitalWrite(BOTTOM_L, HIGH);
  digitalWrite(BOTTOM_R, LOW);

  delay(1);
  // read in y position
  y_raw = analogRead(SENSE);

  x_pos = (x_raw - X_MIN)/2;
  y_pos = (y_raw - Y_MIN)/2;

  delX = x_pos - last_x;
  delY = y_pos - last_y;

  if(delX > -6 && delX < 6 && delY > -6 && delY < 6){
    
    //std::string coords = std::to_string(x_pos) + ' ' + std::to_string(y_pos);

    if(coordsArray[x_pos][y_pos] == 0){
      coordsArray[x_pos][y_pos] = 1;
      coordz[numEntries][0] = x_pos;
      coordz[numEntries][1] = y_pos;

      numEntries++;
      //coordinates.push_back(coords);
    }
  }

  last_x = x_pos;
  last_y = y_pos;

  //Serial.println(x);
}

void sendData(){
  //prints out the array in 1's and 0's
  // for(int i = Y_LIMIT- 1; i >= 0; i--){
  //     //j is x coord
  //     for(int j = X_LIMIT - 1; j >= 0; j--){
  //       char c = coordsArray[j][i];
  //       Serial.printf("%d", c);
  //     }
  //     Serial.print("\n");
  // }

  //UNCOMMENT LATER
  // uint8_t front[] = {"START"};
  // bleuart.write(front, sizeof(front));

  // for(int i = 0; i < numEntries; i++){
  //   int size = 9;

  //   char coord[size];
  //   sprintf(coord, "[%d,%d],", coordz[i][0], coordz[i][1]);

  //   bleuart.write(coord, sizeof(coord));
    
    // Serial.print("{");
    // Serial.println(coord);
  // }
  // Serial.println("}");

  //UNCOMMENT LATER

  // uint8_t end[] = {"STOP"};
  // bleuart.write(end, sizeof(end));

  if(InternalFS.exists(DATES)){
    InternalFS.remove(DATES);
  }
  if(file.open(DATES,FILE_O_WRITE)){
     char dat[8];
    sprintf(dat, "%d,%d", month, day);
    file.write(dat, strlen(dat));
    file.close();
  }else{Serial.println("AA");}

}

void startAdv(){
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();

  Bluefruit.Advertising.addService(bleuart);

  Bluefruit.ScanResponse.addName();

  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244);
  Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);
}

void connect_callback(uint16_t conn_handle){
  BLEConnection* connection = Bluefruit.Connection(conn_handle);

  char central_name[32] = {0};
  connection -> getPeerName(central_name, sizeof(central_name));

  Serial.print("connected to ");
  Serial.println(central_name);

  isConnected = true;
  whatsTheDate();
}

void disconnect_callback(uint16_t conn_handle, uint8_t reason){
  (void) conn_handle;
  (void) reason;

  isConnected = false;
  whatsTheDate();

  Serial.println();
  Serial.print("disconnected, reason 0x");
  Serial.println(reason, HEX);
}

void dayChange(){
  dayB_status = digitalRead(DAY_B);

  if(dayB_status == 1){
    day++;
  }
  else if(dayB_status == 0){
    day--;
  }

  if(month == 2){
    if(day <= 0){
      day = 28;
    }
    else if(day > 28){
      day = 1;
    }
  }
  else if(month == 1 || month == 3 || month == 5 || month == 7 || month == 8 || month == 10 || month == 12){
    if(day <= 0){
      day = 31;
    }
    else if(day > 31){
      day = 1;
    }
  }
  else{
    if(day <= 0){
      day = 30;
    }
    else if(day > 30){
      day = 1;
    }
  }  
}

void monthChange(){
  monthB_status = digitalRead(MONTH_B);

  if(monthB_status == 1){
    month++;
  }
  else if(monthB_status == 0){
    month--;
  }
  if(month >= 13){
    month = 1;
  }
  else if(month <= 0){
    month = 12;
  }

  int i = month - 1;
  m = (String[])months[i];

}

void whatsTheDate(){
  display.clearDisplay();
  display.setCursor(5,5);
  display.print("Month: ");
  display.println(m);

  display.setCursor(5,15);
  display.print("Day: ");
  display.println(day);
  

  if(isConnected){
    display.setCursor(5, 40);
    display.println("BLE: Connected");
  }
  else{
    display.setCursor(5, 40);
    display.println("BLE: Not Connected");
  }

  float measuredvbat = analogRead(VBATPIN);
  measuredvbat *= 2;    // we divided by 2, so multiply back
  measuredvbat *= 3.6;  // Multiply by 3.6V, our reference voltage
  measuredvbat /= 1024; // convert to voltage
  //Serial.print("VBat: " ); Serial.println(measuredvbat);
  display.setCursor(5, 50);
  display.print("Battery: ");
  display.println(measuredvbat);
  
  
  display.display();
}