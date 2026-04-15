import deckyPlugin from "@decky/rollup";
import replace from '@rollup/plugin-replace';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

export default deckyPlugin({
    plugins: [
        replace({
            preventAssignment: true,
            __PLUGIN_NAME__: JSON.stringify(pkg.name),
            __PLUGIN_VERSION__: JSON.stringify(pkg.version)
        })
    ]
});
