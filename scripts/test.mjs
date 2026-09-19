import ts from 'typescript';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
mkdirSync('.test-build',{recursive:true});
for(const [source,out] of [['lib/habitpilot/core.ts','core'],['lib/habitpilot/ai.ts','ai'],['tests/core.test.ts','core.test']]){
 const js=ts.transpileModule(readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from ['"](?:\.\.\/lib\/habitpilot\/|\.\/)(core|ai)['"]/g,(_,m)=>`from './${m}.mjs'`);
 writeFileSync(`.test-build/${out}.mjs`,js);
}
const r=spawnSync(process.execPath,['--test','.test-build/core.test.mjs'],{stdio:'inherit'});process.exit(r.status??1);
