"use client";

import { useEffect, useRef, type RefObject } from "react";

const vertex = `attribute vec2 position; varying vec2 uv; void main(){uv=position;gl_Position=vec4(position,0.,1.);}`;
// Volume integration produces soft, translucent edges and self-shadowed
// billows rather than a glossy solid surface. The shared clock also freezes
// the cloud when a card is hovered, focused, or motion is paused.
const fragment = `
precision highp float;
varying vec2 uv;
uniform float rotation;
uniform float energy;
uniform float presence;
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 cloudPoint(vec3 p){
 // A small turn keeps the lip silhouette visible throughout the animation.
 float yaw=sin(rotation*.8)*.25;
 float c=cos(yaw),s=sin(yaw);
 vec3 q=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);
 q.y/=1.+energy*.22;
 q.x/=1.+energy*.06;
 float t=rotation*2.;
 q+=vec3(sin(q.y*3.+t)*(.035+energy*.025),cos(q.z*3.+t*.7)*.035,0.);
 return q;
}
float softUnion(float a,float b,float k){
 float h=clamp(.5+.5*(b-a)/k,0.,1.);
 return mix(b,a,h)-k*h*(1.-h);
}
float puff(vec3 p,vec3 center,vec3 radius){
 return (length((p-center)/radius)-1.)*min(radius.x,min(radius.y,radius.z));
}
float mouthCurve(float x){
 return -.025-.027*cos(x*6.1);
}
float density(vec3 p){
 vec3 q=cloudPoint(p);
 if(abs(q.x)>1.16 || abs(q.y)>.7 || abs(q.z)>.48)return 0.;
 float t=rotation*.25;
 // Rounded, overlapping cumulus lobes form two lips. Only nearby lobes
 // need evaluation, keeping the volume affordable on smaller screens.
 float nearest=floor(q.x/.28+.5);
 float body=1.;
 for(int j=-1;j<=1;j++){
   float id=nearest+float(j);
   if(abs(id)>3.)continue;
   float cx=id*.28;
   float a=abs(cx)/.95;
   float fullness=1.-a*a;
   float bow=exp(-pow((abs(cx)-.31)/.25,2.));
   float breathe=sin(t+id*1.7)*.009;
   vec3 upperCenter=vec3(cx,(.07+.15*bow)*fullness,.095*sin(id*2.));
   vec3 lowerCenter=vec3(cx,-.10-.17*fullness,.085*cos(id*1.8));
   vec3 upperRadius=vec3(.225,.125+.12*fullness+breathe,.16+.14*fullness);
   vec3 lowerRadius=vec3(.235,.10+.12*fullness-breathe,.17+.15*fullness);
   body=softUnion(body,puff(q,upperCenter,upperRadius),.045);
   body=softUnion(body,puff(q,lowerCenter,lowerRadius),.045);
 }
 // A thin veil bridges the lips so the crease never becomes a black cutout.
 float bridgeTaper=max(1.-pow(q.x/1.05,2.),.001);
 float bridge=(length(vec2((q.y-mouthCurve(q.x))/(.06*bridgeTaper),q.z/(.22*sqrt(bridgeTaper))))-1.)*.06;
 body=softUnion(body,bridge,.045);
 if(body>.1)return 0.;
 // Fine erosion adds cauliflower texture without destroying the large puffs.
 vec3 drift=q*10.+vec3(t*.15,t*.22,0.);
 float detail=noise(drift)*.52+noise(drift*2.03)*.28+noise(drift*4.07)*.14+noise(drift*8.13)*.06;
 float billow=body+(detail-.48)*.095;
 float edgeFade=1.-smoothstep(1.02,1.16,abs(q.x));
 return smoothstep(-.012,.055,-billow)*2.6*edgeFade;
}
float creaseShadow(vec3 p){
 vec3 q=cloudPoint(p);
 return exp(-pow((q.y-mouthCurve(q.x))/.038,2.))*(1.-smoothstep(.73,1.03,abs(q.x)));
}

void main(){
 vec3 lightDir=normalize(vec3(.7,.65,.45));
 vec3 accumulated=vec3(0.);
 float opacity=0.;
 // Ordered dithering reduces visible bands at the low sample count.
 float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
 for(int i=0;i<72;i++){
   vec3 p=vec3(uv*1.28,.66-(float(i)+jitter)*.0185);
   float d=density(p);
   if(d>.008){
     float opticalDepth=density(p+lightDir*.075)*.65+density(p+lightDir*.19)*.72+density(p+lightDir*.38)*.45;
     float sunlight=exp(-opticalDepth);
     float up=clamp(p.y*.45+.55,0.,1.);
     // Dense indigo cores, electric violet mids, and icy cyan reflections
     // give the cloud the translucent, polished material of the reference.
     vec3 shade=mix(vec3(.07,.018,.22),vec3(.24,.055,.50),up);
     vec3 violet=vec3(.39,.10,.88);
     vec3 lavender=vec3(.72,.48,.98);
     vec3 pink=vec3(1.,.58,.91);
     vec3 cyan=vec3(.58,.92,.98);
     vec3 color=mix(shade,violet,smoothstep(.015,.52,sunlight));
     color=mix(color,lavender,pow(sunlight,1.35)*.68);
     float coolGlint=pow(sunlight,4.)*(.45+.55*smoothstep(-.15,.35,p.x));
     float pinkGlint=pow(sunlight,2.6)*(.58+.42*(1.-smoothstep(-.28,.38,p.y)));
     color=mix(color,pink,pinkGlint*.34);
     color=mix(color,cyan,coolGlint*.09);
     // Light passing through thin cloud rims creates a cool glassy edge.
     float rim=sunlight*(1.-smoothstep(.4,2.4,d));
     color+=vec3(.18,.08,.26)*rim;
     color=mix(color,vec3(.055,.018,.16),creaseShadow(p)*.84);
     float alpha=1.-exp(-d*.19);
     accumulated+=(1.-opacity)*alpha*color;
     opacity+=(1.-opacity)*alpha;
     if(opacity>.985)break;
   }
 }
 if(opacity<.005){gl_FragColor=vec4(0.);return;}
 vec3 finalColor=accumulated/max(opacity,.001);
 finalColor=mix(finalColor,finalColor*vec3(.8,1.2,1.15),presence*.35);
 // Fine film grain avoids a sterile gradient and keeps the material tactile.
 float grain=fract(sin(dot(gl_FragCoord.xy+rotation*37.,vec2(12.9898,78.233)))*43758.5453);
 finalColor*=.90+grain*.18;
 // A restrained halftone field appears through the lower lip, echoing the
 // printed-dot texture in the reference without flattening the cloud volume.
 vec2 cell=fract((gl_FragCoord.xy+vec2(rotation*11.,0.))/7.)-.5;
 float dot=1.-smoothstep(.16,.30,length(cell));
 float dotZone=(1.-smoothstep(-.44,.08,uv.y))*smoothstep(.25,.9,opacity);
 finalColor=mix(finalColor,finalColor+vec3(.18,.05,.30),dot*dotZone*.22);
 gl_FragColor=vec4(finalColor,opacity);
}`;

export type CloudSignal = { energy: number; presence: number };
export function Planet({ angle, onProgress, signal }: { angle: RefObject<number>; onProgress: (progress: number) => void; signal?: RefObject<CloudSignal> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const fallback = () => {
      element.style.opacity = "0";
      element.parentElement?.classList.remove("planet-ready");
      element.parentElement?.classList.add("planet-unavailable");
      onProgress(100);
    };
    const gl = element.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) { fallback(); return; }
    element.style.opacity = "";
    element.parentElement?.classList.remove("planet-unavailable", "planet-ready");
    onProgress(15);
    const shaders: WebGLShader[] = [];
    function compile(type: number, source: string) {
      const shader = gl!.createShader(type)!;
      gl!.shaderSource(shader, source); gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) { gl!.deleteShader(shader); return null; }
      shaders.push(shader); return shader;
    }
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) { shaders.forEach(s => gl.deleteShader(s)); fallback(); return; }
    onProgress(50);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); shaders.forEach(s => gl.deleteShader(s)); fallback(); return; }
    onProgress(70);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const rotation = gl.getUniformLocation(program, "rotation");
    const energy = gl.getUniformLocation(program, "energy");
    const presence = gl.getUniformLocation(program, "presence");
    let frame = 0, lastAngle = -999, lastEnergy = -1, lastPresence = -1, lost = false, firstFrame = true;
    const sizeCanvas = () => {
      const size = Math.min(640, Math.round(element.clientWidth * Math.min(devicePixelRatio, 1)));
      if (!size || (element.width === size && element.height === size)) return;
      element.width = size; element.height = size;
      gl.viewport(0, 0, size, size); lastAngle = -999;
    };
    // Establish the actual display size before claiming the first frame is ready.
    sizeCanvas();
    const resize = new ResizeObserver(sizeCanvas);
    resize.observe(element);
    const onLost = (event: Event) => { event.preventDefault(); lost = true; fallback(); };
    element.addEventListener("webglcontextlost", onLost);
    const draw = () => {
      const e = Math.round((signal?.current.energy || 0) * 1000) / 1000;
      const p = Math.round((signal?.current.presence || 0) * 1000) / 1000;
      if (!lost && !document.hidden && element.clientWidth > 0 && (angle.current !== lastAngle || e !== lastEnergy || p !== lastPresence)) {
        gl.uniform1f(energy, e); gl.uniform1f(presence, p);
        lastEnergy = e; lastPresence = p;
        gl.uniform1f(rotation, angle.current); gl.drawArrays(gl.TRIANGLES, 0, 6);
        lastAngle = angle.current;
        if (firstFrame) {
          // Wait for GPU completion once, never in the normal animation loop.
          gl.finish();
          if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) { lost = true; fallback(); return; }
          firstFrame = false;
          onProgress(100);
        }
        element.dataset.ready = "true";
        element.dataset.frame = angle.current.toFixed(4);
        element.parentElement?.classList.add("planet-ready");
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); element.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(shader => gl.deleteShader(shader));
    };
  }, [angle, onProgress, signal]);
  return <div className="planet" aria-hidden="true"><div className="planet-fallback"/><canvas ref={canvas}/></div>;
}
