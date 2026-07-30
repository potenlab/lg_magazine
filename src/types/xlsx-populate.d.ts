// xlsx-populate 는 타입 선언을 제공하지 않는다 — 엑셀 암호화에 쓰는 표면만 선언.
declare module "xlsx-populate" {
  interface XlsxWorkbook {
    outputAsync(opts?: { type?: string; password?: string }): Promise<Buffer>;
  }
  const XlsxPopulate: {
    fromDataAsync(data: Buffer | ArrayBuffer | Uint8Array): Promise<XlsxWorkbook>;
  };
  export default XlsxPopulate;
}
