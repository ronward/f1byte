/*global */
(function(){
  "use strict";
  var 
      LOADCONFIG=0x00, LOADPROGDATA=0x02, LOADDATADATA=0x03
    , READPROGDATA=0x04, READDATADATA=0x05
    , INCADD=0x06, RESETADD=0x16
    , BEGINPROG=0x08      // 2.5mS (5mS EE)
    , BULKERASEPROG=0x09  // 10mS
    , BULKERASEDATA=0x0B  // 10mS
    , ROWERASEPROG=0x11   // 2.5mS
    , wPi, q, log
    , setup, close
    , power
    , reset, run
    , clk, data
    , startTiming, getTiming
    , delayXmS, delayXuS
    , led
    , doCommand, readWord, writeWord
    , currentAddress, nop
    , prog
  ;
  wPi = require("./wPi/wPi");
  q = require("q");
  log = console.log;
  nop = function(){};
  prog = {wPi:wPi};
  setup = wPi.setup;
  close = wPi.close;
  power = wPi.power;
  reset = wPi.reset;
  run = wPi.run;
  clk = wPi.clk;
  data = wPi.data;
  startTiming = wPi.startTiming;
  getTiming = wPi.getTiming;
  delayXmS = wPi.delayXmS;
  delayXuS = wPi.delayXuS;
  led = wPi.led;

  setup();

  doCommand = function(cmd){
    clk.dataOut(cmd, 6);
  };

  readWord = function(){
    var data;
    data = clk.dataIn(16);
    data = (data>>1) & 0x3FFF;
    return data;
  };

  writeWord = function(data){
    clk.dataOut(data*2, 16);
  };

  prog.close = close;
  prog.run = function(){ data(); power.on(); run(); };
  prog.reset = reset;
  prog.led = led;

  prog.getCurrentAddress = function(){
    return currentAddress;
  };

  prog.enterProgMode = function(){
    reset();
    power.on();
    data.high();
    clk.high();
    delayXmS(250);
    data.low();
    clk.low();
    run();
    delayXmS(50);
    reset();
    delayXmS(50);
    clk.dataOut(0x4850, 16);
    clk.dataOut(0x4D43, 17);
    delayXmS(1);
    return prog;
  };

  prog.getDeviceId = function(){
    prog.loadConfig();
    prog.incAddress(6);
    return prog.readProgData()>>5;
  };

  prog.resetAddress = function(){
    doCommand(RESETADD);
    currentAddress = 0;
    return prog;
  };

  prog.incAddress = function(n){
    var incAdd, i;
    if(n===null || n===undefined){
      n=1;
    }
    for(i=0; i<n; i+=1){ 
      doCommand(INCADD); 
    }
    currentAddress += n;
    return prog;
  };

  prog.loadConfig = function(data){
    data = data || 0x3FFF;
    doCommand(LOADCONFIG);
    writeWord(data);
    currentAddress=0x8000;
    return prog;
  };

  prog.readProgData = function(){
    doCommand(READPROGDATA);
    return readWord();
  };

  prog.loadProgData = function(data){
    if(data===null || data===undefined){
      return prog;
    }
    doCommand(LOADPROGDATA);
    writeWord(data);
    return prog;
  };

  prog.beginProg = function(delay){
    delay = delay || 3;
    doCommand(BEGINPROG);
    delayXuS(delay*1000);
    return prog;
  };

  prog.loadEeData = function(data){
    doCommand(LOADDATADATA);
    writeWord(data);
    return prog;
  };

  prog.readEeData = function(){
    doCommand(READDATADATA);
    return readWord();
  };

  prog.getInfo = function(){
    var i, t, info={userId:[]};
    prog.loadConfig();
    for(i=0; i<4; i+=1){    // 0x8000 - 0x8003
      info.userId.push(prog.readProgData());
      prog.incAddress();
    }
    prog.incAddress(2);
    t = prog.readProgData();  // 0x8006
    info._deficeIdRev = t;
    info.deviceId = t>>5;
    info.revNo = t & 0x1F;
    prog.incAddress();
    info.config1 = prog.readProgData();   // 0x8007
    prog.incAddress();
    info.config2 = prog.readProgData();   // 0x8008
    prog.incAddress();
    info.cal1 = prog.readProgData();      // 0x8009
    prog.incAddress();
    info.cal2 = prog.readProgData();      // 0x800A
    return info;
  };

  prog.readAllEe = function(){
    var i, arr=[];
    prog.resetAddress();
    for(i=0; i<256; i+=1){
      arr.push(prog.readEeData());
      prog.incAddress();
    }
    return arr;
  };

  prog.gotoAddress = function(address){
    if(address & 0x8000){
      prog.loadConfig();
      address = address & 0xFF;
      prog.incAddress(address);
    } else {
      if(address===currentAddress){
        nop();
      } else if(address>currentAddress){
        prog.incAddress(address-currentAddress);
      } else {
        prog.resetAddress();
        prog.incAddress(address);
      }
    }
    return prog;
  };

  prog.rowErase = function(address){
    prog.gotoAddress(address);
    doCommand(ROWERASEPROG);
    delayXmS(5);                       // check
    return prog;
  };

  prog.readProgram = function(fromAddress, amount){
    var i, arr=[];
    prog.gotoAddress(fromAddress);
    for(i=0; i<amount; i+=1){
      arr.push(prog.readProgData());
      prog.incAddress();
    }
    return arr;
  };

  prog.writeProgram = function(fromAddress, dataArr){
    var vAddress, i, x;
    vAddress = fromAddress & 0x7FE0;  // to the lowest 32 Word boundary
    if(vAddress!==fromAddress){
      // fix up
      console.log("***** ERROR: fromAddress must be (32Word) page aligned! ****");
      return -1; // for now
    }
    x = dataArr.length & 0x1F; // to the higest 32 Word boundary
    if(x){
      x=32-x;
      for(i=0; i<x; i+=1){
        dataArr.push(null);
      }
    }
    prog.gotoAddress(fromAddress);
//console.log("fromAddress=", fromAddress);
//console.log("size=", dataArr.length);
//return;
    for(i=0; i<dataArr.length; i+=1){
      if((i&31)===0){
        doCommand(ROWERASEPROG);
        delayXmS(5);                       // check
      }
      prog.loadProgData(dataArr[i]);
      if((i&31)===31){
        prog.beginProg();
      }
      prog.incAddress();
    }
  }

  module.exports = prog;
}());

