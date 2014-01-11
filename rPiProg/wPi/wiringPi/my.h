
#ifndef	_STDINT_H
#  include <stdint.h>
#endif

#ifdef __cplusplus
extern "C" {
#endif

extern int test(int);
extern char* getGreeting(void);
extern char* toHexTest(int);

extern void setup(int powerPin, int mClrPin, int clkPin, int ioPin);
extern void powerOn(void);
extern void powerOff(void);
extern void reset(void);
extern void run(void);
extern void clkBitOut(int b);
extern int  clkBitIn(void);
extern void clkXOut(int data, int num);
extern int clkXIn(int num);
extern void delayXmS(int mS);
extern void delayXuS(int uS);
extern void startTiming(void);
extern int  getTiming(void);

extern void clk(void);
extern int  readData(void);
extern void writeData(int b);
extern void writeClk(int b);

extern void rgLedSetup(int redLowPin, int grnLowPin);
extern void ledRed(void);
extern void ledGreen(void);
extern void ledOff(void);


#ifdef __cplusplus
}
#endif
