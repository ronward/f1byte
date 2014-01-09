/*globals */
(function(){
  "use strict";
  var fs, compiler, log, toHex, toBin
    , test
  ;
  fs = require("fs");
  log = console.log;
  compiler = require("./picCompiler");
  toHex = compiler.toHex;
  toBin = compiler.toBin;

  test = function(){
    var i, c, fn, src, result, code;
    if(process.argv.length>2){
      log(process.argv);
      fn = process.argv[2];
      src = fs.readFileSync(fn) + "\n";
      log("-- From " + fn +" --");
    } else {
      log("-- Using test string --");
      src = "defFile(f,0x42);defBit(b1, f.1);defBit(b2, f.2);\n";
      src += "nop;clrWdt;sleep;reset;retfie;return;return 32;option(w);trisA(w);\n";
      src += "start: goto start; start(); setPCLATH(start); setPCLATH(1);nop();\n";
      src += "b2.set();b2.clr();nop();f+=1;nop();\n";
      src += "if(b2){reset();}else{clrWdt();}nop();\n";
      src += "if(f){reset();}nop();\n";
    }
    result = compiler.processStr(src);
    log("Done in "+result.processTime+"Secs.");
    code = result.code;
    for(i=0; i<code.length; i+=1){
      c = code[i];
      if(c!==undefined && c!==null){
        log(toHex(i), " ", toHex(c), " ", toBin(c));
      }
    }
    log(result.labels);
    if(process.argv.length>3){
      fn = process.argv[3];
      if(fn.substr(-5)!==".json"){ fn+=".json"; }
      fs.writeFileSync(fn, JSON.stringify(code));
    }
  };

  test();
}());
