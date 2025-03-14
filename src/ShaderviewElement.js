const WORKER_FILENAME = 'shaderview-worker.js';

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
export default class HTMLShaderviewElement extends HTMLElement {

  /** @type {Worker} */
  #worker;

  /** @type {HTMLCanvasElement} */
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

  #startFrameTimestamp = 0;

  #lastFrameTimestamp = 0;

  #paused = true;
  #intersecting = false;

  #resizeObserver = new ResizeObserver(() => {
    this.#postMessage('resize', {
      width: this.clientWidth,
      height: this.clientHeight
    });
  });

  #mutationObserver = new MutationObserver(() => {
    this.#initShaderFromDom();
  });

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `<style>${CSS}</style><div><canvas></canvas><slot/></div>`;
    this.#canvas = this.shadowRoot.querySelector('canvas').transferControlToOffscreen();
    this.#postMessage('setCanvas', this.#canvas, [this.#canvas]);
    this.shadowRoot.querySelector('slot').hidden = true;
    this.#worker = new Worker(`${import.meta.url}/../${WORKER_FILENAME}`);
  }


  #postMessage(cmd, data, transfer) {
    this.#worker.postMessage({ cmd, data }, transfer);
  }


  /**
   * Stops playback, disposes the current renderer instance and deletes the 
   * ready promise.
   */
  #releaseRenderer() {
    if (!this.paused) {
      this.pause();
    }
    this.#postMessage('dispose');
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
      this.#vertexShader
    ]).then(([fragmentSource, vertexSource]) => {
      this.#releaseRenderer();
      this.#postMessage('setSource', {
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
    this.#resizeObserver.observe(this);
    this.#mutationObserver.observe(this, { childList: true });
  }


  /**
   * @ignore
   */
  disconnectedCallback() {
    this.#resizeObserver.disconnect();
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
   * @type {number}
   */
  get time() {
    return this.#lastFrameTimestamp;
  }

  set time(value) {
    this.#startFrameTimestamp = (performance.now() / 1000) - value;
    this.#lastFrameTimestamp = value;
    this.#postMessage('setTime', value);
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

    this.#postMessage('pause', false);
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
    this.#paused = true;
    this.#postMessage('pause', true);
    this.dispatchEvent(new Event('pause'));
  }

}
