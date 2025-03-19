const WORKER_STATUS_SUCCESS = 'ok';
const WORKER_STATUS_FAILURE = 'fail';


/**
 * @param {Worker} worker The web worker instance responsible for process the command
 * @param {string} cmd The command to execute
 * @param {*} data The command payload
 * @param {Transferable[]} transfer Objects to be transfered to the worker
 */
export const executeCommand = (worker, cmd, data, transfer) => {
  worker.postMessage({ cmd, data }, transfer);
};


/**
 * @param {Worker} worker The web worker instance responsible for process the command
 * @param {string} cmd The command to execute
 * @param {*} data The command payload
 * @param {Transferable[]} transfer Objects to be transfered to the worker
 * @returns {Promise<*>}
 */
export const executeCommandAsync = (worker, cmd, data, transfer = []) => {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      //console.log(cmd,'response', event.data)
      if (event.data.status === WORKER_STATUS_SUCCESS) {
        resolve();
      } else {
        reject(new DOMException(event.data.reason || 'Unhandled worker error'));
      }
    };
    executeCommand(worker, cmd, data, [channel.port2, ...transfer]);
  });
};


/**
 * @param {MessagePort} port
 */
export const sendExecuteSuccess = (port) => {
  port.postMessage({ status: WORKER_STATUS_SUCCESS });
};


/**
 * @param {MessagePort} port
 */
export const sendExecuteError = (port, reason) => {
  port.postMessage({ status: WORKER_STATUS_FAILURE, reason });
};


/**
 * @param {string} url URL of the worker, relative to the importing script.
 * @returns {Worker}
 */
export const createWorker = (url) => {
  return new Worker(new URL(url, import.meta.url));
};
