import { FASTElement, html } from "@lushly-dev/fast-element";
import "../icon/violet-icon";
/**
 * Violet message media.
 *
 * @summary Renders file/image/audio/video attachments. Maps to AI SDK
 *          FileUIPart and TanStack AI ImagePart/AudioPart/VideoPart.
 * @csspart root - The outer container.
 * @csspart preview - The media preview wrapper.
 * @csspart filename - The filename display.
 * @csspart icon - The file type icon.
 */
export declare class VioletMessageMedia extends FASTElement {
    src: string;
    mediaType: string;
    filename: string;
    alt: string;
    constructor();
    connectedCallback(): void;
    renderMedia(): ReturnType<typeof html>;
}