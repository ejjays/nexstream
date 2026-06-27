declare module 'event-target-shim' {
  export const Event: new (type: string, init?: object) => object;
  export const EventTarget: new () => {
    addEventListener(type: string, listener: unknown): void;
    removeEventListener(type: string, listener: unknown): void;
    dispatchEvent(event: object): boolean;
  };
}
