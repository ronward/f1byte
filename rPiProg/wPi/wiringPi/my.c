

#include <stdint.h>

#include "wiringPi.h"
#include "my.h"

static char str[]="Hello there.";
static char hexTable[]="0123456789ABCDEFx";
static char buf[1030];

static int  powerpin;
static int  mclrpin;
static int  clkpin;
static int  datapin;
static int  datamode;
static unsigned int stime;
static int redlowpin;
static int greenlowpin;

void setup(int powerPin, int mClrPin, int clkPin, int ioPin){
  wiringPiSetup();
  powerpin=powerPin;
  mclrpin=mClrPin;
  clkpin=clkPin;
  datapin=ioPin;
  pinMode(powerpin, OUTPUT);
  digitalWrite(powerpin, 0);
  pinMode(mclrpin, OUTPUT);
  digitalWrite(mclrpin, 0);
  pinMode(clkpin, OUTPUT);
  digitalWrite(clkpin, 0);
  pinMode(datapin, OUTPUT);
  digitalWrite(datapin, 0);
  datamode=OUTPUT;
}

void writeData(int b){
  if(datamode!=OUTPUT){
    pinMode(datapin, OUTPUT);
    datamode=OUTPUT;
    delayXuS(1);
  }
  digitalWrite(datapin, b);
}

int readData(){
  if(datamode!=INPUT){
    pinMode(datapin, INPUT);
    datamode=INPUT;
    delayXuS(1);
  }
  return digitalRead(datapin);
}

void writeClk(int b){
  digitalWrite(clkpin, b);
}

void powerOn(){
  digitalWrite(powerpin, 1);
}

void powerOff(){
  digitalWrite(powerpin, 0);
}

void reset(){
  digitalWrite(mclrpin, 0);
}

void run(){
  digitalWrite(mclrpin, 1);
}

void startTiming(){
  stime = micros();
}

int getTiming(){
  unsigned int t;
  t = micros();
  t = t - stime;
  t = t & 0x7FFFFFFF;
  return (int)t;
}

void delayXmS(int mS){
  delay(mS);
}

void delayXuS(int uS){
  delayMicroseconds(uS);
}

void clk(void){
  delayXuS(1);
  digitalWrite(clkpin, 1);
  delayXuS(1);
  digitalWrite(clkpin, 0);
  delayXuS(1);
}

void clkBitOut(int b){
  writeData(b);
  delayXuS(1);
  clk();
}

int clkBitIn(){
  readData();
  delayXuS(1);
  clk();
  return readData();
}

void clkXOut(int data, int num){
  int i, b;
  if(datamode!=OUTPUT){
    pinMode(datapin, OUTPUT);
    datamode=OUTPUT;
    delayXuS(1);
  }
  for(i=0; i<num; i+=1){
    b = data & 1;
    digitalWrite(datapin, b);
    data = data >> 1;
    clk();
  }
}

int clkXIn(int num){
  int data, i, b;
  data=0;
  if(datamode!=INPUT){
   pinMode(datapin, INPUT);
   datamode=INPUT;
   delayXuS(1);
  }
  for(i=0; i<num; i+=1){
    clk();
    b = digitalRead(datapin);
    data += b<<i;           // LSB
  }
  return data;
}


void rgLedSetup(int redLowPin, int grnLowPin){
  redlowpin=redLowPin;
  greenlowpin=grnLowPin;
  pinMode(redlowpin, OUTPUT);
  pinMode(greenlowpin, OUTPUT);
  ledOff();
}

void ledRed(void){
  digitalWrite(redlowpin, 0);
  digitalWrite(greenlowpin, 1);
}

void ledGreen(void){
  digitalWrite(redlowpin, 1);
  digitalWrite(greenlowpin, 0);
}

void ledOff(void){
  digitalWrite(redlowpin, 1);
  digitalWrite(greenlowpin, 1);
}


char nibbleToHex(int n){
  return hexTable[n & 0x0F];
}

int hexCharToInt(char c){  // assume only valid hex characters
  if(c<'0') { return 0; }
  c-='0';
  if(c>9) { c&=7; c+=9; }   // g will return 16
  return c;
}

void hexStringToIntArray(char *str, int a[], int num){
  int n, i, c;
  // 4 chars per int
  for(n=0; n<num; n+=1){
    i=0;
    for(c=0; c<4; c+=1){
      i<<=4;
      i=hexCharToInt(str[n*4+c]);
    }
    a[n]=i;
  }
}

void intToHex(int x, int bufOffset){
  bufOffset = bufOffset & 0x03FF;
  buf[bufOffset+4]=0;
  buf[bufOffset+3]=nibbleToHex(x);
  buf[bufOffset+2]=nibbleToHex(x>>4);
  buf[bufOffset+1]=nibbleToHex(x>>8);
  buf[bufOffset] = nibbleToHex(x>>12);
}

int test(int x){
  return x+1;
}

char* getGreeting(void){
  return str; 
}

char* toHexTest(int x){
  intToHex(x, 0);
  return  buf;
}

