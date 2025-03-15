import ShaderRenderer from "./ShaderRenderer.js";
import { sendExecuteError, sendExecuteSuccess } from "./worker-utils.js";

/** @type {ShaderRenderer?} */
let renderer;

/** @type {HTMLCanvasElement?} */
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
 * @returns 
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
      sendExecuteError(port, e.message, 'Unable to create renderer instance');
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
  }
}


/**
 * Cancels the next scheduled render
 */
cancelRender = () => {
  cancelAnimationFrame(renderRequestId);
  renderRequestId = null;
}


/**
 * Schedules the next render.
 */
scheduleRender = () => {
  if (renderRequestId) {
    return;
  }
  renderRequestId = requestAnimationFrame(() => {
    if (renderer) {
      if ((canvasWidth !== canvas.width || canvasHeight !== canvas.height)) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
      }
      renderer.setTime(lastFrameTimestamp);
      renderer.render();
    }
    renderRequestId = null;
  });
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
    tickRequestId = requestAnimationFrame(tick);
    lastFrameTimestamp = (performance.now() / 1000) - startFrameTimestamp;
    scheduleRender();
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
