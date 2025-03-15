import ShaderRendererError from './ShaderRendererError.js';

export default class ShaderRenderer {

  /** @type {WebGLRenderingContextBase} */
  #context;

  /** @type {WebGlProgram} */
  #program;

  /** @type {Map<string,(...values)=>void}>} */
  #uniformSetters;

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
    gl.viewport(0, 0, width, height);
    this.#setUniformInternal('uResolution', width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }


  /**
   * Cleans up the renderer
   */
  dispose() {
    const gl = this.#context;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.deleteProgram(this.#program);
  }


  /**
   * Sets the internal time uniform value `uTime`
   * 
   * @param {number} value 
   */
  setTime(value) {
    this.#setUniformInternal('uTime', value);
  }


  /**
   * Sets a named uniform to a new value. Used by the public `setUniform`
   * method, which adds additional error checking.
   * 
   * @param {string} name the name of the uniform to set
   * @param {GLfloat|GLint|GLboolean} values the component values to set
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
