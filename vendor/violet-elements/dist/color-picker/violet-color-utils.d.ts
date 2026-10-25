export interface VioletRgbColor {
    r: number;
    g: number;
    b: number;
}
export interface VioletHslColor {
    h: number;
    s: number;
    l: number;
}
export declare function clamp(value: number, min: number, max: number): number;
export declare function normalizeHexColor(value: string): string | null;
export declare function rgbToHex(color: VioletRgbColor): string;
export declare function hexToRgb(value: string): VioletRgbColor | null;
export declare function rgbToHsl(color: VioletRgbColor): VioletHslColor;
export declare function hslToRgb(color: VioletHslColor): VioletRgbColor;
export declare function hexToHsl(value: string): VioletHslColor | null;
export declare function hslToHex(color: VioletHslColor): string;
export declare function hueColor(value: number): string;
export declare function saturationGradient(hue: number, lightness: number): string;
export declare function lightnessGradient(hue: number, saturation: number): string;