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
    , assertIsFileOrNumberIdent, assertDestAndSrcAreValid
    , processInstructions, resolveLabels
    , processDirective, processAssignmentInst
    , processWAssignmentInst, processFileAssignmentInst
    , processIfInstruction
    , procInst
    , handleInsts
    , WREG=0x09
    , toHex, nop=function(){}
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
  testSrc = "defFile(STATUS,0x03);defBit(C,STATUS.0);defBit(Carry,STATUS.0);defBit(Z,STATUS.2);defBit(Zero,STATUS.2);";
  testSrc += "\n nop;clrWdt;sleep;reset;retfie;return;return 32;option(w);trisA(w);";
  testSrc += "start: goto start; start(); setPCLATH(start); setPCLATH(1);";

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
    throw msg;
  };

  assertLabelDefined = function(inst){
    if(inst.ident.subType==="address" && inst.ident.defined===false){
      error("label '"+inst.ident.name+"' is not defined!", inst);
    }
  };

  assertIsFileIdent = function(ident, inst){
    if(!ident){
      error("Expected a 'file' Identifier", inst);
    } else if(ident.subType!=="file"){
      error("Expected a 'file' Identifer", inst);
    }
  };

  assertIsFileOrNumberIdent = function(ident, inst){

  };

  assertDestAndSrcAreValid = function(destIdent, srcIdent){
    // destination must be a 'file'
    // source:
    //  if destination is 'W'
    //    source must be a file or number
    //  if destination is file
    //    source must be 'W' or a number (1) (at least for now anyway)
    if(destIdent.subType!=="file"){
      error("Expected destination to be a 'file' identifier!", destIdent);
    } else if(destIdent.isW){
      if(!((srcIdent.subType==="file" && !srcIdent.isW) || srcIdent.isNumber)){
        error("Expected source to be a 'file' or number!", srcIdent);
      }
    } else { // destIdent is a 'file'
      if(!(srcIdent.isW || srcIdent.isNumber)){
        error("Exprected source to be 'W'!", srcIdent);
      }
    }
  };

  processInstructions = function(insts){
    insts.forEach(function(inst){
      var subType = inst.subType.toLowerCase();
      if(inst.type==="directive"){
        processDirective(inst);
      } else if(subType==="assignment"){
        processAssignmentInst(inst);
      } else if(subType==="if"){
        processIfInstruction(inst);
      } else if(handleInsts.hasOwnProperty(subType)){
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
      error("Directive subType:'"+subType+"' is unhandled!", dir);
    }
  };

  processAssignmentInst = function(inst){
    //
    // rlf  W=f<<C; f=f<<C;      "Rotate Left f through Carry"
    // rrf  W=C>>f; f=C>>f;      "Rotate Right f through Carry"
    // asfr W=f>>1; f=f>>1;      "Arithemtic Right Shift" W|f = f>>1, f7->f6, f0->c
    // lslf W=f<<1; f=f<<1;      W|f = f<<1 (f7->c, 0->f0)
    // lsrf W=f>>>1; f=f>>>1;    W|f = f>>1 (f0->c, 0->f7)
    assertDestAndSrcAreValid(inst.destId, inst.srcId);
    if(inst.destId.isW){
      processWAssignmentInst(inst);
    } else if(inst.dest.subType==="file"){
      processFileAssignmentInst(inst);
    } else {
      error("Instruction '"+inst.text+"' not supported!", inst);
    }
  };

  processWAssignmentInst = function(inst){
    // d=0=W
    var destId, srcId, op, opcode, value, ex;
    destId = inst.dest;
    srcId = inst.src;
    op = inst.op;
    value = srcId.value;
    ex = inst.ex.replace("-B", "+C");
    if(srcId.isNumber){
      // movlw  W=#;
      // addlw  W+=#;
      // andlw  W&=#;
      // iorlw  W|=#;
      // xorlw  W^=#;
      //        W-=#;  (implemtent as W+=-#)
      opcode = {"=":"movlw", "+=":"addlw", "&=":"andlw", "|=":"iorlw", "^=":"xorlw", "-=":"addlw"}[op];
      if(!opcode){ 
        error("Unexpected opcode for W assignment (immediate)!", inst);
      }
      opcode = f1[opcode].opcode;
      if(op==="-="){                    // Special case
        value = -value;
      }
      if(op==="=" && ex==="-W"){   // W=#-W
        opcode = f1.sublw.opcode;
      } else if(ex){
        error("'"+ex+"' unexpected!");
      }
      code[currentAddress] = opcode | (value & 0xFF);
      currentAddress += 1;
    } else if(srcId.subType==="file"){
      // movf   W=f;        (d=0)
      // addwf  W+=f;       (d=0)
      // andwf  W&=f;       (d=0)
      // iorwf  W|=f;       (d=0)
      // xorwf  W^=f;       (d=0)
      if(!ex){
        if(op==="-="){  // NOTE:  W-=f; does not exist
          error("'W-=[file]; is not supported by the PIC16F1xxx processor!", inst);
        }
        opcode = {"=":"movf", "+=":"addwf", "&=":"andwf", "|=":"irowf", "^=":"xorwf"}[op];
        if(!opcode){
          error("Unexpected opcode for W assignment (file)!");
        }
        opcode = f1[opcode].opcode;
        code[currentAddress] = opcode | (value & 0x7F);
        currentAddress += 1;
      } else {  // ex
        // subwf  [W=f-W];*   (d=0)
        // decf   W=f-1;*     (d=0)
        // incf   W=f+1;*     (d=0)
        // subwfb W=f-W-B;    (d=0)   (W=f-W+C)
        // comf   W=f^0xFF;   (d=0)   ex="^0XFF"
        if(op==="="){
          opcode = {"-W":"subwf", "-1":"decf", "+1":"incf", "-W+C":"subwfb", "^0XFF":"comf"}[ex];
          if(!opcode){
            error("Instruction '"+inst.text+"' not supported!", inst);
          }
          opcode = f1[opcode].opcode;
          code[currentAddress] = opcode | (value & 0x7F);
          currentAddress += 1;
        } else if(op==="+=" && ex==="+C"){
          // addwfc W+=f+C;     (d=0)
          opcode = f1.addwfc.opcode;
          code[currentAddress] = opcode | (value & 0x7F);
          currentAddress += 1;
        } else {
          error("Instruction '"+inst.text+"' not supported!", inst);
        }
      }
    } else {
      error("Instruction '"+inst.text+"' not supported! (Unexpected source identifier!)", inst);
    }
  };

  processFileAssignmentInst = function(inst){
    // d=1=file
    var destId, srcId, op, opcode, value, ex;
    destId = inst.dest;
    srcId = inst.src;
    op = inst.op;
    value = srcId.value;
    ex = inst.ex.replace("-B", "+C");
    if(srcId.isW){
      if(!ex){
        // movwf  f=W; 
        // addwf  f+=W;       (d=1)
        // subwf  f-=W;       (d=1)
        // andwf  f&=W;       (d=1)
        // iorwf  f|=W;       (d=1)
        // xorwf  f^=W;       (d=1)
        opcode = {"=":"movwf", "+=":"addwf", "-=":"subwf", "&=":"andwf", "|=":"iorwf", "^=":"xorwf"}[op];
        if(!opcode){
          error("Instruction '"+inst.text+"' not supported!", inst);
        }
        opcode = f1[opcode].opcode | (op==="="?0:0x80);
        code[currentAddress] = opcode | (value & 0x7F);
        currentAddress += 1;
      } else if(ex==="+C" && (op==="+=" || op==="-=")){
        // addwfc f+=W+C;     (d=1)
        // subwfb f-=W-B;     (d=1)   (f-=W+C)
        opcode = {"+=":"addwfc", "-=":"subwfb"}[op];
        opcode = f1[opcode].opcode | 0x80;
        code[currentAddress] = opcode | (value & 0x7F);
        currentAddress += 1;
      } else {
        error("Instruction '"+inst.text+"' not supported!", inst);          
      }
    } else if(srcId.isNumber && value===1 && (op==="-=" || op==="+=")){
      // incf   f+=1;       (d=1)
      // decf   f-=1;       (d=1)
      opcode = {"+=":"incf", "-=":"decf"}[op];
      opcode = f1[opcode].opcode | 0x80;
      code[currentAddress] = opcode | (value & 0x7F);
      currentAddress += 1;
    } else if(srcId.isNumber && value===0xFF && op==="^="){
      // comf   f^=0xFF;    (d=1)
      opcode = f1.comf.opcode | 0x80;
      code[currentAddress] = opcode | (value & 0x7F);
      currentAddress += 1;
    } else {
      error("Instruction '"+inst.text+"' not supported!", inst);          
    }
  };

  processIfInstruction = function(inst){
    // not = true:false
    // bitClrSet = "BitClr" | "BitSet" (|"Not"|null)
    // pre = ("+="|"-="|"=="|"!=") 0|1
    // ident = 'file'|'bit'  (|isNumber)

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
          error("Unexpected Identifier subType:'"+ident.subType+"'", inst);
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
        if(ident.isW){
          code[currentAddress]=f1.clrw.opcode;
        } else {
          code[currentAddress]=f1.clrf.opcode | (ident.value & 0x7F);
        }
        currentAddress+=1;
      }
    , com:function(inst){ var ident=inst.ident;
        assertIsFileIdent(ident, inst);
        if(ident.isW){
          code[currentAddress]=f1.comf.opcode | WREG;
        } else {
          code[currentAddress]=f1.comf.opcode | 0x80 | (ident.value & 0x7F);
        }
        currentAddress+=1;
      }
    , test:function(inst){ var ident=inst.ident;
        assertIsFileIdent(ident, inst);
        if(ident.isW){
          code[currentAddress]=f1.movf.opcode | WREG;
        } else {
          code[currentAddress]=f1.movf.opcode | 0x80 | (ident.value & 0x7F);
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
          code[i] = f1.goto | (labels[c.name] & 0x07FF);
        } else if(c.inst==="setpclath"){
          code[i] = f1.movlp.opcode | (labels[c.name] >> 8);
        } else {
          error("Cannot resolveLabel for inst:'"+c.inst+"'!");
        }
      }
    }
  };

  toHex = function(n, size){
    size = size | 4;
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
