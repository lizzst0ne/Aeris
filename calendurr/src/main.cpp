#include <bluefruit.h>
#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <string>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3D

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

#define months {"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"}

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

#define SCALE_FACTOR 10

unsigned short int x_raw;
unsigned short int y_raw;

int x_pos;
int y_pos;

int last_x;
int last_y;

int delX;
int delY;

unsigned char coordsArray[X_LIMIT][Y_LIMIT] = {0};

void read();
void button();

void connect_callback(uint16_t conn_handle);
void disconnect_callback(uint16_t conn_handle, uint8_t reason);
void startAdv();

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

BLEDis bledis;
BLEUart bleuart;
BLEBas blebas;

void dayChange();
void monthChange();

/*-----------------  SETUP FCN   -------------------*/
void setup() {
  Serial.begin(115200);
  //while (!Serial);


//SENSOR SETUP
  // set top and bottom pins to output, and initialize to low
  // pinMode(TOP_R, OUTPUT);
  // pinMode(TOP_L, OUTPUT);
  // pinMode(BOTTOM_L, OUTPUT);
  // pinMode(BOTTOM_R, OUTPUT);
  // digitalWrite(TOP_R, LOW);
  // digitalWrite(TOP_L, LOW);
  // digitalWrite(BOTTOM_L, LOW);
  // digitalWrite(BOTTOM_R, LOW);
  // // set sense pin to output
  // pinMode(SENSE, INPUT);

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
  day = 1;
  month = 1;

  // analogReadResolution(12);
  // analogReference(AR_INTERNAL);

  // last_x = 0;
  // last_y = 0;
//END SENSOR SETUP

  if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("SSD1306 allocation failed"));
    for(;;); // Don't proceed, loop forever
  }


  
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

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);
  
}


/*-----------------  MAIN LOOP   -------------------*/
void loop() {
//SENSOR ACTIONS TO BE UNCOMMENTED LATER
  // read();

  if(!digitalRead(SEND_BUTTON)){
    //button();
    //uint8_t buf[] = {"hi"};
    uint8_t buf[] = {"1"};
    bleuart.write(buf, sizeof(buf));
    display.clearDisplay();
    display.setCursor(0,0);
    //display.println("hi :)");
    display.println("Sent: 1");
    display.display();
    Serial.println("1");
  }

  if(!digitalRead(BLE_BUTTON)){
    //timer to keep track of how long button has been held
    int timeStart = millis();
    while(!digitalRead(BLE_BUTTON)){
      int timeEnd = millis();

      int timeHeld = timeEnd - timeStart;
      
      //when the timer exceeds 2.2 seconds or something the ble will be disconnected and 
      //automatically start searching for another device to pair with
      if(timeHeld >= 2200){
     
        Bluefruit.disconnect(Bluefruit.connHandle());
        break;
      }
    }

    

    // //uint8_t buf[] = {"your mother"};
    // uint8_t buf[] = {"0"};
    // bleuart.write(buf, sizeof(buf));
    // display.clearDisplay();
    // //display.setCursor(20,0);
    // //display.println("your mother");
    // display.setCursor(0,0);
    // display.println("Sent: 0");
    // display.display();
  }

  // char test[40];

  // sprintf(test, "X:%d  Y:%d", x_pos, y_pos);

  // Serial.println(test);
  // delay(10);
//END SENSOR ACTIONS

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


  
}

void read(){

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
    coordsArray[x_pos][y_pos] = 1;
  }


  last_x = x_pos;
  last_y = y_pos;

  //Serial.println(x);
}

void button(){

  for(int i = Y_LIMIT- 1; i >= 0; i--){
      //j is x coord
      for(int j = X_LIMIT - 1; j >= 0; j--){
        char c = coordsArray[j][i];
        Serial.printf("%d", c);
      }
      Serial.print("\n");
  }

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

  display.clearDisplay();
  display.setCursor(0,0);
  display.println("Bluetooth Connected");
  display.display();
}

void disconnect_callback(uint16_t conn_handle, uint8_t reason){
  (void) conn_handle;
  (void) reason;

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
  Serial.println(day);
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
  if(month <= 0){
    month = 12;
  }
  Serial.println(month);
}

void whatsTheDate(){
  int i = month - 1;
  m = (String[])months[i];
}