const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const widget = {
    mode: 'production', entry: './src/widget/Widget.ts',
    output: { path: path.resolve(__dirname, '../assets'), filename: 'widget.js',
        library: { name: 'VizCode', type: 'window' }, publicPath: 'auto' },
    resolve: { extensions: ['.ts', '.js', '.css'], alias: {
        jquery: path.resolve(__dirname, 'src/opt/js/lib/jquery-3.0.0.min.js') } },
    module: { rules: [
        { test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ },
        { test: /\.css$/, use: ['style-loader', 'css-loader'] },
        { test: /\.(png|gif|jpg|svg)$/, type: 'asset/resource' }
    ] },
    plugins: [new webpack.ProvidePlugin({ $: 'jquery', jQuery: 'jquery', jquery: 'jquery' }), {
        apply(compiler) {
            compiler.hooks.afterEmit.tap('ExecutionAssets', () => {
                const output = path.resolve(__dirname, '../execution-assets');
                fs.mkdirSync(output, { recursive: true });
                for(const file of ['javascript-tracer.mjs','javascript-tracer.mjs.LICENSE.txt','cpp/package-assets.mjs','cpp/package-assets.mjs.LICENSE.txt','license-modules/package-assets.mjs.json','licenses/fflate.txt','licenses/npm/fflate-0.8.2-LICENSE'])fs.rmSync(path.join(output,file),{force:true});
                fs.cpSync(path.resolve(__dirname, '../licenses'), path.join(output, 'licenses'), { recursive: true });
                fs.copyFileSync(path.resolve(__dirname,'../THIRD_PARTY_NOTICES.md'),path.join(output,'THIRD_PARTY_NOTICES.md'));
                for (const file of ['broker.html', 'broker.mjs', 'worker.mjs']) {
                    fs.copyFileSync(path.resolve(__dirname, 'src/widget', file), path.join(output, file));
                }
                fs.cpSync(path.resolve(__dirname, 'src/cpp'), path.join(output, 'cpp'), { recursive: true });
                fs.copyFileSync(path.resolve(__dirname, 'src/cpp/memfs.wasm'), path.join(output, 'cpp/memfs'));
                fs.copyFileSync(path.resolve(__dirname, 'src/cpp/trace-runtime.hpp'), path.join(output, 'cpp/trace-runtime.hpp'));
                fs.cpSync(path.resolve(__dirname, 'src/opt/optlite'), path.join(output, 'optlite'),
                    { recursive: true, filter: source => !source.includes('__pycache__') });
                fs.cpSync(path.resolve(__dirname, 'node_modules/pyodide'), path.join(output, 'pyodide'), { recursive: true });
            });
        }
    }]
};
module.exports = [widget];

module.exports.push({mode:'production',entry:'./src/widget/functionDiscovery.ts',experiments:{outputModule:true},
 output:{path:path.resolve(__dirname,'../execution-assets'),filename:'function-discovery.mjs',library:{type:'module'}},
 resolve:{extensions:['.ts','.js']},module:{rules:[{test:/\.ts$/,use:'ts-loader',exclude:/node_modules/}]}});

// Record modules actually emitted, including loader runtimes from devDependencies.
// Paths are relative and contain no workstation identifiers or source contents.
for (const config of module.exports) {
    config.plugins ||= [];
    config.plugins.push({apply(compiler) {
        compiler.hooks.done.tap('LicenseModules', stats => {
            const packages = new Set(), files = new Set();
            const visit = modules => { for (const module of modules || []) {
                const name = module.nameForCondition || module.identifier || module.name || '';
                const match = name.match(/node_modules[\\/](?:(@[^\\/!]+)[\\/])?([^\\/!]+)/);
                if (match) packages.add('node_modules/' + (match[1] ? match[1] + '/' : '') + match[2]);
                const source = module.nameForCondition || '';
                if (source.startsWith(path.join(__dirname,'src')+path.sep)) files.add('plugin/vizcode/frontend/'+path.relative(__dirname,source).split(path.sep).join('/'));
                visit(module.modules);
            }};
            visit(stats.toJson({all:false,modules:true,nestedModules:true}).modules);
            const output = path.resolve(__dirname,'../execution-assets/license-modules');
            fs.mkdirSync(output,{recursive:true});
            fs.writeFileSync(path.join(output,config.output.filename+'.json'),JSON.stringify({packages:[...packages].sort(),files:[...files].sort()},null,2)+'\n');
        });
    }});
}
