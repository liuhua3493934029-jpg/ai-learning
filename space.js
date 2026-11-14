/* Silent Orbit — analytic 3D ray tracing with a reusable noise lattice. No network assets. */
(() => {
  'use strict';
  const root = document.documentElement;
  const canvas = document.getElementById('space-canvas');
  const preference = 'ai_learning_visual_theme';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const choices = [...document.querySelectorAll('[data-theme-choice]')];
  const story = document.querySelector('.space-story');
  const meter = document.querySelector('.space-meter');
  const acts = [...document.querySelectorAll('.space-act')];
  const copies = [...document.querySelectorAll('.space-copy')];
  const chapterLinks = [...meter.querySelectorAll('a')];
  const endpoint = document.getElementById('space-end');
  let gl, program, buffer, texture;
  let cachedMaps = [];
  let frame = 0, last = 0, elapsed = 0, current = 0, target = 0;
  let active = false, initialized = false, contextLost = false, renderDirty = true, currentTheme = null;
  let retainedCourseId = null;
  let ambientMotion = true;
  let quality = 1, slowTime = 0, warmFrames = 0, lastChapter = -1, lastTypeProgress = -1;
  let pointer = [0, 0], look = [0, 0], anchors = [], uniforms = {};
  const vertex=`attribute vec2 position;varying vec2 uv;varying vec3 viewRay;
  uniform mat3 cameraBasis;uniform vec2 resolution;
  void main(){uv=position;viewRay=cameraBasis*vec3(position.x*resolution.x/resolution.y*.59,position.y*.59,1.);gl_Position=vec4(position,0.,1.);}`;
  const fragment=`precision highp float;
  varying vec2 uv;varying vec3 viewRay;uniform vec3 cameraPosition;uniform vec2 resolution;uniform float journey,time;uniform sampler2D noiseMap;uniform sampler2D surfaceMap,normalMap,worldMap;
  float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
  // A repeatable noise lattice is uploaded once; hardware interpolation replaces eight hashes per sample.
  float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec2 xy=i.xy+vec2(37.,17.)*i.z+f.xy+.5;return mix(texture2D(noiseMap,xy/256.).r,texture2D(noiseMap,(xy+vec2(37.,17.))/256.).r,f.z);}
  vec3 rotateY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
  float sphere(vec3 ro,vec3 rd,vec3 center,float radius){vec3 o=ro-center;float b=dot(o,rd),d=b*b-dot(o,o)+radius*radius;if(d<0.)return -1.;float t=-b-sqrt(d);return t>0.?t:-1.;}
  vec2 sphereUV(vec3 n){return vec2(atan(n.z,n.x)*.159154943+.5,asin(clamp(n.y,-1.,1.))*.318309886+.5);}
  void main(){
    float p=clamp(journey,0.,4.);float aspect=resolution.x/resolution.y;
    vec3 ro=cameraPosition,rd=normalize(viewRay);
    // A directional, layered field responds to camera orientation and translation.
    vec3 sky=vec3(.009,.015,.029);float warp=sin(clamp(p-2.5,0.,1.)*3.14159);
    for(int i=0;i<3;i++){float layer=float(i);vec3 cell=rd*(180.+layer*145.)+ro*(.22+layer*.32);vec3 id=floor(cell);vec3 f=fract(cell)-.5;float seed=hash(id+layer*23.);float star=exp(-dot(f,f)*(180.+layer*80.))*step(.985,seed);sky+=mix(vec3(.55,.7,1.),vec3(1.,.83,.65),step(.997,seed))*star*(.7+seed)*(1.+warp*.45);}
    float haze=texture2D(worldMap,sphereUV(rotateY(rd,p*.035))).r;float nebula=haze*haze;
    sky+=mix(vec3(.08,.14,.24),vec3(.24,.12,.28),smoothstep(1.7,3.6,p))*nebula*(.7+warp*6.);
    // Real spheres in a shared 3D world. Their limb, perspective and occlusion follow the camera.
    vec3 c1=vec3(2.05,.1,0.);vec3 c2=vec3(-2.4,.15,-5.8);vec3 c3=vec3(2.8,-.4,-20.5);c3.x+=(1.-smoothstep(3.,4.,p))*3.;
    if(aspect<.8){c1=vec3(.5,1.8,0.);c2.x=-1.1;c3.y=1.3;}
    float r1=2.45,r2=1.7,r3=2.9;
    float t1=sphere(ro,rd,c1,r1),t2=sphere(ro,rd,c2,r2),t3=sphere(ro,rd,c3,r3);
    float t=1.e5,kind=0.,rad=r1;vec3 center=c1;
    if(t1>0.&&t1<t){t=t1;center=c1;rad=r1;kind=0.;}if(t2>0.&&t2<t){t=t2;center=c2;rad=r2;kind=1.;}if(t3>0.&&t3<t){t=t3;center=c3;rad=r3;kind=2.;}
    vec3 light=normalize(vec3(-3.4,2.4,2.5));vec3 col=sky;
    if(t<1.e4){vec3 n=normalize(ro+rd*t-center);vec3 local=rotateY(n,time*.018+kind*1.4+p*.08);vec2 mapUV=sphereUV(local);vec4 surface=texture2D(surfaceMap,mapUV);vec4 normalData=texture2D(normalMap,mapUV);float terrain=surface.r,detail=surface.g,ridges=surface.b;float continents=smoothstep(.38,.58,terrain);
      vec3 ocean=vec3(.025,.073,.12),rock=mix(vec3(.12,.17,.2),vec3(.43,.48,.49),detail);
      if(kind>.5&&kind<1.5){ocean=vec3(.10,.065,.05);rock=mix(vec3(.22,.13,.085),vec3(.58,.39,.24),detail);}
      vec3 material=mix(ocean,rock,continents);material*=.68+ridges*.4;
      float clouds=texture2D(surfaceMap,sphereUV(rotateY(local,time*.003+.035))).a;material=mix(material,vec3(.64,.7,.73),clouds*(kind<.5?.38:.08));
      if(kind>1.5){float bands=normalData.a;material=mix(vec3(.09,.19,.24),vec3(.3,.45,.48),bands);material*=.8+detail*.35;}

      vec3 grad=(normalData.rgb-.5)*2.;
      vec3 normal=normalize(n-rotateY(grad-local*dot(local,grad),-(time*.018+kind*1.4+p*.08))*(kind>1.5?.15:1.1));float diffuse=max(dot(normal,light),0.);float limb=pow(1.-max(dot(n,-rd),0.),3.5);float day=smoothstep(-.18,.2,dot(n,light));
      col=material*(.025+diffuse*1.65);col+=vec3(.13,.34,.62)*limb*day*.9;
      float spec=pow(max(dot(reflect(-light,normal),-rd),0.),55.)*(1.-continents)*.35;col+=vec3(.7,.85,1.)*spec;
    }
    // Thin, sunlit atmosphere outside the geometric surface; no painted disk.
    for(int i=0;i<3;i++){vec3 c=i==0?c1:(i==1?c2:c3);float r=i==0?r1:(i==1?r2:r3);vec3 oc=c-ro;float along=dot(oc,rd);float dist=length(oc-rd*along);float glow=exp(-abs(dist-r)*38./r)*step(r,dist)*step(0.,along);vec3 edge=normalize(ro+rd*along-c);glow*=step(along,t);float sun=max(.06,dot(edge,light));col+=vec3(.16,.4,.7)*glow*sun*.65;}
    // The final world's ring is an inclined plane in 3D, including planet occlusion and shadow.
    vec3 ringNormal=normalize(vec3(.18,.85,.48));float denom=dot(rd,ringNormal);
    if(abs(denom)>.0001){float tr=dot(c3-ro,ringNormal)/denom;vec3 hit=ro+rd*tr;float rr=length(hit-c3)/r3;
      if(tr>0.&&tr<t&&rr>1.33&&rr<2.18){float edge=smoothstep(1.33,1.43,rr)*(1.-smoothstep(2.07,2.18,rr));float band=.4+.08*sin(rr*30.)+.12*noise(vec3(rr*28.,2.,4.));float gap=1.-.85*exp(-pow((rr-1.83)*70.,2.));float shadow=sphere(hit+light*.03,light,c3,r3)>0.?.12:1.;float alpha=edge*gap*(.4+band*.35)*smoothstep(2.5,3.2,p);col=mix(col,vec3(.38,.47,.51)*shadow*(.65+band),alpha);}
    }
    // Three sparse dust sheets occupy world space. Passing them creates depth without flashing or zoom tricks.
    for(int i=0;i<3;i++){float z=-7.5-float(i)*2.9;float dt=(z-ro.z)/rd.z;
      if(dt>0.&&dt<t){vec3 w=ro+rd*dt;float n=texture2D(worldMap,fract(w.xy/32.+vec2(float(i)*.17,.11*float(i)))).g;float ribbon=exp(-pow((w.y-sin(w.x*.25)*1.7)/2.4,2.));float density=smoothstep(.38,.82,n)*ribbon*exp(-dt*.055)*warp*.23;col=mix(col, mix(vec3(.15,.24,.36),vec3(.27,.18,.30),float(i)/2.),density);}
    }
    col*=1.-.23*pow(length(uv)*.65,2.);col=1.-exp(-col*1.45);col=pow(col,vec3(.82));
    // A quiet left-side exposure falloff keeps editorial text legible.
    col*=mix(.55,1.,smoothstep(-1.,.4,uv.x));gl_FragColor=vec4(col,1.);
  }`;
  const bakeFragment=`precision highp float;
  varying vec2 uv;uniform sampler2D noiseMap;uniform float mode;
  float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
  // A repeatable noise lattice is uploaded once; hardware interpolation replaces eight hashes per sample.
  float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec2 xy=i.xy+vec2(37.,17.)*i.z+f.xy+.5;return mix(texture2D(noiseMap,xy/256.).r,texture2D(noiseMap,(xy+vec2(37.,17.))/256.).r,f.z);}
  float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*noise(p);p=p*2.03+vec3(4.1,7.2,2.4);a*=.5;}return s;}

  void main(){
    vec2 st=uv*.5+.5;
    float longitude=(st.x-.5)*6.283185307, latitude=(st.y-.5)*3.141592654;
    vec3 n=vec3(cos(latitude)*cos(longitude),sin(latitude),cos(latitude)*sin(longitude));
    if(mode<.5){
      float terrain=fbm(n*5.5),detail=noise(n*50.)*.6+noise(n*105.)*.4;
      float ridges=1.-abs(2.*fbm(n*13.)-1.);
      float clouds=smoothstep(.54,.72,fbm(n*7.8));
      gl_FragColor=vec4(terrain,detail,ridges,clouds);
    }else if(mode<1.5){
      float height=noise(n*30.);
      vec3 gradient=vec3(noise(n*30.+vec3(.12,0,0)),noise(n*30.+vec3(0,.12,0)),noise(n*30.+vec3(0,0,.12)))-height;
      float bands=sin(n.y*45.+fbm(n*8.)*7.)*.5+.5;
      gl_FragColor=vec4(gradient*.5+.5,bands);
    }else{
      float cloud=fbm(n*3.2+vec3(.2,1.,0.));float filament=fbm(n*8.5+vec3(2.,0.,4.));
      float haze=max(0.,cloud*.9+filament*.35-.37);
      // Periodic UV warping makes a seamless planar dust tile.
      vec3 w=vec3(cos(st.x*6.283185)*4.,sin(st.x*6.283185)*4.,0.);
      w+=vec3(0.,cos(st.y*6.283185)*4.,sin(st.y*6.283185)*4.);
      float curl=noise(w*.6+vec3(0,4,2));float dust=noise(w*2.+curl*2.)*.65+noise(w*5.)*.35;
      gl_FragColor=vec4(haze,dust,0.,1.);
    }
  }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw Error(message);
    }
    return shader;
  }

  function bakeMaps() {
    let bakeProgram, vs, fs, framebuffer;
    try {
      vs = compile(gl.VERTEX_SHADER, vertex);
      fs = compile(gl.FRAGMENT_SHADER, bakeFragment);
      bakeProgram = gl.createProgram();
      gl.attachShader(bakeProgram, vs); gl.attachShader(bakeProgram, fs);
      gl.linkProgram(bakeProgram);
      if (!gl.getProgramParameter(bakeProgram, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(bakeProgram));
      gl.useProgram(bakeProgram);
      const position = gl.getAttribLocation(bakeProgram, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(gl.getUniformLocation(bakeProgram, 'noiseMap'), 0);
      framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      const mode = gl.getUniformLocation(bakeProgram, 'mode');
      const names = ['surfaceMap', 'normalMap', 'worldMap'];
      cachedMaps = [];
      for (let index = 0; index < names.length; index++) {
        const width = index === 0 ? 1024 : 512, height = width / 2;
        const map = gl.createTexture();
        cachedMaps.push(map);
        gl.activeTexture(gl.TEXTURE1 + index);
        gl.bindTexture(gl.TEXTURE_2D, map);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, index === 2 ? gl.REPEAT : gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, map, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw Error('Texture cache framebuffer incomplete');
        gl.viewport(0, 0, width, height);
        gl.uniform1f(mode, index);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.generateMipmap(gl.TEXTURE_2D);
      }
      gl.useProgram(program);
      names.forEach((name, index) => gl.uniform1i(uniforms[name], index + 1));
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      if (bakeProgram) gl.deleteProgram(bakeProgram);
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      gl.useProgram(program);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
  }

  function init() {
    if (gl || contextLost) return;
    let vs, fs;
    try {
      gl = canvas.getContext('webgl', {alpha: false, antialias: false, depth: false, powerPreference: 'low-power'});
      if (!gl) throw Error('WebGL unavailable');
      vs = compile(gl.VERTEX_SHADER, vertex);
      fs = compile(gl.FRAGMENT_SHADER, fragment);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      for (const name of ['resolution', 'journey', 'time', 'cameraPosition', 'cameraBasis', 'noiseMap', 'surfaceMap', 'normalMap', 'worldMap']) {
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      const pixels = new Uint8Array(256 * 256);
      let seed = 0x6a09e667;
      for (let i = 0; i < pixels.length; i++) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        pixels[i] = seed & 255;
      }
      texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 256, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, pixels);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.uniform1i(uniforms.noiseMap, 0);
      bakeMaps();
      root.dataset.renderer = 'webgl';
      renderDirty = true;
    } catch (error) {
      console.warn('Star theme uses its static fallback:', error.message);
      root.dataset.renderer = 'fallback';
      if (gl) {
        if (buffer) gl.deleteBuffer(buffer);
        if (texture) gl.deleteTexture(texture);
        cachedMaps.forEach(map => gl.deleteTexture(map));
        cachedMaps = [];
        if (program) gl.deleteProgram(program);
      }
      contextLost = true;
    } finally {
      if (gl && vs) gl.deleteShader(vs);
      if (gl && fs) gl.deleteShader(fs);
      if (contextLost) gl = null;
    }
  }

  function resizeCanvas() {
    if (!gl || contextLost) return;
    const cap = innerWidth < 600 ? 850 : 1400;
    const ratio = Math.min(Math.min(devicePixelRatio || 1, 1.35) * quality, cap / innerWidth);
    const width = Math.max(1, Math.round(innerWidth * ratio));
    const height = Math.max(1, Math.round(innerHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    renderDirty = true;
  }

  function resize() {
    if (!active) return;
    anchors = [...acts, endpoint].map(element => element.getBoundingClientRect().top + window.scrollY);
    resizeCanvas();
    measure();
    schedule();
  }

  function measure() {
    if (!active || !anchors.length) return;
    const y = window.scrollY + innerHeight * .18;
    let progress = 0;
    for (let i = 0; i < 4; i++) {
      if (y >= anchors[i]) progress = i + Math.min(1, (y - anchors[i]) / Math.max(1, anchors[i+1] - anchors[i]));
    }
    progress = Math.min(4, progress);
    if (Math.abs(target - progress) < .00001) return;
    target = progress;
    schedule();
  }

  function updateType() {
    const chapter = Math.min(4, Math.floor(current + .3));
    if (chapter !== lastChapter) {
      chapterLinks.forEach((link, index) => link.setAttribute('aria-current', String(index === chapter)));
      lastChapter = chapter;
      root.dataset.spaceChapter = String(chapter);
    }
    if (Math.abs(current - lastTypeProgress) < .0001) return;
    lastTypeProgress = current;
    copies.forEach((copy, index) => {
      const distance = current - index;
      const opacity = motion.matches ? 1 : 1 - Math.max(0, Math.min(.8, (distance - .3) * .9));
      copy.style.setProperty('--reveal', opacity.toFixed(4));
      copy.style.setProperty('--lift', (motion.matches ? 0 : -Math.max(-.2, Math.min(1, distance)) * 24).toFixed(2) + 'px');
    });
  }

  const orbit = [[0,0,7], [3.8,1.2,4.3], [-2.7,.4,-1.6], [-1.3,1.7,-7], [.4,1.2,-13]];
  const cameraPosition = new Float32Array(3), cameraBasis = new Float32Array(9);
  function setCamera(progress) {
    const segment = Math.min(3, Math.floor(progress)), t = progress - segment;
    const eased = t * t * (3 - 2 * t);
    for (let axis = 0; axis < 3; axis++) cameraPosition[axis] = orbit[segment][axis] + (orbit[segment + 1][axis] - orbit[segment][axis]) * eased;
    cameraPosition[1] += Math.sin(t * Math.PI) ** 2 * (segment === 1 ? 2.2 : segment === 2 ? 1.4 : 0);
    if (!motion.matches) { cameraPosition[0] += look[0] * .12; cameraPosition[1] += look[1] * .08; }
    let fx = -cameraPosition[0] * .8, fy = -cameraPosition[1] * .75, fz = -6;
    const forwardLength = Math.hypot(fx, fy, fz);
    fx /= forwardLength; fy /= forwardLength; fz /= forwardLength;
    const rightLength = Math.hypot(fz, fx), rx = -fz / rightLength, rz = fx / rightLength;
    cameraBasis.set([rx, 0, rz, -rz * fy, rz * fx - rx * fz, rx * fy, fx, fy, fz]);
    gl.uniform3fv(uniforms.cameraPosition, cameraPosition);
    gl.uniformMatrix3fv(uniforms.cameraBasis, false, cameraBasis);
  }

  function draw(now) {
    frame = 0;
    if (!active || document.hidden) return;
    const rawDelta = last ? (now - last) / 1000 : .016;
    const delta = Math.min(rawDelta, .08);
    last = now;
    const previous = current;
    const traveling = Math.abs(target - current) > .0005;
    current = motion.matches || !traveling ? target : current + (target - current) * (1 - Math.exp(-Math.min(rawDelta, 1) * 6));
    const inStory = current < 3.999;
    const animate = !motion.matches && inStory && gl && !contextLost && ambientMotion;
    if (animate) elapsed += delta;
    if (!motion.matches && inStory) look = look.map((value, i) => value + (pointer[i] - value) * (1 - Math.exp(-delta * 3)));
    updateType();
    const cameraChanged = !motion.matches && Math.abs(previous - current) > .000001;
    if (gl && !contextLost && (renderDirty || animate || cameraChanged)) {
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.journey, motion.matches ? 0 : current);
      gl.uniform1f(uniforms.time, motion.matches ? 0 : elapsed);
      setCamera(motion.matches ? 0 : current);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      renderDirty = false;
      root.dataset.spaceReady = 'true';
      // Ignore compilation and resume delays. Adapt only under sustained animation load.
      if (animate && warmFrames++ > 3) {
        slowTime = rawDelta > .032 ? slowTime + Math.min(rawDelta, .3) : Math.max(0, slowTime - delta * 2);
        if (slowTime > .65 && quality > .45) {
          quality = Math.max(.45, quality * .8);
          slowTime = 0;
          resizeCanvas();
        } else if (quality <= .45 && slowTime > .8 && rawDelta > .08) {
          // Very slow renderers retain interactive 3D, but stop spending energy on idle rotation.
          ambientMotion = false;
          slowTime = 0;
        }
      }
    }
    if (animate || (!motion.matches && Math.abs(target - current) > .0005)) schedule();
  }

  function schedule() {
    if (active && !frame && !document.hidden) frame = requestAnimationFrame(draw);
  }

  // Retain the reading position by a stable course ID, never by the old page's total scroll height.
  function readingAnchor() {
    if (window.scrollY < Math.min(300, innerHeight * .35)) return null;
    if (endpoint.getBoundingClientRect().top > innerHeight * .6) return null;
    const candidates = [...document.querySelectorAll('#courses [data-course-id]'), document.getElementById('backup'), document.getElementById('learning-library'), endpoint];
    const preferred = candidates.find(element => element.dataset.courseId === retainedCourseId);
    if (preferred) candidates.unshift(preferred);
    const element = candidates.find(element => {
      const rect = element.getBoundingClientRect();
      return rect.top < innerHeight * .6 && rect.bottom > innerHeight * .2;
    });
    retainedCourseId = element?.dataset.courseId || null;
    return element ? {element, offset: element.getBoundingClientRect().top} : null;
  }

  function select(theme, persist = true) {
    const nextActive = theme === 'space';
    if (initialized && currentTheme === theme) return;
    currentTheme = theme;
    const anchor = persist ? readingAnchor() : null;
    const previousAnchoring = root.style.overflowAnchor;
    const previousBodyAnchoring = document.body.style.overflowAnchor;
    if (anchor) { root.style.overflowAnchor = 'none'; document.body.style.overflowAnchor = 'none'; }
    active = nextActive;
    initialized = true;
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'space' ? '#080d17' : theme === 'terrain' ? '#e4e4da' : theme === 'weft' ? '#e7e8e1' : '#f6f6f0';
    choices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme)));
    story.inert = meter.inert = !active;
    if (persist) {
      try { localStorage.setItem(preference, theme); } catch { /* The current session still switches. */ }
      if (anchor) window.scrollTo({top: window.scrollY + anchor.element.getBoundingClientRect().top - anchor.offset, behavior: 'instant'});
      else window.scrollTo({top: 0, behavior: 'instant'});
    }
    if (anchor) requestAnimationFrame(() => {
      root.style.overflowAnchor = previousAnchoring;
      document.body.style.overflowAnchor = previousBodyAnchoring;
    });
    if (active) {
      init();
      last = 0;
      resize();
      current = target;
      lastTypeProgress = -1;
      renderDirty = true;
      schedule();
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    }
  }

  choices.forEach(button => button.addEventListener('click', () => select(button.dataset.themeChoice)));
  addEventListener('scroll', measure, {passive: true});
  addEventListener('resize', resize, {passive: true});
  addEventListener('pointermove', event => {
    if (!active || current >= 3.999 || motion.matches || event.pointerType !== 'mouse') return;
    pointer = [event.clientX / innerWidth - .5, .5 - event.clientY / innerHeight];
    schedule();
  }, {passive: true});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else { last = 0; warmFrames = 0; schedule(); }
  });
  motion.addEventListener('change', () => {
    renderDirty = true;
    lastTypeProgress = -1;
    last = 0;
    schedule();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame);
    frame = 0;
    root.dataset.renderer = 'fallback';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    gl = null;
    contextLost = false;
    if (active) { init(); resizeCanvas(); schedule(); }
  });
  addEventListener('pagehide', () => { cancelAnimationFrame(frame); frame = 0; });
  addEventListener('pageshow', () => { last = 0; resize(); schedule(); });
  select(['classic', 'space', 'terrain', 'weft'].includes(root.dataset.theme) ? root.dataset.theme : 'classic', false);
})();
