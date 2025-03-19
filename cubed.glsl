// Cubed! - A morphing grid of cubes by Keith Clark
// Based on https://www.shadertoy.com/view/Xljczw by Shane.

precision highp float;
uniform float uTime;
uniform vec2 uResolution;

#define ANTI_ALIAS 2.
#define time uTime / 2.

// Helper vector. If you're doing anything that involves regular triangles or hexagons, the
// 30-60-90 triangle will be involved in some way, which has sides of 1, sqrt(3) and 2.
const vec2 s = vec2(1, 1.7320508);

// The 2D hexagonal isosuface function: If you were to render a horizontal line and one that
// slopes at 60 degrees, mirror, then combine them, you'd arrive at the following. As an 
// aside, the function is a bound -- as opposed to a Euclidean distance representation, but 
// either way, the result is hexagonal boundary lines.
float hex(in vec2 p){
  p = abs(p);
  return max(dot(p, s*.5), p.x); // Hexagon.
}

// This function returns the hexagonal grid coordinate for the grid cell, and the 
// corresponding hexagon cell ID -- in the form of the central hexagonal point. That's 
// basically all you need to produce a hexagonal grid.
//
// When working with 2D, I guess it's not that important to streamline this particular 
// function. However, if you need to raymarch a hexagonal grid, the number of operations 
// tend to matter. This one has minimal setup, one "floor" call, a couple of "dot" calls, a 
// ternary operator, etc. To use it to raymarch, you'd have to double up on everything -- in 
// order to deal with overlapping fields from neighboring cells, so the fewer operations the 
// better.
vec4 getHex(vec2 p){
    
  // The hexagon centers: Two sets of repeat hexagons are required to fill in the space, 
  // and the two sets are stored in a "vec4" in order to group some calculations together. 
  // The hexagon center we'll eventually use will depend upon which is closest to the 
  // current point. Since the central hexagon point is unique, it doubles as the unique
  // hexagon ID.
  
  vec4 hC = floor(vec4(p, p - vec2(.5, 1))/s.xyxy) + .5;
  
  // Centering the coordinates with the hexagon centers above.
  vec4 h = vec4(p - hC.xy*s, p - (hC.zw + .5)*s);
  
  float a = dot(h.xy, h.xy);
  float b = dot(h.zw, h.zw);
  //if (abs(b+a) < .5+cos(iTime * 4.)/4.) return vec4(1.);
  return a < b ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + .5);
  
  // Nearest hexagon center (with respect to p) to the current point. In other words, when
  // "h.xy" is zero, we're at the center. We're also returning the corresponding hexagon 
  // ID -- in the form of the hexagonal central point. By the way, the unique ID (the .zw 
  // bit), needs to be multiplied by "s" to give the correct quantized position back. 
  // For example: float ns = noise2D(hID*s);
  //
  // On a side note, I sometimes compare hex distances, but I noticed that Iomateron 
  // compared the squared Euclidian version, which seems neater, so I've adopted that. 
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + .5);

}

void main(){

  // Aspect correct screen coordinates.
  vec2 u = (gl_FragCoord.xy - uResolution.xy*.5)/uResolution.y;

  // Get the hex attributes
  vec4 h = getHex(u*5. + vec2(0., time * 1.5));
  
  // The beauty of working with hexagonal centers is that the relative edge distance will 
  // simply be the value of the 2D isofield for a hexagon.
  float eDist = hex(h.xy); // Edge distance.

  // Define the base colour
  vec3 col = vec3(0);
  col.x = .5 + sin(h.z/3.) * .5;
  col.y = .5 + cos(h.w/2.5) * .5;
  col.z = 1.5 - col.x - col.y;

  // The base hexagon grid
  vec3 col1 = vec3(col);
  if(h.y < abs(h.x / s.y)) {
    #ifdef ANTI_ALIAS
      col1 = mix(col, col1 * (h.x > 0. ? .6 : .3), smoothstep(0.0, 0.04, (sign(h.x) * h.x - h.y * s.y) * ANTI_ALIAS));
    #else 
      col1 *= h.x > 0. ? vec3(.3) : vec3(.6);
    #endif
  }

  // The tweening hexagon grid
  vec3 col2 = vec3(col);
  if(h.y > -abs(h.x / s.y)) {
    #ifdef ANTI_ALIAS
      col2 = mix(col, col * (h.x <= 0. ? .6 : .3), smoothstep(0.0, 0.04, (sign(h.x) * h.x + h.y * s.y) * ANTI_ALIAS));
    #else 
      col2 *= h.x <= 0. ? vec3(.3) : vec3(.6);
    #endif
  }

  float id = eDist - sin(time + (h.z* 9. * h.w * 3.));
  
  // mix the two shapes
  #ifdef ANTI_ALIAS
    col = mix(col2, col1, smoothstep(0.0, 0.04, id * ANTI_ALIAS));
  #else
    col = mix(col2, col1, smoothstep(0.0, 0.00, id));
  #endif

  // Rough gamma correction.    
  col = sqrt(max(col, .0));
  gl_FragColor = vec4(col, 1.);
    
}
