const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
module.exports = {
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
                for (const file of ['broker.html', 'broker.mjs', 'worker.mjs']) {
                    fs.copyFileSync(path.resolve(__dirname, 'src/widget', file), path.join(output, file));
                }
                fs.cpSync(path.resolve(__dirname, 'src/opt/optlite'), path.join(output, 'optlite'),
                    { recursive: true, filter: source => !source.includes('__pycache__') });
                fs.cpSync(path.resolve(__dirname, 'node_modules/pyodide'), path.join(output, 'pyodide'), { recursive: true });
            });
        }
    }]
};