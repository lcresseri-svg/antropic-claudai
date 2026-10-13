import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const rows=[];
for(const file of execFileSync('rg',['--files','src'],{encoding:'utf8'}).trim().split('\n').filter(p=>p.endsWith('.tsx')&&!p.endsWith('.test.tsx'))){
 const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const visit=node=>{
  if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
   const tag=node.tagName.getText(source),attrs={};
   for(const a of node.attributes.properties)if(ts.isJsxAttribute(a))attrs[a.name.getText(source)]=a.initializer?.getText(source)??'true';
   if(['button','a','input','select','textarea','summary','Link','NavLink'].includes(tag)||Object.keys(attrs).some(k=>/^on(Click|Change|Submit|KeyDown)$/.test(k))){
    const start=node.getStart(source),line=source.getLineAndCharacterOfPosition(start).line+1;
    rows.push({file:'sunny/'+file,line,tag,attributes:attrs,source:node.getText(source),coverage:'sorgente; consultare route e suite per gli esiti runtime'});
   }
  }
  ts.forEachChild(node,visit);
 };visit(source);
}
const target=process.env.SUNNY_INVENTORY||'../docs/product/ui3-liquid-glass/evidence/controls-source.json';writeFileSync(target,JSON.stringify(rows,null,2));console.log(rows.length,'control declarations, including generated/custom controls:',target);
