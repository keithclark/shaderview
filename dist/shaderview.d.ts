// Automatically generated during build
declare module "@keithclark/shaderview" {
  export default class HTMLShaderviewElement extends HTMLElement {
    constructor()
    /**
     * Starts playback of the shader when it is ready. Returns a `Promise` that
     * resolves when playback starts. Failure to begin playback for any reason
     * will result in the promise being rejected.
     *
     * Once playback begins, a `playing` event is dispatched. This event does
     * not bubble and cannot be cancelled.
     */
    play(): Promise<void>
    /**
     * Pauses playback of the shader.
     *
     * Once playback stops, a `pause` event is dispatched. This event does not
     * bubble and cannot be cancelled.
     */
    pause(): void
    /**
     * Returns a boolean that indicates whether the shader is paused.
     */
    readonly paused: boolean
    /**
     * The current time in seconds.
     */
    time: number
    /**
     * Reflects the `autoplay` HTML attribute, indicating whether playback
     * should begin automatically once the shader is ready.
     */
    autoplay: boolean
  }
  
}
