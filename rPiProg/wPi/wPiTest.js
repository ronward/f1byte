"use strict";
var wPi, log, flash, st, count=0;
wPi=require("./wPi");
log = console.log;

log("OK");
flash = function(n){
 if(n===0) { return; }
 wPi.red();
 wPi.delay(500);
 wPi.green();
 wPi.delay(500);
 flash(n-1);
};
//flash(60);
st=wPi.micros()+1000000*30;
while(wPi.micros()<st){
 wPi.red(); wPi.green();
 count+=1;
}
log("ok", count);

