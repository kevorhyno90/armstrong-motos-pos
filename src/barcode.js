/**
 * Generates a Code 128 barcode directly onto an SVG element.
 * @param {SVGElement|string} target - Selector string or SVG element to draw the barcode in.
 * @param {string} value - The text/SKU to encode.
 * @param {Object} [customOptions={}] - Optional overrides for JsBarcode configuration.
 */
export function generateBarcode(target, value, customOptions = {}) {
  if (!value) return;

  const defaultOptions = {
    format: "CODE128",
    width: 2,
    height: 50,
    displayValue: true,
    fontOptions: "",
    font: "Courier",
    textAlign: "center",
    textPosition: "bottom",
    textMargin: 4,
    fontSize: 13,
    background: "transparent",
    lineColor: "#e2e8f0", // Matches light text on dark backgrounds
    textColor: "#94a3b8",
    margin: 10,
  };

  const finalOptions = { ...defaultOptions, ...customOptions };

  try {
    if (window.JsBarcode) {
      window.JsBarcode(target, value, finalOptions);
    } else {
      console.warn("JsBarcode library not loaded yet.");
    }
  } catch (error) {
    console.error(`Failed to generate barcode for '${value}':`, error);
  }
}

/**
 * Generates an SVG string representation of a barcode (useful for offline printing/receipt templates).
 * @param {string} value - The text/SKU to encode.
 * @returns {string} SVG markup of the barcode.
 */
export function generateBarcodeSVGString(value) {
  const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  generateBarcode(tempSvg, value, {
    lineColor: "#000000", // Print barcodes in black
    textColor: "#000000",
    background: "#ffffff"
  });
  return tempSvg.outerHTML;
}
