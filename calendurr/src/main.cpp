// #include <ArduinoBLE.h>
#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <string>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3D

#define BUTTON 25

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

// Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);


// BLEService ledService("19B10000-E8F2-537E-4F6C-D104768A1214"); // Bluetooth® Low Energy LED Service

// // Bluetooth® Low Energy LED Switch Characteristic - custom 128-bit UUID, read and writable by central
// BLEByteCharacteristic switchCharacteristic("19B10001-E8F2-537E-4F6C-D104768A1214", BLERead | BLEWrite);

// const int ledPin = LED_BUILTIN; // pin to use for the LED



/*-----------------  SETUP FCN   -------------------*/
void setup() {
  Serial.begin(115200);
  while (!Serial);

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

  pinMode(BUTTON, INPUT);

  analogReadResolution(12);
  analogReference(AR_INTERNAL);

  last_x = 0;
  last_y = 0;


  // if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
  //   Serial.println(F("SSD1306 allocation failed"));
  //   for(;;); // Don't proceed, loop forever
  // }

  // display.clearDisplay();
  // display.setTextSize(1);
  // display.setTextColor(SSD1306_WHITE);
  // display.setCursor(0,0);

  // // set LED pin to output mode
  // pinMode(ledPin, OUTPUT);

  // // begin initialization
  // if (!BLE.begin()) {
  //   Serial.println("starting Bluetooth® Low Energy module failed!");
  //   display.println(F("BLE failure"));
  //   display.display();
  //   while (1);
  // }

  // // set advertised local name and service UUID:
  // BLE.setLocalName("urmom");
  // BLE.setDeviceName("urmom");
  // BLE.setAdvertisedService(ledService);

  // // add the characteristic to the service
  // ledService.addCharacteristic(switchCharacteristic);

  // // add service
  // BLE.addService(ledService);

  // // set the initial value for the characeristic:
  // switchCharacteristic.writeValue(0);

  // // start advertising
  // BLE.advertise();

  // Serial.println("BLE LED Peripheral");
  // display.clearDisplay();
  // display.setCursor(0,0);
  // display.println(F("miau"));
  // display.display();
}


/*-----------------  MAIN LOOP   -------------------*/
void loop() {

  read();

  if(!digitalRead(BUTTON)){
    button();
  }

  char test[40];

  sprintf(test, "X:%d  Y:%d", x_pos, y_pos);

  Serial.println(test);
  delay(10);

  // // listen for Bluetooth® Low Energy peripherals to connect:
  // BLEDevice central = BLE.central();

  // // if a central is connected to peripheral:
  // if (central) {
  //   Serial.print("Connected to central: ");
  //   display.clearDisplay();
  //   display.setCursor(0,0);
  //   display.println(F("Connected to BLE"));
  //   display.display();
  //   // print the central's MAC address:
  //   Serial.println(central.address());

  //   // while the central is still connected to peripheral:
  //   while (central.connected()) {
  //       if (switchCharacteristic.written()) {
  //         if (switchCharacteristic.value()) {  
  //           display.clearDisplay();
  //           display.setCursor(0,0);
  //           display.println(F("LED on")); 
  //           display.display();
  //           Serial.println("LED on");
  //           digitalWrite(ledPin, LOW); // changed from HIGH to LOW       
  //         } else {                      
  //           display.clearDisplay();
  //           display.setCursor(0,0);
  //           display.println(F("LED off"));  
  //           display.display();     
  //           Serial.println(F("LED off"));
  //           digitalWrite(ledPin, HIGH); // changed from LOW to HIGH     
  //         }
  //       }
  //   }

  //   // when the central disconnects, print it out:
  //   Serial.print(F("Disconnected from central: "));
  //   display.clearDisplay();
  //   display.setCursor(0,0);
  //   display.println(F("disconnected from BLE"));
  //   display.display();
  //   Serial.println(central.address());
  // }
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