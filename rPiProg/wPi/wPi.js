"use strict";
var ffi, wPi, log, setupAll, led, data, clk, close, isSetup=false;
ffi=require("node-ffi");
log = console.log;

wPi=ffi.Library("libwiringPi", {
  wiringPiSetup:["int", []],
  micros:["uint",[]],
  pinMode:["void",["int","int"]],
  digitalWrite:["void",["int","int"]],
  digitalRead:["int",["int"]],
  delay:["void",["int"]],
  delayMicroseconds:["void",["int"]],
  
  setup:["void", ["int", "int", "int", "int"]],
  powerOn:["void", []],
  powerOff:["void", []],
  reset:["void", []],
  run:["void", []],
  clkBitOut:["void", ["int"]],
  clkBitIn:["int", []],
  clkXOut:["void", ["int", "int"]],
  clkXIn:["int", ["int"]],
  delayXmS:["void", ["int"]],
  delayXuS:["void", ["int"]],
  startTiming:["void", []],
  getTiming:["int", []],
  clk:["void", []],
  readData:["int", []],
  writeData:["void", ["int"]],
  writeClk:["void", ["int"]],
  rgLedSetup:["void", ["int", "int"]],
  ledRed:["void", []],
  ledGreen:["void", []],
  ledOff:["void", []],
  readProg:["string", ["int"]],
  incAddress:["void", ["int"]],
  writeTo32WordPage:["void", ["string"]]
});

setupAll = function(){
  wPi.setup(7, 0, 2, 3);
  wPi.rgLedSetup(5, 4);
};

led = {red:wPi.ledRed, green:wPi.ledGreen, off:wPi.ledOff};
data = function(b){
  if(typeof(b)==="undefined"){
    return wPi.readData();
  }
  if(b){
    wPi.writeData(1);
  } else {
    wPi.writeData(0);
  }
};
data.low=data.bind({}, 0);
data.high=data.bind({}, 1);

clk = function(b){
  if(typeof(b)==="undefined"){
    wPi.clk();
  }
  if(b){
    wPi.writeClk(1);
  } else {
    wPi.writeClk(0);
  }
};
clk.low=clk.bind({}, 0);
clk.high=clk.bind({}, 1);
clk.dataIn=wPi.clkXIn;
clk.dataOut=wPi.clkXOut;

close = function(){
  wPi.reset();
  wPi.writeData(0);
  wPi.writeClk(0);
  wPi.powerOff();
  wPi.ledOff();
};

module.exports={
//  setupAll:setupAll
//  , setup:wPi.setup
  setup: function(){ if(isSetup){ return; } setupAll(); isSetup=true; }
  , close:close
  , power:{off:wPi.powerOff, on:wPi.powerOn}
  , reset:wPi.reset
  , run:wPi.run
  , mClr:{low:wPi.reset, high:wPi.run}
  , clk:clk
  , data:data
//  , clkBitOut:wPi.clkBitOut
//  , clkBitIn:wPi.clkBitIn
//  , clkXOut:wPi.ClkXOut
//  , clkXIn:wPi.ClkXIn
  
  , startTiming:wPi.startTiming
  , getTiming:wPi.getTiming
  , delayXmS:wPi.delayXmS
  , delayXuS:wPi.delayXuS

  , led:led
  , readProg:wPi.readProg
//  , rgLedSetup:wPi.rgLedSetup
//  , ledRed:wPi.ledRed
//  , ledGreen:wPi.ledGreen
//  , ledOff:wPi.ledOff

//  , delay:wPi.delay
//  , delayuS:wPi.delayMicroseconds
//  , micros:wPi.micros
//  , pinMode:wPi.pinMode
//  , read:wPi.digitalRead
//  , write:wPi.digitalWrite
};
