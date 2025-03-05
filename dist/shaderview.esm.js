class ShaderRendererError extends Error {
  constructor(message, glErrorInfo = '') {
    super(message);
    console.error(message + '\n  ' + glErrorInfo.replace(/\n/g, '\n  '));
  }
}

class ShaderRenderer {

  /** @type {WebGLRenderingContextBase} */
  #context;

  /** @type {WebGlProgram} */
  #program;

  /** @type {Map<string,(...values)=>void}>} */
  #uniformSetters;

  #width = 0;
  #height = 0;
  #time = 0;

  /**
   * Creates a `ShaderRenderer` instance for a WebGL context using the provider 
   * shader source.
   * 
   * @param {WebGLRenderingContextBase} glContext The WebGL context to render to
   * @param {string} fragmentShaderSource The fragment shader code
   * @param {string} vertexShaderSource The vetext shader code
   */
  constructor(glContext, fragmentShaderSource, vertexShaderSource) {
    this.#context = glContext;
    this.#program = this.#createProgram(fragmentShaderSource, vertexShaderSource);
    this.#uniformSetters = this.#createUniformSetters(this.#program);
  }

  /**
   * Creates a shader from the specified GLSL source.
   * 
   * @param {string} source 
   * @param {WebGLRenderingContextBase.VERTEX_SHADER|WebGLRenderingContextBase.FRAGMENT_SHADER_SHADER} type 
   * @returns {WebGLShader}
   */
  #createShader(source, type) {
    const gl = this.#context;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new ShaderRendererError(`Shader compilation failed (SHADER_TYPE=${type})`, gl.getShaderInfoLog(shader));
    }
    return shader;
  }


  /**
   * Creates a program for rendering the shader to a canvas.
   * 
   * @param {string} fragmentShaderSource 
   * @returns {WebGLProgram}
   */
  #createProgram(fragmentShaderSource, vertexShaderSource) {
    const gl = this.#context;

    // Set the clear colour to transparent
    gl.clearColor(1, 1, 1, 0);

    // Try to compile the shaders
    const vertexShader = this.#createShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = this.#createShader(fragmentShaderSource, gl.FRAGMENT_SHADER);

    // Create the WebGL program using the compiled shaders and link it.
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new ShaderRendererError('Program link failed', gl.getProgramInfoLog(program));
    }
  
    gl.useProgram(program);
  
    // Create the vertex buffer and fill it with a quad
    const vertexData = new Float32Array([1, 1, -1,  1, 1,  -1, -1, -1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
  
    const attribute = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);

    return program;
  }


  /** 
   * Creates a Map containing a setter function for each uniforms declared by a 
   * program. These functions are used by the `setUniform()` instance method.
   * 
   * @param {WebGLProgram} The program
   * @returns {Map<string,(...values)=>void}>} 
   */
  #createUniformSetters = (program) => {
    const result = new Map();
    const gl = this.#context;

    const uniformsCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let c = 0; c < uniformsCount; c++) {
      const { type, name } = gl.getActiveUniform(program, c);
      const location = gl.getUniformLocation(program, name);
      let setter;

      if (type === gl.BOOL) {
        setter = (value) => gl.uniform1i(location, !!value ? 1 : 0);
      } else if (type === gl.FLOAT) {
        setter = (value) => gl.uniform1f(location, value);
      } else if (type === gl.FLOAT_VEC2) {
        setter = (...values) => gl.uniform2f(location, ...values);
      } else if (type === gl.FLOAT_VEC3) {
        setter = (...values) => gl.uniform3f(location, ...values);
      } else if (type === gl.FLOAT_VEC4) {
        setter = (...values) => gl.uniform4f(location, ...values);
      } else if (type === gl.INT) {
        setter = (value) => gl.uniform1i(location, value);
      } else if (type === gl.INT_VEC2) {
        setter = (...values) => gl.uniform2i(location, ...values);
      } else if (type === gl.INT_VEC3) {
        setter = (...values) => gl.uniform3i(location, ...values);
      } else if (type === gl.INT_VEC4) {
        setter = (...values) => gl.uniform4i(location, ...values);
      } else {
        setter = () => {
          console.warn(`Uniform "${name}" is an unsupported type ${type}.`);
        };
      }
      result.set(name, setter);
    }
    return result;
  }
  
  
  /**
   * Renders the shader to the canvas context.
   */
  render() {
    const gl = this.#context;
    const { canvas } = gl;
    const { clientWidth, clientHeight } = canvas;

    // If the canvas dimensions have changed since the last render we need to 
    // update the viewport and let the shader code know the new resolution.
    if (this.#width !== clientWidth || this.#height !== clientHeight) {
      this.#width = clientWidth;
      this.#height = clientHeight;
      gl.viewport(0, 0, clientWidth, clientHeight);
      this.#setUniformInternal('uResolution', clientWidth, clientHeight);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }


  dispose() {
    const gl = this.#context;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.deleteProgram(this.#program);
  }

  setTime(t) {
    this.#time = t;
    this.#setUniformInternal('uTime', this.#time);
  }


  /**
   * Sets a named uniform to a new value. Used by the public `setUniform`
   * method, which adds additional error checking.
   * 
   * @param {string} name the name of the uniform to set
   * @param {GLfloat|GLint} values the component values to set
   */
  #setUniformInternal(name, ...values) {
    this.#uniformSetters.get(name)?.(...values);
  }


  /**
   * Sets the named uniform to a new value. If the uniform doesn't exist a
   * `ShaderRendererError` exception is thrown.
   * 
   * @param {string} name the name of the uniform to set
   * @param {GLfloat|GLint|GLboolean} values the component values to set
   * @throws {ShaderRendererError} if the uniform doesn't exist
   */
  setUniform(name, ...values) {
    if (!this.#uniformSetters.has(name)) {
      throw new ShaderRendererError(
        'Error setting uniform',
        `Uniform "${name}" does not exist.`
      );
    }
    this.#setUniformInternal(name, ...values);
  }

}

const CSS = `
@layer {:host { width: 400px; height: 300px; display: inline-block }}
div { position: relative; height: 100%; width:100%; user-select: none }
canvas { position: absolute; inset:0 }
`;

const DEFAULT_VERTEX_SHADER_CODE = 'attribute vec3 position;void main(){gl_Position=vec4(position,1);}';

const shaderSourceMap = new Map();

/**
 * A Web Component for rendering GLSL shaders in HTML documents. 
 */
class HTMLShaderviewElement extends HTMLElement {

  /** @type {WebGLRenderingContextBase} */
  #gl;

  /** @type {HTMLCanvasElement} */
  #canvas;

  /** @type {AbortController?} */
  #fragmentShaderAborter

  /** @type {AbortController?} */
  #vertexShaderAborter

  #fragmentShaderElement

  #vertexShaderElement

  /** @type {Promise<string>?} */
  #fragmentShader

    /** @type {Promise<string>?} */
  #vertexShader

  /** @type {ShaderRenderer?} */
  #renderer = null;

  /** @type {number?} */
  #updateRequestId = null;

  /** @type {number?} */
  #renderRequestId = null;

  /** @type {Promise<void>?} */
  #ready = null;

  #startFrameTimestamp = 0;

  #lastFrameTimestamp = 0;

  #dimensionsDirty = true;

  #paused = true;

  #resizeObserver = new ResizeObserver(() => {
    this.#dimensionsDirty = true;
    this.#scheduleUpdate();
  });

  #mutationObserver = new MutationObserver(() => {
    this.#initShaderFromDom();
  });


  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `<style>${CSS}</style><div><canvas></canvas><slot/></div>`;
    this.#canvas = this.shadowRoot.querySelector('canvas');
    this.#gl = this.#canvas.getContext('webgl');
    if (this.#gl) {
      this.shadowRoot.querySelector('slot').hidden = true;
    }
  }


  /**
   * Stops playback, disposes the current renderer instance and deletes the 
   * ready promise.
   */
  #releaseRenderer() {
    if (!this.paused) {
      this.pause();
    }
    if (!this.#renderer) {
      return;
    }
    this.#renderer.dispose();
    this.#renderer = null;
  }


  /**
   * Fetches text contents of a resource from a URL
   * 
   * @param {string} url The url of the resource to fetch the contents for
   * @param {AbortSignal} [signal] An abort signal for cancelling the request
   * @returns {Promise<string>} The resource contents as a string
   */
  async #fetchExternalContents(url, signal) {
    const res = await fetch(url, {
      priority: 'low', 
      signal
    });
    if (!res.ok) {
      throw new Error('HTTP Error');
    }
    return res.text();
  }


  /**
   * Resolves the contents of a `<script>` element. If the element has a `src`
   * attribute the contents will be downloaded, otherwise the text content of
   * the element will be used. Resulting content is cached against the element.
   * 
   * @param {string} url The url of the resource to fetch the contents for
   * @param {AbortSignal} [signal] An abort signal for cancelling the request
   * @returns {Promise<string>} The resource contents as a string
   */
  async #getScriptContents(scriptElem, signal) {
    if (!shaderSourceMap.has(scriptElem)) {
      let content;
      if (scriptElem.hasAttribute('src')) {
        content = await this.#fetchExternalContents(scriptElem.src, signal);
      } else {
        content = scriptElem.text;
      }
      shaderSourceMap.set(scriptElem, content);
    }
    return shaderSourceMap.get(scriptElem);
  }


  /**
   * Generates a `SharderRenderer` for this element from child `<script>`  
   * elements containing shader definitions. Only the first shader script of 
   * each type (`x-shader/x-fragment` or `x-shader/x-vertex`) is considered as a 
   * participant for the renderer, other script defintions are ignored.
   * 
   * Whenever a new script becomes a participant or a particpating script is 
   * removed, a new renderer instance is created reflecting the new 
   * configuration. While shaders for the new renderer are resolving (network, 
   * compilation etc.) the existing renderer will continue to run. This allows a
   * seemless transition between states.
   * 
   * Once the shader is ready, a `load` event is dispatched. This event does not
   * bubble and cannot be cancelled. If initialization fails for any reason a 
   * `load` event is dispatched.
   */
  async #initShaderFromDom() {

    /** @type {HTMLScriptElement?} */
    const fragmentShaderElem = this.querySelector('script[type="x-shader/x-fragment"]');

    /** @type {HTMLScriptElement?} */
    const vertexShaderElem = this.querySelector('script[type="x-shader/x-vertex"]');
 
    if (this.#fragmentShaderElement === fragmentShaderElem && this._vertexShaderElem === vertexShaderElem) {
      console.log('nochange');
      return
    }

    // Are we replacing the fragment shader?
    if (this.#fragmentShaderElement !== fragmentShaderElem) {
      // If the previous renderer is still being initialized (e.g. slow network 
      // connection) then we abort it so that it doesn't resolve later and trash
      // any new shaders.
      if (this.#fragmentShaderElement) {
        console.log('removing current fragment shader');
        this.#fragmentShaderAborter?.abort();
        this.#fragmentShader = null;
      }

      if (fragmentShaderElem) {
        console.log('adding new fragment shader');
        this.#fragmentShaderAborter = new AbortController();
        this.#fragmentShader = this.#getScriptContents(fragmentShaderElem, this.#fragmentShaderAborter.signal);
      }

      this.#fragmentShaderElement = fragmentShaderElem;
    }


    // Are we replacing the vertex shader?
    if (this.#vertexShaderElement !== vertexShaderElem) {
      // If the previous renderer is still being initialized (e.g. slow network 
      // connection) then we abort it so that it doesn't resolve later and trash
      // any new shaders.
      if (this.#vertexShaderElement) {
        console.log('removing current vertex shader');
        this.#vertexShaderAborter?.abort();
        this.#vertexShader = null;
      }

      if (vertexShaderElem) {
        console.log('adding new vertex shader');
        this.#vertexShaderAborter = new AbortController();
        this.#vertexShader = this.#getScriptContents(vertexShaderElem, this.#vertexShaderAborter.signal);
      } else {
        this.#vertexShader = DEFAULT_VERTEX_SHADER_CODE;
      }
      this.#vertexShaderElement = vertexShaderElem;
    }
 
    // We we don't have a fragment shader then we can't render anything.
    if (!this.#fragmentShader) {
      this.#releaseRenderer();
      this.#ready = null;
      return;
    }

    // Ready is used elsewhere to determine if a renderer is available
    this.#ready = Promise.all([
      this.#fragmentShader,
      this.#vertexShader
    ]).then(([fragmentSource, vertexSource]) => {
      this.#releaseRenderer();
      this.#renderer = new ShaderRenderer(this.#gl, fragmentSource, vertexSource);
    });
   
  
    // When the new shader has finished initialization we dispatch a `load` 
    // event and then schedule a render of the first frame or, if configured, 
    // start playback. If the initialization fails we raise a `error` event so 
    // the host application can act accordingly.
    try {
      await this.#ready;
      this.dispatchEvent(new Event('load'));
      if (this.hasAttribute('autoplay')) {
        this.play();
      } else {
        this.#scheduleUpdate();
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        this.#releaseRenderer();
        this.#ready = null;
        this.dispatchEvent(new Event('error'));
      }
    }
  }


  connectedCallback() {
    this.#initShaderFromDom();
    this.#resizeObserver.observe(this);
    this.#mutationObserver.observe(this, { childList: true });
  }


  disconnectedCallback() {
    this.#resizeObserver.disconnect();
    this.#mutationObserver.disconnect();
  }


  #scheduleUpdate() {
    if (this.#renderRequestId !== null) {
      return;
    }
    this.#renderRequestId = requestAnimationFrame(() => {
      if (this.#renderer) {
        this.#update();
      }
      this.#renderRequestId = null;
    });
  }


  #update() {
    // Resizing the canvas can add a performance overhead so we only do it if
    // the resize observer has marked the dimensions as "dirty".
    if (this.#dimensionsDirty) {
      this.#canvas.width = this.clientWidth;
      this.#canvas.height = this.clientHeight;
      this.#dimensionsDirty = false;
    }
    this.#renderer.setTime(this.#lastFrameTimestamp);
    this.#renderer.render();
  }


  #setCurrentTime(value) {
    this.#lastFrameTimestamp = value;
    this.#scheduleUpdate();
  }


  /**
   * Returns a boolean that indicates whether the shader is paused.
   * @type {boolean}
   */
  get paused() {
    return this.#paused;
  }


  /**
   * The current time in seconds.
   * @type {number}
   */
  get time() {
    return this.#lastFrameTimestamp;
  }

  set time(value) {
    this.#startFrameTimestamp = (performance.now() / 1000) - value;
    this.#setCurrentTime(value);
  }


  /**
   * Reflects the `autoplay` HTML attribute, indicating whether playback should 
   * begin automatically once the shader is ready.
   * @type {boolean} 
   */
  get autoplay() {
    return this.hasAttribute('autoplay');
  }

  set autoplay(value) {
    this.toggleAttribute('autoplay', !!value);
  }


  /**
   * Starts playback of the shader when it is ready. Returns a `Promise` that 
   * resolves when playback starts. Failure to begin playback for any reason
   * will result in the promise being rejected.
   * 
   * Once playback begins, a `playing` event is dispatched. This event does not
   * bubble and cannot be cancelled.
   * @returns {Promise<void>}
   */
  async play() {
    if (!this.#paused) {
      return;
    }

    if (!this.#ready) {
      throw new DOMException('InvalidStateError');
    }

    try {
      await this.#ready;
    } catch (e) {
      throw new DOMException('DataError');
    }

    this.#paused = false;
    this.#startFrameTimestamp = (performance.now() / 1000) - this.#lastFrameTimestamp;

    const tick = () => {
      this.#setCurrentTime((performance.now() / 1000) - this.#startFrameTimestamp);
      this.#updateRequestId = requestAnimationFrame(tick);
    };

    tick();
    this.dispatchEvent(new Event('playing'));
  }


  /**
   * Pauses playback of the shader.
   * 
   * Once playback stops, a `pause` event is dispatched. This event does not
   * bubble and cannot be cancelled.
   */
  pause() {
    if (this.#paused) {
      return;
    }
    this.#paused = true;
    cancelAnimationFrame(this.#updateRequestId);
    this.dispatchEvent(new Event('pause'));
  }

}

export { HTMLShaderviewElement as default };
