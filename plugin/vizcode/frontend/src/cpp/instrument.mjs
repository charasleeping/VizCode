/** Rewrite only Clang-identified source locations, never textual guesses about C++ syntax. */
export function instrument(source, ast) {
    const bytes = new TextEncoder().encode(source);
    const decoder = new TextDecoder();
    const edits = new Map();
    let serial = 0;
    const add = (offset, value) => { if (Number.isInteger(offset) && offset >= 0 && offset <= bytes.length) edits.set(offset, (edits.get(offset) || '') + value); };
    const line = offset => { let n = 1; for (let i = 0; i < offset; i++) if (bytes[i] === 10) n++; return n; };
    const range = node => {
        const a = node.range?.begin, b = node.range?.end;
        // Macro expansion ranges cannot safely be rewritten as ordinary source.
        if (!a || !b || a.expansionLoc || b.expansionLoc || a.includedFrom || b.includedFrom) return null;
        if (!Number.isInteger(a.offset) || !Number.isInteger(b.offset) || b.offset >= bytes.length) return null;
        return [a.offset, b.offset + b.tokLen];
    };
    const endStatement = node => {
        const r = range(node); if (!r) return null;
        let end = r[1];
        if (bytes[end] === 59) end++;
        return end;
    };
    const uninitialized = new Map();
    const collect = node => {
        if(node.kind === 'VarDecl' && !node.init && node.name && /^(?:unsigned |signed )?(?:int|long|short|char|float|double|bool)(?: |$)/.test(node.type?.qualType || '')) uninitialized.set(node.id,'__viz_init'+serial++);
        for(const child of node.inner || [])collect(child);
    };
    collect(ast);
    const register = node => {
        if (!node.name || !/^[A-Za-z_]\w*$/.test(node.name)) return '';
        if(uninitialized.has(node.id)){const flag=uninitialized.get(node.id);return `bool ${flag}=false;__viz_register_uninitialized(${JSON.stringify(node.name)},${node.name},${flag});`;}
        if(!node.init && node.kind === 'VarDecl')return '';
        return `__viz_register(${JSON.stringify(node.name)},${node.name});`;
    };
    const seenRecords = new Set();
    const seen = new Set();
    function visit(node, parent = null, inFunction = false) {
        const r = range(node);
        if (!r && node.kind !== 'TranslationUnitDecl') return;
        if (r) { const key = node.kind + ':' + r.join(':'); if (seen.has(key)) return; seen.add(key); }
        const children = node.inner || [];
        if (!inFunction && node.kind === 'CXXRecordDecl' && node.completeDefinition && node.name && !seenRecords.has(node.id)) {
            seenRecords.add(node.id);
            const fields = children.filter(child => child.kind === 'FieldDecl' && child.name);
            const pairs = fields.map(field => `+std::string(",[")+__viz_quote(${JSON.stringify(field.name)})+","+__viz_encode(__v.${field.name},__c)+"]"`).join('');
            add(r[1] - 1, ` friend std::string __viz_encode(const ${node.name}& __v,__viz_context& __c){return __viz_record(__v,__c,${JSON.stringify(node.name)},[&](){return std::string("")${pairs};});} `);
        }
        const isFunction = ['FunctionDecl', 'CXXMethodDecl', 'CXXConstructorDecl', 'CXXDestructorDecl', 'CXXConversionDecl'].includes(node.kind);
        if (isFunction) {
            const body = children.find(child => child.kind === 'CompoundStmt');
            if (!body || node.constexpr || node.isImplicit) return;
            const br = range(body); if (!br) return;
            add(br[0] + 1, `__viz_frame __viz_f${serial++}(${JSON.stringify(node.name || '<anonymous>')},${line(br[0])});` +
                children.filter(child => child.kind === 'ParmVarDecl').map(register).join(''));
            visit(body, node, true);
            return;
        }
        if (node.kind === 'CompoundStmt' && inFunction) {
            const at = r[0] + 1;
            const scope = `__viz_scope __viz_s${serial++};`;
            if (parent && ['ForStmt','CXXForRangeStmt'].includes(parent.kind)) edits.set(at, scope + (edits.get(at) || ''));
            else add(at, scope);
            for (const child of children) {
                const cr = range(child); if (!cr) continue;
                add(cr[0], `__viz_step(${line(cr[0])});`);
                if (child.kind === 'DeclStmt') {
                    const end = endStatement(child);
                    add(end, (child.inner || []).filter(v => v.kind === 'VarDecl').map(register).join(''));
                }
            }
            add(r[1] - 1, `__viz_step(${line(r[1] - 1)});`);
        }
        if (['ForStmt', 'CXXForRangeStmt', 'WhileStmt', 'DoStmt'].includes(node.kind) && inFunction) {
            const body = node.kind === 'DoStmt' ? children[0] : children.at(-1);
            const br = body && range(body);
            if (br) {
                const variables = children.filter(child => child.kind === 'DeclStmt').flatMap(child => child.inner || []).filter(v => v.kind === 'VarDecl');
                if (body.kind === 'CompoundStmt') add(br[0] + 1, variables.map(register).join(''));
                else {
                    add(br[0], `{__viz_scope __viz_s${serial++};${variables.map(register).join('')}__viz_step(${line(br[0])});`);
                    add(endStatement(body), '}');
                }
            }
        }
        if (!inFunction && node.kind === 'VarDecl' && node.name && parent && ['TranslationUnitDecl','NamespaceDecl'].includes(parent.kind) && bytes[r[1]] === 59) {
            add(r[1]+1,` inline int __viz_g${serial++}=(__viz_register(${JSON.stringify(node.name)},${node.name}),0); `);
        }
        if(node.kind === 'BinaryOperator' && node.opcode === '=' && children[0]?.kind === 'DeclRefExpr'){
            const flag=uninitialized.get(children[0].referencedDecl?.id);if(flag){add(r[0],`(${flag}=true,(`);add(r[1],'))');}
        }
        if(node.kind === 'CXXOperatorCallExpr' && children.at(-1)?.kind === 'DeclRefExpr'){
            const flag=uninitialized.get(children.at(-1).referencedDecl?.id);
            const operator=children[0]?.inner?.[0]?.referencedDecl?.name;
            if(flag && operator==='operator>>'){add(r[0],`(${flag}=true,(`);add(r[1],'))');}
        }
        if (node.kind === 'CXXNewExpr' && inFunction && !node.isArray) { add(r[0], '__viz_track('); add(r[1], ')'); }
        if (node.kind === 'CXXDeleteExpr' && inFunction && children[0]) {
            const target = range(children[0]); if (target) { add(target[0], '__viz_forget('); add(target[1], ')'); }
        }
        // Non-compound if branches need their own instruction event.
        if (node.kind === 'IfStmt' && inFunction) {
            for (const branch of children.slice(node.hasElse ? -2 : -1)) {
                const br = range(branch); if (br && branch.kind !== 'CompoundStmt') {
                    add(br[0], `{__viz_step(${line(br[0])});`); add(endStatement(branch), '}');
                }
            }
        }
        for (const child of children) visit(child, node, inFunction);
    }
    visit(ast);
    const offsets = Array.from(edits.keys()).sort((a,b) => a-b);
    let last = 0, result = '#include "vizcode-runtime.hpp"\n';
    for (const offset of offsets) { result += decoder.decode(bytes.slice(last, offset)) + edits.get(offset); last = offset; }
    return result + decoder.decode(bytes.slice(last));
}
