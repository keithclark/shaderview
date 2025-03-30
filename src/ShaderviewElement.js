import { UNIFORM_NAME_RESOLUTION, UNIFORM_NAME_TIME } from "./consts.js";
import { createWorker, executeCommand, executeCommandAsync } from "./worker-utils.js";

const CSS = `
@layer {:host { width: 400px; height: 300px; display: inline-block }}
div { position: relative; height: 100%; width:100%; user-select: none; overflow:hidden }
canvas { position: absolute; inset:0 }
`;

const DEFAULT_VERTEX_SHADER_CODE = 'attribute vec3 position;void main(){gl_Position=vec4(position,1);}';

const shaderSourceMap = new Map();

/**
 * A Web Component for rendering GLSL shaders in HTML documents. 
 */
export default class HTMLShaderviewElement extends HTMLElement {

  /** @type {Worker} */
  #worker;

  /** @type {OffscreenCanvas} */
  #canvas;

  /** @type {AbortController?} */
  #fragmentShaderAborter

  /** @type {AbortController?} */
  #vertexShaderAborter

  /** @type {HTMLScriptElement?} */
  #fragmentShaderElement;

  /** @type {HTMLScriptElement?} */
  #vertexShaderElement;

  /** @type {Promise<string>?} */
  #fragmentShader;

  /** @type {Promise<string>?} */
  #vertexShader;

  /** @type {Promise<void>?} */
  #ready = null;

  /** @type {Promise<void>?} */
  #canvasReady = null;

  #startFrameTimestamp = 0;

  #lastFrameTimestamp = 0;

  #paused = true;
  #intersecting = false;

  #resizeObserver = new ResizeObserver(() => {
    executeCommand(this.#worker, 'resize', {
      width: this.clientWidth,
      height: this.clientHeight
    });
  });

  #mutationObserver = new MutationObserver(() => {
    this.#initShaderFromDom();
  });

  #intersectionObserver = new IntersectionObserver((entries) => {
    this.#intersecting = entries[0].isIntersecting;
    const [ entry ] = entries;
    const { target, isIntersecting } = entry;

    if (isIntersecting) {
      // Start monitoring the element for size changes. This will trigger a 
      // `setSize` message to the worker.
      this.#resizeObserver.observe(target);

      // If the ShaderElement isn't paused then we need to restart the worker 
      // and account for time difference.
      if (!this.#paused) {
        executeCommand(this.#worker, 'setTime', (performance.now() / 1000) - this.#startFrameTimestamp);
        executeCommand(this.#worker, 'pause', false);
      } else {
        executeCommand(this.#worker, 'setTime', this.#lastFrameTimestamp);
      }
    } else {
      // Stop monitoring for size changes and pause the worker if we're
      // currently playing the shader.
      this.#resizeObserver.unobserve(target);
      if (!this.#paused) {
        executeCommand(this.#worker, 'pause', true);
      }
    }
  });

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `<style>${CSS}</style><div><canvas></canvas><slot hidden /></div>`;
    this.#worker = createWorker('shaderview-worker.js');
    this.#canvas = this.shadowRoot.querySelector('canvas').transferControlToOffscreen();
    this.#canvasReady = executeCommandAsync(this.#worker, 'setCanvas', this.#canvas, [this.#canvas]);
    this.#canvasReady.catch((e) => {
      // The component isn't going to work so fail silently and render the fallback
      // content
      this.shadowRoot.querySelector('slot').hidden = false;
    });

  }


  /**
   * Stops playback, disposes the current renderer instance and deletes the 
   * ready promise.
   */
  #releaseRenderer() {
    if (!this.paused) {
      this.pause();
    }
    this.#intersecting = false;
    this.#resizeObserver.disconnect();
    this.#intersectionObserver.disconnect();
    executeCommand(this.#worker, 'dispose');
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
      shaderSourceMap.set(scriptElem, content)
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
      return;
    }

    // Are we replacing the fragment shader?
    if (this.#fragmentShaderElement !== fragmentShaderElem) {
      // If the previous renderer is still being initialized (e.g. slow network 
      // connection) then we abort it so that it doesn't resolve later and trash
      // any new shaders.
      if (this.#fragmentShaderElement) {
        this.#fragmentShaderAborter?.abort();
        this.#fragmentShader = null;
      }

      if (fragmentShaderElem) {
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
        this.#vertexShaderAborter?.abort();
        this.#vertexShader = null;
      }

      if (vertexShaderElem) {
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
      this.#vertexShader,
      this.#canvasReady
    ]).then(([fragmentSource, vertexSource]) => {
      this.#releaseRenderer();
      return executeCommandAsync(this.#worker, 'setSource', {
        fragmentSource,
        vertexSource
      });
    });
   
  
    // When the new shader has finished initialization we dispatch a `load` 
    // event and then schedule a render of the first frame or, if configured, 
    // start playback. If the initialization fails we raise a `error` event so 
    // the host application can act accordingly.
    try {
      await this.#ready;
      this.#intersectionObserver.observe(this);
      this.#resizeObserver.observe(this);

      this.dispatchEvent(new Event('load'));
      if (this.hasAttribute('autoplay')) {
        this.play();
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        this.#releaseRenderer();
        this.#ready = null;
        this.dispatchEvent(new Event('error'));
      }
    }
  }


  /**
   * @ignore
   */
  connectedCallback() {
    this.#initShaderFromDom();
    this.#mutationObserver.observe(this, { childList: true });
  }


  /**
   * @ignore
   */
  disconnectedCallback() {
    this.#releaseRenderer();
    this.#mutationObserver.disconnect();
  }


  /**
   * Returns a boolean that indicates whether the shader is paused.
   * @type {boolean}
   */
  get paused() {
    return this.#paused;
  }


  /**
   * The current plackback time in seconds. 
   * 
   * _Note: During playback, the frame render time is controlled by the worker.
   * To avoid over using `postMessage` to sync the time value with this element 
   * the worker value is approximated. This can result in a lack of precision._
   * 
   * @type {number}
   */
  get time() {
    if (this.#paused) {
      return this.#lastFrameTimestamp;
    }
    return performance.now() / 1000 - this.#startFrameTimestamp;
  }

  set time(value) {
    this.#startFrameTimestamp = (performance.now() / 1000) - value;
    this.#lastFrameTimestamp = value;
    if (this.#intersecting) {
      executeCommand(this.#worker, 'setTime', value);
    }
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
   * Returns the `HTMLScriptElement` used as the fragment shader source or 
   * `null` if no fragment shader is configured.
   * @type {HTMLScriptElement|null} 
   */
  get fragmentShader() {
    return this.#fragmentShaderElement;
  }


  /**
   * Returns the `HTMLScriptElement` used as the vertex shader source or 
   * `null` if no fragment shader is configured.
   * @type {HTMLScriptElement|null} 
   */
  get vertexShader() {
    return this.#vertexShaderElement;
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
  
    this.#startFrameTimestamp = (performance.now() / 1000) - this.#lastFrameTimestamp;

    executeCommand(this.#worker, 'pause', false);
    this.#paused = false;
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
    this.#lastFrameTimestamp = (performance.now() / 1000) - this.#startFrameTimestamp;
    this.#paused = true;
    executeCommand(this.#worker, 'pause', true);
    this.dispatchEvent(new Event('pause'));
  }


  /**
   * Sets a named uniform in the shader program to a new value.
   * 
   * @param {string} name The name of the uniform to set
   * @param {...number|boolean} values The new value(s) for the uniform
   */
  setUniform(name, ...values) {
    if (name === UNIFORM_NAME_RESOLUTION || name === UNIFORM_NAME_TIME) {
      throw new DOMException(`Uniform "${name}" cannot be set externally`);
    }
    executeCommand(this.#worker, 'setUniform', { name, values });
  }

}
