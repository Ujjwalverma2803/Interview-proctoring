declare module "@tensorflow-models/blazeface" {
  export type BlazeFacePrediction = {
    topLeft: [number, number];
    bottomRight: [number, number];
    probability?: number | [number];
    landmarks?: Array<[number, number]>;
  };

  export type NormalizedFace = BlazeFacePrediction;

  export type BlazeFaceModel = {
    estimateFaces(
      input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
      returnTensors?: boolean,
      flipHorizontal?: boolean,
      annotateBoxes?: boolean,
    ): Promise<BlazeFacePrediction[]>;
  };

  export function load(config?: {
    maxFaces?: number;
    inputWidth?: number;
    inputHeight?: number;
    iouThreshold?: number;
    scoreThreshold?: number;
    modelUrl?: string;
  }): Promise<BlazeFaceModel>;
}
