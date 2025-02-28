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

void startAdv();
void prph_connect_callback(uint16_t conn_handle);
void prph_disconnect_callback(uint16_t conn_handle, uint8_t reason);
void prph_bleuart_rx_callback(uint16_t conn_handle);

void scan_callback(ble_gap_evt_adv_report_t* report);
void cent_connect_callback(uint16_t conn_handle);
void cent_disconnect_callback(uint16_t conn_handle, uint8_t reason);

void cent_bleuart_rx_callback(BLEClientUart& cent_uart);

// Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// uart service
BLEUart bleuart;
BLEClientUart clientUart;


// BLEService ledService("19B10000-E8F2-537E-4F6C-D104768A1214"); // Bluetooth® Low Energy LED Service

// // Bluetooth® Low Energy LED Switch Characteristic - custom 128-bit UUID, read and writable by central
// BLEByteCharacteristic switchCharacteristic("19B10001-E8F2-537E-4F6C-D104768A1214", BLERead | BLEWrite);

// const int ledPin = LED_BUILTIN; // pin to use for the LED



/*-----------------  SETUP FCN   -------------------*/
void setup() {
  Serial.begin(115200);
  while (!Serial);


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

  // pinMode(BUTTON, INPUT);

  // analogReadResolution(12);
  // analogReference(AR_INTERNAL);

  // last_x = 0;
  // last_y = 0;
//END SENSOR SETUP

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

  Bluefruit.begin(1, 1);
  Bluefruit.setTxPower(4);

  // Callbacks
  Bluefruit.Periph.setConnectCallback(prph_connect_callback);
  Bluefruit.Periph.setDisconnectCallback(prph_disconnect_callback);

  Bluefruit.Central.setConnectCallback(cent_connect_callback);
  Bluefruit.Central.setDisconnectCallback(cent_disconnect_callback);

  bleuart.begin();
  bleuart.setRxCallback(prph_bleuart_rx_callback);

  clientUart.begin();
  clientUart.setRxCallback(cent_bleuart_rx_callback);

  /* Start Central Scanning
   * - Enable auto scan if disconnected
   * - Interval = 100 ms, window = 80 ms
   * - Filter only accept bleuart service
   * - Don't use active scan
   * - Start(timeout) with timeout = 0 will scan forever (until connected)
   */
  Bluefruit.Scanner.setRxCallback(scan_callback);
  Bluefruit.Scanner.restartOnDisconnect(true);
  Bluefruit.Scanner.setInterval(160, 80); // in unit of 0.625 ms
  Bluefruit.Scanner.filterUuid(bleuart.uuid);
  Bluefruit.Scanner.useActiveScan(false);
  Bluefruit.Scanner.start(0);                   // 0 = Don't stop scanning after n seconds

  // Set up and start advertising
  startAdv();

  // // begin initialization
  // if (!BLE.begin()) {
  //   Serial.println("starting Bluetooth® Low Energy module failed!");
  //   // display.println(F("BLE failure"));
  //   // display.display();
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
//SENSOR ACTIONS TO BE UNCOMMENTED LATER
  // read();

  // if(!digitalRead(BUTTON)){
  //   button();
  // }

  // char test[40];

  // sprintf(test, "X:%d  Y:%d", x_pos, y_pos);

  // Serial.println(test);
  // delay(10);
//END SENSOR ACTIONS


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

void startAdv(void)
{
  // Advertising packet
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();

  // Include bleuart 128-bit uuid
  Bluefruit.Advertising.addService(bleuart);

  // Secondary Scan Response packet (optional)
  // Since there is no room for 'Name' in Advertising packet
  Bluefruit.ScanResponse.addName();

  /* Start Advertising
   * - Enable auto advertising if disconnected
   * - Interval:  fast mode = 20 ms, slow mode = 152.5 ms
   * - Timeout for fast mode is 30 seconds
   * - Start(timeout) with timeout = 0 will advertise forever (until connected)
   *
   * For recommended advertising interval
   * https://developer.apple.com/library/content/qa/qa1931/_index.html
   */
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244);    // in unit of 0.625 ms
  Bluefruit.Advertising.setFastTimeout(30);      // number of seconds in fast mode
  Bluefruit.Advertising.start(0);                // 0 = Don't stop advertising after n seconds
}

/*------------------------------------------------------*/
/*  Peripheral                                          */
/*------------------------------------------------------*/
void prph_connect_callback(uint16_t conn_handle){
  // reference to current connection
  BLEConnection* connection = Bluefruit.Connection(conn_handle);

  char peer_name[32] = {0};
  connection -> getPeerName(peer_name, sizeof(peer_name));

  Serial.print("[Prph] Connected to ");
  Serial.println(peer_name);
}

void prph_disconnect_callback(uint16_t conn_handle, uint8_t reason){
  (void) conn_handle;
  (void) reason;

  Serial.println();
  Serial.println("[Prph] Disconnected");
}

void prph_bleuart_rx_callback(uint16_t conn_handle)
{
  (void) conn_handle;
  
  // Forward data from Mobile to our peripheral
  char str[20+1] = { 0 };
  bleuart.read(str, 20);

  Serial.print("[Prph] RX: ");
  Serial.println(str);  

  if ( clientUart.discovered() )
  {
    clientUart.print(str);
  }else
  {
    bleuart.println("[Prph] Central role not connected");
  }
}

/*------------------------------------------------------------------*/
/* Central
 *------------------------------------------------------------------*/
void scan_callback(ble_gap_evt_adv_report_t* report)
{
  // Since we configure the scanner with filterUuid()
  // Scan callback only invoked for device with bleuart service advertised  
  // Connect to the device with bleuart service in advertising packet  
  Bluefruit.Central.connect(report);
}

void cent_connect_callback(uint16_t conn_handle)
{
  // Get the reference to current connection
  BLEConnection* connection = Bluefruit.Connection(conn_handle);

  char peer_name[32] = { 0 };
  connection->getPeerName(peer_name, sizeof(peer_name));

  Serial.print("[Cent] Connected to ");
  Serial.println(peer_name);;

  if ( clientUart.discover(conn_handle) )
  {
    // Enable TXD's notify
    clientUart.enableTXD();
  }else
  {
    // disconnect since we couldn't find bleuart service
    Bluefruit.disconnect(conn_handle);
  }  
}

void cent_disconnect_callback(uint16_t conn_handle, uint8_t reason)
{
  (void) conn_handle;
  (void) reason;
  
  Serial.println("[Cent] Disconnected");
}

/**
 * Callback invoked when uart received data
 * @param cent_uart Reference object to the service where the data 
 * arrived. In this example it is clientUart
 */
void cent_bleuart_rx_callback(BLEClientUart& cent_uart)
{
  char str[20+1] = { 0 };
  cent_uart.read(str, 20);
      
  Serial.print("[Cent] RX: ");
  Serial.println(str);

  if ( bleuart.notifyEnabled() )
  {
    // Forward data from our peripheral to Mobile
    bleuart.print( str );
  }else
  {
    // response with no prph message
    clientUart.println("[Cent] Peripheral role not connected");
  }  
}