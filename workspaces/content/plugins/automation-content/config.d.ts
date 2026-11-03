export interface Config {
  automationContent?: {
    development?: {
      /**
       * Enable demo images in development only. Disabled by default and ignored
       * outside development, including production.
       * @visibility frontend
       * @default false
       */
      demoImages?: boolean;
      /**
       * Source reference for demo images. Only read when development demo images
       * are enabled.
       * @visibility frontend
       */
      sourceRef?: string;
    };
  };
}
