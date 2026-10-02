import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

const font=readFileSync("public/emoji/noto/Noto-COLRv1.ttf");
const tables=new Map<string,{offset:number,length:number}>();
for(let i=0;i<font.readUInt16BE(4);i++) {
  const position=12+i*16;
  tables.set(font.toString("ascii",position,position+4),{offset:font.readUInt32BE(position+8),length:font.readUInt32BE(position+12)});
}
describe("original Noto artwork in a vector font",()=>{
  it("contains color vector outlines and gradients, without bitmap strikes",()=>{
    expect(tables.has("glyf")).toBe(true);expect(tables.has("CPAL")).toBe(true);
    expect(font.readUInt16BE(tables.get("COLR")!.offset)).toBe(1);
    expect(tables.has("CBDT")).toBe(false);expect(tables.has("CBLC")).toBe(false);
    expect(tables.has("GSUB")).toBe(true);
  });
  it("pins the original artwork version and includes its license",()=>{
    const name=tables.get("name")!.offset,start=name+font.readUInt16BE(name+4);
    const versions:string[]=[];
    for(let i=0;i<font.readUInt16BE(name+2);i++) {
      const record=name+6+i*12;
      if(font.readUInt16BE(record+6)!==5||font.readUInt16BE(record)!==3)continue;
      const value=Buffer.from(font.subarray(start+font.readUInt16BE(record+10),start+font.readUInt16BE(record+10)+font.readUInt16BE(record+8)));
      versions.push(value.swap16().toString("utf16le"));
    }
    expect(versions).toContain("Version 2.051;GOOG;noto-emoji:20250818:e92753bfa55fd449e427d4d325f9c8c40408c74e");
    expect(readFileSync("public/emoji/noto/LICENSE","utf8")).toMatch(/SIL OPEN FONT LICENSE Version 1.1/);
  });
});
