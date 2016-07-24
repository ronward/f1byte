/*global */
/*
    
*/
(function(){
  "use strict";
  var q, log, logf
    , prog, info, data, i, t
  ;
  q = require("q");
  prog = require("./progF1");
  log = console.log
  logf = log.bind.bind(log, {});

  log("Testing");
  prog.enterProgMode();
  prog.led.red();
  if(false){
    prog.loadConfig();
    prog.incAddress(7);
    prog.loadProgData(0x3FC4);
    prog.beginProg();
    prog.incAddress();
    prog.loadProgData(0x3EFF);
    prog.beginProg();
  }
  info = prog.getInfo();
  log("info=", info);
  log("deviceId=", info.deviceId.toString(16), info.deviceId.toString(2));
  log("config1=", info.config1.toString(16));
  log("config2=", info.config2.toString(16));
  data = prog.getDeviceId();
  log("DeviceId", data.toString(16));
  if(false){
    prog.resetAddress();
    prog.loadProgData(0x0AAA);
    prog.incAddress();
    prog.loadProgData(0x1555);
    prog.incAddress();
    prog.loadProgData(0x2001);
    prog.incAddress();
    prog.loadProgData(0x3333);
    prog.beginProg();
  }
  if(false){
    prog.resetAddress();
    prog.loadEeData(0xA5);
    prog.beginProg();
    prog.incAddress();
    prog.loadEeData(0x5A);
    prog.beginProg();
  }
//  log("--Write Program--");
//  data=require("./output");
//  console.log("data.length=", data.length);
//  prog.writeProgram(0, data); 
  log("--Read Program--");
  data = prog.readProgram(0, 42);
  for(i=0; i<data.length; i+=1){
    log(i.toString(16), data[i].toString(16));
  }

i=Date.now();
log("--Reading 8K--");
prog.resetAddress();
data = prog.wPi.readProg(0x0800);
log(data.length);
log(data.substr(0,128));
data = prog.wPi.readProg(0x0800);
data = prog.wPi.readProg(0x0800);
data = prog.wPi.readProg(0x0800);
log("-- Done", Date.now()-i);

t=Date.now();
log("-=Reading 8K=-");
prog.resetAddress();
for(i=0; i<0x2000; i+=0x20){
  data = prog.wPi.readProg(0x20);
}
log("-=Done", Date.now()-t);

i=Date.now();
log("==Reading 8K==");
data = prog.readProgram(0, 0x2000);
log("== Done", Date.now()-i);
/*
  log("--EE Data--");
  data = prog.readAllEe();
  for(i=0; i<4; i+=1){
    log(i.toString(16), data[i].toString(16));
  }
*/

  prog.run();
  prog.led.green(); 
}());
