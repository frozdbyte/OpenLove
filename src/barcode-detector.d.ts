/**
 * Shape Detection API (`BarcodeDetector`) — not yet in TypeScript's bundled DOM
 * lib. Supported in Safari 17+/iOS 17+ (backed by the same Vision-framework
 * detector the native Camera app scanner uses) and Chromium; absent elsewhere,
 * so every call site must feature-detect via `'BarcodeDetector' in window`.
 */
declare global {
	interface DetectedBarcode {
		readonly boundingBox: DOMRectReadOnly;
		readonly rawValue: string;
		readonly format: string;
		readonly cornerPoints: ReadonlyArray<{ x: number; y: number }>;
	}

	interface BarcodeDetectorOptions {
		formats?: string[];
	}

	class BarcodeDetector {
		constructor(options?: BarcodeDetectorOptions);
		static getSupportedFormats(): Promise<string[]>;
		detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>;
	}

	interface Window {
		BarcodeDetector?: typeof BarcodeDetector;
	}
}

export {};
