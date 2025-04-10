// Type definitions for web workers
declare module "*.worker.js" {
  // You need to change `Worker`, if you specified a different value for the `workerType` option
  class WebpackWorker extends Worker {
    constructor();
  }

  // Uncomment this if you set the `esModule` option to `false`
  // export = WebpackWorker;
  export default WebpackWorker;
}

// Type definitions for the embedding worker
declare module "./embedding.worker.js" {
  const Worker: new () => Worker;
  export default Worker;
} 