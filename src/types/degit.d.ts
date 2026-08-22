declare module 'degit' {
  type DegitOptions = {
    cache?: boolean;
    force?: boolean;
    verbose?: boolean;
  };

  type Emitter = {
    clone(destination: string): Promise<void>;
  };

  function degit(repository: string, options?: DegitOptions): Emitter;

  export default degit;
}
