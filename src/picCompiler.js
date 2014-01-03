/*global */
(function(){
  "use strict";
  var fs, log
    , pegParser
    , f1
    , compiler
    , ids={}
    , currentAddress=0, code=[]
    , labels={}
    , error
    , addCode
    , getLabelId
    , assertLabelDefined, assertIsFileIdent
    , assertIsFileOrNumberIdent, assertDestAndSrcAreValid
    , processInstructions, resolveLabels
    , processDirective, processAssignmentInst
    , processWAssignmentInst, processFileAssignmentInst
    , processIfInstruction
    , procInst
    , handleInsts
    , WREG=0x09
    , hrtime
    , toHex, toBin, nop=function(){}
    , test
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

  compiler.processFile = function(filename){
    var src;
    src = fs.readFileSync(filename);
    return compiler.processStr(src);
  };

  compiler.processStr = function(src){
    var results, st, secs;
    st = hrtime();
    results = pegParser.parse(src, {ids:ids});
    processInstructions(results.instDirects);
    resolveLabels();
    secs = hrtime()-st;
    log("Done in", secs);
  };

  hrtime = function(){
    var hr = process.hrtime();
    return hr[0]+(hr[1]/1000000000);
  };

  addCode = function(data){
    code[currentAddress] = data;
    currentAddress+=1;
  };

  getLabelId = function(){
    getLabelId.count += 1;
    return getLabelId.count;
  };
  getLabelId.count=0;

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
    assertDestAndSrcAreValid(inst.dest, inst.src);
    if(inst.dest.isW){
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
      addCode(opcode | (value & 0xFF));
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
        addCode(opcode | (value & 0x7F));
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
          addCode(opcode | (value & 0x7F));
        } else if(op==="+=" && ex==="+C"){
          // addwfc W+=f+C;     (d=0)
          opcode = f1.addwfc.opcode;
          addCode(opcode | (value & 0x7F));
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
    ex = inst.ex.replace("-B", "+C");
    value = destId.value;
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
        addCode(opcode | (value & 0x7F));
      } else if(ex==="+C" && (op==="+=" || op==="-=")){
        // addwfc f+=W+C;     (d=1)
        // subwfb f-=W-B;     (d=1)   (f-=W+C)
        opcode = {"+=":"addwfc", "-=":"subwfb"}[op];
        opcode = f1[opcode].opcode | 0x80;
        addCode(opcode | (value & 0x7F));
      } else {
        error("Instruction '"+inst.text+"' not supported!", inst);          
      }
    } else if(srcId.isNumber && srcId.value===1 && (op==="-=" || op==="+=")){
      // incf   f+=1;       (d=1)
      // decf   f-=1;       (d=1)
      opcode = {"+=":"incf", "-=":"decf"}[op];
      opcode = f1[opcode].opcode | 0x80;
      addCode(opcode | (value & 0x7F));
    } else if(srcId.isNumber && srcId.value===0xFF && op==="^="){
      // comf   f^=0xFF;    (d=1)
      opcode = f1.comf.opcode | 0x80;
      addCode(opcode | (value & 0x7F));
    } else {
      error("Instruction '"+inst.text+"' not supported!", inst);          
    }
  };

  processIfInstruction = function(inst){
    // NOTE: skipIfZero cannot be reversed
    // if(w=f),  if(w=f+1),  if(w=f-1)
    // if(f+=1), if(f-=1)
    // if(fb==0), if(fb!=0)
    // if(b==1), if(b!=1)
    // not = true|false
    // bitClrSet = "BitClr" | "BitSet" (|"Not"|null)
    // wAssign = true|false
    // pre = ("+="|"-="|"=="|"!="|"+"|"-") 0|1
    // ident = 'file'|'bit'  (|isNumber)
    var ident, labelId, thenLabel, eofThenLabel, eofElseLabel, block, elseBlock, not, c;
    labelId = getLabelId();
    thenLabel = "_then_" + labelId;
    eofThenLabel = "_eofThen_" + labelId;
    eofElseLabel = "_eofElse_" + labelId;
    ident = inst.ident;
    block = inst.block;
    elseBlock = inst.elseBlock;
    not = inst.not;
    if(block.length===0 && elseBlock.length>0){
      block = elseBlock;
      elseBlock = [];
      not = !not;
    }
    if(!inst.wAssign && !inst.pre){
      if(ident.subType==="file"){
        addCode(f1.movf.opcode | 0x80 | (ident.value & 0x7F));  // test it
        not = !not; // if not Zero
        c = not?"btfsc":"btfss";  // ZeroFlag = STATUS:0x03 Z:0x02<<7 = (0x103)
        addCode(f1[c].opcode | 0x103);
        addCode({inst:"goto", name:eofThenLabel, from:currentAddress});
      } else if(ident.subType==="bit"){
        c = not?"btfsc":"btfss";
        addCode(f1[c].opcode | ((ident.bit.value & 7)<<7) | (ident.fileIdent.value & 0x7F));
        addCode({inst:"goto", name:eofThenLabel, from:currentAddress});
      } else {
        error("Expected a 'bit' or 'file' identifier!", inst);
      }
    } else {
      error("Instruction '"+inst.text+"' not supported yet!", inst);          
    }
    processInstructions(block);
    if(elseBlock && elseBlock.length>0){
      addCode({inst:"goto", name:eofElseLabel, from:currentAddress});
      labels[eofThenLabel] = currentAddress;
      processInstructions(elseBlock);
      labels[eofElseLabel] = currentAddress;
    } else {
      labels[eofThenLabel] = currentAddress;
    }
  };

  procInst = function(inst){
    // f1, info
    var subType, info;
    subType = inst.subType.toLowerCase();
    info = f1[subType];
    //log(inst.type, inst.subType, info);
    addCode(info.opcode);
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
        addCode(f1.movlb.opcode | (num & 0x1F));
      }
    , setpclath: function(inst){ var ident=inst.ident, num;
        if(ident.constType==="number" || ident.type==="number"){
          num = ident.value;
          addCode(f1.movlp.opcode | (num & 0xFF));
        } else if(ident.subType==="address"){
          assertLabelDefined(inst); 
          addCode({inst:"setpclath", name:inst.ident.name, from:currentAddress});
        } else {
            error("Unexpected Identifier subType:'"+ident.subType+"'", inst);
        }
      }
    , clr:function(inst){ var ident=inst.ident;
        assertIsFileIdent(ident, inst);
        if(ident.isW){
          addCode(f1.clrw.opcode);
        } else {
          addCode(f1.clrf.opcode | (ident.value & 0x7F));
        }
      }
    , com:function(inst){ var ident=inst.ident;
        assertIsFileIdent(ident, inst);
        if(ident.isW){
          addCode(f1.comf.opcode | WREG);
        } else {
          addCode(f1.comf.opcode | 0x80 | (ident.value & 0x7F));
        }
      }
    , test:function(inst){ var ident=inst.ident;
        assertIsFileIdent(ident, inst);
        if(ident.isW){
          addCode(f1.movf.opcode | WREG);
        } else {
          addCode(f1.movf.opcode | 0x80 | (ident.value & 0x7F));
        }
      }
    , "goto": function(inst){ 
        assertLabelDefined(inst); 
        addCode({inst:"goto", name:inst.ident.name, from:currentAddress});
      }
    , "call": function(inst){
        assertLabelDefined(inst); 
        addCode({inst:"call", name:inst.ident.name, from:currentAddress});
      }
    , "return": function(inst){ var ident=inst.ident;
        if(ident){
          if(ident.constType==="number" || ident.type==="number"){
            addCode(f1.retlw.opcode | (ident.value & 255));
          } else {
            error("Unexpected Identifier type:'"+ident.subType+"' ", inst);
          } 
        } else {
          addCode(f1["return"].opcode);
        }
      }
    , "retfie": function(inst){
        addCode(f1.retfie.opcode);
      }
    , "bitclr": function(inst){ var ident=inst.ident;
        addCode(f1.bcf.opcode | ((ident.bit.value & 7)<<7) | (ident.fileIdent.value & 0x7F));
      }
    , "bitset": function(inst){ var ident=inst.ident;
        addCode(f1.bsf.opcode | ((ident.bit.value & 7)<<7) | (ident.fileIdent.value & 0x7F));
      }
  };

  resolveLabels = function(){
    var i, c;
    for(i=0; i<code.length; i+=1){
      c = code[i];
      if(c.inst){
        if(c.inst==="call"){
          code[i] = f1.call.opcode | (labels[c.name] & 0x07FF);
        } else if(c.inst==="goto"){
          code[i] = f1.goto.opcode | (labels[c.name] & 0x07FF);
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

  toBin = function(n, size){
    var s;
    size = size | 14;
    s = ("00000000000000"+n.toString(2)).substr(-size);
    s = s.substr(0,2)+" "+s.substr(2,4)+" "+s.substr(6,4)+" "+s.substr(10,4);
    return s;
  };

  // Test
  test = function(){
    var i, c, testSrc;
    if(true){
      testSrc = fs.readFileSync("predefs1829.bf1");
    } else {
      testSrc = "defFile(STATUS,0x03);defBit(C,STATUS.0);defBit(Carry,STATUS.0);defBit(Z,STATUS.2);defBit(Zero,STATUS.2);";
    }
    testSrc += "defFile(f,0x42);defBit(b1, f.1);defBit(b2, f.2);\n";
    testSrc += "nop;clrWdt;sleep;reset;retfie;return;return 32;option(w);trisA(w);\n";
    testSrc += "start: goto start; start(); setPCLATH(start); setPCLATH(1);nop();\n";
    testSrc += "b2.set();b2.clr();nop();f+=1;nop();\n";
    testSrc += "if(b2){reset();}else{clrWdt();}nop();\n";
    testSrc += "if(f){reset();}nop();\n";
    compiler.processStr(testSrc);
    for(i=0; i<code.length; i+=1){
      log(toHex(i), " ", toHex(code[i]), " ", toBin(code[i]));
    }
    log(labels);
  };
  test();
  
  //modules.export = compiler;
}());
