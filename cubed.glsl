/*! Cubed! by Keith Clark (keithclark.co.uk) | License: CC BY-NC-SA 3.0 Unported */
precision highp float;uniform float uTime;uniform vec2 uResolution;
#define ANTI_ALIAS 2.
#define time uTime/2.
const vec2 s=vec2(1,1.7320508);float hex(in vec2 p){p=abs(p);return max(dot(p,s*.5),p.x);}vec4 getHex(vec2 p){vec4 hC=floor(vec4(p,p-vec2(.5,1))/s.xyxy)+.5;vec4 h=vec4(p-hC.xy*s,p-(hC.zw+.5)*s);float a=dot(h.xy,h.xy);float b=dot(h.zw,h.zw);return a<b?vec4(h.xy,hC.xy):vec4(h.zw,hC.zw+.5);return dot(h.xy,h.xy)<dot(h.zw,h.zw)?vec4(h.xy,hC.xy):vec4(h.zw,hC.zw+.5);}void main(){vec2 u=(gl_FragCoord.xy-uResolution.xy*.5)/uResolution.y;vec4 h=getHex(u*5.+vec2(.0,time*1.5));float eDist=hex(h.xy);vec3 col=vec3(0);col.x=.5+sin(h.z/3.)*.5;col.y=.5+cos(h.w/2.5)*.5;col.z=1.5-col.x-col.y;vec3 col1=vec3(col);if(h.y<abs(h.x/s.y)){
#ifdef ANTI_ALIAS
col1=mix(col,col1*(h.x>.0?.6:.3),smoothstep(.0,.04,(sign(h.x)*h.x-h.y*s.y)*ANTI_ALIAS));
#else
col1*=h.x>.0?vec3(.3):vec3(.6);
#endif
}vec3 col2=vec3(col);if(h.y>-abs(h.x/s.y)){
#ifdef ANTI_ALIAS
col2=mix(col,col*(h.x<=.0?.6:.3),smoothstep(.0,.04,(sign(h.x)*h.x+h.y*s.y)*ANTI_ALIAS));
#else
col2*=h.x<=.0?vec3(.3):vec3(.6);
#endif
}float id=eDist-sin(time+(h.z*9.*h.w*3.));
#ifdef ANTI_ALIAS
col=mix(col2,col1,smoothstep(.0,.04,id*ANTI_ALIAS));
#else
col=mix(col2,col1,smoothstep(.0,.0,id));
#endif
col=sqrt(max(col,.0));gl_FragColor=vec4(col,1.);}