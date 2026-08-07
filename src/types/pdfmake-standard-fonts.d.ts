/**
 * @types/pdfmake does not declare the standard-font containers that pdfmake
 * ships alongside its browser build. The contract PDF uses the base-14 Times
 * face, which is registered by passing this container to addFontContainer.
 */
declare module 'pdfmake/build/standard-fonts/Times' {
  const fontContainer: {
    vfs: Record<string, unknown>
    fonts: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>
  }
  export default fontContainer
}
