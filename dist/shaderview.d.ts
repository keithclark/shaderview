// Automatically generated during build
declare module "@keithclark/shaderview" {
  export default class HTMLShaderviewElement extends HTMLElement {
    constructor();
    /**
     * Starts playback of the shader when it is ready. Returns a `Promise` that
     * resolves when playback starts. Failure to begin playback for any reason
     * will result in the promise being rejected.
     *
     * Once playback begins, a `playing` event is dispatched. This event does
     * not bubble and cannot be cancelled.
     */
    play(): Promise<void>;
    /**
     * Pauses playback of the shader.
     *
     * Once playback stops, a `pause` event is dispatched. This event does not
     * bubble and cannot be cancelled.
     */
    pause(): void;
    /**
     * Returns a boolean that indicates whether the shader is paused.
     */
    readonly paused: boolean;
    /**
     * The current plackback time in seconds.
     *
     * _Note: During playback, the frame render time is controlled by the
     * worker. To avoid over using `postMessage` to sync the time value with
     * this element the worker value is approximated. This can result in a lack
     * of precision._
     */
    time: number;
    /**
     * Reflects the `autoplay` HTML attribute, indicating whether playback
     * should begin automatically once the shader is ready.
     */
    autoplay: boolean;
    /**
     * Returns the `HTMLScriptElement` used as the fragment shader source or
     * `null` if no fragment shader is configured.
     */
    readonly fragmentShader: HTMLScriptElement|null;
    /**
     * Returns the `HTMLScriptElement` used as the vertex shader source or
     * `null` if no fragment shader is configured.
     */
    readonly vertexShader: HTMLScriptElement|null;
  }
  
}
