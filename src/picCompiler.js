/*global */
(function(){
  "use strict";
  var fs, log
  	, pegParser
    , f1
  	, compiler
    , ids={}
    , currentAddress=0
    , code=[], labels={}
    , error
    , assertLabelDefined, assertIsFileIdent
    , assertIsFileOrNumberIdent
    , processInstructions, resolveLabels
    , processDirective, processAssignmentInst
    , processCallGotoReturnInst
    , procInst
    , handleInsts
    , WREG=0x09
    , toHex
    , testSrc, test
  ;
  fs = require("fs");
  log = console.log;
  pegParser = require("./picParser");
  f1 = require("./pic16f1").instructions;  // .opcode .opEx
  Object.keys(f1).forEach(function(key){
    var inst = f1[key];
    inst.opcode = parseInt(inst.opcode, 16);
  });
  compiler = {};
  // options.ids = {all:{}, consts:{}, files:{}, bits:{}, addresses:{}}
  // "predefs.bf1"
  testSrc = "nop;clrWdt;sleep;reset;retfie;return;return 32;option(w);trisA(w);";
  testSrc += "start: goto start; start(); setPCLATH(start); setPCLATH(1);"

  compiler.processFile = function(filename){
  	var src;
  	src = fs.readFileSync(filename);
  	return compiler.processStr(src);
  };

  compiler.processStr = function(src){
    var results;
    results = pegParser.parse(src, {ids:ids});
    processInstructions(results.instDirects);
    resolveLabels();
  };

  error = function(msg, inst){
    if(inst){
      msg += "\n\tat line:"+inst.line+", column:"+inst.column;
    }
    log("ERROR:", msg);
  };

  assertLabelDefined = function(inst){
    if(inst.ident.subType==="address" && inst.ident.defined===false){
      error("label '"+inst.ident.name+"' is not defined!", inst);
    }
  };

  assertIsFileIdent = function(ident, inst){
    if(!ident){
      error("Expected a 'file' Identifier", inst)
    } else if(ident.subType!=="file"){
      error("Expected a 'file' Identifer", inst);
    }
  };

  assertIsFileOrNumberIdent = function(ident, inst){

  };

  processInstructions = function(insts){
    insts.forEach(function(inst){
      var subType = inst.subType.toLowerCase();
      if(inst.type==="directive"){
        processDirective(inst);
      } else if(subType==="assignment"){
        processAssignmentInst(inst);
      } else if(subType in handleInsts){
        handleInsts[subType](inst);
      } else {
        error("Unhandled instruction subType:'"+inst.subType+"'!", inst);
      }
    });
  };

  processDirective = function(dir){
    var subType = dir.subType;
    if(subType==="label"){
      labels[dir.ident.name]=currentAddress;
    } else if(subType==="setAddress"){
      log("--setAddress--", dir);
    } else {
      error("Directive subType:'"+subType+"' is unhandled!", inst);
    }
  };

  processAssignmentInst = function(inst){

  };

  procInst = function(inst){
    // f1, info
    var subType, info;
    subType = inst.subType.toLowerCase();
    info = f1[subType];
    //log(inst.type, inst.subType, info);
    code[currentAddress] = info.opcode;
    currentAddress += 1;
  };

  handleInsts = { 
    nop:procInst, clrwdt:procInst, sleep:procInst
    , reset:procInst
    , option:procInst
    , trisa:procInst, trisb:procInst, trisc:procInst
    , setbsr: function(inst){ var ident=inst.ident, num;
        if(ident.constType==="number" || ident.type==="number"){
          num = ident.value;
        } else if(ident.subType==="file"){
          num = ident.value >> 7;
        } else if(ident.subType==="bit"){
          num = ident.fileIdent.value >> 7;
        } else {
          error("Unexpected Identifier subType:'"+idnet.subType+"'", inst);
        }
        code[currentAddress]=f1.movlb.opcode | (num & 0x1F);
        currentAddress+=1;
      }
    , setpclath: function(inst){ var ident=inst.ident, num;
        if(ident.constType==="number" || ident.type==="number"){
          num = ident.value;
          code[currentAddress]=f1.movlp.opcode | (num & 0xFF);
        } else if(ident.subType==="address"){
          assertLabelDefined(inst); 
          code[currentAddress]={inst:"setpclath", name:inst.ident.name
                                , from:currentAddress};
        } else {
            error("Unexpected Identifier subType:'"+ident.subType+"'", inst);
        }
        currentAddress+=1;
      }
    , clr:function(inst){ var ident=inst.ident;
        assertIsFileIdent(ident, inst);
        if(ident.w){
          code[currentAddress]=f1.clrw.opcode;
        } else {
          code[currentAddress]=f1.clrf.opcode | (ident.value & 0x7F);
        }
        currentAddress+=1;
      }
    , com:function(inst){ var ident=inst.ident;
        assertIsFileIdent(ident, inst);
        if(ident.w){
          code[currentAddress]=f1.comf.opcode | WREG;
        } else {
          code[currentAddress]=f1.comf.opcode | 0x80 | (ident.value & 0x7F);
        }
        currentAddress+=1;
      }
    , test:function(inst){ var ident=inst.ident;
        assertIsFileIdent(ident, inst);
        if(ident.w){
          code[currentAddress]=f1.movf.opcode | WREG;
        } else {
          code[currentAddress]=f1.movf.opcode | (ident.value & 0x7F);
        }
        currentAddress+=1;
      }
    , "goto": function(inst){ 
        assertLabelDefined(inst); 
        code[currentAddress]={inst:"goto", name:inst.ident.name
                              , from:currentAddress};
        currentAddress+=1;
      }
    , "call": function(inst){
        assertLabelDefined(inst); 
        code[currentAddress]={inst:"call", name:inst.ident.name
                              , from:currentAddress};
        currentAddress+=1;
      }
    , "return": function(inst){ var ident=inst.ident;
        if(ident){
          if(ident.constType==="number" || ident.type==="number"){
            code[currentAddress]=f1.retlw.opcode | (ident.value & 255);
          } else {
            error("Unexpected Identifier type:'"+ident.subType+"' ", inst);
          } 
        } else {
          code[currentAddress]=f1["return"].opcode;
        }
        currentAddress+=1;
      }
    , "retfie": function(inst){
        code[currentAddress]=f1.retfie.opcode;
        currentAddress+=1;
      }
  };

  resolveLabels = function(){
    var i, c;
    for(i=0; i<code.length; i+=1){
      c = code[i];
      if(c.inst){
        if(c.inst==="call"){
          code[i] = f1.call | (labels[c.name] & 0x07FF);
        } else if(c.inst==="goto"){
          code[i] = f1["goto"] | (labels[c.name] & 0x07FF);
        } else if(c.inst==="setpclath"){
          code[i] = f1.movlp.opcode | (labels[c.name] >> 8);
        } else {
          error("Cannot resolveLabel for inst:'"+c.inst+"'!");
        }
      }
    }
  };

  toHex = function(n, size){
    size = size | 4
    return ("000"+n.toString(16).toUpperCase()).substr(-size);
  };

  // Test
  test = function(){
    var i, c;
    compiler.processStr(testSrc);
    for(i=0; i<code.length; i+=1){
      log(toHex(i), " ", toHex(code[i]));
    }
    log(labels);
  };
  test();
  
  //modules.export = compiler;
}());
