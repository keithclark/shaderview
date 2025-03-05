export default class ShaderRendererError extends Error {
  constructor(message, glErrorInfo = '') {
    super(message)
    console.error(message + '\n  ' + glErrorInfo.replace(/\n/g, '\n  '))
  }
}
