(function(){
var V=window.V2,T=V.T,C=V.COL;
function box(s,x,y,z,w,h,d,c){s.g.add(V.segs(V.boxEdges(x,y,z,w,h,d),{color:c||C.ph,k:1.4,w:2}));}
function build(s,i){
 s.cam={p:[0,5,24],l:[0,4,0],fov:42,shift:.16};
 var a=[], j,k;
 if([2,7,8,11].includes(i)){
  [[0,5],[4,5],[8,5],[4,1]].forEach(function(p){box(s,p[0],p[1],0,2.5,2,1);});
  a=[0,5,0,8,5,0,4,5,0,4,1,0];s.g.add(V.segs(a,{color:C.ph,w:2,k:1}));
  var packets=[];for(j=0;j<5;j++){var m=new T.Mesh(new T.BoxGeometry(.18,.18,.18),new T.MeshBasicMaterial({color:C.am}));s.g.add(m);packets.push(m);}
  s.update=function(t){packets.forEach(function(p,n){p.position.set((t*2+n*2)%8,5,0.7);});};
 }else if([4,5,6].includes(i)){
  var cubes=[];for(j=0;j<5;j++)for(k=0;k<5;k++){var g=new T.Group();g.position.set(j*1.4,k*1.15,0);g.add(V.segs(V.boxEdges(0,0,0,.85,.72,.65),{color:C.ph,w:1.8,k:1}));var m=new T.Mesh(new T.BoxGeometry(.20,.20,.2),new T.MeshBasicMaterial({color:C.am}));g.add(m);s.g.add(g);cubes.push({m:m,n:j+k});}
  s.update=function(t){cubes.forEach(function(q){q.m.material.opacity=1;q.m.visible=((Math.floor(t*2)-q.n+40)%10)<2;});};
 }else if(i===9||i===10){
  var vals=i===9?[[98.85,98.83],[97.50,97.58]]:[[1923665,13254324],[1068230,3559094]], mode=0, bars=[];
  for(j=0;j<2;j++){var b=new T.Group();s.g.add(b);bars.push(b);} 
  function draw(){bars.forEach(function(b){while(b.children.length)b.remove(b.children[0]);});var v=vals[mode],max=i===9?100:Math.max.apply(null,v);v.forEach(function(n,k){var w=8*n/max;bars[k].add(V.segs(V.boxEdges(w/2,5-k*2,0,w,1,0.2),{color:k?C.am:C.ph,w:3,k:1.5}));});}
  s.toggle=function(){mode=1-mode;draw();}; draw();s.update=function(){};
 }else{
  for(j=0;j<10;j++){var tr=new V.Trace(90,{color:C.ph,w:1.3,k:.8,a:.6});s.g.add(tr.obj);(function(tr,n){var old=s.update;s.update=function(t){if(old)old(t);for(var p=0;p<90;p++){var x=p/89*18-5;tr.setPoint(p,x,n*.6+Math.sin(x*.7+t*.25+n)*.22,0);}tr.commit();};})(tr,j);}
 }
}
for(var i=0;i<window.SLIDES.length;i++)(function(n){V.builders[n]=function(s){build(s,n);};})(i);
})();
