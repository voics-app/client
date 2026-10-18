declare module '@jitsi/rnnoise-wasm/dist/rnnoise-sync.js' {
  export interface RnnoiseModule {
    HEAPF32: Float32Array;
    _malloc(bytes: number): number;
    _free(pointer: number): void;
    _rnnoise_create(model: number): number;
    _rnnoise_destroy(context: number): void;
    _rnnoise_process_frame(context: number, output: number, input: number): number;
  }
  const createModule: () => RnnoiseModule;
  export default createModule;
}
