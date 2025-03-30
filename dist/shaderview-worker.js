class ShaderRendererError extends Error {
  /**
   * 
   * @param {string} message 
   * @param {string} glErrorInfo 
   */
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

  /** @type {Map<string,any[]}>} */
  #pendingUniformUpdates = new Map();

  /**
   * Creates a `ShaderRenderer` instance for a WebGL context using the provider 
   * shader source.
   * 
   * @param {WebGLRenderingContextBase} glContext The WebGL context to render to
   * @param {string} fragmentShaderSource The fragment shader code
   * @param {string} vertexShaderSource The vetext shader code
   */
  constructor(glContext, fragmentShaderSource, vertexShaderSource) {
    if ((!glContext instanceof WebGLRenderingContext)) {
      throw new Error('Argument 1 must be a WebGLRenderingContext');
    }
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
    const { width, height } = canvas;

    // apply any uniform changes
    for (const [name, values] of this.#pendingUniformUpdates.entries()) {
      this.#uniformSetters.get(name)?.(...values);
    }

    // clear the uniform store ready for the next render
    this.#pendingUniformUpdates.clear();
    
    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }


  /**
   * Cleans up the renderer
   */
  dispose() {
    const gl = this.#context;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.deleteProgram(this.#program);
    this.#pendingUniformUpdates.clear();
  }


  /**
   * Sets the named uniform to a new value, returning a boolean that indicates
   * if the operation was successful or not.
   * 
   * _Note: Delcaring a uniform from inside a shader doesn't mean it is
   * automatically available to the outside world. Uniforms are tree-shaken
   * during the compilation process if they are unused._
   * 
   * @param {string} name the name of the uniform to set
   * @param {GLfloat|GLint|GLboolean} values the component values to set
   * @returns {boolean} `true` if the uniform was set, or `false` if it the uniform doesn't exist.
   */
  setUniform(name, ...values) {
    if (!this.#uniformSetters.has(name)) {
      return false;
    }

    // We don't apply the change immediately as calling `gl.uniform` multiple
    // times between renders can cause performance issues in some browsers. 
    // Instead, we keep track of the last assigned value and set the uniform
    // value at render time.
    this.#pendingUniformUpdates.set(name, values);
    return true;
  }

}

const WORKER_STATUS_SUCCESS = 'ok';
const WORKER_STATUS_FAILURE = 'fail';


/**
 * @param {MessagePort} port
 */
const sendExecuteSuccess = (port) => {
  port.postMessage({ status: WORKER_STATUS_SUCCESS });
};


/**
 * @param {MessagePort} port
 */
const sendExecuteError = (port, reason) => {
  port.postMessage({ status: WORKER_STATUS_FAILURE, reason });
};

/**
 * The name of the uniform used to pass the current playback time to a shader
 */
const UNIFORM_NAME_TIME = 'uTime';

/**
 * The name of the uniform used to pass the element dimensions to a shader
 */
const UNIFORM_NAME_RESOLUTION = 'uResolution';

/** @type {ShaderRenderer?} */
let renderer;

/** @type {OffscreenCanvas?} */
let canvas;

/** @type {WebGLRenderingContextBase?} */
let glContext;

/** @type {number?} */
let renderRequestId = null;

/** @type {number?} */
let tickRequestId = null;

let canvasWidth = 0;
let canvasHeight = 0;
let startFrameTimestamp = 0;
let lastFrameTimestamp = 0;

/**
 * 
 * @param {MessageEvent} event 
 */
self.onmessage = (event) => {
  const { cmd, data } = event.data;
  const [ port ] = event.ports;

  if (cmd === 'setCanvas') {
    canvas = data;
    try {
      glContext = canvas.getContext('webgl');
      sendExecuteSuccess(port);
    } catch (e) {
      sendExecuteError(port, 'Unable to obtain a WebGL context');
    }
  } else if (cmd === 'setSource') {
    try {
      renderer = new ShaderRenderer(glContext, data.fragmentSource, data.vertexSource);
      sendExecuteSuccess(port);
      scheduleRender();
    } catch (e) {
      renderer = null;
      sendExecuteError(port, e.message);
    }
  } else if (cmd === 'resize') {
    canvasWidth = data.width;
    canvasHeight = data.height;
    scheduleRender();
  } else if (cmd === 'pause') {
    if (data === true) {
      pause();
    } else {
      play();
    }
  } else if (cmd === 'setTime') {
    lastFrameTimestamp = data;
    startFrameTimestamp = (performance.now() / 1000) - lastFrameTimestamp;
    scheduleRender();
  } else if (cmd === 'dispose') {
    if (!renderer) {
      return;
    }
    cancelRender();
    pause();
    renderer.dispose();
    renderer = null;
  } else if (cmd === 'setUniform') {
    if (!renderer) {
      return;
    }
    const { name, values } = data;

    if (renderer.setUniform(name, ...values)) {
      scheduleRender();
    } else if (name !== UNIFORM_NAME_RESOLUTION && name !== UNIFORM_NAME_TIME) {
      // If the user is trying to set a uniform and it doesn't exist, report the
      // error.
      throw new ReferenceError(`Uniform "${name}" does not exist.`);
    }
  }
};


/**
 * Cancels the next scheduled render
 */
cancelRender = () => {
  cancelAnimationFrame(renderRequestId);
  renderRequestId = null;
};


/**
 * Schedules the next render.
 */
scheduleRender = () => {
  if (renderRequestId) {
    return;
  }
  renderRequestId = requestAnimationFrame(() => {
    renderRequestId = null; // need to clear this before calling render.
    render();
  });
};


/**
 * Renders a frame of the shader to the host canvas
 */
const render = () => {
  // If we don't have a renderer or if there's already a render scheduled, don't
  // do anything.
  if (!renderer) {
    return;
  }
  if ((canvasWidth !== canvas.width || canvasHeight !== canvas.height)) {
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    renderer.setUniform(UNIFORM_NAME_RESOLUTION, canvasWidth, canvasHeight);
  }
  renderer.setUniform(UNIFORM_NAME_TIME, lastFrameTimestamp);
  renderer.render();
};


/**
 * Starts playback of the shader. The shader animation will be handled by the
 * worker.
 */
const play = () => {
  if (tickRequestId) {
    return;
  }
  startFrameTimestamp = (performance.now() / 1000) - lastFrameTimestamp;

  const tick = () => {
    lastFrameTimestamp = (performance.now() / 1000) - startFrameTimestamp;
    // Shedule a render at the next animation frame
    scheduleRender();
    // The next tick
    tickRequestId = requestAnimationFrame(tick);
  };
  tick();
};


/**
 * Pauses playback of the shader.
 */
const pause = () => {
  cancelAnimationFrame(tickRequestId);
  tickRequestId = null;
};
