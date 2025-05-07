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

/*--------------------------------------------------*/
/*--       PIN AND VARIABLE INITIALIZATION        --*/
/*--------------------------------------------------*/

/*------------------------------------------*/
/*  Battery Pin - Analog Pin 6              */
/*  batteryPercent - percent of battery     */
/*  batteryChange - number of times the     */
/*            battery voltage level has     */
/*            changed (for hysteresis)      */
/*  batteryCheckTime - keep track of time   */
/*            since the battery percent was */
/*            checked last                  */
/*------------------------------------------*/
#define VBATPIN A6
float batteryPercent;
int batteryChange;
int batteryCheckTime;

/*------------------------------------------*/
/*  Oled Screen Details                     */
/*------------------------------------------*/
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3D
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

/*------------------------------------------*/
/*  Internal File System for storing the    */
/*  most recently used date.                */
/*------------------------------------------*/ 
#define DATES "/wutduhdate.txt"
File file(InternalFS);

/*------------------------------------------*/
/*  SEND_BUTTON - to signal end of entry,   */
/*            and sends the selected date.  */
/*  BLE_BUTTON - will disconnect the        */
/*            device from Bluetooth.        */
/*------------------------------------------*/
#define SEND_BUTTON 25
#define BLE_BUTTON 26

/*------------------------------------------*/
/*  Day and Month Variables:                */
/*  day/month - number corresponding to day */
/*        or month (e.g. month = 1 = Jan.)  */
/*  m - name of month, accessed in 'months' */
/*  lastDay/Month - num from last iteration */
/*        to determine if change occurred   */
/*  day/monthTime - time since last pin     */
/*        change to prevent flickering      */
/*        between interrupt calls           */
/*------------------------------------------*/
#define DAY_A 9
#define DAY_B 10
#define MONTH_A 12
#define MONTH_B 13
int dayB_status;
int monthB_status;
int day;
int month;
String m;
int lastDay;
int lastMonth;
int dayTime;
int monthTime;

#define months {"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"}

/*------------------------------------------*/
/*  Sensor Pins and Min/Max coordinates of  */
/*  the screen.                             */
/*------------------------------------------*/
#define TOP_R 11
#define TOP_L 6
#define SENSE 14
#define BOTTOM_L 5
#define BOTTOM_R 0

#define X_MAX 13000
#define X_MIN 8850
#define Y_MAX 13000
#define Y_MIN 8500

/*------------------------------------------*/
/*  Coordinate and Processing variables     */
/*------------------------------------------*/
unsigned short int x_raw;
unsigned short int y_raw;
int x_pos, last_x, delX;
int y_pos, last_y, delY;
int filtered_x;
int filtered_y;
int avg_x, last_avg_x, last_avg_x_2, last_avg_x_3, last_avg_x_4;
int avg_y, last_avg_y, last_avg_y_2, last_avg_y_3, last_avg_y_4;
int temp_x, temp_x_2, temp_x_3, temp_x_4;
int temp_y, temp_y_2, temp_y_3, temp_y_4;

#define coeff 0.1 // Filter equation coefficient

unsigned int coordz[1][2];
int numEntriesSame;

/*------------------------------------------*/
/*  Timing variables for send control       */
/*------------------------------------------*/
unsigned long lastCoordSendTime = 0;
const unsigned long COORD_SEND_INTERVAL = 10; // Send coordinates every 100ms
unsigned long messageCounter = 0; // To ensure each message is unique
unsigned long lastButtonPress = 0;
const unsigned long debounceTime = 300; // Debounce time for button

/*------------------------------------------*/
/*  BLE Service and Characteristic          */
/*  configuration                           */
/*------------------------------------------*/
#define CALENDAR_SERVICE_UUID "19B10000-E8F2-537E-4F6C-D104768A1214"
#define CALENDAR_DATA_CHAR_UUID "19B10001-E8F2-537E-4F6C-D104768A1214"

BLEService calendarService(CALENDAR_SERVICE_UUID);
BLECharacteristic dataCharacteristic(CALENDAR_DATA_CHAR_UUID);
BLEDis bledis; // Device Information Service
BLEBas blebas; // Battery Service

boolean isConnected = false;
boolean lastConnected = false;

/*------------------------------------------*/
/*  Function Prototypes                     */
/*------------------------------------------*/
void connect_callback(uint16_t conn_handle);
void disconnect_callback(uint16_t conn_handle, uint8_t reason);
void startAdv();
void readSensor();
void sendData();
void dayChange();
void monthChange();
void whatsTheDate();
void sendMessage(const char* msg);

/*--------------------------------------------------*/
/*--                SETUP FUNCTION                --*/
/*--------------------------------------------------*/
void setup() {
  // Serial.begin(115200); // <- for debugging

  /*---------------------------------------------------*/
  /*   Pin setup for user input (sensor, button, dial) */
  /*---------------------------------------------------*/
  // set top and bottom pins to output, and initialize to low
  pinMode(TOP_R, OUTPUT);
  pinMode(TOP_L, OUTPUT);
  pinMode(BOTTOM_L, OUTPUT);
  pinMode(BOTTOM_R, OUTPUT);
  digitalWrite(TOP_R, LOW);
  digitalWrite(TOP_L, LOW);
  digitalWrite(BOTTOM_L, LOW);
  digitalWrite(BOTTOM_R, LOW);
  // set sense pin to input
  pinMode(SENSE, INPUT);
  // Buttons
  pinMode(SEND_BUTTON, INPUT);
  pinMode(BLE_BUTTON, INPUT);
  // RPGs
  pinMode(DAY_A, INPUT);
  pinMode(DAY_B, INPUT);
  pinMode(MONTH_A, INPUT);
  pinMode(MONTH_B, INPUT);
  attachInterrupt(DAY_A, dayChange, RISING);
  attachInterrupt(MONTH_A, monthChange, RISING);
  // RPG status
  dayB_status = digitalRead(DAY_B);
  monthB_status = digitalRead(MONTH_B);

  /*---------------------------------------------------*/
  /*    ADC and coordinate filtering/averaging setup   */
  /*---------------------------------------------------*/
  numEntriesSame = 0;

  analogReadResolution(14);
  analogReference(AR_INTERNAL_2_4);

  float measuredvbat = analogRead(VBATPIN);
  measuredvbat *= 2;    
  measuredvbat *= 2.4;  // Multiply by 2.4V
  measuredvbat /= 16384; // convert to voltage
 
  batteryPercent = (measuredvbat/3.7) * 100;
  batteryChange = 0;
  batteryCheckTime = millis();

  /*---------------------------------------------------*/
  /*    Initialize Coordinate Processing Variables     */
  /*---------------------------------------------------*/
  last_x = 0; 
  last_y = 0;
  filtered_x = 0;
  filtered_y = 0;
  avg_x = last_avg_x = last_avg_x_2 = last_avg_x_3 = last_avg_x_4 = 0;
  avg_y = last_avg_y = last_avg_y_2 = last_avg_y_3 = last_avg_y_4 = 0;
  temp_x = temp_x_2 = temp_x_3 = temp_x_4 = 0;
  temp_y = temp_y_2 = temp_y_3 = temp_y_4 = 0;


  /*---------------------------------------------------*/
  /*    Bluetooth BLE CONFIG                           */
  /*---------------------------------------------------*/
  Bluefruit.configPrphBandwidth(BANDWIDTH_MAX);
  Bluefruit.begin();
  Bluefruit.setTxPower(4);
  Bluefruit.setName("very cool calendar we made");

  // Set up callbacks
  Bluefruit.Periph.setConnectCallback(connect_callback);
  Bluefruit.Periph.setDisconnectCallback(disconnect_callback);

  // Configure device information service
  bledis.setManufacturer("Aeris");
  bledis.setModel("beta");
  bledis.begin();

  // Configure battery service
  blebas.begin();
  blebas.write(100);

  // Setup the Custom Calendar Service
  calendarService.begin();

  // Configure the characteristic
  dataCharacteristic.setProperties(CHR_PROPS_READ | CHR_PROPS_NOTIFY);
  dataCharacteristic.setPermission(SECMODE_OPEN, SECMODE_NO_ACCESS);
  dataCharacteristic.setMaxLen(20); // Maximum payload size
  dataCharacteristic.setFixedLen(false); // Variable length data
  dataCharacteristic.begin();
  
  // Initialize with a default value
  uint8_t initialValue[] = "INIT";
  dataCharacteristic.write(initialValue, sizeof(initialValue) - 1);


  /*---------------------------------------------------*/
  /*  DATE SETUP (find previous value from previous    */
  /*  instance if it exists, otherwise: 1/1)           */
  /*---------------------------------------------------*/
  day = 1;
  month = 1;
  monthTime = 0;
  dayTime = 0;
  lastMonth = 1;
  lastDay = 1;

  // FILE SETUP/READ SAVED DATE (if it exists)
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

  //set month string to hold the correct month name
  int i = month - 1;
  m = (String[])months[i];

  /*---------------------------------------------------*/
  /*    OLED SCREEN CONFIG                             */
  /*---------------------------------------------------*/
  if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    for(;;); // Don't proceed, loop forever
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE, 0);

  /*---------------------------------------------------*/
  /*    Final initializations                          */
  /*---------------------------------------------------*/
  isConnected = false; //Bluetooth is not connected
  lastConnected = true; // so BT status is printed for the first time
  
  whatsTheDate(); //print out the system status to the OLED

  startAdv();
}

/*--------------------------------------------------*/
/*--                  MAIN LOOP                   --*/
/*--------------------------------------------------*/
void loop() {
  whatsTheDate();

  // Check if Send button is pressed (debounced)
  if(!digitalRead(SEND_BUTTON)){
    unsigned long currentTime = millis();
    if (currentTime - lastButtonPress > debounceTime) {
      lastButtonPress = currentTime;
      sendData();
      while (!digitalRead(SEND_BUTTON)) delay(10); // Wait for button release
    }
  }

  // Check if BLE button is held for disconnect
  if(!digitalRead(BLE_BUTTON)){
    int timeStart = millis();
    while(!digitalRead(BLE_BUTTON)){
      int timeEnd = millis();
      int timeHeld = timeEnd - timeStart;
      
      if(timeHeld >= 2000){
        Bluefruit.disconnect(Bluefruit.connHandle());
        break;
      }
    }
  }

  // Read from the sensor if connected, and periodically send data
  if(isConnected){
    readSensor();
    
    // Only send coordinate data at defined intervals
    unsigned long currentTime = millis();
    if (currentTime - lastCoordSendTime >= COORD_SEND_INTERVAL) {
      lastCoordSendTime = currentTime;
      
      // Only send if we have valid coordinates to share
      if (avg_x != 0 && avg_y != 0) {
        char coordBuffer[20];
        sprintf(coordBuffer, "C:%d,%d", coordz[0][0], coordz[0][1]);
        sendMessage(coordBuffer);
      }
    }
  }

  delay(1);
}

/*--------------------------------------------------*/
/*--                sendMessage()                 --*/
/*--------------------------------------------------*/
/*    Helper function to send messages with the     */
/*    proper format                                 */
/*--------------------------------------------------*/
void sendMessage(const char* msg) {
  dataCharacteristic.write((uint8_t*)msg, strlen(msg));
}

/*--------------------------------------------------*/
/*--                 readSensor()                 --*/
/*--------------------------------------------------*/
/*    Reads in ADC values for x and y. Shifts       */
/*    values to more readable coordinates. Filters  */
/*    the coordinates then averages them before     */
/*    sending.                                      */
/*--------------------------------------------------*/
void readSensor(){
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

    // check if the read value is within the limits for the sensor
    if(x_raw>=8000 && y_raw >= 8000){
      // shift and scale the coordinates to better numbers 
      y_pos = ((x_raw - X_MAX) * -1)/1;
      x_pos = ((y_raw - Y_MAX) * -1)/1.25;

      // calculate the difference between the last value and current
      delX = last_x - x_pos;
      delY = last_y - y_pos;

      // if the difference is too large, assume sensor not reading input from the user
      if(abs(delX)<250 && abs(delY)<250){
        // do not perform calcualtions if the coordinates read in are the same as the previous reading's coordinates
        if(x_pos != last_x || y_pos != last_y){
          // filter the coordinates (if there are no previous filtered values, just set to current x and y)
          if(filtered_x != 0 && filtered_y != 0){
            filtered_x = (coeff * x_pos) + (1 - coeff) * filtered_x;
            filtered_y = (coeff * y_pos) + (1 - coeff) * filtered_y; 
          }
          else{
            filtered_x = x_pos;
            filtered_y = y_pos;
          }

          // average the coordinates with up to 5 of the most recent averages
          if(avg_x != 0 && avg_y != 0){
            /*----------------------------------------------------------*/
            /* - keep track of the previous reading's averages -        */
            /*                                                          */
            /* before the averaging of the current loop:                */
            /* - filtered_x/y holds the current value                   */
            /* - avg_x/y holds the previous average                     */ 
            /* - last_avg_x/y holds the average from two loops ago      */
            /* - last_avg_x/y_2 holds the average from three loops ago  */
            /* - last_avg_x/y_3 holds the average from four loops ago   */
            /* - last_avg_x/y_4 holds the average from five loops ago   */
            /*----------------------------------------------------------*/
            temp_x = avg_x; 
            temp_y = avg_y;
            temp_x_2 = last_avg_x; 
            temp_y_2 = last_avg_y;
            temp_x_3 = last_avg_x_2; 
            temp_y_3 = last_avg_y_2;
            temp_x_4 = last_avg_x_3; 
            temp_y_4 = last_avg_y_3;

            // average the coordinates based on how many averages have been calculated per user input
            if(last_avg_x_4 != 0 && last_avg_y_4 != 0){
              avg_x = (last_avg_x_4 + last_avg_x_3 + last_avg_x_2 + last_avg_x + avg_x + filtered_x)/6;
              avg_y = (last_avg_y_4 + last_avg_y_3 + last_avg_y_2 + last_avg_y + avg_y + filtered_y)/6;
            }
            else if(last_avg_x_3 != 0 && last_avg_y_3 != 0){
              avg_x = (last_avg_x_3 + last_avg_x_2 + last_avg_x + avg_x + filtered_x)/5;
              avg_y = (last_avg_y_3 + last_avg_y_2 + last_avg_y + avg_y + filtered_y)/5;
            }
            else if(last_avg_x_2 != 0 && last_avg_y_2 != 0){
              avg_x = (last_avg_x_2 + last_avg_x + avg_x + filtered_x)/4;
              avg_y = (last_avg_y_2 + last_avg_y + avg_y + filtered_y)/4;
            }
            else if(last_avg_x !=0 && last_avg_y != 0){
              avg_x = (last_avg_x + avg_x + filtered_x)/3;
              avg_y = (last_avg_y + avg_y + filtered_y)/3;
            }
            else{
              avg_x = (avg_x + filtered_x)/2;
              avg_y = (avg_y + filtered_y)/2;
            }

            // update the values of the previous averages
            last_avg_x = temp_x;
            last_avg_y = temp_y;
            last_avg_x_2 = temp_x_2;
            last_avg_y_2 = temp_y_2;
            last_avg_x_3 = temp_x_3;
            last_avg_y_3 = temp_y_3;
            last_avg_x_4 = temp_x_4;
            last_avg_y_4 = temp_y_4;
          }
          else{
            avg_x = filtered_x;
            avg_y = filtered_y;
          }
          
          // Store coordinates for sending
          coordz[0][0] = avg_x;
          coordz[0][1] = avg_y;

          //for debugging in serial port
          // char urmom[12];
          // sprintf(urmom, "[%d,%d]", coordz[0][0], coordz[0][1]);
          // Serial.println(urmom);

          numEntriesSame = 0;
        }
        else {
          numEntriesSame++;

          // Reset values if the same coordinates are read multiple times
          if(numEntriesSame >= 5){
            filtered_x = 0;
            filtered_y = 0;
            avg_x = 0;
            avg_y = 0;
            last_avg_x = 0;
            last_avg_y = 0;
            last_avg_x_2 = 0;
            last_avg_y_2 = 0;
            last_avg_x_3 = 0;
            last_avg_y_3 = 0;
            last_avg_x_4 = 0;
            last_avg_y_4 = 0;

            numEntriesSame = 0;
          }
        }
      }
      else {
        // Reset values if coordinate change is too large
        filtered_x = 0;
        filtered_y = 0;
        avg_x = 0;
        avg_y = 0;
        last_avg_x = 0;
        last_avg_y = 0;
        last_avg_x_2 = 0;
        last_avg_y_2 = 0;
        last_avg_x_3 = 0;
        last_avg_y_3 = 0;
        last_avg_x_4 = 0;
        last_avg_y_4 = 0;
      }
    }
    else {
      // Reset values if coordinates are outside bounds
      filtered_x = 0;
      filtered_y = 0;
      avg_x = 0;
      avg_y = 0;
      last_avg_x = 0;
      last_avg_y = 0;
      last_avg_x_2 = 0;
      last_avg_y_2 = 0;
      last_avg_x_3 = 0;
      last_avg_y_3 = 0;
      last_avg_x_4 = 0;
      last_avg_y_4 = 0;
    }



    last_x = x_pos;
    last_y = y_pos;
}

/*--------------------------------------------------*/
/*--                  sendData()                  --*/
/*--------------------------------------------------*/
/*    Called when SEND_BUTTON is pressed. Sends     */
/*    "STOP", sends the set date, saves date to     */
/*    memory, then sends "END" and "START" to       */
/*    distinguish entries.                          */
/*--------------------------------------------------*/
void sendData(){
  if(Bluefruit.connected()){
    // Send "STOP" marker with timestamp to ensure uniqueness
    char stopMsg[20];
    sprintf(stopMsg, "STOP-%lu", messageCounter++);
    sendMessage(stopMsg);
    delay(10);  // Small delay between messages
    
    // Save date to internal storage and send it
    if(InternalFS.exists(DATES)){
      InternalFS.remove(DATES);
    }
    
    if(file.open(DATES, FILE_O_WRITE)){
      char datBuffer[20];
      sprintf(datBuffer, "%d,%d", month, day);
      file.write(datBuffer, strlen(datBuffer));
      file.close();
      
      // Send date with format that ensures uniqueness
      char dateMsg[20];
      sprintf(dateMsg, "DATE-%lu:%s", messageCounter++, datBuffer);
      sendMessage(dateMsg);
      delay(10);
    }
    
    // Send "END" marker with timestamp
    char endMsg[20];
    sprintf(endMsg, "END-%lu", messageCounter++);
    sendMessage(endMsg);
    delay(10);
    
    // Send "START" marker for next data set
    char startMsg[20];
    sprintf(startMsg, "START-%lu", messageCounter++);
    sendMessage(startMsg);
  }
}

/*--------------------------------------------------*/
/*--                  startAdv()                  --*/
/*--------------------------------------------------*/
/*    Begin BLE advertising. Initializes how BLE    */
/*    connection behaves.                           */
/*--------------------------------------------------*/
void startAdv(){
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  
  // Include the calendar service UUID
  Bluefruit.Advertising.addService(calendarService);
  
  Bluefruit.ScanResponse.addName();
  
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244);    // in unit of 0.625 ms
  Bluefruit.Advertising.setFastTimeout(30);      // number of seconds in fast mode
  Bluefruit.Advertising.start(0);                // 0 = Don't stop advertising 
}

/*--------------------------------------------------*/
/*--              connect_callback()              --*/
/*--------------------------------------------------*/
/*    Event handler for when BLE connects           */
/*--------------------------------------------------*/
void connect_callback(uint16_t conn_handle){
  isConnected = true;
  
  // Send initial START message
  char startMsg[20];
  sprintf(startMsg, "START-%lu", messageCounter++);
  sendMessage(startMsg);
  
  // Update battery level
  uint8_t battLevel = min(100, (int)batteryPercent);
  blebas.write(battLevel);
}

/*--------------------------------------------------*/
/*--            disconnect_callback()             --*/
/*--------------------------------------------------*/
/*    Event handler for when BLE disconnects        */
/*--------------------------------------------------*/
void disconnect_callback(uint16_t conn_handle, uint8_t reason){
  isConnected = false;
}

/*--------------------------------------------------*/
/*--                 dayChange()                  --*/
/*--------------------------------------------------*/
/*  Interrupt attached to day RPG. Updates the      */
/*  set day based on the direction turned.          */
/*--------------------------------------------------*/
void dayChange(){
  int time = millis();
  int diff = time - dayTime;

  if(abs(diff) > 10){
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

  dayTime = millis();
}

/*--------------------------------------------------*/
/*--                monthChange()                 --*/
/*--------------------------------------------------*/
/*  Interrupt attached to month RPG. Updates the    */
/*  set month based on the direction turned.        */
/*--------------------------------------------------*/
void monthChange(){
  int time = millis();
  int diff = time - monthTime;

  if(abs(diff) > 10){
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
  
  monthTime = millis();
}

/*--------------------------------------------------*/
/*--                whatsTheDate()                --*/
/*--------------------------------------------------*/
/* Displays the date, month, BLE                    */
/* connectivity status, and battery                 */
/* percent on the OLED screen.                      */
/*--------------------------------------------------*/
void whatsTheDate(){

  bool changeNeeded = false;

  if(lastMonth != month){
    display.setCursor(5,5);
    display.print("Month: ");
    display.print(m);
    if(sizeof(m) < 7){
      display.println("      ");
    }
    else{
      display.println("    ");
    }
  
    changeNeeded = true;
  }

  if(lastDay != day){
    display.setCursor(5,15);
    display.print("Day: ");
    display.print(day);
    display.println("  ");
    changeNeeded = true;
  }

  if(lastConnected != isConnected){
    if(isConnected){
      display.setCursor(5, 40);
      display.println("BLE: Connected    ");
    }
    else{
      display.setCursor(5, 40);
      display.println("BLE: Not Connected");
    }
    changeNeeded = true;
  }

  int time = millis();
  // 60000 ms = 1 minute i think lmao
  if(abs(time-batteryCheckTime) > 60000 || batteryCheckTime < 3000){
    float lastPercent = batteryPercent;

    float measuredvbat = analogRead(VBATPIN);
    measuredvbat *= 2;    
    measuredvbat *= 2.4;  // Multiply by 2.4V
    measuredvbat /= 16384; // convert to voltage
  
    batteryPercent = (measuredvbat/3.7) * 100;

    float delBattery = batteryPercent - lastPercent;
    // only update battery percent if readings have been 
    // different from the previous value > 5 times 
    if(abs(delBattery) > 0){
      batteryChange++;
      if(batteryChange > 5){
        batteryChange = 0;

        display.setCursor(5, 50);
        display.print("Battery: ");

        if(batteryPercent >= 100){
          display.println(100);
        }
        else{
          display.print(int(batteryPercent));
          display.println("  ");
        }

        changeNeeded = true;
      }
    else if(batteryChange > 0){
        batteryPercent = lastPercent;
      }
    }

    batteryCheckTime = millis();
  }

  
  if(changeNeeded){
    display.display();
  }  
  
  lastMonth = month;
  lastDay = day;
  lastConnected = isConnected;
}