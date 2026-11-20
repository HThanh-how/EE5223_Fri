(function(){
'use strict';
var D=window.V2.deck, last=0, pressed={}, stage=function(e){return !e.target.closest('#tray,#pen,#overview,#help,#menu,#notes,#trace');}, drawing=function(){return document.body.classList.contains('pen');};
function move(dir){if(drawing())return; last=Date.now();dir<0?D.prev():D.next();}
function side(e){if(e.button!==3&&e.button!==4)return;if(!stage(e))return;e.preventDefault();e.stopImmediatePropagation();if(e.type==='mousedown'){pressed[e.button]=false;return;}if((e.type==='mouseup'||e.type==='pointerup')&&!pressed[e.button]){pressed[e.button]=true;move(e.button===3?-1:1);setTimeout(function(){pressed[e.button]=false;},350);}}
['mousedown','mouseup','pointerup','auxclick'].forEach(function(n){document.addEventListener(n,side,true);});
document.addEventListener('contextmenu',function(e){if(!stage(e)||e.shiftKey)return;e.preventDefault();e.stopImmediatePropagation();if(!drawing())move(1);},true);
var token='npu-slide-sentinel';
function arm(){history.pushState({guard:token},'',location.href);}
arm();
addEventListener('popstate',function(){if(Date.now()-last>500&&!drawing())move(-1);arm();});
D.on(function(){history.replaceState({guard:token},'',location.pathname+location.search+'#'+(D.cur+1));});
})();
