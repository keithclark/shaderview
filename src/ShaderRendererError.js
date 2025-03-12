export default class ShaderRendererError extends Error {
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
